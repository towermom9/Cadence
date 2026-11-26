import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PermissionsBitField } from "discord.js";

const tempDir = mkdtempSync(join(tmpdir(), "cadence-bot-test-"));
process.env.DATA_DIR = tempDir;

const { CadenceDatabase } = await import("../server/db");
const { CadenceBot, formatDuration } = await import("../server/bot");

function makeMockMember(opts: {
  id: string;
  roleIds?: string[];
  admin?: boolean;
  manageGuild?: boolean;
}) {
  const roleSet = new Set(opts.roleIds ?? []);
  const perms: bigint[] = [];
  if (opts.admin) perms.push(PermissionsBitField.Flags.Administrator);
  if (opts.manageGuild) perms.push(PermissionsBitField.Flags.ManageGuild);

  return {
    id: opts.id,
    permissions: new PermissionsBitField(perms),
    roles: {
      cache: {
        has: (roleId: string) => roleSet.has(roleId),
      },
    },
  };
}

describe("server/bot slash commands & 4-tier RBAC", () => {
  const db = new CadenceDatabase(tempDir);
  const bot = new CadenceBot(db, () => {}, () => {});

  afterAll(async () => {
    await bot.stop();
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("builds all expected slash commands with valid schemas", () => {
    const definitions = CadenceBot.buildSlashCommandDefinitions().map((b) => b.toJSON());
    const names = definitions.map((d) => d.name);

    expect(new Set(names).size).toBe(definitions.length);
    expect(definitions.length).toBe(37);
    expect(names).toContain("play");
    expect(names).toContain("playnow");
    expect(names).toContain("playnext");
    expect(names).toContain("settings");
    expect(names).toContain("volume");

    const settingsCmd = definitions.find((d) => d.name === "settings");
    const subNames = (settingsCmd?.options ?? []).map((o) => o.name);
    expect(subNames).toContain("view");
    expect(subNames).toContain("emptyvc");
    expect(subNames).toContain("playnext");
    expect(subNames).toContain("maxhistory");
  });

  test("formats durations cleanly for Discord embeds", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(185_000)).toBe("3:05");
    expect(formatDuration(3_723_000)).toBe("1:02:03");
  });

  test("resolves 4-tier guild RBAC across mocked Discord members and roles", () => {
    const guildId = "mock-guild-1";
    db.updateGuildSettings(guildId, {
      accessRoleIds: ["role-member"],
      djRoleId: "role-dj",
      adminRoleIds: ["role-admin"],
    });

    const memberMap = new Map([
      ["user-none", makeMockMember({ id: "user-none" })],
      ["user-tier1", makeMockMember({ id: "user-tier1", roleIds: ["role-member"] })],
      ["user-dj", makeMockMember({ id: "user-dj", roleIds: ["role-dj"] })],
      ["user-admin", makeMockMember({ id: "user-admin", roleIds: ["role-admin"] })],
      ["user-manage", makeMockMember({ id: "user-manage", manageGuild: true })],
      ["user-owner", makeMockMember({ id: "user-owner" })],
      ["user-bot-owner", makeMockMember({ id: "user-bot-owner" })],
    ]);

    const mockGuild = {
      id: guildId,
      ownerId: "user-owner",
      members: {
        cache: {
          get: (id: string) => memberMap.get(id),
        },
      },
    };

    const internal = bot as unknown as {
      botOwnerIds: Set<string>;
      client: { guilds: { cache: { get: (id: string) => typeof mockGuild | undefined; values: () => IterableIterator<typeof mockGuild> } } };
    };
    internal.botOwnerIds.add("user-bot-owner");
    internal.client.guilds.cache.get = (id: string) => (id === guildId ? mockGuild : undefined);

    expect(bot.getUserAccessTier(guildId, "user-bot-owner")).toBe("bot_owner");
    expect(bot.getUserAccessTier(guildId, "user-owner")).toBe("server_owner");
    expect(bot.isGuildOwner(guildId, "user-owner")).toBe(true);
    expect(bot.getUserAccessTier(guildId, "user-admin")).toBe("admin");
    expect(bot.getUserAccessTier(guildId, "user-manage")).toBe("admin");
    expect(bot.getUserAccessTier(guildId, "user-dj")).toBe("dj");
    expect(bot.getUserAccessTier(guildId, "user-tier1")).toBe("user");
    expect(bot.getUserAccessTier(guildId, "user-none")).toBe("none");

    expect(bot.hasGuildAccess(guildId, "user-none")).toBe(false);
    expect(bot.hasGuildAccess(guildId, "user-dj")).toBe(true);
    expect(bot.isGuildAdmin(guildId, "user-dj")).toBe(false);
    expect(bot.isGuildAdmin(guildId, "user-admin")).toBe(true);
  });
});
