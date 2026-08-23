/**
 * Embedding facade types — local semantic embeddings for duplicate detection.
 *
 * The facade is provider-agnostic. The initial adapter is a local ONNX model
 * so recurring similarity checks do not add API costs.
 */

export interface EmbeddingInput {
  /** Texts to embed. */
  texts: string[];
  /** Optional metadata to tag each embedding (e.g. field name). */
  metadata?: string[];
}

export interface EmbeddingVector {
  /** The embedding values. */
  vector: number[];
  /** Model name that produced this vector. */
  model: string;
  /** Model version. */
  modelVersion: string;
}

export interface EmbeddingOutput {
  vectors: EmbeddingVector[];
  /** Dimensionality of the vectors. */
  dimensions: number;
}
