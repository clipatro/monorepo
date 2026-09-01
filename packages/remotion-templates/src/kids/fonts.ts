/**
 * Kids namespace font loading.
 *
 * Loads Fredoka (rounded, playful display font for titles and headlines) and
 * Nunito (clean, rounded sans-serif for body text and labels) via
 * @remotion/google-fonts so they render correctly in Remotion — no fallback
 * to generic system fonts.
 *
 * Call loadKidsFonts() once at the top of any composition that uses kids
 * components. It's idempotent.
 */

import { loadFont as loadFredoka } from "@remotion/google-fonts/Fredoka";
import { loadFont as loadNunito } from "@remotion/google-fonts/Nunito";

let loaded = false;

/**
 * Load Fredoka (400, 500, 600, 700) and Nunito (400, 600, 700, 800) for the
 * kids namespace.
 *
 * Idempotent — safe to call multiple times.
 */
export function loadKidsFonts(): void {
  if (loaded) return;
  loadFredoka("normal", {
    weights: ["400", "500", "600", "700"],
    subsets: ["latin"],
  });
  loadNunito("normal", {
    weights: ["400", "600", "700", "800"],
    subsets: ["latin"],
  });
  loaded = true;
}

/** CSS font-family stack for Fredoka with safe fallbacks */
export const FREDOKA = "'Fredoka', 'Comic Sans MS', sans-serif";

/** CSS font-family stack for Nunito with safe fallbacks */
export const NUNITO = "'Nunito', 'Segoe UI', sans-serif";
