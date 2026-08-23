// === Row parsers (convert DB rows to API-friendly JSON) ===

import type {
  ChannelRow,
  CharacterRow,
  CharacterVersionRow,
  CharacterReferenceRow,
} from "@automation/database";

export function parseChannelRow(
  row: ChannelRow,
  activeCharacterIds?: string[],
) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    niche: row.niche,
    locale: row.locale,
    contentTypes: JSON.parse(row.content_types) as string[],
    targetDurationSeconds: row.target_duration_seconds,
    sceneMin: row.scene_min,
    sceneMax: row.scene_max,
    storyStyle: row.story_style,
    visualStyle: row.visual_style,
    activeCharacterVersionId: row.active_character_version_id,
    activeCharacterIds: activeCharacterIds ?? [],
    imageProvider: row.image_provider,
    ttsProvider: row.tts_provider,
    ttsVoiceId: row.tts_voice_id,
    aspectRatio: row.aspect_ratio,
    approvalEnabled: row.approval_enabled === 1,
    llmConfig: row.llm_config ? JSON.parse(row.llm_config) : null,
    imageModelCharacter: row.image_model_character,
    imageModelNonCharacter: row.image_model_non_character,
    researchEnabled: row.research_enabled === 1,
    duplicateAdjudicationEnabled: row.duplicate_adjudication_enabled === 1,
    videoGenerationEnabled: row.video_generation_enabled === 1,
    videoTemplate: row.video_template,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function parseCharacterRow(row: CharacterRow) {
  return {
    id: row.id,
    channelId: row.channel_id,
    name: row.name,
    role: row.role,
    autoCreated: row.auto_created === 1,
    sourceRunId: row.source_run_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function parseCharacterVersionRow(row: CharacterVersionRow) {
  return {
    id: row.id,
    characterId: row.character_id,
    version: row.version,
    bible: JSON.parse(row.bible),
    status: row.status,
    createdAt: row.created_at,
    frozenAt: row.frozen_at,
  };
}

export function parseCharacterReferenceRow(row: CharacterReferenceRow) {
  return {
    id: row.id,
    characterVersionId: row.character_version_id,
    role: row.role,
    filePath: row.file_path,
    checksum: row.checksum,
    mimeType: row.mime_type,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
  };
}
