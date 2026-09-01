/**
 * S23 kids video — music sync stage.
 *
 * Mixes the narration WAV with background music using FFmpeg. Kids content
 * uses a slightly louder music bed (18% volume) than the mystery spike (12%)
 * to keep the energy up, while still keeping narration clearly audible.
 * Narration is normalized to -16 LUFS (broadcast standard for speech).
 *
 * Reuses the S22 music sync pattern (loudnorm + amix + fade in/out).
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, access } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");
const BACKGROUND_MUSIC = join(PROJECT_ROOT, "media", "background.mp3");

// === Output types ===

export interface MusicSyncOutput {
  mixedAudioPath: string;
  durationSec: number;
  costUsd: number;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// === Main music sync function ===

export async function mixMusic(
  narrationPath: string,
  narrationDurationSec: number,
  outDir: string,
): Promise<MusicSyncOutput> {
  const mixedPath = join(outDir, "mixed-audio.wav");

  if (!(await exists(BACKGROUND_MUSIC))) {
    // No background music — use narration only
    await copyFile(narrationPath, mixedPath);
    return { mixedAudioPath: mixedPath, durationSec: narrationDurationSec, costUsd: 0 };
  }

  // Kids content: narration normalized to -16 LUFS, music at 18% volume
  // (brighter, more energetic than the mystery spike's 12%).
  // NOTE: The Remotion-bundled FFmpeg does not enable the `afade` filter, so
  // we use `volume` with a frame-evaluated expression for the fade in/out,
  // and `amix` with `dropout_transition` for a natural crossfade. The
  // `volume` filter with `eval=frame` and a conditional expression produces
  // a linear fade equivalent to afade.
  const totalDuration = narrationDurationSec + 3;
  const fadeInEnd = 1.5; // seconds
  const fadeOutStart = totalDuration - 2; // seconds
  const fadeOutDur = 2; // seconds
  // Volume expression: fade in over first 1.5s, full volume, fade out over last 2s.
  // Uses 'between(t,a,b)' and 'if(cond,a,b)' — supported by the volume filter.
  const musicVolExpr =
    `if(lt(t,${fadeInEnd}),0.18*(t/${fadeInEnd}),` +
    `if(gt(t,${fadeOutStart}),0.18*(1-(t-${fadeOutStart})/${fadeOutDur}),0.18))`;
  await execAsync(
    `ffmpeg -y -i "${narrationPath}" -i "${BACKGROUND_MUSIC}" ` +
      `-filter_complex "[0:a]loudnorm=I=-16:TP=-1.5:LRA=11[voice];[1:a]volume='${musicVolExpr}':eval=frame[music];[voice][music]amix=inputs=2:duration=longest:dropout_transition=0:weights=1 0.4" ` +
      `-t ${totalDuration.toFixed(1)} -ar 48000 -ac 2 -c:a pcm_s16le "${mixedPath}"`,
  );

  // Probe duration
  const { stdout: probeOut } = await execAsync(
    `ffprobe -v quiet -print_format json -show_format "${mixedPath}"`,
  );
  const probe = JSON.parse(probeOut) as { format?: { duration?: string } };
  const durationSec = parseFloat(probe.format?.duration ?? String(narrationDurationSec));

  return { mixedAudioPath: mixedPath, durationSec, costUsd: 0 };
}
