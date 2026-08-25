import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import type { ThemeConfig } from "../../themes/index.ts";
import { DocumentaryCanvas, DocumentaryReveal, getDocumentaryTokens } from "../canvas.tsx";
import { StoryIcon, type StoryIconName } from "../../primitives/StoryIcon.tsx";

export interface LineChartData {
  title: string;
  yAxisLabel: string;
  maxValue: number;
  lineColor?: string;
  points: Array<{ label: string; value: number }>;
  icon?: StoryIconName;
}

interface Props {
  data: LineChartData;
  theme?: ThemeConfig;
  delay?: number;
}

export const LineChart: React.FC<Props> = ({ data, theme, delay = 5 }) => {
  const frame = useCurrentFrame();
  const t = getDocumentaryTokens(theme);
  const points = data.points.length >= 2 ? data.points.slice(0, 8) : [...data.points, { label: "", value: data.points[0]?.value ?? 0 }];
  const W = 600;
  const H = 560;
  const max = Math.max(data.maxValue, ...points.map((point) => point.value), 1);
  const coords = points.map((point, index) => ({ x: 30 + index * ((W - 60) / Math.max(1, points.length - 1)), y: H - 60 - (point.value / max) * (H - 130) }));
  const linePath = coords.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const areaPath = `${linePath} L ${coords.at(-1)?.x ?? W - 30} ${H - 60} L ${coords[0]?.x ?? 30} ${H - 60} Z`;
  const progress = interpolate(frame, [delay + 16, delay + 82], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const color = data.lineColor ?? t.accent;
  const totalLength = 1050;
  return (
    <DocumentaryCanvas theme={theme} delay={delay} eyebrow="Trend record" icon={data.icon ?? "trend"} footer={data.yAxisLabel} contentStyle={{ justifyContent: "flex-start", paddingTop: 42 }}>
      <DocumentaryReveal delay={delay + 4} direction="wipe"><h1 style={{ margin: 0, maxWidth: 590, fontFamily: t.display, fontSize: data.title.length > 56 ? 66 : 80, lineHeight: 0.9, textTransform: "uppercase" }}>{data.title}</h1></DocumentaryReveal>
      <div style={{ position: "relative", marginTop: 52, height: 610, borderLeft: `4px solid ${t.bright}`, borderBottom: `4px solid ${t.bright}` }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%"><defs><pattern id="trendHatch" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="12" stroke={color} strokeWidth="4" opacity="0.22" /></pattern></defs><path d={areaPath} fill="url(#trendHatch)" clipPath={`inset(0 ${100 - progress * 100}% 0 0)`} /><path d={linePath} fill="none" stroke={t.bright} strokeWidth="14" strokeLinecap="square" strokeLinejoin="miter" strokeDasharray={totalLength} strokeDashoffset={totalLength * (1 - progress)} /><path d={linePath} fill="none" stroke={color} strokeWidth="5" strokeLinecap="square" strokeLinejoin="miter" strokeDasharray={totalLength} strokeDashoffset={totalLength * (1 - progress)} />{coords.map((point, index) => { const appear = interpolate(progress, [index / points.length, Math.min(1, index / points.length + 0.18)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }); return <g key={index} opacity={appear}><rect x={point.x - 10} y={point.y - 10} width="20" height="20" fill={index === points.length - 1 ? color : t.bright} transform={`rotate(45 ${point.x} ${point.y})`} /><text x={point.x} y={H - 24} textAnchor="middle" fill={t.mid} fontFamily={t.mono} fontSize="15">{points[index]?.label}</text></g>; })}</svg>
        <div style={{ position: "absolute", right: 18, top: 12, display: "flex", alignItems: "center", gap: 10, color }}><StoryIcon name="trend" size={28} /><span style={{ fontFamily: t.display, fontSize: 56 }}>{(points.at(-1)?.value ?? 0) * progress > 0 ? ((points.at(-1)?.value ?? 0) * progress).toFixed(0) : "0"}</span></div>
      </div>
    </DocumentaryCanvas>
  );
};
