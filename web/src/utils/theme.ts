import type {
  BackgroundMode,
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
  autoplayClickBehavior: "play_now_here",
};

const STORAGE_KEY = "cadence:prefs";

export function loadCachedPreferences(): UserPreferencesDTO {
  if (typeof window === "undefined") return { ...DEFAULT_PREFERENCES };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<UserPreferencesDTO>;
    return { ...DEFAULT_PREFERENCES, ...parsed };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function saveCachedPreferences(prefs: UserPreferencesDTO): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore localStorage quota or private mode issues
  }
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

async function updateDynamicFavicon(accentHex: string, fgHex: string): Promise<void> {
  if (typeof document === "undefined") return;
  const key = `${accentHex}:${fgHex}`;
  if (key === lastFaviconKey) return;
  lastFaviconKey = key;

  try {
    const [accentMask, innerMask] = await Promise.all([
      loadImg("/brand/icon-accent-mask.png"),
      loadImg("/brand/icon-inner-mask.png"),
    ]);

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

export function applyThemePreferences(prefs: UserPreferencesDTO): void {
  if (typeof document === "undefined") return;
  const accent =
    THEME_ACCENTS.find((a) => a.id === prefs.themeAccent) ?? THEME_ACCENTS[0];
  const root = document.documentElement;
  root.style.setProperty("--cadence-accent", accent.hex);
  root.style.setProperty("--cadence-accent-fg", accent.fg);
  root.style.setProperty("--cadence-accent-rgb", accent.rgb);
  root.dataset.bg = prefs.backgroundMode;
  root.dataset.ambience = prefs.ambienceMode ? "on" : "off";
  void updateDynamicFavicon(accent.hex, accent.fg);
}
