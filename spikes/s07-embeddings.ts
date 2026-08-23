/**
 * S07 — Local embedding model under Bun.
 *
 * Goal: Verify a local English embedding model runs under Bun and produces
 * consistent vectors for semantic similarity (duplicate detection). The plan
 * requires a LOCAL model so recurring similarity checks do not add API costs.
 *
 * Candidate: @xenova/transformers (Transformers.js) with all-MiniLM-L6-v2 —
 * a small, fast, English embedding model that runs via ONNX in JS.
 *
 * This resolves Open Question Q003.
 */

import { writeArtifact, type SpikeResult } from "./lib/spike.ts";

export async function run(): Promise<SpikeResult> {
  const measurements: Record<string, string | number | boolean> = {};
  const artifacts: string[] = [];

  let pipeline: unknown;
  let env: unknown;
  try {
    // Dynamic import so the spike fails gracefully if the package isn't installed.
    const transformers = await import("@xenova/transformers");
    pipeline = transformers.pipeline;
    env = transformers.env;
  } catch (e) {
    // Try installing it first.
    measurements["importAttempted"] = true;
    measurements["importError"] = String(e);
    // We'll attempt install below.
  }

  if (!pipeline) {
    // Attempt to install @xenova/transformers.
    const { exec } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execAsync = promisify(exec);
    try {
      await execAsync("bun add @xenova/transformers", { cwd: process.cwd() });
      const transformers = await import("@xenova/transformers");
      pipeline = transformers.pipeline;
      env = transformers.env;
      measurements["installedDuringSpike"] = true;
    } catch (e) {
      return {
        id: "s07",
        name: "Local embedding model under Bun",
        goal: "Verify a local English embedding model runs under Bun for semantic similarity.",
        result: "fail",
        measurements: { ...measurements, "installError": String(e) },
        notes: "Could not import or install @xenova/transformers under Bun.",
        artifactPaths: [],
      };
    }
  }

  // Configure to allow remote model download on first use, cache locally.
  const envObj = env as { allowLocalModels?: boolean; allowRemoteModels?: boolean; cacheDir?: string };
  envObj.allowRemoteModels = true;
  envObj.allowLocalModels = true;

  const t0 = performance.now();
  let extractor: (input: string | string[]) => Promise<unknown>;
  try {
    extractor = await (pipeline as (task: string, model: string) => Promise<typeof extractor>)(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2",
    );
  } catch (e) {
    return {
      id: "s07",
      name: "Local embedding model under Bun",
      goal: "Verify a local English embedding model runs under Bun for semantic similarity.",
      result: "fail",
      measurements: { ...measurements, "modelLoadError": String(e) },
      notes: "Could not load Xenova/all-MiniLM-L6-v2. May need ONNX runtime compatible with Bun.",
      artifactPaths: [],
    };
  }
  const modelLoadMs = Math.round(performance.now() - t0);
  measurements["modelLoadMs"] = modelLoadMs;

  // Test texts: two similar stories, one different.
  const texts = [
    "A lonely office worker discovers that the plant on their desk has been listening to every conversation and slowly rearranging the office to nudge them toward happiness.",
    "A solitary clerk finds that the potted plant in their cubicle has overheard all their calls and is subtly shifting the workspace to guide them toward joy.",
    "A submarine captain navigates through a field of bioluminescent jellyfish in the Mariana Trench and discovers a sunken city.",
  ];

  const t1 = performance.now();
  let embeddings: number[][];
  try {
    const output = await extractor(texts) as {
      data: number[] | Float32Array;
      dims?: number[];
    };
    // Transformers.js returns { data, dims } for pooling.
    // data is a flat array; dims tells us [batch, dim].
    const data = output.data;
    const dims = output.dims ?? [texts.length, 384];
    const dim = dims[dims.length - 1] ?? 384;
    const flat = Array.isArray(data) ? data : Array.from(data as Float32Array);
    // Reshape flat -> [batch][dim]
    embeddings = [];
    for (let i = 0; i < texts.length; i++) {
      embeddings.push(flat.slice(i * dim, (i + 1) * dim));
    }
    measurements["dimensions"] = dim;
  } catch (e) {
    return {
      id: "s07",
      name: "Local embedding model under Bun",
      goal: "Verify a local English embedding model runs under Bun for semantic similarity.",
      result: "fail",
      measurements: { ...measurements, "inferenceError": String(e) },
      notes: "Model loaded but inference failed.",
      artifactPaths: [],
    };
  }
  const inferenceMs = Math.round(performance.now() - t1);
  measurements["inferenceMs"] = inferenceMs;
  measurements["textCount"] = texts.length;

  // Compute cosine similarities.
  function cosine(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i]! * b[i]!;
      normA += a[i]! * a[i]!;
      normB += b[i]! * b[i]!;
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  const sim01 = cosine(embeddings[0]!, embeddings[1]!); // similar stories
  const sim02 = cosine(embeddings[0]!, embeddings[2]!); // different story
  const sim12 = cosine(embeddings[1]!, embeddings[2]!); // different story

  measurements["sim_01_similarStories"] = sim01.toFixed(4);
  measurements["sim_02_differentStory"] = sim02.toFixed(4);
  measurements["sim_12_differentStory"] = sim12.toFixed(4);
  measurements["similarHigherThanDifferent"] = sim01 > sim02 && sim01 > sim12;

  const artifact = await writeArtifact(
    "s07",
    "result.json",
    JSON.stringify({
      model: "Xenova/all-MiniLM-L6-v2",
      texts,
      dimensions: embeddings[0]?.length,
      similarities: { sim01, sim02, sim12 },
      timings: { modelLoadMs, inferenceMs },
    }, null, 2),
  );
  artifacts.push(artifact);

  const pass = sim01 > sim02 && sim01 > sim12 && embeddings[0]!.length > 0;
  return {
    id: "s07",
    name: "Local embedding model under Bun",
    goal: "Verify a local English embedding model runs under Bun for semantic similarity.",
    result: pass ? "pass" : "fail",
    measurements,
    notes: pass
      ? `Xenova/all-MiniLM-L6-v2 runs under Bun via Transformers.js. Similar stories scored ${sim01.toFixed(3)} vs ${sim02.toFixed(3)} for different — semantic ordering correct. Resolves Open Question Q003: use this as the embedding-service default.`
      : "Model ran but semantic ordering was not as expected. Investigate pooling/normalization.",
    artifactPaths: artifacts,
  };
}
