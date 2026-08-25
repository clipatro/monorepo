/**
 * PieChart — animated pie chart with glowing segments and glassmorphic legend.
 */
import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from "remotion";
import type { ThemeConfig } from "../themes/index.ts";
import { GlassCard } from "../primitives/GlassCard.tsx";
import { SectionTitle } from "../primitives/SectionTitle.tsx";

export interface PieChartData {
  title: string;
  segments: Array<{ label: string; value: number; color?: string }>;
}

interface Props {
  data: PieChartData;
  theme?: ThemeConfig;
  delay?: number;
}

export const PieChart: React.FC<Props> = ({ data, theme, delay = 5 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = theme;

  const d = data;
  const total = d.segments.reduce((s, seg) => s + seg.value, 0);
  const svgSize = 460;
  const cx = svgSize / 2;
  const cy = svgSize / 2;
  const radius = 150;
  const circumference = 2 * Math.PI * radius;

  let cumulativeOffset = 0;

  const chartColors = t?.chartColors ?? ["#00d4ff", "#a855f7", "#ec4899", "#10b981", "#f59e0b"];
  const grid = t?.chart?.grid ?? "rgba(255,255,255,0.06)";
  const glassBg = t?.glass?.bg ?? "rgba(255,255,255,0.04)";
  const glassBorder = t?.glass?.border ?? "rgba(255,255,255,0.08)";
  const textBright = t?.text?.bright ?? "#ffffff";
  const textDim = t?.text?.dim ?? "rgba(255,255,255,0.35)";
  const bgSurface = t?.bg?.surface ?? "#0a0e1a";
  const sansFont = t?.fonts?.sans ?? "Inter, sans-serif";
  const monoFont = t?.fonts?.mono ?? "'SF Mono', monospace";

  return (
    <GlassCard width={620} height={920} delay={delay} theme={t} style={{ position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ marginTop: 35, display: "flex", justifyContent: "center", width: "100%" }}>
        <SectionTitle title={d.title} delay={delay + 3} theme={t} />
      </div>

      <svg width={svgSize} height={svgSize * 0.75} style={{ marginTop: 10 }}>
        <defs>
          <filter id="pieGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle cx={cx} cy={cy} r={radius} fill="none" stroke={grid} strokeWidth={90} />

        {d.segments.map((seg, i) => {
          const segLen = (seg.value / total) * circumference;
          const currentOff = cumulativeOffset;
          cumulativeOffset += segLen;
          const prog = interpolate(frame, [15 + i * 15, 35 + i * 15], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp", easing: Easing.out(Easing.cubic) });
          const animLen = segLen * prog;
          const color = seg.color ?? chartColors[i % chartColors.length];
          return (
            <g key={`seg-${i}`}>
              <circle cx={cx} cy={cy} r={radius} fill="none" stroke={color} strokeWidth={92}
                strokeDasharray={`${animLen} ${circumference - animLen}`}
                strokeDashoffset={-currentOff}
                transform={`rotate(-90 ${cx} ${cy})`}
                opacity={0.3} filter="url(#pieGlow)" />
              <circle cx={cx} cy={cy} r={radius} fill="none" stroke={color} strokeWidth={88}
                strokeDasharray={`${animLen} ${circumference - animLen}`}
                strokeDashoffset={-currentOff}
                transform={`rotate(-90 ${cx} ${cy})`}
                strokeLinecap="round" />
            </g>
          );
        })}

        <circle cx={cx} cy={cy} r={72} fill={bgSurface} stroke={glassBorder} strokeWidth={1} />
        <circle cx={cx} cy={cy} r={72} fill={glassBg} />
        <text x={cx} y={cy - 5} textAnchor="middle" fill={textBright} fontSize={36} fontWeight={800} fontFamily={monoFont}>
          {total}%
        </text>
        <text x={cx} y={cy + 18} textAnchor="middle" fill={textDim} fontSize={12} fontFamily={sansFont}>
          Total
        </text>
      </svg>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", marginTop: 5, maxWidth: 560, padding: "0 20px" }}>
        {d.segments.map((seg, i) => {
          const legOp = spring({ frame: frame - 20 - i * 12, fps, from: 0, to: 1, config: { damping: 14 } });
          const legY = spring({ frame: frame - 20 - i * 12, fps, from: 15, to: 0, config: { damping: 14 } });
          const color = seg.color ?? chartColors[i % chartColors.length];
          return (
            <div key={`leg-${i}`} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 16px", borderRadius: t?.radius?.md ?? 12,
              background: glassBg, border: `1px solid ${glassBorder}`,
              opacity: legOp, transform: `translateY(${legY}px)`,
            }}>
              <div style={{ width: 16, height: 16, borderRadius: 5, backgroundColor: color, boxShadow: `0 0 12px ${color}80` }} />
              <span style={{ color: textBright, fontSize: 15, fontWeight: 500, fontFamily: sansFont }}>{seg.label}</span>
              <span style={{ color: t?.text?.mid ?? "rgba(255,255,255,0.65)", fontSize: 15, fontWeight: 700, fontFamily: monoFont }}>{seg.value}%</span>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
};
