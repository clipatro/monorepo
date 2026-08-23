/**
 * Character bible contract — structured identity definition for characters.
 *
 * The bible is stored as JSON in `character_versions.bible`. It extends the
 * original physical-appearance-only format with personality, background,
 * relationships, and story-arc fields for context-aware story generation.
 *
 * Backward compatibility: existing bibles with only physical fields remain
 * valid. All new fields are optional.
 */

// === Character bible ===

export interface CharacterBible {
  // === Physical appearance (existing fields, backward compatible) ===
  name: string;
  age?: string;
  gender?: string;
  heritage?: string;
  ethnicity?: string;
  skinTone?: string;
  faceShape?: string;
  facialFeatures?: string;
  eyeColor?: string;
  hairColor?: string;
  hairStyle?: string;
  facialHair?: string;
  build?: string;
  height?: string;
  distinguishingFeatures?: string;
  wardrobe?: string;
  immutableTraits?: string[];

  // === Personality and story (new — for context-aware generation) ===
  personality?: string;
  background?: string;
  relationships?: Record<string, string>;
  storyArc?: string;
  speakingStyle?: string;
  role?: string;
}

// === Character assignment in a story candidate ===

export interface CharacterAssignment {
  name: string;
  existingCharacterId: string | null;
  roleInStory: string;
}

// === New character proposed by the LLM during story generation ===

export interface NewCharacterProposal {
  name: string;
  bible: CharacterBible;
  roleInStory: string;
}

// === Character assignment in a scene (from scene planner) ===

export interface SceneCharacterAssignment {
  name: string;
  roleInScene: string;
  poseAndExpression: string;
}

// === Character roster entry (channel's available characters) ===

export interface CharacterRosterEntry {
  characterId: string;
  name: string;
  role: string;
  bible: CharacterBible;
  hasReferenceImages: boolean;
  frozenVersionId: string | null;
  autoCreated: boolean;
}
