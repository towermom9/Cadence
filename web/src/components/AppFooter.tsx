import type { AppMetaDTO } from "@shared/types";
import { useI18n } from "../i18n";
import type { MainView } from "./Sidebar";

interface Props {
  meta: AppMetaDTO | null;
  onNavigate: (view: MainView) => void;
  onOpenShortcuts: () => void;
  onOpenPlayer: () => void;
}

export function AppFooter({
  meta,
  onNavigate,
  onOpenShortcuts,
  onOpenPlayer,
}: Props) {
  const { t } = useI18n();
  const version = meta?.appVersion || __CADENCE_VERSION__;

  return (
    <footer className="mt-auto pt-12">
      <div className="border-t border-white/10 pt-6 pb-8 text-xs text-zinc-400">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <button
              type="button"
              onClick={() => onNavigate("home")}
              className="transition hover:text-white"
            >
              {t("nav.home")}
            </button>
            <button
              type="button"
              onClick={() => onNavigate("explore")}
              className="transition hover:text-white"
            >
              {t("nav.explore")}
            </button>
            <button
              type="button"
              onClick={() => onNavigate("library")}
              className="transition hover:text-white"
            >
              {t("nav.library")}
            </button>
            <button
              type="button"
              onClick={() => onNavigate("settings")}
              className="transition hover:text-white"
            >
              {t("nav.settings")}
            </button>
            <button
              type="button"
              onClick={onOpenPlayer}
              className="transition hover:text-white"
            >
              {t("nav.nowPlaying")}
            </button>
            <button
              type="button"
              onClick={onOpenShortcuts}
              className="inline-flex items-center gap-1.5 transition hover:text-white"
            >
              <span>{t("nav.shortcuts")}</span>
              <kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
                ?
              </kbd>
            </button>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-zinc-500">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                meta?.lavalinkConnected ? "bg-emerald-400" : "bg-zinc-600"
              }`}
            />
            <span>
              {meta?.lavalinkConnected
                ? `Audio online${meta.lavalinkVersion ? ` • Lavalink ${meta.lavalinkVersion}` : ""}`
                : "Audio offline"}
            </span>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-4 text-[11px] text-zinc-500">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>Cadence Music Controller</span>
            <span aria-hidden="true" className="text-zinc-700">
              •
            </span>
            <a
              href="https://github.com/towermom9/Cadence"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-400 transition hover:text-white"
            >
              GitHub
            </a>
            <span aria-hidden="true" className="text-zinc-700">
              •
            </span>
            <a
              href="https://towermom9.github.io/Cadence/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-400 transition hover:text-white"
            >
              Docs
            </a>
            <span aria-hidden="true" className="text-zinc-700">
              •
            </span>
            <a
              href="https://towermom9.github.io/Cadence/docs/guides/getting-started/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-400 transition hover:text-white"
            >
              Guides
            </a>
          </div>
          <span className="font-mono">Cadence v{version}</span>
        </div>
      </div>
    </footer>
  );
}
