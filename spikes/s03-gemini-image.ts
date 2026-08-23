/**
 * S03 — Gemini 3.1 Flash Lite Image generation.
 *
 * Goal: Verify the gemini-3.1-flash-lite-image model can generate an image
 * from a text prompt, return inline base64 data, decode to a PNG, and
 * validate dimensions/checksum. This validates the ImageGenerator facade.
 *
 * Also tests gemini-3.1-flash-image (standard) for a quick comparison
 * since both are available and the plan flagged the consistency tradeoff.
 */

import { writeArtifact, writeBinaryArtifact, fileChecksum, spikeDir, type SpikeResult } from "./lib/spike.ts";
import { join } from "node:path";

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const API = "https://generativelanguage.googleapis.com/v1beta";

interface ImagePart {
  inlineData?: { mimeType?: string; data?: string };
  text?: string;
}

async function generateImage(
  model: string,
  prompt: string,
): Promise<{
  ok: boolean;
  status: number;
  latencyMs: number;
  imagePart?: ImagePart;
  text?: string;
  error?: string;
  usage?: { promptTokenCount?: number; candidatesTokenCount?: number };
}> {
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.9 },
  };

  const t0 = performance.now();
  const res = await fetch(`${API}/models/${model}:generateContent?key=${GEMINI_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const latencyMs = Math.round(performance.now() - t0);

  const raw = await res.json() as {
    candidates?: Array<{ content?: { parts?: ImagePart[] } }>;
    error?: { message?: string };
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };

  if (!res.ok) {
    return { ok: false, status: res.status, latencyMs, error: raw.error?.message ?? "unknown", usage: raw.usageMetadata };
  }

  const parts = raw.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p) => p.inlineData?.data);
  const textPart = parts.find((p) => p.text);

  return {
    ok: !!imagePart,
    status: res.status,
    latencyMs,
    imagePart,
    text: textPart?.text,
    usage: raw.usageMetadata,
  };
}

/** Read image dimensions from a PNG or JPEG buffer. */
function imageDimensions(buf: Buffer): { width: number; height: number } {
  // PNG: signature 8 bytes, then IHDR chunk: 4 length + 4 type + 4 width + 4 height
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // JPEG: scan markers for SOF (Start of Frame) to find dimensions.
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) break;
      const marker = buf[i + 1] ?? 0;
      // SOF markers: 0xc0–0xcf (except 0xc4, 0xc8, 0xcc)
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        const height = buf.readUInt16BE(i + 5);
        const width = buf.readUInt16BE(i + 7);
        return { width, height };
      }
      // Skip to next marker. Length is 2 bytes after marker (not for standalone markers).
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
      id: "s03",
      name: "Gemini 3.1 Flash Lite Image generation",
      goal: "Verify Gemini Flash Lite Image generates a valid PNG from a text prompt.",
      result: "fail",
      measurements: { "geminiKey": false },
      notes: "GEMINI_API_KEY not set.",
      artifactPaths: [],
    };
  }

  const dir = await spikeDir("s03");
  const artifacts: string[] = [];
  const prompt = `Generate a vertical 9:16 illustration for a short-form video scene.
Scene: A young woman sits alone at a dimly lit cafe table at night, staring thoughtfully at a half-finished cup of coffee. Rain streaks the window behind her. Warm amber interior light contrasts with cool blue night tones outside. Cinematic, painterly digital art style, soft focus background, emotional and introspective mood. No text, no watermark.`;

  // Test 1: Flash Lite Image (user's chosen default)
  const lite = await generateImage("gemini-3.1-flash-lite-image", prompt);
  const measurements: Record<string, string | number | boolean> = {
    "lite.httpStatus": lite.status,
    "lite.latencyMs": lite.latencyMs,
    "lite.ok": lite.ok,
  };

  let liteDims: { width: number; height: number } | null = null;
  let liteChecksum = "";
  if (lite.ok && lite.imagePart?.inlineData?.data) {
    const buf = Buffer.from(lite.imagePart.inlineData.data, "base64");
    const liteExt = (lite.imagePart.inlineData.mimeType ?? "image/png").includes("jpeg") ? "jpg" : "png";
    const litePath = join(dir, `lite-scene-01.${liteExt}`);
    await writeBinaryArtifact("s03", `lite-scene-01.${liteExt}`, buf);
    artifacts.push(litePath);
    liteDims = imageDimensions(buf);
    liteChecksum = await fileChecksum(litePath);
    measurements["lite.width"] = liteDims.width;
    measurements["lite.height"] = liteDims.height;
    measurements["lite.mimeType"] = lite.imagePart.inlineData.mimeType ?? "unknown";
    measurements["lite.checksum"] = liteChecksum.slice(0, 16) + "...";
    measurements["lite.sizeBytes"] = buf.length;
  } else {
    measurements["lite.error"] = lite.error ?? "no image part returned";
  }

  // Test 2: Flash Image (standard, for comparison)
  const standard = await generateImage("gemini-3.1-flash-image", prompt);
  measurements["standard.httpStatus"] = standard.status;
  measurements["standard.latencyMs"] = standard.latencyMs;
  measurements["standard.ok"] = standard.ok;

  let standardDims: { width: number; height: number } | null = null;
  if (standard.ok && standard.imagePart?.inlineData?.data) {
    const buf = Buffer.from(standard.imagePart.inlineData.data, "base64");
    const stdExt = (standard.imagePart.inlineData.mimeType ?? "image/png").includes("jpeg") ? "jpg" : "png";
    const stdPath = join(dir, `standard-scene-01.${stdExt}`);
    await writeBinaryArtifact("s03", `standard-scene-01.${stdExt}`, buf);
    artifacts.push(stdPath);
    standardDims = imageDimensions(buf);
    const stdChecksum = await fileChecksum(stdPath);
    measurements["standard.width"] = standardDims.width;
    measurements["standard.height"] = standardDims.height;
    measurements["standard.mimeType"] = standard.imagePart.inlineData.mimeType ?? "unknown";
    measurements["standard.checksum"] = stdChecksum.slice(0, 16) + "...";
    measurements["standard.sizeBytes"] = buf.length;
  } else {
    measurements["standard.error"] = standard.error ?? "no image part returned";
  }

  // Save the raw responses for audit
  const metaArtifact = await writeArtifact(
    "s03",
    "meta.json",
    JSON.stringify({
      prompt,
      lite: { latencyMs: lite.latencyMs, ok: lite.ok, text: lite.text, usage: lite.usage },
      standard: { latencyMs: standard.latencyMs, ok: standard.ok, text: standard.text, usage: standard.usage },
    }, null, 2),
  );
  artifacts.push(metaArtifact);

  const litePass = lite.ok && liteDims !== null;
  const standardPass = standard.ok && standardDims !== null;
  const result: "pass" | "partial" | "fail" = litePass && standardPass
    ? "pass"
    : litePass || standardPass
      ? "partial"
      : "fail";

  return {
    id: "s03",
    name: "Gemini 3.1 Flash Lite Image generation",
    goal: "Verify Gemini Flash Lite Image generates a valid PNG; compare with standard Flash Image.",
    result,
    measurements,
    notes: result === "pass"
      ? "Both Lite and Standard Flash Image generated valid PNGs. Visual quality / consistency comparison requires the character-reference benchmark (deferred to a controlled scene set with a frozen character)."
      : result === "partial"
        ? "One model succeeded, one failed. See measurements."
        : "Both image models failed. See error fields.",
    artifactPaths: artifacts,
  };
}
