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
    /** Phase 9: Flow hybrid — video clips uploaded via FlowUpload. */
    clips?: { order: number; file: string; type: string }[];
    /** Phase 9: Flow hybrid — ordered clip timeline (user-arranged). */
    clipTimeline?: {
      scene: number;
      clipFile: string;
      durationSec?: string;
    }[];
  };
  gameplay: {
    file: string;
    durationSec: string;
    muted: boolean;
  } | null;
  /** Phase 9: Flow hybrid — whether a voiceover is present. */
  hasVoiceover?: boolean;
}

export interface SceneEntry {
  index: number;
  imageFile: string;
  startSec: number;
  endSec: number;
  durationSec: number;
}
