import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import type { ThemeConfig } from "../../themes/index.ts";
import { DocumentaryCanvas, DocumentaryReveal, getDocumentaryTokens } from "../canvas.tsx";
import { StoryIcon, type StoryIconName } from "../../primitives/StoryIcon.tsx";

export interface BarChartData {
  title: string;
  yAxisLabel: string;
  maxValue: number;
  bars: Array<{ label: string; value: number; color?: string }>;
  icon?: StoryIconName;
}

interface Props {
  data: BarChartData;
  theme?: ThemeConfig;
  delay?: number;
}

export const BarChart: React.FC<Props> = ({ data, theme, delay = 5 }) => {
  const frame = useCurrentFrame();
  const t = getDocumentaryTokens(theme);
  const bars = data.bars.slice(0, 6);
  const max = Math.max(data.maxValue, ...bars.map((bar) => bar.value), 1);
  return (
    <DocumentaryCanvas theme={theme} delay={delay} eyebrow="Comparative measure" icon={data.icon ?? "trend"} footer={data.yAxisLabel} contentStyle={{ justifyContent: "flex-start", paddingTop: 50 }}>
      <DocumentaryReveal delay={delay + 4} direction="wipe"><h1 style={{ margin: 0, maxWidth: 590, fontFamily: t.display, fontSize: data.title.length > 55 ? 68 : 82, lineHeight: 0.9, textTransform: "uppercase" }}>{data.title}</h1></DocumentaryReveal>
      <div style={{ display: "grid", gap: 20, marginTop: 54 }}>
        {bars.map((bar, index) => {
          const color = bar.color ?? (index === bars.length - 1 ? t.accent : t.bright);
          const progress = interpolate(frame, [delay + 14 + index * 8, delay + 50 + index * 8], [0, bar.value / max], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
          const valueProgress = interpolate(frame, [delay + 18 + index * 8, delay + 52 + index * 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return <div key={`${bar.label}-${index}`}><div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 20, marginBottom: 8 }}><span style={{ color: t.mid, fontFamily: t.mono, fontSize: 14, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>{bar.label}</span><span style={{ color, fontFamily: t.display, fontSize: 36, fontVariantNumeric: "tabular-nums" }}>{(bar.value * valueProgress).toFixed(Number.isInteger(bar.value) ? 0 : 1)}</span></div><div style={{ height: 44, background: t.elevated, border: `2px solid ${t.border}`, overflow: "hidden" }}><div style={{ width: `${progress * 100}%`, height: "100%", background: color, display: "flex", justifyContent: "flex-end", alignItems: "center", paddingRight: 10 }}><StoryIcon name={data.icon ?? "trend"} size={22} color={t.base} style={{ opacity: progress > 0.15 ? 1 : 0 }} /></div></div></div>;
        })}
      </div>
    </DocumentaryCanvas>
  );
};
