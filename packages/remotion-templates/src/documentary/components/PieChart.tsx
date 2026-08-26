import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import type { ThemeConfig } from "../../themes/index.ts";
import { DocumentaryCanvas, DocumentaryReveal, getDocumentaryTokens } from "../canvas.tsx";
import { type StoryIconName } from "../../primitives/StoryIcon.tsx";

export interface PieChartData {
  title: string;
  segments: Array<{ label: string; value: number; color?: string }>;
  icon?: StoryIconName;
}

interface Props {
  data: PieChartData;
  theme?: ThemeConfig;
  delay?: number;
}

export const PieChart: React.FC<Props> = ({ data, theme, delay = 5 }) => {
  const frame = useCurrentFrame();
  const t = getDocumentaryTokens(theme);
  const segments = data.segments.slice(0, 4);
  const total = Math.max(1, segments.reduce((sum, segment) => sum + segment.value, 0));
  return (
    <DocumentaryCanvas theme={theme} delay={delay} eyebrow="Share of the whole" footer={`${total} total units`} contentStyle={{ justifyContent: "flex-start", paddingTop: 20 }}>
      <DocumentaryReveal delay={delay + 4} direction="wipe"><h1 style={{ margin: 0, fontFamily: t.display, fontSize: data.title.length > 50 ? 69 : 84, lineHeight: 0.9, textTransform: "uppercase" }}>{data.title}</h1></DocumentaryReveal>
      <div style={{ display: "flex", height: 120, marginTop: 44, border: `4px solid ${t.bright}`, overflow: "hidden" }}>
        {segments.map((segment, index) => { const target = segment.value / total; const progress = interpolate(frame, [delay + 15 + index * 8, delay + 54 + index * 8], [0, target], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }); const color = segment.color ?? t.chartColors[index % t.chartColors.length] ?? t.accent; return <div key={`${segment.label}-${index}`} style={{ width: `${progress * 100}%`, minWidth: progress > 0 ? 3 : 0, height: "100%", background: color, borderRight: index === segments.length - 1 ? 0 : `4px solid ${t.base}` }} />; })}
      </div>
      <div style={{ display: "grid", gap: 16, marginTop: 40 }}>
        {segments.map((segment, index) => { const color = segment.color ?? t.chartColors[index % t.chartColors.length] ?? t.accent; const appear = interpolate(frame, [delay + 32 + index * 9, delay + 48 + index * 9], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }); return <div key={`${segment.label}-legend`} style={{ display: "grid", gridTemplateColumns: "20px 1fr auto", gap: 16, alignItems: "center", opacity: appear, transform: `translateX(${(1 - appear) * 32}px)` }}><div style={{ width: 20, height: 20, background: color }} /><div style={{ color: t.mid, fontFamily: t.serif, fontSize: 24 }}>{segment.label}</div><div style={{ color, fontFamily: t.display, fontSize: 45, fontVariantNumeric: "tabular-nums" }}>{Math.round((segment.value / total) * 100)}%</div></div>; })}
      </div>
    </DocumentaryCanvas>
  );
};
