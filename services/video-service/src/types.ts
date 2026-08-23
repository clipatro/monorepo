/**
 * Manifest type — matches the manifest.json produced by voice-service /package.
 */

export interface Manifest {
  version: string;
  runId: string;
  storyTitle: string;
  audio: {
    durationSec: string;
    provider: string;
    model: string;
    voiceId: string;
  };
  scenes: {
    count: number;
    images: { order: number; file: string }[];
    imageTimeline: {
      scene: number;
      imageStartSec: string;
      imageEndSec: string;
      imageDurationSec: string;
    }[];
  };
  gameplay: {
    file: string;
    durationSec: string;
    muted: boolean;
  };
}

export interface SceneEntry {
  index: number;
  imageFile: string;
  startSec: number;
  endSec: number;
  durationSec: number;
}
