/**
 * Account routes — platform connection management.
 *
 * - GET  /platforms              — list supported platforms
 * - GET  /accounts/:channelId    — list connected accounts for a channel
 * - POST /accounts/connect       — get OAuth URL to connect a platform
 * - POST /accounts/callback      — store a connected account after OAuth
 * - DELETE /accounts/:channelId/:platform/:accountId — disconnect
 */

import type { Hono, AppConfig } from "@automation/server";
import { getDb } from "@automation/database";
import type { PlatformAccountRow } from "@automation/database";
import { zValidator } from "@hono/zod-validator";

import { connectSchema, callbackSchema } from "../schemas";
import { SUPPORTED_PLATFORMS, uuid } from "../utils";
import { ZernioAdapter } from "../adapters/zernio";

export function registerAccountRoutes(app: Hono, config: AppConfig): void {
  const db = getDb();

  // === GET /platforms — list supported platforms ===

  app.get("/platforms", (c) => {
    return c.json({ platforms: SUPPORTED_PLATFORMS });
  });

  // === GET /accounts/:channelId — list connected accounts for a channel ===

  app.get("/accounts/:channelId", async (c) => {
    const channelId = c.req.param("channelId");
    const platform = c.req.query("platform");

    let sql = "SELECT * FROM platform_accounts WHERE channel_id = ? AND is_active = 1";
    const params: (string | number)[] = [channelId];
    if (platform) {
      sql += " AND platform = ?";
      params.push(platform);
    }
    sql += " ORDER BY connected_at DESC";

    const rows = await db.prepare(sql).all(...params) as PlatformAccountRow[];
    return c.json({
      accounts: rows.map((r) => ({
        id: r.id,
        channelId: r.channel_id,
        platform: r.platform,
        providerAccountId: r.provider_account_id,
        username: r.username,
        displayName: r.display_name,
        isActive: r.is_active === 1,
        metadata: r.metadata_json ? JSON.parse(r.metadata_json) : null,
        connectedAt: r.connected_at,
      })),
    });
  });

  // === POST /accounts/connect — get OAuth URL ===

  app.post(
    "/accounts/connect",
    zValidator("json", connectSchema),
    async (c) => {
      const { channelId, platform, redirectUrl } = c.req.valid("json");

      if (!config.zernioApiKey) {
        return c.json(
          { error: "ZERNIO_API_KEY is not configured. Set it in .env" },
          500,
        );
      }

      try {
        const adapter = new ZernioAdapter(config.zernioApiKey);
        const result = await adapter.getConnectUrl({
          channelId,
          platform: platform as never,
          redirectUrl: redirectUrl ?? `${c.req.header("origin") ?? ""}/library`,
        });
        return c.json(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[publish-service] Connect URL error:", msg);
        return c.json({ error: msg }, 500);
      }
    },
  );

  // === POST /accounts/callback — store connected account after OAuth ===

  app.post(
    "/accounts/callback",
    zValidator("json", callbackSchema),
    async (c) => {
      const { channelId, platform, accountId, username, displayName, metadata } =
        c.req.valid("json");

      // Check if this account already exists
      const existing = await db
        .prepare(
          "SELECT id FROM platform_accounts WHERE channel_id = ? AND platform = ? AND provider_account_id = ?",
        )
        .get(channelId, platform, accountId) as { id: string } | null;

      if (existing) {
        // Reactivate if it was disconnected
        await db
          .prepare(
            "UPDATE platform_accounts SET is_active = 1, username = ?, display_name = ?, metadata_json = ? WHERE id = ?",
          )
          .run(
            username ?? null,
            displayName ?? null,
            metadata ? JSON.stringify(metadata) : null,
            existing.id,
          );
        return c.json({ id: existing.id, updated: true });
      }

      // Insert new account
      const id = uuid();
      await db.prepare(`
        INSERT INTO platform_accounts (id, channel_id, platform, provider_account_id, username, display_name, is_active, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?)
      `).run(
        id,
        channelId,
        platform,
        accountId,
        username ?? null,
        displayName ?? null,
        metadata ? JSON.stringify(metadata) : null,
      );

      return c.json({ id, created: true }, 201);
    },
  );

  // === DELETE /accounts/:channelId/:platform/:accountId — disconnect ===

  app.delete(
    "/accounts/:channelId/:platform/:accountId",
    async (c) => {
      const channelId = c.req.param("channelId");
      const platform = c.req.param("platform");
      const accountId = c.req.param("accountId");

      // Find the account in our DB
      const account = await db
        .prepare(
          "SELECT * FROM platform_accounts WHERE channel_id = ? AND platform = ? AND provider_account_id = ?",
        )
        .get(channelId, platform, accountId) as PlatformAccountRow | null;

      if (!account) return c.json({ error: "Account not found" }, 404);

      // Try to disconnect from Zernio (best-effort)
      if (config.zernioApiKey) {
        try {
          const adapter = new ZernioAdapter(config.zernioApiKey);
          await adapter.disconnectAccount({
            channelId,
            platform: platform as never,
            providerAccountId: accountId,
          });
        } catch (err) {
          console.warn(
            "[publish-service] Zernio disconnect failed (continuing with local deactivation):",
            err instanceof Error ? err.message : String(err),
          );
        }
      }

      // Deactivate locally
      await db
        .prepare("UPDATE platform_accounts SET is_active = 0 WHERE id = ?")
        .run(account.id);

      return c.json({ disconnected: true });
    },
  );
}
