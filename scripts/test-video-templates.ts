/**
 * test-video-templates — Automated tests for Phase 8 template system.
 *
 * Tests:
 *  1. Template loading: both JSON configs load and validate
 *  2. Config merging: mergeTemplateConfig correctly merges defaults + overrides
 *  3. Step enabling: isStepEnabled returns correct values for each template
 *  4. Asset requirements: isAssetRequired returns correct values
 *  5. Scene plan config: sceneType and fields are correctly structured
 *
 * Run: bun run scripts/test-video-templates.ts
 */

import {
  loadTemplate,
  loadAllTemplates,
  listTemplateIds,
} from "../video-templates/index";
import {
  mergeTemplateConfig,
  isStepEnabled,
  isAssetRequired,
  getEnabledSteps,
  getStepDependencies,
  type TemplateConfig,
  type ChannelTemplateOverrides,
} from "@automation/contracts";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

function assertEqual<T>(actual: T, expected: T, msg: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  assert(a === e, `${msg} (got: ${a}, expected: ${e})`);
}

console.log("=== Video Templates Test Suite ===\n");

// === Test 1: Template loading ===
console.log("1. Template Loading");

const ids = await listTemplateIds();
assert(ids.length >= 2, `Should find at least 2 template files (found ${ids.length})`);
assert(ids.includes("gameplay-with-image-scenes"), "Should find gameplay-with-image-scenes template");
assert(ids.includes("ai-video-clips"), "Should find ai-video-clips template");

const allTemplates = await loadAllTemplates();
assert(allTemplates.length >= 2, `Should load at least 2 templates (loaded ${allTemplates.length})`);

const gameplay = await loadTemplate("gameplay-with-image-scenes");
assert(gameplay.id === "gameplay-with-image-scenes", "Gameplay template has correct id");
assert(gameplay.config.layout.width === 1080, "Gameplay template width is 1080");
assert(gameplay.config.layout.height === 1920, "Gameplay template height is 1920");
assert(gameplay.config.layout.aspectRatio === "9:16", "Gameplay template aspect ratio is 9:16");
assert(gameplay.config.render.fps === 60, "Gameplay template fps is 60");

const clips = await loadTemplate("ai-video-clips");
assert(clips.id === "ai-video-clips", "Clips template has correct id");
assert(clips.config.render.fps === 30, "Clips template fps is 30");
assert(clips.config.layout.width === 1080, "Clips template width is 1080");
assert(clips.config.layout.height === 1920, "Clips template height is 1920");

console.log();

// === Test 2: Config merging ===
console.log("2. Config Merging");

const defaults: TemplateConfig = gameplay.config;
const overrides: ChannelTemplateOverrides = {
  render: { fps: 30 } as any, // override fps
  pipeline: {
    steps: {
      image_generation: { enabled: false }, // disable image gen
    },
  },
};

const merged = mergeTemplateConfig(defaults, overrides);
assert(merged.render.fps === 30, "Merged render.fps should be overridden to 30");
assert(merged.layout.width === 1080, "Merged layout.width should remain 1080 (not overridden)");
assert(merged.pipeline.steps.image_generation.enabled === false, "Merged image_generation should be disabled");
assert(merged.pipeline.steps.scene_plan.enabled === true, "Merged scene_plan should remain enabled (not overridden)");

// Test that undefined overrides don't change anything
const noOverrides = mergeTemplateConfig(defaults, {});
assert(noOverrides.render.fps === 60, "No overrides → render.fps should remain 60");
assert(noOverrides.pipeline.steps.scene_plan.enabled === true, "No overrides → scene_plan still enabled");

console.log();

// === Test 3: Step enabling ===
console.log("3. Step Enabling");

// Gameplay template: image steps enabled, clip steps disabled
assert(isStepEnabled(gameplay.config, "scene_plan") === true, "Gameplay: scene_plan enabled");
assert(isStepEnabled(gameplay.config, "image_prompt_compilation") === true, "Gameplay: image_prompt_compilation enabled");
assert(isStepEnabled(gameplay.config, "image_generation") === true, "Gameplay: image_generation enabled");
assert(isStepEnabled(gameplay.config, "video_generation") === true, "Gameplay: video_generation enabled");
assert(isStepEnabled(gameplay.config, "clip_prompt_compilation") === false, "Gameplay: clip_prompt_compilation disabled");
assert(isStepEnabled(gameplay.config, "clip_generation") === false, "Gameplay: clip_generation disabled");

// Clips template: clip steps enabled, image steps disabled
assert(isStepEnabled(clips.config, "scene_plan") === true, "Clips: scene_plan enabled");
assert(isStepEnabled(clips.config, "clip_prompt_compilation") === true, "Clips: clip_prompt_compilation enabled");
assert(isStepEnabled(clips.config, "clip_generation") === true, "Clips: clip_generation enabled");
assert(isStepEnabled(clips.config, "video_generation") === true, "Clips: video_generation enabled");
assert(isStepEnabled(clips.config, "image_prompt_compilation") === false, "Clips: image_prompt_compilation disabled");
assert(isStepEnabled(clips.config, "image_generation") === false, "Clips: image_generation disabled");

// Unknown step → false
assert(isStepEnabled(gameplay.config, "unknown_step") === false, "Unknown step returns false");

console.log();

// === Test 3b: Enabled steps + dependencies (template-driven pipeline) ===
console.log("3b. Enabled Steps & Dependencies");

const gameplayEnabled = getEnabledSteps(gameplay.config);
assert(gameplayEnabled.includes("image_generation"), "Gameplay: image_generation in enabled steps");
assert(gameplayEnabled.includes("image_prompt_compilation"), "Gameplay: image_prompt_compilation in enabled steps");
assert(!gameplayEnabled.includes("clip_generation"), "Gameplay: clip_generation NOT in enabled steps");
assert(!gameplayEnabled.includes("clip_prompt_compilation"), "Gameplay: clip_prompt_compilation NOT in enabled steps");
assert(gameplayEnabled.includes("voice_generation"), "Gameplay: voice_generation in enabled steps");
assert(gameplayEnabled.includes("package_assembly"), "Gameplay: package_assembly in enabled steps");
assert(gameplayEnabled.includes("video_generation"), "Gameplay: video_generation in enabled steps");

const clipsEnabled = getEnabledSteps(clips.config);
assert(clipsEnabled.includes("clip_generation"), "Clips: clip_generation in enabled steps");
assert(clipsEnabled.includes("clip_prompt_compilation"), "Clips: clip_prompt_compilation in enabled steps");
assert(!clipsEnabled.includes("image_generation"), "Clips: image_generation NOT in enabled steps");
assert(!clipsEnabled.includes("image_prompt_compilation"), "Clips: image_prompt_compilation NOT in enabled steps");
assert(!clipsEnabled.includes("image_review"), "Clips: image_review NOT in enabled steps");

// Dependencies
const gameplayPkgDeps = getStepDependencies(gameplay.config, "package_assembly");
assert(gameplayPkgDeps.includes("image_review"), "Gameplay: package_assembly depends on image_review");
assert(gameplayPkgDeps.includes("audio_timing"), "Gameplay: package_assembly depends on audio_timing");
assert(!gameplayPkgDeps.includes("clip_generation"), "Gameplay: package_assembly does NOT depend on clip_generation");

const clipsPkgDeps = getStepDependencies(clips.config, "package_assembly");
assert(clipsPkgDeps.includes("clip_generation"), "Clips: package_assembly depends on clip_generation");
assert(clipsPkgDeps.includes("audio_timing"), "Clips: package_assembly depends on audio_timing");
assert(!clipsPkgDeps.includes("image_review"), "Clips: package_assembly does NOT depend on image_review");

// Topological order: concept_intake should come before content_classification
const gameplayIdx = (type: string) => gameplayEnabled.indexOf(type);
assert(gameplayIdx("concept_intake") < gameplayIdx("content_classification"), "Gameplay: concept_intake before content_classification");
assert(gameplayIdx("content_classification") < gameplayIdx("novelty_context"), "Gameplay: content_classification before novelty_context");
assert(gameplayIdx("scene_plan") < gameplayIdx("script_approval"), "Gameplay: scene_plan before script_approval");
assert(gameplayIdx("script_approval") < gameplayIdx("image_prompt_compilation"), "Gameplay: script_approval before image_prompt_compilation");

console.log();

// === Test 4: Asset requirements ===
console.log("4. Asset Requirements");

// Gameplay template
assert(isAssetRequired(gameplay.config, "images") === true, "Gameplay: images required");
assert(isAssetRequired(gameplay.config, "gameplayVideo") === true, "Gameplay: gameplayVideo required");
assert(isAssetRequired(gameplay.config, "voiceover") === true, "Gameplay: voiceover required");
assert(isAssetRequired(gameplay.config, "videoClips") === false, "Gameplay: videoClips not required");

// Clips template
assert(isAssetRequired(clips.config, "videoClips") === true, "Clips: videoClips required");
assert(isAssetRequired(clips.config, "images") === false, "Clips: images not required");
assert(isAssetRequired(clips.config, "gameplayVideo") === false, "Clips: gameplayVideo not required");

console.log();

// === Test 5: Scene plan config ===
console.log("5. Scene Plan Config");

assert(gameplay.config.scenePlan.sceneType === "image-scene", "Gameplay sceneType is image-scene");
assert(gameplay.config.scenePlan.imageRequirement === true, "Gameplay imageRequirement is true");
assert(gameplay.config.scenePlan.visualPlanFields !== undefined, "Gameplay has visualPlanFields");
assert(gameplay.config.scenePlan.clipPromptFields === undefined, "Gameplay has no clipPromptFields");

assert(clips.config.scenePlan.sceneType === "video-clip-scene", "Clips sceneType is video-clip-scene");
assert(clips.config.scenePlan.imageRequirement === false, "Clips imageRequirement is false");
assert(clips.config.scenePlan.clipPromptFields !== undefined, "Clips has clipPromptFields");
assert(clips.config.scenePlan.clipDurationSeconds !== undefined, "Clips has clipDurationSeconds");
assert(clips.config.scenePlan.clipDurationSeconds!.min === 5, "Clips clipDurationSeconds.min is 5");
assert(clips.config.scenePlan.clipDurationSeconds!.max === 10, "Clips clipDurationSeconds.max is 10");
assert(clips.config.scenePlan.visualPlanFields === undefined, "Clips has no visualPlanFields");

console.log();

// === Test 6: Invalid template validation ===
console.log("6. Invalid Template Validation");

try {
  // Try to load a non-existent template
  await loadTemplate("nonexistent-template");
  assert(false, "Loading non-existent template should throw");
} catch (err) {
  assert(true, "Loading non-existent template throws error");
}

console.log();

// === Summary ===
console.log("=== Summary ===");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log();
if (failed > 0) {
  console.error(`✗ ${failed} test(s) failed`);
  process.exit(1);
} else {
  console.log(`✓ All ${passed} tests passed`);
  process.exit(0);
}
