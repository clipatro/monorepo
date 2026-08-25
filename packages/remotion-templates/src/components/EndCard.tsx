/**
 * EndCard — modern glassmorphic outro with gradient CTA button.
 */
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import type { ThemeConfig } from "../themes/index.ts";
import { AnimatedBackground } from "../primitives/AnimatedBackground.tsx";

interface Props {
  text?: string;
  ctaText?: string;
  footerText?: string;
  theme?: ThemeConfig;
}

export const EndCard: React.FC<Props> = ({
  text = "Thanks for Watching",
  ctaText = "Learn More",
  footerText = "Stay Informed",
  theme,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = theme;

  const scale = spring({ frame, fps, from: 0.85, to: 1, durationInFrames: 40, config: { damping: 12, mass: 0.6, stiffness: 90 } });
  const opacity = spring({ frame, fps, from: 0, to: 1, durationInFrames: 30, config: { damping: 16 } });
  const glowPulse = interpolate(Math.sin(frame * 0.06), [-1, 1], [0.3, 0.7]);
  const btnOp = spring({ frame: Math.max(0, frame - 25), fps, from: 0, to: 1, durationInFrames: 30, config: { damping: 14 } });
  const btnScale = spring({ frame: Math.max(0, frame - 25), fps, from: 0.8, to: 1, durationInFrames: 30, config: { damping: 12 } });
  const exitOp = interpolate(frame, [durationInFrames - 20, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const accent = t?.accents?.primary ?? "#00d4ff";
  const accent2 = t?.accents?.secondary ?? "#a855f7";
  const glassBg = t?.glass?.bg ?? "rgba(255,255,255,0.04)";
  const textBright = t?.text?.bright ?? "#ffffff";
  const textDim = t?.text?.dim ?? "rgba(255,255,255,0.35)";
  const sansFont = t?.fonts?.sans ?? "Inter, sans-serif";

  return (
    <AbsoluteFill style={{ opacity: exitOp }}>
      <AnimatedBackground theme={t} variant="cool" />

      <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{
          transform: `scale(${scale})`, opacity,
          display: "flex", flexDirection: "column", alignItems: "center",
          padding: 50, borderRadius: t?.radius?.xl ?? 24,
          border: `1px solid ${accent}${Math.round(glowPulse * 255).toString(16).padStart(2, "0")}`,
          boxShadow: `0 0 50px ${accent}${Math.round(glowPulse * 0.25 * 255).toString(16).padStart(2, "0")}, 0 8px 32px rgba(0,0,0,0.4)`,
          background: glassBg, backdropFilter: "blur(20px)",
        }}>
          <div style={{
            width: 60, height: 60, borderRadius: t?.radius?.md ?? 12,
            background: `linear-gradient(135deg, ${accent}, ${accent2})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            marginBottom: 24, boxShadow: `0 4px 20px ${accent}40`,
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="white" strokeWidth="2" strokeLinejoin="round" />
              <path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2" strokeLinejoin="round" />
            </svg>
          </div>

          <h1 style={{
            fontFamily: sansFont, fontSize: 36, fontWeight: 800,
            background: `linear-gradient(135deg, ${textBright} 0%, ${accent} 100%)`,
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
            margin: 0, textAlign: "center", letterSpacing: "-0.5px",
          }}>
            {text}
          </h1>

          <div style={{
            marginTop: 32, padding: "16px 44px",
            background: `linear-gradient(135deg, ${accent}, ${accent2})`,
            borderRadius: t?.radius?.md ?? 12, opacity: btnOp, transform: `scale(${btnScale})`,
            boxShadow: `0 4px 20px ${accent}40`,
          }}>
            <span style={{ color: textBright, fontSize: 18, fontWeight: 600, fontFamily: sansFont, letterSpacing: "0.5px" }}>
              {ctaText}
            </span>
          </div>

          <p style={{ color: textDim, fontSize: 14, marginTop: 28, letterSpacing: "1.5px", textTransform: "uppercase", fontFamily: sansFont, margin: 0 }}>
            {footerText}
          </p>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
