/**
 * S19 — End-to-end mystery documentary video spike.
 *
 * Pipeline:
 *   1. DeepSeek V4-Flash generates a catchy unsolved-mystery script (structured JSON)
 *   2. fal.ai FLUX.2 Klein-4B generates a moody mystery image (vertical 720x1280)
 *   3. Google Gemini TTS (Algenib voice) narrates the script → WAV
 *   4. DeepSeek generates a Remotion composition config (scene timings, text overlays)
 *   5. We write a Remotion project that uses the image + audio + script
 *   6. Deploy to S3 + render via Remotion Lambda
 *   7. Download the finished MP4
 *
 * Usage:
 *   bun run spikes/run.ts s19
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, access, copyFile } from "node:fs/promises";
import { join, dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { spikeDir, writeBinaryArtifact, type SpikeResult } from "./lib/spike.ts";

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const REMOTION_PROJECT = join(__dirname, "s18-remotion-lambda");
const REGION = "us-east-1";

// API keys
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY ?? "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const FAL_KEY = process.env.FAL_KEY ?? "";

const DEEPSEEK_API = "https://api.deepseek.com/chat/completions";
const GEMINI_TTS_API = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent";
const FAL_API = "https://fal.run/fal-ai/flux-2/klein/4b";

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

// ─── Step 1: Generate mystery script via DeepSeek ───────────────────────────

interface MysteryScript {
  title: string;
  hook: string;          // opening line that grabs attention
  mystery: string;       // what's the mystery
  keyFacts: string[];    // 3-4 key facts/details
  theories: string[];    // 2-3 theories
  conclusion: string;    // closing line (unsolved, leave wondering)
  narration: string;     // full narration text (150-200 words, spoken style)
  imagePrompt: string;   // prompt for fal.ai image generation
  scenes: Array<{
    id: string;
    text: string;        // on-screen text overlay
    narrationSegment: string;  // portion of narration for this scene
    mood: string;        // eerie, tense, wondering, dramatic
  }>;
}

async function generateScript(): Promise<MysteryScript> {
  console.log("▸ Step 1: Generating mystery script via DeepSeek V4-Flash...\n");

  const systemInstruction = `You are a master scriptwriter for viral unsolved mystery short-form videos (YouTube Shorts / TikTok format).
Your scripts are gripping, atmospheric, and keep viewers hooked until the end.
You write in a conversational, spoken-word style — not academic prose.
The narration should be 80-120 words, paced for a 45-60 second video. Keep it punchy and fast-paced.
Return ONLY valid JSON, no markdown.`;

  const prompt = `Write a script for an unsolved mystery documentary short video.

Pick a REAL unsolved mystery — something genuinely eerie and compelling. Not the Dyatlov Pass or Roanoke (too overdone). Pick something lesser-known but fascinating.

The script must include:
1. A catchy hook (first 3 seconds — must grab attention immediately)
2. The mystery explained simply
3. 3-4 key facts that make it unsettling
4. 2-3 theories (but don't solve it)
5. A conclusion that leaves the viewer wondering

Also provide:
- An imagePrompt for AI image generation: a single moody, atmospheric image that captures the essence of the mystery. Vertical 9:16 composition. Cinematic, dark, eerie. No text in the image.
- A scenes array (4-5 scenes) with on-screen text overlays and narration segments. Each scene is a beat in the video.

Return JSON in this exact format:
{
  "title": "Short title (3-5 words)",
  "hook": "Opening line — first thing the viewer hears",
  "mystery": "1-2 sentence description of the mystery",
  "keyFacts": ["fact1", "fact2", "fact3", "fact4"],
  "theories": ["theory1", "theory2", "theory3"],
  "conclusion": "Closing line — leave them wondering",
  "narration": "Full narration text, 80-120 words, spoken style, ready for TTS",
  "imagePrompt": "Detailed prompt for AI image generation — moody, cinematic, eerie, vertical composition",
  "scenes": [
    {
      "id": "scene1",
      "text": "On-screen text overlay (short, punchy)",
      "narrationSegment": "The portion of narration for this scene",
      "mood": "eerie|tense|wondering|dramatic|ominous"
    }
  ]
}`;

  const body = {
    model: "deepseek-chat",
    messages: [
      { role: "system", content: systemInstruction },
      { role: "user", content: prompt },
    ],
    max_tokens: 4096,
    stream: false,
    thinking: { type: "disabled" },
    temperature: 0.9,
    response_format: { type: "json_object" },
  };

  const res = await fetch(DEEPSEEK_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DeepSeek API error ${res.status}: ${err}`);
  }

  const raw = (await res.json()) as any;
  const content = raw.choices?.[0]?.message?.content ?? "";
  const script = JSON.parse(content) as MysteryScript;

  console.log(`  Title: ${script.title}`);
  console.log(`  Hook: ${script.hook}`);
  console.log(`  Narration: ${script.narration.length} chars, ~${Math.round(script.narration.length / 5)}s`);
  console.log(`  Scenes: ${script.scenes.length}`);
  console.log(`  Image prompt: ${script.imagePrompt.slice(0, 80)}...\n`);

  return script;
}

// ─── Step 2: Generate mystery image via fal.ai ──────────────────────────────

async function generateImage(prompt: string, outDir: string): Promise<string> {
  console.log("▸ Step 2: Generating mystery image via fal.ai FLUX.2 Klein-4B...\n");

  const requestBody = {
    prompt,
    image_size: { width: 720, height: 1280 },
    num_inference_steps: 4,
    num_images: 1,
    output_format: "jpeg",
    enable_safety_checker: false,
    sync_mode: false,
  };

  const res = await fetch(FAL_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${FAL_KEY}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`fal.ai API error ${res.status}: ${err}`);
  }

  const raw = (await res.json()) as any;
  const imageURL = raw.images?.[0]?.url;
  if (!imageURL) throw new Error("fal.ai returned no image URL");

  // Download the image
  const imgRes = await fetch(imageURL);
  const imgBuf = Buffer.from(await imgRes.arrayBuffer());
  const imgPath = join(outDir, "mystery-image.jpg");
  await writeFile(imgPath, imgBuf);

  console.log(`  Image saved: ${imgPath} (${(imgBuf.length / 1024).toFixed(0)} KB)\n`);
  return imgPath;
}

// ─── Step 3: Generate voiceover via Gemini TTS (Algenib) ────────────────────

async function generateTTS(narration: string, outDir: string): Promise<{ wavPath: string; durationSec: number }> {
  console.log("▸ Step 3: Generating voiceover via Gemini TTS (Algenib voice)...\n");

  const body = {
    contents: [{ role: "user", parts: [{ text: narration }] }],
    generationConfig: {
      temperature: 1,
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: "Algenib" },
        },
      },
    },
  };

  const res = await fetch(`${GEMINI_TTS_API}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini TTS error ${res.status}: ${err}`);
  }

  const raw = (await res.json()) as any;
  const audioPart = raw.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.data);
  if (!audioPart) throw new Error("Gemini TTS returned no audio data");

  const pcmBuf = Buffer.from(audioPart.inlineData.data, "base64");
  const pcmPath = join(outDir, "narration.pcm");
  await writeFile(pcmPath, pcmBuf);

  // Convert PCM (L16, 24kHz, mono) to WAV
  const wavPath = join(outDir, "narration.wav");
  await execAsync(
    `ffmpeg -y -f s16le -ar 24000 -ac 1 -i "${pcmPath}" -c:a pcm_s16le "${wavPath}"`,
  );

  // Get duration
  const { stdout: probeOut } = await execAsync(
    `ffprobe -v quiet -print_format json -show_format "${wavPath}"`,
  );
  const probe = JSON.parse(probeOut);
  const durationSec = parseFloat(probe.format.duration);

  console.log(`  Audio saved: ${wavPath} (${durationSec.toFixed(1)}s)\n`);
  return { wavPath, durationSec };
}

// ─── Step 4: Generate Remotion composition config via DeepSeek ──────────────

interface SceneConfig {
  id: string;
  startFrame: number;
  endFrame: number;
  text: string;
  textAnimation: "fadeInUp" | "typewriter" | "scaleIn" | "slideIn";
  imageEffect: "kenBurnsZoomIn" | "kenBurnsZoomOut" | "panRight" | "panLeft" | "static" | "pulseZoom";
  mood: string;
}

interface CompositionConfig {
  fps: number;
  width: number;
  height: number;
  totalFrames: number;
  scenes: SceneConfig[];
  titleCard: {
    startFrame: number;
    endFrame: number;
    title: string;
    subtitle: string;
  };
  endingCard: {
    startFrame: number;
    endFrame: number;
    text: string;
  };
}

async function generateCompositionConfig(
  script: MysteryScript,
  audioDurationSec: number,
): Promise<CompositionConfig> {
  console.log("▸ Step 4: Generating Remotion composition config via DeepSeek...\n");

  const fps = 30;
  const totalFrames = Math.ceil(audioDurationSec * fps) + 90; // +3s for ending card

  const systemInstruction = `You are a video composition designer. You create Remotion scene configurations for documentary videos.
You know how to pace text overlays, image effects (Ken Burns, pan, zoom), and create cinematic flow.
Return ONLY valid JSON, no markdown.`;

  const prompt = `Design a Remotion composition for a ${audioDurationSec.toFixed(1)}s mystery documentary video.

Video specs:
- ${fps} fps
- 720x1280 (vertical 9:16)
- Total frames: ${totalFrames}
- One background image (mystery image) used throughout with different effects per scene
- Voiceover audio plays from frame 0

Script scenes (from the scriptwriter):
${JSON.stringify(script.scenes, null, 2)}

Full narration duration: ${audioDurationSec.toFixed(1)}s

Design rules:
1. Start with a title card (2 seconds, 60 frames) before the narration begins
2. Each scene gets a portion of the timeline based on its narration segment
3. Use different image effects per scene for visual variety (Ken Burns zoom in/out, pan, pulse)
4. Text overlays should be short and punchy — 1-5 words max
5. Use different text animations: fadeInUp, typewriter, scaleIn, slideIn
6. End with an ending card (3 seconds, 90 frames) after narration ends
7. Distribute scene timings proportionally to narration segment lengths

Return JSON in this exact format:
{
  "fps": ${fps},
  "width": 720,
  "height": 1280,
  "totalFrames": ${totalFrames},
  "scenes": [
    {
      "id": "scene1",
      "startFrame": 60,
      "endFrame": 180,
      "text": "Short overlay text",
      "textAnimation": "fadeInUp",
      "imageEffect": "kenBurnsZoomIn",
      "mood": "eerie"
    }
  ],
  "titleCard": {
    "startFrame": 0,
    "endFrame": 60,
    "title": "${script.title}",
    "subtitle": "An Unsolved Mystery"
  },
  "endingCard": {
    "startFrame": ${totalFrames - 90},
    "endFrame": ${totalFrames},
    "text": "What really happened?"
  }
}`;

  const body = {
    model: "deepseek-chat",
    messages: [
      { role: "system", content: systemInstruction },
      { role: "user", content: prompt },
    ],
    max_tokens: 4096,
    stream: false,
    thinking: { type: "disabled" },
    temperature: 0.7,
    response_format: { type: "json_object" },
  };

  const res = await fetch(DEEPSEEK_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DeepSeek API error ${res.status}: ${err}`);
  }

  const raw = (await res.json()) as any;
  const content = raw.choices?.[0]?.message?.content ?? "";
  const config = JSON.parse(content) as CompositionConfig;

  console.log(`  Total frames: ${config.totalFrames} (${(config.totalFrames / fps).toFixed(1)}s)`);
  console.log(`  Scenes: ${config.scenes.length}`);
  console.log(`  Title card: frames ${config.titleCard.startFrame}-${config.titleCard.endFrame}`);
  console.log(`  Ending card: frames ${config.endingCard.startFrame}-${config.endingCard.endFrame}\n`);

  return config;
}

// ─── Step 5: Write Remotion project ─────────────────────────────────────────

async function writeRemotionProject(
  script: MysteryScript,
  config: CompositionConfig,
  imagePath: string,
  audioPath: string,
  outDir: string,
): Promise<void> {
  console.log("▸ Step 5: Writing Remotion project...\n");

  // Copy image and audio into the Remotion project's public folder
  const publicDir = join(REMOTION_PROJECT, "public");
  await mkdir(publicDir, { recursive: true });
  await copyFile(imagePath, join(publicDir, "mystery-image.jpg"));
  await copyFile(audioPath, join(publicDir, "narration.wav"));

  // Write the composition config as a JSON file for the React component to import
  const configJsonPath = join(REMOTION_PROJECT, "src", "composition-config.json");
  await writeFile(configJsonPath, JSON.stringify(config, null, 2));

  // Write the Remotion composition component
  const componentCode = generateRemotionComponent(config);
  const componentPath = join(REMOTION_PROJECT, "src", "compositions", "MysteryDocumentary.tsx");
  await writeFile(componentPath, componentCode);

  // Update Root.tsx to register the new composition
  const rootCode = `import { Composition } from "remotion";
import { MysteryDocumentary } from "./compositions/MysteryDocumentary";
import config from "./composition-config.json";

export const Root = () => {
  return (
    <>
      <Composition
        id="MysteryDocumentary"
        component={MysteryDocumentary}
        durationInFrames={config.totalFrames}
        fps={config.fps}
        width={config.width}
        height={config.height}
      />
    </>
  );
};
`;
  await writeFile(join(REMOTION_PROJECT, "src", "Root.tsx"), rootCode);

  console.log(`  Component: ${componentPath}`);
  console.log(`  Config: ${configJsonPath}`);
  console.log(`  Public: ${publicDir}/mystery-image.jpg, narration.wav\n`);
}

function generateRemotionComponent(config: CompositionConfig): string {
  const scenes = config.scenes.map((s) => `      <Sequence from={${s.startFrame}} durationInFrames={${s.endFrame - s.startFrame}}>
        <SceneOverlay text="${escapeJsString(s.text)}" animation="${s.textAnimation}" imageEffect="${s.imageEffect}" />
      </Sequence>`).join("\n");

  return `import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
  Sequence,
  Img,
  Audio,
  StaticFile,
} from "remotion";
import config from "../composition-config.json";

const COLORS = {
  bgDark: "#0a0a0a",
  textPrimary: "#f8fafc",
  textSecondary: "#cbd5e1",
  accent: "#dc2626",
  accentDim: "#991b1b",
  overlay: "rgba(0,0,0,0.65)",
};

// ─── Background image with effects ──────────────────────────────────────────

const BackgroundImage: React.FC<{ effect: string; sceneStart: number; sceneDuration: number }> = ({
  effect,
  sceneStart,
  sceneDuration,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const localFrame = frame - sceneStart;

  let transform = "scale(1.1)";
  let filter = "brightness(0.6) contrast(1.1) saturate(0.8)";

  switch (effect) {
    case "kenBurnsZoomIn":
      const zoomIn = interpolate(localFrame, [0, sceneDuration], [1.1, 1.3], {
        extrapolateRight: "clamp",
      });
      transform = \`scale(\${zoomIn})\`;
      break;
    case "kenBurnsZoomOut":
      const zoomOut = interpolate(localFrame, [0, sceneDuration], [1.3, 1.1], {
        extrapolateRight: "clamp",
      });
      transform = \`scale(\${zoomOut})\`;
      break;
    case "panRight":
      const panX = interpolate(localFrame, [0, sceneDuration], [-30, 30], {
        extrapolateRight: "clamp",
      });
      transform = \`scale(1.2) translateX(\${panX}px)\`;
      break;
    case "panLeft":
      const panX2 = interpolate(localFrame, [0, sceneDuration], [30, -30], {
        extrapolateRight: "clamp",
      });
      transform = \`scale(1.2) translateX(\${panX2}px)\`;
      break;
    case "pulseZoom":
      const pulse = 1.15 + Math.sin(localFrame / 15) * 0.05;
      transform = \`scale(\${pulse})\`;
      break;
    case "static":
    default:
      transform = "scale(1.15)";
      break;
  }

  return (
    <AbsoluteFill>
      <Img
        src={staticFile("mystery-image.jpg")}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform,
          filter,
        }}
      />
      {/* Dark gradient overlay for text readability */}
      <AbsoluteFill
        style={{
          background: \`linear-gradient(to bottom, \${COLORS.overlay} 0%, transparent 30%, transparent 60%, \${COLORS.overlay} 100%)\`,
        }}
      />
    </AbsoluteFill>
  );
};

// ─── Text overlay with animations ───────────────────────────────────────────

const SceneOverlay: React.FC<{ text: string; animation: string; imageEffect: string }> = ({
  text,
  animation,
  imageEffect,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  let textOpacity = 1;
  let textY = 0;
  let textScale = 1;

  switch (animation) {
    case "fadeInUp":
      textOpacity = interpolate(frame, [0, 15, durationInFrames - 15, durationInFrames], [0, 1, 1, 0], {
        extrapolateRight: "clamp",
      });
      textY = interpolate(frame, [0, 20], [30, 0], {
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.cubic),
      });
      break;
    case "typewriter":
      const charsToShow = Math.floor(interpolate(frame, [5, text.length * 2 + 5], [0, text.length], {
        extrapolateRight: "clamp",
      }));
      const visibleText = text.slice(0, charsToShow);
      return (
        <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 120 }}>
          <AnimatedText text={visibleText} opacity={interpolate(frame, [0, 5], [0, 1], { extrapolateRight: "clamp" })} />
        </AbsoluteFill>
      );
    case "scaleIn":
      textScale = spring({ frame, fps, config: { damping: 12, stiffness: 80 } });
      textOpacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });
      break;
    case "slideIn":
      textOpacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });
      textY = interpolate(frame, [0, 15], [-50, 0], {
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.cubic),
      });
      break;
  }

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 120 }}>
      <AnimatedText text={text} opacity={textOpacity} y={textY} scale={textScale} />
    </AbsoluteFill>
  );
};

const AnimatedText: React.FC<{ text: string; opacity: number; y?: number; scale?: number }> = ({
  text,
  opacity,
  y = 0,
  scale = 1,
}) => {
  return (
    <div
      style={{
        opacity,
        transform: \`translateY(\${y}px) scale(\${scale})\`,
        textAlign: "center",
        padding: "0 40px",
        maxWidth: "90%",
      }}
    >
      <span
        style={{
          fontFamily: "Georgia, serif",
          fontSize: 36,
          fontWeight: 700,
          color: COLORS.textPrimary,
          textShadow: \`0 2px 20px rgba(0,0,0,0.9), 0 0 40px \${COLORS.accentDim}80\`,
          lineHeight: 1.3,
          letterSpacing: "1px",
        }}
      >
        {text}
      </span>
    </div>
  );
};

// ─── Title card ─────────────────────────────────────────────────────────────

const TitleCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const titleScale = spring({ frame, fps, config: { damping: 12, stiffness: 60 } });
  const titleOpacity = interpolate(frame, [0, 15, durationInFrames - 10, durationInFrames], [0, 1, 1, 0], {
    extrapolateRight: "clamp",
  });
  const subtitleOpacity = interpolate(frame, [15, 30, durationInFrames - 10, durationInFrames], [0, 1, 1, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", backgroundColor: COLORS.bgDark }}>
      <div style={{ opacity: titleOpacity, transform: \`scale(\${titleScale})\`, textAlign: "center" }}>
        <h1
          style={{
            fontFamily: "Georgia, serif",
            fontSize: 52,
            fontWeight: 900,
            color: COLORS.textPrimary,
            margin: 0,
            textShadow: \`0 0 30px \${COLORS.accent}80\`,
            letterSpacing: "2px",
          }}
        >
          ${escapeJsString(config.titleCard.title)}
        </h1>
      </div>
      <div style={{ opacity: subtitleOpacity, marginTop: 16 }}>
        <p
          style={{
            fontFamily: "Georgia, serif",
            fontSize: 22,
            fontWeight: 300,
            color: COLORS.accent,
            letterSpacing: "8px",
            textTransform: "uppercase",
            margin: 0,
          }}
        >
          ${escapeJsString(config.titleCard.subtitle)}
        </p>
      </div>
    </AbsoluteFill>
  );
};

// ─── Ending card ────────────────────────────────────────────────────────────

const EndingCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const opacity = interpolate(frame, [0, 15, durationInFrames - 15, durationInFrames], [0, 1, 1, 0], {
    extrapolateRight: "clamp",
  });
  const scale = spring({ frame, fps, config: { damping: 15, stiffness: 50 } });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", backgroundColor: COLORS.bgDark, opacity }}>
      <div style={{ transform: \`scale(\${scale})\`, textAlign: "center" }}>
        <p
          style={{
            fontFamily: "Georgia, serif",
            fontSize: 34,
            fontWeight: 700,
            color: COLORS.textPrimary,
            margin: 0,
            textShadow: \`0 0 30px \${COLORS.accent}80\`,
            letterSpacing: "1px",
          }}
        >
          ${escapeJsString(config.endingCard.text)}
        </p>
        <p
          style={{
            fontFamily: "Georgia, serif",
            fontSize: 18,
            fontWeight: 300,
            color: COLORS.textSecondary,
            margin: "12px 0 0 0",
            letterSpacing: "4px",
            textTransform: "uppercase",
          }}
        >
          Unsolved
        </p>
      </div>
    </AbsoluteFill>
  );
};

// ─── Main composition ───────────────────────────────────────────────────────

export const MysteryDocumentary: React.FC = () => {
  const cfg = config as any;
  const scenes = cfg.scenes as SceneConfig[];

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bgDark }}>
      {/* Background image with per-scene effects */}
      {scenes.map((scene, i) => (
        <Sequence key={scene.id} from={scene.startFrame} durationInFrames={scene.endFrame - scene.startFrame}>
          <BackgroundImage effect={scene.imageEffect} sceneStart={scene.startFrame} sceneDuration={scene.endFrame - scene.startFrame} />
        </Sequence>
      ))}

      {/* Voiceover audio */}
      <Audio src={staticFile("narration.wav")} />

      {/* Scene text overlays */}
${scenes}

      {/* Title card */}
      <Sequence from={cfg.titleCard.startFrame} durationInFrames={cfg.titleCard.endFrame - cfg.titleCard.startFrame}>
        <TitleCard />
      </Sequence>

      {/* Ending card */}
      <Sequence from={cfg.endingCard.startFrame} durationInFrames={cfg.endingCard.endFrame - cfg.endingCard.startFrame}>
        <EndingCard />
      </Sequence>
    </AbsoluteFill>
  );
};
`;
}

function escapeJsString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\$/g, "\\$");
}

// ─── Step 6: Deploy + render via Remotion Lambda ────────────────────────────

async function deployAndRender(outDir: string): Promise<{ outputPath: string; renderTimeSec: number; cost: number }> {
  console.log("▸ Step 6: Deploying site to S3 + rendering via Lambda...\n");

  // Deploy site (overwrite existing)
  console.log("  Deploying site...");
  const { stdout: deployOut } = await execAsync(
    `cd "${REMOTION_PROJECT}" && bunx remotion lambda sites create src/index.ts --site-name=s19-mystery --region=${REGION} 2>&1 | grep "Serve URL"`,
    { maxBuffer: 10 * 1024 * 1024, timeout: 120000 },
  );
  const serveUrlMatch = deployOut.match(/(https:\/\/\S+)/);
  if (!serveUrlMatch) throw new Error("Failed to get serve URL from deploy output");
  const serveUrl = serveUrlMatch[1];
  console.log(`  Serve URL: ${serveUrl}`);

  // Render via Lambda
  console.log("  Rendering via Lambda...");
  const renderStart = Date.now();
  const outputPath = join(outDir, "output-mystery-documentary.mp4");

  const { stdout: renderOut } = await execAsync(
    `cd "${REMOTION_PROJECT}" && bunx remotion lambda render s19-mystery MysteryDocumentary "${outputPath}" --region=${REGION} --frames-per-lambda=60 2>&1 | tail -5`,
    { maxBuffer: 50 * 1024 * 1024, timeout: 300000 },
  );

  const renderTimeSec = (Date.now() - renderStart) / 1000;

  // Parse cost from output
  const costMatch = renderOut.match(/\$([\d.]+)/);
  const cost = costMatch ? parseFloat(costMatch[1]) : 0;

  console.log(`  Render time: ${renderTimeSec.toFixed(1)}s`);
  console.log(`  Estimated cost: $${cost.toFixed(4)}\n`);

  return { outputPath, renderTimeSec, cost };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<SpikeResult> {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  S19 — End-to-End Mystery Documentary Video");
  console.log("  DeepSeek Script → fal.ai Image → Gemini TTS → Remotion Lambda");
  console.log("═══════════════════════════════════════════════════════════\n");

  if (!DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY not set");
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");
  if (!FAL_KEY) throw new Error("FAL_KEY not set");

  const outDir = await spikeDir("s19");
  const measurements: Record<string, string | number | boolean> = {};
  const artifacts: string[] = [];
  const t0 = Date.now();

  // Step 1: Generate script
  const script = await generateScript();
  await writeFile(join(outDir, "script.json"), JSON.stringify(script, null, 2));
  artifacts.push(join(outDir, "script.json"));

  // Step 2: Generate image
  const imgPath = await generateImage(script.imagePrompt, outDir);
  artifacts.push(imgPath);
  measurements.imageSizeKB = Math.round((await readFile(imgPath)).length / 1024);

  // Step 3: Generate TTS
  const { wavPath, durationSec } = await generateTTS(script.narration, outDir);
  artifacts.push(wavPath);
  measurements.audioDurationSec = parseFloat(durationSec.toFixed(1));
  measurements.audioSizeKB = Math.round((await readFile(wavPath)).length / 1024);

  // Step 4: Generate composition config
  const config = await generateCompositionConfig(script, durationSec);
  await writeFile(join(outDir, "composition-config.json"), JSON.stringify(config, null, 2));
  artifacts.push(join(outDir, "composition-config.json"));

  // Step 5: Write Remotion project
  await writeRemotionProject(script, config, imgPath, wavPath, outDir);

  // Step 6: Deploy + render
  const { outputPath, renderTimeSec, cost } = await deployAndRender(outDir);

  // Verify output
  const { stdout: ffprobeOut } = await execAsync(
    `ffprobe -v quiet -print_format json -show_streams -show_format "${outputPath}"`,
  );
  const probe = JSON.parse(ffprobeOut);
  const vStream = probe.streams.find((s: any) => s.codec_type === "video");
  const aStream = probe.streams.find((s: any) => s.codec_type === "audio");

  measurements.videoResolution = `${vStream?.width}x${vStream?.height}`;
  measurements.videoDurationSec = parseFloat(parseFloat(probe.format.duration).toFixed(1));
  measurements.videoFps = vStream?.r_frame_rate;
  measurements.videoCodec = vStream?.codec_name;
  measurements.videoSizeMB = parseFloat((parseInt(probe.format.size) / 1024 / 1024).toFixed(2));
  measurements.hasAudio = !!aStream;
  measurements.audioCodec = aStream?.codec_name;
  measurements.renderTimeSec = parseFloat(renderTimeSec.toFixed(1));
  measurements.estimatedCost = cost;
  measurements.totalWallClockSec = parseFloat(((Date.now() - t0) / 1000).toFixed(1));

  artifacts.push(outputPath);

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  SPIKE COMPLETE");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Title:          ${script.title}`);
  console.log(`  Video:          ${measurements.videoResolution}, ${measurements.videoDurationSec}s`);
  console.log(`  Audio:          ${measurements.hasAudio ? "yes" : "no"} (${measurements.audioCodec})`);
  console.log(`  File size:      ${measurements.videoSizeMB} MB`);
  console.log(`  Render time:    ${measurements.renderTimeSec}s`);
  console.log(`  AWS cost:       $${cost.toFixed(4)}`);
  console.log(`  Total wall:     ${measurements.totalWallClockSec}s`);
  console.log(`  Output:         ${outputPath}`);
  console.log("");

  return {
    id: "s19",
    name: "End-to-End Mystery Documentary Video",
    goal: "Generate a complete mystery documentary short video: DeepSeek script → fal.ai image → Gemini TTS → Remotion Lambda render. Fully automated, synced, with animations.",
    result: "pass",
    measurements,
    notes:
      `Mystery: "${script.title}". ` +
      `Pipeline: DeepSeek V4-Flash (script + composition config), fal.ai FLUX.2 Klein-4B (image), Gemini TTS Algenib (voiceover), Remotion Lambda (render). ` +
      `Video: ${measurements.videoResolution} ${measurements.videoDurationSec}s with ${config.scenes.length} scenes + title card + ending card. ` +
      `Audio: ${durationSec.toFixed(1)}s narration synced from frame 0. ` +
      `AWS cost: $${cost.toFixed(4)}. Render: ${renderTimeSec.toFixed(1)}s. ` +
      `Total pipeline: ${measurements.totalWallClockSec}s wall clock.`,
    artifactPaths: artifacts,
  };
}

main()
  .then((result) => {
    console.log("\n✅ Spike S19 passed.\n");
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((err) => {
    console.error("\n❌ Spike S19 failed:\n");
    console.error(err);
    process.exit(1);
  });
