/**
 * Kids theme — bright, playful, energetic.
 *
 * Design principles:
 * - Bright, saturated colors that appeal to children (sky blue, sunny yellow,
 *   coral, mint green).
 * - Rounded shapes — large border radius everywhere.
 * - Soft, playful shadows — not harsh or dramatic.
 * - Fredoka for display/titles (rounded, friendly), Nunito for body (clean,
 *   readable, also rounded).
 * - The energy comes from color and motion, not from complexity.
 * - Happy, warm, inviting — never dark or gloomy.
 */

import type { ThemeConfig } from "../themes/index.ts";
import { FREDOKA, NUNITO } from "./fonts.ts";

export const kidsTheme: ThemeConfig = {
  name: "kids-bright",
  bg: {
    base: "#4FC3F7",
    surface: "#81D4FA",
    elevated: "#B3E5FC",
  },
  glass: {
    bg: "rgba(255,255,255,0.85)",
    border: "rgba(255,255,255,0.9)",
    highlight: "rgba(255,255,255,0.6)",
  },
  text: {
    bright: "#1a1a2e",
    mid: "rgba(26,26,46,0.72)",
    dim: "rgba(26,26,46,0.48)",
  },
  accents: {
    primary: "#FFD93D",
    primaryDeep: "#FFB300",
    secondary: "#FF6B6B",
    tertiary: "#4ECDC4",
    success: "#6BCB77",
    warning: "#FF9F43",
    danger: "#FF6B6B",
  },
  chartColors: [
    "#FFD93D",
    "#FF6B6B",
    "#4ECDC4",
    "#6BCB77",
    "#FF9F43",
    "#A78BFA",
    "#FB7185",
    "#34D399",
  ],
  chart: {
    grid: "rgba(26,26,46,0.08)",
    axis: "rgba(26,26,46,0.16)",
  },
  fonts: {
    display: FREDOKA,
    serif: FREDOKA,
    sans: NUNITO,
    mono: NUNITO,
  },
  radius: {
    sm: 12,
    md: 20,
    lg: 28,
    xl: 36,
  },
  shadows: {
    card: "0 8px 24px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)",
    glow: "0 0 32px rgba(255,217,61,0.4)",
  },
};
