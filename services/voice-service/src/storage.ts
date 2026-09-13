/**
 * Storage helper for voice-service.
 *
 * Architecture: local disk is the primary working storage. R2 is a
 * fire-and-forget backup mirror — uploads happen in the background
 * and don't block the pipeline. Reads during processing use local
 * disk only. R2 is only a fallback if local files are missing
 * (e.g., after a container restart with a fresh volume).
 */

import { loadConfig, type AppConfig } from "@automation/config";
import { createStorage, type StorageAdapter } from "@automation/storage";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

let storageInstance: StorageAdapter | null = null;

/** Get the singleton storage adapter. */
export function getStorage(): StorageAdapter {
  if (!storageInstance) {
    const config = loadConfig("voice-service");
    storageInstance = createStorage(config);
  }
  return storageInstance;
}

/**
 * Convert a stored file path to a storage key.
 * Handles both old absolute paths (local) and new relative keys.
 */
export function pathToKey(path: string, config: AppConfig): string {
  if (path.startsWith(config.artifactStorePath)) {
    return path.slice(config.artifactStorePath.length).replace(/^\//, "");
  }
  return path;
}

/**
 * Build a storage key from path components.
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
  void (async () => {
    try {
      if (!existsSync(localPath)) return;
      const data = await readFile(localPath);
      await storage.put(key, data, contentType);
    } catch (err) {
      console.warn(`[voice-service] R2 backup failed for ${key}:`, (err as Error).message);
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
      console.warn(`[voice-service] R2 backup failed for ${key}:`, (err as Error).message);
    }
  })();
}

/**
 * Read a file — tries the local filesystem first, then R2 as a fallback.
 * This is only used when local files may be missing (e.g., after restart).
 * During normal pipeline operation, local files are always present.
 *
 * @param filePath — the file path (may be a local path or an R2 key)
 * @returns the file content as a Buffer, or null if not found
 */
export async function readFileAny(filePath: string, config: AppConfig): Promise<Buffer | null> {
  // Try local filesystem first (fast — normal case)
  if (existsSync(filePath)) {
    return readFile(filePath);
  }
  // Fallback: try R2 if local file is missing
  const storage = getStorage();
  if (storage.backend === "r2") {
    const key = pathToKey(filePath, config);
    try {
      if (await storage.exists(key)) {
        return storage.get(key);
      }
    } catch {
      // ignore
    }
  }
  return null;
}
