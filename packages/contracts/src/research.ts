/**
 * Research facade types — factual research and source/claim mapping.
 * Required for content types that need grounding (see ContentTypeRegistry).
 */

import type { ContentType } from "./content.ts";

export interface ResearchSource {
  /** Stable source id. */
  id: string;
  title: string;
  url?: string;
  /** Relevant excerpt used for grounding. */
  excerpt: string;
}

export interface ResearchClaim {
  /** Stable claim id. */
  id: string;
  claim: string;
  /** Source ids supporting this claim. */
  sourceIds: string[];
  /** Confidence: high / medium / low. */
  confidence: "high" | "medium" | "low";
}

export interface ResearchInput {
  topic: string;
  contentType: ContentType;
  channelId?: string;
  /** Optional required or forbidden ideas. */
  requiredIdeas?: string[];
  forbiddenIdeas?: string[];
}

export interface ResearchOutput {
  sources: ResearchSource[];
  claims: ResearchClaim[];
  /** Uncertainties and conflicts found during research. */
  uncertainties: string[];
  /** Facts allowed in the script. */
  allowedFacts: string[];
  /** Privacy, defamation, or medical-claim warnings. */
  warnings: string[];
}
