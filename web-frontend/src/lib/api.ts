/**
 * API client — typed fetch wrapper for the api-gateway.
 * All requests go through the Vite proxy (/api -> http://localhost:3000).
 */

/** Per-step LLM provider/model override. null = use env default. */
export interface LlmStepConfig {
  provider: string | null;
  model: string | null;
}

/** All LLM step keys that can be individually configured per channel. */
export type LlmStepKey =
  | "classification"
  | "research_grounding"
  | "research_structuring"
  | "story_candidates"
  | "duplicate_adjudication"
  | "scene_planning"
  | "story_dna";

/** Map of step key → { provider, model }. Missing keys = use env default. */
export type LlmConfig = Partial<Record<LlmStepKey, LlmStepConfig>>;

export interface Channel {
  id: string;
  name: string;
  slug: string;
  niche: string;
  locale: string;
  contentTypes: string[];
  targetDurationSeconds: number;
  sceneMin: number;
  sceneMax: number;
  storyStyle: string;
  visualStyle: string;
  activeCharacterVersionId: string | null;
  activeCharacterIds: string[];
  imageProvider: string;
  ttsProvider: string;
  ttsVoiceId: string;
  aspectRatio: string;
  approvalEnabled: boolean;
  llmConfig: LlmConfig | null;
  imageModelCharacter: string | null;
  imageModelNonCharacter: string | null;
  researchEnabled: boolean;
  duplicateAdjudicationEnabled: boolean;
  videoGenerationEnabled: boolean;
  videoTemplate: string;
  createdAt: string;
  updatedAt: string;
}

// === Video Template types (mirrors @automation/contracts) ===

export interface VideoTemplateSummary {
  id: string;
  name: string;
  description: string;
  version: number;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateLayout {
  aspectRatio: string;
  width: number;
  height: number;
}

export interface TemplateScenePlan {
  sceneType: "image-scene" | "video-clip-scene";
  imageRequirement: boolean;
  clipPromptFields?: string[];
  clipDurationSeconds?: { min: number; max: number };
  visualPlanFields?: string[];
}

export interface TemplateRender {
  renderer: "ffmpeg";
  fps: number;
  quality: "low" | "medium" | "high";
  kenBurnsVariants?: number;
  clipStitching?: "crossfade" | "cut";
}

export interface TemplateProviders {
  image?: {
    defaultProvider: string;
    defaultModel: string;
    characterModel?: string;
    nonCharacterModel?: string;
    alternativeModels?: string[];
  };
  video?: {
    defaultProvider: string;
    defaultModel: string;
    alternativeModels?: string[];
  };
  voice?: {
    defaultProvider: string;
    defaultModel: string;
    defaultVoiceId: string;
    fallbackProvider?: string;
    fallbackVoiceId?: string;
  };
}

export interface TemplateAssets {
  images?: { required: boolean; perScene?: boolean; source?: string; purpose?: string };
  videoClips?: { required: boolean; perScene?: boolean; source?: string; purpose?: string };
  gameplayVideo?: { required: boolean; source?: string; muted?: boolean; cutToAudioDuration?: boolean; purpose?: string };
  voiceover?: { required: boolean; source?: string; role?: string; default?: string };
  captions?: { required: boolean; format?: string; precision?: string; default?: string };
}

export interface TemplateConfig {
  layout: TemplateLayout;
  assets: TemplateAssets;
  scenePlan: TemplateScenePlan;
  render: TemplateRender;
  providers: TemplateProviders;
  pipeline: { steps: Record<string, { enabled: boolean; required?: boolean }> };
}

export interface VideoTemplate extends VideoTemplateSummary {
  config: TemplateConfig;
}

export interface ChannelTemplateOverrides {
  layout?: Partial<TemplateLayout>;
  assets?: Partial<TemplateAssets>;
  scenePlan?: Partial<TemplateScenePlan>;
  render?: Partial<TemplateRender>;
  providers?: Partial<TemplateProviders>;
  pipeline?: { steps?: Record<string, Partial<{ enabled: boolean; required?: boolean }>> };
}

export interface ChannelTemplateAssignment {
  channelId: string;
  templateId: string;
  templateName: string;
  templateDescription: string;
  templateVersion: number;
  templateIsSystem: boolean;
  templateConfig: TemplateConfig;
  overrides: ChannelTemplateOverrides;
  isActive: boolean;
}

export interface Character {
  id: string;
  channelId: string;
  name: string;
  role: string;
  autoCreated: boolean;
  sourceRunId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CharacterVersion {
  id: string;
  characterId: string;
  version: number;
  bible: Record<string, unknown>;
  status: "draft" | "frozen" | "archived";
  createdAt: string;
  frozenAt: string | null;
}

export interface CharacterReference {
  id: string;
  characterVersionId: string;
  role: string;
  filePath: string;
  checksum: string;
  mimeType: string;
  width: number;
  height: number;
  createdAt: string;
}

export interface CharacterRosterEntry {
  characterId: string;
  name: string;
  role: string;
  bible: Record<string, unknown>;
  hasReferenceImages: boolean;
  frozenVersionId: string | null;
  autoCreated: boolean;
  isActive: boolean;
}

export interface CharacterWithChannels extends Character {
  channels: Array<{ id: string; name: string; slug: string; niche: string }>;
}

export interface CostSummary {
  totalCost: number;
  totalPaidCost: number;
  totalFreeCalls: number;
  totalPaidCalls: number;
  byProvider: Record<string, { cost: number; calls: number }>;
  byModel: Record<string, { cost: number; calls: number }>;
  byCapability: Record<string, { cost: number; calls: number }>;
  byRun: Record<string, { cost: number; calls: number }>;
}

export interface CostEntry {
  id: number;
  timestamp: string;
  runId: string | null;
  stepId: string | null;
  capability: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  imageCount: number;
  imageResolution: string | null;
  groundingQueries: number;
  inputCost: number;
  outputCost: number;
  imageCost: number;
  groundingCost: number;
  totalCost: number;
  isFree: boolean;
  notes: string | null;
}

export interface CostBudget {
  perRun: number;
  perDay: number;
  global: number;
}

export interface RunCostSummary {
  runId: string;
  totalCost: number;
  totalPaidCost: number;
  totalFreeCalls: number;
  totalPaidCalls: number;
  entryCount: number;
  byProvider: Record<string, { cost: number; calls: number }>;
  byModel: Record<string, { cost: number; calls: number }>;
  byCapability: Record<string, { cost: number; calls: number }>;
  byStep: Array<{
    stepId: string;
    capability: string;
    provider: string;
    model: string;
    cost: number;
    calls: number;
  }>;
}

export interface ListRunsParams {
  channelId?: string;
  search?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface ListRunsResult {
  runs: RunDetails[];
  total: number;
}

// === Paginated list types ===

export interface ListParams {
  search?: string;
  limit?: number;
  offset?: number;
  channelId?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
}

// === Gallery image (cross-story image list) ===

export interface GalleryImage {
  assetId: string;
  sceneId: string | null;
  storyId: string | null;
  order: number | null;
  type: string;
  filePath: string;
  mimeType: string;
  width: number;
  height: number;
  provider: string | null;
  model: string | null;
  costUsd: number | null;
  createdAt: string;
  narrationText: string | null;
}

// === Voiceover with story title (cross-story list) ===

export interface VoiceoverWithStory extends Voiceover {
  storyTitle?: string | null;
}

// === Workflow types ===

export type StepStatus = "pending" | "running" | "waiting_approval" | "completed" | "failed" | "skipped";
export type RunStatus = "pending" | "running" | "paused" | "completed" | "failed" | "cancelled";

export interface PipelineNode {
  type: string;
  label: string;
  requiresApproval: boolean;
  isPaid: boolean;
  service: string | null;
  dependsOn: string[];
  parallel?: boolean;
  maxRetries?: number;
  skippable?: boolean;
}

export interface RunStepAttempt {
  id: string;
  stepId: string;
  attemptNumber: number;
  status: "running" | "completed" | "failed";
  provider: string | null;
  model: string | null;
  remoteRequestId: string | null;
  costUsd: number | null;
  errorMessage: string | null;
  logs: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface RunStep {
  id: string;
  runId: string;
  stepType: string;
  label: string;
  status: StepStatus;
  stepData: Record<string, unknown>;
  resultData: Record<string, unknown> | null;
  provider: string | null;
  model: string | null;
  estimatedCostUsd: number | null;
  actualCostUsd: number | null;
  leaseExpiresAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  attempts: RunStepAttempt[];
  dependsOn: string[];
  isPaid: boolean;
  requiresApproval: boolean;
}

export interface RunApproval {
  id: string;
  runId: string;
  stepId: string;
  approvalType: string;
  status: "pending" | "approved" | "rejected";
  reviewer: string | null;
  notes: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface RunDetails {
  id: string;
  channelId: string;
  topic: string;
  contentType: string | null;
  status: RunStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  steps: RunStep[];
  approvals: RunApproval[];
  /** Total cost from the cost ledger (accurate, includes all paid calls). */
  totalCostUsd?: number;
}

export interface CreateRunInput {
  channelId: string;
  topic: string;
  contentType?: string;
  targetDurationSeconds?: number;
  emotionalDirection?: string;
  requiredIdeas?: string[];
  forbiddenIdeas?: string[];
  storyline?: string;
}

// === Story types ===

export type ContentType =
  | "fictional_story"
  | "psychology_concept_story"
  | "true_case"
  | "educational_explainer"
  | "listicle"
  | "commentary"
  | "historical_event"
  | "motivational"
  | "tutorial"
  | "documentary_style";

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  fictional_story: "Fictional Story",
  psychology_concept_story: "Psychology Concept Story",
  true_case: "True Case",
  educational_explainer: "Educational Explainer",
  listicle: "Listicle",
  commentary: "Commentary",
  historical_event: "Historical Event",
  motivational: "Motivational",
  tutorial: "Tutorial",
  documentary_style: "Documentary Style",
};

export interface StoryCandidate {
  title: string;
  hook: string;
  premise: string;
  storyline: string;
  contentType: ContentType;
  emotionalArc: string;
  corePsychologicalIdea: string;
  mainCharacterRole: string;
  keyEvents: string[];
  twistOrResolution: string;
  lessonOrTakeaway: string;
  fingerprint: string;
  sourceReferences?: string[];
  characters?: Array<{
    name: string;
    existingCharacterId: string | null;
    roleInStory: string;
  }>;
  newCharacters?: Array<{
    name: string;
    bible: Record<string, unknown>;
    roleInStory: string;
  }>;
}

export interface Story {
  id: string;
  channelId: string;
  runId: string;
  title: string;
  contentType: string;
  canonicalVersionId: string | null;
  characterVersionId: string | null;
  createdAt: string;
  approvedAt: string | null;
}

export interface StoryVersion {
  id: string;
  storyId: string;
  version: number;
  storyJson: StoryCandidate;
  createdAt: string;
}

export interface StoryDna {
  id: string;
  storyId: string;
  protagonistArchetype: string | null;
  protagonistGoal: string | null;
  incitingIncident: string | null;
  centralConflict: string | null;
  mainObstacle: string | null;
  reversalOrTwist: string | null;
  resolution: string | null;
  psychologicalMechanism: string | null;
  lesson: string | null;
  setting: string | null;
}

export interface StorySource {
  id: string;
  story_id: string;
  source_id: string;
  title: string;
  url: string | null;
  excerpt: string;
  created_at: string;
}

export interface StoryClaim {
  id: string;
  story_id: string;
  claim_id: string;
  claim: string;
  sourceIds: string[];
  confidence: string;
  created_at: string;
}

export interface DuplicateCheck {
  existingStoryId: string;
  existingTitle: string;
  exactMatch: boolean;
  lexicalScore: number;
  semanticScore: number;
  structuralScore: number;
  adjudication: string | null;
  classification: "duplicate" | "borderline" | "original";
}

export interface DuplicateResult {
  candidateIndex: number;
  candidateTitle: string;
  classification: "duplicate" | "borderline" | "original";
  checks: DuplicateCheck[];
  bestCandidate: boolean;
}

export interface ResearchOutput {
  sources: Array<{ id: string; title: string; url?: string; excerpt: string }>;
  claims: Array<{ id: string; claim: string; sourceIds: string[]; confidence: "high" | "medium" | "low" }>;
  uncertainties: string[];
  allowedFacts: string[];
  warnings: string[];
}

// === Scene / Image types ===

export interface Scene {
  id: string;
  story_id: string;
  order: number;
  story_purpose: string;
  narration_text: string;
  visual_event: string;
  character_role: string;
  pose_and_expression: string;
  environment: string;
  camera_framing: string;
  lighting_and_mood: string;
  expected_duration_seconds: number;
  image_requirement: string;
  source_claim_ids: string | null;
  created_at: string;
}

export interface ImagePrompt {
  id: string;
  scene_id: string;
  compiled_prompt: string;
  provider: string;
  model: string;
  prompt_hash: string;
  reference_ids: string;
  created_at: string;
}

export interface SceneImage {
  id: string;
  type: string; // "image", "image_accepted", "image_rejected"
  filePath: string;
  mimeType: string;
  width: number;
  height: number;
  checksum: string;
  provider: string;
  model: string;
  costUsd: number;
  createdAt: string;
}

// === Voice / Export types ===

export interface Voiceover {
  id: string;
  run_id: string;
  story_id: string;
  master_path: string;
  duration_ms: number;
  sample_rate: number;
  provider: string;
  model: string;
  voice_id: string;
  created_at: string;
}

export interface TimingRecord {
  id: string;
  scene_id: string;
  voiceover_id: string;
  narration_start_ms: number;
  narration_end_ms: number;
  recommended_image_start_ms: number;
  recommended_image_end_ms: number;
  audio_segment_file: string | null;
  narration_text: string;
  created_at: string;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  // Don't force Content-Type when sending FormData — the browser sets
  // multipart/form-data with the correct boundary automatically.
  const isFormData = options?.body instanceof FormData;
  const headers: Record<string, string> = { ...options?.headers as Record<string, string> };
  if (!isFormData && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(path, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface ProviderOption {
  id: string;
  label: string;
}
export interface ProviderModel {
  id: string;
  label: string;
}
export interface ProviderModels {
  id: string;
  label: string;
  models: ProviderModel[];
}
export interface LlmStepMeta {
  key: LlmStepKey;
  label: string;
  description: string;
  allowedProviders: string[];
}
export interface ProviderOptions {
  llm: { providers: ProviderModels[]; steps: LlmStepMeta[] };
  tts: { providers: ProviderModels[] }; // models field reused as voices
  image: { providers: ProviderModels[] };
  video?: { providers: ProviderModels[] };
}

export const api = {
  // Channels
  listChannels: () => apiFetch<{ channels: Channel[] }>("/api/channels").then((r) => r.channels),
  listChannelsPaginated: (params?: ListParams) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set("search", params.search);
    if (params?.limit !== undefined) qs.set("limit", String(params.limit));
    if (params?.offset !== undefined) qs.set("offset", String(params.offset));
    const s = qs.toString();
    return apiFetch<{ channels: Channel[]; total?: number }>(`/api/channels${s ? `?${s}` : ""}`).then((r) => ({
      items: r.channels,
      total: r.total ?? r.channels.length,
    }));
  },

  // Provider options (available LLM/TTS/image providers, models, voices)
  getProviders: () => apiFetch<ProviderOptions>("/api/providers"),

  // Dry-run status
  getDryRunStatus: () => apiFetch<{ dryRun: boolean; message: string }>("/api/dry-run"),
  getChannel: (id: string) => apiFetch<{ channel: Channel }>(`/api/channels/${id}`).then((r) => r.channel),
  createChannel: (data: Partial<Channel>) => apiFetch<{ channel: Channel }>("/api/channels", { method: "POST", body: JSON.stringify(data) }).then((r) => r.channel),
  updateChannel: (id: string, data: Partial<Channel>) => apiFetch<{ channel: Channel }>(`/api/channels/${id}`, { method: "PUT", body: JSON.stringify(data) }).then((r) => r.channel),
  deleteChannel: (id: string) => apiFetch<{ deleted: boolean }>(`/api/channels/${id}`, { method: "DELETE" }),

  // Video Templates
  listVideoTemplates: () => apiFetch<{ templates: VideoTemplateSummary[] }>("/api/video-templates").then((r) => r.templates),
  getVideoTemplate: (id: string) => apiFetch<VideoTemplate>(`/api/video-templates/${id}`),
  getChannelTemplate: (channelId: string) => apiFetch<ChannelTemplateAssignment>(`/api/channels/${channelId}/template`),
  assignChannelTemplate: (channelId: string, templateId: string, overrides: ChannelTemplateOverrides) =>
    apiFetch<{ channelId: string; templateId: string; overrides: ChannelTemplateOverrides }>(`/api/channels/${channelId}/template`, {
      method: "PUT",
      body: JSON.stringify({ templateId, overrides }),
    }),

  // Characters
  listCharacters: (channelId: string) => apiFetch<{ characters: Character[] }>(`/api/channels/${channelId}/characters`).then((r) => r.characters),
  listCharactersPaginated: (channelId: string, params?: ListParams) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set("search", params.search);
    if (params?.limit !== undefined) qs.set("limit", String(params.limit));
    if (params?.offset !== undefined) qs.set("offset", String(params.offset));
    const s = qs.toString();
    return apiFetch<{ characters: Character[]; total?: number }>(`/api/channels/${channelId}/characters${s ? `?${s}` : ""}`).then((r) => ({
      items: r.characters,
      total: r.total ?? r.characters.length,
    }));
  },
  getCharacter: (id: string) => apiFetch<{ character: Character; versions: CharacterVersion[] }>(`/api/characters/${id}`),
  createCharacter: (channelId: string, data: { name: string; role: string }) => apiFetch<{ character: Character }>(`/api/channels/${channelId}/characters`, { method: "POST", body: JSON.stringify(data) }).then((r) => r.character),
  updateCharacter: (id: string, data: Partial<Character>) => apiFetch<{ character: Character }>(`/api/characters/${id}`, { method: "PUT", body: JSON.stringify(data) }).then((r) => r.character),
  deleteCharacter: (id: string) => apiFetch<{ deleted: boolean }>(`/api/characters/${id}`, { method: "DELETE" }),

  // Global characters (Phase 7 — independent of channels)
  listAllCharacters: (params?: ListParams) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set("search", params.search);
    if (params?.limit !== undefined) qs.set("limit", String(params.limit));
    if (params?.offset !== undefined) qs.set("offset", String(params.offset));
    const s = qs.toString();
    return apiFetch<{ characters: CharacterWithChannels[]; total: number }>(`/api/characters${s ? `?${s}` : ""}`);
  },
  createGlobalCharacter: (data: { name: string; role: string; channelIds?: string[] }) =>
    apiFetch<{ character: Character }>("/api/characters", { method: "POST", body: JSON.stringify(data) }).then((r) => r.character),
  getCharacterChannels: (id: string) => apiFetch<{ channels: Array<{ id: string; name: string; slug: string; niche: string; added_at: string }> }>(`/api/characters/${id}/channels`).then((r) => r.channels),
  addCharacterToChannel: (channelId: string, characterId: string) =>
    apiFetch<{ success: boolean }>(`/api/channels/${channelId}/characters/${characterId}`, { method: "POST" }),
  removeCharacterFromChannel: (channelId: string, characterId: string) =>
    apiFetch<{ success: boolean }>(`/api/channels/${channelId}/characters/${characterId}`, { method: "DELETE" }),
  getChannelCharacterRoster: (channelId: string) => apiFetch<{ roster: CharacterRosterEntry[] }>(`/api/channels/${channelId}/character-roster`).then((r) => r.roster),

  // Character versions
  createVersion: (characterId: string, bible: Record<string, unknown>) => apiFetch<{ version: CharacterVersion }>(`/api/characters/${characterId}/versions`, { method: "POST", body: JSON.stringify({ bible }) }).then((r) => r.version),
  freezeVersion: (versionId: string) => apiFetch<{ version: CharacterVersion }>(`/api/character-versions/${versionId}/freeze`, { method: "POST" }).then((r) => r.version),
  updateVersion: (versionId: string, bible: Record<string, unknown>) =>
    apiFetch<{ version: CharacterVersion }>(`/api/character-versions/${versionId}`, { method: "PUT", body: JSON.stringify({ bible }) }).then((r) => r.version),
  deleteVersion: (versionId: string) => apiFetch<{ deleted: boolean }>(`/api/character-versions/${versionId}`, { method: "DELETE" }),

  // Character references
  listReferences: (versionId: string) => apiFetch<{ references: CharacterReference[] }>(`/api/character-versions/${versionId}/references`).then((r) => r.references),
  uploadReference: (versionId: string, file: File, role: string) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("role", role);
    return apiFetch<{ reference: CharacterReference }>(`/api/character-versions/${versionId}/references`, { method: "POST", body: formData }).then((r) => r.reference);
  },
  deleteReference: (id: string) => apiFetch<{ deleted: boolean }>(`/api/references/${id}`, { method: "DELETE" }),
  referenceFileUrl: (id: string) => `/api/character-references/${id}/file`,

  // Character version detail (with references)
  getCharacterVersion: (id: string) => apiFetch<{ version: CharacterVersion; references: CharacterReference[] }>(`/api/character-versions/${id}`),

  // Toggle channel active character (multi-active: a channel can have multiple active characters)
  toggleChannelCharacter: (channelId: string, characterId: string, active: boolean) =>
    apiFetch<{ channel: Channel }>(`/api/channels/${channelId}/active-character`, { method: "PUT", body: JSON.stringify({ characterId, active }) }).then((r) => r.channel),

  // Legacy: set channel active character version (single — delegates to toggle with characterId)
  setActiveCharacterVersion: (channelId: string, characterVersionId: string | null) =>
    apiFetch<{ channel: Channel }>(`/api/channels/${channelId}/active-character`, { method: "PUT", body: JSON.stringify({ characterVersionId }) }).then((r) => r.channel),

  // Cost
  getCostSummary: () => apiFetch<{ summary: CostSummary }>("/api/cost/summary").then((r) => r.summary),
  getCostBudget: () => apiFetch<CostBudget>("/api/cost/budget"),
  getRecentCostEntries: (limit = 20) => apiFetch<{ entries: CostEntry[] }>(`/api/cost/recent?limit=${limit}`).then((r) => r.entries),
  getCostEntriesPaginated: (params?: {
    limit?: number;
    offset?: number;
    search?: string;
    capability?: string;
    provider?: string;
    runId?: string;
    isFree?: boolean;
  }) => {
    const qs = new URLSearchParams();
    if (params?.limit !== undefined) qs.set("limit", String(params.limit));
    if (params?.offset !== undefined) qs.set("offset", String(params.offset));
    if (params?.search) qs.set("search", params.search);
    if (params?.capability) qs.set("capability", params.capability);
    if (params?.provider) qs.set("provider", params.provider);
    if (params?.runId) qs.set("runId", params.runId);
    if (params?.isFree !== undefined) qs.set("isFree", String(params.isFree));
    const s = qs.toString();
    return apiFetch<{ entries: CostEntry[]; total: number }>(`/api/cost/entries${s ? `?${s}` : ""}`);
  },
  getCostFilterValues: (column: "capability" | "provider" | "model") =>
    apiFetch<{ values: string[] }>(`/api/cost/filters?column=${column}`).then((r) => r.values),
  getRunCost: (runId: string) => apiFetch<{ runId: string; totalCost: number; entryCount: number; entries: CostEntry[] }>(`/api/cost/run/${runId}`),
  getRunCostSummary: (runId: string) => apiFetch<{ summary: RunCostSummary }>(`/api/cost/run/${runId}/summary`).then((r) => r.summary),

  // Workflow
  getPipeline: () => apiFetch<{ graph: PipelineNode[] }>("/api/workflow/pipeline").then((r) => r.graph),
  listRuns: (params?: string | ListRunsParams) => {
    let url = "/api/workflow/runs";
    if (typeof params === "string") {
      // Legacy: channelId string
      if (params) url += `?channelId=${encodeURIComponent(params)}`;
    } else if (params) {
      const qs = new URLSearchParams();
      if (params.channelId) qs.set("channelId", params.channelId);
      if (params.search) qs.set("search", params.search);
      if (params.status) qs.set("status", params.status);
      if (params.limit !== undefined) qs.set("limit", String(params.limit));
      if (params.offset !== undefined) qs.set("offset", String(params.offset));
      const s = qs.toString();
      if (s) url += `?${s}`;
    }
    return apiFetch<{ runs: RunDetails[]; total?: number }>(url).then((r) => ({
      runs: r.runs,
      total: r.total ?? r.runs.length,
    }));
  },
  getRun: (id: string) => apiFetch<{ run: RunDetails }>(`/api/workflow/runs/${id}`).then((r) => r.run),
  createRun: (data: CreateRunInput) => apiFetch<{ run: RunDetails }>("/api/workflow/runs", { method: "POST", body: JSON.stringify(data) }).then((r) => r.run),
  cancelRun: (id: string) => apiFetch<{ run: RunDetails }>(`/api/workflow/runs/${id}/cancel`, { method: "POST" }).then((r) => r.run),
  rerunStep: (runId: string, stepId: string, cascade: boolean) =>
    apiFetch<{ run: RunDetails }>(`/api/workflow/runs/${runId}/steps/${stepId}/rerun`, { method: "POST", body: JSON.stringify({ cascade }) }).then((r) => r.run),
  submitApproval: (approvalId: string, decision: "approved" | "rejected", notes?: string, editedData?: Record<string, unknown>) =>
    apiFetch<{ run: RunDetails }>("/api/workflow/approvals", { method: "POST", body: JSON.stringify({ approvalId, decision, notes, editedData }) }).then((r) => r.run),
  getPendingApprovals: (runId: string) => apiFetch<{ approvals: RunApproval[] }>(`/api/workflow/runs/${runId}/approvals`).then((r) => r.approvals),

  // Stories
  listStories: (channelId?: string) => apiFetch<{ stories: Story[] }>(channelId ? `/api/story/stories?channelId=${channelId}` : "/api/story/stories").then((r) => r.stories),
  listStoriesPaginated: (params?: ListParams) => {
    const qs = new URLSearchParams();
    if (params?.channelId) qs.set("channelId", params.channelId);
    if (params?.search) qs.set("search", params.search);
    if (params?.limit !== undefined) qs.set("limit", String(params.limit));
    if (params?.offset !== undefined) qs.set("offset", String(params.offset));
    const s = qs.toString();
    return apiFetch<{ stories: Story[]; total?: number }>(`/api/story/stories${s ? `?${s}` : ""}`).then((r) => ({
      items: r.stories,
      total: r.total ?? r.stories.length,
    }));
  },
  getStory: (id: string) => apiFetch<{ story: Story; version: StoryVersion | null; dna: StoryDna | null; sources: StorySource[]; claims: StoryClaim[] }>(`/api/story/stories/${id}`),
  classifyContent: (topic: string, channelId?: string) => apiFetch<{ contentType: string; reasoning: string }>("/api/story/classify", { method: "POST", body: JSON.stringify({ topic, channelId }) }),
  generateCandidates: (data: {
    channel: string;
    topic: string;
    contentType?: string;
    targetDurationSeconds?: number;
    emotionalDirection?: string;
    requiredIdeas?: string[];
    forbiddenIdeas?: string[];
    noveltyContext?: string;
    candidateCount?: number;
    research?: ResearchOutput;
  }) =>
    apiFetch<{ candidates: StoryCandidate[] }>("/api/story/generate", { method: "POST", body: JSON.stringify(data) }).then((r) => r.candidates),
  runDuplicateDetection: (data: { channelId: string; runId: string; candidates: StoryCandidate[] }) =>
    apiFetch<{ results: DuplicateResult[] }>("/api/story/duplicates", { method: "POST", body: JSON.stringify(data) }).then((r) => r.results),
  getNoveltyContext: (channelId: string, topic: string) =>
    apiFetch<{ noveltyContext: string; nearestStories: Array<{ id: string; title: string; similarity: number }> }>("/api/story/novelty", { method: "POST", body: JSON.stringify({ channelId, topic }) }),
  freezeStoryVersion: (data: { runId: string; channelId: string; candidate: StoryCandidate; research?: unknown; characterVersionId?: string }) =>
    apiFetch<{ storyId: string; versionId: string }>("/api/story/version", { method: "POST", body: JSON.stringify(data) }),

  // Research
  performResearch: (data: { channelId?: string; topic: string; contentType: string; requiredIdeas?: string[]; forbiddenIdeas?: string[] }) =>
    apiFetch<ResearchOutput>("/api/research/research", { method: "POST", body: JSON.stringify(data) }),

  // Embedding
  getEmbeddingModel: () => apiFetch<{ model: string; dimensions: number; loaded: boolean }>("/api/embedding/model"),
  computeSimilarity: (textA: string, textB: string) =>
    apiFetch<{ score: number; model: string; dimensions: number }>("/api/embedding/similarity", { method: "POST", body: JSON.stringify({ textA, textB }) }),

  // Image / Scenes
  planScenes: (storyId: string) =>
    apiFetch<{ storyId: string; sceneCount: number; scenes: Array<{ id: string; order: number }> }>("/api/image/scene-plan", { method: "POST", body: JSON.stringify({ storyId }) }),
  compilePrompt: (sceneId: string, aspectRatio = "9:16") =>
    apiFetch<{ promptId: string; prompt: string; isCharacterScene: boolean; model: string; referenceIds: string[]; promptHash: string }>("/api/image/compile-prompt", { method: "POST", body: JSON.stringify({ sceneId, aspectRatio }) }),
  generateImage: (sceneId: string, aspectRatio = "9:16", customPrompt?: string) =>
    apiFetch<{ assetId: string; sceneId: string; filePath: string; mimeType: string; width: number; height: number; checksum: string; costUsd: number; model: string; isCharacterScene: boolean; validation: { valid: boolean; errors: string[] } }>("/api/image/generate", { method: "POST", body: JSON.stringify({ sceneId, aspectRatio, customPrompt }) }),
  generateBatch: (storyId: string) =>
    apiFetch<{ storyId: string; generated: number; errors: Array<{ sceneId: string; order: number; error: string }>; results: Array<Record<string, unknown>> }>("/api/image/generate-batch", { method: "POST", body: JSON.stringify({ storyId }) }),
  acceptImage: (assetId: string) =>
    apiFetch<{ assetId: string; status: string; filePath: string }>("/api/image/accept", { method: "POST", body: JSON.stringify({ assetId }) }),
  rejectImage: (assetId: string, reason?: string) =>
    apiFetch<{ assetId: string; status: string; reason: string | null; filePath: string }>("/api/image/reject", { method: "POST", body: JSON.stringify({ assetId, reason }) }),
  getFlowPrompts: (storyId: string, aspectRatio = "9:16") =>
    apiFetch<{ storyId: string; aspectRatio: string; prompts: Array<{ sceneId: string; order: number; prompt: string; expectedFilename: string; isCharacterScene: boolean; model: string }> }>("/api/image/flow-prompts", { method: "POST", body: JSON.stringify({ storyId, aspectRatio }) }),
  listScenes: (storyId: string) => apiFetch<{ scenes: Scene[] }>(`/api/image/scenes/${storyId}`).then((r) => r.scenes),
  getAcceptedImages: (storyId: string) =>
    apiFetch<{ storyId: string; images: Array<{ assetId: string; sceneId: string; order: number; filePath: string; mimeType: string; width: number; height: number; checksum: string; provider: string; model: string; costUsd: number; isCharacterScene: boolean; createdAt: string }> }>(`/api/image/scenes/${storyId}/accepted-images`).then((r) => r.images),
  getScene: (id: string) => apiFetch<{ scene: Scene; prompts: ImagePrompt[] }>(`/api/image/scene/${id}`),
  listImages: (sceneId: string) => apiFetch<{ images: SceneImage[] }>(`/api/image/images/${sceneId}`).then((r) => r.images),
  assetUrl: (assetId: string) => `/api/image/asset/${assetId}`,

  // Image gallery (cross-story, paginated)
  listImageGallery: (params?: ListParams) => {
    const qs = new URLSearchParams();
    if (params?.channelId) qs.set("channelId", params.channelId);
    if (params?.search) qs.set("search", params.search);
    if (params?.limit !== undefined) qs.set("limit", String(params.limit));
    if (params?.offset !== undefined) qs.set("offset", String(params.offset));
    const s = qs.toString();
    return apiFetch<{ images: GalleryImage[]; total: number }>(`/api/image/gallery${s ? `?${s}` : ""}`).then((r) => ({
      items: r.images,
      total: r.total,
    }));
  },

  // Voice / Export
  synthesize: (storyId: string, provider?: "kokoro" | "gemini" | "auto") =>
    apiFetch<{ voiceoverId: string; durationMs: number; durationSec: string; provider: string; model: string; voiceId: string; costUsd: number; sceneCount: number; timings: Array<{ sceneId: string; order: number; startMs: number; endMs: number; durationMs: number }>; warning: string | null }>("/api/voice/synthesize", { method: "POST", body: JSON.stringify({ storyId, provider: provider ?? "auto" }) }),
  cutGameplay: (voiceoverId: string, runId?: string) =>
    apiFetch<{ assetId: string; voiceoverId: string; gameplayVideo: { sourceFile: string; startSec: string; durationSec: string; muted: boolean; filePath: string } }>("/api/voice/gameplay-cut", { method: "POST", body: JSON.stringify({ voiceoverId, runId }) }),
  assemblePackage: (runId: string, storyId: string, includeGameplay = true) =>
    apiFetch<{ runId: string; storyId: string; packagePath: string; packageDir: string; files: string[]; manifest: Record<string, unknown> }>("/api/voice/package", { method: "POST", body: JSON.stringify({ runId, storyId, includeGameplay }) }),
  listVoiceovers: (storyId: string) => apiFetch<{ voiceovers: Voiceover[] }>(`/api/voice/voiceovers/${storyId}`).then((r) => r.voiceovers),
  listAllVoiceovers: (params?: ListParams) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set("search", params.search);
    if (params?.limit !== undefined) qs.set("limit", String(params.limit));
    if (params?.offset !== undefined) qs.set("offset", String(params.offset));
    const s = qs.toString();
    return apiFetch<{ voiceovers: VoiceoverWithStory[]; total: number }>(`/api/voice/voiceovers${s ? `?${s}` : ""}`).then((r) => ({
      items: r.voiceovers,
      total: r.total,
    }));
  },
  getVoiceover: (id: string) => apiFetch<{ voiceover: Voiceover; timings: Array<TimingRecord & { scene_order: number }> }>(`/api/voice/voiceover/${id}`),
  voiceoverAudioUrl: (voiceoverId: string) => `/api/voice/audio/${voiceoverId}.wav`,
  gameplayVideos: () => apiFetch<{ videos: string[]; path: string }>("/api/voice/gameplay-videos"),
  downloadPackageUrl: (runId: string) => `/api/voice/download/${runId}`,

  // Video
  videoStreamUrl: (runId: string) => `/api/video/video/${runId}.mp4`,
  videoDownloadUrl: (runId: string) => `/api/video/download/${runId}`,
};
