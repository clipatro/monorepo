/**
 * Audio normalization — clean two-pass loudnorm (EBU R128).
 *
 *   - Target: -16 LUFS, -1.5 dBTP
 *   - Preserves the original voice character; just levels the loudness.
 *   - No EQ, no reverb, no room tone — clean and transparent.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

function parseVal(text: string, label: string): number {
  const m = text.match(new RegExp(`${label}:\\s+(-?[\\d.]+)`));
  return m && m[1] ? parseFloat(m[1]) : 0;
}

async function runCmd(cmd: string, opts?: { timeout?: number }): Promise<{ stdout: string; stderr: string }> {
  return execAsync(cmd, { maxBuffer: 50 * 1024 * 1024, ...opts });
}

export async function probeDuration(path: string): Promise<number> {
  const { stdout } = await runCmd(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${path}"`);
  return parseFloat(stdout.trim());
}

export async function normalizeVoiceover(
  inputPath: string,
  outputPath: string,
): Promise<{ lufs: number; truePeak: number; duration: number }> {
  // First pass: measure original loudness
  const measureCmd = `ffmpeg -y -i "${inputPath}" -af loudnorm=print_format=summary -f null -`;
  let measureOut = "";
  try {
    const { stdout, stderr } = await runCmd(measureCmd);
    measureOut = stdout + stderr;
  } catch (e: any) {
    measureOut = (e.stdout ?? "") + (e.stderr ?? "");
  }
  const measuredI = parseVal(measureOut, "Input Integrated");
  const measuredTP = parseVal(measureOut, "Input True Peak");
  const measuredLRA = parseVal(measureOut, "Input LRA");
  const measuredThresh = parseVal(measureOut, "Input Threshold");

  // Second pass: linear loudnorm with measured values
  await runCmd(
    `ffmpeg -y -i "${inputPath}" -af "loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${measuredI}:measured_TP=${measuredTP}:measured_LRA=${measuredLRA}:measured_thresh=${measuredThresh}:linear=true" -ar 48000 -ac 1 -c:a pcm_s16le "${outputPath}"`,
  );

  // Verify final loudness
  const verifyCmd = `ffmpeg -i "${outputPath}" -af loudnorm=print_format=summary -f null -`;
  let verifyOut = "";
  try {
    const { stdout, stderr } = await runCmd(verifyCmd);
    verifyOut = stdout + stderr;
  } catch (e: any) {
    verifyOut = (e.stdout ?? "") + (e.stderr ?? "");
  }
  const finalLufs = parseVal(verifyOut, "Input Integrated");
  const finalTP = parseVal(verifyOut, "Input True Peak");
  const finalDur = await probeDuration(outputPath);

  return { lufs: finalLufs, truePeak: finalTP, duration: finalDur };
}
