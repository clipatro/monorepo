/**
 * S09 — NoahVale character consistency test with realistic approach.
 *
 * Goal: Use the real NoahVale character reference pack (4 images from Google Flow)
 * to generate a new scene with Gemini 3.1 Flash Image, using the user's strict
 * realistic prompt instructions. Validate that the output maintains identity.
 *
 * This is the real character consistency benchmark — not a synthetic test.
 */

import { writeArtifact, writeBinaryArtifact, fileChecksum, spikeDir, type SpikeResult } from "./lib/spike.ts";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const API = "https://generativelanguage.googleapis.com/v1beta";
const MODEL = "gemini-3.1-flash-image"; // Standard for character scenes (D007)
const CHAR_DIR = join(process.cwd(), "characters", "NoahVale");

interface RefImage {
  filename: string;
  role: string;
  buf: Buffer;
  checksum: string;
  width: number;
  height: number;
}

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

async function loadRef(filename: string, role: string): Promise<RefImage> {
  const path = join(CHAR_DIR, filename);
  const buf = await readFile(path);
  const dims = imageDimensions(buf);
  const checksum = createHash("sha256").update(buf).digest("hex");
  return { filename, role, buf, checksum, width: dims.width, height: dims.height };
}

export async function run(): Promise<SpikeResult> {
  if (!GEMINI_KEY) {
    return {
      id: "s09",
      name: "NoahVale character consistency (realistic)",
      goal: "Generate a new scene with the real NoahVale character using strict realistic instructions.",
      result: "fail",
      measurements: { "geminiKey": false },
      notes: "GEMINI_API_KEY not set.",
      artifactPaths: [],
    };
  }

  const dir = await spikeDir("s09");
  const artifacts: string[] = [];

  // Load all 4 reference images.
  const refs: RefImage[] = [];
  const refFiles = [
    { filename: "portrait.jpeg", role: "front_portrait" },
    { filename: "three-quarter.jpeg", role: "three_quarter" },
    { filename: "side-profile.jpeg", role: "side_profile" },
    { filename: "expressions.jpeg", role: "expression_sheet" },
  ];

  for (const r of refFiles) {
    try {
      const ref = await loadRef(r.filename, r.role);
      refs.push(ref);
    } catch (e) {
      return {
        id: "s09",
        name: "NoahVale character consistency (realistic)",
        goal: "Generate a new scene with the real NoahVale character using strict realistic instructions.",
        result: "fail",
        measurements: { "missingRef": r.filename, "error": String(e) },
        notes: `Could not load reference image: ${r.filename}`,
        artifactPaths: [],
      };
    }
  }

  // The user's strict realistic character reference instructions.
  const characterInstructions = `Use the provided reference images as the strict character reference for a man named NoahVale.
Preserve his exact established facial identity, apparent age, facial proportions, natural asymmetry, skin tone and texture, hazel-green eyes, chestnut-brown hairstyle, subtle stubble, body proportions, and canonical wardrobe.

Treat NoahVale as a real actor being photographed in a new environment, not as a character being redesigned. Change only the expression, pose, camera position, and environment explicitly requested.

The result must resemble an authentic unstaged photograph captured with a real camera. Preserve natural pores, individual hair strands, realistic eyes, physically correct anatomy, natural fabric texture, environmental reflections, and believable light interaction. Avoid plastic skin, beauty retouching, artificial symmetry, CGI appearance, illustration, excessive bokeh, HDR, cinematic glow, and synthetic-looking facial details.`;

  // Test scene: NoahVale sitting at a desk, looking thoughtful — a scene from a
  // psychology/procrastination short.
  const scenePrompt = `${characterInstructions}

SCENE: NoahVale sits at a cluttered wooden desk in a dimly lit room late at night. He leans forward with one hand on his forehead, staring at an open laptop screen that casts a cool blue glow on his face. The expression is conflicted — he knows he should work but can't start. A half-empty coffee mug sits beside the laptop. The background is softly out of focus, showing bookshelves in warm shadow.

CAMERA: Eye-level, slightly off-center, shot on a 35mm lens at f/2.8. Shallow but natural depth of field. Vertical 9:16 composition.

LIGHTING: Mixed — warm amber from a desk lamp on the right, cool blue from the laptop screen on the left. Natural, unmotivated lighting. No studio beauty lighting.

OUTPUT: Photorealistic vertical 9:16 image. No text, no watermark, no border.`;

  // Build the request with all reference images + text prompt.
  const parts: Array<Record<string, unknown>> = [];
  for (const ref of refs) {
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: ref.buf.toString("base64"),
      },
    });
  }
  parts.push({ text: scenePrompt });

  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: { temperature: 0.85 },
  };

  const t0 = performance.now();
  const res = await fetch(`${API}/models/${MODEL}:generateContent?key=${GEMINI_KEY}`, {
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

  // Save the raw response for audit.
  const rawArtifact = await writeArtifact("s09", "raw-response.json", JSON.stringify({
    model: MODEL,
    latencyMs,
    httpStatus: res.status,
    refCount: refs.length,
    error: raw.error,
    usage: raw.usageMetadata,
    outputText: raw.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text?.slice(0, 500),
  }, null, 2));
  artifacts.push(rawArtifact);

  if (!res.ok) {
    return {
      id: "s09",
      name: "NoahVale character consistency (realistic)",
      goal: "Generate a new scene with the real NoahVale character using strict realistic instructions.",
      result: "fail",
      measurements: {
        "httpStatus": res.status,
        "latencyMs": latencyMs,
        "refCount": refs.length,
        "errorMessage": raw.error?.message ?? "unknown",
      },
      notes: "Gemini API rejected the request.",
      artifactPaths: artifacts,
    };
  }

  const outParts = raw.candidates?.[0]?.content?.parts ?? [];
  const imagePart = outParts.find((p) => p.inlineData?.data);
  const textPart = outParts.find((p) => p.text);
  const usage = raw.usageMetadata ?? {};

  const measurements: Record<string, string | number | boolean> = {
    "httpStatus": res.status,
    "latencyMs": latencyMs,
    "model": MODEL,
    "refCount": refs.length,
    "hasOutputImage": !!imagePart,
    "outputText": textPart?.text?.slice(0, 300) ?? "",
    "promptTokens": usage.promptTokenCount ?? 0,
    "outputTokens": usage.candidatesTokenCount ?? 0,
  };

  // Record reference checksums for audit.
  for (const ref of refs) {
    measurements[`ref.${ref.role}.checksum`] = ref.checksum.slice(0, 16) + "...";
    measurements[`ref.${ref.role}.dims`] = `${ref.width}x${ref.height}`;
  }

  let outputDims: { width: number; height: number } | null = null;
  if (imagePart?.inlineData?.data) {
    const outBuf = Buffer.from(imagePart.inlineData.data, "base64");
    const outExt = (imagePart.inlineData.mimeType ?? "image/png").includes("jpeg") ? "jpg" : "png";
    const outPath = join(dir, `noahvale-scene-desk.${outExt}`);
    await writeBinaryArtifact("s09", `noahvale-scene-desk.${outExt}`, outBuf);
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

  // Save the full prompt for audit.
  const promptArtifact = await writeArtifact("s09", "prompt.txt", scenePrompt);
  artifacts.push(promptArtifact);

  const pass = !!imagePart && outputDims !== null;
  return {
    id: "s09",
    name: "NoahVale character consistency (realistic)",
    goal: "Generate a new scene with the real NoahVale character using strict realistic instructions.",
    result: pass ? "pass" : "fail",
    measurements,
    notes: pass
      ? `Generated a new NoahVale scene (desk/laptop/night) using 4 reference images + strict realistic instructions. Output: ${outputDims!.width}x${outputDims!.height}. VISUAL IDENTITY CONSISTENCY REQUIRES MANUAL REVIEW — compare the output against the reference images.`
      : "Gemini did not return an image.",
    artifactPaths: artifacts,
  };
}
