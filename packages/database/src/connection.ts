/**
 * PostgreSQL connection helper.
 *
 * All services share a single PostgreSQL database (Neon/Supabase/local).
 * Uses node-postgres (`pg`) with a connection pool.
 *
 * The `getDb()` function returns a `PgDatabase` wrapper that mimics the
 * bun:sqlite `Database` API (`prepare().run/get/all`, `exec`, `transaction`)
 * but with **async** methods. This minimizes the migration diff: call sites
 * only need to add `await` and `async`.
 *
 * Transactions use `AsyncLocalStorage` so that all queries inside a
 * `db.transaction()` callback automatically route through the transaction's
 * dedicated client — no need to pass a `tx` object around.
 */

import pg from "pg";
import { AsyncLocalStorage } from "node:async_hooks";

// Bun's ESM loader may not fully initialize node:async_hooks at class
// definition time. Hold a lazily-created reference so it's only constructed
// when getDb() is first called (well after module load).
let _asyncLocalStorage: typeof AsyncLocalStorage | null = null;
function getAsyncLocalStorage(): typeof AsyncLocalStorage {
  if (!_asyncLocalStorage) {
    // Re-require in case the ESM import returned undefined
    _asyncLocalStorage = (globalThis as any).AsyncLocalStorage
      ?? require("node:async_hooks").AsyncLocalStorage;
  }
  return _asyncLocalStorage!;
}

// === Type parser overrides ===
// pg returns TIMESTAMPTZ/TIMESTAMP as JavaScript Date objects by default.
// The application code expects string timestamps (e.g. row.created_at as a
// string). Override the parsers to return the raw ISO strings instead.
// This keeps the column types as proper PostgreSQL TIMESTAMPTZ while
// maintaining compatibility with existing code.
pg.types.setTypeParser(1184, (val: string) => val); // TIMESTAMPTZ
pg.types.setTypeParser(1114, (val: string) => val); // TIMESTAMP

// === Types ===

/** Result of a `.run()` call — mimics bun:sqlite's StatementResult. */
export interface RunResult {
  /** Number of rows affected (maps to pg's rowCount). */
  changes: number;
  /** Last inserted rowid (populated when the query has RETURNING). */
  lastInsertRowid: unknown;
}

/** A prepared statement with async methods — mimics bun:sqlite's Statement. */
export interface PreparedStatement {
  /** Execute and return metadata (rows affected, last insert id). */
  run(...params: unknown[]): Promise<RunResult>;
  /** Execute and return the first row, or null. */
  get(...params: unknown[]): Promise<any>;
  /** Execute and return all matching rows. */
  all(...params: unknown[]): Promise<any[]>;
  /** Execute and return rows as arrays of values (rarely used). */
  values(...params: unknown[]): Promise<unknown[][]>;
}

/** The database interface — mimics bun:sqlite's Database. */
export interface Database {
  /** Prepare a SQL statement (converts `?` placeholders to `$1, $2, ...`). */
  prepare(sql: string): PreparedStatement;
  /** Execute raw SQL (multi-statement, no params). Used by migrations. */
  exec(sql: string): Promise<void>;
  /** Run a function inside a transaction. Uses AsyncLocalStorage for routing. */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  /** Close the underlying pool/client. */
  close(): Promise<void>;
}

// === Placeholder conversion ===

/**
 * Convert SQLite `?` placeholders to PostgreSQL `$1, $2, ...` format.
 * Skips `?` inside single-quoted string literals.
 */
function convertPlaceholders(sql: string): string {
  let result = "";
  let paramIndex = 1;
  let inString = false;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];

    if (inString) {
      result += char;
      if (char === "'") {
        // Check for escaped single quote ('')
        if (sql[i + 1] === "'") {
          result += sql[i + 1];
          i++;
        } else {
          inString = false;
        }
      }
    } else if (char === "'") {
      inString = true;
      result += char;
    } else if (char === "?") {
      result += `$${paramIndex++}`;
    } else {
      result += char;
    }
  }

  return result;
}

// === PgDatabase implementation ===

class PgDatabaseImpl implements Database {
  private pool: pg.Pool;
  private txStorage: InstanceType<typeof AsyncLocalStorage<pg.PoolClient>> | null = null;

  constructor(pool: pg.Pool) {
    this.pool = pool;
    // Lazily create AsyncLocalStorage — Bun may not have it ready at class
    // definition time, but it's always available by the time the constructor runs.
    const AlsClass = getAsyncLocalStorage();
    this.txStorage = new AlsClass<pg.PoolClient>();
  }

  /** Get the current client (transaction client if inside a tx, else pool). */
  private getQueryClient(): pg.Pool | pg.PoolClient {
    return this.txStorage!.getStore() ?? this.pool;
  }

  prepare(sql: string): PreparedStatement {
    const pgSql = convertPlaceholders(sql);

    return {
      run: async (...params: unknown[]): Promise<RunResult> => {
        const client = this.getQueryClient();
        const result = await client.query(pgSql, params as never[]);
        const lastInsertRowid = result.rows[0]?.id ?? result.rows[0]?.rowid ?? null;
        return { changes: result.rowCount ?? 0, lastInsertRowid };
      },

      get: async (...params: unknown[]): Promise<any> => {
        const client = this.getQueryClient();
        const result = await client.query(pgSql, params as never[]);
        return result.rows[0] ?? null;
      },

      all: async (...params: unknown[]): Promise<any[]> => {
        const client = this.getQueryClient();
        const result = await client.query(pgSql, params as never[]);
        return result.rows;
      },

      values: async (...params: unknown[]): Promise<unknown[][]> => {
        const client = this.getQueryClient();
        const result = await client.query(pgSql, params as never[]);
        return result.rows.map((r) => Object.values(r));
      },
    };
  }

  async exec(sql: string): Promise<void> {
    const client = this.getQueryClient();
    await client.query(sql);
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await this.txStorage!.run(client, fn);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ROLLBACK may fail if the connection is broken — ignore
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

// === Singleton ===

let _db: PgDatabaseImpl | null = null;

export interface DbConfig {
  /** PostgreSQL connection string. If omitted, uses DATABASE_URL env var. */
  url?: string;
  /** Pool size (default: 10). */
  max?: number;
}

/**
 * Get or create the PostgreSQL database connection (singleton).
 * Returns a wrapper that mimics bun:sqlite's Database API but with async methods.
 */
export function getDb(config?: DbConfig): Database {
  if (_db) return _db;

  const connectionString = config?.url ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Set it in .env or pass it via DbConfig.",
    );
  }

  const isNeon = connectionString.includes("neon.tech");
  const sslmodeRequired = connectionString.includes("sslmode=require");

  const pool = new pg.Pool({
    connectionString,
    max: config?.max ?? 10,
    // Neon (and any sslmode=require URL) requires SSL
    ssl: isNeon || sslmodeRequired
      ? { rejectUnauthorized: false }
      : undefined,
    // Neon's PgBouncer pooler (pooled endpoint) runs in transaction mode,
    // which does NOT support named prepared statements. Setting prepare:false
    // makes pg use the unnamed prepared statement, which PgBouncer supports.
    ...(isNeon ? { prepare: false } : {}),
    // Generous statement timeout for Neon's serverless cold starts
    ...(isNeon ? { statement_timeout: 30000 } : {}),
  });

  _db = new PgDatabaseImpl(pool);
  return _db;
}

/** Close the database connection pool. */
export async function closeDb(): Promise<void> {
  if (_db) {
    await _db.close();
    _db = null;
  }
}
