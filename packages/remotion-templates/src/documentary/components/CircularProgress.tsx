import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import type { ThemeConfig } from "../../themes/index.ts";
import { DocumentaryCanvas, DocumentaryReveal, getDocumentaryTokens } from "../canvas.tsx";
import { type StoryIconName } from "../../primitives/StoryIcon.tsx";

export interface CircularProgressData {
  title: string;
  percentage: number;
  label: string;
  sublabel: string;
  color?: string;
  icon?: StoryIconName;
}

interface Props {
  data: CircularProgressData;
  theme?: ThemeConfig;
  delay?: number;
}

export const CircularProgress: React.FC<Props> = ({ data, theme, delay = 0 }) => {
  const frame = useCurrentFrame();
  const t = getDocumentaryTokens(theme);
  const progress = interpolate(frame, [delay + 12, delay + 72], [0, data.percentage], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const normalized = Math.min(100, Math.max(0, progress));
  const radius = 185;
  const circumference = Math.PI * radius;
  const color = data.color ?? t.accent;
  return (
    <DocumentaryCanvas theme={theme} delay={delay} eyebrow="Single measure" footer={data.sublabel} contentStyle={{ justifyContent: "flex-start", paddingTop: 20 }}>
      <DocumentaryReveal delay={delay + 4} direction="wipe"><h1 style={{ margin: 0, fontFamily: t.display, fontSize: data.title.length > 52 ? 68 : 82, lineHeight: 0.9, textTransform: "uppercase" }}>{data.title}</h1></DocumentaryReveal>
      <div style={{ position: "relative", width: 590, height: 420, margin: "40px auto 0" }}><svg viewBox="0 0 500 350" width="100%" height="100%"><path d="M65 285 A185 185 0 0 1 435 285" fill="none" stroke={t.elevated} strokeWidth="46" strokeLinecap="square" /><path d="M65 285 A185 185 0 0 1 435 285" fill="none" stroke={color} strokeWidth="46" strokeLinecap="square" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - normalized / 100)} /></svg><div style={{ position: "absolute", left: 0, right: 0, top: 0, textAlign: "center" }}><div style={{ color, fontFamily: t.display, fontSize: 112, lineHeight: 0.78, fontVariantNumeric: "tabular-nums" }}>{progress.toFixed(0)}%</div><div style={{ color: t.mid, fontFamily: t.mono, fontSize: 16, letterSpacing: 2, textTransform: "uppercase", marginTop: 16 }}>{data.sublabel}</div></div></div>
      <DocumentaryReveal delay={delay + 34} direction="left"><div style={{ maxWidth: 550, color: t.mid, fontFamily: t.serif, fontSize: 26, lineHeight: 1.4 }}>{data.label}</div></DocumentaryReveal>
    </DocumentaryCanvas>
  );
};
