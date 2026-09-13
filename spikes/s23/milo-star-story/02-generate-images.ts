/**
 * Milo and the Little Star — Image generation with Gemini Flash Image.
 *
 * Generates consistent storybook-style illustrations for each scene using
 * Gemini 3.1 Flash Image. Each image prompt includes the full character
 * design descriptions to maintain visual consistency across all scenes.
 *
 * Output: images/scene-1.png through scene-10.png
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = join(__dirname, "images");
const STORY_PLAN_PATH = join(__dirname, "story-plan.json");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const GEMINI_MODEL = "gemini-3.1-flash-image";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

// ─── Consistent art style prefix for ALL image prompts ──────────────────────

const ART_STYLE_PREFIX = `STORYBOOK ILLUSTRATION STYLE — soft, warm, hand-painted children's book illustration with gentle lighting, rounded shapes, and a dreamy comforting atmosphere. Warm autumn color palette with golden tones. Consistent character designs across all images:

CHARACTER DESIGNS (use EXACTLY these descriptions in every image):
- MILO: A young boy aged 6-7 with curly brown hair, big expressive eyes, wearing a blue jacket and yellow boots. Kind and curious face.
- STAR: A small, round star character with a friendly face (two dot eyes and a smile). Glowing with warm golden-yellow light.
- RABBIT: A friendly, fluffy rabbit with soft brown fur, long ears, gentle expression. Small and cute.
- OWL: A wise, friendly owl with large round eyes, soft brown and white feathers, gentle knowing smile.
- DEER: A gentle, friendly deer with soft brown fur, large kind eyes, small antlers. Elegant and calm.

ART STYLE: Soft storybook illustration, warm golden lighting, rounded shapes, no harsh lines, gentle and inviting. Vertical composition (portrait orientation 9:16).

`;

// ─── Gemini image generation ────────────────────────────────────────────────

async function generateImage(prompt: string, outputPath: string): Promise<void> {
  const fullPrompt = ART_STYLE_PREFIX + prompt;

  const body = {
    contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
    generationConfig: { temperature: 0.7 },
  };

  const res = await fetch(
    `${GEMINI_API_BASE}/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const err = await res.json() as { error?: { message?: string } };
    throw new Error(`Gemini image generation failed: ${err.error?.message ?? `HTTP ${res.status}`}`);
  }

  const raw = await res.json() as {
    candidates?: Array<{
      content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> };
    }>;
  };

  const imagePart = raw.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!imagePart?.inlineData?.data) {
    throw new Error("Gemini returned no image in response");
  }

  const imageBuffer = Buffer.from(imagePart.inlineData.data, "base64");
  await writeFile(outputPath, imageBuffer);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  if (!GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY not set");
    process.exit(1);
  }

  await mkdir(IMAGES_DIR, { recursive: true });

  const storyPlan = JSON.parse(readFileSync(STORY_PLAN_PATH, "utf-8")) as {
    scenes: Array<{ sceneId: string; imagePrompt: string; narration: string }>;
  };

  console.log(`=== Milo and the Little Star — Gemini Image Generation ===\n`);
  console.log(`Model: ${GEMINI_MODEL}`);
  console.log(`Scenes: ${storyPlan.scenes.length}\n`);

  for (const scene of storyPlan.scenes) {
    const imagePath = join(IMAGES_DIR, `${scene.sceneId}.png`);
    console.log(`[${scene.sceneId}] Generating image...`);
    console.log(`  Prompt: "${scene.imagePrompt.substring(0, 80)}..."`);

    try {
      await generateImage(scene.imagePrompt, imagePath);
      console.log(`  → Saved to ${imagePath}`);
    } catch (err) {
      console.error(`  → FAILED: ${err instanceof Error ? err.message : err}`);
      // Continue with other scenes even if one fails
    }
  }

  console.log(`\n=== Done! Images saved to ${IMAGES_DIR} ===`);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
