/**
 * Shared spike utilities — env loading, output writing, result recording.
 * Spikes write artifacts under spikes/output/<spike-id>/ and return a result
 * summary that gets appended to the Obsidian Spike Results note.
 */

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPIKES_OUTPUT = join(__dirname, "..", "output");

export interface SpikeResult {
  id: string;
  name: string;
  goal: string;
  result: "pass" | "fail" | "partial";
  measurements: Record<string, string | number | boolean>;
  notes: string;
  artifactPaths: string[];
}

/** Load .env from the project root into process.env. */
export async function loadEnv(): Promise<void> {
  const envPath = join(__dirname, "..", "..", ".env");
  try {
    const content = await readFile(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (key && !(key in process.env)) process.env[key] = value;
    }
  } catch {
    // .env optional for no-cost spikes
  }
}

/** Get the output directory for a spike, creating it if needed. */
export async function spikeDir(id: string): Promise<string> {
  const dir = join(SPIKES_OUTPUT, id);
  await mkdir(dir, { recursive: true });
  return dir;
}

/** Write a text artifact for a spike. */
export async function writeArtifact(
  id: string,
  filename: string,
  content: string,
): Promise<string> {
  const dir = await spikeDir(id);
  const path = join(dir, filename);
  await writeFile(path, content, "utf-8");
  return path;
}

/** Write a binary artifact for a spike. */
export async function writeBinaryArtifact(
  id: string,
  filename: string,
  data: Buffer | Uint8Array,
): Promise<string> {
  const dir = await spikeDir(id);
  const path = join(dir, filename);
  await writeFile(path, data);
  return path;
}

/** Compute a SHA-256 checksum of a file. */
export async function fileChecksum(path: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  const data = await readFile(path);
  return createHash("sha256").update(data).digest("hex");
}

/** Format a SpikeResult as Obsidian markdown. */
export function resultToMarkdown(r: SpikeResult): string {
  const measurements = Object.entries(r.measurements)
    .map(([k, v]) => `  - ${k}: ${typeof v === "boolean" ? (v ? "yes" : "no") : v}`)
    .join("\n");
  const artifacts = r.artifactPaths.map((p) => `  - \`${p}\``).join("\n");
  return `### ${r.id} — ${r.name}
- **Goal:** ${r.goal}
- **Result:** ${r.result}
- **Measurements:**
${measurements}
- **Notes:** ${r.notes}
- **Artifacts:**
${artifacts || "  - (none)"}
`;
}
