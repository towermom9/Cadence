import { useState } from "react";
import { Check, Copy, ExternalLink, LogIn, Radio, ShieldAlert } from "lucide-react";
import type { AppMetaDTO } from "@shared/types";
import { CadenceBanner, CadenceIcon } from "./CadenceBrand";

interface Props {
  meta: AppMetaDTO | null;
  errorCode: string | null;
}

const ERROR_MESSAGES: Record<string, string> = {
  oauth_state: "Login session verification expired. Please try signing in again.",
  oauth_unconfigured: "Discord OAuth2 credentials are not set yet.",
  oauth_token:
    "Could not complete Discord OAuth2 token exchange. Check your redirect URL in Discord Developer Portal.",
  oauth_failed: "Unexpected error during Discord login.",
};

export function LoginView({ meta, errorCode }: Props) {
  const [copiedRedirect, setCopiedRedirect] = useState(false);
  const oauthConfigured = meta?.oauthConfigured ?? true;
  const errorText = errorCode ? ERROR_MESSAGES[errorCode] || "Login failed." : null;

  const handleCopyRedirect = async () => {
    if (!meta?.redirectUri) return;
    try {
      await navigator.clipboard.writeText(meta.redirectUri);
      setCopiedRedirect(true);
      setTimeout(() => setCopiedRedirect(false), 2000);
    } catch {
      // Ignore clipboard failures
    }
  };

  return (
    <div className="ytm-ambient relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#121212]/95 p-8 shadow-2xl backdrop-blur-xl">
        <div className="space-y-2">
          <CadenceBanner className="h-8" />
          <div className="flex items-center gap-2.5 pt-1">
            {meta?.botAvatarUrl ? (
              <img
                src={meta.botAvatarUrl}
                alt={meta.botName}
                className="h-6 w-6 rounded-full border border-white/15 object-cover"
              />
            ) : (
              <CadenceIcon className="h-6 w-6" />
            )}
            <p className="text-xs text-zinc-400">
              {meta?.botName ? `${meta.botName} • ` : ""}Unified Discord Music Deck
            </p>
          </div>
        </div>

        <p className="mt-6 text-sm leading-relaxed text-zinc-300">
          Stream from YouTube, YouTube Music, Spotify, Deezer, and SoundCloud directly into your
          Discord voice channels with real-time queue control, playlists, lyrics, and audio effects.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-2.5 text-xs">
          <div className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2">
            <span
              className={`h-2 w-2 rounded-full ${
                meta?.botReady ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-amber-400"
              }`}
            />
            <span className="truncate text-zinc-300">
              Bot: {meta?.botReady ? "Online" : "Waiting token"}
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2">
            <Radio
              className={`h-3.5 w-3.5 shrink-0 ${
                meta?.lavalinkConnected ? "text-emerald-400" : "text-zinc-500"
              }`}
            />
            <span className="truncate text-zinc-300">
              Audio:{" "}
              {meta?.lavalinkConnected
                ? meta.lavalinkVersion
                  ? `Online (v${meta.lavalinkVersion})`
                  : "Online"
                : "Offline"}
            </span>
          </div>
        </div>

        {errorText && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
            <span>{errorText}</span>
          </div>
        )}

        {!oauthConfigured && (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            Set <code className="font-mono">DISCORD_TOKEN</code>,{" "}
            <code className="font-mono">DISCORD_CLIENT_ID</code>, and{" "}
            <code className="font-mono">DISCORD_CLIENT_SECRET</code> in{" "}
            <code className="font-mono">.env</code> to enable login.
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2.5">
          <a
            href="/api/auth/login"
            style={{
              backgroundColor: "var(--cadence-accent)",
              color: "var(--cadence-accent-fg)",
            }}
            className="inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold shadow-lg transition hover:brightness-110"
          >
            <LogIn className="h-4 w-4" />
            Continue with Discord
          </a>

          {meta?.inviteUrl && (
            <a
              href={meta.inviteUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.08]"
            >
              <ExternalLink className="h-4 w-4" />
              Invite Bot to Server
            </a>
          )}
        </div>

        {meta?.redirectUri && (
          <div className="mt-5 rounded-xl border border-white/8 bg-[#0b0b0b]/80 p-3 text-[11px] text-zinc-400">
            <p>
              If Discord says <span className="text-zinc-200">Invalid OAuth2 redirect_uri</span>,
              ensure this exact URL is saved under{" "}
              <strong className="text-zinc-200">Discord Developer Portal → OAuth2 → Redirects</strong>:
            </p>
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-white/8 bg-[#121212] px-2.5 py-1.5">
              <code className="flex-1 truncate font-mono text-[11px] text-zinc-200">
                {meta.redirectUri}
              </code>
              <button
                type="button"
                onClick={() => void handleCopyRedirect()}
                className="inline-flex shrink-0 items-center gap-1 rounded-md bg-white/8 px-2 py-0.5 text-[10px] font-medium text-zinc-200 transition hover:bg-white/15"
              >
                {copiedRedirect ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-300" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
