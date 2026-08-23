// === Shared types ===

interface StoryDna {
  protagonistArchetype?: string;
  protagonistGoal?: string;
  incitingIncident?: string;
  centralConflict?: string;
  mainObstacle?: string;
  reversalOrTwist?: string;
  resolution?: string;
  psychologicalMechanism?: string;
  lesson?: string;
  setting?: string;
}

interface DuplicateResult {
  candidateIndex: number;
  candidateTitle: string;
  classification: "duplicate" | "borderline" | "original";
  checks: Array<{
    existingStoryId: string;
    existingTitle: string;
    exactMatch: boolean;
    lexicalScore: number;
    semanticScore: number;
    structuralScore: number;
    adjudication: string | null;
    classification: string;
  }>;
  bestCandidate: boolean;
}

export type { StoryDna, DuplicateResult };
