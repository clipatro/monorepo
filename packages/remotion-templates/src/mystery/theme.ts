/**
 * Mystery theme — minimalist, dark, atmospheric.
 *
 * Design principles:
 * - No exaggeration. No neon. No glow. No gradients.
 * - Near-black backgrounds with a single muted accent.
 * - Generous negative space. Let the image carry the weight.
 * - Typography is quiet: small labels, restrained headlines.
 * - One accent color (cold amber) used sparingly — a single line, a single dot.
 * - The mystery comes from what is withheld, not what is shown.
 */

import type { ThemeConfig } from "../themes/index.ts";
import { PLAYFAIR_DISPLAY, IBM_PLEX_MONO } from "./fonts.ts";

export const mysteryTheme: ThemeConfig = {
  name: "mystery-dark",
  bg: {
    base: "#08090a",
    surface: "#0d0e10",
    elevated: "#131416",
  },
  glass: {
    bg: "rgba(255,255,255,0.025)",
    border: "rgba(255,255,255,0.06)",
    highlight: "rgba(255,255,255,0.03)",
  },
  text: {
    bright: "rgba(235,235,228,0.92)",
    mid: "rgba(200,200,195,0.58)",
    dim: "rgba(180,180,175,0.32)",
  },
  accents: {
    primary: "#c4a062",
    primaryDeep: "#9a7d4a",
    secondary: "#5a6a78",
    tertiary: "#3d4a52",
    success: "#5a8a6a",
    warning: "#b8924a",
    danger: "#9a5050",
  },
  chartColors: [
    "#c4a062",
    "#5a6a78",
    "#8a7a5a",
    "#4a5a62",
    "#a89060",
    "#6a7a82",
  ],
  chart: {
    grid: "rgba(255,255,255,0.04)",
    axis: "rgba(255,255,255,0.08)",
  },
  fonts: {
    display: PLAYFAIR_DISPLAY,
    serif: PLAYFAIR_DISPLAY,
    sans: PLAYFAIR_DISPLAY,
    mono: IBM_PLEX_MONO,
  },
  radius: {
    sm: 2,
    md: 4,
    lg: 6,
    xl: 8,
  },
  shadows: {
    card: "0 4px 24px rgba(0,0,0,0.6)",
    glow: "none",
  },
};
