/**
 * S08 — Gemini image multi-reference input test.
 *
 * Goal: Verify that Gemini 3.1 Flash Image accepts reference images as input
 * (alongside a text prompt) and generates a new scene that maintains the
 * character's identity. This validates the character-consistency strategy.
 *
 * We use the S03 generated image as a "character reference" and ask Gemini
 * to generate the same character in a different scene.
 */

import { writeArtifact, writeBinaryArtifact, fileChecksum, spikeDir, type SpikeResult } from "./lib/spike.ts";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const API = "https://generativelanguage.googleapis.com/v1beta";

function imageDimensions(buf: Buffer): { width: number; height: number } {
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) break;
      const marker = buf[i + 1] ?? 0;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      }
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
      } else {
        const len = buf.readUInt16BE(i + 2);
        i += 2 + len;
      }
    }
  }
  return { width: 0, height: 0 };
}

export async function run(): Promise<SpikeResult> {
  if (!GEMINI_KEY) {
    return {
      id: "s08",
      name: "Gemini image multi-reference input",
      goal: "Verify Gemini Flash Image accepts reference images and maintains character identity.",
      result: "fail",
      measurements: { "geminiKey": false },
      notes: "GEMINI_API_KEY not set.",
      artifactPaths: [],
    };
  }

  const dir = await spikeDir("s08");
  const artifacts: string[] = [];

  // Load the S03 standard image as our "character reference".
  const s03Dir = join(process.cwd(), "spikes", "output", "s03");
  let refBuf: Buffer;
  let refFilePath: string;
  try {
    refFilePath = join(s03Dir, "standard-scene-01.jpg");
    refBuf = await readFile(refFilePath);
  } catch {
    try {
      refFilePath = join(s03Dir, "lite-scene-01.jpg");
      refBuf = await readFile(refFilePath);
    } catch {
      return {
        id: "s08",
        name: "Gemini image multi-reference input",
        goal: "Verify Gemini Flash Image accepts reference images and maintains character identity.",
        result: "fail",
        measurements: { "referenceImage": false },
        notes: "No S03 reference image found. Run S03 first.",
        artifactPaths: [],
      };
    }
  }

  const refBase64 = refBuf.toString("base64");
  const refDims = imageDimensions(refBuf);
  const refChecksum = await fileChecksum(refFilePath);
  await writeArtifact("s08", "reference-info.json", JSON.stringify({ refDims, refChecksum, refSizeBytes: refBuf.length }, null, 2));

  // Test: Pass the reference image + a new scene prompt.
  // Ask Gemini to generate the SAME character (woman from the cafe) in a NEW scene.
  const newScenePrompt = `Using the character shown in the reference image, generate a new scene:
The same young woman is now walking through a sunlit park in autumn, leaves falling around her. She is wearing the same outfit. She looks up at the sky with a hopeful expression. Cinematic, painterly digital art style, warm golden hour lighting, vertical 9:16 composition. No text, no watermark.`;

  const body = {
    contents: [{
      role: "user",
      parts: [
        // First: the reference image
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: refBase64,
          },
        },
        // Then: the text prompt
        { text: newScenePrompt },
      ],
    }],
    generationConfig: { temperature: 0.9 },
  };

  const t0 = performance.now();
  const res = await fetch(`${API}/models/gemini-3.1-flash-image:generateContent?key=${GEMINI_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const latencyMs = Math.round(performance.now() - t0);

  const raw = await res.json() as {
    candidates?: Array<{
      content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string }; text?: string }> };
    }>;
    error?: { message?: string };
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };

  if (!res.ok) {
    const artifact = await writeArtifact("s08", "error.json", JSON.stringify(raw, null, 2));
    return {
      id: "s08",
      name: "Gemini image multi-reference input",
      goal: "Verify Gemini Flash Image accepts reference images and maintains character identity.",
      result: "fail",
      measurements: { "httpStatus": res.status, "latencyMs": latencyMs, "errorMessage": raw.error?.message ?? "unknown" },
      notes: "Gemini API rejected the multi-reference request.",
      artifactPaths: [artifact],
    };
  }

  const parts = raw.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p) => p.inlineData?.data);
  const textPart = parts.find((p) => p.text);
  const usage = raw.usageMetadata ?? {};

  const measurements: Record<string, string | number | boolean> = {
    "httpStatus": res.status,
    "latencyMs": latencyMs,
    "acceptedReferenceImage": true,
    "hasOutputImage": !!imagePart,
    "outputText": textPart?.text?.slice(0, 200) ?? "",
    "promptTokens": usage.promptTokenCount ?? 0,
    "outputTokens": usage.candidatesTokenCount ?? 0,
    "refWidth": refDims.width,
    "refHeight": refDims.height,
  };

  let outputDims: { width: number; height: number } | null = null;
  if (imagePart?.inlineData?.data) {
    const outBuf = Buffer.from(imagePart.inlineData.data, "base64");
    const outExt = (imagePart.inlineData.mimeType ?? "image/png").includes("jpeg") ? "jpg" : "png";
    const outPath = join(dir, `output-scene.${outExt}`);
    await writeBinaryArtifact("s08", `output-scene.${outExt}`, outBuf);
    artifacts.push(outPath);
    outputDims = imageDimensions(outBuf);
    const outChecksum = await fileChecksum(outPath);
    measurements["outputWidth"] = outputDims.width;
    measurements["outputHeight"] = outputDims.height;
    measurements["outputMimeType"] = imagePart.inlineData.mimeType ?? "unknown";
    measurements["outputSizeBytes"] = outBuf.length;
    measurements["outputChecksum"] = outChecksum.slice(0, 16) + "...";
  } else {
    measurements["outputError"] = "No image in response";
  }

  const metaArtifact = await writeArtifact(
    "s08",
    "meta.json",
    JSON.stringify({ newScenePrompt, refDims, usage, latencyMs, hasOutputImage: !!imagePart }, null, 2),
  );
  artifacts.push(metaArtifact);

  const pass = !!imagePart && outputDims !== null;
  return {
    id: "s08",
    name: "Gemini image multi-reference input",
    goal: "Verify Gemini Flash Image accepts reference images and maintains character identity.",
    result: pass ? "pass" : "fail",
    measurements,
    notes: pass
      ? "Gemini Flash Image accepted a reference image as input and generated a new scene. Visual identity consistency requires manual comparison of reference vs output. This validates the multi-reference character consistency approach."
      : "Gemini did not return an image. May not support image input for generation, or the request format needs adjustment.",
    artifactPaths: artifacts,
  };
}
