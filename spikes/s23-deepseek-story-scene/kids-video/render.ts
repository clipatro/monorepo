/**
 * S23 kids video — Remotion render stage.
 *
 * Renders the generated composition to an MP4 using the locally-pinned
 * Remotion CLI (4.0.411). Reuses the S22 render pattern: call
 * `bun node_modules/@remotion/cli/remotion-cli.js render` with the
 * --public-dir flag pointing at the copied assets.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import type { CompositionOutput } from "./composition.ts";

const execAsync = promisify(exec);

export interface RenderOutput {
  videoPath: string;
  durationSec: number;
  sizeBytes: number;
  costUsd: number;
}

export async function renderVideo(
  composition: CompositionOutput,
  outDir: string,
): Promise<RenderOutput> {
  const videoPath = join(outDir, "kids-video.mp4");
  const publicDir = composition.publicDir;

  // Use the locally-pinned Remotion CLI directly — `bunx remotion` resolves
  // to the latest cached version and triggers version-mismatch errors.
  const cmd = `bun node_modules/@remotion/cli/remotion-cli.js render "${composition.renderEntryPath}" "${composition.compositionId}" "${videoPath}" --public-dir="${publicDir}" --log=verbose`;

  const { stdout, stderr } = await execAsync(cmd, { maxBuffer: 50 * 1024 * 1024 });
  void stdout;
  void stderr;

  // Probe the output video
  const { stdout: probeOut } = await execAsync(
    `ffprobe -v quiet -print_format json -show_format "${videoPath}"`,
  );
  const probe = JSON.parse(probeOut) as { format?: { duration?: string; size?: string } };
  const durationSec = parseFloat(probe.format?.duration ?? "0");
  const sizeBytes = parseInt(probe.format?.size ?? "0");

  return { videoPath, durationSec, sizeBytes, costUsd: 0 };
}
