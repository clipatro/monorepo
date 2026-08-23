/**
 * Spike runner — executes Phase 0 spikes and prints a summary.
 * Usage: bun run spikes/run.ts [spike-id]
 * If no id given, runs all spikes.
 */

import { loadEnv, type SpikeResult } from "./lib/spike.ts";

await loadEnv();

const spikeIds = process.argv.slice(2);

const allSpikes: Record<string, () => Promise<SpikeResult>> = {
  "s01": () => import("./s01-gemini-structured-json.ts").then((m) => m.run()),
  "s02": () => import("./s02-gemini-grounding.ts").then((m) => m.run()),
  "s03": () => import("./s03-gemini-image.ts").then((m) => m.run()),
  "s04": () => import("./s04-kokoro-tts.ts").then((m) => m.run()),
  "s05": () => import("./s05-gemini-tts.ts").then((m) => m.run()),
  "s06": () => import("./s06-ffmpeg.ts").then((m) => m.run()),
  "s07": () => import("./s07-embeddings.ts").then((m) => m.run()),
  "s08": () => import("./s08-gemini-multi-ref.ts").then((m) => m.run()),
  "s09": () => import("./s09-noahvale-scene.ts").then((m) => m.run()),
  "s10": () => import("./s10-runware-flux2-klein-9b.ts").then((m) => m.run()),
  "s11": () => import("./s11-runware-flux2-klein-4b.ts").then((m) => m.run()),
  "s12": () => import("./s12-optimized-comparison.ts").then((m) => m.run()),
  "s13": () => import("./s13-hyperframes-video.ts").then((m) => m.run(process.argv[3])),
};

const toRun = spikeIds.length > 0 ? spikeIds : Object.keys(allSpikes);

const results: SpikeResult[] = [];
for (const id of toRun) {
  const fn = allSpikes[id];
  if (!fn) {
    console.error(`Unknown spike: ${id}`);
    console.error(`Available: ${Object.keys(allSpikes).join(", ")}`);
    process.exit(1);
  }
  console.log(`\n=== Running ${id} ===`);
  try {
    const result = await fn();
    results.push(result);
    console.log(`Result: ${result.result}`);
    console.log(`Measurements:`, result.measurements);
    if (result.notes) console.log(`Notes: ${result.notes}`);
  } catch (err) {
    console.error(`Spike ${id} threw:`, err);
    results.push({
      id,
      name: id,
      goal: "(errored before producing a result)",
      result: "fail",
      measurements: { error: String(err) },
      notes: "Spike threw an unhandled error.",
      artifactPaths: [],
    });
  }
}

console.log("\n=== Summary ===");
for (const r of results) {
  console.log(`${r.id} ${r.name}: ${r.result}`);
}
console.log(
  "\nFull markdown results are written to each spike. Append to Obsidian Spike Results.md manually or via the record script.",
);
