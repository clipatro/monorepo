/**
 * @automation/config — centralized environment configuration.
 *
 * Loads .env once and exposes typed config to all services.
 * Secrets are never logged.
 */

/** Service-level configuration loaded from environment. */
export interface AppConfig {
  /** Service name (e.g. "story-service", "api-gateway"). */
  serviceName: string;
  /** HTTP port the service listens on. */
  port: number;
  /** PostgreSQL connection string (Neon/Supabase/local). */
  databaseUrl: string;
  /** Artifact store root path. */
  artifactStorePath: string;
  /** Path to gameplay videos directory (copyright-free background footage). */
  gameplayVideoPath: string;
  /** Gemini API key (never log this). */
  geminiApiKey: string | null;
  /** Gemini project id. */
  geminiProjectId: string | null;
  /** DeepSeek API key (never log this). */
  deepseekApiKey: string | null;
  /**
   * fal.ai API key for image generation (FLUX.2 klein 4B/9B, Nano Banana via fal).
   * Never log this. Required when imageProvider === "fal".
   */
  falApiKey: string | null;
  /**
   * Image generation provider: "gemini" (default, direct Gemini API) or "fal"
   * (fal.ai — FLUX.2 klein models, Nano Banana via fal). Switches the image
   * adapter used by image-service. Default: "fal" (FLUX.2 klein 9B).
   */
  imageProvider: "gemini" | "fal";
  /**
   * Default LLM provider for text generation: "gemini" or "deepseek".
   * Services use this to select which LLM client to instantiate.
   * Individual capabilities can override via LLM_PROVIDER_<CAPABILITY> env vars.
   * Default: "gemini" (preserves existing behavior).
   */
  llmProvider: "gemini" | "deepseek";
  /** Cost budget per run (USD). */
  costBudgetPerRun: number;
  /** Cost budget per day (USD). */
  costBudgetPerDay: number;
  /** Cost budget global (USD). */
  costBudgetGlobal: number;
  /** Log level: "debug" | "info" | "warn" | "error". */
  logLevel: string;
  /** Ably root key for server-side publishing (never expose to frontend). */
  ablyRootKey: string | null;
  /**
   * Global dry-run mode: when true, ALL paid provider calls (Gemini, DeepSeek,
   * fal.ai, Gemini TTS) return placeholder data instead of hitting real APIs.
   * Free/local providers (Kokoro TTS, local embeddings) still run normally.
   * Set via DRY_RUN env var ("true" / "1" / "yes").
   *
   * The legacy GEMINI_DRY_RUN env var is still respected and implies DRY_RUN.
   */
  dryRun: boolean;
  /** Path to dry-run placeholder media (images, video clips). */
  dryRunMediaPath: string;
  /** Zernio API key for social media publishing (never log this). D023. */
  zernioApiKey: string | null;
  /** Publishing provider: "zernio" (default). D023. */
  publishProvider: "zernio";
  /** Other services' base URLs (for inter-service calls). */
  services: ServiceUrls;
}

export interface ServiceUrls {
  apiGateway: string;
  storyService: string;
  researchService: string;
  imageService: string;
  voiceService: string;
  embeddingService: string;
  workflowService: string;
  videoService: string;
  publishService: string;
}

/** Default service URLs (Docker Compose service names). */
const defaultServiceUrls: ServiceUrls = {
  apiGateway: "http://api-gateway:3000",
  storyService: "http://story-service:3001",
  researchService: "http://research-service:3002",
  imageService: "http://image-service:3003",
  voiceService: "http://voice-service:3004",
  embeddingService: "http://embedding-service:3005",
  workflowService: "http://workflow-service:3006",
  videoService: "http://video-service:3007",
  publishService: "http://publish-service:3008",
};

function num(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isNaN(n) ? fallback : n;
}

function str(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function bool(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (v === undefined || v === "") return fallback;
  return v === "true" || v === "1" || v === "yes";
}

/** Load configuration from environment. Call once at service startup. */
export function loadConfig(serviceName: string): AppConfig {
  return {
    serviceName,
    port: num("PORT", defaultPort(serviceName)),
    databaseUrl: str("DATABASE_URL", ""),
    artifactStorePath: str("ARTIFACT_STORE_PATH", "./data/artifacts"),
    gameplayVideoPath: str("GAMEPLAY_VIDEO_PATH", "./media/gameplay"),
    geminiApiKey: process.env.GEMINI_API_KEY ?? null,
    geminiProjectId: process.env.GEMINI_PROJECT_ID ?? null,
    deepseekApiKey: process.env.DEEPSEEK_API_KEY ?? null,
    falApiKey: process.env.FAL_KEY ?? null,
    imageProvider: (str("IMAGE_PROVIDER", "fal") as "gemini" | "fal"),
    llmProvider: (str("LLM_PROVIDER", "gemini") as "gemini" | "deepseek"),
    costBudgetPerRun: num("COST_BUDGET_PER_RUN", 2.0),
    costBudgetPerDay: num("COST_BUDGET_PER_DAY", 10.0),
    costBudgetGlobal: num("COST_BUDGET_GLOBAL", 100.0),
    logLevel: str("LOG_LEVEL", "info"),
    ablyRootKey: process.env.ABLY_ROOT_KEY ?? null,
    dryRun: bool("DRY_RUN", false) || bool("GEMINI_DRY_RUN", false),
    dryRunMediaPath: str("DRY_RUN_MEDIA_PATH", "./media/dry-run"),
    zernioApiKey: process.env.ZERNIO_API_KEY ?? null,
    publishProvider: "zernio",
    services: {
      apiGateway: str("API_GATEWAY_URL", defaultServiceUrls.apiGateway),
      storyService: str("STORY_SERVICE_URL", defaultServiceUrls.storyService),
      researchService: str("RESEARCH_SERVICE_URL", defaultServiceUrls.researchService),
      imageService: str("IMAGE_SERVICE_URL", defaultServiceUrls.imageService),
      voiceService: str("VOICE_SERVICE_URL", defaultServiceUrls.voiceService),
      embeddingService: str("EMBEDDING_SERVICE_URL", defaultServiceUrls.embeddingService),
      workflowService: str("WORKFLOW_SERVICE_URL", defaultServiceUrls.workflowService),
      videoService: str("VIDEO_SERVICE_URL", defaultServiceUrls.videoService),
      publishService: str("PUBLISH_SERVICE_URL", defaultServiceUrls.publishService),
    },
  };
}

/** Default port per service name. */
function defaultPort(serviceName: string): number {
  const ports: Record<string, number> = {
    "api-gateway": 3000,
    "story-service": 3001,
    "research-service": 3002,
    "image-service": 3003,
    "voice-service": 3004,
    "embedding-service": 3005,
    "workflow-service": 3006,
    "video-service": 3007,
    "publish-service": 3008,
  };
  return ports[serviceName] ?? 3000;
}

/** Safe config for logging — redacts secrets. */
export function redactedConfig(config: AppConfig): Record<string, unknown> {
  return {
    serviceName: config.serviceName,
    port: config.port,
    databaseUrl: config.databaseUrl ? "***REDACTED***" : null,
    artifactStorePath: config.artifactStorePath,
    geminiApiKey: config.geminiApiKey ? "***REDACTED***" : null,
    geminiProjectId: config.geminiProjectId ? "***REDACTED***" : null,
    deepseekApiKey: config.deepseekApiKey ? "***REDACTED***" : null,
    falApiKey: config.falApiKey ? "***REDACTED***" : null,
    imageProvider: config.imageProvider,
    llmProvider: config.llmProvider,
    costBudgetPerRun: config.costBudgetPerRun,
    costBudgetPerDay: config.costBudgetPerDay,
    costBudgetGlobal: config.costBudgetGlobal,
    logLevel: config.logLevel,
    ablyRootKey: config.ablyRootKey ? "***REDACTED***" : null,
    dryRun: config.dryRun,
    dryRunMediaPath: config.dryRunMediaPath,
    zernioApiKey: config.zernioApiKey ? "***REDACTED***" : null,
    publishProvider: config.publishProvider,
    services: config.services,
  };
}
