/**
 * LineChart — animated line chart with gradient area fill, glowing points.
 */
import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from "remotion";
import type { ThemeConfig } from "../themes/index.ts";
import { GlassCard } from "../primitives/GlassCard.tsx";
import { SectionTitle } from "../primitives/SectionTitle.tsx";

export interface LineChartData {
  title: string;
  yAxisLabel: string;
  maxValue: number;
  lineColor?: string;
  points: Array<{ label: string; value: number }>;
}

interface Props {
  data: LineChartData;
  theme?: ThemeConfig;
  delay?: number;
}

export const LineChart: React.FC<Props> = ({ data, theme, delay = 5 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = theme;

  const d = data;
  const W = 620;
  const H = 820;
  const pad = { top: 100, right: 50, bottom: 80, left: 70 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const xScale = (i: number) => pad.left + (i / (d.points.length - 1)) * plotW;
  const yScale = (y: number) => pad.top + plotH - (y / d.maxValue) * plotH;

  const pts = d.points.map((p, i) => ({ x: xScale(i), y: yScale(p.value) }));
  const polylineStr = pts.map((p) => `${p.x},${p.y}`).join(" ");
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  const areaPath = `M ${first.x} ${pad.top + plotH} ` +
    pts.map((p) => `L ${p.x} ${p.y}`).join(" ") +
    ` L ${last.x} ${pad.top + plotH} Z`;

  let totalLen = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    totalLen += Math.sqrt(dx * dx + dy * dy);
  }

  const drawProgress = interpolate(frame, [15, 80], [0, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const dashOffset = totalLen * (1 - drawProgress);
  const areaClipW = plotW * drawProgress;

  const lineColor = d.lineColor ?? t?.accents?.primary ?? "#00d4ff";
  const lineColorDeep = d.lineColor === "#ef233c" ? "#c026d3" : (t?.accents?.primaryDeep ?? "#0099ff");
  const grid = t?.chart?.grid ?? "rgba(255,255,255,0.06)";
  const axis = t?.chart?.axis ?? "rgba(255,255,255,0.12)";
  const textDim = t?.text?.dim ?? "rgba(255,255,255,0.35)";
  const textMid = t?.text?.mid ?? "rgba(255,255,255,0.65)";
  const textBright = t?.text?.bright ?? "#ffffff";
  const monoFont = t?.fonts?.mono ?? "'SF Mono', monospace";
  const sansFont = t?.fonts?.sans ?? "Inter, sans-serif";
  const glassBg = t?.glass?.bg ?? "rgba(255,255,255,0.04)";
  const glassBorder = t?.glass?.border ?? "rgba(255,255,255,0.08)";
  const bgSurface = t?.bg?.surface ?? "#0a0e1a";

  return (
    <GlassCard width={W} height={H} delay={delay} theme={t} style={{ position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 30, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <SectionTitle title={d.title} delay={delay + 3} theme={t} />
      </div>

      <svg width={W} height={H} style={{ position: "absolute", top: 0, left: 0 }}>
        <defs>
          <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={lineColor} />
            <stop offset="100%" stopColor={lineColorDeep} />
          </linearGradient>
          <linearGradient id="areaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={lineColor} stopOpacity={0.35} />
            <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
          </linearGradient>
          <clipPath id="areaClip">
            <rect x={pad.left} y={0} width={areaClipW} height={H} />
          </clipPath>
          <filter id="pointGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
          const y = pad.top + plotH * (1 - pct);
          const gridOp = interpolate(frame, [10 + i * 3, 20 + i * 3], [0, 1], { extrapolateRight: "clamp" });
          return (
            <g key={`grid-${i}`} opacity={gridOp}>
              <line x1={pad.left} y1={y} x2={W - pad.right} y2={y} stroke={grid} strokeWidth={1} strokeDasharray="4 4" />
              <text x={pad.left - 12} y={y + 5} textAnchor="end" fill={textDim} fontSize={13} fontFamily={monoFont}>
                {Math.round(d.maxValue * pct)}
              </text>
            </g>
          );
        })}

        <line x1={pad.left} y1={pad.top + plotH} x2={W - pad.right} y2={pad.top + plotH} stroke={axis} strokeWidth={1.5} opacity={interpolate(frame, [10, 20], [0, 1], { extrapolateRight: "clamp" })} />
        <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + plotH} stroke={axis} strokeWidth={1.5} opacity={interpolate(frame, [10, 20], [0, 1], { extrapolateRight: "clamp" })} />

        <path d={areaPath} fill="url(#areaGrad)" clipPath="url(#areaClip)" />
        <polyline points={polylineStr} fill="none" stroke="url(#lineGrad)" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={totalLen} strokeDashoffset={dashOffset} />

        {d.points.map((p, i) => {
          const ptProg = interpolate(frame, [20 + i * 15, 28 + i * 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const labelOp = interpolate(frame, [28 + i * 15, 36 + i * 15], [0, 1], { extrapolateRight: "clamp" });
          const labelScale = spring({ frame: frame - 28 - i * 15, fps, config: { damping: 12 }, from: 0.5, to: 1 });
          return (
            <g key={`pt-${i}`}>
              <circle cx={xScale(i)} cy={yScale(p.value)} r={12 * ptProg} fill={lineColor} opacity={ptProg * 0.3} filter="url(#pointGlow)" />
              <circle cx={xScale(i)} cy={yScale(p.value)} r={7 * ptProg} fill={bgSurface} stroke={lineColor} strokeWidth={3} opacity={ptProg} />
              <g opacity={labelOp} transform={`translate(${xScale(i)}, ${yScale(p.value) - 22}) scale(${labelScale})`}>
                <rect x={-28} y={-14} width={56} height={24} rx={6} fill={glassBg} stroke={glassBorder} />
                <text textAnchor="middle" y={3} fill={textBright} fontSize={14} fontWeight={700} fontFamily={monoFont}>
                  {p.value}
                </text>
              </g>
              <text x={xScale(i)} y={pad.top + plotH + 28} textAnchor="middle" fill={textMid} fontSize={14} fontWeight={500} fontFamily={sansFont} opacity={labelOp}>
                {p.label}
              </text>
            </g>
          );
        })}

        <text x={20} y={H / 2} textAnchor="middle" fill={textDim} fontSize={12} fontFamily={sansFont}
          transform={`rotate(-90 20 ${H / 2})`}>
          {d.yAxisLabel}
        </text>
      </svg>
    </GlassCard>
  );
};
