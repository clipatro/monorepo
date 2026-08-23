import type { Hono, AppConfig } from "@automation/server";
import type { LlmClient } from "@automation/contracts";
import { getDb } from "@automation/database";
import type { StoryCandidate } from "@automation/contracts";
import { zValidator } from "@hono/zod-validator";
import { versionSchema } from "../schemas";
import { getEmbeddings } from "../similarity";
import { extractStoryDna } from "../story-dna";

// === Story versioning ===

export function registerVersionRoutes(app: Hono, _config: AppConfig, client: LlmClient): void {
  app.post("/version", zValidator("json", versionSchema), async (c) => {
    const input = c.req.valid("json");
    const db = getDb();
    const effectiveProvider = (input.llmProvider as "gemini" | "deepseek" | undefined) ?? _config.llmProvider;

    try {
      // === Auto-create new characters proposed by the LLM ===
      const characterAssignments: Array<{
        name: string;
        characterId: string | null;
        characterVersionId: string | null;
        roleInStory: string;
        autoCreated: boolean;
      }> = [];

      // Process existing character assignments
      for (const charRef of input.candidate.characters ?? []) {
        characterAssignments.push({
          name: charRef.name,
          characterId: charRef.existingCharacterId ?? null,
          characterVersionId: null, // will be resolved below
          roleInStory: charRef.roleInStory,
          autoCreated: false,
        });
      }

      // Process new characters — auto-create them
      for (const newChar of input.candidate.newCharacters ?? []) {
        const charId = crypto.randomUUID();
        const now = new Date().toISOString();
        const role = (newChar.bible as Record<string, unknown>).role as string ?? "supporting";

        // Create the character record
        await db.prepare(`
          INSERT INTO characters (id, channel_id, name, role, auto_created, source_run_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, 1, ?, ?, ?)
        `).run(charId, input.channelId, newChar.name, role, input.runId, now, now);

        // Create a draft character version with the LLM-generated bible
        const versionId = crypto.randomUUID();
        await db.prepare(`
          INSERT INTO character_versions (id, character_id, version, bible, status, created_at)
          VALUES (?, ?, 1, ?, 'draft', ?)
        `).run(versionId, charId, JSON.stringify(newChar.bible), now);

        // Add to channel_characters junction table
        await db.prepare(`
          INSERT INTO channel_characters (id, channel_id, character_id, added_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT DO NOTHING
        `).run(crypto.randomUUID(), input.channelId, charId, now);

        characterAssignments.push({
          name: newChar.name,
          characterId: charId,
          characterVersionId: versionId,
          roleInStory: newChar.roleInStory,
          autoCreated: true,
        });
      }

      // Resolve frozen character version IDs for existing characters
      for (const assignment of characterAssignments) {
        if (assignment.characterId && !assignment.characterVersionId) {
          const frozen = (await db.prepare(`
            SELECT id FROM character_versions
            WHERE character_id = ? AND status = 'frozen'
            ORDER BY version DESC LIMIT 1
          `).get(assignment.characterId)) as { id: string } | null;
          if (frozen) {
            assignment.characterVersionId = frozen.id;
          }
        }
      }

      const charactersJson = JSON.stringify(characterAssignments);

      // Create the story record
      const storyId = crypto.randomUUID();
      await db.prepare(`
        INSERT INTO stories (id, channel_id, run_id, title, content_type, character_version_id, characters_json, approved_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, now())
      `).run(storyId, input.channelId, input.runId, input.candidate.title, input.candidate.contentType, input.characterVersionId ?? null, charactersJson);

      // Create the canonical version
      const versionId = crypto.randomUUID();
      const storyJson = JSON.stringify(input.candidate);
      await db.prepare(`
        INSERT INTO story_versions (id, story_id, version, story_json)
        VALUES (?, ?, 1, ?)
      `).run(versionId, storyId, storyJson);

      // Link the canonical version
      await db.prepare("UPDATE stories SET canonical_version_id = ? WHERE id = ?").run(versionId, storyId);

      // Store research sources and claims
      if (input.research) {
        for (const source of input.research.sources ?? []) {
          await db.prepare(`
            INSERT INTO story_sources (id, story_id, source_id, title, url, excerpt)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(crypto.randomUUID(), storyId, source.id, source.title, source.url ?? null, source.excerpt);
        }
        for (const claim of input.research.claims ?? []) {
          await db.prepare(`
            INSERT INTO story_claims (id, story_id, claim_id, claim, source_ids, confidence)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(crypto.randomUUID(), storyId, claim.id, claim.claim, JSON.stringify(claim.sourceIds), claim.confidence);
        }
      }

      // Store embeddings for the story
      try {
        const fields = [
          { name: "title", text: input.candidate.title },
          { name: "premise", text: input.candidate.premise },
          { name: "storyline", text: input.candidate.storyline },
          { name: "fingerprint", text: input.candidate.fingerprint },
        ];
        const embeddings = await getEmbeddings(fields.map((f) => f.text));
        for (let i = 0; i < fields.length; i++) {
          await db.prepare(`
            INSERT INTO story_embeddings (id, story_id, field_name, embedding, model, model_version, dimensions)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            crypto.randomUUID(), storyId, fields[i]!.name,
            JSON.stringify(embeddings[i]),
            "Xenova/all-MiniLM-L6-v2", "all-MiniLM-L6-v2", embeddings[i]!.length,
          );
        }
      } catch {
        // Embedding service may not be running — continue without embeddings
      }

      // Index in FTS
      await db.prepare(`
        INSERT INTO story_fts (story_id, title, premise, storyline)
        VALUES (?, ?, ?, ?)
      `).run(storyId, input.candidate.title, input.candidate.premise, input.candidate.storyline);

      // Extract and store story DNA
      let dnaCostUsd = 0;
      let dnaProvider: string | undefined;
      let dnaModel: string | undefined;
      try {
        const { dna, costUsd } = await extractStoryDna(client, input.candidate as StoryCandidate, input.runId, undefined, input.llmModel);
        dnaCostUsd = costUsd;
        dnaProvider = effectiveProvider;
        dnaModel = undefined; // getModel() is called internally; we'd need to export it
        await db.prepare(`
          INSERT INTO story_dna (id, story_id, protagonist_archetype, protagonist_goal, inciting_incident,
            central_conflict, main_obstacle, reversal_or_twist, resolution,
            psychological_mechanism, lesson, setting)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          crypto.randomUUID(), storyId,
          dna.protagonistArchetype ?? null,
          dna.protagonistGoal ?? null,
          dna.incitingIncident ?? null,
          dna.centralConflict ?? null,
          dna.mainObstacle ?? null,
          dna.reversalOrTwist ?? null,
          dna.resolution ?? null,
          dna.psychologicalMechanism ?? null,
          dna.lesson ?? null,
          dna.setting ?? null,
        );
      } catch {
        // DNA extraction is optional — continue without it
      }

      return c.json({
        storyId,
        versionId,
        story: { id: storyId, title: input.candidate.title, contentType: input.candidate.contentType },
        characters: characterAssignments,
        dnaProvider,
        dnaModel: dnaModel ?? (process.env.LLM_PROVIDER === "deepseek" ? "deepseek-v4-flash" : "gemini-3.6-flash"),
        dnaCostUsd,
      }, 201);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: "Versioning failed", details: msg }, 500);
    }
  });
}
