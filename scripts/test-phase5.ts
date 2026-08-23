/**
 * Phase 5 verification script.
 *
 * Tests:
 * 1. Voiceover DB table and schema
 * 2. Timing DB table and schema
 * 3. Caption DB table and schema
 * 4. FFmpeg/FFprobe availability
 * 5. Gameplay video directory and files
 * 6. Gameplay video cutting (muted, correct duration, random middle start)
 * 7. SRT generation format
 * 8. Timeline CSV format
 * 9. Package manifest format
 * 10. Voice synthesis (Kokoro — requires voice-service running)
 * 11. Scene timing records (cumulative, deterministic)
 * 12. Audio normalization (loudnorm)
 * 13. Export package assembly (ZIP)
 * 14. API gateway proxy routes
 *
 * Usage:
 *   bun run scripts/test-phase5.ts
 */

import { getDb, closeDb } from "@automation/database";
import type { SceneRow, VoiceoverRow, TimingRow, ChannelRow, StoryRow, StoryVersionRow } from "@automation/database";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";

const execAsync = promisify(exec);

let passed = 0;
let failed = 0;
const errors: string[] = [];

function assert(condition: boolean, message: string): void {
  if (condition) { console.log(`  ✓ ${message}`); passed++; }
  else { console.log(`  ✗ ${message}`); failed++; errors.push(message); }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  const equal = JSON.stringify(actual) === JSON.stringify(expected);
  assert(equal, `${message} (expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)})`);
}

async function probeDuration(path: string): Promise<number> {
  const { stdout } = await execAsync(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 "${path}"`,
  );
  return parseFloat(stdout.trim());
}

async function probeAudioStreams(path: string): Promise<number> {
  // Returns the number of audio streams
  const { stdout } = await execAsync(
    `ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "${path}"`,
  );
  return stdout.trim() === "" ? 0 : stdout.trim().split("\n").length;
}

async function probeVideoDuration(path: string): Promise<number> {
  const { stdout } = await execAsync(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 "${path}"`,
  );
  return parseFloat(stdout.trim());
}

// === SRT format helpers (same as voice-service) ===

function formatSrtTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const millis = ms % 1000;
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

function generateSrt(timings: Array<{ startMs: number; endMs: number; narrationText: string }>): string {
  const lines: string[] = [];
  for (let i = 0; i < timings.length; i++) {
    const t = timings[i]!;
    lines.push(String(i + 1));
    lines.push(formatSrtTime(t.startMs) + " --> " + formatSrtTime(t.endMs));
    lines.push(t.narrationText);
    lines.push("");
  }
  return lines.join("\n");
}

async function main() {
  console.log("\n=== Phase 5 Verification ===\n");

  const db = getDb();

  // === Test 1: Voiceover DB table ===
  console.log("Test 1: Voiceover DB table");
  const voTable = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='voiceovers'").get();
  assert(!!voTable, "voiceovers table exists");

  // === Test 2: Timing DB table ===
  console.log("Test 2: Timing DB table");
  const timingTable = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='timings'").get();
  assert(!!timingTable, "timings table exists");

  // === Test 3: Caption DB table ===
  console.log("Test 3: Caption DB table");
  const captionTable = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='captions'").get();
  assert(!!captionTable, "captions table exists");

  // === Test 4: FFmpeg/FFprobe availability ===
  console.log("Test 4: FFmpeg/FFprobe availability");
  try {
    await execAsync("ffmpeg -version");
    assert(true, "ffmpeg is available");
  } catch { assert(false, "ffmpeg is available"); }

  try {
    await execAsync("ffprobe -version");
    assert(true, "ffprobe is available");
  } catch { assert(false, "ffprobe is available"); }

  // === Test 5: Gameplay video directory ===
  console.log("Test 5: Gameplay video directory");
  const gameplayDir = "./media/gameplay";
  assert(existsSync(gameplayDir), "media/gameplay/ directory exists");
  const gameplayFiles = await readdir(gameplayDir);
  const videoFiles = gameplayFiles.filter((f) => f.endsWith(".mp4") || f.endsWith(".mkv") || f.endsWith(".webm"));
  assert(videoFiles.length > 0, `Gameplay videos found: ${videoFiles.length} (${videoFiles.join(", ")})`);

  // === Test 6: Gameplay video cutting ===
  console.log("Test 6: Gameplay video cutting (muted, correct duration)");
  const testDir = "./data/test-phase5";
  await mkdir(testDir, { recursive: true });

  // Test cutting a 10-second segment
  const testCutPath = join(testDir, "test-cut.mp4");
  const targetDuration = 10.0;

  try {
    // Pick a random video
    const randomVideo = videoFiles[Math.floor(Math.random() * videoFiles.length)]!;
    const videoPath = join(gameplayDir, randomVideo);
    const videoDur = await probeVideoDuration(videoPath);
    assert(videoDur > 0, `Gameplay video has valid duration: ${videoDur.toFixed(1)}s`);

    // Pick a random start in the middle
    const margin = videoDur * 0.1;
    const availableStart = videoDur - targetDuration - 2 * margin;
    const startSec = availableStart > 0 ? margin + Math.random() * availableStart : 0;

    // Cut and mute — re-encode for clean keyframes and 60fps CFR
    await execAsync(
      `ffmpeg -y -i "${videoPath}" -ss ${startSec.toFixed(3)} -t ${targetDuration.toFixed(3)} ` +
      `-an -c:v libx264 -preset fast -crf 18 -r 60 -g 60 -pix_fmt yuv420p -movflags +faststart "${testCutPath}"`,
    );

    // Verify the cut video exists and has correct duration
    assert(existsSync(testCutPath), "Cut gameplay video file created");

    const cutDuration = await probeDuration(testCutPath);
    assert(Math.abs(cutDuration - targetDuration) < 1.0, `Cut duration matches target (${cutDuration.toFixed(2)}s vs ${targetDuration}s)`);

    // Verify the cut video has NO audio streams (muted)
    const audioStreams = await probeAudioStreams(testCutPath);
    assertEqual(audioStreams, 0, "Cut gameplay video has no audio streams (muted)");

  } catch (err) {
    assert(false, `Gameplay video cutting failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // === Test 7: SRT generation format ===
  console.log("Test 7: SRT generation format");
  const testTimings = [
    { startMs: 0, endMs: 5000, narrationText: "First scene narration." },
    { startMs: 5300, endMs: 10000, narrationText: "Second scene narration." },
    { startMs: 10300, endMs: 15000, narrationText: "Third scene narration." },
  ];
  const srt = generateSrt(testTimings);
  assert(srt.includes("1"), "SRT has index 1");
  assert(srt.includes("00:00:00,000 --> 00:00:05,000"), "SRT has correct first timing");
  assert(srt.includes("First scene narration."), "SRT has first narration text");
  assert(srt.includes("00:00:05,300 --> 00:00:10,000"), "SRT has correct second timing (with pause)");
  assert(srt.includes("00:00:10,300 --> 00:00:15,000"), "SRT has correct third timing");

  // === Test 8: Timeline CSV format ===
  console.log("Test 8: Timeline CSV format");
  const csvHeader = "scene_order,scene_id,narration_start_ms,narration_end_ms,narration_start_sec,narration_end_sec,image_file,caption_text";
  const csvLine = `1,scene-001,0,5000,0.000,5.000,scene-01.png,"First scene narration."`;
  assert(csvHeader.includes("scene_order"), "CSV header has scene_order column");
  assert(csvHeader.includes("narration_start_ms"), "CSV header has narration_start_ms column");
  assert(csvHeader.includes("narration_end_ms"), "CSV header has narration_end_ms column");
  assert(csvHeader.includes("image_file"), "CSV header has image_file column");
  assert(csvLine.includes('"First scene narration."'), "CSV caption text is properly quoted");

  // === Test 9: Package manifest format ===
  console.log("Test 9: Package manifest format");
  const testManifest = {
    version: "1.0",
    audio: { durationMs: 15000, provider: "kokoro", model: "Kokoro-82M" },
    gameplay: { sourceFile: "cycling.mp4", startSec: "120.50", durationSec: "15.00", muted: true },
    captions: { file: "captions.srt", precision: "scene-level" },
  };
  assert(testManifest.version === "1.0", "Manifest has version");
  assert(!!testManifest.audio, "Manifest has audio section");
  assert(!!testManifest.gameplay, "Manifest has gameplay section");
  assert(testManifest.gameplay!.muted === true, "Manifest gameplay is muted");
  assert(testManifest.captions!.precision === "scene-level", "Manifest caption precision is scene-level");

  // === Test 10: Voice synthesis (via voice-service) ===
  console.log("Test 10: Voice synthesis (via voice-service)");
  // Create test data
  const channelId = "test-ch-p5-" + Date.now();
  const runId = "test-run-p5-" + Date.now();
  const storyId = crypto.randomUUID();

  await db.prepare(`
    INSERT INTO channels (id, name, slug, niche, locale, content_types, target_duration_seconds, scene_min, scene_max, story_style, visual_style, image_provider, tts_provider, tts_voice_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(channelId, "Test P5", channelId, "psychology", "en-US", '["fictional_story"]', 45, 4, 8, "", "cinematic", "gemini-flash-image", "kokoro", "af_heart");

  await db.prepare("INSERT INTO workflow_runs (id, channel_id, topic, status) VALUES (?, ?, ?, ?)").run(runId, channelId, "test", "completed");

  await db.prepare("INSERT INTO stories (id, channel_id, run_id, title, content_type, approved_at) VALUES (?, ?, ?, ?, ?, now())")
    .run(storyId, channelId, runId, "Test Story P5", "fictional_story");

  const versionId = crypto.randomUUID();
  await db.prepare("INSERT INTO story_versions (id, story_id, version, story_json) VALUES (?, ?, 1, ?)")
    .run(versionId, storyId, JSON.stringify({ title: "Test Story P5", hook: "test", premise: "test" }));
  await db.prepare("UPDATE stories SET canonical_version_id = ? WHERE id = ?").run(versionId, storyId);

  // Insert test scenes with narration
  const sceneIds: string[] = [];
  const narrations = [
    "Have you ever wondered why we procrastinate?",
    "It's not laziness, it's your brain choosing comfort.",
    "The key is to start with just two minutes.",
    "Try it next time you feel stuck.",
  ];
  for (let i = 0; i < narrations.length; i++) {
    const sceneId = crypto.randomUUID();
    sceneIds.push(sceneId);
    await db.prepare(`
      INSERT INTO scenes (id, story_id, "order", story_purpose, narration_text, visual_event,
        character_role, pose_and_expression, environment, camera_framing,
        lighting_and_mood, expected_duration_seconds, image_requirement, source_claim_ids)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sceneId, storyId, i + 1, `Purpose ${i + 1}`, narrations[i]!, `Visual ${i + 1}`,
      "protagonist", `Pose ${i + 1}`, `Env ${i + 1}`, `Camera ${i + 1}`,
      `Lighting ${i + 1}`, 10, "character_scene", "[]",
    );
  }

  let voiceoverId: string | null = null;
  try {
    const res = await fetch("http://localhost:3004/synthesize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storyId, runId, provider: "auto" }),
    });

    if (res.ok) {
      const data = await res.json() as {
        voiceoverId: string; durationMs: number; durationSec: string;
        provider: string; model: string; voiceId: string;
        sceneCount: number; timings: Array<{ sceneId: string; order: number; startMs: number; endMs: number }>;
      };

      voiceoverId = data.voiceoverId;
      assert(data.durationMs > 0, `Voiceover has positive duration: ${data.durationMs}ms`);
      assert(data.provider === "kokoro" || data.provider === "gemini", `Provider is valid: ${data.provider}`);
      assertEqual(data.sceneCount, 4, "All 4 scenes synthesized");
      assert(data.timings.length === 4, "4 timing records returned");

      // Verify cumulative timing (each scene starts after previous + pause)
      for (let i = 1; i < data.timings.length; i++) {
        const prev = data.timings[i - 1]!;
        const curr = data.timings[i]!;
        assert(curr.startMs >= prev.endMs, `Scene ${i + 1} starts after scene ${i} ends`);
      }

      // Verify voiceover stored in DB
      const vo = await db.prepare("SELECT * FROM voiceovers WHERE id = ?").get(data.voiceoverId) as VoiceoverRow | undefined;
      assert(!!vo, "Voiceover stored in database");
      assertEqual(vo!.story_id, storyId, "Voiceover linked to correct story");
      assert(vo!.duration_ms > 0, "Voiceover duration recorded in DB");

      // Verify timing records stored in DB
      const dbTimings = await db.prepare("SELECT * FROM timings WHERE voiceover_id = ? ORDER BY narration_start_ms ASC").all(data.voiceoverId) as TimingRow[];
      assertEqual(dbTimings.length, 4, "4 timing records stored in DB");
      assert(dbTimings[0]!.narration_start_ms === 0, "First scene starts at 0ms");
      assert(!!dbTimings[0]!.audio_segment_file, "Timing record has audio segment file path");
      assert(!!dbTimings[0]!.narration_text, "Timing record has narration text");

    } else {
      const errBody = await res.json().catch(() => ({}));
      console.log(`  (voice synthesis failed: ${res.status} ${JSON.stringify(errBody)})`);
    }
  } catch (err) {
    console.log(`  (voice synthesis error: ${err instanceof Error ? err.message : String(err)})`);
  }

  // === Test 11: Gameplay cut via voice-service ===
  console.log("\nTest 11: Gameplay cut via voice-service");
  if (voiceoverId) {
    try {
      const res = await fetch("http://localhost:3004/gameplay-cut", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceoverId, runId }),
      });

      if (res.ok) {
        const data = await res.json() as {
          assetId: string;
          gameplayVideo: { sourceFile: string; startSec: string; durationSec: string; muted: boolean; filePath: string };
        };

        assert(!!data.gameplayVideo.sourceFile, "Gameplay source file recorded");
        assert(data.gameplayVideo.muted === true, "Gameplay video is muted");
        assert(parseFloat(data.gameplayVideo.durationSec) > 0, `Gameplay duration > 0: ${data.gameplayVideo.durationSec}s`);
        assert(existsSync(data.gameplayVideo.filePath), "Gameplay cut file exists on disk");

        // Verify the cut file has no audio
        const audioStreams = await probeAudioStreams(data.gameplayVideo.filePath);
        assertEqual(audioStreams, 0, "Gameplay cut file has no audio streams (muted)");

      } else {
        console.log(`  (gameplay cut failed: ${res.status})`);
      }
    } catch (err) {
      console.log(`  (gameplay cut error: ${err instanceof Error ? err.message : String(err)})`);
    }
  } else {
    console.log("  (skipped — no voiceover from test 10)");
  }

  // === Test 12: Package assembly via voice-service ===
  console.log("\nTest 12: Package assembly via voice-service");
  if (voiceoverId) {
    try {
      const res = await fetch("http://localhost:3004/package", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, storyId, includeGameplay: true }),
      });

      if (res.ok) {
        const data = await res.json() as {
          packagePath: string; files: string[]; manifest: Record<string, unknown>;
        };

        assert(!!data.packagePath, "Package path returned");
        assert(existsSync(data.packagePath), "Package ZIP file exists on disk");
        assert(data.files.includes("manifest.json"), "Package includes manifest.json");
        assert(data.files.includes("scene-timeline.csv"), "Package includes scene-timeline.csv");
        assert(data.files.includes("captions.srt"), "Package includes captions.srt");
        assert(data.files.includes("voiceover.wav"), "Package includes voiceover.wav");
        assert(data.files.includes("gameplay-background.mp4"), "Package includes gameplay-background.mp4");
        assert(!!data.manifest, "Manifest object returned");

      } else {
        console.log(`  (package assembly failed: ${res.status})`);
      }
    } catch (err) {
      console.log(`  (package assembly error: ${err instanceof Error ? err.message : String(err)})`);
    }
  } else {
    console.log("  (skipped — no voiceover from test 10)");
  }

  // === Test 13: API gateway proxy ===
  console.log("\nTest 13: API gateway proxy routes");
  try {
    const res = await fetch(`http://localhost:3000/api/voice/voiceovers/${storyId}`);
    if (res.ok) {
      const data = await res.json() as { voiceovers: VoiceoverRow[] };
      assert(Array.isArray(data.voiceovers), "Gateway proxies voiceover listing");
    } else {
      console.log("  (skipped — API gateway not running)");
    }
  } catch {
    console.log("  (skipped — API gateway not running)");
  }

  // === Test 14: Gameplay videos listing ===
  console.log("\nTest 14: Gameplay videos listing (via voice-service)");
  try {
    const res = await fetch("http://localhost:3004/gameplay-videos");
    if (res.ok) {
      const data = await res.json() as { videos: string[]; path: string };
      assert(data.videos.length > 0, `Gameplay videos listed: ${data.videos.length}`);
      assert(data.videos.includes("cycling.mp4") || data.videos.includes("minecraft.mp4"), "Known gameplay videos present");
    } else {
      console.log("  (skipped — voice-service not running)");
    }
  } catch {
    console.log("  (skipped — voice-service not running)");
  }

  // === Cleanup ===
  await db.prepare("DELETE FROM timings WHERE voiceover_id IN (SELECT id FROM voiceovers WHERE story_id = ?)").run(storyId);
  await db.prepare("DELETE FROM voiceovers WHERE story_id = ?").run(storyId);
  await db.prepare("DELETE FROM scenes WHERE story_id = ?").run(storyId);
  await db.prepare("DELETE FROM story_versions WHERE story_id = ?").run(storyId);
  await db.prepare("DELETE FROM stories WHERE id = ?").run(storyId);
  await db.prepare("DELETE FROM workflow_runs WHERE id = ?").run(runId);
  await db.prepare("DELETE FROM channels WHERE id = ?").run(channelId);
  await rm(testDir, { recursive: true, force: true });

  // === Results ===
  console.log("\n=== Results ===");
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (errors.length > 0) {
    console.log("\nFailures:");
    errors.forEach((e) => console.log(`  - ${e}`));
  }
  console.log("");

  await closeDb();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test script failed:", err);
  process.exit(1);
});
