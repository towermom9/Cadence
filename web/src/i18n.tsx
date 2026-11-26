import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import type { SupportedLocale } from "@shared/types";
import { resolveLocale, t as translate, type I18nKey, type ResolvedLocale } from "@shared/i18n";

interface I18nContextValue {
  locale: ResolvedLocale;
  t: (key: I18nKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: "en",
  t: (key, params) => translate("en", key, params),
});

export function I18nProvider({
  locale: prefLocale,
  children,
}: {
  locale?: SupportedLocale;
  children: ReactNode;
}) {
  const browserLang = typeof navigator !== "undefined" ? navigator.language : "en";
  const resolved = useMemo(
    () => resolveLocale(prefLocale, browserLang),
    [prefLocale, browserLang]
  );

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = resolved;
    }
  }, [resolved]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale: resolved,
      t: (key, params) => translate(resolved, key, params),
    }),
    [resolved]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
