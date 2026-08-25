/**
 * GradientText — text with a gradient fill using WebkitBackgroundClip.
 */
import React from "react";
import type { ThemeConfig } from "../themes/index.ts";

interface Props {
  children: React.ReactNode;
  fontSize?: number;
  fontWeight?: number;
  from?: string;
  to?: string;
  letterSpacing?: string;
  textAlign?: "left" | "center" | "right";
  theme?: ThemeConfig;
  style?: React.CSSProperties;
}

export const GradientText: React.FC<Props> = ({
  children,
  fontSize = 28,
  fontWeight = 700,
  from,
  to,
  letterSpacing = "-0.5px",
  textAlign = "center",
  theme,
  style,
}) => {
  const t = theme ?? ({} as ThemeConfig);
  const c1 = from ?? t.text?.bright ?? "#ffffff";
  const c2 = to ?? t.accents?.primary ?? "#00d4ff";

  return (
    <span
      style={{
        fontFamily: t.fonts?.sans ?? "Inter, sans-serif",
        fontSize,
        fontWeight,
        background: `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`,
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
        letterSpacing,
        lineHeight: 1.2,
        textAlign,
        display: "inline-block",
        ...style,
      }}
    >
      {children}
    </span>
  );
};
