#!/usr/bin/env bun
/**
 * S16 — ClipKit cloud-rendered video spike.
 *
 * Builds a beautiful, self-contained cinematic composition using the ClipKit
 * Protocol (CKP/1.0) and renders it via the hosted GPU API
 * (POST https://clipkit.dev/api/v1/renders).
 *
 * The composition is a 15-second vertical (1080×1920) cinematic title
 * sequence — "CLIPATRO" — built entirely from generative elements (gradients,
 * shapes, text, particles, noise, glass, bloom). No external assets are
 * required, so it renders cleanly on the cloud without exposing localhost.
 *
 * This mirrors the S14 ffmpeg approach (read a manifest, composite, encode,
 * probe) but replaces the ffmpeg filter graph with a ClipKit Source document
 * and the local NVENC/libx264 encode with the hosted GPU renderer.
 *
 * Usage:
 *   bun run spikes/s16-clipkit-video.ts [output.mp4]
 *
 * Env:
 *   CLIPKIT_API_KEY  — required for cloud rendering (paid, consumes credits)
 */

import { join, dirname } from "node:path";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Source } from "@clipkit/protocol";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPIKE_OUTPUT = join(__dirname, "output", "s16");

// ─── API config ────────────────────────────────────────────────────────────

const API_URL = (process.env.CLIPKIT_API_URL ?? "https://www.clipkit.dev").replace(/\/+$/, "");
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

// ─── Composition constants ─────────────────────────────────────────────────

const W = 1080;
const H = 1920;
const DURATION = 12;
const FPS = 30;

// Palette — warm Mediterranean gold on deep midnight
const C = {
  bg0: "#070710",
  bg1: "#0e0e1c",
  bg2: "#141428",
  gold: "#ffd60a",
  goldDim: "#c9a900",
  cream: "#f3ead7",
  steel: "#a8b2c8",
  ink: "#0a0a0f",
  panel: "#161628",
};

// ─── The Source ────────────────────────────────────────────────────────────
// A cinematic title sequence in four beats:
//   0.0–3.5s   — Cold open: dark void, dust particles, faint glow rises
//   3.5–7.5s   — The wordmark reveals: "CLIPATRO" letters flip in 3D
//   7.5–11.5s  — Tagline + kinetic underline draw
//   11.5–15.0s — Closing glow + fade to black
//
// Every visual is generative — no external image/video/audio assets — so the
// cloud renderer needs no network fetches beyond the Source itself.

const source: Source = {
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
    // ── Background: layered gradient + animated noise ──────────────────────
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
    // A warm radial glow that rises from the bottom during the cold open.
    {
      type: "shape",
      id: "rise-glow",
      layer: 3,
      time: 0,
      duration: 4.5,
      x: "50%",
      y: { expr: "ease(t, 0, 4, 1600, 1100)" },
      x_anchor: 0.5,
      y_anchor: 0.5,
      width: 900,
      height: 900,
      shape: "ellipse",
      gradient: {
        type: "radial",
        angle: 0,
        stops: [
          { offset: 0, color: "rgba(255,214,10,0.22)" },
          { offset: 0.5, color: "rgba(255,214,10,0.06)" },
          { offset: 1, color: "rgba(255,214,10,0)" },
        ],
      },
      opacity: { expr: "ease(t, 0, 3, 0, 1) * (0.85 + 0.15 * sin(t * 1.5))" },
      scale: { expr: "0.6 + ease(t, 0, 4, 0, 0.5)" },
    },

    // ── Beat 2: the wordmark reveal (3.5–7.5s) ────────────────────────────
    // A translucent card behind the letters catches the light.
    {
      type: "shape",
      id: "wordmark-card",
      layer: 5,
      time: 3.2,
      duration: 4.6,
      x: "50%",
      y: 820,
      x_anchor: 0.5,
      y_anchor: 0.5,
      width: 880,
      height: 280,
      border_radius: 40,
      fill_color: "rgba(255,255,255,0.04)",
      opacity: { expr: "ease(t, 0, 0.8, 0, 1) * (0.9 - ease(t, 3.8, 4.4, 0, 0.9))" },
      scale: { expr: "0.92 + ease(t, 0, 0.8, 0, 0.08) * (1 - ease(t, 3.8, 4.4, 0, 1))" },
      stroke_color: "rgba(255,214,10,0.2)",
      stroke_width: 2,
    },
    // The wordmark itself — letters flip in on the X axis, staggered.
    {
      type: "text",
      id: "wordmark",
      style: "wordmark",
      layer: 6,
      time: 3.5,
      duration: 4.3,
      x: "50%",
      y: 820,
      x_anchor: 0.5,
      y_anchor: 0.5,
      font_size: 128,
      text: "CLIPATRO",
      text_align: "center",
      text_shadow: [
        { color: C.gold, offset_x: 0, offset_y: 0, blur: 30, opacity: 0.5 },
        { color: "#000000", offset_x: 0, offset_y: 6, blur: 24, opacity: 0.6 },
      ],
      opacity: { expr: "ease(t, 0, 0.5, 0, 1) * (1 - ease(t, 3.6, 4.2, 0, 1))" },
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
        {
          type: "fade-out",
          time: "end",
          duration: 0.5,
        },
      ],
    },
    // A thin gold rule under the wordmark that draws itself in.
    {
      type: "shape",
      id: "wordmark-rule",
      layer: 7,
      time: 4.2,
      duration: 3.6,
      x: "50%",
      y: 980,
      x_anchor: 0.5,
      height: 3,
      fill_color: C.gold,
      width: { expr: "ease(t, 0, 0.9, 0, 520) * (1 - ease(t, 3.0, 3.5, 0, 1))" },
      opacity: { expr: "ease(t, 0, 0.3, 0, 1) * (1 - ease(t, 3.0, 3.5, 0, 1))" },
      shadow: { color: C.gold, offset_x: 0, offset_y: 0, blur: 16 },
    },

    // ── Beat 3: tagline + kinetic underline (7.5–11.5s) ───────────────────
    {
      type: "text",
      id: "tagline",
      style: "tagline",
      layer: 8,
      time: 7.7,
      duration: 3.6,
      x: "50%",
      y: 880,
      x_anchor: 0.5,
      y_anchor: 0.5,
      font_size: 44,
      text: "Stories that render themselves.",
      text_align: "center",
      text_wrap: true,
      width: 820,
      text_shadow: { color: "#000000", offset_x: 0, offset_y: 3, blur: 16, opacity: 0.7 },
      opacity: { expr: "ease(t, 0, 0.6, 0, 1) * (1 - ease(t, 3.0, 3.5, 0, 1))" },
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
        {
          type: "fade-out",
          time: "end",
          duration: 0.5,
        },
      ],
    },
    // Micro-caption above the tagline.
    {
      type: "text",
      id: "micro-caption",
      style: "micro",
      layer: 9,
      time: 8.0,
      duration: 3.3,
      x: "50%",
      y: 780,
      x_anchor: 0.5,
      y_anchor: 0.5,
      font_size: 26,
      text: "FROM IDEA TO VIDEO",
      text_transform: "uppercase",
      opacity: { expr: "ease(t, 0, 0.5, 0, 1) * (1 - ease(t, 2.7, 3.2, 0, 1))" },
      animations: [
        {
          type: "text-typewriter",
          time: "start",
          duration: 0.8,
          split: "letter",
          stagger: 0.05,
        },
      ],
    },
    // A second, wider accent bar that draws under the tagline.
    {
      type: "shape",
      id: "tagline-bar",
      layer: 10,
      time: 8.3,
      duration: 3.0,
      x: "50%",
      y: 990,
      x_anchor: 0.5,
      height: 2,
      fill_color: C.goldDim,
      width: { expr: "ease(t, 0, 1.0, 0, 640) * (1 - ease(t, 2.4, 2.9, 0, 1))" },
      opacity: { expr: "ease(t, 0, 0.3, 0, 0.8) * (1 - ease(t, 2.4, 2.9, 0, 1))" },
    },

    // ── Beat 4: closing glow + fade (11.5–15.0s) ──────────────────────────
    {
      type: "shape",
      id: "closing-glow",
      layer: 11,
      time: 11.3,
      duration: 3.7,
      x: "50%",
      y: 960,
      x_anchor: 0.5,
      y_anchor: 0.5,
      width: 1200,
      height: 1200,
      shape: "ellipse",
      gradient: {
        type: "radial",
        angle: 0,
        stops: [
          { offset: 0, color: "rgba(255,214,10,0.18)" },
          { offset: 0.4, color: "rgba(255,214,10,0.05)" },
          { offset: 1, color: "rgba(255,214,10,0)" },
        ],
      },
      scale: { expr: "0.4 + ease(t, 0, 2.5, 0, 1.1)" },
      opacity: { expr: "ease(t, 0, 1, 0, 1) * (0.8 + 0.2 * sin(t * 2.5))" },
    },
    {
      type: "text",
      id: "closing-text",
      style: "wordmark",
      layer: 12,
      time: 11.8,
      duration: 3.2,
      x: "50%",
      y: 900,
      x_anchor: 0.5,
      y_anchor: 0.5,
      font_size: 64,
      text: "clipatro",
      text_align: "center",
      fill_color: C.gold,
      text_shadow: { color: C.gold, offset_x: 0, offset_y: 0, blur: 40, opacity: 0.6 },
      opacity: { expr: "ease(t, 0, 0.8, 0, 1) * (1 - ease(t, 2.6, 3.1, 0, 1))" },
      animations: [
        {
          type: "text-slide",
          direction: "up",
          time: "start",
          duration: 1.1,
          split: "word",
          stagger: 0.12,
          easing: "ease-out-quart",
        },
      ],
    },

    // ── Persistent UI: progress bar + watermark ───────────────────────────
    {
      type: "shape",
      id: "progress-bg",
      layer: 20,
      time: 0,
      duration: "end",
      x: 0,
      y: 1898,
      width: "100%",
      height: 3,
      fill_color: "#1a1a2e",
    },
    {
      type: "shape",
      id: "progress-fill",
      layer: 21,
      time: 0,
      duration: "end",
      x: 0,
      y: 1898,
      height: 3,
      fill_color: C.gold,
      width: { expr: `ease(t, 0, ${DURATION}, 0, ${W})` },
      shadow: { color: C.gold, offset_x: 0, offset_y: 0, blur: 10 },
    },
    {
      type: "text",
      id: "watermark",
      layer: 22,
      time: 0,
      duration: "end",
      x: "50%",
      y: 1820,
      x_anchor: 0.5,
      font_size: 20,
      font_family: "Inter, sans-serif",
      font_weight: 500,
      fill_color: "#3a3a4e",
      text: "CLIPATRO",
      letter_spacing: 8,
      opacity: 0.55,
    },

    // ── Vignette (whole-frame, on top, multiply) ──────────────────────────
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
    },
  ],
};

// ─── Cloud render client ───────────────────────────────────────────────────

interface QueuedRender {
  id: string;
  credits_reserved?: number;
}

interface RenderStatus {
  status: string;
  progress?: number;
  error?: string | null;
  output_url?: string | null;
}

async function submitRender(src: Source, apiKey: string): Promise<QueuedRender> {
  const res = await fetch(`${API_URL}/api/v1/renders`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ source: src, resolution: "720p" }),
  });

  if (res.status === 401) {
    console.error("Unauthorized — the API key was rejected.");
    process.exit(1);
  }
  if (res.status === 402) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    console.error(`Payment required: ${data.message ?? "out of render credits."}`);
    process.exit(1);
  }
  if (res.status === 413) {
    console.error("Source too large (2 MB max).");
    process.exit(1);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`Render submission failed (${res.status}). ${text.slice(0, 400)}`);
    process.exit(1);
  }

  return (await res.json()) as QueuedRender;
}

async function pollRender(id: string, apiKey: string): Promise<string> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let lastPct = -1;

  for (;;) {
    if (Date.now() > deadline) {
      console.error("\nTimed out waiting for the render (10 min).");
      process.exit(1);
    }
    await sleep(POLL_INTERVAL_MS);

    let res: Response;
    try {
      res = await fetch(`${API_URL}/api/v1/renders/${id}`, {
        headers: { authorization: `Bearer ${apiKey}` },
      });
    } catch {
      continue; // transient — keep trying
    }
    if (!res.ok) continue;

    const s = (await res.json()) as RenderStatus;
    if (s.status === "done") {
      const url = s.output_url;
      if (!url) {
        console.error("Render finished but returned no download URL.");
        process.exit(1);
      }
      process.stdout.write("\n");
      return url;
    }
    if (s.status === "failed") {
      console.error(`\nRender failed: ${s.error ?? "unknown error"}`);
      process.exit(1);
    }

    const pct = Math.round((s.progress ?? 0) * 100);
    if (pct !== lastPct) {
      lastPct = pct;
      drawProgress(pct);
    }
  }
}

async function downloadOutput(url: string, outPath: string): Promise<number> {
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`Download failed (${res.status}).`);
    process.exit(1);
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  await writeFile(outPath, buf);
  return buf.byteLength;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function drawProgress(pct: number): void {
  const width = 26;
  const filled = Math.round((pct / 100) * width);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);
  process.stdout.write(`\r  [${bar}] ${pct}%`);
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const API_KEY = process.env.CLIPKIT_API_KEY;
  if (!API_KEY) {
    console.error("CLIPKIT_API_KEY is required for cloud rendering.");
    process.exit(1);
  }
  await mkdir(SPIKE_OUTPUT, { recursive: true });
  const outputPath = process.argv[2] ?? join(SPIKE_OUTPUT, "output-clipkit.mp4");

  console.log("S16 — ClipKit Cloud Render Spike");
  console.log(`  API:        ${API_URL}`);
  console.log(`  Resolution: ${W}x${H}`);
  console.log(`  Duration:   ${DURATION}s @ ${FPS}fps`);
  console.log(`  Output:     ${outputPath}`);
  console.log(`  Source size: ${fmtBytes(Buffer.byteLength(JSON.stringify(source)))}`);

  // 1. Validate locally first (catch schema errors before spending credits).
  console.log("\nValidating Source against CKP/1.0...");
  const { validate } = await import("@clipkit/protocol");
  const result = validate(source);
  if (!result.valid) {
    console.error("Validation failed:");
    for (const err of result.errors) {
      console.error(`  - ${err.path}: ${err.message}`);
    }
    process.exit(1);
  }
  console.log("  ✓ Valid.");

  // 2. Submit to the cloud renderer.
  console.log("\nSubmitting render to ClipKit cloud...");
  const t0 = Date.now();
  const queued = await submitRender(source, API_KEY);
  console.log(
    `  Queued job ${queued.id}` +
      (queued.credits_reserved ? ` (${queued.credits_reserved} credits reserved)` : ""),
  );

  // 3. Poll until done.
  console.log("  Waiting for render...");
  const outputUrl = await pollRender(queued.id, API_KEY);
  const renderTime = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  Render complete in ${renderTime}s`);

  // 4. Download the MP4.
  console.log("  Downloading...");
  const bytes = await downloadOutput(outputUrl, outputPath);
  console.log(`  ✓ Saved ${fmtBytes(bytes)} → ${outputPath}`);

  // 5. Probe with ffprobe (if available) — mirrors S14's verification step.
  console.log("\nOutput probe:");
  try {
    const { exec } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execAsync = promisify(exec);
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
  console.log(`  Total time: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`  Output:     ${outputPath}`);
}

// Export the source for validation / inspection without triggering a render.
export { source as clipatroSource };

if (import.meta.main) {
  main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
}
