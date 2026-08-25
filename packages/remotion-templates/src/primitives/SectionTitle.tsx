/**
 * SectionTitle — modern gradient text title with spring entrance.
 */
import React from "react";
import { useCurrentFrame, useVideoConfig, spring } from "remotion";
import type { ThemeConfig } from "../themes/index.ts";
import { GradientText } from "./GradientText.tsx";

interface Props {
  title: string;
  delay?: number;
  maxWidth?: number;
  fontSize?: number;
  theme?: ThemeConfig;
}

export const SectionTitle: React.FC<Props> = ({
  title,
  delay = 0,
  maxWidth = 600,
  fontSize = 28,
  theme,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = theme ?? ({} as ThemeConfig);

  const opacity = spring({
    frame: frame - delay,
    fps,
    config: { damping: 16 },
    from: 0,
    to: 1,
  });
  const y = spring({
    frame: frame - delay,
    fps,
    from: 20,
    to: 0,
    config: { damping: 14, mass: 0.6 },
  });

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${y}px)`,
        textAlign: "center",
        maxWidth,
        padding: "0 30px",
      }}
    >
      <GradientText fontSize={fontSize} fontWeight={700} theme={t}>
        {title}
      </GradientText>
    </div>
  );
};
