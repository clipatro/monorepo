import type { StoryRow, StoryDnaRow } from "@automation/database";

// === Row parsers ===

function parseStoryRow(row: StoryRow) {
  return {
    id: row.id,
    channelId: row.channel_id,
    runId: row.run_id,
    title: row.title,
    contentType: row.content_type,
    canonicalVersionId: row.canonical_version_id,
    characterVersionId: row.character_version_id,
    createdAt: row.created_at,
    approvedAt: row.approved_at,
  };
}

function parseDnaRow(row: StoryDnaRow) {
  return {
    id: row.id,
    storyId: row.story_id,
    protagonistArchetype: row.protagonist_archetype,
    protagonistGoal: row.protagonist_goal,
    incitingIncident: row.inciting_incident,
    centralConflict: row.central_conflict,
    mainObstacle: row.main_obstacle,
    reversalOrTwist: row.reversal_or_twist,
    resolution: row.resolution,
    psychologicalMechanism: row.psychological_mechanism,
    lesson: row.lesson,
    setting: row.setting,
  };
}

export { parseStoryRow, parseDnaRow };
