/**
 * @automation/server — shared Hono server utilities for all microservices.
 *
 * Every service uses `createServer()` to get a Hono app with:
 * - Health check at GET /health
 * - Service info at GET /
 * - CORS headers for the frontend
 * - Request logging
 * - Graceful shutdown
 *
 * `startServer()` boots the Hono server, runs migrations, and handles shutdown.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { AppConfig } from "@automation/config";
import { loadConfig, redactedConfig } from "@automation/config";
import { runMigrations, closeDb } from "@automation/database";

export { Hono };
export type { AppConfig };

/** Create a base Hono app with shared middleware (CORS, logging, health). */
export function createServer(serviceName: string): { app: Hono; config: AppConfig } {
  const config = loadConfig(serviceName);
  const app = new Hono();

  app.use("*", logger());
  app.use("*", cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173", "http://web-frontend:5173"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["Content-Length"],
  }));

  app.get("/health", (c) => {
    return c.json({
      status: "ok",
      service: serviceName,
      timestamp: new Date().toISOString(),
      costTracking: {
        enabled: true,
        databaseUrl: config.databaseUrl ? "***REDACTED***" : null,
        budgetPerRun: config.costBudgetPerRun,
        budgetPerDay: config.costBudgetPerDay,
        budgetGlobal: config.costBudgetGlobal,
      },
    });
  });

  app.get("/", (c) => {
    return c.json({
      service: serviceName,
      version: "0.0.0",
      endpoints: ["/health", "/"],
    });
  });

  return { app, config };
}

/** Start a Hono server with migrations and graceful shutdown. */
export async function startServer(
  serviceName: string,
  setupRoutes?: (app: Hono, config: AppConfig) => void | Promise<void>,
): Promise<void> {
  const { app, config } = createServer(serviceName);

  // Run migrations BEFORE setupRoutes — services may access tables during setup
  // (e.g. workflow-service starts the engine which queries workflow_steps).
  try {
    console.log(`[${serviceName}] Running database migrations...`);
    const result = await runMigrations();
    console.log(`[${serviceName}] Migrations: ${result.applied} applied, ${result.skipped} up to date.`);
  } catch (err) {
    console.error(`[${serviceName}] Migration failed:`, err);
    process.exit(1);
  }

  if (setupRoutes) {
    await setupRoutes(app, config);
  }

  console.log(`[${serviceName}] Config:`, JSON.stringify(redactedConfig(config)));

  const server = Bun.serve({
    port: config.port,
    fetch: app.fetch,
    // Allow large uploads (e.g. rendered MP4s from video-service).
    // Bun's default is ~8MB which is too small for video files.
    maxRequestBodySize: 1024 * 1024 * 1024, // 1 GB
  });

  console.log(`[${serviceName}] Listening on http://0.0.0.0:${config.port}`);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`[${serviceName}] Received ${signal}, shutting down...`);
    server.stop();
    await closeDb();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}
