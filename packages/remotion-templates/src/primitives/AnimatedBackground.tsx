/**
 * AnimatedBackground — deep space background with drifting gradient orbs,
 * subtle grid pattern, and vignette. Adapts orb colors based on theme.
 */
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { ThemeConfig } from "../themes/index.ts";

interface Props {
  theme?: ThemeConfig;
  variant?: "default" | "warm" | "cool";
}

export const AnimatedBackground: React.FC<Props> = ({
  theme,
  variant = "default",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = theme ?? ({} as ThemeConfig);

  const orb1X = Math.sin(frame / (fps * 4)) * 80;
  const orb1Y = Math.cos(frame / (fps * 5)) * 60;
  const orb2X = Math.cos(frame / (fps * 6)) * 100;
  const orb2Y = Math.sin(frame / (fps * 3.5)) * 70;

  const accents = t.accents ?? {
    primary: "#00d4ff",
    primaryDeep: "#0099ff",
    secondary: "#a855f7",
    warning: "#f59e0b",
    danger: "#f43f5e",
  };

  const colors =
    variant === "warm"
      ? [accents.danger ?? "#f43f5e", accents.warning ?? "#f59e0b"]
      : variant === "cool"
        ? [accents.primary ?? "#00d4ff", accents.secondary ?? "#a855f7"]
        : [accents.primaryDeep ?? "#0099ff", accents.secondary ?? "#a855f7"];

  const bg = t.bg ?? { base: "#06080f", surface: "#0a0e1a", elevated: "#0f1424" };
  const grid = t.chart?.grid ?? "rgba(255,255,255,0.06)";

  return (
    <AbsoluteFill style={{ background: bg.base }}>
      {/* Base gradient */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at 50% 0%, ${bg.elevated} 0%, ${bg.surface} 40%, ${bg.base} 100%)`,
        }}
      />
      {/* Floating orb 1 */}
      <div
        style={{
          position: "absolute",
          top: `${200 + orb1Y}px`,
          left: `${360 + orb1X}px`,
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${colors[0]}15 0%, transparent 70%)`,
          filter: "blur(40px)",
        }}
      />
      {/* Floating orb 2 */}
      <div
        style={{
          position: "absolute",
          top: `${800 + orb2Y}px`,
          left: `${100 + orb2X}px`,
          width: 350,
          height: 350,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${colors[1]}12 0%, transparent 70%)`,
          filter: "blur(50px)",
        }}
      />
      {/* Subtle grid pattern */}
      <AbsoluteFill
        style={{
          backgroundImage: `
            linear-gradient(${grid} 1px, transparent 1px),
            linear-gradient(90deg, ${grid} 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
          opacity: 0.4,
        }}
      />
      {/* Vignette */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.4) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};
