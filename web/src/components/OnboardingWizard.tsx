import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Database,
  Disc3,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LogIn,
  Radio,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type {
  AppMetaDTO,
  SearchSource,
  SetupStatusDTO,
  TokenTestResultDTO,
} from "@shared/types";
import { CadenceIcon } from "./CadenceBrand";

interface Props {
  onComplete: () => Promise<void>;
}

type Step = 1 | 2 | 3 | 4;

const STEP_LABELS: { step: Step; title: string }[] = [
  { step: 1, title: "Welcome" },
  { step: 2, title: "Discord App" },
  { step: 3, title: "Preferences" },
  { step: 4, title: "Launch" },
];

const SEARCH_PLATFORM_OPTIONS: {
  id: SearchSource;
  name: string;
  description: string;
}[] = [
  {
    id: "ytmsearch",
    name: "YouTube Music",
    description: "Best default for clean songs & album matches.",
  },
  {
    id: "ytsearch",
    name: "YouTube",
    description: "Broadest coverage for music videos, remixes & mixes.",
  },
  {
    id: "spsearch",
    name: "Spotify",
    description: "Search Spotify catalog directly (auto-resolves audio).",
  },
  {
    id: "dzsearch",
    name: "Deezer",
    description: "Fast metadata search via Deezer + ISRC playback.",
  },
  {
    id: "scsearch",
    name: "SoundCloud",
    description: "Great for indie tracks, DJ sets & remixes.",
  },
];

const SUPPORTED_BADGES = [
  "YouTube",
  "YT Music",
  "Spotify",
  "Deezer",
  "SoundCloud",
  "LRCLIB Lyrics",
];

const OPTIONAL_ENV_SNIPPET = `# Optional: add to .env and restart Lavalink for custom API keys
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
DEEZER_ENABLED=false
DEEZER_ARL=
DEEZER_MASTER_KEY=
APPLE_MUSIC_ENABLED=false
APPLE_MUSIC_TOKEN=`;

export function OnboardingWizard({ onComplete }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [statusLoading, setStatusLoading] = useState(true);
  const [setupStatus, setSetupStatus] = useState<SetupStatusDTO | null>(null);

  const [setupToken, setSetupToken] = useState("");
  const [discordToken, setDiscordToken] = useState("");
  const [showBotToken, setShowBotToken] = useState(false);
  const [discordClientId, setDiscordClientId] = useState("");
  const [discordClientSecret, setDiscordClientSecret] = useState("");
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [dashboardUrl, setDashboardUrl] = useState(() => window.location.origin);
  const [botPrefix, setBotPrefix] = useState("?");
  const [defaultSearchSource, setDefaultSearchSource] =
    useState<SearchSource>("ytmsearch");

  const [verifyingToken, setVerifyingToken] = useState(false);
  const [tokenResult, setTokenResult] = useState<TokenTestResultDTO | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const [copiedRedirect, setCopiedRedirect] = useState(false);
  const [showOptionalEnv, setShowOptionalEnv] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [completedMeta, setCompletedMeta] = useState<AppMetaDTO | null>(null);

  const fetchSetupStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await fetch("/api/setup/status");
      if (res.ok) {
        const data = (await res.json()) as SetupStatusDTO;
        setSetupStatus(data);
        setBotPrefix((prev) => prev || data.defaults.botPrefix);
        setDefaultSearchSource(data.defaults.defaultSearchSource);
        if (!data.needsSetup) {
          await onComplete();
        }
      }
    } catch {
      // Ignore transient probe errors
    } finally {
      setStatusLoading(false);
    }
  }, [onComplete]);

  useEffect(() => {
    void fetchSetupStatus();
  }, [fetchSetupStatus]);

  const normalizedDashboardUrl =
    dashboardUrl.trim().replace(/\/+$/, "") || window.location.origin;
  const redirectUrl = `${normalizedDashboardUrl}/api/auth/callback`;

  const handleCopyRedirect = async () => {
    try {
      await navigator.clipboard.writeText(redirectUrl);
      setCopiedRedirect(true);
      setTimeout(() => setCopiedRedirect(false), 2000);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleVerifyToken = async () => {
    setTokenError(null);
    setTokenResult(null);
    setErrorMsg(null);
    if (!discordToken.trim()) {
      setTokenError("Paste your Discord Bot Token first.");
      return;
    }

    setVerifyingToken(true);
    try {
      const res = await fetch("/api/setup/test-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(setupToken.trim() ? { "x-setup-token": setupToken.trim() } : {}),
        },
        body: JSON.stringify({
          discordToken: discordToken.trim(),
          setupToken: setupToken.trim() || undefined,
        }),
      });
      const data = (await res.json()) as TokenTestResultDTO & { error?: string };
      if (!res.ok) {
        setTokenError(data.error || "Could not verify bot token.");
        return;
      }
      setTokenResult(data);
      setDiscordClientId(data.clientId);
    } catch {
      setTokenError("Network error while verifying token.");
    } finally {
      setVerifyingToken(false);
    }
  };

  const handleCompleteSetup = async () => {
    setErrorMsg(null);
    setSaving(true);
    try {
      const res = await fetch("/api/setup/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(setupToken.trim() ? { "x-setup-token": setupToken.trim() } : {}),
        },
        body: JSON.stringify({
          setupToken: setupToken.trim() || undefined,
          discordToken: discordToken.trim(),
          discordClientId: discordClientId.trim(),
          discordClientSecret: discordClientSecret.trim(),
          dashboardUrl: normalizedDashboardUrl,
          botPrefix: botPrefix.trim() || "?",
          defaultSearchSource,
        }),
      });

      const data = (await res.json()) as {
        ok?: boolean;
        meta?: AppMetaDTO;
        error?: string;
      };

      if (!res.ok || !data.ok) {
        setErrorMsg(data.error || "Failed to finish setup.");
        return;
      }

      setCompletedMeta(data.meta ?? null);
      setStep(4);
    } catch {
      setErrorMsg("Network error while launching Cadence.");
    } finally {
      setSaving(false);
    }
  };

  const canProceedFromStep1 =
    !setupStatus?.setupTokenRequired || setupToken.trim().length > 0;
  const canProceedFromStep2 =
    discordToken.trim().length > 0 &&
    /^\d{15,22}$/.test(discordClientId.trim()) &&
    discordClientSecret.trim().length > 0 &&
    /^https?:\/\/\S+$/i.test(normalizedDashboardUrl);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-y-auto bg-[#09090b] px-4 py-10">
      <div className="pointer-events-none fixed -top-44 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-violet-600/20 blur-3xl" />

      <div className="relative w-full max-w-2xl rounded-2xl border border-white/10 bg-[#111116]/95 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
        {/* Header & Step Progress */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/8 pb-5">
          <div className="flex items-center gap-3">
            <CadenceIcon className="h-10 w-10" />
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-white">
                Cadence Setup
              </h1>
              <p className="text-xs text-zinc-400">
                Guided first-time configuration — no .env editing needed
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {STEP_LABELS.map((item) => {
              const active = step === item.step;
              const done = step > item.step;
              return (
                <div
                  key={item.step}
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                    active
                      ? "bg-violet-600/25 text-violet-200 ring-1 ring-violet-500/40"
                      : done
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-white/[0.04] text-zinc-500"
                  }`}
                >
                  {done ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <span>{item.step}.</span>
                  )}
                  <span className="hidden sm:inline">{item.title}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Step 1: Welcome & System Check */}
        {step === 1 && (
          <div className="mt-6 space-y-5">
            <div>
              <h2 className="text-xl font-semibold text-white">
                Welcome to Cadence
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                Let&apos;s connect your Discord bot and web dashboard in just a couple of minutes.
              </p>
            </div>

            <div className="space-y-2.5 rounded-xl border border-white/8 bg-[#09090b]/70 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  System Check
                </span>
                <button
                  type="button"
                  onClick={() => void fetchSetupStatus()}
                  disabled={statusLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-zinc-300 transition hover:bg-white/10 disabled:opacity-50"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${statusLoading ? "animate-spin" : ""}`}
                  />
                  Refresh
                </button>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2">
                <div className="flex items-center gap-2.5 rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-2.5">
                  <Database className="h-4 w-4 shrink-0 text-emerald-400" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-white">SQLite Storage</p>
                    <p className="text-[11px] text-emerald-400">Ready (built-in)</p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-2.5">
                  <Radio
                    className={`h-4 w-4 shrink-0 ${
                      setupStatus?.lavalinkReachable
                        ? "text-emerald-400"
                        : "text-amber-400"
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-white">Lavalink Audio Engine</p>
                    <p
                      className={`truncate text-[11px] ${
                        setupStatus?.lavalinkReachable
                          ? "text-emerald-400"
                          : "text-amber-300"
                      }`}
                    >
                      {statusLoading
                        ? "Checking..."
                        : setupStatus?.lavalinkReachable
                          ? `Connected${setupStatus.lavalinkVersion ? ` (v${setupStatus.lavalinkVersion})` : ""}`
                          : `Not detected at ${setupStatus?.lavalinkHost ?? "localhost"}:${setupStatus?.lavalinkPort ?? 2333}`}
                    </p>
                  </div>
                </div>
              </div>

              {!statusLoading && setupStatus && !setupStatus.lavalinkReachable && (
                <p className="text-xs text-amber-300/90">
                  Lavalink may still be booting or not started yet. You can finish setup now and Lavalink will connect automatically once online.
                </p>
              )}
            </div>

            <div>
              <p className="text-xs font-medium text-zinc-400">
                Ready out of the box:
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {SUPPORTED_BADGES.map((label) => (
                  <span
                    key={label}
                    className="rounded-lg border border-white/8 bg-white/[0.04] px-2.5 py-1 text-xs text-zinc-200"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>

            {setupStatus?.setupTokenRequired && (
              <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-4">
                <label className="block space-y-1.5">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-violet-100">
                    <KeyRound className="h-4 w-4 text-violet-300" />
                    Setup Passcode Required
                  </span>
                  <input
                    type="password"
                    value={setupToken}
                    onChange={(e) => setSetupToken(e.target.value)}
                    placeholder="Enter SETUP_TOKEN from your environment"
                    className="w-full rounded-xl border border-white/15 bg-[#09090b] px-3.5 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-violet-400"
                  />
                </label>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                disabled={!canProceedFromStep1}
                onClick={() => {
                  setErrorMsg(null);
                  setStep(2);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-violet-600/20 transition hover:bg-violet-500 disabled:opacity-50"
              >
                Get Started
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Connect Discord Bot */}
        {step === 2 && (
          <div className="mt-6 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  Connect Discord Application
                </h2>
                <p className="mt-1 text-xs text-zinc-400">
                  Create or open an application in the Discord Developer Portal.
                </p>
              </div>
              <a
                href="https://discord.com/developers/applications"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-violet-300 transition hover:bg-white/[0.08]"
              >
                Open Developer Portal
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>

            <ol className="space-y-1.5 rounded-xl border border-white/8 bg-white/[0.02] p-3.5 text-xs text-zinc-300">
              <li>
                <strong>1. Bot Tab:</strong> Copy your <strong>Bot Token</strong> and enable{" "}
                <strong>Server Members Intent</strong> &amp; <strong>Message Content Intent</strong>.
              </li>
              <li>
                <strong>2. OAuth2 Tab:</strong> Copy your <strong>Client ID</strong> &amp;{" "}
                <strong>Client Secret</strong>.
              </li>
              <li>
                <strong>3. OAuth2 Redirects:</strong> Add the Redirect URL shown below and click{" "}
                <strong>Save Changes</strong> in Discord.
              </li>
            </ol>

            {/* Bot Token + Live Verification */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-zinc-200">
                Bot Token
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <input
                    type={showBotToken ? "text" : "password"}
                    value={discordToken}
                    onChange={(e) => {
                      setDiscordToken(e.target.value);
                      setTokenResult(null);
                      setTokenError(null);
                    }}
                    placeholder="Paste your Discord Bot Token"
                    className="w-full rounded-xl border border-white/10 bg-[#09090b] py-2.5 pl-3.5 pr-10 text-sm text-white placeholder-zinc-500 outline-none focus:border-violet-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowBotToken((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-zinc-400 hover:text-white"
                    aria-label={showBotToken ? "Hide bot token" : "Show bot token"}
                  >
                    {showBotToken ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <button
                  type="button"
                  disabled={verifyingToken || !discordToken.trim()}
                  onClick={() => void handleVerifyToken()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-500/40 bg-violet-600/20 px-4 py-2.5 text-sm font-medium text-violet-200 transition hover:bg-violet-600/30 disabled:opacity-50"
                >
                  {verifyingToken ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" />
                  )}
                  Verify Token
                </button>
              </div>

              {tokenError && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                  <span>{tokenError}</span>
                </div>
              )}

              {tokenResult && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5">
                  <div className="flex items-center gap-3">
                    {tokenResult.botAvatarUrl ? (
                      <img
                        src={tokenResult.botAvatarUrl}
                        alt={tokenResult.botUsername}
                        className="h-10 w-10 rounded-xl border border-white/15 object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300">
                        <Disc3 className="h-5 w-5" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">
                        {tokenResult.botUsername}
                      </p>
                      <p className="truncate text-xs text-emerald-200/80">
                        App: {tokenResult.appName} • ID auto-filled
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                    <span
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-medium ${
                        tokenResult.membersIntentEnabled
                          ? "bg-emerald-500/20 text-emerald-200"
                          : "bg-amber-500/20 text-amber-200"
                      }`}
                    >
                      {tokenResult.membersIntentEnabled ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <AlertCircle className="h-3.5 w-3.5" />
                      )}
                      Server Members Intent:{" "}
                      {tokenResult.membersIntentEnabled ? "Enabled" : "Missing"}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-medium ${
                        tokenResult.messageContentIntentEnabled
                          ? "bg-emerald-500/20 text-emerald-200"
                          : "bg-amber-500/20 text-amber-200"
                      }`}
                    >
                      {tokenResult.messageContentIntentEnabled ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <AlertCircle className="h-3.5 w-3.5" />
                      )}
                      Message Content Intent:{" "}
                      {tokenResult.messageContentIntentEnabled ? "Enabled" : "Missing"}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Client ID & Secret */}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-zinc-200">Client ID</span>
                <input
                  type="text"
                  value={discordClientId}
                  onChange={(e) => setDiscordClientId(e.target.value)}
                  placeholder="Application / Client ID"
                  className="w-full rounded-xl border border-white/10 bg-[#09090b] px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-violet-500"
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-medium text-zinc-200">
                  OAuth2 Client Secret
                </span>
                <div className="relative">
                  <input
                    type={showClientSecret ? "text" : "password"}
                    value={discordClientSecret}
                    onChange={(e) => setDiscordClientSecret(e.target.value)}
                    placeholder="Client Secret from OAuth2 tab"
                    className="w-full rounded-xl border border-white/10 bg-[#09090b] py-2.5 pl-3.5 pr-10 text-sm text-white placeholder-zinc-500 outline-none focus:border-violet-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowClientSecret((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-zinc-400 hover:text-white"
                    aria-label={showClientSecret ? "Hide client secret" : "Show client secret"}
                  >
                    {showClientSecret ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </label>
            </div>

            {/* Dashboard URL + Copyable Redirect URL */}
            <div className="space-y-3 rounded-xl border border-white/8 bg-[#09090b]/70 p-4">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-zinc-200">
                  Dashboard URL
                </span>
                <input
                  type="url"
                  value={dashboardUrl}
                  onChange={(e) => setDashboardUrl(e.target.value)}
                  placeholder="http://localhost:8000"
                  className="w-full rounded-xl border border-white/10 bg-[#111116] px-3.5 py-2 text-sm text-white outline-none focus:border-violet-500"
                />
              </label>

              <div>
                <span className="text-xs font-medium text-zinc-400">
                  Copy this exact URL into Discord Developer Portal → OAuth2 → Redirects:
                </span>
                <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-2">
                  <code className="flex-1 truncate font-mono text-xs text-violet-100">
                    {redirectUrl}
                  </code>
                  <button
                    type="button"
                    onClick={() => void handleCopyRedirect()}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-violet-600/30 px-2.5 py-1 text-xs font-medium text-violet-100 transition hover:bg-violet-600/50"
                  >
                    {copiedRedirect ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-300" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.08]"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <button
                type="button"
                disabled={!canProceedFromStep2}
                onClick={() => {
                  setErrorMsg(null);
                  setStep(3);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-violet-600/20 transition hover:bg-violet-500 disabled:opacity-50"
              >
                Continue
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Preferences & Launch */}
        {step === 3 && (
          <div className="mt-6 space-y-5">
            <div>
              <h2 className="text-xl font-semibold text-white">
                Bot &amp; Music Preferences
              </h2>
              <p className="mt-1 text-xs text-zinc-400">
                Set your defaults — you can change server-specific preferences anytime in Settings.
              </p>
            </div>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-zinc-200">
                Default Text Command Prefix
              </span>
              <input
                type="text"
                maxLength={5}
                value={botPrefix}
                onChange={(e) => setBotPrefix(e.target.value)}
                placeholder="?"
                className="w-full max-w-44 rounded-xl border border-white/10 bg-[#09090b] px-3.5 py-2 text-sm text-white outline-none focus:border-violet-500"
              />
              <p className="text-xs text-zinc-500">
                Slash commands (<code className="font-mono">/play</code>) always work alongside prefix commands (<code className="font-mono">{botPrefix || "?"}play</code>).
              </p>
            </label>

            <div className="space-y-2">
              <span className="text-sm font-medium text-zinc-200">
                Default Search Platform
              </span>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {SEARCH_PLATFORM_OPTIONS.map((option) => {
                  const selected = defaultSearchSource === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setDefaultSearchSource(option.id)}
                      className={`rounded-xl border p-3.5 text-left transition ${
                        selected
                          ? "border-violet-500/50 bg-violet-600/20 ring-1 ring-violet-500/30"
                          : "border-white/8 bg-[#14141b] hover:border-white/15"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-white">
                          {option.name}
                        </span>
                        {selected && (
                          <CheckCircle2 className="h-4 w-4 text-violet-300" />
                        )}
                      </div>
                      <p className="mt-1 text-xs text-zinc-400">
                        {option.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4 text-xs text-zinc-300">
              <div className="flex items-start gap-2.5">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <p className="leading-relaxed">
                  <strong>YouTube, YT Music, Spotify</strong> (via <code className="font-mono">spotify-tokener</code>),{" "}
                  <strong>SoundCloud</strong>, and <strong>LRCLIB lyrics</strong> work automatically with no extra API keys.
                  Direct <strong>Deezer</strong> streams require <code className="font-mono">DEEZER_ENABLED=true</code> +{" "}
                  <code className="font-mono">DEEZER_MASTER_KEY</code> in <code className="font-mono">.env</code>.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowOptionalEnv((v) => !v)}
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-violet-300 hover:text-violet-200"
              >
                {showOptionalEnv ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
                Optional custom Spotify / Deezer / Apple Music keys
              </button>

              {showOptionalEnv && (
                <pre className="mt-2.5 overflow-x-auto rounded-lg border border-white/8 bg-[#09090b] p-3 font-mono text-[11px] text-zinc-300">
                  {OPTIONAL_ENV_SNIPPET}
                </pre>
              )}
            </div>

            {errorMsg && (
              <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.08] disabled:opacity-50"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleCompleteSetup()}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-violet-600/25 transition hover:bg-violet-500 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Connecting to Discord...
                  </>
                ) : (
                  <>
                    <Rocket className="h-4 w-4" />
                    Save &amp; Launch Cadence
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Ready to Play */}
        {step === 4 && (
          <div className="mt-6 space-y-6 text-center">
            <div className="mx-auto flex flex-col items-center">
              {completedMeta?.botAvatarUrl ? (
                <img
                  src={completedMeta.botAvatarUrl}
                  alt={completedMeta.botName}
                  className="h-20 w-20 rounded-2xl border border-white/15 object-cover shadow-xl"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30">
                  <CheckCircle2 className="h-10 w-10" />
                </div>
              )}

              <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                {completedMeta?.botName || "Cadence"} is Online
              </span>

              <h2 className="mt-3 text-2xl font-semibold text-white">
                Setup Complete!
              </h2>
              <p className="mt-1.5 max-w-md text-sm text-zinc-400">
                Your Discord bot is connected and saved. Invite it to your Discord server, then sign in with Discord to open your live music deck.
              </p>
            </div>

            <div className="mx-auto flex max-w-sm flex-col gap-2.5">
              {completedMeta?.inviteUrl && (
                <a
                  href={completedMeta.inviteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.05] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/[0.1]"
                >
                  <ExternalLink className="h-4 w-4" />
                  Invite Bot to Discord Server
                </a>
              )}

              <a
                href="/api/auth/login"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-violet-600/25 transition hover:bg-violet-500"
              >
                <LogIn className="h-4 w-4" />
                Sign in with Discord &amp; Open Dashboard
              </a>

              <button
                type="button"
                onClick={() => void onComplete()}
                className="mt-1 text-xs text-zinc-400 transition hover:text-zinc-200"
              >
                Continue to login screen
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
