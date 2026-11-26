import type { SupportedLocale } from "../types";
import { de } from "./locales/de";
import { en, type I18nKey } from "./locales/en";
import { es } from "./locales/es";
import { fr } from "./locales/fr";
import { id } from "./locales/id";
import { ja } from "./locales/ja";

export type ResolvedLocale = Exclude<SupportedLocale, "auto">;

export const SUPPORTED_LOCALES: {
  id: SupportedLocale;
  label: string;
  nativeLabel: string;
}[] = [
  { id: "auto", label: "System Default (Auto)", nativeLabel: "Auto" },
  { id: "en", label: "English", nativeLabel: "English" },
  { id: "es", label: "Spanish", nativeLabel: "Espanol" },
  { id: "ja", label: "Japanese", nativeLabel: "日本語" },
  { id: "id", label: "Indonesian", nativeLabel: "Bahasa Indonesia" },
  { id: "de", label: "German", nativeLabel: "Deutsch" },
  { id: "fr", label: "French", nativeLabel: "Francais" },
];

export const VALID_LOCALES = new Set<SupportedLocale>([
  "auto",
  "en",
  "es",
  "ja",
  "id",
  "de",
  "fr",
]);

const CATALOGS: Record<ResolvedLocale, Record<I18nKey, string>> = {
  en,
  es,
  ja,
  id,
  de,
  fr,
};

export function resolveLocale(
  pref?: SupportedLocale | null,
  browserLang?: string | null
): ResolvedLocale {
  if (pref && pref !== "auto" && pref in CATALOGS) {
    return pref as ResolvedLocale;
  }
  const primary = (browserLang || "").trim().toLowerCase().split(/[-_]/)[0];
  if (primary === "es" || primary === "ja" || primary === "id" || primary === "de" || primary === "fr") {
    return primary;
  }
  return "en";
}

export function t(
  locale: ResolvedLocale,
  key: I18nKey,
  params?: Record<string, string | number>
): string {
  const template = CATALOGS[locale]?.[key] ?? en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_match, k: string) =>
    k in params ? String(params[k]) : `{${k}}`
  );
}

export type { I18nKey };
