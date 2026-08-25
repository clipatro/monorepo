/**
 * TitleCard — cinematic title card with gradient text, floating particles.
 */
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate, Easing } from "remotion";
import type { ThemeConfig } from "../themes/index.ts";
import { AnimatedBackground } from "../primitives/AnimatedBackground.tsx";
import { GradientText } from "../primitives/GradientText.tsx";

interface Props {
  title: string;
  subtitle: string;
  theme?: ThemeConfig;
}

export const TitleCard: React.FC<Props> = ({ title, subtitle, theme }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = theme;

  const titleScale = spring({ frame, fps, from: 0.7, to: 1, durationInFrames: 50, config: { damping: 12, mass: 0.8, stiffness: 80 } });
  const titleOpacity = spring({ frame, fps, from: 0, to: 1, durationInFrames: 30, config: { damping: 16 } });
  const underlineW = interpolate(frame, [25, 60], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const subOpacity = interpolate(frame, [45, 70], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const subY = interpolate(frame, [45, 70], [20, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const exitOp = interpolate(frame, [durationInFrames - 20, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const accent = t?.accents?.primary ?? "#00d4ff";
  const accent2 = t?.accents?.secondary ?? "#a855f7";
  const textMid = t?.text?.mid ?? "rgba(255,255,255,0.65)";

  const particles = Array.from({ length: 12 }, (_, i) => ({
    x: (i * 67) % 720,
    y: (i * 131) % 1280,
    speed: 0.3 + (i % 3) * 0.2,
    size: 2 + (i % 3),
    delay: i * 5,
  }));

  return (
    <AbsoluteFill style={{ opacity: exitOp }}>
      <AnimatedBackground theme={t} variant="cool" />

      {particles.map((p, i) => {
        const py = (p.y - frame * p.speed) % 1280;
        const pOp = interpolate(frame, [p.delay, p.delay + 20], [0, 0.4], { extrapolateRight: "clamp" });
        return (
          <div key={i} style={{
            position: "absolute", left: p.x, top: py < 0 ? py + 1280 : py,
            width: p.size, height: p.size, borderRadius: "50%",
            background: accent, opacity: pOp,
            boxShadow: `0 0 ${p.size * 3}px ${accent}`,
          }} />
        );
      })}

      <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 40, height: 3, borderRadius: 2, background: `linear-gradient(90deg, transparent, ${accent}, transparent)`, marginBottom: 30, opacity: titleOpacity }} />
        <h1 style={{
          fontFamily: t?.fonts?.sans ?? "Inter, sans-serif",
          fontSize: 48, fontWeight: 800,
          background: `linear-gradient(135deg, ${t?.text?.bright ?? "#ffffff"} 0%, ${accent} 60%, ${accent2} 100%)`,
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
          margin: 0, textAlign: "center", padding: "0 40px", letterSpacing: "-1px", lineHeight: 1.15,
          opacity: titleOpacity, transform: `scale(${titleScale})`,
        }}>
          {title}
        </h1>
        <div style={{ width: `${underlineW}%`, maxWidth: 280, height: 3, background: `linear-gradient(90deg, ${accent}, ${accent2})`, borderRadius: 2, marginTop: 20, boxShadow: `0 0 12px ${accent}80` }} />
        <p style={{
          fontFamily: t?.fonts?.sans ?? "Inter, sans-serif", fontSize: 20, fontWeight: 400,
          color: textMid, margin: 0, marginTop: 24, letterSpacing: "2px", textTransform: "uppercase",
          opacity: subOpacity, transform: `translateY(${subY}px)`,
        }}>
          {subtitle}
        </p>
        <div style={{ width: 40, height: 3, borderRadius: 2, background: `linear-gradient(90deg, transparent, ${accent2}, transparent)`, marginTop: 30, opacity: subOpacity }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
