/**
 * Schema type definitions — TypeScript interfaces matching the SQLite tables.
 *
 * These are row shapes for type-safe queries. The actual table creation
 * happens in the migration SQL files.
 */

// === Channel and configuration ===

export interface ChannelRow {
  id: string;
  name: string;
  slug: string;
  niche: string;
  locale: string;
  content_types: string; // JSON array of ContentType
  target_duration_seconds: number;
  scene_min: number;
  scene_max: number;
  story_style: string;
  visual_style: string;
  safety_rules: string; // JSON
  active_character_version_id: string | null;
  image_provider: string;
  tts_provider: string;
  tts_voice_id: string;
  aspect_ratio: string; // e.g. "9:16", "16:9", "1:1", "4:5"
  similarity_policy: string; // JSON
  approval_enabled: number; // 1 = require human approval, 0 = auto-approve
  llm_config: string | null; // JSON: per-step { provider, model } overrides, NULL = use env
  image_model_character: string | null; // per-channel character image model, NULL = use env/default
  image_model_non_character: string | null; // per-channel non-character image model, NULL = use env/default
  research_enabled: number; // 1 = run research step, 0 = skip (saves ~$0.086/run)
  duplicate_adjudication_enabled: number; // 1 = use Gemini for borderline, 0 = skip (saves ~$0.02/run)
  video_generation_enabled: number; // 1 = render MP4 after package assembly, 0 = skip
  video_template: string; // D016: video assembly template (default: "gameplay-with-image-scenes")
  background_audio_path: string | null; // D020: path to background audio file in artifact store
  // Phase 9 — Google Flow Templates (D021)
  flow_project_url: string | null; // D021: Google Flow project URL for auto generation
  flow_cdp_endpoint: string | null; // D021: CDP endpoint (default http://127.0.0.1:9222)
  flow_inter_request_delay_ms: number; // D021: inter-request delay in ms (default 5000)
  created_at: string;
  updated_at: string;
}

export interface ChannelVersionRow {
  id: string;
  channel_id: string;
  version: number;
  snapshot: string; // JSON snapshot of channel config
  created_at: string;
}

export interface ChannelProviderSettingsRow {
  id: string;
  channel_id: string;
  capability: string; // "story", "research", "image", "voice", "embedding"
  provider: string;
  model: string;
  config: string; // JSON
  created_at: string;
  updated_at: string;
}

export interface ChannelStyleProfileRow {
  id: string;
  channel_id: string;
  name: string;
  realistic_prompt_block: string | null;
  visual_style_block: string | null;
  negative_constraints: string | null; // JSON array
  created_at: string;
  updated_at: string;
}

// === Video templates (D017) ===

export interface VideoTemplateRow {
  id: string;
  name: string;
  description: string;
  version: number;
  config: string; // JSON: full TemplateConfig
  is_system: number; // 1 = seeded built-in, 0 = user-created
  created_at: string;
  updated_at: string;
}

export interface ChannelTemplateRow {
  id: string;
  channel_id: string;
  template_id: string;
  config: string; // JSON: per-channel overrides (ChannelTemplateOverrides)
  is_active: number; // 1 = active
  created_at: string;
  updated_at: string;
}

// === Character data ===

export interface CharacterRow {
  id: string;
  channel_id: string; // Legacy: kept for backward compat, new code uses channel_characters junction
  name: string;
  role: string;
  auto_created: number; // 1 = auto-created by the LLM during story generation
  source_run_id: string | null; // workflow_runs.id that auto-created this character
  created_at: string;
  updated_at: string;
}

export interface CharacterVersionRow {
  id: string;
  character_id: string;
  version: number;
  bible: string; // JSON: immutable identity attributes
  status: "draft" | "frozen" | "archived";
  created_at: string;
  frozen_at: string | null;
}

export interface CharacterReferenceRow {
  id: string;
  character_version_id: string;
  role: string; // "front", "three-quarter", "side", "expression", etc.
  file_path: string;
  checksum: string;
  mime_type: string;
  width: number;
  height: number;
  created_at: string;
}

// === Channel-character junction (many-to-many) ===

export interface ChannelCharacterRow {
  id: string;
  channel_id: string;
  character_id: string;
  added_at: string;
  is_active: number; // 1 = active for this channel, 0 = not active
}

// === Scene-character assignments (multi-character per scene) ===

export interface SceneCharacterRow {
  id: string;
  scene_id: string;
  character_version_id: string | null;
  character_name: string;
  role_in_scene: string; // "protagonist", "supporting", "none"
  pose_and_expression: string;
  order: number;
  created_at: string;
}

// === Story data ===

export interface StoryCandidateRow {
  id: string;
  run_id: string;
  channel_id: string;
  candidate_json: string; // JSON: StoryCandidate
  fingerprint: string;
  character_context: string | null; // JSON: character assignments + new character bibles
  created_at: string;
}

export interface StoryRow {
  id: string;
  channel_id: string;
  run_id: string;
  title: string;
  content_type: string;
  canonical_version_id: string | null;
  character_version_id: string | null;
  characters_json: string | null; // JSON: character assignments for this story
  created_at: string;
  approved_at: string | null;
}

export interface StoryVersionRow {
  id: string;
  story_id: string;
  version: number;
  story_json: string; // JSON: full story data
  created_at: string;
}

export interface StorySourceRow {
  id: string;
  story_id: string;
  source_id: string;
  title: string;
  url: string | null;
  excerpt: string;
  created_at: string;
}

export interface StoryClaimRow {
  id: string;
  story_id: string;
  claim_id: string;
  claim: string;
  source_ids: string; // JSON array
  confidence: string;
  created_at: string;
}

export interface StoryEmbeddingRow {
  id: string;
  story_id: string;
  field_name: string; // "title", "premise", "synopsis", "full_story", "fingerprint"
  embedding: string; // JSON array of numbers
  model: string;
  model_version: string;
  dimensions: number;
  created_at: string;
}

export interface SimilarityCheckRow {
  id: string;
  candidate_id: string;
  existing_story_id: string;
  exact_match: number; // boolean as 0/1
  lexical_score: number;
  semantic_score: number;
  structural_score: number;
  adjudication_json: string | null; // JSON: Gemini adjudication result
  final_classification: string; // "duplicate", "borderline", "original"
  created_at: string;
}

export interface StoryDnaRow {
  id: string;
  story_id: string;
  protagonist_archetype: string | null;
  protagonist_goal: string | null;
  inciting_incident: string | null;
  central_conflict: string | null;
  main_obstacle: string | null;
  reversal_or_twist: string | null;
  resolution: string | null;
  psychological_mechanism: string | null;
  lesson: string | null;
  setting: string | null;
  created_at: string;
}

// === Production data ===

export interface SceneRow {
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
  source_claim_ids: string | null; // JSON array
  media_type: string; // D021: "video-clip" or "image" (for flow-hybrid scenes)
  created_at: string;
}

export interface NarrationSegmentRow {
  id: string;
  scene_id: string;
  order: number;
  text: string;
  created_at: string;
}

export interface ImagePromptRow {
  id: string;
  scene_id: string;
  compiled_prompt: string;
  provider: string;
  model: string;
  prompt_hash: string;
  reference_ids: string; // JSON array of character reference ids
  created_at: string;
}

export interface AssetRow {
  id: string;
  channel_id: string;
  run_id: string;
  scene_id: string | null;
  type: string; // "image", "audio", "srt", "manifest"
  file_path: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  checksum: string;
  provider: string | null;
  model: string | null;
  remote_request_id: string | null;
  cost_usd: number | null;
  created_at: string;
}

export interface VoiceoverRow {
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

export interface TimingRow {
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

export interface CaptionRow {
  id: string;
  voiceover_id: string;
  format: string; // "srt"
  precision: string; // "scene-level" | "word-level"
  file_path: string;
  created_at: string;
}

// === Workflow data ===

export interface WorkflowRunRow {
  id: string;
  channel_id: string;
  topic: string;
  content_type: string | null;
  storyline: string | null; // optional storyline provided at run creation
  status: "pending" | "running" | "paused" | "completed" | "failed" | "cancelled";
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface WorkflowStepRow {
  id: string;
  run_id: string;
  step_type: string;
  status: "pending" | "running" | "waiting_approval" | "completed" | "failed" | "skipped";
  step_data: string; // JSON
  result_data: string | null; // JSON
  provider: string | null;
  model: string | null;
  estimated_cost_usd: number | null;
  actual_cost_usd: number | null;
  lease_expires_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface WorkflowStepAttemptRow {
  id: string;
  step_id: string;
  attempt_number: number;
  status: "running" | "completed" | "failed";
  provider: string | null;
  model: string | null;
  remote_request_id: string | null;
  cost_usd: number | null;
  error_message: string | null;
  logs: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface WorkflowEventRow {
  id: string;
  run_id: string;
  step_id: string | null;
  event_type: string;
  payload: string; // JSON
  created_at: string;
}

export interface ApprovalRow {
  id: string;
  run_id: string;
  step_id: string;
  approval_type: string; // "story", "script", "image", "budget"
  status: "pending" | "approved" | "rejected";
  reviewer: string | null;
  notes: string | null;
  created_at: string;
  decided_at: string | null;
}

// === Provider usage (cost ledger integration) ===

export interface ProviderUsageRow {
  id: string;
  run_id: string | null;
  step_id: string | null;
  channel_id: string | null;
  capability: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  image_count: number;
  image_resolution: string | null;
  grounding_queries: number;
  cost_usd: number;
  is_free: number; // boolean as 0/1
  created_at: string;
}
