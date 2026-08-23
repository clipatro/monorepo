/**
 * Cost ledger — a PostgreSQL-backed persistent record of every provider call's cost.
 *
 * Every provider call (story generation, image generation, TTS, research,
 * embedding) records a row here. This provides:
 * - Per-run, per-provider, per-model, per-capability cost breakdowns
 * - Running totals and budget enforcement
 * - Audit trail for all AI spending
 *
 * Uses the shared PostgreSQL connection from @automation/database (pg.Pool).
 * The cost_entries table is created inline on first use.
 */

import { getDb, closeDb, type Database } from "@automation/database";
import type { CostBreakdown } from "./calculator.ts";

export interface CostEntry {
  id: number;
  timestamp: string;
  runId: string | null;
  stepId: string | null;
  capability: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  imageCount: number;
  imageResolution: string | null;
  groundingQueries: number;
  inputCost: number;
  outputCost: number;
  imageCost: number;
  groundingCost: number;
  totalCost: number;
  isFree: boolean;
  notes: string | null;
}

/** Map a snake_case DB row to a camelCase CostEntry. */
function mapRow(row: Record<string, unknown>): CostEntry {
  return {
    id: row.id as number,
    timestamp: row.timestamp as string,
    runId: (row.run_id ?? null) as string | null,
    stepId: (row.step_id ?? null) as string | null,
    capability: row.capability as string,
    provider: row.provider as string,
    model: row.model as string,
    inputTokens: row.input_tokens as number,
    outputTokens: row.output_tokens as number,
    imageCount: row.image_count as number,
    imageResolution: (row.image_resolution ?? null) as string | null,
    groundingQueries: row.grounding_queries as number,
    inputCost: row.input_cost as number,
    outputCost: row.output_cost as number,
    imageCost: row.image_cost as number,
    groundingCost: row.grounding_cost as number,
    totalCost: row.total_cost as number,
    isFree: Boolean(row.is_free),
    notes: (row.notes ?? null) as string | null,
  };
}

export interface CostSummary {
  totalCost: number;
  totalPaidCost: number;
  totalFreeCalls: number;
  totalPaidCalls: number;
  byProvider: Record<string, { cost: number; calls: number }>;
  byModel: Record<string, { cost: number; calls: number }>;
  byCapability: Record<string, { cost: number; calls: number }>;
  byRun: Record<string, { cost: number; calls: number }>;
}

let _tableInitialized = false;

/** Ensure the cost_entries table exists, then return the database handle. */
async function ensureTable(): Promise<Database> {
  const db = getDb();
  if (!_tableInitialized) {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS cost_entries (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
        run_id TEXT,
        step_id TEXT,
        capability TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        image_count INTEGER NOT NULL DEFAULT 0,
        image_resolution TEXT,
        grounding_queries INTEGER NOT NULL DEFAULT 0,
        input_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
        output_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
        image_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
        grounding_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
        total_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
        is_free INTEGER NOT NULL DEFAULT 0,
        notes TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_cost_run ON cost_entries(run_id);
      CREATE INDEX IF NOT EXISTS idx_cost_provider ON cost_entries(provider);
      CREATE INDEX IF NOT EXISTS idx_cost_model ON cost_entries(model);
      CREATE INDEX IF NOT EXISTS idx_cost_capability ON cost_entries(capability);
      CREATE INDEX IF NOT EXISTS idx_cost_timestamp ON cost_entries(timestamp);
    `);
    _tableInitialized = true;
  }
  return db;
}

/** Record a cost entry in the ledger. */
export async function recordCost(
  breakdown: CostBreakdown,
  options: {
    runId?: string;
    stepId?: string;
    capability: string;
    inputTokens?: number;
    outputTokens?: number;
    imageCount?: number;
    imageResolution?: string;
    groundingQueries?: number;
    notes?: string;
  },
): Promise<CostEntry> {
  const db = await ensureTable();
  const info = await db.prepare(`
    INSERT INTO cost_entries (
      run_id, step_id, capability, provider, model,
      input_tokens, output_tokens, image_count, image_resolution, grounding_queries,
      input_cost, output_cost, image_cost, grounding_cost, total_cost, is_free, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING id
  `).run(
    options.runId ?? null,
    options.stepId ?? null,
    options.capability,
    breakdown.provider,
    breakdown.model,
    options.inputTokens ?? 0,
    options.outputTokens ?? 0,
    options.imageCount ?? 0,
    options.imageResolution ?? null,
    options.groundingQueries ?? 0,
    breakdown.inputCost,
    breakdown.outputCost,
    breakdown.imageCost,
    breakdown.groundingCost,
    breakdown.totalCost,
    breakdown.isFree ? 1 : 0,
    options.notes ?? null,
  );
  return getCostEntry(Number(info.lastInsertRowid));
}

/** Get a single cost entry by id. */
async function getCostEntry(id: number): Promise<CostEntry> {
  const db = await ensureTable();
  const row = await db.prepare(`SELECT * FROM cost_entries WHERE id = ?`).get(id);
  return mapRow(row as Record<string, unknown>);
}

/** Get a cost summary, optionally filtered by run_id or date range. */
export async function getCostSummary(options?: {
  runId?: string;
  sinceDate?: string;
}): Promise<CostSummary> {
  const db = await ensureTable();
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (options?.runId) {
    conditions.push("run_id = ?");
    params.push(options.runId);
  }
  if (options?.sinceDate) {
    conditions.push("timestamp >= ?");
    params.push(options.sinceDate);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await db.prepare(`SELECT * FROM cost_entries ${where}`).all(...params);
  const entries = rows.map(mapRow);

  const summary: CostSummary = {
    totalCost: 0,
    totalPaidCost: 0,
    totalFreeCalls: 0,
    totalPaidCalls: 0,
    byProvider: {},
    byModel: {},
    byCapability: {},
    byRun: {},
  };

  for (const entry of entries) {
    summary.totalCost += entry.totalCost;
    if (entry.isFree) {
      summary.totalFreeCalls++;
    } else {
      summary.totalPaidCost += entry.totalCost;
      summary.totalPaidCalls++;
    }

    const addToBucket = (bucket: Record<string, { cost: number; calls: number }>, key: string, cost: number) => {
      if (!bucket[key]) bucket[key] = { cost: 0, calls: 0 };
      bucket[key].cost += cost;
      bucket[key].calls++;
    };

    addToBucket(summary.byProvider, entry.provider, entry.totalCost);
    addToBucket(summary.byModel, entry.model, entry.totalCost);
    addToBucket(summary.byCapability, entry.capability, entry.totalCost);
    if (entry.runId) addToBucket(summary.byRun, entry.runId, entry.totalCost);
  }

  // Round totals
  summary.totalCost = Math.round(summary.totalCost * 1_000_000) / 1_000_000;
  summary.totalPaidCost = Math.round(summary.totalPaidCost * 1_000_000) / 1_000_000;

  // Round bucket costs
  for (const bucket of [summary.byProvider, summary.byModel, summary.byCapability, summary.byRun]) {
    for (const key of Object.keys(bucket)) {
      const entry = bucket[key];
      if (entry) entry.cost = Math.round(entry.cost * 1_000_000) / 1_000_000;
    }
  }

  return summary;
}

/** Get recent cost entries (most recent first). */
export async function getRecentEntries(limit = 20): Promise<CostEntry[]> {
  const db = await ensureTable();
  const rows = await db.prepare(`SELECT * FROM cost_entries ORDER BY id DESC LIMIT ?`).all(limit);
  return rows.map(mapRow);
}

/** Parameters for the paginated entries query. */
export interface GetEntriesParams {
  limit?: number;
  offset?: number;
  search?: string;
  capability?: string;
  provider?: string;
  runId?: string;
  isFree?: boolean;
}

/** Result of a paginated entries query. */
export interface PaginatedEntries {
  entries: CostEntry[];
  total: number;
}

/**
 * Get cost entries with server-side pagination, search, and filters.
 * Search matches capability, provider, model, or run_id (case-insensitive).
 * Returns the page of entries (most recent first) plus the total match count.
 */
export async function getEntriesPaginated(params: GetEntriesParams = {}): Promise<PaginatedEntries> {
  const db = await ensureTable();
  const conditions: string[] = [];
  const queryArgs: unknown[] = [];

  if (params.search) {
    conditions.push(
      "(capability LIKE ? OR provider LIKE ? OR model LIKE ? OR run_id LIKE ? OR notes LIKE ?)",
    );
    const like = `%${params.search}%`;
    queryArgs.push(like, like, like, like, like);
  }
  if (params.capability) {
    conditions.push("capability = ?");
    queryArgs.push(params.capability);
  }
  if (params.provider) {
    conditions.push("provider = ?");
    queryArgs.push(params.provider);
  }
  if (params.runId) {
    conditions.push("run_id = ?");
    queryArgs.push(params.runId);
  }
  if (params.isFree !== undefined) {
    conditions.push("is_free = ?");
    queryArgs.push(params.isFree ? 1 : 0);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 200);
  const offset = Math.max(params.offset ?? 0, 0);

  const countRow = await db.prepare(`SELECT COUNT(*) as count FROM cost_entries ${where}`).get(...queryArgs);
  const total = (countRow as { count: number }).count;

  const rows = await db
    .prepare(`SELECT * FROM cost_entries ${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...queryArgs, limit, offset);

  return { entries: rows.map(mapRow), total };
}

/** Get the set of distinct values for a column (e.g. capability, provider). */
export async function getDistinctValues(column: "capability" | "provider" | "model"): Promise<string[]> {
  const db = await ensureTable();
  const allowed = new Set(["capability", "provider", "model"]);
  if (!allowed.has(column)) return [];
  const rows = await db.prepare(`SELECT DISTINCT ${column} as value FROM cost_entries ORDER BY ${column} ASC`).all();
  return rows.map((r) => (r as { value: string }).value);
}

/** Get all entries for a specific run. */
export async function getRunEntries(runId: string): Promise<CostEntry[]> {
  const db = await ensureTable();
  const rows = await db.prepare(`SELECT * FROM cost_entries WHERE run_id = ? ORDER BY id ASC`).all(runId);
  return rows.map(mapRow);
}

/**
 * Batch lookup: get total cost for multiple run IDs in a single query.
 * Returns a map of runId → totalCost. Runs with no entries are not in the map
 * (caller should default to 0).
 */
export async function getRunCostsBatch(runIds: string[]): Promise<Record<string, number>> {
  if (runIds.length === 0) return {};
  const db = await ensureTable();
  const placeholders = runIds.map(() => "?").join(",");
  const rows = await db.prepare(
    `SELECT run_id, SUM(total_cost) as total FROM cost_entries WHERE run_id IN (${placeholders}) GROUP BY run_id`,
  ).all(...runIds);
  const result: Record<string, number> = {};
  for (const row of rows) {
    const r = row as { run_id: string; total: number };
    result[r.run_id] = Math.round((r.total ?? 0) * 1_000_000) / 1_000_000;
  }
  return result;
}

/** Aggregated cost summary for a single run — used by the pipeline UI. */
export interface RunCostSummary {
  runId: string;
  totalCost: number;
  totalPaidCost: number;
  totalFreeCalls: number;
  totalPaidCalls: number;
  entryCount: number;
  byProvider: Record<string, { cost: number; calls: number }>;
  byModel: Record<string, { cost: number; calls: number }>;
  byCapability: Record<string, { cost: number; calls: number }>;
  byStep: Array<{
    stepId: string;
    capability: string;
    provider: string;
    model: string;
    cost: number;
    calls: number;
  }>;
}

/** Get an aggregated cost summary for a single run. */
export async function getRunCostSummary(runId: string): Promise<RunCostSummary> {
  const entries = await getRunEntries(runId);

  const summary: RunCostSummary = {
    runId,
    totalCost: 0,
    totalPaidCost: 0,
    totalFreeCalls: 0,
    totalPaidCalls: 0,
    entryCount: entries.length,
    byProvider: {},
    byModel: {},
    byCapability: {},
    byStep: [],
  };

  const stepMap = new Map<string, {
    stepId: string;
    capability: string;
    provider: string;
    model: string;
    cost: number;
    calls: number;
  }>();

  for (const entry of entries) {
    summary.totalCost += entry.totalCost;
    if (entry.isFree) {
      summary.totalFreeCalls++;
    } else {
      summary.totalPaidCost += entry.totalCost;
      summary.totalPaidCalls++;
    }

    const addToBucket = (bucket: Record<string, { cost: number; calls: number }>, key: string, cost: number) => {
      if (!bucket[key]) bucket[key] = { cost: 0, calls: 0 };
      bucket[key].cost += cost;
      bucket[key].calls++;
    };

    addToBucket(summary.byProvider, entry.provider, entry.totalCost);
    addToBucket(summary.byModel, entry.model, entry.totalCost);
    addToBucket(summary.byCapability, entry.capability, entry.totalCost);

    if (entry.stepId) {
      const key = `${entry.stepId}:${entry.capability}`;
      const existing = stepMap.get(key);
      if (existing) {
        existing.cost += entry.totalCost;
        existing.calls++;
      } else {
        stepMap.set(key, {
          stepId: entry.stepId,
          capability: entry.capability,
          provider: entry.provider,
          model: entry.model,
          cost: entry.totalCost,
          calls: 1,
        });
      }
    }
  }

  summary.byStep = Array.from(stepMap.values()).sort((a, b) => b.cost - a.cost);

  // Round totals
  summary.totalCost = Math.round(summary.totalCost * 1_000_000) / 1_000_000;
  summary.totalPaidCost = Math.round(summary.totalPaidCost * 1_000_000) / 1_000_000;

  // Round bucket costs
  for (const bucket of [summary.byProvider, summary.byModel, summary.byCapability]) {
    for (const key of Object.keys(bucket)) {
      const entry = bucket[key];
      if (entry) entry.cost = Math.round(entry.cost * 1_000_000) / 1_000_000;
    }
  }

  // Round per-step costs
  for (const step of summary.byStep) {
    step.cost = Math.round(step.cost * 1_000_000) / 1_000_000;
  }

  return summary;
}

/** Close the database connection. */
export async function closeLedger(): Promise<void> {
  await closeDb();
}
