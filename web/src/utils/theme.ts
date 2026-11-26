import type {
  BackgroundMode,
  SearchSource,
  SupportedLocale,
  ThemeAccentId,
  UserPreferencesDTO,
} from "@shared/types";

export interface ThemeAccentOption {
  id: ThemeAccentId;
  name: string;
  hex: string;
  fg: string;
  rgb: string;
}

export const THEME_ACCENTS: ThemeAccentOption[] = [
  { id: "red", name: "Crimson Red", hex: "#ff0033", fg: "#ffffff", rgb: "255, 0, 51" },
  { id: "rose", name: "Rose Pink", hex: "#f43f5e", fg: "#ffffff", rgb: "244, 63, 94" },
  { id: "violet", name: "Violet", hex: "#8b5cf6", fg: "#ffffff", rgb: "139, 92, 246" },
  { id: "indigo", name: "Indigo", hex: "#6366f1", fg: "#ffffff", rgb: "99, 102, 241" },
  { id: "blue", name: "Sky Blue", hex: "#3ea6ff", fg: "#000000", rgb: "62, 166, 255" },
  { id: "cyan", name: "Cyan", hex: "#06b6d4", fg: "#000000", rgb: "6, 182, 212" },
  { id: "emerald", name: "Emerald", hex: "#10b981", fg: "#000000", rgb: "16, 185, 129" },
  { id: "amber", name: "Amber Gold", hex: "#f59e0b", fg: "#000000", rgb: "245, 158, 11" },
  { id: "monochrome", name: "Monochrome", hex: "#ffffff", fg: "#000000", rgb: "255, 255, 255" },
];

export const BACKGROUND_MODES: {
  id: BackgroundMode;
  name: string;
  description: string;
  swatch: string;
}[] = [
  {
    id: "amoled",
    name: "AMOLED Black",
    description: "True #000000 surfaces across all menus, bars & drawers.",
    swatch: "#000000",
  },
  {
    id: "dark",
    name: "YouTube Dark",
    description: "Classic deep charcoal canvas with layered cards.",
    swatch: "#030303",
  },
  {
    id: "elevated",
    name: "Soft Slate",
    description: "Slightly lifted slate surfaces for softer contrast.",
    swatch: "#121218",
  },
];

export const DEFAULT_PREFERENCES: UserPreferencesDTO = {
  playlistSort: "recent_activity",
  themeAccent: "red",
  backgroundMode: "dark",
  ambienceMode: true,
  artworkSeekButtons: true,
  artworkSeekSeconds: 10,
  lyricsAutoScroll: true,
  autoplayClickBehavior: "play_now_here",
  defaultSearchSource: "ytmsearch",
  pauseOnEmpty: true,
  pauseOnEmptySeconds: 0,
  customAccentHex: null,
  customBgHex: null,
  customSurfaceHex: null,
  highContrast: false,
  reducedMotion: false,
  textScale: 100,
  enhancedFocusRings: false,
  largerTouchTargets: false,
  screenReaderAnnouncements: true,
  locale: "auto",
};

const STORAGE_KEY = "cadence:prefs";
const PREFS_COOKIE_KEY = "cadence_prefs";
const UI_STORAGE_KEY = "cadence:ui";
const UI_COOKIE_KEY = "cadence_ui";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const VALID_THEME_SET = new Set<ThemeAccentId>(THEME_ACCENTS.map((a) => a.id));
const VALID_BG_SET = new Set<BackgroundMode>(["amoled", "dark", "elevated"]);
const VALID_LOCALES = new Set<SupportedLocale>(["auto", "en", "es", "ja", "id", "de", "fr"]);
const VALID_SEARCH_SOURCES = new Set<SearchSource>([
  "auto",
  "ytsearch",
  "ytmsearch",
  "spsearch",
  "dzsearch",
  "scsearch",
]);

export function normalizeHexColor(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  const shortMatch = /^#([0-9a-f]{3})$/i.exec(trimmed);
  if (shortMatch) {
    const [r, g, b] = shortMatch[1].toLowerCase().split("");
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  const fullMatch = /^#([0-9a-f]{6})$/i.exec(trimmed);
  if (fullMatch) {
    return `#${fullMatch[1].toLowerCase()}`;
  }
  return null;
}

export function hexToRgbTuple(hex: string): [number, number, number] {
  const clean = normalizeHexColor(hex) ?? "#ff0033";
  return [
    Number.parseInt(clean.slice(1, 3), 16),
    Number.parseInt(clean.slice(3, 5), 16),
    Number.parseInt(clean.slice(5, 7), 16),
  ];
}

export function hexToRgbString(hex: string): string {
  const [r, g, b] = hexToRgbTuple(hex);
  return `${r}, ${g}, ${b}`;
}

export function getRelativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgbTuple(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function getContrastRatio(hexA: string, hexB: string): number {
  const lumA = getRelativeLuminance(hexA);
  const lumB = getRelativeLuminance(hexB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
}

export function pickContrastingFg(bgHex: string): "#000000" | "#ffffff" {
  return getRelativeLuminance(bgHex) > 0.36 ? "#000000" : "#ffffff";
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  const parts = document.cookie.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      const raw = trimmed.slice(prefix.length);
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return null;
}

function writeCookie(name: string, value: string): void {
  if (typeof document === "undefined") return;
  const secureAttr =
    typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secureAttr}`;
}

export function sanitizePreferences(
  raw: Partial<UserPreferencesDTO> | null | undefined
): UserPreferencesDTO {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_PREFERENCES };
  }
  const seekSecs =
    typeof raw.artworkSeekSeconds === "number" && Number.isFinite(raw.artworkSeekSeconds)
      ? Math.max(5, Math.min(30, Math.round(raw.artworkSeekSeconds)))
      : DEFAULT_PREFERENCES.artworkSeekSeconds;
  const emptyPauseSecs =
    typeof raw.pauseOnEmptySeconds === "number" && Number.isFinite(raw.pauseOnEmptySeconds)
      ? Math.max(0, Math.min(300, Math.round(raw.pauseOnEmptySeconds)))
      : DEFAULT_PREFERENCES.pauseOnEmptySeconds;
  const textScale =
    typeof raw.textScale === "number" && Number.isFinite(raw.textScale)
      ? Math.max(90, Math.min(130, Math.round(raw.textScale)))
      : 100;
  return {
    playlistSort: raw.playlistSort ?? DEFAULT_PREFERENCES.playlistSort,
    themeAccent:
      raw.themeAccent && VALID_THEME_SET.has(raw.themeAccent)
        ? raw.themeAccent
        : DEFAULT_PREFERENCES.themeAccent,
    backgroundMode:
      raw.backgroundMode && VALID_BG_SET.has(raw.backgroundMode)
        ? raw.backgroundMode
        : DEFAULT_PREFERENCES.backgroundMode,
    ambienceMode:
      typeof raw.ambienceMode === "boolean"
        ? raw.ambienceMode
        : DEFAULT_PREFERENCES.ambienceMode,
    artworkSeekButtons:
      typeof raw.artworkSeekButtons === "boolean"
        ? raw.artworkSeekButtons
        : DEFAULT_PREFERENCES.artworkSeekButtons,
    artworkSeekSeconds: seekSecs,
    lyricsAutoScroll:
      typeof raw.lyricsAutoScroll === "boolean"
        ? raw.lyricsAutoScroll
        : DEFAULT_PREFERENCES.lyricsAutoScroll,
    autoplayClickBehavior:
      raw.autoplayClickBehavior ?? DEFAULT_PREFERENCES.autoplayClickBehavior,
    defaultSearchSource:
      raw.defaultSearchSource && VALID_SEARCH_SOURCES.has(raw.defaultSearchSource)
        ? raw.defaultSearchSource
        : DEFAULT_PREFERENCES.defaultSearchSource,
    pauseOnEmpty:
      typeof raw.pauseOnEmpty === "boolean"
        ? raw.pauseOnEmpty
        : DEFAULT_PREFERENCES.pauseOnEmpty,
    pauseOnEmptySeconds: emptyPauseSecs,
    customAccentHex: normalizeHexColor(raw.customAccentHex),
    customBgHex: normalizeHexColor(raw.customBgHex),
    customSurfaceHex: normalizeHexColor(raw.customSurfaceHex),
    highContrast: Boolean(raw.highContrast),
    reducedMotion: Boolean(raw.reducedMotion),
    textScale,
    enhancedFocusRings: Boolean(raw.enhancedFocusRings),
    largerTouchTargets: Boolean(raw.largerTouchTargets),
    screenReaderAnnouncements:
      typeof raw.screenReaderAnnouncements === "boolean" ? raw.screenReaderAnnouncements : true,
    locale: raw.locale && VALID_LOCALES.has(raw.locale) ? raw.locale : "auto",
  };
}

export function loadCachedPreferences(): UserPreferencesDTO {
  if (typeof window === "undefined") return { ...DEFAULT_PREFERENCES };
  try {
    const cookieRaw = readCookie(PREFS_COOKIE_KEY);
    if (cookieRaw) {
      return sanitizePreferences(JSON.parse(cookieRaw) as Partial<UserPreferencesDTO>);
    }
  } catch {
    // Fall back to localStorage below
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    return sanitizePreferences(JSON.parse(raw) as Partial<UserPreferencesDTO>);
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function saveCachedPreferences(prefs: UserPreferencesDTO): void {
  if (typeof window === "undefined") return;
  const clean = sanitizePreferences(prefs);
  const serialized = JSON.stringify(clean);
  try {
    writeCookie(PREFS_COOKIE_KEY, serialized);
  } catch {
    // Ignore cookie errors
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, serialized);
  } catch {
    // Ignore localStorage quota or private mode issues
  }
}

export interface UiPrefs {
  selectedGuildId: string | null;
  searchSource: SearchSource;
}

export function loadUiPrefs(): UiPrefs {
  const defaults: UiPrefs = { selectedGuildId: null, searchSource: "auto" };
  if (typeof window === "undefined") return defaults;
  let parsed: Partial<UiPrefs> | null = null;
  try {
    const cookieRaw = readCookie(UI_COOKIE_KEY);
    if (cookieRaw) parsed = JSON.parse(cookieRaw) as Partial<UiPrefs>;
  } catch {
    parsed = null;
  }
  if (!parsed) {
    try {
      const storageRaw = window.localStorage.getItem(UI_STORAGE_KEY);
      if (storageRaw) parsed = JSON.parse(storageRaw) as Partial<UiPrefs>;
    } catch {
      parsed = null;
    }
  }
  if (!parsed) return defaults;
  return {
    selectedGuildId:
      typeof parsed.selectedGuildId === "string" && parsed.selectedGuildId.length > 0
        ? parsed.selectedGuildId
        : null,
    searchSource:
      parsed.searchSource && VALID_SEARCH_SOURCES.has(parsed.searchSource)
        ? parsed.searchSource
        : "auto",
  };
}

export function saveUiPrefs(patch: Partial<UiPrefs>): UiPrefs {
  const next: UiPrefs = {
    ...loadUiPrefs(),
    ...patch,
  };
  if (typeof window === "undefined") return next;
  const serialized = JSON.stringify(next);
  try {
    writeCookie(UI_COOKIE_KEY, serialized);
  } catch {
    // Ignore cookie errors
  }
  try {
    window.localStorage.setItem(UI_STORAGE_KEY, serialized);
  } catch {
    // Ignore localStorage quota issues
  }
  return next;
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

let lastFaviconKey = "";
let cachedMasksPromise: Promise<[HTMLImageElement, HTMLImageElement]> | null = null;

function getFaviconMasks(): Promise<[HTMLImageElement, HTMLImageElement]> {
  if (!cachedMasksPromise) {
    cachedMasksPromise = Promise.all([
      loadImg("/brand/icon-accent-mask.png"),
      loadImg("/brand/icon-inner-mask.png"),
    ]).catch((err) => {
      cachedMasksPromise = null;
      throw err;
    });
  }
  return cachedMasksPromise;
}

async function updateDynamicFavicon(accentHex: string, fgHex: string): Promise<void> {
  if (typeof document === "undefined") return;
  const key = `${accentHex}:${fgHex}`;
  if (key === lastFaviconKey) return;
  lastFaviconKey = key;

  try {
    const [accentMask, innerMask] = await getFaviconMasks();

    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const layer = document.createElement("canvas");
    layer.width = size;
    layer.height = size;
    const lctx = layer.getContext("2d");
    if (!lctx) return;

    // Layer 1: Accent outer circle
    lctx.clearRect(0, 0, size, size);
    lctx.drawImage(accentMask, 0, 0, size, size);
    lctx.globalCompositeOperation = "source-in";
    lctx.fillStyle = accentHex;
    lctx.fillRect(0, 0, size, size);
    lctx.globalCompositeOperation = "source-over";
    ctx.drawImage(layer, 0, 0);

    // Layer 2: Inner C + play triangle
    lctx.clearRect(0, 0, size, size);
    lctx.drawImage(innerMask, 0, 0, size, size);
    lctx.globalCompositeOperation = "source-in";
    lctx.fillStyle = fgHex;
    lctx.fillRect(0, 0, size, size);
    lctx.globalCompositeOperation = "source-over";
    ctx.drawImage(layer, 0, 0);

    const dataUrl = canvas.toDataURL("image/png");
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      link.type = "image/png";
      document.head.appendChild(link);
    }
    link.href = dataUrl;
  } catch {
    // Fallback to static /favicon.png if canvas rendering fails
  }
}

export function previewCustomColors(opts: {
  themeAccent: ThemeAccentId;
  backgroundMode: BackgroundMode;
  customAccentHex?: string | null;
  customBgHex?: string | null;
  customSurfaceHex?: string | null;
}): void {
  if (typeof document === "undefined") return;
  const preset = THEME_ACCENTS.find((a) => a.id === opts.themeAccent) ?? THEME_ACCENTS[0];
  const customAccent = normalizeHexColor(opts.customAccentHex);
  const accentHex = customAccent ?? preset.hex;
  const accentFg = customAccent ? pickContrastingFg(customAccent) : preset.fg;
  const accentRgb = customAccent ? hexToRgbString(customAccent) : preset.rgb;

  const root = document.documentElement;
  root.style.setProperty("--cadence-accent", accentHex);
  root.style.setProperty("--cadence-accent-fg", accentFg);
  root.style.setProperty("--cadence-accent-rgb", accentRgb);

  const customBg = normalizeHexColor(opts.customBgHex);
  if (customBg) {
    root.style.setProperty("--cadence-bg", customBg);
    root.dataset.customBg = "on";
  } else {
    root.style.removeProperty("--cadence-bg");
    delete root.dataset.customBg;
  }

  const customSurface = normalizeHexColor(opts.customSurfaceHex);
  if (customSurface) {
    root.style.setProperty("--cadence-surface", customSurface);
    root.style.setProperty("--cadence-card", customSurface);
    root.dataset.customSurface = "on";
  } else {
    root.style.removeProperty("--cadence-surface");
    root.style.removeProperty("--cadence-card");
    delete root.dataset.customSurface;
  }
}

export function applyThemePreferences(prefs: UserPreferencesDTO): void {
  if (typeof document === "undefined") return;
  const preset = THEME_ACCENTS.find((a) => a.id === prefs.themeAccent) ?? THEME_ACCENTS[0];
  const customAccent = normalizeHexColor(prefs.customAccentHex);
  const accentHex = customAccent ?? preset.hex;
  const accentFg = customAccent ? pickContrastingFg(customAccent) : preset.fg;
  const accentRgb = customAccent ? hexToRgbString(customAccent) : preset.rgb;

  const root = document.documentElement;
  root.style.setProperty("--cadence-accent", accentHex);
  root.style.setProperty("--cadence-accent-fg", accentFg);
  root.style.setProperty("--cadence-accent-rgb", accentRgb);

  const customBg = normalizeHexColor(prefs.customBgHex);
  if (customBg) {
    root.style.setProperty("--cadence-bg", customBg);
    root.dataset.customBg = "on";
  } else {
    root.style.removeProperty("--cadence-bg");
    delete root.dataset.customBg;
  }

  const customSurface = normalizeHexColor(prefs.customSurfaceHex);
  if (customSurface) {
    root.style.setProperty("--cadence-surface", customSurface);
    root.style.setProperty("--cadence-card", customSurface);
    root.dataset.customSurface = "on";
  } else {
    root.style.removeProperty("--cadence-surface");
    root.style.removeProperty("--cadence-card");
    delete root.dataset.customSurface;
  }

  root.dataset.bg = prefs.backgroundMode;
  root.dataset.ambience = prefs.ambienceMode ? "on" : "off";
  root.dataset.contrast = prefs.highContrast ? "high" : "normal";
  root.dataset.motion = prefs.reducedMotion ? "reduced" : "full";
  root.dataset.focus = prefs.enhancedFocusRings ? "enhanced" : "default";
  root.dataset.touch = prefs.largerTouchTargets ? "large" : "standard";

  const scale =
    typeof prefs.textScale === "number" && Number.isFinite(prefs.textScale)
      ? Math.max(90, Math.min(130, Math.round(prefs.textScale)))
      : 100;
  root.style.fontSize = `${(16 * scale) / 100}px`;

  void updateDynamicFavicon(accentHex, accentFg);
}
