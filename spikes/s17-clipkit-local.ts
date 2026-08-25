#!/usr/bin/env bun
/**
 * S17 — ClipKit LOCAL-rendered video spike.
 *
 * Companion to S16 (cloud render). Renders a beautiful cinematic composition
 * on this machine via `@clipkit/renderer` — headless Google Chrome + WebCodecs.
 * No API key, no credits, no network egress for the render itself.
 *
 * The local composition is a leaner variant of S16's cloud piece: same palette
 * and beats, but without the expensive GPU effects (motion blur, bloom, glass,
 * 3D camera, particles) that make software WebGL2 (SwiftShader) time out.
 * Local rendering is the dev/CI inner loop; the cloud path is for the
 * full-fidelity render.
 *
 * Prerequisites:
 *   - Google Chrome / Chromium installed (we have google-chrome-stable 150)
 *   - `@clipkit/renderer` installed (installed on first run if missing)
 *
 * Usage:
 *   bun run spikes/s17-clipkit-local.ts [output.mp4]
 *
 * Env:
 *   CLIPKIT_BACKEND  — auto | webgpu | webgl2  (default: webgl2)
 *   CHROME_PATH      — override Chrome binary path (default: auto-detect)
 */

import { join, dirname } from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import type { Source } from "@clipkit/protocol";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPIKE_OUTPUT = join(__dirname, "output", "s17");

const execAsync = promisify(exec);

// ─── Config ────────────────────────────────────────────────────────────────

type Backend = "auto" | "webgpu" | "webgl2";
const BACKEND: Backend = (process.env.CLIPKIT_BACKEND as Backend) ?? "webgl2";

// ─── Lean local composition ────────────────────────────────────────────────
// Same 4-beat cinematic structure as S16, stripped of GPU-heavy effects so
// it renders in seconds on software WebGL2. Still beautiful — gradients,
// Ken Burns, text reveals, accent bars, vignette.

const W = 540;
const H = 960;
const DURATION = 10;
const FPS = 24;

const C = {
  bg0: "#070710",
  bg1: "#0e0e1c",
  bg2: "#141428",
  gold: "#ffd60a",
  goldDim: "#c9a900",
  cream: "#f3ead7",
  steel: "#a8b2c8",
};

const localSource: Source = {
  clipkit_version: "1.0",
  output_format: "mp4",
  width: W,
  height: H,
  duration: DURATION,
  frame_rate: FPS,
  background_color: C.bg0,
  styles: {
    wordmark: {
      font_family: "Georgia, serif",
      font_weight: 800,
      fill_color: C.cream,
      letter_spacing: 8,
    },
    tagline: {
      font_family: "Inter, sans-serif",
      font_weight: 400,
      fill_color: C.steel,
      letter_spacing: 4,
    },
    micro: {
      font_family: "Inter, sans-serif",
      font_weight: 600,
      fill_color: C.gold,
      letter_spacing: 6,
    },
  },
  elements: [
    // Background gradient
    {
      type: "shape",
      id: "bg-gradient",
      layer: 1,
      time: 0,
      duration: "end",
      x: 0,
      y: 0,
      width: "100%",
      height: "100%",
      gradient: {
        type: "linear",
        angle: 180,
        stops: [
          { offset: 0, color: C.bg0 },
          { offset: 0.45, color: C.bg1 },
          { offset: 0.75, color: C.bg2 },
          { offset: 1, color: C.bg0 },
        ],
      },
    },
    // Warm radial glow that rises during the cold open
    {
      type: "shape",
      id: "rise-glow",
      layer: 2,
      time: 0,
      duration: 4,
      x: "50%",
      y: { expr: "ease(t, 0, 3.5, 83%, 57%)" },
      x_anchor: 0.5,
      y_anchor: 0.5,
      width: "83%",
      height: "47%",
      shape: "ellipse",
      gradient: {
        type: "radial",
        angle: 0,
        stops: [
          { offset: 0, color: "rgba(255,214,10,0.18)" },
          { offset: 0.5, color: "rgba(255,214,10,0.04)" },
          { offset: 1, color: "rgba(255,214,10,0)" },
        ],
      },
      blend_mode: "add",
      opacity: { expr: "ease(t, 0, 2.5, 0, 1) * (0.85 + 0.15 * sin(t * 1.5))" },
      scale: { expr: "0.6 + ease(t, 0, 3.5, 0, 0.5)" },
    },

    // Beat 2: wordmark reveal (3–7s)
    {
      type: "text",
      id: "wordmark",
      style: "wordmark",
      layer: 5,
      time: 3,
      duration: 4.5,
      x: "50%",
      y: "43%",
      x_anchor: 0.5,
      y_anchor: 0.5,
      font_size: 64,
      text: "CLIPATRO",
      text_align: "center",
      text_shadow: [
        { color: C.gold, offset_x: 0, offset_y: 0, blur: 16, opacity: 0.5 },
        { color: "#000000", offset_x: 0, offset_y: 3, blur: 12, opacity: 0.6 },
      ],
      opacity: { expr: "ease(t, 0, 0.5, 0, 1) * (1 - ease(t, 3.8, 4.4, 0, 1))" },
      animations: [
        {
          type: "text-slide",
          direction: "up",
          time: "start",
          duration: 1.0,
          split: "letter",
          stagger: 0.07,
          easing: "ease-out-back",
        },
        { type: "fade-out", time: "end", duration: 0.5 },
      ],
    },
    // Gold rule under the wordmark
    {
      type: "shape",
      id: "wordmark-rule",
      layer: 6,
      time: 3.7,
      duration: 3.8,
      x: "50%",
      y: "51%",
      x_anchor: 0.5,
      height: 2,
      fill_color: C.gold,
      width: { expr: "ease(t, 0, 0.9, 0, 260) * (1 - ease(t, 3.2, 3.7, 0, 1))" },
      opacity: { expr: "ease(t, 0, 0.3, 0, 1) * (1 - ease(t, 3.2, 3.7, 0, 1))" },
      shadow: { color: C.gold, offset_x: 0, offset_y: 0, blur: 8 },
    },

    // Beat 3: tagline (7–10.5s)
    {
      type: "text",
      id: "micro-caption",
      style: "micro",
      layer: 7,
      time: 7.2,
      duration: 3.3,
      x: "50%",
      y: "41%",
      x_anchor: 0.5,
      y_anchor: 0.5,
      font_size: 14,
      text: "FROM IDEA TO VIDEO",
      text_transform: "uppercase",
      opacity: { expr: "ease(t, 0, 0.5, 0, 1) * (1 - ease(t, 2.7, 3.2, 0, 1))" },
      animations: [
        { type: "text-typewriter", time: "start", duration: 0.8, split: "letter", stagger: 0.05 },
      ],
    },
    {
      type: "text",
      id: "tagline",
      style: "tagline",
      layer: 8,
      time: 7.5,
      duration: 3.0,
      x: "50%",
      y: "46%",
      x_anchor: 0.5,
      y_anchor: 0.5,
      font_size: 22,
      text: "Stories that render themselves.",
      text_align: "center",
      text_wrap: true,
      width: 410,
      text_shadow: { color: "#000000", offset_x: 0, offset_y: 2, blur: 8, opacity: 0.7 },
      opacity: { expr: "ease(t, 0, 0.6, 0, 1) * (1 - ease(t, 2.4, 2.9, 0, 1))" },
      animations: [
        {
          type: "text-slide",
          direction: "up",
          time: "start",
          duration: 0.9,
          split: "word",
          stagger: 0.09,
          easing: "ease-out-quart",
        },
        { type: "fade-out", time: "end", duration: 0.5 },
      ],
    },
    {
      type: "shape",
      id: "tagline-bar",
      layer: 9,
      time: 8.0,
      duration: 2.5,
      x: "50%",
      y: "52%",
      x_anchor: 0.5,
      height: 2,
      fill_color: C.goldDim,
      width: { expr: "ease(t, 0, 1.0, 0, 320) * (1 - ease(t, 1.9, 2.4, 0, 1))" },
      opacity: { expr: "ease(t, 0, 0.3, 0, 0.8) * (1 - ease(t, 1.9, 2.4, 0, 1))" },
    },

    // Beat 4: closing (10.5–12s)
    {
      type: "shape",
      id: "closing-glow",
      layer: 10,
      time: 10.3,
      duration: 1.7,
      x: "50%",
      y: "50%",
      x_anchor: 0.5,
      y_anchor: 0.5,
      width: "111%",
      height: "63%",
      shape: "ellipse",
      gradient: {
        type: "radial",
        angle: 0,
        stops: [
          { offset: 0, color: "rgba(255,214,10,0.15)" },
          { offset: 0.4, color: "rgba(255,214,10,0.04)" },
          { offset: 1, color: "rgba(255,214,10,0)" },
        ],
      },
      blend_mode: "add",
      scale: { expr: "0.4 + ease(t, 0, 1.2, 0, 1.1)" },
      opacity: { expr: "ease(t, 0, 0.8, 0, 1) * (0.8 + 0.2 * sin(t * 2.5))" },
    },
    {
      type: "text",
      id: "closing-text",
      style: "wordmark",
      layer: 11,
      time: 10.7,
      duration: 1.3,
      x: "50%",
      y: "47%",
      x_anchor: 0.5,
      y_anchor: 0.5,
      font_size: 32,
      text: "clipatro",
      text_align: "center",
      fill_color: C.gold,
      text_shadow: { color: C.gold, offset_x: 0, offset_y: 0, blur: 20, opacity: 0.6 },
      opacity: { expr: "ease(t, 0, 0.6, 0, 1)" },
      animations: [
        {
          type: "text-slide",
          direction: "up",
          time: "start",
          duration: 0.8,
          split: "word",
          stagger: 0.12,
          easing: "ease-out-quart",
        },
      ],
    },

    // Persistent: progress bar + watermark
    {
      type: "shape",
      id: "progress-bg",
      layer: 20,
      time: 0,
      duration: "end",
      x: 0,
      y: "99%",
      width: "100%",
      height: 2,
      fill_color: "#1a1a2e",
    },
    {
      type: "shape",
      id: "progress-fill",
      layer: 21,
      time: 0,
      duration: "end",
      x: 0,
      y: "99%",
      height: 2,
      fill_color: C.gold,
      width: { expr: `ease(t, 0, ${DURATION}, 0, ${W})` },
      shadow: { color: C.gold, offset_x: 0, offset_y: 0, blur: 6 },
    },
    {
      type: "text",
      id: "watermark",
      layer: 22,
      time: 0,
      duration: "end",
      x: "50%",
      y: "95%",
      x_anchor: 0.5,
      font_size: 10,
      font_family: "Inter, sans-serif",
      font_weight: 500,
      fill_color: "#3a3a4e",
      text: "CLIPATRO",
      letter_spacing: 4,
      opacity: 0.55,
    },

    // Vignette
    {
      type: "shape",
      id: "vignette",
      layer: 30,
      time: 0,
      duration: "end",
      x: 0,
      y: 0,
      width: "100%",
      height: "100%",
      gradient: {
        type: "radial",
        angle: 0,
        stops: [
          { offset: 0, color: "rgba(0,0,0,0)" },
          { offset: 0.6, color: "rgba(0,0,0,0)" },
          { offset: 1, color: "rgba(0,0,0,0.55)" },
        ],
      },
      blend_mode: "multiply",
    },
  ],
};

// ─── Chrome discovery ──────────────────────────────────────────────────────

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "google-chrome-stable",
  "google-chrome",
  "chromium",
  "chromium-browser",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe",
];

async function findChrome(): Promise<string | null> {
  for (const c of CHROME_CANDIDATES) {
    if (!c) continue;
    try {
      await execAsync(`"${c}" --version`);
      return c;
    } catch {
      /* try next */
    }
  }
  return null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function drawProgress(frame: number, total: number): void {
  if (!process.stderr.isTTY) {
    if (frame % 50 === 0 || frame === total) {
      process.stdout.write(`  frame ${frame}/${total}\n`);
    }
    return;
  }
  const pct = total > 0 ? Math.min(100, Math.round((frame / total) * 100)) : 0;
  const width = 26;
  const filled = Math.round((pct / 100) * width);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);
  process.stderr.write(`\r  [${bar}] ${pct}%  (${frame}/${total})`);
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  await mkdir(SPIKE_OUTPUT, { recursive: true });
  const outputPath = process.argv[2] ?? join(SPIKE_OUTPUT, "output-clipkit-local.mp4");

  console.log("S17 — ClipKit LOCAL Render Spike");
  console.log(`  Backend:   ${BACKEND}`);
  console.log(`  Source:    ${localSource.width}x${localSource.height}, ${localSource.duration}s @ ${localSource.frame_rate}fps`);

  // 1. Locate Chrome.
  console.log("\nLocating Google Chrome...");
  const chrome = await findChrome();
  if (!chrome) {
    console.error("  ✗ Google Chrome / Chromium not found.");
    console.error("    Install it, or set CHROME_PATH to the binary.");
    process.exit(1);
  }
  const { stdout: ver } = await execAsync(`"${chrome}" --version`);
  console.log(`  ✓ ${chrome} — ${ver.trim()}`);
  if (process.env.CHROME_PATH !== chrome) {
    process.env.CHROME_PATH = chrome;
  }

  // 2. Validate locally.
  console.log("\nValidating Source against CKP/1.0...");
  const { validate } = await import("@clipkit/protocol");
  const result = validate(localSource as Source);
  if (!result.valid) {
    console.error("Validation failed:");
    for (const err of result.errors) {
      console.error(`  - ${err.path}: ${err.message}`);
    }
    process.exit(1);
  }
  console.log("  ✓ Valid.");

  // 3. Load @clipkit/renderer.
  console.log("\nLoading @clipkit/renderer...");
  let renderer: typeof import("@clipkit/renderer");
  try {
    renderer = await import("@clipkit/renderer");
  } catch {
    console.log("  @clipkit/renderer not found — installing...");
    await execAsync("bun add -g @clipkit/renderer", { timeout: 120000 });
    renderer = await import("@clipkit/renderer");
  }
  console.log("  ✓ Loaded.");

  // 4. Render (10-min timeout for software WebGL2).
  console.log(`\nRendering locally (headless Chrome, backend=${BACKEND})...`);
  const t0 = Date.now();
  let res: {
    buffer: Buffer;
    width: number;
    height: number;
    durationSec: number;
    frameRate: number;
  };

  try {
    res = await renderer.render({
      source: localSource as Source,
      backend: BACKEND,
      resolution: "source",
      timeoutMs: 600_000,
      onProgress: (frame: number, total: number) => drawProgress(frame, total),
    });
  } catch (e) {
    process.stderr.write(`\n✗ Local render failed: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  }
  if (process.stderr.isTTY) process.stderr.write("\n");
  const renderTime = ((Date.now() - t0) / 1000).toFixed(1);

  // 5. Write the MP4.
  await writeFile(outputPath, res.buffer);
  console.log(`  ✓ Rendered ${res.width}×${res.height}, ${res.durationSec.toFixed(1)}s → ${outputPath} (${fmtBytes(res.buffer.length)})`);
  console.log(`  Render time: ${renderTime}s`);

  // 6. Probe with ffprobe.
  console.log("\nOutput probe:");
  try {
    const probe = async (args: string) =>
      (await execAsync(`ffprobe -v error ${args} "${outputPath}"`)).stdout.trim();
    const dur = await probe("-show_entries format=duration -of csv=p=0");
    const size = await probe("-show_entries format=size -of csv=p=0");
    const wh = await probe("-select_streams v:0 -show_entries stream=width,height -of csv=p=0");
    const fps = await probe("-select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0");
    const codec = await probe("-select_streams v:0 -show_entries stream=codec_name -of csv=p=0");
    console.log(`  Duration:   ${parseFloat(dur).toFixed(2)}s`);
    console.log(`  Resolution: ${wh}`);
    console.log(`  FPS:        ${fps}`);
    console.log(`  Codec:      ${codec}`);
    console.log(`  Size:       ${fmtBytes(parseInt(size, 10))}`);
  } catch {
    console.log("  (ffprobe not available — skipping probe)");
  }

  console.log(`\n=== SPIKE COMPLETE ===`);
  console.log(`  Backend:    ${BACKEND}`);
  console.log(`  Total time: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`  Output:     ${outputPath}`);
}

// Export for validation / inspection without triggering a render.
export { localSource as clipatroLocalSource };

if (import.meta.main) {
  main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
}
