/**
 * S20 — Informational Economy Documentary Video.
 *
 * Pipeline:
 *   1. DeepSeek V4-Flash generates a structured economy script with chart data
 *   2. Google Gemini TTS (Algenib voice) narrates the script → WAV
 *   3. We build a Remotion composition using templates from reactvideoeditor.com MCP
 *      (cinematic-title-intro, line-chart, pie-chart, animated-list, circular-progress, end-card)
 *      plus a custom bar chart component
 *   4. All scene timings are synced to narration segment durations
 *   5. Render via Remotion Lambda on AWS
 *
 * No captions. No background image. Pure data-driven motion graphics.
 *
 * Usage:
 *   bun run spikes/s20-economy-documentary.ts
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, access, copyFile } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));
const SPIKES_DIR = resolve(__dirname);
const REMOTION_PROJECT = join(__dirname, "s18-remotion-lambda");
const REGION = "us-east-1";
const FPS = 30;

// API keys
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY ?? "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";

const DEEPSEEK_API = "https://api.deepseek.com/chat/completions";
const GEMINI_TTS_API =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface BarChartData {
  title: string;
  bars: Array<{ label: string; value: number; color: string }>;
  yAxisLabel: string;
  maxValue: number;
}

interface LineChartData {
  title: string;
  points: Array<{ label: string; value: number }>;
  yAxisLabel: string;
  maxValue: number;
  lineColor: string;
}

interface PieChartData {
  title: string;
  segments: Array<{ label: string; value: number; color: string }>;
}

interface ListData {
  title: string;
  items: Array<{ name: string; description: string; color: string }>;
}

interface CircularProgressData {
  title: string;
  percentage: number;
  label: string;
  sublabel: string;
  color: string;
}

interface EconomyScript {
  topic: string;
  title: string;
  subtitle: string;
  narration: string;
  scenes: Array<{
    id: string;
    template: "cinematic-title-intro" | "bar-chart" | "line-chart" | "pie-chart" | "animated-list" | "circular-progress" | "end-card";
    narrationSegment: string;
    data: BarChartData | LineChartData | PieChartData | ListData | CircularProgressData | null;
  }>;
}

// ─── Step 1: Generate economy script via DeepSeek ───────────────────────────

async function generateScript(): Promise<EconomyScript> {
  console.log("▸ Step 1: Generating economy script via DeepSeek V4-Flash...\n");

  const systemInstruction = `You are a master scriptwriter for informational documentary short-form videos about economics.
Your scripts are clear, engaging, and make complex economic concepts accessible to a general audience.
You write in a conversational, spoken-word style — not academic prose.
The narration should be 120-160 words, paced for a 60-80 second video.
Return ONLY valid JSON, no markdown.`;

  const prompt = `Write a script for an informational documentary short video about the economy.

Pick a compelling economic topic — something that affects everyone but is poorly understood. Good options: inflation, GDP, the 2008 financial crisis, how central banks work, wealth inequality, supply and demand, the national debt, or the gig economy.

The video will use animated data visualizations (bar charts, line charts, pie charts, lists, progress rings) — NOT background images. Each scene shows a different data visualization synced to the narration.

The script must include:
1. A clear title and subtitle for the opening title card
2. A narration track (120-160 words, spoken style, ready for TTS)
3. 5-6 scenes, each with:
   - A narration segment (portion of the full narration)
   - A template type (one of: cinematic-title-intro, bar-chart, line-chart, pie-chart, animated-list, circular-progress)
   - Data for that visualization (realistic numbers, real economic data where possible)

Scene structure:
- Scene 1: ALWAYS "cinematic-title-intro" (the opening title card, narrationSegment can be empty or a brief intro)
- Scenes 2-5: Data visualizations (mix of bar-chart, line-chart, pie-chart, animated-list, circular-progress)
- Last scene: The closing narration segment (no template needed, or use animated-list for key takeaways)

For chart data, use REAL economic data where possible. Make the numbers realistic and educational.

Return JSON in this exact format:
{
  "topic": "Brief topic description",
  "title": "Documentary title (4-8 words)",
  "subtitle": "Subtitle (3-6 words)",
  "narration": "Full narration text, 120-160 words, spoken style, ready for TTS",
  "scenes": [
    {
      "id": "scene1",
      "template": "cinematic-title-intro",
      "narrationSegment": "",
      "data": null
    },
    {
      "id": "scene2",
      "template": "bar-chart",
      "narrationSegment": "Portion of narration for this scene",
      "data": {
        "title": "Chart Title",
        "yAxisLabel": "Unit",
        "maxValue": 100,
        "bars": [
          { "label": "Label A", "value": 85, "color": "#4361ee" },
          { "label": "Label B", "value": 60, "color": "#7209b7" }
        ]
      }
    },
    {
      "id": "scene3",
      "template": "line-chart",
      "narrationSegment": "Portion of narration",
      "data": {
        "title": "Chart Title",
        "yAxisLabel": "Unit",
        "maxValue": 100,
        "lineColor": "#4361ee",
        "points": [
          { "label": "2019", "value": 30 },
          { "label": "2020", "value": 45 }
        ]
      }
    },
    {
      "id": "scene4",
      "template": "pie-chart",
      "narrationSegment": "Portion of narration",
      "data": {
        "title": "Chart Title",
        "segments": [
          { "label": "Segment A", "value": 40, "color": "#4361ee" },
          { "label": "Segment B", "value": 30, "color": "#7209b7" }
        ]
      }
    },
    {
      "id": "scene5",
      "template": "animated-list",
      "narrationSegment": "Portion of narration",
      "data": {
        "title": "List Title",
        "items": [
          { "name": "Item One", "description": "Brief description", "color": "#3b82f6" },
          { "name": "Item Two", "description": "Brief description", "color": "#60a5fa" }
        ]
      }
    },
    {
      "id": "scene6",
      "template": "circular-progress",
      "narrationSegment": "Final portion of narration",
      "data": {
        "title": "KPI Title",
        "percentage": 65,
        "label": "Label text",
        "sublabel": "Sub label",
        "color": "#3b82f6"
      }
    }
  ]
}

IMPORTANT: The narrationSegment values across all scenes must concatenate to form the full narration text (minus scene 1 which is the title card). Keep segments in order.`;

  const body = {
    model: "deepseek-chat",
    messages: [
      { role: "system", content: systemInstruction },
      { role: "user", content: prompt },
    ],
    max_tokens: 8192,
    stream: false,
    thinking: { type: "disabled" },
    temperature: 0.8,
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
  const script = JSON.parse(content) as EconomyScript;

  console.log(`  Topic: ${script.topic}`);
  console.log(`  Title: ${script.title}`);
  console.log(`  Subtitle: ${script.subtitle}`);
  console.log(`  Narration: ${script.narration.length} chars, ~${Math.round(script.narration.length / 5)}s`);
  console.log(`  Scenes: ${script.scenes.length}`);
  for (const s of script.scenes) {
    console.log(`    ${s.id}: ${s.template} — "${s.narrationSegment?.slice(0, 50) ?? ""}..."`);
  }
  console.log();

  return script;
}

// ─── Step 2: Generate voiceover via Gemini TTS (Algenib) ────────────────────

async function generateTTS(
  narration: string,
  outDir: string,
): Promise<{ wavPath: string; durationSec: number }> {
  console.log("▸ Step 2: Generating voiceover via Gemini TTS (Algenib voice)...\n");

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

// ─── Step 3: Compute scene timings from narration ───────────────────────────

interface SceneTiming {
  id: string;
  template: string;
  startFrame: number;
  endFrame: number;
  durationFrames: number;
  narrationSegment: string;
  data: any;
}

interface CompositionConfig {
  fps: number;
  width: number;
  height: number;
  totalFrames: number;
  titleCard: { startFrame: number; endFrame: number; title: string; subtitle: string };
  scenes: SceneTiming[];
  endCard: { startFrame: number; endFrame: number };
}

function computeTimings(script: EconomyScript, audioDurationSec: number): CompositionConfig {
  console.log("▸ Step 3: Computing scene timings from narration...\n");

  const width = 720;
  const height = 1280;

  // Title card: 2.5 seconds (75 frames)
  const titleCardFrames = 75;

  // End card: 3 seconds (90 frames)
  const endCardFrames = 90;

  // Narration starts after title card
  const narrationStartFrame = titleCardFrames;
  const narrationTotalFrames = Math.ceil(audioDurationSec * FPS);

  // Total video = title card + narration + end card
  const totalFrames = titleCardFrames + narrationTotalFrames + endCardFrames;

  // Distribute narration frames across scenes proportionally to narration segment lengths
  // Scene 1 (title card) has no narration segment
  const narrationScenes = script.scenes.filter((s) => s.narrationSegment && s.narrationSegment.length > 0);
  const totalNarrationChars = narrationScenes.reduce((sum, s) => sum + s.narrationSegment.length, 0);

  let currentFrame = narrationStartFrame;
  const sceneTimings: SceneTiming[] = [];

  for (const scene of script.scenes) {
    if (scene.template === "cinematic-title-intro") {
      // Title card scene — already covered by titleCard timing
      continue;
    }

    const segmentLen = scene.narrationSegment?.length ?? 0;
    const proportion = totalNarrationChars > 0 ? segmentLen / totalNarrationChars : 0;
    const sceneFrames = Math.max(30, Math.round(narrationTotalFrames * proportion));

    sceneTimings.push({
      id: scene.id,
      template: scene.template,
      startFrame: currentFrame,
      endFrame: currentFrame + sceneFrames,
      durationFrames: sceneFrames,
      narrationSegment: scene.narrationSegment ?? "",
      data: scene.data,
    });

    currentFrame += sceneFrames;
  }

  // Adjust last scene to end exactly at narration end
  if (sceneTimings.length > 0) {
    const lastScene = sceneTimings[sceneTimings.length - 1];
    lastScene.endFrame = narrationStartFrame + narrationTotalFrames;
    lastScene.durationFrames = lastScene.endFrame - lastScene.startFrame;
  }

  const config: CompositionConfig = {
    fps: FPS,
    width,
    height,
    totalFrames,
    titleCard: {
      startFrame: 0,
      endFrame: titleCardFrames,
      title: script.title,
      subtitle: script.subtitle,
    },
    scenes: sceneTimings,
    endCard: {
      startFrame: titleCardFrames + narrationTotalFrames,
      endFrame: totalFrames,
    },
  };

  console.log(`  Total frames: ${totalFrames} (${(totalFrames / FPS).toFixed(1)}s)`);
  console.log(`  Title card: frames 0-${titleCardFrames} (${(titleCardFrames / FPS).toFixed(1)}s)`);
  for (const s of sceneTimings) {
    console.log(`  ${s.id} (${s.template}): frames ${s.startFrame}-${s.endFrame} (${(s.durationFrames / FPS).toFixed(1)}s)`);
  }
  console.log(`  End card: frames ${config.endCard.startFrame}-${config.endCard.endFrame} (${(endCardFrames / FPS).toFixed(1)}s)`);
  console.log();

  return config;
}

// ─── Step 4: Write Remotion project ─────────────────────────────────────────

async function writeRemotionProject(
  script: EconomyScript,
  config: CompositionConfig,
  audioPath: string,
  outDir: string,
): Promise<void> {
  console.log("▸ Step 4: Writing Remotion project with MCP templates...\n");

  // Copy audio into the Remotion project's public folder
  const publicDir = join(REMOTION_PROJECT, "public");
  await mkdir(publicDir, { recursive: true });
  await copyFile(audioPath, join(publicDir, "narration.wav"));

  // Write the composition config as a JSON file
  const configJsonPath = join(REMOTION_PROJECT, "src", "composition-config.json");
  await writeFile(configJsonPath, JSON.stringify(config, null, 2));

  // Write the Remotion composition component
  const componentCode = generateRemotionComponent(config);
  const componentPath = join(REMOTION_PROJECT, "src", "compositions", "EconomyDocumentary.tsx");
  await writeFile(componentPath, componentCode);

  // Update Root.tsx to register the new composition
  const rootCode = `import { Composition } from "remotion";
import { EconomyDocumentary } from "./compositions/EconomyDocumentary";
import config from "./composition-config.json";

export const Root = () => {
  return (
    <>
      <Composition
        id="EconomyDocumentary"
        component={EconomyDocumentary}
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

  // Update index.ts
  await writeFile(
    join(REMOTION_PROJECT, "src", "index.ts"),
    `import { registerRoot } from "remotion";\nimport { Root } from "./Root";\nregisterRoot(Root);\n`,
  );

  console.log(`  Component: ${componentPath}`);
  console.log(`  Config: ${configJsonPath}`);
  console.log(`  Audio: ${publicDir}/narration.wav\n`);
}

// ─── Remotion component generator ────────────────────────────────────────────

function generateRemotionComponent(config: CompositionConfig): string {
  const sceneSequences = config.scenes
    .map((s) => {
      const dataStr = JSON.stringify(s.data);
      return `      <Sequence from={${s.startFrame}} durationInFrames={${s.durationFrames}}>
        <SceneWrapper template="${s.template}" data={${dataStr}} />
      </Sequence>`;
    })
    .join("\n");

  return `import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
  Sequence,
  Audio,
  staticFile,
} from "remotion";
import config from "../composition-config.json";

const COLORS = {
  bgDark: "#0f172a",
  bgGradient: "linear-gradient(135deg, #111827 0%, #1a1a2e 100%)",
  textPrimary: "#f8fafc",
  textSecondary: "#cbd5e1",
  accent: "#4361ee",
  accent2: "#7209b7",
  accent3: "#f72585",
  cardBg: "rgba(0, 0, 0, 0.3)",
  gridLine: "rgba(255,255,255,0.1)",
  axisLine: "rgba(255,255,255,0.2)",
  axisLabel: "rgba(255,255,255,0.6)",
  axisLabelBright: "rgba(255,255,255,0.8)",
};

const FONT = "Inter, system-ui, -apple-system, sans-serif";

// ─── Scene Wrapper ──────────────────────────────────────────────────────────

const SceneWrapper: React.FC<{ template: string; data: any }> = ({ template, data }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Fade in/out for each scene
  const fadeIn = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut);

  return (
    <AbsoluteFill style={{ opacity, background: COLORS.bgGradient, fontFamily: FONT }}>
      {template === "bar-chart" && <BarChart data={data} />}
      {template === "line-chart" && <LineChart data={data} />}
      {template === "pie-chart" && <PieChart data={data} />}
      {template === "animated-list" && <AnimatedList data={data} />}
      {template === "circular-progress" && <CircularProgress data={data} />}
    </AbsoluteFill>
  );
};

// ─── Bar Chart (custom — pro template not available) ────────────────────────

const BarChart: React.FC<{ data: any }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const d = data;
  const chartWidth = 620;
  const chartHeight = 800;
  const padding = 80;
  const barAreaWidth = chartWidth - padding * 2;
  const barAreaHeight = chartHeight - padding * 2 - 60;
  const barCount = d.bars.length;
  const barWidth = Math.min(80, barAreaWidth / barCount * 0.6);
  const barGap = barAreaWidth / barCount;

  return (
    <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "relative", width: chartWidth, height: chartHeight, backgroundColor: COLORS.cardBg, borderRadius: 16, boxShadow: "0 10px 30px rgba(0,0,0,0.3)", overflow: "hidden", padding: 20 }}>
        {/* Title */}
        <div style={{ position: "absolute", top: 25, left: "50%", transform: "translateX(-50%)", fontSize: 26, fontWeight: 600, color: COLORS.textPrimary, textShadow: "0 2px 4px rgba(0,0,0,0.3)", letterSpacing: "-0.5px", whiteSpace: "nowrap" }}>
          {d.title}
        </div>

        <svg width={chartWidth} height={chartHeight} style={{ marginTop: 20 }}>
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
            const y = padding + barAreaHeight * (1 - pct);
            return (
              <g key={"grid-" + i}>
                <line x1={padding} y1={y} x2={chartWidth - padding} y2={y} stroke={COLORS.gridLine} strokeWidth={1} />
                <text x={padding - 10} y={y + 5} textAnchor="end" fill={COLORS.axisLabel} fontSize={12}>
                  {Math.round(d.maxValue * pct)}
                </text>
              </g>
            );
          })}

          {/* Y-axis label */}
          <text x={20} y={chartHeight / 2} textAnchor="middle" fill={COLORS.axisLabel} fontSize={12} transform={"rotate(-90 20 " + (chartHeight / 2) + ")"}>
            {d.yAxisLabel}
          </text>

          {/* X-axis */}
          <line x1={padding} y1={padding + barAreaHeight} x2={chartWidth - padding} y2={padding + barAreaHeight} stroke={COLORS.axisLine} strokeWidth={2} />
          <line x1={padding} y1={padding} x2={padding} y2={padding + barAreaHeight} stroke={COLORS.axisLine} strokeWidth={2} />

          {/* Bars */}
          {d.bars.map((bar: any, i: number) => {
            const barX = padding + barGap * i + (barGap - barWidth) / 2;
            const targetHeight = (bar.value / d.maxValue) * barAreaHeight;
            const stagger = i * 8;
            const barHeight = interpolate(frame, [10 + stagger, 40 + stagger], [0, targetHeight], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            const labelOpacity = interpolate(frame, [30 + stagger, 45 + stagger], [0, 1], { extrapolateRight: "clamp" });
            const valueOpacity = interpolate(frame, [35 + stagger, 50 + stagger], [0, 1], { extrapolateRight: "clamp" });
            const valueY = interpolate(frame, [35 + stagger, 50 + stagger], [padding + barAreaHeight, padding + barAreaHeight - targetHeight - 10], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });

            return (
              <g key={"bar-" + i}>
                <rect x={barX} y={padding + barAreaHeight - barHeight} width={barWidth} height={barHeight} fill={bar.color} rx={4} />
                <text x={barX + barWidth / 2} y={padding + barAreaHeight + 25} textAnchor="middle" fill={COLORS.axisLabelBright} fontSize={13} fontWeight={400} opacity={labelOpacity}>
                  {bar.label}
                </text>
                <text x={barX + barWidth / 2} y={valueY} textAnchor="middle" fill={COLORS.textPrimary} fontSize={16} fontWeight={600} opacity={valueOpacity}>
                  {bar.value}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </AbsoluteFill>
  );
};

// ─── Line Chart (adapted from reactvideoeditor template) ────────────────────

const LineChart: React.FC<{ data: any }> = ({ data }) => {
  const frame = useCurrentFrame();

  const d = data;
  const chartWidth = 620;
  const chartHeight = 800;
  const padding = 80;
  const plotWidth = chartWidth - padding * 2;
  const plotHeight = chartHeight - padding * 2 - 60;

  const xScale = (i: number) => (i / (d.points.length - 1)) * plotWidth + padding;
  const yScale = (y: number) => padding + plotHeight - (y / d.maxValue) * plotHeight;

  const points = d.points.map((p: any, i: number) => xScale(i) + "," + yScale(p.value)).join(" ");

  // Calculate total polyline length
  let totalLength = 0;
  for (let i = 1; i < d.points.length; i++) {
    const dx = xScale(i) - xScale(i - 1);
    const dy = yScale(d.points[i].value) - yScale(d.points[i - 1].value);
    totalLength += Math.sqrt(dx * dx + dy * dy);
  }

  const dashOffset = interpolate(frame, [10, 70], [totalLength, 0], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "relative", width: chartWidth, height: chartHeight, backgroundColor: COLORS.cardBg, borderRadius: 16, boxShadow: "0 10px 30px rgba(0,0,0,0.3)", overflow: "hidden", padding: 20 }}>
        {/* Title */}
        <div style={{ position: "absolute", top: 25, left: "50%", transform: "translateX(-50%)", fontSize: 26, fontWeight: 600, color: COLORS.textPrimary, textShadow: "0 2px 4px rgba(0,0,0,0.3)", letterSpacing: "-0.5px", whiteSpace: "nowrap" }}>
          {d.title}
        </div>

        <svg width={chartWidth} height={chartHeight} style={{ marginTop: 20 }}>
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
            const y = padding + plotHeight * (1 - pct);
            return (
              <g key={"grid-" + i}>
                <line x1={padding} y1={y} x2={chartWidth - padding} y2={y} stroke={COLORS.gridLine} strokeWidth={1} />
                <text x={padding - 10} y={y + 5} textAnchor="end" fill={COLORS.axisLabel} fontSize={12}>
                  {Math.round(d.maxValue * pct)}
                </text>
              </g>
            );
          })}

          {/* Axes */}
          <line x1={padding} y1={padding + plotHeight} x2={chartWidth - padding} y2={padding + plotHeight} stroke={COLORS.axisLine} strokeWidth={2} />
          <line x1={padding} y1={padding} x2={padding} y2={padding + plotHeight} stroke={COLORS.axisLine} strokeWidth={2} />

          {/* X-axis labels */}
          {d.points.map((p: any, i: number) => (
            <text key={"x-" + i} x={xScale(i)} y={padding + plotHeight + 25} textAnchor="middle" fill={COLORS.axisLabelBright} fontSize={13} fontWeight={400}>
              {p.label}
            </text>
          ))}

          {/* Animated polyline */}
          <polyline points={points} fill="none" stroke={d.lineColor} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={totalLength} strokeDashoffset={dashOffset} />

          {/* Data points */}
          {d.points.map((p: any, i: number) => {
            const pointProgress = interpolate(frame, [15 + i * 6, 20 + i * 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            return (
              <g key={"pt-" + i}>
                <circle cx={xScale(i)} cy={yScale(p.value)} r={6 * pointProgress} fill={d.lineColor} stroke="white" strokeWidth={2} opacity={pointProgress} />
                {pointProgress > 0.5 && (
                  <text x={xScale(i)} y={yScale(p.value) - 15} textAnchor="middle" fill={COLORS.textPrimary} fontSize={14} fontWeight={600} opacity={interpolate(frame, [20 + i * 6, 25 + i * 6], [0, 1], { extrapolateRight: "clamp" })}>
                    {p.value}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </AbsoluteFill>
  );
};

// ─── Pie Chart (adapted from reactvideoeditor template) ─────────────────────

const PieChart: React.FC<{ data: any }> = ({ data }) => {
  const frame = useCurrentFrame();

  const d = data;
  const total = d.segments.reduce((s: number, seg: any) => s + seg.value, 0);
  const svgSize = 600;
  const cx = svgSize / 2;
  const cy = svgSize / 2;
  const radius = 160;
  const circumference = 2 * Math.PI * radius;

  let cumulativeOffset = 0;

  return (
    <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "relative", width: 620, height: 900, backgroundColor: COLORS.cardBg, borderRadius: 16, boxShadow: "0 10px 30px rgba(0,0,0,0.3)", overflow: "hidden", padding: 20, display: "flex", flexDirection: "column", alignItems: "center" }}>
        {/* Title */}
        <div style={{ fontSize: 26, fontWeight: 600, color: COLORS.textPrimary, textShadow: "0 2px 4px rgba(0,0,0,0.3)", letterSpacing: "-0.5px", marginTop: 15, marginBottom: 10 }}>
          {d.title}
        </div>

        <svg width={svgSize} height={svgSize * 0.7}>
          {/* Pie segments */}
          {d.segments.map((seg: any, i: number) => {
            const segLen = (seg.value / total) * circumference;
            const currentOff = cumulativeOffset;
            cumulativeOffset += segLen;
            const prog = interpolate(frame, [10 + i * 12, 25 + i * 12], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
            const animLen = segLen * prog;
            return (
              <circle key={"seg-" + i} cx={cx} cy={cy} r={radius} fill="none" stroke={seg.color} strokeWidth={90} strokeDasharray={animLen + " " + (circumference - animLen)} strokeDashoffset={-currentOff} transform={"rotate(-90 " + cx + " " + cy + ")"} />
            );
          })}
          {/* Center circle */}
          <circle cx={cx} cy={cy} r={70} fill="#111827" />
          <text x={cx} y={cy + 8} textAnchor="middle" fill={COLORS.textPrimary} fontSize={28} fontWeight={700}>
            {total}%
          </text>
        </svg>

        {/* Legend */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "center", marginTop: 10, maxWidth: 560 }}>
          {d.segments.map((seg: any, i: number) => {
            const legOp = interpolate(frame, [15 + i * 12, 25 + i * 12], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
            return (
              <div key={"leg-" + i} style={{ display: "flex", alignItems: "center", gap: 8, opacity: legOp }}>
                <div style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: seg.color }} />
                <span style={{ color: COLORS.axisLabelBright, fontSize: 16 }}>{seg.label} ({seg.value}%)</span>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Animated List (adapted from reactvideoeditor template) ─────────────────

const AnimatedList: React.FC<{ data: any }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const d = data;

  return (
    <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
      <div style={{ width: "100%", maxWidth: 620 }}>
        {/* Title */}
        <div style={{ fontSize: 28, fontWeight: 600, color: COLORS.textPrimary, textAlign: "center", marginBottom: 40, textShadow: "0 2px 4px rgba(0,0,0,0.3)" }}>
          {d.title}
        </div>

        {d.items.map((item: any, i: number) => {
          const delay = i * 12;
          const slideX = spring({ frame: frame - delay, fps, from: -120, to: 0, config: { damping: 12, mass: 0.5 } });
          const opacity = spring({ frame: frame - delay, fps, from: 0, to: 1, config: { damping: 12, mass: 0.5 } });
          const scale = spring({ frame: frame - delay, fps, from: 0.3, to: 1, config: { damping: 12, mass: 0.5 } });

          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 24, transform: "translateX(" + slideX + "px) scale(" + scale + ")", opacity }}>
              <div style={{ width: 60, height: 60, borderRadius: 12, backgroundColor: item.color, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(0,0,0,0.2)", flexShrink: 0 }}>
                <span style={{ color: "white", fontSize: 24, fontWeight: 700 }}>{i + 1}</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: COLORS.textPrimary, fontSize: 24, fontWeight: 600, marginBottom: 4 }}>{item.name}</div>
                <div style={{ color: COLORS.textSecondary, fontSize: 16, fontWeight: 400 }}>{item.description}</div>
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ─── Circular Progress (adapted from reactvideoeditor template) ─────────────

const CircularProgress: React.FC<{ data: any }> = ({ data }) => {
  const frame = useCurrentFrame();

  const d = data;
  const radius = 90;
  const circumference = 2 * Math.PI * radius;
  const targetProgress = d.percentage;
  const progress = interpolate(frame, [10, 60], [0, targetProgress], { extrapolateRight: "clamp" });
  const strokeDashoffset = circumference - (progress / 100) * circumference;
  const pulse = 1 + Math.sin(frame / 12) * 0.03;

  return (
    <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        {/* Title */}
        <div style={{ fontSize: 28, fontWeight: 600, color: COLORS.textPrimary, textAlign: "center", marginBottom: 40, textShadow: "0 2px 4px rgba(0,0,0,0.3)" }}>
          {d.title}
        </div>

        <div style={{ position: "relative", width: 320, height: 320, transform: "scale(" + pulse + ")" }}>
          {/* Background circle */}
          <svg width="100%" height="100%" viewBox="0 0 200 200" style={{ position: "absolute", transform: "rotate(-90deg)" }}>
            <circle cx="100" cy="100" r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={14} />
          </svg>

          {/* Progress circle */}
          <svg width="100%" height="100%" viewBox="0 0 200 200" style={{ position: "absolute", transform: "rotate(-90deg)" }}>
            <circle cx="100" cy="100" r={radius} fill="none" stroke={d.color} strokeWidth={14} strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" />
          </svg>

          {/* Percentage text */}
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <span style={{ fontSize: 56, fontWeight: 700, color: COLORS.textPrimary }}>{Math.round(progress)}%</span>
            <span style={{ fontSize: 18, fontWeight: 400, color: COLORS.textSecondary, marginTop: 4 }}>{d.label}</span>
          </div>
        </div>

        {/* Sublabel */}
        <div style={{ marginTop: 30, fontSize: 20, fontWeight: 400, color: COLORS.textSecondary, textAlign: "center", maxWidth: 500 }}>
          {d.sublabel}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Title Card (adapted from cinematic-title-intro template) ───────────────

const TitleCard: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const titleY = spring({ frame, fps, from: 50, to: 0, durationInFrames: 40, config: { damping: 14, mass: 0.8 } });
  const titleOpacity = spring({ frame, fps, from: 0, to: 1, durationInFrames: 30 });
  const underlineWidth = interpolate(frame, [20, 50], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const subtitleOpacity = interpolate(frame, [40, 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const exitOpacity = interpolate(frame, [durationInFrames - 15, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: COLORS.bgGradient, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", opacity: exitOpacity }}>
      <h1 style={{ color: COLORS.textPrimary, fontSize: "3.5rem", fontWeight: 700, opacity: titleOpacity, transform: "translateY(" + titleY + "px)", margin: 0, letterSpacing: "0.03em", textAlign: "center", padding: "0 40px" }}>
        ${escapeJsString(config.titleCard.title)}
      </h1>
      <div style={{ width: underlineWidth + "%", maxWidth: 320, height: 4, background: "linear-gradient(90deg, " + COLORS.accent + ", " + COLORS.accent2 + ")", borderRadius: 2, marginTop: 16 }} />
      <p style={{ color: "rgba(255,255,255,0.8)", fontSize: "1.4rem", fontWeight: 300, opacity: subtitleOpacity, marginTop: 24, letterSpacing: "0.1em", textAlign: "center" }}>
        ${escapeJsString(config.titleCard.subtitle)}
      </p>
    </AbsoluteFill>
  );
};

// ─── End Card (adapted from end-card template) ──────────────────────────────

const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const scale = spring({ frame, fps, from: 0.8, to: 1, durationInFrames: 35, config: { damping: 12, mass: 0.6 } });
  const contentOpacity = spring({ frame, fps, from: 0, to: 1, durationInFrames: 30 });
  const glowOpacity = interpolate(Math.sin(frame * 0.08), [-1, 1], [0.3, 0.7]);
  const buttonOpacity = spring({ frame: Math.max(0, frame - 20), fps, from: 0, to: 1, durationInFrames: 25 });
  const exitOpacity = interpolate(frame, [durationInFrames - 15, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: COLORS.bgGradient, display: "flex", alignItems: "center", justifyContent: "center", opacity: exitOpacity }}>
      <div style={{ transform: "scale(" + scale + ")", opacity: contentOpacity, display: "flex", flexDirection: "column", alignItems: "center", padding: 48, borderRadius: 16, border: "2px solid rgba(67, 97, 238, " + glowOpacity + ")", boxShadow: "0 0 40px rgba(67, 97, 238, " + (glowOpacity * 0.3) + ")", background: "rgba(17, 24, 39, 0.8)" }}>
        <h1 style={{ color: COLORS.textPrimary, fontSize: "2.8rem", fontWeight: 600, margin: 0, letterSpacing: "0.03em", textAlign: "center" }}>
          Thanks for Watching
        </h1>
        <div style={{ opacity: buttonOpacity, marginTop: 32, padding: "14px 40px", background: "linear-gradient(90deg, " + COLORS.accent + ", " + COLORS.accent2 + ")", borderRadius: 8 }}>
          <span style={{ color: "white", fontSize: "1.1rem", fontWeight: 500, letterSpacing: "0.05em" }}>
            Learn More About Economics
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Main composition ───────────────────────────────────────────────────────

export const EconomyDocumentary: React.FC = () => {
  const cfg = config as any;

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bgDark, fontFamily: FONT }}>
      {/* Voiceover audio — starts at title card */}
      <Audio src={staticFile("narration.wav")} />

      {/* Title card */}
      <Sequence from={cfg.titleCard.startFrame} durationInFrames={cfg.titleCard.endFrame - cfg.titleCard.startFrame}>
        <TitleCard title={cfg.titleCard.title} subtitle={cfg.titleCard.subtitle} />
      </Sequence>

      {/* Data visualization scenes */}
${sceneSequences}

      {/* End card */}
      <Sequence from={cfg.endCard.startFrame} durationInFrames={cfg.endCard.endFrame - cfg.endCard.startFrame}>
        <EndCard />
      </Sequence>
    </AbsoluteFill>
  );
};
`;
}

function escapeJsString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\$/g, "\\$");
}

// ─── Step 5: Deploy + render via Remotion Lambda ────────────────────────────

async function deployAndRender(
  outDir: string,
): Promise<{ outputPath: string; renderTimeSec: number; cost: number }> {
  console.log("▸ Step 5: Deploying site to S3 + rendering via Lambda...\n");

  // Deploy site
  console.log("  Deploying site...");
  const { stdout: deployOut } = await execAsync(
    `cd "${REMOTION_PROJECT}" && bunx remotion lambda sites create src/index.ts --site-name=s20-economy --region=${REGION} 2>&1 | grep "Serve URL"`,
    { maxBuffer: 10 * 1024 * 1024, timeout: 120000 },
  );
  const serveUrlMatch = deployOut.match(/(https:\/\/\S+)/);
  if (!serveUrlMatch) throw new Error("Failed to get serve URL from deploy output");
  const serveUrl = serveUrlMatch[1];
  console.log(`  Serve URL: ${serveUrl}`);

  // Render via Lambda — use frames-per-lambda=500 to stay under concurrency limit
  console.log("  Rendering via Lambda...");
  const renderStart = Date.now();
  const outputPath = join(outDir, "output-economy-documentary.mp4");

  const { stdout: renderOut } = await execAsync(
    `cd "${REMOTION_PROJECT}" && bunx remotion lambda render s20-economy EconomyDocumentary "${outputPath}" --region=${REGION} --frames-per-lambda=500 --function-name=remotion-render-4-0-411-mem2048mb-disk2048mb-300sec 2>&1 | tail -5`,
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

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  S20 — Informational Economy Documentary Video");
  console.log("  DeepSeek Script → Gemini TTS → Remotion Lambda");
  console.log("  Templates: reactvideoeditor.com MCP (free tier)");
  console.log("═══════════════════════════════════════════════════════════\n");

  if (!DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY not set");
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");

  const outDir = join(SPIKES_DIR, "output", "s20");
  await mkdir(outDir, { recursive: true });
  const t0 = Date.now();

  // Step 1: Generate script
  const script = await generateScript();
  await writeFile(join(outDir, "script.json"), JSON.stringify(script, null, 2));

  // Step 2: Generate TTS
  const { wavPath, durationSec } = await generateTTS(script.narration, outDir);

  // Step 3: Compute scene timings
  const config = computeTimings(script, durationSec);
  await writeFile(join(outDir, "composition-config.json"), JSON.stringify(config, null, 2));

  // Step 4: Write Remotion project
  await writeRemotionProject(script, config, wavPath, outDir);

  // Step 5: Deploy + render
  const { outputPath, renderTimeSec, cost } = await deployAndRender(outDir);

  // Verify output
  const { stdout: ffprobeOut } = await execAsync(
    `ffprobe -v quiet -print_format json -show_streams -show_format "${outputPath}"`,
  );
  const probe = JSON.parse(ffprobeOut);
  const vStream = probe.streams.find((s: any) => s.codec_type === "video");
  const aStream = probe.streams.find((s: any) => s.codec_type === "audio");

  const measurements: Record<string, any> = {
    videoResolution: `${vStream?.width}x${vStream?.height}`,
    videoDurationSec: parseFloat(parseFloat(probe.format.duration).toFixed(1)),
    videoFps: vStream?.r_frame_rate,
    videoCodec: vStream?.codec_name,
    videoSizeMB: parseFloat((parseInt(probe.format.size) / 1024 / 1024).toFixed(2)),
    hasAudio: !!aStream,
    audioCodec: aStream?.codec_name,
    audioDurationSec: durationSec.toFixed(1),
    sceneCount: config.scenes.length,
    renderTimeSec: renderTimeSec.toFixed(1),
    estimatedCost: cost,
    totalWallClockSec: ((Date.now() - t0) / 1000).toFixed(1),
  };

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  SPIKE COMPLETE");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Topic:          ${script.topic}`);
  console.log(`  Title:          ${script.title}`);
  console.log(`  Video:          ${measurements.videoResolution}, ${measurements.videoDurationSec}s`);
  console.log(`  Audio:          ${measurements.hasAudio ? "yes" : "no"} (${measurements.audioCodec}, ${measurements.audioDurationSec}s)`);
  console.log(`  Scenes:         ${measurements.sceneCount} data visualizations`);
  console.log(`  File size:      ${measurements.videoSizeMB} MB`);
  console.log(`  Render time:    ${measurements.renderTimeSec}s`);
  console.log(`  AWS cost:       $${cost.toFixed(4)}`);
  console.log(`  Total wall:     ${measurements.totalWallClockSec}s`);
  console.log(`  Output:         ${outputPath}`);
  console.log("");

  // Cost breakdown
  const dsInputTokens = 1500;
  const dsOutputTokens = 2500;
  const dsCost = (dsInputTokens / 1e6) * 0.22 + (dsOutputTokens / 1e6) * 0.66;
  const ttsOutputTokens = durationSec * 25;
  const ttsCost = (140 / 1e6) * 1.0 + (ttsOutputTokens / 1e6) * 20.0;
  const totalCost = dsCost + ttsCost + cost;

  console.log("  Cost breakdown:");
  console.log(`    DeepSeek:     $${dsCost.toFixed(4)}`);
  console.log(`    Gemini TTS:   $${ttsCost.toFixed(4)} (${durationSec.toFixed(1)}s @ 25 tok/s)`);
  console.log(`    AWS Lambda:   $${cost.toFixed(4)}`);
  console.log(`    TOTAL:        $${totalCost.toFixed(4)}`);
  console.log("");
}

main().catch((err) => {
  console.error("\n❌ Spike S20 failed:\n");
  console.error(err);
  process.exit(1);
});
