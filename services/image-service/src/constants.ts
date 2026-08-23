// === Constants ===

/** Scene planning model — depends on LLM_PROVIDER config. */
const GEMINI_SCENE_PLAN_MODEL = "gemini-3.6-flash";
const DEEPSEEK_SCENE_PLAN_MODEL = "deepseek-v4-flash";

function getScenePlanModel(provider?: string): string {
  const p = provider ?? process.env.LLM_PROVIDER ?? "gemini";
  return p === "deepseek" ? DEEPSEEK_SCENE_PLAN_MODEL : GEMINI_SCENE_PLAN_MODEL;
}

// === Image generation models ===
//
// Two providers are supported:
//   "gemini" — direct Gemini API (Gemini 3.1 Flash Image / Flash Lite Image)
//   "fal"    — fal.ai (FLUX.2 klein 4B/9B, Nano Banana 2 via fal)
//
// The provider is selected via IMAGE_PROVIDER env var (default: "fal").
// Each provider has a character-scene model and a non-character-scene model.
// Models can be overridden individually via IMAGE_MODEL_CHARACTER and
// IMAGE_MODEL_NON_CHARACTER env vars.

/** Gemini direct API models (IMAGE_PROVIDER=gemini). */
const GEMINI_CHARACTER_MODEL = "gemini-3.1-flash-image";
const GEMINI_NON_CHARACTER_MODEL = "gemini-3.1-flash-lite-image";

/** fal.ai models (IMAGE_PROVIDER=fal). */
const FAL_CHARACTER_MODEL = "fal-ai/flux-2/klein/9b/edit";
const FAL_NON_CHARACTER_MODEL = "fal-ai/flux-2/klein/4b/edit";

/** fal.ai fallback model (used when the primary fal model fails). */
const FAL_FALLBACK_MODEL = "fal-ai/flux-2/klein/4b/edit";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

/** Get the active image provider from env (default: "fal"). */
function getImageProvider(): "gemini" | "fal" {
  const v = process.env.IMAGE_PROVIDER ?? "fal";
  return v === "gemini" ? "gemini" : "fal";
}

/** Get the character-scene model for the active or specified provider. */
function getCharacterSceneModel(provider?: "gemini" | "fal"): string {
  const override = process.env.IMAGE_MODEL_CHARACTER;
  if (override) return override;
  const p = provider ?? getImageProvider();
  return p === "gemini" ? GEMINI_CHARACTER_MODEL : FAL_CHARACTER_MODEL;
}

/** Get the non-character-scene model for the active or specified provider. */
function getNonCharacterSceneModel(provider?: "gemini" | "fal"): string {
  const override = process.env.IMAGE_MODEL_NON_CHARACTER;
  if (override) return override;
  const p = provider ?? getImageProvider();
  return p === "gemini" ? GEMINI_NON_CHARACTER_MODEL : FAL_NON_CHARACTER_MODEL;
}

/** Get the fallback model for the active provider. */
function getFallbackModel(): string {
  return getImageProvider() === "gemini" ? GEMINI_NON_CHARACTER_MODEL : FAL_FALLBACK_MODEL;
}

export {
  GEMINI_SCENE_PLAN_MODEL,
  DEEPSEEK_SCENE_PLAN_MODEL,
  getScenePlanModel,
  GEMINI_CHARACTER_MODEL,
  GEMINI_NON_CHARACTER_MODEL,
  FAL_CHARACTER_MODEL,
  FAL_NON_CHARACTER_MODEL,
  FAL_FALLBACK_MODEL,
  API_BASE,
  getImageProvider,
  getCharacterSceneModel,
  getNonCharacterSceneModel,
  getFallbackModel,
};
