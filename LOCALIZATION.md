# Localization & Internationalization Guide

Cadence uses standard **Internationalization** (language-agnostic architecture in code) and **Localization** (translated message catalogs per region and language) across the web dashboard and shared types.

---

## Standards Used

1. **BCP 47 Language Tags (`RFC 5646`)**:
   - All supported locales use canonical BCP 47 primary subtags (`en`, `es`, `ja`, `id`, `de`, `fr`) plus `"auto"` for automatic browser detection.
   - The active resolved locale is applied directly to `<html lang="...">` via `I18nProvider` (`web/src/i18n.tsx`) so assistive technologies, hyphenation rules, and typography match the chosen language.
2. **Automatic Browser Detection (`navigator.language`)**:
   - When the user selects **System Default (Auto)**, Cadence extracts the primary subtag from `navigator.language` (for example `ja-JP` -> `ja`, `es-MX` -> `es`) and falls back safely to English (`en`) for unsupported tags.
3. **ICU-Style Named Placeholders (`{placeholder}`)**:
   - Dynamic variables inside translated strings use named `{key}` tokens rather than positional `%s` or string concatenation, allowing translators to reorder words freely to fit target grammar.

---

## Supported Languages

| Tag | Language | Native Label | Status |
|-----|----------|--------------|--------|
| `en` | English | English | Primary source catalog |
| `es` | Spanish | Espanol | Complete |
| `ja` | Japanese | 日本語 | Complete |
| `id` | Indonesian | Bahasa Indonesia | Complete |
| `de` | German | Deutsch | Complete |
| `fr` | French | Francais | Complete |

---

## File Layout

- `shared/types.ts` - `SupportedLocale` union type and `UserPreferencesDTO.locale` field persisted per user in SQLite and browser cookies.
- `shared/i18n/index.ts` - `SUPPORTED_LOCALES`, `VALID_LOCALES`, `resolveLocale()`, and `t(locale, key, params)`.
- `shared/i18n/locales/*.ts` - One TypeScript catalog module per supported language, strictly typed against `I18nKey` (`keyof typeof en`).
- `web/src/i18n.tsx` - React context (`<I18nProvider>`) and `useI18n()` hook.
- `tests/i18n.test.ts` - Automated key-parity, non-empty string, zero em-dash, and BCP 47 fallback verification.

---

## Adding a New Language

1. Add the language's BCP 47 code to `SupportedLocale` in `shared/types.ts`.
2. Copy `shared/i18n/locales/en.ts` to `shared/i18n/locales/<tag>.ts` and translate every string value cleanly without changing any keys or `{placeholder}` names.
3. Keep labels concise so cards, navigation items, and tabs remain clean at up to `130%` text scaling, and avoid literal em-dashes (`\u2014`) in copy (use `-`).
4. Register the new locale in `SUPPORTED_LOCALES`, `VALID_LOCALES`, `CATALOGS`, and `resolveLocale()` inside `shared/i18n/index.ts`.
5. Update `tests/i18n.test.ts` to assert full key parity for the new catalog, then run:
   ```bash
   bun run verify
   ```
