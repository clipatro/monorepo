/**
 * Storage helper — initializes the storage adapter from config
 * and provides convenience methods for the api-gateway routes.
 *
 * Architecture: local disk is the primary working storage. R2 is a
 * backup mirror — uploads are fire-and-forget (non-blocking) so they
 * don't slow down the pipeline. Reads during processing use local
 * disk. R2 is only read as a fallback when local files are missing.
 */

import { loadConfig, type AppConfig } from "@automation/config";
import { createStorage, type StorageAdapter } from "@automation/storage";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

let storageInstance: StorageAdapter | null = null;

/** Get the singleton storage adapter. */
export function getStorage(): StorageAdapter {
  if (!storageInstance) {
    const config = loadConfig("api-gateway");
    storageInstance = createStorage(config);
  }
  return storageInstance;
}

/**
 * Convert a stored file path to a storage key.
 * Handles both old absolute paths (local) and new relative keys.
 */
export function pathToKey(path: string, config: AppConfig): string {
  // If the path starts with the artifact store path, strip it
  if (path.startsWith(config.artifactStorePath)) {
    return path.slice(config.artifactStorePath.length).replace(/^\//, "");
  }
  return path;
}

/**
 * Build a storage key from path components.
 * e.g. storageKey("channels", channelId, "runs", runId, "video", "render.mp4")
 */
export function storageKey(...parts: string[]): string {
  return parts.filter(Boolean).join("/");
}

/**
 * Fire-and-forget backup upload to R2.
 * Reads a local file and uploads it to R2 in the background.
 * Does NOT block the caller — errors are logged but swallowed.
 *
 * @param localPath — the local filesystem path to read from
 * @param key — the R2 object key to upload to
 * @param contentType — optional MIME type
 */
export function backupToR2(localPath: string, key: string, contentType?: string): void {
  const storage = getStorage();
  if (storage.backend !== "r2") return;
  // Fire-and-forget — don't await, catch errors silently
  void (async () => {
    try {
      if (!existsSync(localPath)) return;
      const data = await readFile(localPath);
      await storage.put(key, data, contentType);
    } catch (err) {
      console.warn(`[storage] R2 backup failed for ${key}:`, (err as Error).message);
    }
  })();
}

/**
 * Fire-and-forget backup upload to R2 from a Buffer.
 * Does NOT block the caller.
 *
 * @param key — the R2 object key
 * @param data — the file content
 * @param contentType — optional MIME type
 */
export function backupBufferToR2(key: string, data: Buffer | Uint8Array | string, contentType?: string): void {
  const storage = getStorage();
  if (storage.backend !== "r2") return;
  const buf = typeof data === "string" ? Buffer.from(data, "utf-8") : data;
  void (async () => {
    try {
      await storage.put(key, buf, contentType);
    } catch (err) {
      console.warn(`[storage] R2 backup failed for ${key}:`, (err as Error).message);
    }
  })();
}
