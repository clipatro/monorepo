/**
 * Character context builder — constructs the channel's character roster
 * and detects character names mentioned in topic/storyline/niche text.
 *
 * Used by the story generation prompt to make the LLM context-aware:
 * it knows which characters are available, their personalities and
 * relationships, and which ones the user explicitly mentioned.
 */

import { getDb } from "@automation/database";
import type {
  CharacterRow,
  CharacterVersionRow,
  CharacterReferenceRow,
  ChannelCharacterRow,
} from "@automation/database";
import type { CharacterBible, CharacterRosterEntry } from "@automation/contracts";

// === Roster building ===

/**
 * Build the channel's character roster from the channel_characters junction table.
 * Falls back to the legacy characters.channel_id FK if no junction entries exist.
 *
 * Returns an array of CharacterRosterEntry with bibles parsed from frozen
 * (or latest) character versions.
 */
export async function getChannelCharacterRoster(channelId: string): Promise<CharacterRosterEntry[]> {
  const db = getDb();

  // Get character IDs from the junction table
  let characterIdRows: Array<{ character_id: string }> = (await db.prepare(
    "SELECT character_id FROM channel_characters WHERE channel_id = ? ORDER BY added_at ASC",
  ).all(channelId)) as Array<{ character_id: string }>;

  // Fallback: if no junction entries, use legacy channel_id FK
  if (characterIdRows.length === 0) {
    const legacy = (await db.prepare(
      "SELECT id FROM characters WHERE channel_id = ? ORDER BY created_at ASC",
    ).all(channelId)) as Array<{ id: string }>;
    characterIdRows = legacy.map((r) => ({ character_id: r.id }));
  }

  if (characterIdRows.length === 0) return [];

  const roster: CharacterRosterEntry[] = [];

  for (const { character_id } of characterIdRows) {
    const char = (await db.prepare("SELECT * FROM characters WHERE id = ?").get(character_id)) as CharacterRow | null;
    if (!char) continue;

    // Get the frozen version, or fall back to the latest version
    const frozenVersion = (await db.prepare(
      "SELECT * FROM character_versions WHERE character_id = ? AND status = 'frozen' ORDER BY version DESC LIMIT 1",
    ).get(character_id)) as CharacterVersionRow | null;

    const latestVersion = frozenVersion ?? (await db.prepare(
      "SELECT * FROM character_versions WHERE character_id = ? ORDER BY version DESC LIMIT 1",
    ).get(character_id)) as CharacterVersionRow | null;

    if (!latestVersion) continue;

    // Parse the bible
    let bible: CharacterBible;
    try {
      bible = JSON.parse(latestVersion.bible) as CharacterBible;
    } catch {
      bible = { name: char.name };
    }

    // Ensure name is set
    if (!bible.name || typeof bible.name !== "string") {
      bible.name = char.name;
    }

    // Check for reference images
    const refCount = (await db.prepare(
      "SELECT COUNT(*) as count FROM character_references WHERE character_version_id = ?",
    ).get(latestVersion.id)) as { count: number };

    roster.push({
      characterId: char.id,
      name: char.name,
      role: char.role,
      bible,
      hasReferenceImages: refCount.count > 0,
      frozenVersionId: frozenVersion?.id ?? null,
      autoCreated: char.auto_created === 1,
    });
  }

  return roster;
}

// === Name detection ===

/**
 * Detect character names mentioned in the given text.
 * Uses case-insensitive whole-word matching against the roster.
 *
 * Also checks for aliases/nicknames stored in the bible (if present).
 *
 * Returns the matched roster entries.
 */
export function detectMentionedCharacters(
  text: string,
  roster: CharacterRosterEntry[],
): CharacterRosterEntry[] {
  if (!text || roster.length === 0) return [];

  const lowerText = text.toLowerCase();
  const matched = new Set<string>();
  const result: CharacterRosterEntry[] = [];

  for (const entry of roster) {
    const names = collectCharacterNames(entry);
    for (const name of names) {
      // Whole-word, case-insensitive match
      const pattern = new RegExp(`\\b${escapeRegex(name.toLowerCase())}\\b`, "i");
      if (pattern.test(lowerText)) {
        if (!matched.has(entry.characterId)) {
          matched.add(entry.characterId);
          result.push(entry);
        }
        break;
      }
    }
  }

  return result;
}

/**
 * Collect all names/aliases for a character that could appear in text.
 * Includes the primary name and any aliases from the bible.
 */
function collectCharacterNames(entry: CharacterRosterEntry): string[] {
  const names: string[] = [entry.name];

  // Check for aliases in bible (future: structured field)
  // For now, just use the name
  const bible = entry.bible;
  if (bible && typeof bible === "object") {
    // If there's a "nicknames" or "aliases" field, add those
    const aliases = (bible as unknown as Record<string, unknown>).aliases;
    if (Array.isArray(aliases)) {
      for (const alias of aliases) {
        if (typeof alias === "string" && alias.trim()) {
          names.push(alias.trim());
        }
      }
    }
  }

  return names.filter((n) => n && n.trim().length > 0);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// === Prompt building ===

/**
 * Build the character context section for the story generation prompt.
 *
 * Includes:
 * - The channel's full character roster with bibles
 * - Which characters were detected in the topic/storyline/niche
 * - Instructions for using existing vs creating new characters
 */
export function buildCharacterContextPrompt(
  roster: CharacterRosterEntry[],
  mentioned: CharacterRosterEntry[],
  hasStoryline: boolean,
): string {
  if (roster.length === 0) {
    return `CHARACTER CONTEXT:
No characters are currently associated with this channel. If the story would benefit from recurring characters, create them with full character bibles (name, age, gender, appearance, personality, background, relationships, speakingStyle, role). New characters will be automatically added to the channel for future stories.`;
  }

  const rosterLines = roster.map((entry) => {
    const bible = entry.bible;
    const parts: string[] = [entry.name];

    if (bible.age) parts.push(`${bible.age} years old`);
    if (bible.gender) parts.push(bible.gender);
    if (bible.personality) parts.push(`personality: ${bible.personality}`);
    if (bible.background) parts.push(`background: ${bible.background}`);

    // Relationships
    if (bible.relationships && Object.keys(bible.relationships).length > 0) {
      const rels = Object.entries(bible.relationships)
        .map(([name, rel]) => `${name} (${rel})`)
        .join(", ");
      parts.push(`relationships: ${rels}`);
    }

    if (bible.storyArc) parts.push(`arc: ${bible.storyArc}`);
    if (bible.speakingStyle) parts.push(`speaking: ${bible.speakingStyle}`);

    const refStatus = entry.hasReferenceImages ? "has reference images" : "no reference images yet";
    const autoTag = entry.autoCreated ? " [auto-created]" : "";

    return `- ${parts.join("; ")}; ${refStatus}${autoTag}`;
  });

  const mentionedLines = mentioned.length > 0
    ? mentioned.map((entry) => {
        const tags: string[] = [];
        if (entry.bible.relationships) {
          const rels = Object.entries(entry.bible.relationships)
            .map(([name, rel]) => `${name} = ${rel}`)
            .join("; ");
          if (rels) tags.push(`known relationships: ${rels}`);
        }
        return `- ${entry.name}${tags.length > 0 ? ` (${tags.join("; ")})` : ""}`;
      })
    : ["No specific characters detected by name in the topic. Use roster characters whose personality fits the story."];

  return `CHARACTER ROSTER (characters available in this channel):
${rosterLines.join("\n")}

MENTIONED CHARACTERS (detected in topic${hasStoryline ? "/storyline" : ""}/niche):
${mentionedLines.join("\n")}

CHARACTER INSTRUCTIONS:
- Use the mentioned characters in the story. Respect their established personalities, backgrounds, and relationships.
- You may use other roster characters if their personality fits the story.
- If the story requires a character not in the roster, create one with a full character bible (name, age, gender, heritage, skinTone, eyeColor, hairColor, hairStyle, build, distinguishingFeatures, wardrobe, personality, background, relationships, speakingStyle, role, immutableTraits). New characters will be automatically added to the channel.
- Characters should feel like real people with emotional depth, not generic placeholders.
- Maintain relationship consistency: if Emily's father is George in the roster, don't introduce a different father.
- For each candidate, list which characters are used (existing) and which are new (with full bibles) in the "characters" and "newCharacters" fields.`;
}
