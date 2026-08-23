import type { Hono, AppConfig } from "@automation/server";
import { zValidator } from "@hono/zod-validator";
import {
  getExtractor,
  extractSentenceEmbeddings,
  isModelLoaded,
  MODEL_NAME,
  DIMENSIONS,
} from "./embedder.ts";
import { cosineSimilarity, l2Normalize } from "./similarity.ts";
import { embedSchema, similaritySchema } from "./schemas.ts";

// === Routes ===

export function registerRoutes(app: Hono, _config: AppConfig): void {
  // POST /embed — embed texts and return vectors
  app.post("/embed", zValidator("json", embedSchema), async (c) => {
    const { texts } = c.req.valid("json");

    try {
      const fn = await getExtractor();
      const output = await fn(texts);
      const dims = output.dims ?? [texts.length, DIMENSIONS];
      const rawVectors = extractSentenceEmbeddings(output.data, dims, texts.length);
      const vectors = rawVectors.map(l2Normalize);
      const dim = vectors[0]?.length ?? DIMENSIONS;

      return c.json({
        vectors: vectors.map((v) => ({
          vector: v,
          model: MODEL_NAME,
          modelVersion: "all-MiniLM-L6-v2",
        })),
        dimensions: dim,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: "Embedding failed", details: msg }, 500);
    }
  });

  // POST /similarity — compute cosine similarity between two texts
  app.post("/similarity", zValidator("json", similaritySchema), async (c) => {
    const { textA, textB } = c.req.valid("json");

    try {
      const fn = await getExtractor();
      const output = await fn([textA, textB]);
      const dims = output.dims ?? [2, DIMENSIONS];
      const rawVectors = extractSentenceEmbeddings(output.data, dims, 2);
      const vecA = l2Normalize(rawVectors[0]!);
      const vecB = l2Normalize(rawVectors[1]!);
      const score = cosineSimilarity(vecA, vecB);

      return c.json({ score, model: MODEL_NAME, dimensions: vecA.length });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: "Similarity computation failed", details: msg }, 500);
    }
  });

  // GET /model — return model info
  app.get("/model", (c) => {
    return c.json({
      model: MODEL_NAME,
      dimensions: DIMENSIONS,
      loaded: isModelLoaded(),
    });
  });

  // GET /debug — debug endpoint showing raw output dims
  app.get("/debug", async (c) => {
    try {
      const fn = await getExtractor();
      const output = await fn(["hello world test"]);
      return c.json({
        dims: output.dims,
        dataLength: Array.isArray(output.data) ? output.data.length : output.data.length,
        dataType: Array.isArray(output.data) ? "array" : "float32array",
      });
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });
}
