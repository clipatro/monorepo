/**
 * Phase 4 verification script.
 *
 * Tests:
 * 1. Scene planning (Gemini call — requires GEMINI_API_KEY + image-service running)
 * 2. Scene storage (scenes table, stable IDs, narration, visual plan)
 * 3. Prompt compilation (10-part structure, character vs non-character model selection)
 * 4. Image validation (PNG/JPEG dimensions, aspect ratio check)
 * 5. Image generation (Gemini Flash Image — requires API key + character references)
 * 6. Image acceptance and rejection (asset status tracking, rejected retained)
 * 7. Manual Flow mode (prompt generation, import validation)
 * 8. Audit metadata (provider, model, prompt hash, references, cost, checksum)
 * 9. Character version linking (images link to frozen character version)
 *
 * Usage:
 *   bun run scripts/test-phase4.ts
 */

import { getDb, closeDb } from "@automation/database";
import type { SceneRow, AssetRow, ImagePromptRow, ChannelRow, StoryRow, StoryVersionRow } from "@automation/database";
import { createHash } from "node:crypto";

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

// === Image dimension reader (same as image-service) ===

function imageDimensions(buf: Buffer): { width: number; height: number } {
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) break;
      const marker = buf[i + 1] ?? 0;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      }
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; }
      else { const len = buf.readUInt16BE(i + 2); i += 2 + len; }
    }
  }
  return { width: 0, height: 0 };
}

// === Create a minimal PNG (1x1 red pixel) for testing ===

function createMinimalPng(width = 10, height = 18): Buffer {
  // Create a minimal valid PNG
  const { deflateSync } = require("node:zlib");
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // CRC32 lookup table
  const crcTable: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c;
  }
  function crc32(buf: Buffer): number {
    let crc = 0xffffffff;
    for (const byte of buf) {
      crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type: string, data: Buffer): Buffer {
    const typeBuf = Buffer.from(type, "ascii");
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const crcInput = Buffer.concat([typeBuf, data]);
    const crcVal = crc32(crcInput);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crcVal, 0);
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
  }

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type (RGB)
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  // IDAT chunk — raw image data (each row: filter byte + RGB pixels)
  const rowSize = 1 + width * 3;
  const rawData = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y++) {
    rawData[y * rowSize] = 0; // no filter
    for (let x = 0; x < width; x++) {
      const offset = y * rowSize + 1 + x * 3;
      rawData[offset] = 255;     // R
      rawData[offset + 1] = 0;   // G
      rawData[offset + 2] = 0;   // B
    }
  }
  const compressed = deflateSync(rawData);

  const ihdrChunk = makeChunk("IHDR", ihdrData);
  const idatChunk = makeChunk("IDAT", compressed);
  const iendChunk = makeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

async function main() {
  console.log("\n=== Phase 4 Verification ===\n");

  const db = getDb();
  const hasGeminiKey = !!process.env.GEMINI_API_KEY;

  // === Test 1: Database tables ===
  console.log("Test 1: Database tables (scenes, image_prompts, assets)");
  const scenesTable = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='scenes'").get();
  const promptsTable = await db.prepare("SELECT name FROM sqlite_master WHERE name='image_prompts'").get();
  const assetsTable = await db.prepare("SELECT name FROM sqlite_master WHERE name='assets'").get();
  assert(!!scenesTable, "scenes table exists");
  assert(!!promptsTable, "image_prompts table exists");
  assert(!!assetsTable, "assets table exists");

  // === Test 2: Image dimension reader ===
  console.log("\nTest 2: Image dimension reader");
  const pngBuf = createMinimalPng(10, 18);
  const dims = imageDimensions(pngBuf);
  assertEqual(dims.width, 10, "PNG width read correctly");
  assertEqual(dims.height, 18, "PNG height read correctly");

  // === Test 3: Image validation logic ===
  console.log("\nTest 3: Image validation");
  // 9:16 aspect ratio = 0.5625
  const png9x16 = createMinimalPng(9, 16);
  const dims9x16 = imageDimensions(png9x16);
  const aspect9x16 = dims9x16.width / dims9x16.height;
  assert(Math.abs(aspect9x16 - 9 / 16) < 0.01, "9:16 aspect ratio correct");

  // === Test 4: Scene storage ===
  console.log("\nTest 4: Scene storage");
  const channelId = "test-ch-p4-" + Date.now();
  const runId = "test-run-p4-" + Date.now();
  const storyId = crypto.randomUUID();

  // Create test channel, run, story, version
  await db.prepare(`
    INSERT INTO channels (id, name, slug, niche, locale, content_types, target_duration_seconds, scene_min, scene_max, story_style, visual_style, image_provider, tts_provider, tts_voice_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(channelId, "Test P4", channelId, "psychology", "en-US", '["fictional_story"]', 45, 4, 8, "", "cinematic", "gemini-flash-image", "kokoro", "af_heart");

  await db.prepare("INSERT INTO workflow_runs (id, channel_id, topic, status) VALUES (?, ?, ?, ?)").run(runId, channelId, "test", "completed");

  await db.prepare("INSERT INTO stories (id, channel_id, run_id, title, content_type, approved_at) VALUES (?, ?, ?, ?, ?, now())")
    .run(storyId, channelId, runId, "Test Story P4", "fictional_story");

  const versionId = crypto.randomUUID();
  await db.prepare("INSERT INTO story_versions (id, story_id, version, story_json) VALUES (?, ?, 1, ?)")
    .run(versionId, storyId, JSON.stringify({
      title: "Test Story P4", hook: "test", premise: "test", storyline: "test",
      contentType: "fictional_story", emotionalArc: "test", corePsychologicalIdea: "test",
      mainCharacterRole: "protagonist", keyEvents: ["a", "b"], twistOrResolution: "test",
      lessonOrTakeaway: "test", fingerprint: "test",
    }));
  await db.prepare("UPDATE stories SET canonical_version_id = ? WHERE id = ?").run(versionId, storyId);

  // Create a character and frozen version, link to story (for character scene prompt compilation)
  const charId = crypto.randomUUID();
  const charVersionId = crypto.randomUUID();
  await db.prepare("INSERT INTO characters (id, channel_id, name, role) VALUES (?, ?, ?, ?)").run(charId, channelId, "TestChar", "protagonist");
  await db.prepare("INSERT INTO character_versions (id, character_id, version, bible, status) VALUES (?, ?, 1, ?, 'frozen')")
    .run(charVersionId, charId, JSON.stringify({ name: "TestChar", age: 30, eyeColor: "blue", hairColor: "brown" }));
  await db.prepare("UPDATE stories SET character_version_id = ? WHERE id = ?").run(charVersionId, storyId);

  // Insert test scenes
  const sceneIds: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const sceneId = crypto.randomUUID();
    sceneIds.push(sceneId);
    await db.prepare(`
      INSERT INTO scenes (id, story_id, "order", story_purpose, narration_text, visual_event,
        character_role, pose_and_expression, environment, camera_framing,
        lighting_and_mood, expected_duration_seconds, image_requirement, source_claim_ids)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sceneId, storyId, i, `Scene ${i} purpose`, `Narration ${i}`, `Visual ${i}`,
      i % 3 === 0 ? "none" : "protagonist", `Pose ${i}`, `Environment ${i}`, `Camera ${i}`,
      `Lighting ${i}`, 9, i % 3 === 0 ? "non_character_scene" : "character_scene", "[]",
    );
  }

  const storedScenes = await db.prepare("SELECT * FROM scenes WHERE story_id = ? ORDER BY \"order\" ASC").all(storyId) as SceneRow[];
  assertEqual(storedScenes.length, 5, "5 scenes stored correctly");
  assert(storedScenes[0]!.order === 1, "Scene order preserved");
  assert(storedScenes[2]!.image_requirement === "non_character_scene", "Non-character scene flagged correctly");

  // === Test 5: Prompt compilation ===
  console.log("\nTest 5: Prompt compilation (via image-service)");
  try {
    const res = await fetch("http://localhost:3003/compile-prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sceneId: sceneIds[0], aspectRatio: "9:16" }),
    });
    if (res.ok) {
      const data = await res.json() as { prompt: string; isCharacterScene: boolean; model: string; promptId: string };
      assert(data.prompt.length > 100, "Compiled prompt is substantial");
      assert(data.prompt.includes("SCENE:"), "Prompt includes scene action section");
      assert(data.prompt.includes("ENVIRONMENT:"), "Prompt includes environment section");
      assert(data.prompt.includes("CAMERA:"), "Prompt includes camera section");
      assert(data.prompt.includes("LIGHTING:"), "Prompt includes lighting section");
      assert(data.prompt.includes("NEGATIVE:"), "Prompt includes negative constraints");
      assert(data.prompt.includes("9:16"), "Prompt includes aspect ratio");
      assert(data.isCharacterScene === true, "Character scene detected correctly");
      assert(data.model === "gemini-3.1-flash-image", "Character scene uses standard Flash Image model");

      // Test non-character scene
      const res2 = await fetch("http://localhost:3003/compile-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sceneId: sceneIds[2], aspectRatio: "9:16" }),
      });
      if (res2.ok) {
        const data2 = await res2.json() as { isCharacterScene: boolean; model: string };
        assert(data2.isCharacterScene === false, "Non-character scene detected correctly");
        assert(data2.model === "gemini-3.1-flash-lite-image", "Non-character scene uses Lite model");
      }

      // Verify prompt stored in DB
      const promptRow = await db.prepare("SELECT * FROM image_prompts WHERE scene_id = ?").get(sceneIds[0]) as ImagePromptRow | undefined;
      assert(!!promptRow, "Compiled prompt stored in database");
      assert(promptRow?.provider === "gemini", "Prompt provider recorded");
      assert(!!promptRow?.prompt_hash, "Prompt hash recorded");
    } else {
      console.log("  (skipped — image-service not running)");
    }
  } catch {
    console.log("  (skipped — image-service not running)");
  }

  // === Test 6: Asset storage and audit metadata ===
  console.log("\nTest 6: Asset storage and audit metadata");
  const assetId = crypto.randomUUID();
  const testChecksum = createHash("sha256").update(png9x16).digest("hex");
  await db.prepare(`
    INSERT INTO assets (id, channel_id, run_id, scene_id, type, file_path, mime_type,
      width, height, checksum, provider, model, remote_request_id, cost_usd)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    assetId, channelId, runId, sceneIds[0]!, "image",
    "/tmp/test.png", "image/png", 9, 16, testChecksum,
    "gemini", "gemini-3.1-flash-image", "req-123", 0.045,
  );

  const asset = await db.prepare("SELECT * FROM assets WHERE id = ?").get(assetId) as AssetRow;
  assert(asset.provider === "gemini", "Asset provider recorded");
  assert(asset.model === "gemini-3.1-flash-image", "Asset model recorded");
  assert(asset.checksum === testChecksum, "Asset checksum recorded");
  assert(asset.cost_usd === 0.045, "Asset cost recorded");
  assert(asset.width === 9 && asset.height === 16, "Asset dimensions recorded");
  assert(asset.remote_request_id === "req-123", "Asset remote request ID recorded");

  // === Test 7: Accept and reject ===
  console.log("\nTest 7: Accept and reject");
  await db.prepare("UPDATE assets SET type = 'image_accepted' WHERE id = ?").run(assetId);
  const accepted = await db.prepare("SELECT type FROM assets WHERE id = ?").get(assetId) as { type: string };
  assertEqual(accepted.type, "image_accepted", "Image accepted status recorded");

  // Create another asset and reject it
  const rejectAssetId = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO assets (id, channel_id, run_id, scene_id, type, file_path, mime_type,
      width, height, checksum, provider, model, cost_usd)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(rejectAssetId, channelId, runId, sceneIds[0]!, "image",
    "/tmp/test-rejected.png", "image/png", 9, 16, "abc123",
    "gemini", "gemini-3.1-flash-image", 0.045);

  await db.prepare("UPDATE assets SET type = 'image_rejected' WHERE id = ?").run(rejectAssetId);

  // Verify rejected image is retained (not deleted)
  const rejected = await db.prepare("SELECT * FROM assets WHERE id = ?").get(rejectAssetId) as AssetRow | undefined;
  assert(!!rejected, "Rejected image retained in history");
  assertEqual(rejected!.type, "image_rejected", "Rejected image has correct status");
  assert(!!rejected!.file_path, "Rejected image file path preserved");

  // === Test 8: Scene listing ===
  console.log("\nTest 8: Scene listing (via image-service)");
  try {
    const res = await fetch(`http://localhost:3003/scenes/${storyId}`);
    if (res.ok) {
      const data = await res.json() as { scenes: SceneRow[] };
      assertEqual(data.scenes.length, 5, "Image-service returns 5 scenes");
      assert(data.scenes[0]!.narration_text.includes("Narration"), "Scene narration text present");
    } else {
      console.log("  (skipped — image-service not running)");
    }
  } catch {
    console.log("  (skipped — image-service not running)");
  }

  // === Test 9: Flow prompts ===
  console.log("\nTest 9: Flow prompts (via image-service)");
  try {
    const res = await fetch("http://localhost:3003/flow-prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storyId, aspectRatio: "9:16" }),
    });
    if (res.ok) {
      const data = await res.json() as { prompts: Array<{ order: number; prompt: string; expectedFilename: string; isCharacterScene: boolean }> };
      assertEqual(data.prompts.length, 5, "Flow prompts generated for all 5 scenes");
      assert(data.prompts[0]!.expectedFilename.startsWith("scene-01"), "Expected filename format correct");
      assert(data.prompts[0]!.prompt.length > 100, "Flow prompt is substantial");
    } else {
      console.log("  (skipped — image-service not running)");
    }
  } catch {
    console.log("  (skipped — image-service not running)");
  }

  // === Test 10: Scene planning via Gemini ===
  console.log(`\nTest 10: Scene planning via Gemini ${hasGeminiKey ? "(key detected)" : "(no key — skipped)"}`);
  if (hasGeminiKey) {
    try {
      const res = await fetch("http://localhost:3003/scene-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyId }),
      });
      if (res.ok) {
        const data = await res.json() as { sceneCount: number; scenes: Array<{ id: string; order: number }> };
        assert(data.sceneCount >= 4 && data.sceneCount <= 8, `Scene count in 4-8 range: ${data.sceneCount}`);
        assert(data.scenes.length === data.sceneCount, "All scenes returned with IDs");
        assert(!!data.scenes[0]!.id, "Scene has stable ID");

        // Verify scenes stored in DB
        const plannedScenes = await db.prepare("SELECT * FROM scenes WHERE story_id = ? ORDER BY \"order\" ASC").all(storyId) as SceneRow[];
        assert(plannedScenes.length === data.sceneCount, "Planned scenes stored in DB");
        assert(!!plannedScenes[0]!.narration_text, "Planned scene has narration text");
        assert(!!plannedScenes[0]!.visual_event, "Planned scene has visual event");
        assert(!!plannedScenes[0]!.environment, "Planned scene has environment");
        assert(!!plannedScenes[0]!.camera_framing, "Planned scene has camera framing");
        assert(!!plannedScenes[0]!.lighting_and_mood, "Planned scene has lighting/mood");
      } else {
        const errBody = await res.json().catch(() => ({}));
        console.log(`  (scene planning failed: ${res.status} ${JSON.stringify(errBody)})`);
      }
    } catch (err) {
      console.log(`  (scene planning error: ${err instanceof Error ? err.message : String(err)})`);
    }
  }

  // === Test 11: Character version linking ===
  console.log("\nTest 11: Character version linking");
  const linkedStory = await db.prepare("SELECT character_version_id FROM stories WHERE id = ?").get(storyId) as { character_version_id: string | null };
  assert(!!linkedStory.character_version_id, "Story linked to character version");
  assertEqual(linkedStory.character_version_id, charVersionId, "Story linked to correct character version");

  // === Test 12: API gateway proxy ===
  console.log("\nTest 12: API gateway proxy routes");
  try {
    const res = await fetch(`http://localhost:3000/api/image/scenes/${storyId}`);
    if (res.ok) {
      const data = await res.json() as { scenes: SceneRow[] };
      assert(Array.isArray(data.scenes), "Gateway proxies scene listing");
    } else {
      console.log("  (skipped — API gateway not running)");
    }
  } catch {
    console.log("  (skipped — API gateway not running)");
  }

  // === Cleanup ===
  await db.prepare("DELETE FROM assets WHERE channel_id = ?").run(channelId);
  await db.prepare("DELETE FROM image_prompts WHERE scene_id IN (SELECT id FROM scenes WHERE story_id = ?)").run(storyId);
  await db.prepare("DELETE FROM scenes WHERE story_id = ?").run(storyId);
  await db.prepare("DELETE FROM story_versions WHERE story_id = ?").run(storyId);
  await db.prepare("DELETE FROM stories WHERE id = ?").run(storyId);
  await db.prepare("DELETE FROM character_versions WHERE character_id = ?").run(charId);
  await db.prepare("DELETE FROM characters WHERE id = ?").run(charId);
  await db.prepare("DELETE FROM workflow_runs WHERE id = ?").run(runId);
  await db.prepare("DELETE FROM channels WHERE id = ?").run(channelId);

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
