/**
 * AnimatedNumber — counts up from 0 to a target value using spring physics.
 */
import React from "react";
import { useCurrentFrame, useVideoConfig, spring } from "remotion";
import type { ThemeConfig } from "../themes/index.ts";

interface Props {
  value: number;
  delay?: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  theme?: ThemeConfig;
}

export const AnimatedNumber: React.FC<Props> = ({
  value,
  delay = 0,
  duration = 40,
  decimals = 0,
  prefix = "",
  suffix = "",
  fontSize = 28,
  fontWeight = 700,
  color,
  theme,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = theme ?? ({} as ThemeConfig);
  const progress = spring({ frame: frame - delay, fps, durationInFrames: duration, config: { damping: 18 } });
  const current = value * progress;

  return (
    <span
      style={{
        fontFamily: t.fonts?.mono ?? "'SF Mono', monospace",
        fontSize,
        fontWeight,
        color: color ?? t.text?.bright ?? "#ffffff",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {prefix}
      {current.toFixed(decimals)}
      {suffix}
    </span>
  );
};
