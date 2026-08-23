import { getDb } from "@automation/database";

// === Helper: generate UUID ===

export function uuid(): string {
  return crypto.randomUUID();
}

// === Helper: slugify ===

export function slugify(text: string): string {
  return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Small helper to load config without circular import
export function loadConfigSafe() {
  // Lazy import to avoid circular dependency
  return {
    artifactStorePath: process.env.ARTIFACT_STORE_PATH ?? "./data/artifacts",
  };
}

// === Helper: get active character IDs for a channel from the junction table ===

export async function getActiveCharacterIds(channelId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .prepare(
      "SELECT character_id FROM channel_characters WHERE channel_id = ? AND is_active = 1 ORDER BY added_at ASC",
    )
    .all(channelId) as Array<{ character_id: string }>;
  return rows.map((r) => r.character_id);
}

// === Helper: get active character version IDs for a channel ===
// Returns the frozen version ID for each active character in the channel.

export async function getActiveCharacterVersionIds(channelId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .prepare(
      `SELECT cv.id as version_id
       FROM channel_characters cc
       JOIN character_versions cv ON cv.character_id = cc.character_id
       WHERE cc.channel_id = ? AND cc.is_active = 1 AND cv.status = 'frozen'
       ORDER BY cc.added_at ASC`,
    )
    .all(channelId) as Array<{ version_id: string }>;
  return rows.map((r) => r.version_id);
}
