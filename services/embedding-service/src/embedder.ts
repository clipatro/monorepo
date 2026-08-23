// === Embedding model (lazy-loaded) ===

export const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";
export const DIMENSIONS = 384;

let pipelineFn: ((task: string, model: string) => Promise<EmbedFn>) | null = null;
type EmbedFn = (input: string | string[]) => Promise<{ data: number[] | Float32Array; dims?: number[] }>;
let extractor: EmbedFn | null = null;
let loadingPromise: Promise<EmbedFn> | null = null;

export async function getExtractor(): Promise<EmbedFn> {
  if (extractor) return extractor;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    console.log("[embedding-service] Loading model Xenova/all-MiniLM-L6-v2...");
    const transformers = await import("@xenova/transformers");
    const env = transformers.env as { allowLocalModels?: boolean; allowRemoteModels?: boolean; cacheDir?: string };
    env.allowRemoteModels = true;
    env.allowLocalModels = true;

    pipelineFn = transformers.pipeline as typeof pipelineFn;
    // Use pooling: "mean" and normalize: true for sentence embeddings
    // (Transformers.js v2 type defs don't include the options arg, so cast)
    const fn = await (pipelineFn as unknown as (
      task: string, model: string, options: Record<string, unknown>,
    ) => Promise<EmbedFn>)("feature-extraction", MODEL_NAME, {
      pooling: "mean",
      normalize: true,
    });
    extractor = fn;
    console.log("[embedding-service] Model loaded successfully.");
    return fn;
  })();

  return loadingPromise;
}

/** Whether the embedding model has been loaded into memory. */
export function isModelLoaded(): boolean {
  return extractor !== null;
}

/**
 * Mean-pool token-level embeddings into sentence embeddings.
 * Input: flat array of [batch, tokens, dim] → Output: [batch, dim]
 */
export function meanPool(flat: number[], batch: number, tokens: number, dim: number): number[][] {
  const result: number[][] = [];
  for (let b = 0; b < batch; b++) {
    const pooled = new Array(dim).fill(0);
    for (let t = 0; t < tokens; t++) {
      const offset = (b * tokens + t) * dim;
      for (let d = 0; d < dim; d++) {
        pooled[d] += flat[offset + d]!;
      }
    }
    for (let d = 0; d < dim; d++) {
      pooled[d] /= tokens;
    }
    result.push(pooled);
  }
  return result;
}

/**
 * Extract sentence embeddings from raw model output.
 * Handles both pooled [batch, dim] and unpooled [batch, tokens, dim] outputs.
 */
export function extractSentenceEmbeddings(
  data: number[] | Float32Array,
  dims: number[],
  batchSize: number,
): number[][] {
  const flat = Array.isArray(data) ? data : Array.from(data as Float32Array);

  if (dims.length === 3) {
    // [batch, tokens, dim] — need mean pooling
    const tokens = dims[1]!;
    const dim = dims[2]!;
    return meanPool(flat, batchSize, tokens, dim);
  } else if (dims.length === 2) {
    // [batch, dim] — already pooled
    const dim = dims[1] ?? DIMENSIONS;
    const result: number[][] = [];
    for (let i = 0; i < batchSize; i++) {
      result.push(flat.slice(i * dim, (i + 1) * dim));
    }
    return result;
  } else {
    // Fallback: assume [batch * dim] flat array
    const dim = dims[dims.length - 1] ?? DIMENSIONS;
    const result: number[][] = [];
    for (let i = 0; i < batchSize; i++) {
      result.push(flat.slice(i * dim, (i + 1) * dim));
    }
    return result;
  }
}
