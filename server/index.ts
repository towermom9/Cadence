import { installDebugLogger } from "./logger";

installDebugLogger();

import { CadenceBot } from "./bot";
import { applyStoredConfig, config } from "./config";
import { CadenceDatabase } from "./db";
import { createWebApp } from "./web";
import { CadenceWsHub } from "./ws";

async function main() {
  const db = new CadenceDatabase(config.dataDir);
  db.pruneExpiredSessions();
  applyStoredConfig(db.getAppConfig());

  const bot = new CadenceBot(db);
  const wsHub = new CadenceWsHub(bot, db);

  bot.setStateChangeHandler((guildId) => {
    wsHub.broadcastGuild(guildId);
  });

  bot.setToastHandler((guildId, level, message) => {
    wsHub.broadcastToast(guildId, level, message);
  });

  bot.setUserPlaylistsChangeHandler((userId) => {
    wsHub.notifyPlaylistsChanged(userId);
  });

  bot.music.setLavalinkStatusChangeHandler(() => {
    wsHub.broadcastMeta();
  });

  const app = createWebApp(bot, db, wsHub);

  const server = Bun.serve({
    hostname: config.host,
    port: config.port,
    fetch: app.fetch,
    websocket: wsHub.websocket,
  });

  console.log(`[Cadence] Server listening on http://${config.host}:${server.port}`);
  console.log(`[Cadence] Dashboard URL: ${config.dashboardUrl}`);

  if (config.needsSetup) {
    console.log(
      `[Cadence] First-time setup required - open ${config.dashboardUrl} in your browser to run the setup wizard.`
    );
  }

  // Start Discord bot concurrently inside the same process
  bot.start().catch((error) => {
    console.error("[Bot] Failed to log in to Discord:", error);
  });

  const sessionPruneTimer = setInterval(() => {
    db.pruneExpiredSessions();
  }, 60 * 60 * 1000);

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[Cadence] Received ${signal}, shutting down...`);
    clearInterval(sessionPruneTimer);
    server.stop(true);
    await bot.stop().catch(() => {});
    db.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error("[Cadence] Fatal startup error:", error);
  process.exit(1);
});
