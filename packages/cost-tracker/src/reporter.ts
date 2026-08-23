/**
 * Cost reporter — formats cost summaries for CLI, API, and UI consumption.
 */

import type { CostSummary, CostEntry } from "./ledger.ts";

/** Format a cost summary as a human-readable string. */
export function formatSummary(summary: CostSummary): string {
  const lines: string[] = [];
  lines.push("=== Cost Summary ===");
  lines.push(`Total spend:     $${summary.totalCost.toFixed(6)}`);
  lines.push(`  Paid:          $${summary.totalPaidCost.toFixed(6)} (${summary.totalPaidCalls} calls)`);
  lines.push(`  Free:          ${summary.totalFreeCalls} calls ($0.00)`);
  lines.push("");

  lines.push("By Provider:");
  for (const [provider, data] of Object.entries(summary.byProvider).sort((a, b) => b[1].cost - a[1].cost)) {
    lines.push(`  ${provider.padEnd(12)} $${data.cost.toFixed(6)} (${data.calls} calls)`);
  }
  lines.push("");

  lines.push("By Model:");
  for (const [model, data] of Object.entries(summary.byModel).sort((a, b) => b[1].cost - a[1].cost)) {
    lines.push(`  ${model.padEnd(30)} $${data.cost.toFixed(6)} (${data.calls} calls)`);
  }
  lines.push("");

  lines.push("By Capability:");
  for (const [cap, data] of Object.entries(summary.byCapability).sort((a, b) => b[1].cost - a[1].cost)) {
    lines.push(`  ${cap.padEnd(25)} $${data.cost.toFixed(6)} (${data.calls} calls)`);
  }

  if (Object.keys(summary.byRun).length > 0) {
    lines.push("");
    lines.push("By Run:");
    for (const [runId, data] of Object.entries(summary.byRun).sort((a, b) => b[1].cost - a[1].cost)) {
      lines.push(`  ${runId.padEnd(20)} $${data.cost.toFixed(6)} (${data.calls} calls)`);
    }
  }

  return lines.join("\n");
}

/** Format a single cost entry as a line. */
export function formatEntry(entry: CostEntry): string {
  const cost = entry.isFree ? "FREE" : `$${entry.totalCost.toFixed(6)}`;
  const tokens = entry.inputTokens > 0 || entry.outputTokens > 0
    ? `${entry.inputTokens}in/${entry.outputTokens}out`
    : "";
  const images = entry.imageCount > 0 ? `${entry.imageCount}img` : "";
  const meta = [tokens, images].filter(Boolean).join(" ");
  return `[${entry.timestamp}] ${entry.capability.padEnd(20)} ${entry.provider.padEnd(10)}/${entry.model.padEnd(30)} ${cost.padEnd(12)} ${meta}`;
}

/** Format recent entries as a list. */
export function formatEntries(entries: CostEntry[]): string {
  return entries.map(formatEntry).join("\n");
}

/** Format a summary as JSON (for API/UI consumption). */
export function summaryToJson(summary: CostSummary): string {
  return JSON.stringify(summary, null, 2);
}
