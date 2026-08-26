/**
 * Video template loader — loads and validates template JSON configs.
 *
 * Templates live as JSON files in this directory. At startup, the seed script
 * loads them into the `video_templates` DB table. This module provides:
 *   - `loadTemplate(id)` — load + validate a single template by id
 *   - `loadAllTemplates()` — load + validate all templates
 *   - `listTemplateIds()` — list available template ids
 *
 * The Zod schema mirrors the `VideoTemplate` / `TemplateConfig` types in
 * `@automation/contracts`. Validation fails fast if a JSON config is malformed.
 */

import { readFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));

// === Zod schema (mirrors @automation/contracts video-template.ts) ===

const regionTypeSchema = z.enum([
  "image-sequence",
  "video-loop",
  "video-sequence",
  "solid",
]);

const regionSchema = z.object({
  id: z.string().min(1),
  slot: z.enum(["top", "bottom", "full", "overlay"]),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
  type: regionTypeSchema,
  transition: z.enum(["crossfade", "cut", "none"]).optional(),
  transitionDuration: z.number().positive().optional(),
  motion: z.enum(["ken-burns", "none"]).optional(),
  muted: z.boolean().optional(),
  color: z.string().optional(),
  zIndex: z.number().int().optional(),
});

const layoutSchema = z.object({
  aspectRatio: z.string().min(1),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
  regions: z.array(regionSchema).min(1),
  divider: z
    .object({
      y: z.number().int().min(0),
      height: z.number().int().min(1),
      color: z.string(),
    })
    .optional(),
  fadeIn: z.object({ duration: z.number().positive() }),
  fadeOut: z.object({ duration: z.number().positive() }),
});

const assetSpecSchema = z.object({
  required: z.boolean(),
  perScene: z.boolean().optional(),
  source: z.enum(["ai-generation", "stock-library", "tts"]).optional(),
  purpose: z.string().optional(),
  muted: z.boolean().optional(),
  cutToAudioDuration: z.boolean().optional(),
  role: z.string().optional(),
  format: z.string().optional(),
  precision: z.string().optional(),
  default: z.string().optional(),
});

const assetsSchema = z.object({
  images: assetSpecSchema.optional(),
  videoClips: assetSpecSchema.optional(),
  gameplayVideo: assetSpecSchema.optional(),
  voiceover: assetSpecSchema.optional(),
  captions: assetSpecSchema.optional(),
});

const scenePlanSchema = z.object({
  sceneType: z.enum(["image-scene", "video-clip-scene", "flow-hybrid"]),
  imageRequirement: z.boolean(),
  clipPromptFields: z.array(z.string()).optional(),
  clipDurationSeconds: z
    .object({ min: z.number().positive(), max: z.number().positive() })
    .optional(),
  visualPlanFields: z.array(z.string()).optional(),
  maxClips: z.number().int().min(1).optional(),
});

const stepConfigSchema = z.object({
  enabled: z.boolean(),
  required: z.boolean().optional(),
  dependsOn: z.array(z.string()).optional(),
});

const pipelineSchema = z.object({
  steps: z.record(stepConfigSchema),
});

const renderSchema = z.object({
  renderer: z.enum(["ffmpeg", "remotion"]),
  fps: z.number().int().min(1).max(120),
  quality: z.enum(["low", "medium", "high"]),
  encoder: z.object({
    gpu: z.string(),
    cpu: z.string(),
  }),
  kenBurnsVariants: z.number().int().min(1).optional(),
  clipStitching: z.enum(["crossfade", "cut"]).optional(),
});

const providerModelDefaultsSchema = z.object({
  defaultProvider: z.string(),
  defaultModel: z.string(),
  alternativeModels: z.array(z.string()).optional(),
});

const imageProviderSchema = providerModelDefaultsSchema.extend({
  characterModel: z.string().optional(),
  nonCharacterModel: z.string().optional(),
});

const voiceProviderSchema = providerModelDefaultsSchema.extend({
  defaultVoiceId: z.string(),
  fallbackProvider: z.string().optional(),
  fallbackVoiceId: z.string().optional(),
});

const providersSchema = z.object({
  image: imageProviderSchema.optional(),
  video: providerModelDefaultsSchema.optional(),
  voice: voiceProviderSchema.optional(),
});

const configSchema = z.object({
  layout: layoutSchema,
  assets: assetsSchema,
  scenePlan: scenePlanSchema,
  pipeline: pipelineSchema,
  render: renderSchema,
  providers: providersSchema,
});

export const videoTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  version: z.number().int().min(1),
  config: configSchema,
});

// === Loader ===

export type LoadedTemplate = z.infer<typeof videoTemplateSchema>;

/**
 * Load and validate a single template JSON file by id.
 * Reads `video-templates/{id}.json`.
 */
export async function loadTemplate(id: string): Promise<LoadedTemplate> {
  const filePath = join(__dirname, `${id}.json`);
  const raw = await readFile(filePath, "utf-8");
  const parsed = JSON.parse(raw);
  const result = videoTemplateSchema.safeParse(parsed);
  if (!result.success) {
    const errors = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Template "${id}" failed validation:\n${errors}`);
  }
  return result.data;
}

/**
 * Load and validate all template JSON files in this directory.
 */
export async function loadAllTemplates(): Promise<LoadedTemplate[]> {
  const files = await readdir(__dirname);
  const jsonFiles = files.filter((f) => f.endsWith(".json"));
  const templates: LoadedTemplate[] = [];
  for (const file of jsonFiles) {
    const id = file.replace(/\.json$/, "");
    templates.push(await loadTemplate(id));
  }
  return templates;
}

/**
 * List available template ids (from JSON filenames).
 */
export async function listTemplateIds(): Promise<string[]> {
  const files = await readdir(__dirname);
  return files.filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
}
