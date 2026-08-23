/**
 * Budget guard — enforces spending limits before allowing paid provider calls.
 *
 * Checks against configurable budgets:
 * - Per-run budget (max spend for a single workflow run)
 * - Per-day budget (max spend per calendar day)
 * - Global budget (max total spend, reset monthly)
 *
 * If a call would exceed a budget, the guard throws a BudgetExceededError
 * that the workflow runner can catch and surface as an approval checkpoint.
 */

import { getCostSummary, getRunEntries } from "./ledger.ts";
import { getPricing } from "./pricing.ts";

export interface BudgetConfig {
  /** Max spend per workflow run, in USD. */
  perRunUsd?: number;
  /** Max spend per calendar day, in USD. */
  perDayUsd?: number;
  /** Max total spend, in USD (manual reset). */
  globalUsd?: number;
}

export class BudgetExceededError extends Error {
  constructor(
    message: string,
    readonly budgetType: "per_run" | "per_day" | "global",
    readonly limit: number,
    readonly current: number,
    readonly attempted: number,
  ) {
    super(message);
    this.name = "BudgetExceededError";
  }
}

/** Default budget configuration. Override via env or config. */
export const DEFAULT_BUDGET: BudgetConfig = {
  perRunUsd: 2.0, // Max $2 per video run (story + research + 4-8 images + TTS)
  perDayUsd: 10.0, // Max $10 per day
  globalUsd: 100.0, // Max $100 total (manual reset)
};

/** Get the effective budget config (env overrides > defaults). */
export function getBudgetConfig(): BudgetConfig {
  return {
    perRunUsd: parseFloat(process.env.COST_BUDGET_PER_RUN ?? "") || DEFAULT_BUDGET.perRunUsd,
    perDayUsd: parseFloat(process.env.COST_BUDGET_PER_DAY ?? "") || DEFAULT_BUDGET.perDayUsd,
    globalUsd: parseFloat(process.env.COST_BUDGET_GLOBAL ?? "") || DEFAULT_BUDGET.globalUsd,
  };
}

/** Check if a planned cost would exceed any budget. Throws if exceeded. */
export async function checkBudget(
  plannedCost: number,
  options: { runId?: string },
): Promise<void> {
  const config = getBudgetConfig();
  if (plannedCost <= 0) return; // Free calls always pass

  // Check global budget
  if (config.globalUsd !== undefined) {
    const globalSummary = await getCostSummary();
    if (globalSummary.totalPaidCost + plannedCost > config.globalUsd) {
      throw new BudgetExceededError(
        `Global budget exceeded: $${globalSummary.totalPaidCost.toFixed(4)} spent + $${plannedCost.toFixed(4)} planned > $${config.globalUsd} limit`,
        "global",
        config.globalUsd,
        globalSummary.totalPaidCost,
        plannedCost,
      );
    }
  }

  // Check per-day budget
  if (config.perDayUsd !== undefined) {
    const today = new Date().toISOString().slice(0, 10) + " 00:00:00";
    const daySummary = await getCostSummary({ sinceDate: today });
    if (daySummary.totalPaidCost + plannedCost > config.perDayUsd) {
      throw new BudgetExceededError(
        `Daily budget exceeded: $${daySummary.totalPaidCost.toFixed(4)} spent today + $${plannedCost.toFixed(4)} planned > $${config.perDayUsd} limit`,
        "per_day",
        config.perDayUsd,
        daySummary.totalPaidCost,
        plannedCost,
      );
    }
  }

  // Check per-run budget
  if (config.perRunUsd !== undefined && options.runId) {
    const runEntries = await getRunEntries(options.runId);
    const runSpend = runEntries
      .filter((e) => !e.isFree)
      .reduce((sum, e) => sum + e.totalCost, 0);
    if (runSpend + plannedCost > config.perRunUsd) {
      throw new BudgetExceededError(
        `Run budget exceeded: $${runSpend.toFixed(4)} spent on run ${options.runId} + $${plannedCost.toFixed(4)} planned > $${config.perRunUsd} limit`,
        "per_run",
        config.perRunUsd,
        runSpend,
        plannedCost,
      );
    }
  }
}

/** Estimate the cost of an image generation call for budget checking. */
export function estimateImageCost(model: string, imageCount: number, resolution: "0.5k" | "1k" | "2k" | "4k"): number {
  const pricing = getPricing(model);
  if (pricing.isFree) return 0;
  if (pricing.costPerImage) {
    return pricing.costPerImage[resolution] * imageCount;
  }
  // Per-megapixel models (fal.ai): conservative estimate.
  // Assume 4 reference images at 512x512 (1.05 MP input) + output at the
  // requested resolution tier. Output MP approximated from tier name.
  if (pricing.unit === "per_megapixel") {
    const inputMP = 1.05; // 4 × 512×512
    const outputMPByTier: Record<typeof resolution, number> = {
      "0.5k": 0.262,  // 512×512
      "1k": 1.0,      // 1024×1024
      "2k": 4.0,      // 2048×2048
      "4k": 16.0,     // 4096×4096
    };
    const outputMP = outputMPByTier[resolution];
    if (pricing.perMegapixel) {
      return (inputMP + outputMP) * pricing.perMegapixel * imageCount;
    }
    return (inputMP * (pricing.inputPerMegapixel ?? 0) + outputMP * (pricing.outputPerMegapixel ?? 0)) * imageCount;
  }
  return 0;
}
