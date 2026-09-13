/**
 * @automation/storage — pluggable storage abstraction for artifact storage.
 *
 * Provides a unified interface for storing and retrieving files across
 * different backends (local filesystem, Cloudflare R2).
 */

/**
 * Storage adapter interface — all backends implement this.
 * Keys are forward-slash-separated paths (e.g. "channels/{id}/runs/{id}/video/render.mp4").
 */
export interface StorageAdapter {
  /** The backend name ("local" or "r2"). */
  readonly backend: "local" | "r2";

  /**
   * Store a file. Creates parent directories (local) or keys (R2) as needed.
   * @param key — relative path / object key
   * @param data — file content as Buffer or ArrayBuffer or Uint8Array
   * @param contentType — optional MIME type (used for R2 metadata)
   */
  put(
    key: string,
    data: Buffer | ArrayBuffer | Uint8Array,
    contentType?: string,
  ): Promise<void>;

  /**
   * Retrieve a file as a Buffer.
   * @throws if the key doesn't exist.
   */
  get(key: string): Promise<Buffer>;

  /**
   * Stream a file as a ReadableStream (for HTTP responses).
   * @throws if the key doesn't exist.
   */
  getStream(key: string): Promise<ReadableStream<Uint8Array>>;

  /**
   * Check if a key exists.
   */
  exists(key: string): Promise<boolean>;

  /**
   * Delete a file. No-op if the key doesn't exist.
   */
  delete(key: string): Promise<void>;

  /**
   * Get a signed/presigned URL for downloading (R2 only).
   * For local storage, returns null (use get/getStream instead).
   * @param key — relative path / object key
   * @param expiresIn — URL validity in seconds (default 3600)
   */
  getSignedUrl(key: string, expiresIn?: number): Promise<string | null>;

  /**
   * Get the public URL for a key (R2 with public bucket only).
   * For local storage, returns null.
   */
  getPublicUrl(key: string): string | null;

  /**
   * Get the local filesystem path for a key (local only).
   * For R2, returns null.
   */
  getLocalPath(key: string): string | null;

  /**
   * List all keys with a given prefix.
   * @param prefix — key prefix (e.g. "channels/{id}/runs/{id}/export/")
   * @returns array of keys (without the prefix)
   */
  list(prefix: string): Promise<string[]>;
}
