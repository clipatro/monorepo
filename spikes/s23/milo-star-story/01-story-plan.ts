/**
 * Milo and the Little Star — Story generation with DeepSeek.
 *
 * Calls DeepSeek V4 to generate a complete story script + scene plan
 * for a 30-60 second children's animated video about Milo and a fallen star.
 *
 * Output: story-plan.json with scenes, narration text, and image prompts.
 */

import { writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DeepSeekClient, extractJson } from "@automation/deepseek-client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = __dirname;

// ─── DeepSeek call ──────────────────────────────────────────────────────────

const SYSTEM_INSTRUCTION = `You are a master children's storyteller and animation director.
You create warm, engaging, cinematic stories for children ages 4-8.
Your stories have clear beginnings, adventures, emotional moments, and satisfying endings.
You think in visual scenes — each scene has a clear image, action, and emotion.
You write narration that sounds natural when spoken aloud by a warm storyteller.
Return only the requested JSON.`;

const PROMPT = `Create a complete story plan for a 40-50 second children's animated video.

TITLE: "Milo and the Little Star That Fell from the Sky"

STORY: Milo is a curious young boy who discovers a tiny fallen star in the forest.
The star has lost its glow, so Milo takes it on a small adventure to reach the
highest hill and help it find its way back to the sky. Along the way, they meet
friendly forest animals and learn about friendship, courage, and helping others.

REQUIREMENTS:
- 7-8 scenes, each 4-7 seconds long
- Clear narrative arc: beginning → adventure/problem → emotional moment → satisfying ending
- Warm, gentle, cinematic tone — like a bedtime story come to life
- Each scene must have: narration text (1-2 sentences), image description, emotion/mood
- Narration should be spoken-aloud friendly, ~15-25 words per scene
- The story should feel complete and emotionally satisfying
- Include a final "subscribe" end card scene with no narration

VISUAL CONSISTENCY:
- Milo: a young boy (age 6-7) with curly brown hair, wearing a blue jacket and yellow boots
- The star: a small, glowing, round star character with a friendly face, dimmed/fading
- Forest: warm autumn forest with golden light, friendly atmosphere
- Animals: a rabbit, an owl, and a deer — all cute and friendly
- Art style: soft, warm, storybook illustration style with gentle lighting

Return JSON with this exact structure:
{
  "title": "string",
  "totalDurationSec": number (40-50),
  "artStyle": "detailed description of the consistent art style for all scenes",
  "characterDesign": {
    "milo": "detailed visual description for consistency",
    "star": "detailed visual description for consistency",
    "rabbit": "detailed visual description",
    "owl": "detailed visual description",
    "deer": "detailed visual description"
  },
  "scenes": [
    {
      "sceneId": "string (e.g. 'scene-1')",
      "narration": "string (the spoken narration for this scene)",
      "imagePrompt": "string (detailed prompt for AI image generation, including character descriptions, environment, mood, lighting, art style — must maintain visual consistency)",
      "emotion": "string (the emotional tone of this scene)",
      "durationSec": number (4-7)
    }
  ]
}`;

async function main() {
  console.log("=== Milo and the Little Star — DeepSeek Story Generation ===\n");

  const client = new DeepSeekClient();

  console.log("Calling DeepSeek for story plan...");
  const result = await client.call({
    prompt: PROMPT,
    systemInstruction: SYSTEM_INSTRUCTION,
    model: "deepseek-v4-flash",
    temperature: 0.8,
    maxOutputTokens: 4096,
    responseJson: true,
    capability: "story.generate",
    stepId: "milo-story-plan",
  });

  const storyPlan = extractJson(result.text) as StoryPlan;
  if (!storyPlan || !storyPlan.scenes) {
    console.error("Failed to parse story plan from DeepSeek response");
    console.error("Raw text:", result.text.substring(0, 500));
    process.exit(1);
  }

  const outPath = join(OUT_DIR, "story-plan.json");
  await writeFile(outPath, JSON.stringify(storyPlan, null, 2));

  console.log(`\nStory plan saved to: ${outPath}`);
  console.log(`Title: ${storyPlan.title}`);
  console.log(`Scenes: ${storyPlan.scenes.length}`);
  console.log(`Total duration: ${storyPlan.totalDurationSec}s`);
  console.log(`\nScene breakdown:`);
  storyPlan.scenes.forEach((s, i) => {
    console.log(`  ${i + 1}. [${s.durationSec}s] ${s.emotion}: "${s.narration.substring(0, 60)}..."`);
  });
  console.log(`\n=== Done! ===`);
}

interface StoryPlan {
  title: string;
  totalDurationSec: number;
  artStyle: string;
  characterDesign: Record<string, string>;
  scenes: Array<{
    sceneId: string;
    narration: string;
    imagePrompt: string;
    emotion: string;
    durationSec: number;
  }>;
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
