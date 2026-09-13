/**
 * S23 kids video — scene timing plan.
 *
 * Computes per-scene frame offsets and durations from the actual narration
 * duration, proportional to each scene's narration segment length. This
 * mirrors the S21/S22 scene plan approach but adapted for the kids pipeline.
 *
 * The first scene (title card) gets a fixed 3s intro, and the last scene
 * (end card) gets a fixed 3s outro. Middle scenes share the remaining
 * narration duration proportionally to their narration text length.
 */

import type { MappedKidsScene } from "./mapping.ts";

export interface TimedScene {
  order: number;
  componentSlug: string;
  data: Record<string, unknown>;
  /** Relative image path (e.g. "images/scene-1.png") or undefined. */
  imageUrl?: string;
  imageTreatment?: string;
  narrationSegment: string;
  /** Start frame (absolute, from 0). */
  startFrame: number;
  /** Duration in frames. */
  durationFrames: number;
  /** End frame (startFrame + durationFrames). */
  endFrame: number;
  /** Duration in seconds. */
  durationSeconds: number;
}

export interface SceneTimingPlan {
  scenes: TimedScene[];
  totalFrames: number;
  totalSeconds: number;
  fps: number;
  width: number;
  height: number;
}

const FPS = 30;
const WIDTH = 720;
const HEIGHT = 1280;
const TITLE_CARD_SECONDS = 3;
const END_CARD_SECONDS = 3;
const MIN_SCENE_SECONDS = 2;

/**
 * Compute a scene timing plan from the mapped scenes and the actual narration
 * duration. The narration duration covers the middle scenes; the title and
 * end card get fixed durations added on top.
 */
export function computeSceneTiming(
  mapped: MappedKidsScene[],
  narrationDurationSec: number,
  imageMap: Record<number, string>,
): SceneTimingPlan {
  if (mapped.length === 0) {
    return { scenes: [], totalFrames: 0, totalSeconds: 0, fps: FPS, width: WIDTH, height: HEIGHT };
  }

  const lastIndex = mapped.length - 1;
  // Middle scenes (exclude first and last) share the narration duration
  const middleScenes = mapped.length > 2 ? mapped.slice(1, lastIndex) : [];
  const middleNarration = middleScenes.map((s) => s.narrationSegment).join(" ");
  const middleTotalChars = Math.max(1, middleNarration.length);

  // Distribute narration duration across middle scenes proportional to text length
  const sceneDurations: number[] = [];
  for (let i = 0; i < mapped.length; i++) {
    if (i === 0) {
      sceneDurations.push(TITLE_CARD_SECONDS);
    } else if (i === lastIndex) {
      sceneDurations.push(END_CARD_SECONDS);
    } else {
      const scene = mapped[i]!;
      const proportion = scene.narrationSegment.length / middleTotalChars;
      const dur = Math.max(MIN_SCENE_SECONDS, narrationDurationSec * proportion);
      sceneDurations.push(dur);
    }
  }

  // Build timed scenes
  const scenes: TimedScene[] = [];
  let currentFrame = 0;
  for (let i = 0; i < mapped.length; i++) {
    const scene = mapped[i]!;
    const durationSeconds = sceneDurations[i]!;
    const durationFrames = Math.max(1, Math.round(durationSeconds * FPS));
    const startFrame = currentFrame;
    const endFrame = startFrame + durationFrames;

    scenes.push({
      order: scene.order,
      componentSlug: scene.componentSlug,
      data: scene.data,
      imageUrl: imageMap[scene.order],
      imageTreatment: scene.imageTreatment,
      narrationSegment: scene.narrationSegment,
      startFrame,
      durationFrames,
      endFrame,
      durationSeconds,
    });

    currentFrame = endFrame;
  }

  const totalFrames = currentFrame;
  const totalSeconds = totalFrames / FPS;

  return { scenes, totalFrames, totalSeconds, fps: FPS, width: WIDTH, height: HEIGHT };
}
