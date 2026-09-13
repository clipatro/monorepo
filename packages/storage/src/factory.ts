/**
 * Storage factory — creates the right StorageAdapter based on AppConfig.
 */

import type { AppConfig } from "@automation/config";
import { LocalFileStorage } from "./local.ts";
import { R2Storage } from "./r2.ts";
import type { StorageAdapter } from "./types.ts";

/**
 * Create a StorageAdapter from the app config.
 * - When storageBackend === "r2" and R2 credentials are present, returns R2Storage.
 * - Otherwise, returns LocalFileStorage (filesystem under artifactStorePath).
 */
export function createStorage(config: AppConfig): StorageAdapter {
  if (
    config.storageBackend === "r2" &&
    config.r2Bucket &&
    config.r2Endpoint &&
    config.r2AccessKeyId &&
    config.r2SecretAccessKey
  ) {
    console.log(
      `[storage] Using R2 backend (bucket: ${config.r2Bucket}, endpoint: ${config.r2Endpoint})`,
    );
    return new R2Storage({
      bucket: config.r2Bucket,
      endpoint: config.r2Endpoint,
      accessKeyId: config.r2AccessKeyId,
      secretAccessKey: config.r2SecretAccessKey,
      publicUrl: config.r2PublicUrl ?? undefined,
    });
  }

  if (config.storageBackend === "r2") {
    console.warn(
      "[storage] R2 backend requested but credentials are incomplete — falling back to local storage",
    );
  }

  console.log(`[storage] Using local filesystem backend (${config.artifactStorePath})`);
  return new LocalFileStorage(config.artifactStorePath);
}

/**
 * Build a storage key from path components.
 * e.g. artifactKey("channels", channelId, "runs", runId, "video", "render.mp4")
 * → "channels/{channelId}/runs/{runId}/video/render.mp4"
 */
export function artifactKey(...parts: string[]): string {
  return parts.filter(Boolean).join("/");
}
