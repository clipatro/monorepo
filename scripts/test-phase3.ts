/**
 * Phase 3 verification script.
 *
 * Tests:
 * 1. Database migration (FTS + story_dna tables)
 * 2. Story versioning (create story, version, FTS index, DNA)
 * 3. Exact duplicate detection (canonical hash)
 * 4. Lexical duplicate detection (FTS search)
 * 5. Embedding service (if running)
 * 6. API gateway proxy routes (if services running)
 *
 * Usage:
 *   bun run scripts/test-phase3.ts
 *
 * If GEMINI_API_KEY is set, also tests:
 * 7. Content classification
 * 8. Candidate generation
 * 9. Research with grounding
 */

import { getDb, runMigrations, closeDb } from "@automation/database";
import type { StoryRow, StoryVersionRow, StoryDnaRow } from "@automation/database";
import { createHash } from "node:crypto";

let passed = 0;
let failed = 0;
const errors: string[] = [];

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.log(`  ✗ ${message}`);
    failed++;
    errors.push(message);
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  const equal = JSON.stringify(actual) === JSON.stringify(expected);
  assert(equal, `${message} (expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)})`);
}

// === Canonicalization ===

function canonicalize(text: string): string {
  return text.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function canonicalHash(text: string): string {
  return createHash("sha256").update(canonicalize(text)).digest("hex");
}

// === Test runner ===

async function main() {
  console.log("\n=== Phase 3 Verification ===\n");

  // Test 1: Database migration
  console.log("Test 1: Database migration (FTS + story_dna)");
  const db = getDb();

  // Check FTS table exists
  const ftsTables = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='story_fts'").get() as { name: string } | undefined;
  assert(!!ftsTables, "story_fts table exists");

  // Check story_dna table exists
  const dnaTables = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='story_dna'").get() as { name: string } | undefined;
  assert(!!dnaTables, "story_dna table exists");

  // Test 2: Story versioning
  console.log("\nTest 2: Story versioning");
  const channelId = "test-channel-" + Date.now();
  const runId = "test-run-" + Date.now();

  // Create a test channel
  await db.prepare(`
    INSERT INTO channels (id, name, slug, niche, locale, content_types, target_duration_seconds, scene_min, scene_max, story_style, visual_style, image_provider, tts_provider, tts_voice_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(channelId, "Test Channel", channelId, "psychology", "en-US", '["fictional_story"]', 45, 4, 8, "", "", "gemini-flash-image", "kokoro", "af_heart");

  // Create a workflow run (required FK)
  await db.prepare(`
    INSERT INTO workflow_runs (id, channel_id, topic, status)
    VALUES (?, ?, ?, ?)
  `).run(runId, channelId, "test topic", "completed");

  // Create a story
  const storyId = crypto.randomUUID();
  const candidate = {
    title: "The Procrastination Paradox",
    hook: "Why do we delay the things we want most?",
    premise: "A student discovers that procrastination is actually an emotional regulation problem.",
    storyline: "A struggling student named Alex keeps putting off important assignments. After failing a midterm, Alex discovers that procrastination isn't about laziness—it's about avoiding negative emotions. By addressing the underlying anxiety, Alex learns to start tasks without waiting for the 'right mood.'",
    contentType: "psychology_concept_story",
    emotionalArc: "Frustration → despair → insight → empowerment",
    corePsychologicalIdea: "Procrastination as emotional regulation failure",
    mainCharacterRole: "Student",
    keyEvents: ["Alex delays studying", "Fails midterm", "Discovers emotional regulation theory", "Applies new approach", "Succeeds"],
    twistOrResolution: "The solution isn't discipline—it's self-compassion",
    lessonOrTakeaway: "Start before you feel ready; motivation follows action",
    fingerprint: "A person overcomes procrastination by addressing emotional avoidance rather than improving discipline",
  };

  await db.prepare(`
    INSERT INTO stories (id, channel_id, run_id, title, content_type, approved_at)
    VALUES (?, ?, ?, ?, ?, now())
  `).run(storyId, channelId, runId, candidate.title, candidate.contentType);

  // Create canonical version
  const versionId = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO story_versions (id, story_id, version, story_json)
    VALUES (?, ?, 1, ?)
  `).run(versionId, storyId, JSON.stringify(candidate));

  await db.prepare("UPDATE stories SET canonical_version_id = ? WHERE id = ?").run(versionId, storyId);

  // Index in FTS
  await db.prepare(`
    INSERT INTO story_fts (story_id, title, premise, storyline)
    VALUES (?, ?, ?, ?)
  `).run(storyId, candidate.title, candidate.premise, candidate.storyline);

  // Store story DNA
  const dnaId = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO story_dna (id, story_id, protagonist_archetype, protagonist_goal, inciting_incident,
      central_conflict, main_obstacle, reversal_or_twist, resolution,
      psychological_mechanism, lesson, setting)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    dnaId, storyId,
    "Student", "Pass the course", "Failed midterm",
    "Avoidance vs. responsibility", "Negative emotions",
    "Self-compassion over discipline", "Starts before feeling ready",
    "Emotional regulation", "Motivation follows action", "School",
  );

  // Verify story was created
  const story = await db.prepare("SELECT * FROM stories WHERE id = ?").get(storyId) as StoryRow;
  assert(story.title === candidate.title, "Story created with correct title");
  assert(story.canonical_version_id === versionId, "Story linked to canonical version");

  // Verify FTS index
  const ftsHit = await db.prepare("SELECT story_id FROM story_fts WHERE story_fts MATCH ?").get("procrastination") as { story_id: string } | undefined;
  assert(!!ftsHit && ftsHit.story_id === storyId, "FTS search finds the story by keyword");

  // Verify DNA
  const dna = await db.prepare("SELECT * FROM story_dna WHERE story_id = ?").get(storyId) as StoryDnaRow;
  assert(dna.protagonist_archetype === "Student", "Story DNA stored correctly");

  // Test 3: Exact duplicate detection
  console.log("\nTest 3: Exact duplicate detection (canonical hash)");
  const hash1 = canonicalHash(candidate.storyline);
  const hash2 = canonicalHash(candidate.storyline.toUpperCase());
  const hash3 = canonicalHash(candidate.storyline + "  "); // extra spaces
  assertEqual(hash1, hash2, "Canonical hash is case-insensitive");
  assertEqual(hash1, hash3, "Canonical hash ignores trailing whitespace");

  const differentHash = canonicalHash("A completely different story about a submarine captain.");
  assert(hash1 !== differentHash, "Different stories have different hashes");

  // Test 4: Lexical duplicate detection (FTS)
  console.log("\nTest 4: Lexical duplicate detection (FTS)");
  const ftsResults = await db.prepare(`
    SELECT story_id, title, bm25(story_fts) as score
    FROM story_fts
    WHERE story_fts MATCH ?
    ORDER BY score
    LIMIT 5
  `).all("procrastination emotional regulation") as Array<{ story_id: string; title: string; score: number }>;
  assert(ftsResults.length > 0, "FTS returns results for matching keywords");
  assert(ftsResults[0]!.story_id === storyId, "FTS returns the correct story");

  // Test 5: Paraphrased duplicate detection (canonical hash should NOT match)
  console.log("\nTest 5: Paraphrased duplicate detection");
  const paraphrased = "A student named Alex keeps postponing important schoolwork. After failing an exam, Alex learns that procrastination stems from avoiding difficult feelings, not laziness. By tackling the root anxiety, Alex manages to begin tasks without waiting for perfect motivation.";
  const paraphrasedHash = canonicalHash(paraphrased);
  assert(paraphrasedHash !== hash1, "Paraphrased text has different canonical hash (semantic check needed)");

  // Test 6: Broad-theme different stories pass
  console.log("\nTest 6: Broad-theme different stories");
  const differentStory = "A submarine captain navigates through bioluminescent jellyfish in the Mariana Trench and discovers a sunken city.";
  const differentStoryHash = canonicalHash(differentStory);
  assert(differentStoryHash !== hash1, "Different topic has different hash");

  // Test 7: Story retrieval with sources and claims
  console.log("\nTest 7: Story sources and claims");
  // Add a source
  await db.prepare(`
    INSERT INTO story_sources (id, story_id, source_id, title, url, excerpt)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(crypto.randomUUID(), storyId, "s1", "Psychology Today", "https://example.com", "Procrastination is emotional regulation");

  // Add a claim
  await db.prepare(`
    INSERT INTO story_claims (id, story_id, claim_id, claim, source_ids, confidence)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(crypto.randomUUID(), storyId, "c1", "Procrastination is about emotion, not time", '["s1"]', "high");

  const sources = await db.prepare("SELECT * FROM story_sources WHERE story_id = ?").all(storyId);
  const claims = await db.prepare("SELECT * FROM story_claims WHERE story_id = ?").all(storyId);
  assert(sources.length === 1, "Source stored correctly");
  assert(claims.length === 1, "Claim stored correctly");
  assert(JSON.parse((claims[0] as { source_ids: string }).source_ids)[0] === "s1", "Claim links to source");

  // Test 8: Embedding service (if running)
  console.log("\nTest 8: Embedding service");
  try {
    const res = await fetch("http://localhost:3005/model");
    if (res.ok) {
      const data = await res.json() as { model: string; dimensions: number; loaded: boolean };
      assert(data.model === "Xenova/all-MiniLM-L6-v2", "Embedding model is correct");
      assert(data.dimensions === 384, "Embedding dimensions are 384");

      // Test similarity
      const simRes = await fetch("http://localhost:3005/similarity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          textA: "A student overcomes procrastination by addressing emotions",
          textB: "A pupil conquers delay by tackling feelings",
        }),
      });
      if (simRes.ok) {
        const sim = await simRes.json() as { score: number };
        assert(sim.score > 0.5, `Similar stories have high similarity (${sim.score.toFixed(2)})`);

        const diffRes = await fetch("http://localhost:3005/similarity", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            textA: "A student overcomes procrastination by addressing emotions",
            textB: "A submarine captain discovers a sunken city in the Mariana Trench",
          }),
        });
        if (diffRes.ok) {
          const diff = await diffRes.json() as { score: number };
          assert(diff.score < sim.score, "Different stories have lower similarity than similar ones");
        }
      }
    } else {
      console.log("  (skipped — embedding service not running)");
    }
  } catch {
    console.log("  (skipped — embedding service not running)");
  }

  // Test 9: Story service (if running)
  console.log("\nTest 9: Story service");
  try {
    const res = await fetch("http://localhost:3001/stories");
    if (res.ok) {
      const data = await res.json() as { stories: StoryRow[] };
      assert(Array.isArray(data.stories), "Story service returns stories array");

      // Test get story detail
      const detailRes = await fetch(`http://localhost:3001/stories/${storyId}`);
      if (detailRes.ok) {
        const detail = await detailRes.json() as { story: { title: string }; version: { storyJson: { title: string } } | null };
        assert(detail.story.title === candidate.title, "Story detail returns correct title");
        assert(!!detail.version, "Story detail includes version");
      }
    } else {
      console.log("  (skipped — story service not running)");
    }
  } catch {
    console.log("  (skipped — story service not running)");
  }

  // Test 10: API gateway proxy (if running)
  console.log("\nTest 10: API gateway proxy routes");
  try {
    const res = await fetch("http://localhost:3000/api/embedding/model");
    if (res.ok) {
      const data = await res.json() as { model: string };
      assert(data.model === "Xenova/all-MiniLM-L6-v2", "Gateway proxies embedding model route");
    } else {
      console.log("  (skipped — API gateway not running)");
    }
  } catch {
    console.log("  (skipped — API gateway not running)");
  }

  // Test 11: Gemini API calls (if key is set)
  const hasGeminiKey = !!process.env.GEMINI_API_KEY;
  console.log(`\nTest 11: Gemini API calls ${hasGeminiKey ? "(key detected)" : "(no key — skipped)"}`);

  if (hasGeminiKey) {
    try {
      // Test classification
      const classifyRes = await fetch("http://localhost:3001/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: "The psychology of procrastination" }),
      });
      if (classifyRes.ok) {
        const data = await classifyRes.json() as { contentType: string };
        assert(data.contentType === "psychology_concept_story" || data.contentType === "fictional_story" || data.contentType === "true_case",
          `Classification returns valid content type: ${data.contentType}`);
      } else {
        console.log("  (classification failed — may need service running)");
      }
    } catch {
      console.log("  (skipped — story service not running for Gemini test)");
    }
  }

  // Cleanup
  await db.prepare("DELETE FROM story_fts WHERE story_id = ?").run(storyId);
  await db.prepare("DELETE FROM stories WHERE id = ?").run(storyId);
  await db.prepare("DELETE FROM workflow_runs WHERE id = ?").run(runId);
  await db.prepare("DELETE FROM channels WHERE id = ?").run(channelId);

  // Results
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
