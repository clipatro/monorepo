/**
 * Image generation facade types.
 *
 * The facade is provider-agnostic. Adapters (Gemini Flash Lite Image, FLUX,
 * Flow manual) implement ImageGenerator against this contract.
 */

/** A frozen character reference image with its role. */
export interface CharacterReference {
  /** Local path to the reference image. */
  path: string;
  /** Role: front, three-quarter, side, full-body-front, full-body-three-quarter, expression. */
  role: string;
  /** SHA-256 checksum of the reference file. */
  checksum: string;
}

/** Input to the image generator facade. */
export interface ImageGenerationInput {
  /** Provider-specific compiled prompt. */
  prompt: string;
  /** Frozen character references to attach, when available. */
  references?: CharacterReference[];
  /** Aspect ratio, e.g. "9:16" for vertical short-form. */
  aspectRatio?: string;
  /** Negative constraints (identity changes, drift, artifacts). */
  negativeConstraints?: string[];
  /** Channel visual-style block. */
  styleBlock?: string;
}

/** A single generated image artifact. */
export interface GeneratedImage {
  /** Local path to the saved image. */
  path: string;
  /** MIME type, e.g. "image/png". */
  mimeType: string;
  /** Width in pixels. */
  width: number;
  /** Height in pixels. */
  height: number;
  /** SHA-256 checksum of the file. */
  checksum: string;
}

/** Output of the image generator facade. */
export interface ImageGenerationOutput {
  images: GeneratedImage[];
}
