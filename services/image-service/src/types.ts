// === Types ===

interface SceneCharacter {
  name: string;
  roleInScene: string;
  poseAndExpression: string;
}

interface ScenePlan {
  scenes: ScenePlanItem[];
}

interface ScenePlanItem {
  order: number;
  storyPurpose: string;
  narrationText: string;
  visualEvent: string;
  characterRole: string; // "none" for non-character scenes
  poseAndExpression: string;
  environment: string;
  cameraFraming: string;
  lightingAndMood: string;
  expectedDurationSeconds: number;
  imageRequirement: "character_scene" | "non_character_scene";
  sourceClaimIds: string[];
  /** Multi-character assignments for this scene (Phase 7). */
  characters?: SceneCharacter[];
  /** D021: Media type for flow-hybrid scenes ("video-clip" or "image"). */
  mediaType?: "video-clip" | "image";
}

interface CompiledPrompt {
  prompt: string;
  isCharacterScene: boolean;
  model: string;
  referenceIds: string[];
}

interface ImageGenResult {
  imageBuffer: Buffer;
  mimeType: string;
  width: number;
  height: number;
  checksum: string;
  costUsd: number;
  remoteRequestId: string | null;
}

export type { ScenePlan, ScenePlanItem, CompiledPrompt, ImageGenResult, SceneCharacter };
