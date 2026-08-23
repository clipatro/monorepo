/**
 * Global dry-run helper.
 *
 * When DRY_RUN (or legacy GEMINI_DRY_RUN) is set, all paid provider calls
 * return placeholder data instead of hitting real APIs. Free/local providers
 * (Kokoro TTS, local embeddings) still run normally.
 *
 * Usage:
 *   import { isDryRun, getDryRunMediaPath } from "@automation/contracts";
 *   if (isDryRun()) { ... return placeholder ... }
 */

/**
 * Returns true if global dry-run mode is active.
 * Checks DRY_RUN env var, falling back to GEMINI_DRY_RUN for backward compat.
 */
export function isDryRun(): boolean {
  const v = process.env.DRY_RUN ?? process.env.GEMINI_DRY_RUN;
  if (v === undefined || v === "") return false;
  return v === "true" || v === "1" || v === "yes";
}

/**
 * Returns the path to the dry-run placeholder media directory.
 * Defaults to ./media/dry-run.
 */
export function getDryRunMediaPath(): string {
  return process.env.DRY_RUN_MEDIA_PATH ?? "./media/dry-run";
}
