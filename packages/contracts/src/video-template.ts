/**
 * Video template contracts — JSON-based configs that drive video assembly.
 *
 * Each template describes:
 *   - layout: screen regions, dimensions, transitions, fades
 *   - assets: which assets the pipeline must produce (images, clips, gameplay, voiceover, captions)
 *   - scenePlan: guidance for the scene planner (image scenes vs clip scenes)
 *   - pipeline: which workflow steps to run/skip
 *   - render: renderer type + parameters (fps, encoder, motion variants, stitching)
 *   - providers: default provider/model config for each asset type
 *
 * Templates are stored in the `video_templates` DB table and assigned to channels
 * via `channel_templates` (with per-channel config overrides). See D017.
 */

// === Layout ===

export type RegionType =
  | "image-sequence" // sequential images with motion (Ken Burns) + crossfade
  | "video-loop" // continuous video (e.g. gameplay) filling the region
  | "video-sequence" // sequential AI-generated video clips with crossfade
  | "solid"; // solid color fill (e.g. divider)

export type RegionSlot = "top" | "bottom" | "full" | "overlay";

export type TransitionType = "crossfade" | "cut" | "none";

export interface LayoutRegion {
  /** Unique id within the template (e.g. "scenes", "gameplay", "clips"). */
  id: string;
  /** Semantic slot position. */
  slot: RegionSlot;
  /** X offset in pixels. */
  x: number;
  /** Y offset in pixels. */
  y: number;
  /** Width in pixels. */
  width: number;
  /** Height in pixels. */
  height: number;
  /** What this region displays. */
  type: RegionType;
  /** Transition between items in this region. */
  transition?: TransitionType;
  /** Transition duration in seconds (for crossfade). */
  transitionDuration?: number;
  /** Motion type for image-sequence regions. */
  motion?: "ken-burns" | "none";
  /** Whether the video in this region is muted (for video-loop). */
  muted?: boolean;
  /** Color for solid regions. */
  color?: string;
  /** Z-index (higher = on top). */
  zIndex?: number;
}

export interface DividerConfig {
  /** Y position in pixels. */
  y: number;
  /** Height in pixels. */
  height: number;
  /** Hex color. */
  color: string;
}

export interface FadeConfig {
  /** Fade duration in seconds. */
  duration: number;
}

export interface TemplateLayout {
  /** Aspect ratio string (e.g. "9:16", "16:9", "1:1"). */
  aspectRatio: string;
  /** Total width in pixels. */
  width: number;
  /** Total height in pixels. */
  height: number;
  /** Ordered list of screen regions. */
  regions: LayoutRegion[];
  /** Optional divider line between regions. */
  divider?: DividerConfig;
  /** Fade in at the start. */
  fadeIn: FadeConfig;
  /** Fade out at the end. */
  fadeOut: FadeConfig;
}

// === Assets ===

export type AssetSourceType = "ai-generation" | "stock-library" | "tts";

export interface AssetSpec {
  /** Whether this asset is required for the template. */
  required: boolean;
  /** Whether one asset is produced per scene. */
  perScene?: boolean;
  /** Where the asset comes from. */
  source?: AssetSourceType;
  /** Purpose/role description. */
  purpose?: string;
  /** For video assets: whether to mute. */
  muted?: boolean;
  /** For gameplay: whether to cut to audio duration. */
  cutToAudioDuration?: boolean;
  /** For voiceover: whether it's the primary audio track. */
  role?: string;
  /** For captions: output format. */
  format?: string;
  /** For captions: timing precision. */
  precision?: string;
  /** Default state when optional ("enabled" | "disabled"). */
  default?: string;
}

export interface TemplateAssets {
  /** Per-scene AI-generated images (image-based templates). */
  images?: AssetSpec;
  /** Per-scene AI-generated video clips (clip-based templates). */
  videoClips?: AssetSpec;
  /** Continuous gameplay video (gameplay templates). */
  gameplayVideo?: AssetSpec;
  /** Voiceover audio. */
  voiceover?: AssetSpec;
  /** Caption/subtitle file. */
  captions?: AssetSpec;
}

// === Scene plan ===

export interface ClipDurationRange {
  min: number;
  max: number;
}

export interface TemplateScenePlan {
  /** "image-scene", "video-clip-scene", or "flow-hybrid" (Phase 9). */
  sceneType: "image-scene" | "video-clip-scene" | "flow-hybrid";
  /** Whether each scene needs an image. */
  imageRequirement: boolean;
  /** Fields the scene planner should populate for clip prompts. */
  clipPromptFields?: string[];
  /** Duration range for AI-generated clips (seconds). */
  clipDurationSeconds?: ClipDurationRange;
  /** Fields the scene planner should populate for image visual plans. */
  visualPlanFields?: string[];
  /** Max 4s video clips per video (Phase 9 — Flow templates, default 7). */
  maxClips?: number;
}

// === Pipeline ===

export interface PipelineStepConfig {
  /** Whether this step runs for this template. */
  enabled: boolean;
  /** Whether the step is required (false = can be skipped by user config). */
  required?: boolean;
  /** Step types that must complete before this step can start.
   *  Defines the dependency graph within the template. */
  dependsOn?: string[];
}

export interface TemplatePipeline {
  /** Map of step type → config (including dependencies). */
  steps: Record<string, PipelineStepConfig>;
}

// === Render ===

export interface EncoderConfig {
  /** GPU encoder (e.g. "h264_nvenc"). */
  gpu: string;
  /** CPU encoder (e.g. "libx264"). */
  cpu: string;
}

export interface TemplateRender {
  /** Renderer type. */
  renderer: "ffmpeg";
  /** Frames per second. */
  fps: number;
  /** Quality preset. */
  quality: "low" | "medium" | "high";
  /** Encoder selection. */
  encoder: EncoderConfig;
  /** Number of Ken Burns motion variants (for image-sequence regions). */
  kenBurnsVariants?: number;
  /** Clip stitching mode (for video-sequence regions). */
  clipStitching?: "crossfade" | "cut";
}

// === Providers ===

export interface ProviderModelDefaults {
  /** Default provider name. */
  defaultProvider: string;
  /** Default model id. */
  defaultModel: string;
  /** Alternative model ids. */
  alternativeModels?: string[];
}

export interface ImageProviderDefaults extends ProviderModelDefaults {
  /** Model for character scenes. */
  characterModel?: string;
  /** Model for non-character scenes. */
  nonCharacterModel?: string;
}

export interface VoiceProviderDefaults extends ProviderModelDefaults {
  /** Default voice id. */
  defaultVoiceId: string;
  /** Fallback provider. */
  fallbackProvider?: string;
  /** Fallback voice id. */
  fallbackVoiceId?: string;
}

export interface TemplateProviders {
  /** Image generation settings (image-based templates). */
  image?: ImageProviderDefaults;
  /** Video clip generation settings (clip-based templates). */
  video?: ProviderModelDefaults;
  /** Voice synthesis settings. */
  voice?: VoiceProviderDefaults;
}

// === Full template config ===

export interface TemplateConfig {
  /** Layout configuration. */
  layout: TemplateLayout;
  /** Required assets. */
  assets: TemplateAssets;
  /** Scene plan guidance. */
  scenePlan: TemplateScenePlan;
  /** Pipeline step enablement. */
  pipeline: TemplatePipeline;
  /** Render parameters. */
  render: TemplateRender;
  /** Default provider/model config. */
  providers: TemplateProviders;
}

export interface VideoTemplate {
  /** Slug identifier (e.g. "gameplay-with-image-scenes"). */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Description. */
  description: string;
  /** Template version. */
  version: number;
  /** The full template config. */
  config: TemplateConfig;
}

// === Merged config (template defaults + channel overrides) ===

/**
 * Per-channel overrides applied on top of a template's default config.
 * Only the fields present are overridden; the rest fall back to template defaults.
 */
export interface ChannelTemplateOverrides {
  layout?: Partial<TemplateLayout>;
  assets?: Partial<TemplateAssets>;
  scenePlan?: Partial<TemplateScenePlan>;
  pipeline?: {
    steps?: Record<string, Partial<PipelineStepConfig>>;
  };
  render?: Partial<TemplateRender>;
  providers?: Partial<TemplateProviders>;
}

/**
 * Deep-merge channel overrides over template defaults.
 * Arrays and primitives are replaced; objects are merged recursively.
 */
export function mergeTemplateConfig(
  defaults: TemplateConfig,
  overrides: ChannelTemplateOverrides,
): TemplateConfig {
  return {
    layout: { ...defaults.layout, ...overrides.layout },
    assets: { ...defaults.assets, ...overrides.assets },
    scenePlan: { ...defaults.scenePlan, ...overrides.scenePlan },
    pipeline: {
      steps: mergeStepConfigs(defaults.pipeline.steps, overrides.pipeline?.steps),
    },
    render: { ...defaults.render, ...overrides.render },
    providers: { ...defaults.providers, ...overrides.providers },
  };
}

function mergeStepConfigs(
  defaults: Record<string, PipelineStepConfig>,
  overrides?: Record<string, Partial<PipelineStepConfig>>,
): Record<string, PipelineStepConfig> {
  if (!overrides) return { ...defaults };
  const result: Record<string, PipelineStepConfig> = { ...defaults };
  for (const [key, val] of Object.entries(overrides)) {
    if (result[key]) {
      result[key] = { ...result[key], ...val };
    } else {
      result[key] = { enabled: val.enabled ?? false, required: val.required };
    }
  }
  return result;
}

// === Helper: check if a step is enabled for a template config ===

export function isStepEnabled(
  config: TemplateConfig,
  stepType: string,
): boolean {
  return config.pipeline.steps[stepType]?.enabled ?? false;
}

// === Helper: get enabled steps with dependencies from a template config ===

/**
 * Returns the list of enabled step types from the template, topologically
 * sorted by their dependencies. Steps not enabled are excluded.
 */
export function getEnabledSteps(config: TemplateConfig): string[] {
  const enabled = new Set(
    Object.entries(config.pipeline.steps)
      .filter(([, cfg]) => cfg.enabled)
      .map(([type]) => type),
  );

  // Topological sort using Kahn's algorithm
  const sorted: string[] = [];
  const visited = new Set<string>();

  const visit = (type: string, path: Set<string>) => {
    if (visited.has(type)) return;
    if (path.has(type)) return; // cycle guard
    path.add(type);
    const cfg = config.pipeline.steps[type];
    if (cfg?.dependsOn) {
      for (const dep of cfg.dependsOn) {
        if (enabled.has(dep)) visit(dep, path);
      }
    }
    path.delete(type);
    visited.add(type);
    sorted.push(type);
  };

  for (const type of enabled) {
    visit(type, new Set());
  }

  return sorted;
}

/**
 * Get the dependencies for a specific step from the template config.
 * Returns only dependencies that are themselves enabled.
 */
export function getStepDependencies(
  config: TemplateConfig,
  stepType: string,
): string[] {
  const cfg = config.pipeline.steps[stepType];
  if (!cfg?.dependsOn) return [];
  return cfg.dependsOn.filter((dep) =>
    config.pipeline.steps[dep]?.enabled ?? false,
  );
}

// === Helper: check if an asset is required ===

export function isAssetRequired(
  config: TemplateConfig,
  asset: keyof TemplateAssets,
): boolean {
  return config.assets[asset]?.required ?? false;
}
