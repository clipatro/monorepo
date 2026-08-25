/**
 * BarChart — animated bar chart with gradient bars, glow, and animated counters.
 *
 * Props:
 * - data: { title, yAxisLabel, maxValue, bars: [{ label, value, color? }] }
 * - theme: ThemeConfig (optional, defaults to midnight)
 * - delay: frames before entrance starts
 */
import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from "remotion";
import type { ThemeConfig } from "../themes/index.ts";
import { GlassCard } from "../primitives/GlassCard.tsx";
import { SectionTitle } from "../primitives/SectionTitle.tsx";

export interface BarChartData {
  title: string;
  yAxisLabel: string;
  maxValue: number;
  bars: Array<{ label: string; value: number; color?: string }>;
}

interface Props {
  data: BarChartData;
  theme?: ThemeConfig;
  delay?: number;
}

export const BarChart: React.FC<Props> = ({ data, theme, delay = 5 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = theme;

  const d = data;
  const W = 620;
  const H = 820;
  const pad = { top: 100, right: 50, bottom: 80, left: 70 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const barCount = d.bars.length;
  const slotW = plotW / barCount;
  const barW = Math.min(70, slotW * 0.55);

  const chartColors = t?.chartColors ?? ["#00d4ff", "#a855f7"];
  const grid = t?.chart?.grid ?? "rgba(255,255,255,0.06)";
  const textDim = t?.text?.dim ?? "rgba(255,255,255,0.35)";
  const textMid = t?.text?.mid ?? "rgba(255,255,255,0.65)";
  const textBright = t?.text?.bright ?? "#ffffff";
  const monoFont = t?.fonts?.mono ?? "'SF Mono', monospace";
  const sansFont = t?.fonts?.sans ?? "Inter, sans-serif";

  return (
    <GlassCard width={W} height={H} delay={delay} theme={t} style={{ position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 30, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <SectionTitle title={d.title} delay={delay + 3} theme={t} />
      </div>

      <svg width={W} height={H} style={{ position: "absolute", top: 0, left: 0 }}>
        <defs>
          {d.bars.map((bar, i) => {
            const color = bar.color ?? chartColors[i % chartColors.length];
            const isHighlight = bar.color === "#ef233c" || bar.color === t?.accents?.danger;
            return (
              <linearGradient key={`grad-${i}`} id={`barGrad-${i}`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={color} stopOpacity={1} />
                <stop offset="100%" stopColor={color} stopOpacity={0.7} />
              </linearGradient>
            );
          })}
          <filter id="barGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
          const y = pad.top + plotH * (1 - pct);
          const val = Math.round(d.maxValue * pct);
          const gridOpacity = interpolate(frame, [10 + i * 3, 20 + i * 3], [0, 1], { extrapolateRight: "clamp" });
          return (
            <g key={`grid-${i}`} opacity={gridOpacity}>
              <line x1={pad.left} y1={y} x2={W - pad.right} y2={y} stroke={grid} strokeWidth={1} strokeDasharray="4 4" />
              <text x={pad.left - 12} y={y + 5} textAnchor="end" fill={textDim} fontSize={13} fontFamily={monoFont}>
                {val}
              </text>
            </g>
          );
        })}

        <text x={20} y={H / 2} textAnchor="middle" fill={textDim} fontSize={12} fontFamily={sansFont}
          transform={`rotate(-90 20 ${H / 2})`}>
          {d.yAxisLabel}
        </text>

        {/* Bars */}
        {d.bars.map((bar, i) => {
          const barX = pad.left + slotW * i + (slotW - barW) / 2;
          const targetH = (bar.value / d.maxValue) * plotH;
          const stagger = i * 10;
          const barH = interpolate(frame, [20 + stagger, 50 + stagger], [0, targetH], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          });
          const barY = pad.top + plotH - barH;
          const labelOp = interpolate(frame, [35 + stagger, 45 + stagger], [0, 1], { extrapolateRight: "clamp" });
          const valueOp = interpolate(frame, [40 + stagger, 55 + stagger], [0, 1], { extrapolateRight: "clamp" });
          const valueScale = spring({ frame: frame - 40 - stagger, fps, config: { damping: 12 }, from: 0.5, to: 1 });
          const color = bar.color ?? chartColors[i % chartColors.length];
          const isHighlight = bar.color === "#ef233c" || bar.color === t?.accents?.danger;
          const glowOp = interpolate(frame, [30 + stagger, 50 + stagger], [0, isHighlight ? 0.6 : 0.3], { extrapolateRight: "clamp" });

          return (
            <g key={`bar-${i}`}>
              <rect x={barX - 8} y={barY - 8} width={barW + 16} height={barH + 8} rx={8}
                fill={color} opacity={glowOp} filter="url(#barGlow)" />
              <rect x={barX} y={barY} width={barW} height={barH} rx={6}
                fill={`url(#barGrad-${i})`} />
              <rect x={barX} y={barY} width={barW} height={3} rx={2}
                fill={color} opacity={valueOp * 0.8} />
              <g opacity={valueOp} transform={`translate(${barX + barW / 2}, ${barY - 16}) scale(${valueScale})`}>
                <text textAnchor="middle" fill={isHighlight ? (t?.accents?.danger ?? "#f43f5e") : textBright} fontSize={18} fontWeight={700} fontFamily={monoFont}>
                  {bar.value}
                </text>
              </g>
              <text x={barX + barW / 2} y={pad.top + plotH + 28} textAnchor="middle"
                fill={textMid} fontSize={14} fontWeight={500} fontFamily={sansFont} opacity={labelOp}>
                {bar.label}
              </text>
            </g>
          );
        })}
      </svg>
    </GlassCard>
  );
};
