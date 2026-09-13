/**
 * LillyToons logo generator.
 *
 * Uses Gemini 3.1 Flash Image (standard) to produce a polished, mascot-style
 * channel logo for "LillyToons" — a kids animation & storytelling channel.
 *
 * Outputs are written to D:\work\clipatro\artifacts\lillytoons-logo\
 *
 * Run:  bun run scripts/generate-lillytoons-logo.ts
 */

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";

// Load .env from project root so GEMINI_API_KEY is available (no external dep).
async function loadEnvFile(path: string): Promise<void> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

await loadEnvFile(join(import.meta.dir, "..", ".env"));

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const API = "https://generativelanguage.googleapis.com/v1beta";
const MODEL = "gemini-3.1-flash-image";
const OUT_DIR = join(import.meta.dir, "..", "artifacts", "lillytoons-logo");

interface ImagePart {
  inlineData?: { mimeType?: string; data?: string };
  text?: string;
}

async function generateImage(prompt: string): Promise<{
  ok: boolean;
  status: number;
  imagePart?: ImagePart;
  text?: string;
  error?: string;
}> {
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    // image models ignore most text-gen config; keep temperature moderate for fidelity.
    generationConfig: { temperature: 0.7 },
  };

  const res = await fetch(`${API}/models/${MODEL}:generateContent?key=${GEMINI_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const raw = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: ImagePart[] } }>;
    error?: { message?: string };
  };

  if (!res.ok) {
    return { ok: false, status: res.status, error: raw.error?.message ?? "unknown" };
  }

  const parts = raw.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p) => p.inlineData?.data);
  const textPart = parts.find((p) => p.text);

  return {
    ok: !!imagePart,
    status: res.status,
    imagePart,
    text: textPart?.text,
  };
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
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
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

const PROMPTS: Array<{ id: string; prompt: string }> = [
  {
    id: "v1-mascot-bunny",
    prompt: [
      "A professional, premium channel logo for a kids animation and storytelling channel.",
      "The exact wordmark \"LillyToons\" is the only text — spelled L-i-l-l-y-T-o-o-n-s, no extra words, letters, symbols or misspellings.",
      "Centered, balanced composition designed to work as a rounded circular profile picture (must read clearly at 98x98 pixels).",
      "Mascot: a cute, friendly cartoon bunny with soft rounded shapes, big expressive curious eyes, subtle blush, gentle smile, holding a small glowing storybook or magic star — integrated naturally above or beside the wordmark, not floating randomly.",
      "Wordmark styling: rounded, playful, highly readable, professionally designed lettering with subtle depth (soft inner highlight + gentle drop shadow), warm pastel palette (lavender, peach, mint, soft gold).",
      "Aesthetic: modern children's-animation studio quality, polished cartoon styling, smooth shapes, subtle depth, clean visual hierarchy, magical but not overly childish or cluttered.",
      "Background: clean, isolated, plain soft-white/very-light-cream background, no scenery, no patterns, no frame, no border, no watermark.",
      "Negative space must be left empty — do not fill the background with sparkles, stars, or decorations.",
      "The whole logo sits inside a softly rounded circular composition with empty negative space around it.",
      "Studio-quality finish, crisp edges, high detail, centered, square 1:1 output.",
    ].join(" "),
  },
  {
    id: "v2-mascot-fox-star",
    prompt: [
      "A professional, charming, memorable channel logo for a kids animation and storytelling channel named \"LillyToons\".",
      "The exact wordmark \"LillyToons\" is the only text — spelled exactly L-i-l-l-y-T-o-o-n-s, no extra words, letters, symbols or misspellings.",
      "Composition: centered, strong visual hierarchy, designed to remain recognizable as a small 98x98 pixel circular profile picture on TikTok and YouTube.",
      "Mascot: a sweet, curious cartoon fox kit with rounded shapes, big friendly eyes, soft fluffy cheeks, gentle smile, a tiny glowing magic star floating above its tail — integrated naturally with the wordmark so the mascot and text feel like one unified logo, not text next to a random character.",
      "Wordmark: rounded, playful, bold, highly readable, professionally designed lettering with subtle gradient and soft shadow for depth.",
      "Palette: warm and magical — coral, golden yellow, soft teal, cream — premium children's-animation aesthetic, polished cartoon styling, smooth shapes, subtle depth.",
      "Magical and imaginative but not overly childish or cluttered; clean and modern.",
      "Background: clean, isolated, plain light-cream background, no scenery, no patterns, no frame, no border, no watermark.",
      "Leave negative space empty — no background sparkles, confetti, or decorations.",
      "Logo sits within a softly rounded circular composition with empty negative space around it.",
      "Polished studio-quality finish, crisp edges, centered, square 1:1 output.",
    ].join(" "),
  },
  {
    id: "v3-mascot-owl-book",
    prompt: [
      "A professional, premium, memorable mascot-style channel logo for a kids animation and storytelling channel.",
      "The only text is the exact wordmark \"LillyToons\" — spelled L-i-l-l-y-T-o-o-n-s, no extra words, letters, symbols or misspellings.",
      "Composition: centered, clean, strong visual hierarchy, must stay recognizable as a 98x98 pixel circular profile picture.",
      "Mascot: a cute, wise, friendly cartoon owl with soft rounded body, big curious eyes, tiny tuft feathers, gentle smile, perched on or holding an open glowing storybook — the book and owl form a natural storytelling emblem integrated with the wordmark below.",
      "Wordmark: rounded, playful, highly readable, professionally designed lettering with subtle depth (soft highlight + gentle shadow).",
      "Palette: dreamy magical pastels — lavender, soft blue, mint, warm gold, cream — modern children's-animation studio aesthetic, polished cartoon styling, smooth shapes, subtle depth.",
      "Imaginative, friendly and magical but not overly childish or cluttered.",
      "Background: clean, isolated, plain soft-white background, no scenery, no patterns, no frame, no border, no watermark.",
      "Negative space must be left empty — no background stars, sparkles, or decorations.",
      "The whole emblem sits inside a softly rounded circular composition with empty negative space around it.",
      "Polished studio-quality finish, crisp edges, centered, square 1:1 output.",
    ].join(" "),
  },
];

async function main() {
  if (!GEMINI_KEY) {
    console.error("GEMINI_API_KEY not set. Put it in D:\\work\\clipatro\\.env");
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });
  console.log(`Output dir: ${OUT_DIR}`);
  console.log(`Model: ${MODEL}\n`);

  const summary: Array<{ id: string; ok: boolean; file?: string; width?: number; height?: number; bytes?: number; error?: string }> = [];

  for (const { id, prompt } of PROMPTS) {
    console.log(`Generating ${id} ...`);
    const t0 = Date.now();
    const res = await generateImage(prompt);
    const ms = Date.now() - t0;

    if (!res.ok || !res.imagePart?.inlineData?.data) {
      console.error(`  FAILED (${ms}ms): ${res.error ?? "no image returned"}`);
      if (res.text) console.error(`  model text: ${res.text.slice(0, 200)}`);
      summary.push({ id, ok: false, error: res.error ?? "no image returned" });
      continue;
    }

    const buf = Buffer.from(res.imagePart.inlineData.data, "base64");
    const mime = res.imagePart.inlineData.mimeType ?? "image/png";
    const ext = mime.includes("jpeg") ? "jpg" : "png";
    const file = join(OUT_DIR, `lillytoons-${id}.${ext}`);
    await writeFile(file, buf);
    const dims = imageDimensions(buf);
    console.log(`  OK (${ms}ms): ${file}  ${dims.width}x${dims.height}  ${buf.length} bytes  (${mime})`);
    if (res.text) console.log(`  model note: ${res.text.slice(0, 200)}`);
    summary.push({ id, ok: true, file, width: dims.width, height: dims.height, bytes: buf.length });
  }

  await writeFile(join(OUT_DIR, "generation-summary.json"), JSON.stringify(summary, null, 2));
  console.log("\nSummary:");
  for (const s of summary) {
    if (s.ok) {
      console.log(`  ${s.id}: ${s.file}  ${s.width}x${s.height}  ${(s.bytes! / 1024).toFixed(1)} KB`);
    } else {
      console.log(`  ${s.id}: FAILED — ${s.error}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
