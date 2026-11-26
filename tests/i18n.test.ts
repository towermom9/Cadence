import { describe, expect, test } from "bun:test";
import { SUPPORTED_LOCALES, VALID_LOCALES, resolveLocale, t } from "../shared/i18n";
import { de } from "../shared/i18n/locales/de";
import { en } from "../shared/i18n/locales/en";
import { es } from "../shared/i18n/locales/es";
import { fr } from "../shared/i18n/locales/fr";
import { id } from "../shared/i18n/locales/id";
import { ja } from "../shared/i18n/locales/ja";

describe("shared/i18n", () => {
  test("all supported locale catalogs have complete key parity with English", () => {
    const enKeys = Object.keys(en).sort();
    const catalogs = { es, ja, id, de, fr };

    for (const [localeCode, catalog] of Object.entries(catalogs)) {
      expect(VALID_LOCALES.has(localeCode as keyof typeof catalogs)).toBe(true);
      expect(Object.keys(catalog).sort()).toEqual(enKeys);
      for (const value of Object.values(catalog)) {
        expect(value.trim().length).toBeGreaterThan(0);
        expect(value.includes("\u2014")).toBe(false);
      }
    }

    expect(SUPPORTED_LOCALES.map((l) => l.id)).toContain("auto");
    expect(SUPPORTED_LOCALES.map((l) => l.id)).toContain("ja");
  });

  test("resolveLocale handles explicit and BCP 47 regional tags with fallback", () => {
    expect(resolveLocale("fr", "en-US")).toBe("fr");
    expect(resolveLocale("auto", "es-MX")).toBe("es");
    expect(resolveLocale("auto", "ja-JP")).toBe("ja");
    expect(resolveLocale("auto", "id-ID")).toBe("id");
    expect(resolveLocale("auto", "de-DE")).toBe("de");
    expect(resolveLocale("auto", "pt-BR")).toBe("en");
    expect(resolveLocale(undefined, undefined)).toBe("en");
  });

  test("t() translates known keys cleanly per locale", () => {
    expect(t("en", "nav.home")).toBe("Home");
    expect(t("es", "nav.home")).toBe("Inicio");
    expect(t("ja", "nav.home")).toBe("ホーム");
    expect(t("id", "settings.tab.accessibility")).toBe("Aksesibilitas");
  });
});
