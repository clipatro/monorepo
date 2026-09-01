/**
 * Mystery namespace font loading.
 *
 * Loads Playfair Display (editorial serif for all content text) and
 * IBM Plex Mono (for labels/metadata) via @remotion/google-fonts so
 * they render correctly in Remotion — no Times New Roman fallback.
 *
 * Call loadMysteryFonts() once at the top of any composition that uses
 * mystery components. It's idempotent.
 */

import { loadFont as loadPlayfairDisplay } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadIBMPlexMono } from "@remotion/google-fonts/IBMPlexMono";

let loaded = false;

/**
 * Load Playfair Display (400, 500, 600, 700 + italic 400, 500) and
 * IBM Plex Mono (500, 600) for the mystery namespace.
 *
 * Idempotent — safe to call multiple times.
 */
export function loadMysteryFonts(): void {
  if (loaded) return;
  loadPlayfairDisplay("normal", {
    weights: ["400", "500", "600", "700"],
    subsets: ["latin"],
  });
  loadPlayfairDisplay("italic", {
    weights: ["400", "500"],
    subsets: ["latin"],
  });
  loadIBMPlexMono("normal", {
    weights: ["500", "600"],
    subsets: ["latin"],
  });
  loaded = true;
}

/** CSS font-family stack for Playfair Display with safe fallbacks */
export const PLAYFAIR_DISPLAY = "'Playfair Display', Georgia, serif";

/** CSS font-family stack for IBM Plex Mono with safe fallbacks */
export const IBM_PLEX_MONO = "'IBM Plex Mono', 'JetBrains Mono', monospace";
