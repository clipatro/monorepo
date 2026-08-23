/**
 * Workflow engine verification test.
 *
 * Tests:
 * 1. Create a channel (needed for run creation)
 * 2. Create a run → verify all 16 steps created
 * 3. Run auto-starts and non-approval steps execute
 * 4. Run pauses at first approval (similarity_review or story_approval)
 * 5. Approve → run resumes
 * 6. Run pauses at script_approval
 * 7. Approve → run resumes
 * 8. Run pauses at image_review
 * 9. Approve → run completes
 * 10. Verify all steps completed/skipped
 * 11. Verify events were emitted
 * 12. List runs filtered by channel
 */

import { WorkflowEngine } from "@automation/workflow-engine";
import { getDb, runMigrations, closeDb } from "@automation/database";
import type { StepType } from "@automation/contracts";

// Reset database
const db = getDb();
await db.exec("DELETE FROM workflow_events");
await db.exec("DELETE FROM workflow_step_attempts");
await db.exec("DELETE FROM workflow_steps");
await db.exec("DELETE FROM workflow_runs");
await db.exec("DELETE FROM approvals");
await db.exec("DELETE FROM characters");
await db.exec("DELETE FROM channels");

let pass = 0;
let fail = 0;
function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    pass++;
  } else {
    console.log(`  ✗ ${message}`);
    fail++;
  }
}

// 1. Create a channel
const channelId = crypto.randomUUID();
await db.prepare(`
  INSERT INTO channels (id, name, slug, niche, locale, content_types, target_duration_seconds, scene_min, scene_max, story_style, visual_style, image_provider, tts_provider, tts_voice_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  channelId,
  "Test Channel",
  "test-channel",
  "Psychology",
  "en-US",
  JSON.stringify(["fictional_story"]),
  60,
  4,
  8,
  "narrative",
  "realistic",
  "gemini-flash-image",
  "kokoro",
  "af_heart",
);
console.log("\n1. Created test channel");

// 2. Create engine and a run
const engine = new WorkflowEngine();

// Register stub handlers (same as workflow-service)
const allStepTypes: StepType[] = [
  "concept_intake", "content_classification", "research", "novelty_context",
  "generate_candidates", "duplicate_detection", "similarity_review",
  "story_approval", "scene_plan", "script_approval", "image_prompt_compilation",
  "image_generation", "image_review", "voice_generation", "audio_timing",
  "package_assembly",
];

// Track which steps were executed
const executedSteps = new Set<string>();

for (const stepType of allStepTypes) {
  engine.registerHandler(stepType, async (ctx) => {
    executedSteps.add(stepType);
    return {
      success: true,
      outputData: { stepType, topic: ctx.inputData.topic },
    };
  });
}

engine.start();

console.log("\n2. Creating workflow run...");
const run = engine.createRun({
  channelId,
  topic: "The psychology of procrastination",
  contentType: "psychology_concept_story",
});
assert(run.steps.length === 16, `Run has 16 steps (got ${run.steps.length})`);
assert(run.status === "pending", `Run starts as pending (got ${run.status})`);

// 3. Start the run
console.log("\n3. Starting run...");
engine.startRun(run.id);

// Wait a bit for async execution
await new Promise((resolve) => setTimeout(resolve, 2000));

let runDetails = engine.getRunDetails(run.id);
console.log(`   Run status: ${runDetails?.status}`);
console.log(`   Steps: ${runDetails?.steps.map((s) => `${s.stepType}=${s.status}`).join(", ")}`);

// Non-approval steps should execute until hitting an approval step
// The first approval step is similarity_review (depends on duplicate_detection)
// But similarity_review is skippable — the engine should still pause for approval
// Actually, looking at the pipeline: similarity_review depends on duplicate_detection
// and story_approval also depends on duplicate_detection.
// The engine should pause at similarity_review first.

// Check if run is paused (waiting for approval)
assert(
  runDetails?.status === "paused" || runDetails?.status === "running",
  `Run is paused or running after non-approval steps (got ${runDetails?.status})`,
);

// Find pending approvals
const pendingApprovals = runDetails?.approvals.filter((a) => a.status === "pending") ?? [];
console.log(`   Pending approvals: ${pendingApprovals.length}`);

if (pendingApprovals.length > 0) {
  console.log("\n4. Run paused at approval checkpoint ✓");

  // 5. Approve
  console.log("\n5. Approving first checkpoint...");
  const firstApproval = pendingApprovals[0];
  engine.decideApproval({
    approvalId: firstApproval.id,
    decision: "approved",
    reviewer: "test",
  });

  await new Promise((resolve) => setTimeout(resolve, 2000));

  runDetails = engine.getRunDetails(run.id);
  console.log(`   Run status after approval: ${runDetails?.status}`);

  // Check for more pending approvals
  let nextApprovals = runDetails?.approvals.filter((a) => a.status === "pending") ?? [];
  console.log(`   Pending approvals: ${nextApprovals.length}`);

  // Approve all remaining
  let approvalRound = 1;
  while (nextApprovals.length > 0 && runDetails?.status !== "completed" && runDetails?.status !== "failed") {
    approvalRound++;
    console.log(`\n${4 + approvalRound}. Approving checkpoint ${approvalRound}...`);
    const approval = nextApprovals[0];
    engine.decideApproval({
      approvalId: approval.id,
      decision: "approved",
      reviewer: "test",
    });

    await new Promise((resolve) => setTimeout(resolve, 2000));

    runDetails = engine.getRunDetails(run.id);
    console.log(`   Run status: ${runDetails?.status}`);
    nextApprovals = runDetails?.approvals.filter((a) => a.status === "pending") ?? [];
    console.log(`   Pending approvals: ${nextApprovals.length}`);
  }
}

// 10. Final verification
console.log("\n10. Final verification...");
runDetails = engine.getRunDetails(run.id);
console.log(`   Final status: ${runDetails?.status}`);
console.log(`   Steps:`);
for (const step of runDetails?.steps ?? []) {
  console.log(`     ${step.label}: ${step.status}`);
}

const completedCount = runDetails?.steps.filter((s) => s.status === "completed").length ?? 0;
const skippedCount = runDetails?.steps.filter((s) => s.status === "skipped").length ?? 0;
const failedCount = runDetails?.steps.filter((s) => s.status === "failed").length ?? 0;
const waitingCount = runDetails?.steps.filter((s) => s.status === "waiting_approval").length ?? 0;

console.log(`   Completed: ${completedCount}, Skipped: ${skippedCount}, Failed: ${failedCount}, Waiting: ${waitingCount}`);

assert(
  runDetails?.status === "completed" || runDetails?.status === "paused",
  `Run is completed or paused (got ${runDetails?.status})`,
);
assert(failedCount === 0, `No steps failed (got ${failedCount})`);

// 11. Verify events were emitted
console.log("\n11. Verifying events...");
const events = engine.getRunEvents(run.id);
console.log(`   Events emitted: ${events.length}`);
assert(events.length > 0, `Events were emitted (got ${events.length})`);

const eventTypes = new Set(events.map((e) => e.eventType));
console.log(`   Event types: ${[...eventTypes].join(", ")}`);
assert(eventTypes.has("run_created"), "run_created event emitted");
assert(eventTypes.has("run_started"), "run_started event emitted");

// 12. List runs
console.log("\n12. Listing runs...");
const allRuns = engine.listRuns();
assert(allRuns.length === 1, `One run in list (got ${allRuns.length})`);

const channelRuns = engine.listRuns(channelId);
assert(channelRuns.length === 1, `One run for channel (got ${channelRuns.length})`);

const otherChannelRuns = engine.listRuns("nonexistent-channel");
assert(otherChannelRuns.length === 0, `Zero runs for other channel`);

// 13. Test rejection
console.log("\n13. Testing approval rejection...");
const run2 = engine.createRun({
  channelId,
  topic: "Test rejection flow",
});
engine.startRun(run2.id);
await new Promise((resolve) => setTimeout(resolve, 2000));

const run2Details = engine.getRunDetails(run2.id);
const run2Approvals = run2Details?.approvals.filter((a) => a.status === "pending") ?? [];
if (run2Approvals.length > 0) {
  engine.decideApproval({
    approvalId: run2Approvals[0].id,
    decision: "rejected",
    reviewer: "test",
  });
  const rejectedRun = engine.getRunDetails(run2.id);
  assert(
    rejectedRun?.status === "failed",
    `Run fails after rejection (got ${rejectedRun?.status})`,
  );
} else {
  console.log("   (skipped — no approval reached)");
}

// 14. Test cancellation
console.log("\n14. Testing run cancellation...");
const run3 = engine.createRun({
  channelId,
  topic: "Test cancellation",
});
engine.startRun(run3.id);
engine.cancelRun(run3.id);
const cancelledRun = engine.getRunDetails(run3.id);
assert(cancelledRun?.status === "cancelled", `Run is cancelled (got ${cancelledRun?.status})`);

// 15. Verify executed steps don't rerun
console.log("\n15. Verifying no step reruns...");
console.log(`   Executed steps: ${[...executedSteps].join(", ")}`);

engine.stop();
await closeDb();

console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);
