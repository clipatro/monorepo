/**
 * Cost tracker CLI — view spending summaries and recent entries.
 *
 * Usage:
 *   bun run cost              — show full summary
 *   bun run cost summary      — show full summary
 *   bun run cost recent       — show 20 recent entries
 *   bun run cost run <runId>  — show entries for a specific run
 *   bun run cost budget       — show current budget config and usage
 */

import {
  getCostSummary,
  getRecentEntries,
  getRunEntries,
  formatSummary,
  formatEntries,
  getBudgetConfig,
  closeLedger,
} from "./index.ts";

const command = process.argv[2] ?? "summary";

async function main() {
  switch (command) {
    case "summary": {
      const summary = await getCostSummary();
      console.log(formatSummary(summary));
      break;
    }
    case "recent": {
      const limit = parseInt(process.argv[3] ?? "20", 10);
      const entries = await getRecentEntries(limit);
      if (entries.length === 0) {
        console.log("No cost entries recorded yet.");
      } else {
        console.log(`=== Recent ${entries.length} Entries ===`);
        console.log(formatEntries(entries));
      }
      break;
    }
    case "run": {
      const runId = process.argv[3];
      if (!runId) {
        console.error("Usage: bun run cost run <runId>");
        process.exit(1);
      }
      const entries = await getRunEntries(runId);
      if (entries.length === 0) {
        console.log(`No entries found for run ${runId}.`);
      } else {
        const total = entries.reduce((s, e) => s + e.totalCost, 0);
        console.log(`=== Run ${runId}: ${entries.length} entries, $${total.toFixed(6)} total ===`);
        console.log(formatEntries(entries));
      }
      break;
    }
    case "budget": {
      const config = getBudgetConfig();
      const summary = await getCostSummary();
      console.log("=== Budget Configuration ===");
      console.log(`Per-run limit:  $${config.perRunUsd ?? "unlimited"}`);
      console.log(`Per-day limit:  $${config.perDayUsd ?? "unlimited"}`);
      console.log(`Global limit:   $${config.globalUsd ?? "unlimited"}`);
      console.log("");
      console.log("=== Current Usage ===");
      console.log(`Total paid spend: $${summary.totalPaidCost.toFixed(6)} / $${config.globalUsd ?? "∞"}`);
      const today = new Date().toISOString().slice(0, 10) + " 00:00:00";
      const daySummary = await getCostSummary({ sinceDate: today });
      console.log(`Today's spend:    $${daySummary.totalPaidCost.toFixed(6)} / $${config.perDayUsd ?? "∞"}`);
      break;
    }
    default:
      console.error(`Unknown command: ${command}`);
      console.error("Available: summary, recent, run <runId>, budget");
      process.exit(1);
  }
  await closeLedger();
}

main();
