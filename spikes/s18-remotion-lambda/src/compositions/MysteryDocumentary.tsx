import React from "react";
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
  staticFile,
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
      transform = `scale(${zoomIn})`;
      break;
    case "kenBurnsZoomOut":
      const zoomOut = interpolate(localFrame, [0, sceneDuration], [1.3, 1.1], {
        extrapolateRight: "clamp",
      });
      transform = `scale(${zoomOut})`;
      break;
    case "panRight":
      const panX = interpolate(localFrame, [0, sceneDuration], [-30, 30], {
        extrapolateRight: "clamp",
      });
      transform = `scale(1.2) translateX(${panX}px)`;
      break;
    case "panLeft":
      const panX2 = interpolate(localFrame, [0, sceneDuration], [30, -30], {
        extrapolateRight: "clamp",
      });
      transform = `scale(1.2) translateX(${panX2}px)`;
      break;
    case "pulse":
    case "pulseZoom":
      const pulse = 1.15 + Math.sin(localFrame / 15) * 0.05;
      transform = `scale(${pulse})`;
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
          background: `linear-gradient(to bottom, ${COLORS.overlay} 0%, transparent 30%, transparent 60%, ${COLORS.overlay} 100%)`,
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
        transform: `translateY(${y}px) scale(${scale})`,
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
          textShadow: `0 2px 20px rgba(0,0,0,0.9), 0 0 40px ${COLORS.accentDim}80`,
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
      <div style={{ opacity: titleOpacity, transform: `scale(${titleScale})`, textAlign: "center" }}>
        <h1
          style={{
            fontFamily: "Georgia, serif",
            fontSize: 52,
            fontWeight: 900,
            color: COLORS.textPrimary,
            margin: 0,
            textShadow: `0 0 30px ${COLORS.accent}80`,
            letterSpacing: "2px",
          }}
        >
          The Vanishing of the Flannan Isles
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
          An Unsolved Mystery
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
      <div style={{ transform: `scale(${scale})`, textAlign: "center" }}>
        <p
          style={{
            fontFamily: "Georgia, serif",
            fontSize: 34,
            fontWeight: 700,
            color: COLORS.textPrimary,
            margin: 0,
            textShadow: `0 0 30px ${COLORS.accent}80`,
            letterSpacing: "1px",
          }}
        >
          What really happened?
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
      <Sequence from={60} durationInFrames={210}>
        <SceneOverlay text="December 1900" animation="fadeInUp" imageEffect="kenBurnsZoomIn" />
      </Sequence>
      <Sequence from={270} durationInFrames={390}>
        <SceneOverlay text="Logbook: 'Storm, Dec 15'" animation="typewriter" imageEffect="panLeft" />
      </Sequence>
      <Sequence from={660} durationInFrames={270}>
        <SceneOverlay text="Raincoat Left Behind" animation="scaleIn" imageEffect="kenBurnsZoomOut" />
      </Sequence>
      <Sequence from={930} durationInFrames={240}>
        <SceneOverlay text="Rogue Wave? Murder?" animation="slideIn" imageEffect="pulse" />
      </Sequence>
      <Sequence from={1170} durationInFrames={231}>
        <SceneOverlay text="The Sea Keeps Secrets" animation="fadeInUp" imageEffect="kenBurnsZoomIn" />
      </Sequence>

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
