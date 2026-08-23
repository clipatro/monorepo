import type { Hono, AppConfig } from "@automation/server";
import { getDb } from "@automation/database";
import type { VoiceoverRow, TimingRow } from "@automation/database";
import { existsSync } from "node:fs";

// === GET /voiceovers/:storyId — list voiceovers for a story ===

export function registerVoiceoverRoutes(app: Hono, _config: AppConfig): void {
	const db = getDb();

	// === GET /voiceovers — list ALL voiceovers with pagination + search ===

	app.get("/voiceovers", async (c) => {
		const search = c.req.query("search");
		const limit = c.req.query("limit");
		const offset = c.req.query("offset");
		const isPaginated = limit !== undefined || offset !== undefined;

		const conditions: string[] = [];
		const params: (string | number)[] = [];
		if (search) {
			conditions.push("(v.story_id LIKE ? OR v.provider LIKE ?)");
			const pattern = `%${search}%`;
			params.push(pattern, pattern);
		}
		const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
		const orderBy = "ORDER BY v.created_at DESC";

		const selectSql = `
			SELECT v.*, s.title as story_title
			FROM voiceovers v
			LEFT JOIN stories s ON v.story_id = s.id
			${whereClause}
			${orderBy}
		`;

		if (isPaginated) {
			const lim = Math.min(Number(limit ?? 50), 200);
			const off = Number(offset ?? 0);
			const rows = await db.prepare(`${selectSql} LIMIT ? OFFSET ?`).all(...params, lim, off) as Array<VoiceoverRow & { story_title: string | null }>;
			const totalRow = await db.prepare(`SELECT COUNT(*) as count FROM voiceovers v LEFT JOIN stories s ON v.story_id = s.id ${whereClause}`).get(...params) as { count: number };
			return c.json({ voiceovers: rows, total: totalRow.count });
		}

		const rows = await db.prepare(selectSql).all(...params) as Array<VoiceoverRow & { story_title: string | null }>;
		return c.json({ voiceovers: rows });
	});

	// === GET /voiceovers/:storyId — list voiceovers for a story ===

	app.get("/voiceovers/:storyId", async (c) => {
		const storyId = c.req.param("storyId");
		const voiceovers = await db
			.prepare(
				"SELECT * FROM voiceovers WHERE story_id = ? ORDER BY created_at DESC",
			)
			.all(storyId) as VoiceoverRow[];
		return c.json({ voiceovers });
	});

	// === GET /voiceover/:id — get a single voiceover with timings ===

	app.get("/voiceover/:id", async (c) => {
		const id = c.req.param("id");
		const voiceover = await db
			.prepare("SELECT * FROM voiceovers WHERE id = ?")
			.get(id) as VoiceoverRow | null;
		if (!voiceover) return c.json({ error: "Voiceover not found" }, 404);

		const timings = await db
			.prepare(`
      SELECT t.*, s."order" as scene_order
      FROM timings t JOIN scenes s ON t.scene_id = s.id
      WHERE t.voiceover_id = ? ORDER BY s."order" ASC
    `)
			.all(id) as Array<TimingRow & { scene_order: number }>;

		return c.json({ voiceover, timings });
	});

	// === GET /audio/:id — stream the voiceover audio file ===

	app.get("/audio/:id", async (c) => {
		const id = c.req.param("id");
		const voiceover = await db
			.prepare("SELECT * FROM voiceovers WHERE id = ?")
			.get(id) as VoiceoverRow | null;
		if (!voiceover) return c.json({ error: "Voiceover not found" }, 404);
		if (!existsSync(voiceover.master_path))
			return c.json({ error: "Audio file not found on disk" }, 404);

		const file = Bun.file(voiceover.master_path);
		const range = c.req.header("range");

		if (range) {
			// Parse Range header for partial content
			const match = /bytes=(\d+)-(\d*)/.exec(range);
			if (match && match[1]) {
				const start = parseInt(match[1], 10);
				const end = match[2] ? parseInt(match[2], 10) : file.size - 1;
				const chunk = await file.slice(start, end + 1).arrayBuffer();
				return new Response(chunk, {
					status: 206,
					headers: {
						"Content-Type": "audio/wav",
						"Content-Length": String(end - start + 1),
						"Content-Range": `bytes ${start}-${end}/${file.size}`,
						"Cache-Control": "public, max-age=3600",
						"Accept-Ranges": "bytes",
					},
				});
			}
		}

		const buffer = await file.arrayBuffer();
		return new Response(buffer, {
			headers: {
				"Content-Type": "audio/wav",
				"Content-Length": String(buffer.byteLength),
				"Cache-Control": "public, max-age=3600",
				"Accept-Ranges": "bytes",
			},
		});
	});
}
