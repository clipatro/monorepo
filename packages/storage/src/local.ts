/**
 * LocalFileStorage — stores files on the local filesystem.
 *
 * This is the default backend and preserves the existing behavior where
 * files are stored under the artifactStorePath directory.
 */

import { readFile, writeFile, mkdir, unlink, stat, access, readdir } from "node:fs/promises";
import { join, dirname, relative } from "node:path";
import type { StorageAdapter } from "./types.ts";

export class LocalFileStorage implements StorageAdapter {
  readonly backend = "local" as const;

  constructor(private readonly basePath: string) {}

  private resolve(key: string): string {
    return join(this.basePath, key);
  }

  async put(
    key: string,
    data: Buffer | ArrayBuffer | Uint8Array,
    _contentType?: string,
  ): Promise<void> {
    const fullPath = this.resolve(key);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, data as Uint8Array);
  }

  async get(key: string): Promise<Buffer> {
    const fullPath = this.resolve(key);
    return readFile(fullPath);
  }

  async getStream(key: string): Promise<ReadableStream<Uint8Array>> {
    const fullPath = this.resolve(key);
    // Use Bun.file for streaming (works in Bun runtime)
    const file = Bun.file(fullPath);
    if (!(await file.exists())) {
      throw new Error(`File not found: ${key}`);
    }
    return file.stream() as ReadableStream<Uint8Array>;
  }

  async exists(key: string): Promise<boolean> {
    const fullPath = this.resolve(key);
    try {
      await access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    const fullPath = this.resolve(key);
    try {
      await unlink(fullPath);
    } catch {
      // No-op if file doesn't exist
    }
  }

  async getSignedUrl(_key: string, _expiresIn?: number): Promise<string | null> {
    return null;
  }

  getPublicUrl(_key: string): string | null {
    return null;
  }

  getLocalPath(key: string): string {
    return this.resolve(key);
  }

  async list(prefix: string): Promise<string[]> {
    const fullPath = this.resolve(prefix);
    try {
      const entries = await readdir(fullPath, { recursive: true, withFileTypes: true });
      return entries
        .filter((e) => e.isFile())
        .map((e) => {
          // e.parentPath is the directory; e.name is the filename
          const dir = e.parentPath ? relative(fullPath, e.parentPath) : "";
          return dir ? `${dir}/${e.name}` : e.name;
        });
    } catch {
      return [];
    }
  }
}
