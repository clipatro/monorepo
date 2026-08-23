/**
 * Capability facades — the stable internal interfaces every adapter implements.
 *
 * Swapping a provider = implementing one adapter against the existing facade.
 * No caller code changes. This is the repository/facade pattern the user
 * requested so provider changes are isolated to one service.
 */

import type {
  ProviderRequest,
  ProviderResponse,
} from "./envelope.ts";
import type {
  StoryGenerationInput,
  StoryGenerationOutput,
} from "./content.ts";
import type {
  ResearchInput,
  ResearchOutput,
} from "./research.ts";
import type {
  ImageGenerationInput,
  ImageGenerationOutput,
} from "./image.ts";
import type {
  VoiceSynthesisInput,
  VoiceSynthesisOutput,
} from "./voice.ts";
import type {
  EmbeddingInput,
  EmbeddingOutput,
} from "./embedding.ts";

/** Story generation facade. */
export interface StoryGenerator {
  generate(
    request: ProviderRequest<StoryGenerationInput>,
  ): Promise<ProviderResponse<StoryGenerationOutput>>;
}

/** Research / grounding facade. */
export interface Researcher {
  research(
    request: ProviderRequest<ResearchInput>,
  ): Promise<ProviderResponse<ResearchOutput>>;
}

/** Image generation facade. */
export interface ImageGenerator {
  generate(
    request: ProviderRequest<ImageGenerationInput>,
  ): Promise<ProviderResponse<ImageGenerationOutput>>;
}

/** Voice synthesis facade. */
export interface VoiceSynthesizer {
  synthesize(
    request: ProviderRequest<VoiceSynthesisInput>,
  ): Promise<ProviderResponse<VoiceSynthesisOutput>>;
}

/** Embedding facade. */
export interface Embedder {
  embed(
    request: ProviderRequest<EmbeddingInput>,
  ): Promise<ProviderResponse<EmbeddingOutput>>;
}

/** Registry of all capability facades a service can expose. */
export interface CapabilityRegistry {
  storyGenerator?: StoryGenerator;
  researcher?: Researcher;
  imageGenerator?: ImageGenerator;
  voiceSynthesizer?: VoiceSynthesizer;
  embedder?: Embedder;
}
