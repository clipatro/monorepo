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
  StaticFile,
} from "remotion";

// ─── Color palette ──────────────────────────────────────────────────────────

const COLORS = {
  bgDark: "#0a0a1a",
  bgMid: "#1a1a3e",
  accent: "#6366f1",
  accentBright: "#818cf8",
  accentGlow: "#a5b4fc",
  textPrimary: "#f8fafc",
  textSecondary: "#cbd5e1",
  textMuted: "#64748b",
};

// ─── Helper: animated gradient background ───────────────────────────────────

const AnimatedGradient: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const shift = interpolate(frame, [0, 360], [0, 360], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(${135 + shift}deg, ${COLORS.bgDark} 0%, ${COLORS.bgMid} 50%, ${COLORS.bgDark} 100%)`,
      }}
    >
      {/* Radial glow that pulses */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 50% 35%, ${COLORS.accent}22 0%, transparent 60%)`,
          opacity: interpolate(
            Math.sin(frame / 30),
            [-1, 1],
            [0.3, 0.7],
          ),
        }}
      />
      {/* Secondary glow lower */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 50% 75%, ${COLORS.accentBright}11 0%, transparent 50%)`,
          opacity: interpolate(
            Math.sin(frame / 45 + 1),
            [-1, 1],
            [0.2, 0.5],
          ),
        }}
      />
    </AbsoluteFill>
  );
};

// ─── Helper: floating particles ─────────────────────────────────────────────

const Particles: React.FC = () => {
  const frame = useCurrentFrame();
  const particles = React.useMemo(
    () =>
      Array.from({ length: 30 }, (_, i) => ({
        id: i,
        x: (i * 137.5) % 100,
        startY: (i * 73.3) % 100,
        size: 1 + (i % 3),
        speed: 0.3 + (i % 5) * 0.15,
        drift: (i % 7) - 3,
      })),
    [],
  );

  return (
    <AbsoluteFill>
      {particles.map((p) => {
        const y = (p.startY - (frame * p.speed) / 10) % 100;
        const yPos = y < 0 ? y + 100 : y;
        const opacity = interpolate(
          yPos,
          [0, 10, 90, 100],
          [0, 0.6, 0.6, 0],
        );
        return (
          <div
            key={p.id}
            style={{
              position: "absolute",
              left: `${p.x + Math.sin(frame / 60 + p.id) * p.drift}%`,
              top: `${yPos}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              borderRadius: "50%",
              background: COLORS.accentGlow,
              opacity,
              boxShadow: `0 0 ${p.size * 3}px ${COLORS.accentGlow}`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

// ─── Helper: animated grid lines ────────────────────────────────────────────

const GridLines: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeIn = interpolate(frame, [0, 30], [0, 0.08], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundImage: `
          linear-gradient(${COLORS.accent}40 1px, transparent 1px),
          linear-gradient(90deg, ${COLORS.accent}40 1px, transparent 1px)
        `,
        backgroundSize: "60px 60px",
        opacity: fadeIn,
      }}
    />
  );
};

// ─── Beat 1: Cold open glow (0-2s) ──────────────────────────────────────────

const ColdOpen: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const glowSize = spring({
    frame,
    fps,
    config: { damping: 200, stiffness: 100, mass: 1 },
  });

  const opacity = interpolate(frame, [0, 15, 45, 60], [0, 0.8, 0.8, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        opacity,
      }}
    >
      <div
        style={{
          width: width * 0.6 * glowSize,
          height: width * 0.6 * glowSize,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${COLORS.accentBright}80 0%, ${COLORS.accent}40 40%, transparent 70%)`,
          filter: "blur(20px)",
        }}
      />
    </AbsoluteFill>
  );
};

// ─── Beat 2: Wordmark reveal (2-6s) ─────────────────────────────────────────

const WordmarkReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();

  // Title slides up from below
  const titleY = spring({
    frame: frame - 5,
    fps,
    config: { damping: 12, stiffness: 80, mass: 0.8 },
  });

  const titleOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Letter spacing animates
  const letterSpacing = interpolate(
    frame,
    [0, 30],
    [20, 8],
    {
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    },
  );

  // Subtitle fades in after title
  const subtitleOpacity = interpolate(frame, [20, 40], [0, 1], {
    extrapolateRight: "clamp",
  });

  const subtitleY = spring({
    frame: frame - 20,
    fps,
    config: { damping: 15, stiffness: 60, mass: 1 },
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
      }}
    >
      {/* Main title */}
      <div
        style={{
          transform: `translateY(${(1 - titleY) * 40}px)`,
          opacity: titleOpacity,
        }}
      >
        <h1
          style={{
            fontFamily: "sans-serif",
            fontSize: 72,
            fontWeight: 900,
            color: COLORS.textPrimary,
            letterSpacing: `${letterSpacing}px`,
            margin: 0,
            textShadow: `0 0 40px ${COLORS.accent}80, 0 0 80px ${COLORS.accent}40`,
            textAlign: "center",
          }}
        >
          CLIPATRO
        </h1>
      </div>

      {/* Subtitle */}
      <div
        style={{
          transform: `translateY(${(1 - subtitleY) * 20}px)`,
          opacity: subtitleOpacity,
          marginTop: 16,
        }}
      >
        <p
          style={{
            fontFamily: "sans-serif",
            fontSize: 24,
            fontWeight: 300,
            color: COLORS.textSecondary,
            letterSpacing: "6px",
            margin: 0,
            textTransform: "uppercase",
          }}
        >
          Stories That Move
        </p>
      </div>
    </AbsoluteFill>
  );
};

// ─── Beat 3: Tagline + kinetic underline (6-10s) ────────────────────────────

const TaglineSection: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();

  const taglineOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Underline grows from left to right
  const underlineWidth = spring({
    frame: frame - 10,
    fps,
    config: { damping: 20, stiffness: 60, mass: 1 },
  });

  // Feature items cascade in
  const features = [
    "AI-Driven Storylines",
    "Consistent Characters",
    "Broadcast-Quality Voice",
    "CapCut-Ready Export",
  ];

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        padding: "0 60px",
      }}
    >
      {/* Tagline */}
      <div
        style={{
          opacity: taglineOpacity,
          textAlign: "center",
          marginBottom: 40,
        }}
      >
        <p
          style={{
            fontFamily: "sans-serif",
            fontSize: 32,
            fontWeight: 600,
            color: COLORS.textPrimary,
            margin: 0,
            lineHeight: 1.4,
          }}
        >
          From topic to finished video,
          <br />
          <span style={{ color: COLORS.accentBright }}>
            fully automated.
          </span>
        </p>
      </div>

      {/* Kinetic underline */}
      <div
        style={{
          width: width * 0.6,
          height: 2,
          background: `linear-gradient(90deg, ${COLORS.accent}, ${COLORS.accentBright}, ${COLORS.accentGlow})`,
          transform: `scaleX(${underlineWidth})`,
          transformOrigin: "left center",
          marginBottom: 40,
          boxShadow: `0 0 10px ${COLORS.accent}80`,
        }}
      />

      {/* Feature list */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          opacity: taglineOpacity,
        }}
      >
        {features.map((feature, i) => {
          const itemOpacity = interpolate(
            frame,
            [20 + i * 8, 30 + i * 8],
            [0, 1],
            { extrapolateRight: "clamp" },
          );
          const itemX = interpolate(
            frame,
            [20 + i * 8, 30 + i * 8],
            [-30, 0],
            {
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            },
          );
          return (
            <div
              key={feature}
              style={{
                opacity: itemOpacity,
                transform: `translateX(${itemX}px)`,
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: COLORS.accentBright,
                  boxShadow: `0 0 8px ${COLORS.accentBright}`,
                }}
              />
              <span
                style={{
                  fontFamily: "sans-serif",
                  fontSize: 20,
                  fontWeight: 400,
                  color: COLORS.textSecondary,
                }}
              >
                {feature}
              </span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ─── Beat 4: Closing glow + CTA (10-12s) ────────────────────────────────────

const ClosingCTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();

  const ctaScale = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 80, mass: 0.8 },
  });

  const ctaOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Fade out at the end
  const fadeOut = interpolate(frame, [45, 60], [1, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        opacity: ctaOpacity * fadeOut,
      }}
    >
      {/* Glow ring */}
      <div
        style={{
          position: "absolute",
          width: 300 * ctaScale,
          height: 300 * ctaScale,
          borderRadius: "50%",
          border: `2px solid ${COLORS.accent}60`,
          boxShadow: `0 0 60px ${COLORS.accent}40, inset 0 0 60px ${COLORS.accent}20`,
        }}
      />

      {/* CTA text */}
      <div
        style={{
          transform: `scale(${ctaScale})`,
          textAlign: "center",
        }}
      >
        <p
          style={{
            fontFamily: "sans-serif",
            fontSize: 28,
            fontWeight: 700,
            color: COLORS.textPrimary,
            margin: 0,
            letterSpacing: "4px",
            textTransform: "uppercase",
          }}
        >
          Start Creating
        </p>
        <p
          style={{
            fontFamily: "sans-serif",
            fontSize: 18,
            fontWeight: 300,
            color: COLORS.accentBright,
            margin: "8px 0 0 0",
            letterSpacing: "2px",
          }}
        >
          clipatro.ai
        </p>
      </div>
    </AbsoluteFill>
  );
};

// ─── Vignette overlay ───────────────────────────────────────────────────────

const Vignette: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 50%, transparent 50%, ${COLORS.bgDark}cc 100%)`,
        pointerEvents: "none",
      }}
    />
  );
};

// ─── Main composition ───────────────────────────────────────────────────────

export const CinematicTitle: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bgDark }}>
      <AnimatedGradient />
      <GridLines />
      <Particles />

      {/* Beat sequences (frame ranges) */}
      <Sequence from={0} durationInFrames={60}>
        <ColdOpen />
      </Sequence>

      <Sequence from={60} durationInFrames={120}>
        <WordmarkReveal />
      </Sequence>

      <Sequence from={180} durationInFrames={120}>
        <TaglineSection />
      </Sequence>

      <Sequence from={300} durationInFrames={60}>
        <ClosingCTA />
      </Sequence>

      {/* Vignette on top of everything */}
      <Vignette />
    </AbsoluteFill>
  );
};
