/**
 * @automation/storage — pluggable storage abstraction.
 *
 * Exports the StorageAdapter interface, LocalFileStorage, R2Storage,
 * and a factory function that selects the right backend from config.
 */

export type { StorageAdapter } from "./types.ts";
export { LocalFileStorage } from "./local.ts";
export { R2Storage, type R2StorageConfig } from "./r2.ts";
export { createStorage, artifactKey } from "./factory.ts";
