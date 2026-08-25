/**
 * Theme system for Remotion templates.
 *
 * Each channel can have its own theme. A theme defines:
 * - Background colors and gradients
 * - Glass/surface colors
 * - Text colors (bright, mid, dim)
 * - Accent colors (primary, secondary, tertiary, etc.)
 * - Chart-specific colors
 * - Font families
 * - Border radius, spacing, shadow presets
 *
 * Components accept a `theme` prop. If omitted, the default theme is used.
 */

export interface ThemeConfig {
  /** Unique theme name */
  name: string;

  /** Background colors */
  bg: {
    base: string;        // darkest base color
    surface: string;     // slightly lighter
    elevated: string;    // card-level
  };

  /** Glassmorphic surface colors */
  glass: {
    bg: string;          // semi-transparent fill
    border: string;      // border color
    highlight: string;   // top inset highlight
  };

  /** Text colors */
  text: {
    bright: string;      // primary text
    mid: string;         // secondary text
    dim: string;         // tertiary/label text
  };

  /** Accent colors — used for charts, highlights, buttons */
  accents: {
    primary: string;
    primaryDeep: string;
    secondary: string;
    tertiary: string;
    success: string;
    warning: string;
    danger: string;
  };

  /** Chart-specific colors — cycled through data series */
  chartColors: string[];

  /** Grid and axis colors for charts */
  chart: {
    grid: string;
    axis: string;
  };

  /** Font families */
  fonts: {
    display: string;
    serif: string;
    sans: string;
    mono: string;
  };

  /** Border radius presets */
  radius: {
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };

  /** Shadow presets */
  shadows: {
    card: string;
    glow: string;
  };
}

// ─── Default Theme: "Midnight" ──────────────────────────────────────────────

export const midnightTheme: ThemeConfig = {
  name: "midnight",
  bg: {
    base: "#06080f",
    surface: "#0a0e1a",
    elevated: "#0f1424",
  },
  glass: {
    bg: "rgba(255,255,255,0.04)",
    border: "rgba(255,255,255,0.08)",
    highlight: "rgba(255,255,255,0.06)",
  },
  text: {
    bright: "rgba(255,255,255,0.95)",
    mid: "rgba(255,255,255,0.65)",
    dim: "rgba(255,255,255,0.35)",
  },
  accents: {
    primary: "#00d4ff",
    primaryDeep: "#0099ff",
    secondary: "#a855f7",
    tertiary: "#ec4899",
    success: "#10b981",
    warning: "#f59e0b",
    danger: "#f43f5e",
  },
  chartColors: [
    "#00d4ff",
    "#a855f7",
    "#ec4899",
    "#10b981",
    "#f59e0b",
    "#f43f5e",
    "#3b82f6",
    "#8b5cf6",
  ],
  chart: {
    grid: "rgba(255,255,255,0.06)",
    axis: "rgba(255,255,255,0.12)",
  },
  fonts: {
    display: "'League Gothic', 'Arial Narrow', sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    sans: "Montserrat, Helvetica, sans-serif",
    mono: "'IBM Plex Mono', 'JetBrains Mono', monospace",
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 18,
    xl: 24,
  },
  shadows: {
    card: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
    glow: "0 0 40px rgba(0, 212, 255, 0.25)",
  },
};

// ─── Theme: "Sunset" — warm, energetic ──────────────────────────────────────

export const sunsetTheme: ThemeConfig = {
  name: "sunset",
  bg: {
    base: "#0c0610",
    surface: "#160a18",
    elevated: "#1f0e22",
  },
  glass: {
    bg: "rgba(255,200,180,0.04)",
    border: "rgba(255,200,180,0.08)",
    highlight: "rgba(255,200,180,0.06)",
  },
  text: {
    bright: "rgba(255,250,245,0.95)",
    mid: "rgba(255,220,200,0.65)",
    dim: "rgba(255,200,180,0.35)",
  },
  accents: {
    primary: "#f97316",
    primaryDeep: "#ea580c",
    secondary: "#ec4899",
    tertiary: "#f43f5e",
    success: "#22c55e",
    warning: "#fbbf24",
    danger: "#dc2626",
  },
  chartColors: [
    "#f97316",
    "#ec4899",
    "#f43f5e",
    "#fbbf24",
    "#a855f7",
    "#06b6d4",
    "#84cc16",
    "#e879f9",
  ],
  chart: {
    grid: "rgba(255,200,180,0.06)",
    axis: "rgba(255,200,180,0.12)",
  },
  fonts: {
    display: "'League Gothic', 'Arial Narrow', sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    sans: "Montserrat, Helvetica, sans-serif",
    mono: "'IBM Plex Mono', 'JetBrains Mono', monospace",
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 18,
    xl: 24,
  },
  shadows: {
    card: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,200,180,0.06)",
    glow: "0 0 40px rgba(249, 115, 22, 0.25)",
  },
};

// ─── Theme: "Forest" — natural, calm ────────────────────────────────────────

export const forestTheme: ThemeConfig = {
  name: "forest",
  bg: {
    base: "#040a08",
    surface: "#081410",
    elevated: "#0c1e18",
  },
  glass: {
    bg: "rgba(180,255,200,0.03)",
    border: "rgba(180,255,200,0.07)",
    highlight: "rgba(180,255,200,0.05)",
  },
  text: {
    bright: "rgba(245,255,248,0.95)",
    mid: "rgba(200,230,215,0.65)",
    dim: "rgba(180,210,195,0.35)",
  },
  accents: {
    primary: "#10b981",
    primaryDeep: "#059669",
    secondary: "#06b6d4",
    tertiary: "#84cc16",
    success: "#22c55e",
    warning: "#eab308",
    danger: "#ef4444",
  },
  chartColors: [
    "#10b981",
    "#06b6d4",
    "#84cc16",
    "#22c55e",
    "#eab308",
    "#a855f7",
    "#f97316",
    "#ec4899",
  ],
  chart: {
    grid: "rgba(180,255,200,0.05)",
    axis: "rgba(180,255,200,0.10)",
  },
  fonts: {
    display: "'League Gothic', 'Arial Narrow', sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    sans: "Montserrat, Helvetica, sans-serif",
    mono: "'IBM Plex Mono', 'JetBrains Mono', monospace",
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 18,
    xl: 24,
  },
  shadows: {
    card: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(180,255,200,0.05)",
    glow: "0 0 40px rgba(16, 185, 129, 0.25)",
  },
};

// ─── Theme: "Royal" — premium, gold accents ─────────────────────────────────

export const royalTheme: ThemeConfig = {
  name: "royal",
  bg: {
    base: "#08060f",
    surface: "#0e0a1a",
    elevated: "#14102a",
  },
  glass: {
    bg: "rgba(255,215,100,0.03)",
    border: "rgba(255,215,100,0.08)",
    highlight: "rgba(255,215,100,0.05)",
  },
  text: {
    bright: "rgba(255,250,240,0.95)",
    mid: "rgba(230,210,180,0.65)",
    dim: "rgba(210,190,160,0.35)",
  },
  accents: {
    primary: "#fbbf24",
    primaryDeep: "#f59e0b",
    secondary: "#a855f7",
    tertiary: "#3b82f6",
    success: "#10b981",
    warning: "#f97316",
    danger: "#ef4444",
  },
  chartColors: [
    "#fbbf24",
    "#a855f7",
    "#3b82f6",
    "#10b981",
    "#f97316",
    "#ec4899",
    "#06b6d4",
    "#84cc16",
  ],
  chart: {
    grid: "rgba(255,215,100,0.05)",
    axis: "rgba(255,215,100,0.10)",
  },
  fonts: {
    display: "'League Gothic', 'Arial Narrow', sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    sans: "Montserrat, Helvetica, sans-serif",
    mono: "'IBM Plex Mono', 'JetBrains Mono', monospace",
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 18,
    xl: 24,
  },
  shadows: {
    card: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,215,100,0.05)",
    glow: "0 0 40px rgba(251, 191, 36, 0.25)",
  },
};

export const archiveTheme: ThemeConfig = {
  name: "archive",
  bg: { base: "#10100f", surface: "#191917", elevated: "#25231f" },
  glass: { bg: "rgba(243,239,231,0.06)", border: "rgba(243,239,231,0.18)", highlight: "rgba(243,239,231,0.12)" },
  text: { bright: "#f3efe7", mid: "rgba(243,239,231,0.72)", dim: "rgba(243,239,231,0.46)" },
  accents: { primary: "#e85d3f", primaryDeep: "#a93621", secondary: "#d8b25c", tertiary: "#7691a8", success: "#4d8b6a", warning: "#d79032", danger: "#c84032" },
  chartColors: ["#e85d3f", "#d8b25c", "#6f8f72", "#7691a8", "#c7795b", "#a58b6f"],
  chart: { grid: "rgba(243,239,231,0.09)", axis: "rgba(243,239,231,0.32)" },
  fonts: { display: "'League Gothic', 'Arial Narrow', sans-serif", serif: "Georgia, 'Times New Roman', serif", sans: "Montserrat, Helvetica, sans-serif", mono: "'IBM Plex Mono', 'JetBrains Mono', monospace" },
  radius: { sm: 2, md: 6, lg: 8, xl: 10 },
  shadows: { card: "12px 16px 0 rgba(0,0,0,0.32)", glow: "none" },
};

// ─── Theme Registry ─────────────────────────────────────────────────────────

export const themes: Record<string, ThemeConfig> = {
  archive: archiveTheme,
  midnight: midnightTheme,
  sunset: sunsetTheme,
  forest: forestTheme,
  royal: royalTheme,
};

export const defaultTheme = archiveTheme;

/** Get a theme by name, falling back to default */
export function getTheme(name?: string): ThemeConfig {
  if (name && themes[name]) return themes[name];
  return defaultTheme;
}

/** Create a custom theme by overriding specific fields of an existing theme */
export function createTheme(
  base: string | ThemeConfig,
  overrides: DeepPartial<ThemeConfig>,
): ThemeConfig {
  const baseTheme = typeof base === "string" ? getTheme(base) : base;
  return deepMerge(baseTheme, overrides) as ThemeConfig;
}

// ─── Utils ──────────────────────────────────────────────────────────────────

type DeepPartial<T> = { [P in keyof T]?: DeepPartial<T[P]> };

function deepMerge<T>(target: T, source: DeepPartial<T>): T {
  const result = { ...target };
  for (const key in source) {
    if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
      result[key] = deepMerge((target as any)[key], source[key] as any);
    } else if (source[key] !== undefined) {
      (result as any)[key] = source[key];
    }
  }
  return result;
}
