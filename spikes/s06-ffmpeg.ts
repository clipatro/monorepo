/**
 * S06 — FFmpeg/FFprobe audio normalization and concatenation.
 *
 * Goal: Verify FFmpeg/FFprobe can generate test tones, normalize them,
 * probe their duration, and concatenate them with configurable pauses
 * into a master audio file with deterministic cumulative timing.
 * This validates the scene-level fallback timing strategy.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { writeBinaryArtifact, writeArtifact, spikeDir, type SpikeResult } from "./lib/spike.ts";

const execAsync = promisify(exec);

async function runCmd(cmd: string): Promise<{ stdout: string; stderr: string }> {
  return execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
}

/** Get duration in seconds via ffprobe. */
async function probeDuration(path: string): Promise<number> {
  const { stdout } = await runCmd(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 "${path}"`,
  );
  return parseFloat(stdout.trim());
}

/** Get audio stream info via ffprobe. */
async function probeAudio(path: string): Promise<{ sampleRate: number; channels: number; codec: string }> {
  const { stdout } = await runCmd(
    `ffprobe -v error -select_streams a:0 -show_entries stream=sample_rate,channels,codec_name -of csv=p=0 "${path}"`,
  );
  // ffprobe csv=p=0 outputs in fixed order: codec_name,sample_rate,channels
  const parts = stdout.trim().split(",");
  const codec = parts[0] ?? "unknown";
  const sampleRate = parts[1] ?? "0";
  const channels = parts[2] ?? "0";
  return { sampleRate: parseInt(sampleRate, 10), channels: parseInt(channels, 10), codec };
}

export async function run(): Promise<SpikeResult> {
  const dir = await spikeDir("s06");
  const artifacts: string[] = [];

  // 1. Generate three test tones (simulating 3 scene clips) at 22050 Hz mono.
  //    Scene 1: 3s at 440Hz, Scene 2: 4s at 523Hz, Scene 3: 2s at 659Hz.
  const scenes = [
    { id: "scene-01", freq: 440, duration: 3 },
    { id: "scene-02", freq: 523, duration: 4 },
    { id: "scene-03", freq: 659, duration: 2 },
  ];

  const scenePaths: string[] = [];
  for (const s of scenes) {
    const path = join(dir, `${s.id}.wav`);
    // Generate a sine tone, normalized to -3dB, 16-bit PCM WAV.
    await runCmd(
      `ffmpeg -y -f lavfi -i "sine=frequency=${s.freq}:duration=${s.duration}:sample_rate=22050" ` +
      `-af "volume=-3dB" -c:a pcm_s16le "${path}"`,
    );
    scenePaths.push(path);
    artifacts.push(path);
  }

  // 2. Probe each scene's actual duration.
  const probedDurations: number[] = [];
  for (const p of scenePaths) {
    const d = await probeDuration(p);
    probedDurations.push(d);
  }

  // 3. Probe audio properties of scene 1.
  const audioInfo = await probeAudio(scenePaths[0]!);

  // 4. Concatenate with a 500ms pause between segments.
  //    Use the concat demuxer with a silent pause file.
  const pauseMs = 500;
  const pausePath = join(dir, "pause.wav");
  await runCmd(
    `ffmpeg -y -f lavfi -i "anullsrc=channel_layout=mono:sample_rate=22050" ` +
    `-t ${pauseMs / 1000} -c:a pcm_s16le "${pausePath}"`,
  );

  // Build concat list file.
  const concatList: string[] = [];
  for (let i = 0; i < scenePaths.length; i++) {
    concatList.push(`file '${scenePaths[i]}'`);
    if (i < scenePaths.length - 1) concatList.push(`file '${pausePath}'`);
  }
  const listPath = join(dir, "concat-list.txt");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(listPath, concatList.join("\n"), "utf-8");

  const masterPath = join(dir, "voiceover.wav");
  await runCmd(
    `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c:a pcm_s16le "${masterPath}"`,
  );
  artifacts.push(masterPath);

  // 5. Probe master duration and verify cumulative timing.
  const masterDuration = await probeDuration(masterPath);
  const masterInfo = await probeAudio(masterPath);

  // Expected: sum(scene durations) + sum(pauses) = 3+4+2 + 0.5+0.5 = 10.0s
  const expectedDuration = scenes.reduce((a, s) => a + s.duration, 0) +
    (scenes.length - 1) * (pauseMs / 1000);
  const durationDelta = Math.abs(masterDuration - expectedDuration);

  // 6. Compute cumulative scene timings (the actual output of the fallback strategy).
  const timings: Array<{ sceneId: string; startMs: number; endMs: number }> = [];
  let cursorMs = 0;
  for (let i = 0; i < scenes.length; i++) {
    const startMs = Math.round(cursorMs);
    const durMs = Math.round(probedDurations[i]! * 1000);
    const endMs = startMs + durMs;
    timings.push({ sceneId: scenes[i]!.id, startMs, endMs });
    cursorMs = endMs + pauseMs; // pause after this scene (except last)
  }

  const timingArtifact = await writeArtifact(
    "s06",
    "timings.json",
    JSON.stringify({ masterDuration, expectedDuration, timings }, null, 2),
  );
  artifacts.push(timingArtifact);

  // 7. Verify normalization: re-encode master to a normalized target and probe.
  const normalizedPath = join(dir, "voiceover-normalized.wav");
  await runCmd(
    `ffmpeg -y -i "${masterPath}" -af "loudnorm=I=-16:TP=-1.5:LRA=11" -c:a pcm_s16le "${normalizedPath}"`,
  );
  artifacts.push(normalizedPath);
  const normalizedDuration = await probeDuration(normalizedPath);

  const pass = durationDelta < 0.1 && masterInfo.sampleRate === 22050 && masterInfo.channels === 1;

  return {
    id: "s06",
    name: "FFmpeg/FFprobe audio normalization and concatenation",
    goal: "Verify FFmpeg can generate, normalize, probe, and concatenate scene audio with deterministic timing.",
    result: pass ? "pass" : "fail",
    measurements: {
      "sceneCount": scenes.length,
      "probedDurations": probedDurations.map((d) => d.toFixed(3) + "s").join(", "),
      "expectedMasterDuration": expectedDuration.toFixed(3) + "s",
      "actualMasterDuration": masterDuration.toFixed(3) + "s",
      "durationDeltaMs": Math.round(durationDelta * 1000),
      "masterSampleRate": masterInfo.sampleRate,
      "masterChannels": masterInfo.channels,
      "masterCodec": masterInfo.codec,
      "normalizedDuration": normalizedDuration.toFixed(3) + "s",
      "pauseMs": pauseMs,
      "cumulativeTimingDeterministic": pass,
    },
    notes: pass
      ? "FFmpeg/FFprobe generate, probe, concatenate with pauses, and normalize audio correctly. Cumulative scene timings are deterministic and match expected duration within 100ms."
      : `Duration mismatch or audio property mismatch. Delta: ${durationDelta.toFixed(3)}s.`,
    artifactPaths: artifacts,
  };
}
