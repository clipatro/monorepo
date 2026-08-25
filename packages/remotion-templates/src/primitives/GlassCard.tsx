/**
 * GlassCard — glassmorphic container with spring entrance animation.
 *
 * Provides the frosted-glass look used across all chart/data components.
 */
import React from "react";
import { useCurrentFrame, useVideoConfig, spring } from "remotion";
import type { ThemeConfig } from "../themes/index.ts";

interface Props {
  children: React.ReactNode;
  width?: number | string;
  height?: number | string;
  delay?: number;
  theme?: ThemeConfig;
  style?: React.CSSProperties;
}

export const GlassCard: React.FC<Props> = ({
  children,
  width,
  height,
  delay = 0,
  theme,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = theme ?? ({} as ThemeConfig);

  const scale = spring({
    frame: frame - delay,
    fps,
    config: { damping: 14, mass: 0.7, stiffness: 100 },
    from: 0.92,
    to: 1,
  });
  const opacity = spring({
    frame: frame - delay,
    fps,
    config: { damping: 16 },
    from: 0,
    to: 1,
  });

  return (
    <div
      style={{
        width,
        height,
        background: t.glass?.bg ?? "rgba(255,255,255,0.04)",
        borderRadius: t.radius?.xl ?? 24,
        border: `1px solid ${t.glass?.border ?? "rgba(255,255,255,0.08)"}`,
        boxShadow: t.shadows?.card ?? "0 8px 32px rgba(0,0,0,0.4)",
        backdropFilter: "blur(20px)",
        transform: `scale(${scale})`,
        opacity,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
