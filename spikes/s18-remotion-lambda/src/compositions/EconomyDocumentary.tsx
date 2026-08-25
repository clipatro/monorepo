import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
  Sequence,
  Audio,
  staticFile,
} from "remotion";
import config from "../composition-config.json";

// ═══════════════════════════════════════════════════════════════════════════════
// MODERN DESIGN SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

const PAL = {
  // Deep space background with subtle blue undertone
  bg0: "#06080f",
  bg1: "#0a0e1a",
  bg2: "#0f1424",
  // Glassmorphic surfaces
  glass: "rgba(255,255,255,0.04)",
  glassBorder: "rgba(255,255,255,0.08)",
  glassHighlight: "rgba(255,255,255,0.06)",
  // Text
  white: "#ffffff",
  textBright: "rgba(255,255,255,0.95)",
  textMid: "rgba(255,255,255,0.65)",
  textDim: "rgba(255,255,255,0.35)",
  // Accents — modern vibrant gradients
  blue: "#00d4ff",
  blueDeep: "#0099ff",
  purple: "#a855f7",
  pink: "#ec4899",
  emerald: "#10b981",
  amber: "#f59e0b",
  rose: "#f43f5e",
  // Chart grid
  grid: "rgba(255,255,255,0.06)",
  axis: "rgba(255,255,255,0.12)",
};

const FONT = "Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
const MONO = "'SF Mono', 'JetBrains Mono', 'Fira Code', monospace";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Smooth spring entrance with overshoot */
const useEntrance = (delay = 0) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({
    frame: frame - delay,
    fps,
    config: { damping: 14, mass: 0.6, stiffness: 120 },
  });
};

/** Fade out near end of sequence */
const useExitFade = (fadeFrames = 20) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return interpolate(frame, [durationInFrames - fadeFrames, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
};

/** Animated number counter */
const AnimatedNumber: React.FC<{
  value: number;
  delay?: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  fontSize?: number;
  color?: string;
}> = ({ value, delay = 0, duration = 40, decimals = 0, prefix = "", suffix = "", fontSize = 28, color = PAL.white }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({ frame: frame - delay, fps, durationInFrames: duration, config: { damping: 18 } });
  const current = value * progress;
  return (
    <span style={{ fontFamily: MONO, fontSize, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>
      {prefix}{current.toFixed(decimals)}{suffix}
    </span>
  );
};

// ─── Animated Background ─────────────────────────────────────────────────────

const AnimatedBackground: React.FC<{ variant?: "default" | "warm" | "cool" }> = ({ variant = "default" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Slowly drifting gradient orbs
  const orb1X = Math.sin(frame / (fps * 4)) * 80;
  const orb1Y = Math.cos(frame / (fps * 5)) * 60;
  const orb2X = Math.cos(frame / (fps * 6)) * 100;
  const orb2Y = Math.sin(frame / (fps * 3.5)) * 70;

  const colors = variant === "warm"
    ? [PAL.rose, PAL.amber]
    : variant === "cool"
    ? [PAL.blue, PAL.purple]
    : [PAL.blueDeep, PAL.purple];

  return (
    <AbsoluteFill style={{ background: PAL.bg0 }}>
      {/* Base gradient */}
      <AbsoluteFill style={{
        background: `radial-gradient(ellipse at 50% 0%, ${PAL.bg2} 0%, ${PAL.bg1} 40%, ${PAL.bg0} 100%)`,
      }} />
      {/* Floating orb 1 */}
      <div style={{
        position: "absolute",
        top: `${200 + orb1Y}px`,
        left: `${360 + orb1X}px`,
        width: 400,
        height: 400,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${colors[0]}15 0%, transparent 70%)`,
        filter: "blur(40px)",
      }} />
      {/* Floating orb 2 */}
      <div style={{
        position: "absolute",
        top: `${800 + orb2Y}px`,
        left: `${100 + orb2X}px`,
        width: 350,
        height: 350,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${colors[1]}12 0%, transparent 70%)`,
        filter: "blur(50px)",
      }} />
      {/* Subtle grid pattern */}
      <AbsoluteFill style={{
        backgroundImage: `
          linear-gradient(${PAL.grid} 1px, transparent 1px),
          linear-gradient(90deg, ${PAL.grid} 1px, transparent 1px)
        `,
        backgroundSize: "60px 60px",
        opacity: 0.4,
      }} />
      {/* Vignette */}
      <AbsoluteFill style={{
        background: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.4) 100%)",
      }} />
    </AbsoluteFill>
  );
};

// ─── Glass Card wrapper ──────────────────────────────────────────────────────

const GlassCard: React.FC<{
  children: React.ReactNode;
  width?: number;
  height?: number;
  delay?: number;
  style?: React.CSSProperties;
}> = ({ children, width, height, delay = 0, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({ frame: frame - delay, fps, config: { damping: 14, mass: 0.7, stiffness: 100 }, from: 0.92, to: 1 });
  const opacity = spring({ frame: frame - delay, fps, config: { damping: 16 }, from: 0, to: 1 });

  return (
    <div style={{
      width,
      height,
      background: PAL.glass,
      borderRadius: 24,
      border: `1px solid ${PAL.glassBorder}`,
      boxShadow: `0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 ${PAL.glassHighlight}`,
      backdropFilter: "blur(20px)",
      transform: `scale(${scale})`,
      opacity,
      ...style,
    }}>
      {children}
    </div>
  );
};

// ─── Section Title (modern gradient text) ────────────────────────────────────

const SectionTitle: React.FC<{ title: string; delay?: number; maxWidth?: number }> = ({ title, delay = 0, maxWidth = 600 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = spring({ frame: frame - delay, fps, config: { damping: 16 }, from: 0, to: 1 });
  const y = spring({ frame: frame - delay, fps, from: 20, to: 0, config: { damping: 14, mass: 0.6 } });

  return (
    <div style={{
      opacity,
      transform: `translateY(${y}px)`,
      textAlign: "center",
      maxWidth,
      padding: "0 30px",
    }}>
      <h2 style={{
        fontFamily: FONT,
        fontSize: 28,
        fontWeight: 700,
        background: `linear-gradient(135deg, ${PAL.white} 0%, ${PAL.blue} 100%)`,
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
        margin: 0,
        letterSpacing: "-0.5px",
        lineHeight: 1.2,
      }}>
        {title}
      </h2>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// SCENE WRAPPER
// ═══════════════════════════════════════════════════════════════════════════════

const SceneWrapper: React.FC<{ template: string; data: any }> = ({ template, data }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const fadeIn = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [durationInFrames - 15, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut);

  const bgVariant = data?.lineColor === "#ef233c" || data?.color === "#ef233c" ? "warm" : "cool";

  return (
    <AbsoluteFill style={{ opacity, fontFamily: FONT }}>
      <AnimatedBackground variant={bgVariant as any} />
      <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        {template === "bar-chart" && <BarChart data={data} />}
        {template === "line-chart" && <LineChart data={data} />}
        {template === "pie-chart" && <PieChart data={data} />}
        {template === "animated-list" && <AnimatedListScene data={data} />}
        {template === "circular-progress" && <CircularProgressScene data={data} />}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// BAR CHART — Modern with gradient bars, glow, animated counters
// ═══════════════════════════════════════════════════════════════════════════════

const BarChart: React.FC<{ data: any }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const d = data;
  const W = 620;
  const H = 820;
  const pad = { top: 100, right: 50, bottom: 80, left: 70 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const barCount = d.bars.length;
  const slotW = plotW / barCount;
  const barW = Math.min(70, slotW * 0.55);

  // Bar colors with gradient
  const getBarGradient = (color: string) => {
    if (color === "#ef233c") return `linear-gradient(180deg, ${PAL.rose}, #c026d3)`;
    return `linear-gradient(180deg, ${PAL.blue}, ${PAL.blueDeep})`;
  };

  return (
    <GlassCard width={W} height={H} delay={5} style={{ position: "relative", overflow: "hidden" }}>
      {/* Title */}
      <div style={{ position: "absolute", top: 30, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <SectionTitle title={d.title} delay={8} />
      </div>

      <svg width={W} height={H} style={{ position: "absolute", top: 0, left: 0 }}>
        <defs>
          {d.bars.map((bar: any, i: number) => (
            <linearGradient key={`grad-${i}`} id={`barGrad-${i}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={bar.color === "#ef233c" ? PAL.rose : PAL.blue} stopOpacity={1} />
              <stop offset="100%" stopColor={bar.color === "#ef233c" ? "#c026d3" : PAL.blueDeep} stopOpacity={0.8} />
            </linearGradient>
          ))}
          <filter id="barGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Grid lines with labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
          const y = pad.top + plotH * (1 - pct);
          const val = Math.round(d.maxValue * pct);
          const gridOpacity = interpolate(frame, [10 + i * 3, 20 + i * 3], [0, 1], { extrapolateRight: "clamp" });
          return (
            <g key={`grid-${i}`} opacity={gridOpacity}>
              <line x1={pad.left} y1={y} x2={W - pad.right} y2={y} stroke={PAL.grid} strokeWidth={1} strokeDasharray="4 4" />
              <text x={pad.left - 12} y={y + 5} textAnchor="end" fill={PAL.textDim} fontSize={13} fontFamily={MONO}>
                {val}
              </text>
            </g>
          );
        })}

        {/* Y-axis label */}
        <text x={20} y={H / 2} textAnchor="middle" fill={PAL.textDim} fontSize={12} fontFamily={FONT}
          transform={`rotate(-90 20 ${H / 2})`}>
          {d.yAxisLabel}
        </text>

        {/* Bars */}
        {d.bars.map((bar: any, i: number) => {
          const barX = pad.left + slotW * i + (slotW - barW) / 2;
          const targetH = (bar.value / d.maxValue) * plotH;
          const stagger = i * 10;
          const barH = interpolate(frame, [20 + stagger, 50 + stagger], [0, targetH], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          });
          const barY = pad.top + plotH - barH;

          // Label animations
          const labelOp = interpolate(frame, [35 + stagger, 45 + stagger], [0, 1], { extrapolateRight: "clamp" });
          const valueOp = interpolate(frame, [40 + stagger, 55 + stagger], [0, 1], { extrapolateRight: "clamp" });
          const valueScale = spring({ frame: frame - 40 - stagger, fps, config: { damping: 12 }, from: 0.5, to: 1 });

          // Glow opacity for the last bar (highlight)
          const isHighlight = bar.color === "#ef233c";
          const glowOp = interpolate(frame, [30 + stagger, 50 + stagger], [0, isHighlight ? 0.6 : 0.3], { extrapolateRight: "clamp" });

          return (
            <g key={`bar-${i}`}>
              {/* Glow behind bar */}
              <rect x={barX - 8} y={barY - 8} width={barW + 16} height={barH + 8} rx={8}
                fill={bar.color === "#ef233c" ? PAL.rose : PAL.blue} opacity={glowOp} filter="url(#barGlow)" />
              {/* Bar */}
              <rect x={barX} y={barY} width={barW} height={barH} rx={6}
                fill={`url(#barGrad-${i})`} />
              {/* Top highlight line */}
              <rect x={barX} y={barY} width={barW} height={3} rx={2}
                fill={bar.color === "#ef233c" ? "#ff6b8a" : "#33dfff"} opacity={valueOp} />
              {/* Value label */}
              <g opacity={valueOp} transform={`translate(${barX + barW / 2}, ${barY - 16}) scale(${valueScale})`}>
                <text textAnchor="middle" fill={isHighlight ? PAL.rose : PAL.white} fontSize={18} fontWeight={700} fontFamily={MONO}>
                  {bar.value}
                </text>
              </g>
              {/* X-axis label */}
              <text x={barX + barW / 2} y={pad.top + plotH + 28} textAnchor="middle"
                fill={PAL.textMid} fontSize={14} fontWeight={500} fontFamily={FONT} opacity={labelOp}>
                {bar.label}
              </text>
            </g>
          );
        })}
      </svg>
    </GlassCard>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// LINE CHART — Gradient area fill, glowing points, smooth draw animation
// ═══════════════════════════════════════════════════════════════════════════════

const LineChart: React.FC<{ data: any }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const d = data;
  const W = 620;
  const H = 820;
  const pad = { top: 100, right: 50, bottom: 80, left: 70 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const xScale = (i: number) => pad.left + (i / (d.points.length - 1)) * plotW;
  const yScale = (y: number) => pad.top + plotH - (y / d.maxValue) * plotH;

  const linePoints = d.points.map((p: any, i: number) => ({ x: xScale(i), y: yScale(p.value) }));
  const polylineStr = linePoints.map((p: any) => `${p.x},${p.y}`).join(" ");

  // Area path
  const areaPath = `M ${linePoints[0].x} ${pad.top + plotH} ` +
    linePoints.map((p: any) => `L ${p.x} ${p.y}`).join(" ") +
    ` L ${linePoints[linePoints.length - 1].x} ${pad.top + plotH} Z`;

  // Calculate total polyline length
  let totalLen = 0;
  for (let i = 1; i < linePoints.length; i++) {
    const dx = linePoints[i].x - linePoints[i - 1].x;
    const dy = linePoints[i].y - linePoints[i - 1].y;
    totalLen += Math.sqrt(dx * dx + dy * dy);
  }

  const drawProgress = interpolate(frame, [15, 80], [0, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const dashOffset = totalLen * (1 - drawProgress);
  const areaClipW = plotW * drawProgress;

  const lineColor = d.lineColor === "#ef233c" ? PAL.rose : PAL.blue;
  const lineColorDeep = d.lineColor === "#ef233c" ? "#c026d3" : PAL.blueDeep;

  return (
    <GlassCard width={W} height={H} delay={5} style={{ position: "relative", overflow: "hidden" }}>
      {/* Title */}
      <div style={{ position: "absolute", top: 30, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <SectionTitle title={d.title} delay={8} />
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

        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
          const y = pad.top + plotH * (1 - pct);
          const gridOp = interpolate(frame, [10 + i * 3, 20 + i * 3], [0, 1], { extrapolateRight: "clamp" });
          return (
            <g key={`grid-${i}`} opacity={gridOp}>
              <line x1={pad.left} y1={y} x2={W - pad.right} y2={y} stroke={PAL.grid} strokeWidth={1} strokeDasharray="4 4" />
              <text x={pad.left - 12} y={y + 5} textAnchor="end" fill={PAL.textDim} fontSize={13} fontFamily={MONO}>
                {Math.round(d.maxValue * pct)}
              </text>
            </g>
          );
        })}

        {/* Axes */}
        <line x1={pad.left} y1={pad.top + plotH} x2={W - pad.right} y2={pad.top + plotH} stroke={PAL.axis} strokeWidth={1.5} opacity={interpolate(frame, [10, 20], [0, 1], { extrapolateRight: "clamp" })} />
        <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + plotH} stroke={PAL.axis} strokeWidth={1.5} opacity={interpolate(frame, [10, 20], [0, 1], { extrapolateRight: "clamp" })} />

        {/* Area fill (clipped to draw progress) */}
        <path d={areaPath} fill="url(#areaGrad)" clipPath="url(#areaClip)" />

        {/* Animated line */}
        <polyline
          points={polylineStr}
          fill="none"
          stroke="url(#lineGrad)"
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={totalLen}
          strokeDashoffset={dashOffset}
        />

        {/* Data points with glow */}
        {d.points.map((p: any, i: number) => {
          const ptProg = interpolate(frame, [20 + i * 15, 28 + i * 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const labelOp = interpolate(frame, [28 + i * 15, 36 + i * 15], [0, 1], { extrapolateRight: "clamp" });
          const labelScale = spring({ frame: frame - 28 - i * 15, fps, config: { damping: 12 }, from: 0.5, to: 1 });
          return (
            <g key={`pt-${i}`}>
              {/* Glow */}
              <circle cx={xScale(i)} cy={yScale(p.value)} r={12 * ptProg} fill={lineColor} opacity={ptProg * 0.3} filter="url(#pointGlow)" />
              {/* Point */}
              <circle cx={xScale(i)} cy={yScale(p.value)} r={7 * ptProg} fill={PAL.bg1} stroke={lineColor} strokeWidth={3} opacity={ptProg} />
              {/* Value label */}
              <g opacity={labelOp} transform={`translate(${xScale(i)}, ${yScale(p.value) - 22}) scale(${labelScale})`}>
                <rect x={-28} y={-14} width={56} height={24} rx={6} fill={PAL.glass} stroke={PAL.glassBorder} />
                <text textAnchor="middle" y={3} fill={PAL.white} fontSize={14} fontWeight={700} fontFamily={MONO}>
                  {p.value}
                </text>
              </g>
              {/* X-axis label */}
              <text x={xScale(i)} y={pad.top + plotH + 28} textAnchor="middle" fill={PAL.textMid} fontSize={14} fontWeight={500} fontFamily={FONT} opacity={labelOp}>
                {p.label}
              </text>
            </g>
          );
        })}

        {/* Y-axis label */}
        <text x={20} y={H / 2} textAnchor="middle" fill={PAL.textDim} fontSize={12} fontFamily={FONT}
          transform={`rotate(-90 20 ${H / 2})`}>
          {d.yAxisLabel}
        </text>
      </svg>
    </GlassCard>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// PIE CHART — Glowing segments, glassmorphic legend cards, center stat
// ═══════════════════════════════════════════════════════════════════════════════

const PieChart: React.FC<{ data: any }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const d = data;
  const total = d.segments.reduce((s: number, seg: any) => s + seg.value, 0);
  const svgSize = 460;
  const cx = svgSize / 2;
  const cy = svgSize / 2;
  const radius = 150;
  const circumference = 2 * Math.PI * radius;

  let cumulativeOffset = 0;

  return (
    <GlassCard width={620} height={920} delay={5} style={{ position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center" }}>
      {/* Title */}
      <div style={{ marginTop: 35, display: "flex", justifyContent: "center", width: "100%" }}>
        <SectionTitle title={d.title} delay={8} />
      </div>

      {/* Pie SVG */}
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

        {/* Background ring */}
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke={PAL.grid} strokeWidth={90} />

        {/* Segments */}
        {d.segments.map((seg: any, i: number) => {
          const segLen = (seg.value / total) * circumference;
          const currentOff = cumulativeOffset;
          cumulativeOffset += segLen;
          const prog = interpolate(frame, [15 + i * 15, 35 + i * 15], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp", easing: Easing.out(Easing.cubic) });
          const animLen = segLen * prog;
          return (
            <g key={`seg-${i}`}>
              {/* Glow */}
              <circle cx={cx} cy={cy} r={radius} fill="none" stroke={seg.color} strokeWidth={92}
                strokeDasharray={`${animLen} ${circumference - animLen}`}
                strokeDashoffset={-currentOff}
                transform={`rotate(-90 ${cx} ${cy})`}
                opacity={0.3} filter="url(#pieGlow)" />
              {/* Main segment */}
              <circle cx={cx} cy={cy} r={radius} fill="none" stroke={seg.color} strokeWidth={88}
                strokeDasharray={`${animLen} ${circumference - animLen}`}
                strokeDashoffset={-currentOff}
                transform={`rotate(-90 ${cx} ${cy})`}
                strokeLinecap="round" />
            </g>
          );
        })}

        {/* Center circle with glass effect */}
        <circle cx={cx} cy={cy} r={72} fill={PAL.bg1} stroke={PAL.glassBorder} strokeWidth={1} />
        <circle cx={cx} cy={cy} r={72} fill={PAL.glass} />

        {/* Center text */}
        <text x={cx} y={cy - 5} textAnchor="middle" fill={PAL.white} fontSize={36} fontWeight={800} fontFamily={MONO}>
          {total}%
        </text>
        <text x={cx} y={cy + 18} textAnchor="middle" fill={PAL.textDim} fontSize={12} fontFamily={FONT}>
          Total
        </text>
      </svg>

      {/* Legend — glassmorphic cards */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", marginTop: 5, maxWidth: 560, padding: "0 20px" }}>
        {d.segments.map((seg: any, i: number) => {
          const legOp = spring({ frame: frame - 20 - i * 12, fps, from: 0, to: 1, config: { damping: 14 } });
          const legY = spring({ frame: frame - 20 - i * 12, fps, from: 15, to: 0, config: { damping: 14 } });
          return (
            <div key={`leg-${i}`} style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 16px",
              borderRadius: 12,
              background: PAL.glass,
              border: `1px solid ${PAL.glassBorder}`,
              opacity: legOp,
              transform: `translateY(${legY}px)`,
            }}>
              <div style={{
                width: 16, height: 16, borderRadius: 5,
                backgroundColor: seg.color,
                boxShadow: `0 0 12px ${seg.color}80`,
              }} />
              <span style={{ color: PAL.textBright, fontSize: 15, fontWeight: 500, fontFamily: FONT }}>{seg.label}</span>
              <span style={{ color: PAL.textMid, fontSize: 15, fontWeight: 700, fontFamily: MONO }}>{seg.value}%</span>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ANIMATED LIST — Glassmorphic cards with gradient icons, smooth slide-in
// ═══════════════════════════════════════════════════════════════════════════════

const AnimatedListScene: React.FC<{ data: any }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const d = data;
  const iconGradients: Record<number, string> = {
    0: `linear-gradient(135deg, ${PAL.blue}, ${PAL.blueDeep})`,
    1: `linear-gradient(135deg, ${PAL.purple}, ${PAL.pink})`,
    2: `linear-gradient(135deg, ${PAL.emerald}, #059669)`,
  };

  return (
    <div style={{ width: 620, display: "flex", flexDirection: "column", alignItems: "center" }}>
      {/* Title */}
      <div style={{ marginBottom: 50, display: "flex", justifyContent: "center" }}>
        <SectionTitle title={d.title} delay={3} />
      </div>

      {d.items.map((item: any, i: number) => {
        const delay = 10 + i * 18;
        const slideX = spring({ frame: frame - delay, fps, from: -150, to: 0, config: { damping: 13, mass: 0.7, stiffness: 90 } });
        const opacity = spring({ frame: frame - delay, fps, from: 0, to: 1, config: { damping: 14 } });
        const scale = spring({ frame: frame - delay, fps, from: 0.85, to: 1, config: { damping: 13, mass: 0.6 } });
        const iconScale = spring({ frame: frame - delay - 5, fps, from: 0, to: 1, config: { damping: 10, stiffness: 100 } });

        return (
          <div key={i} style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            marginBottom: 20,
            padding: "20px 24px",
            borderRadius: 18,
            background: PAL.glass,
            border: `1px solid ${PAL.glassBorder}`,
            boxShadow: `0 4px 20px rgba(0,0,0,0.3), inset 0 1px 0 ${PAL.glassHighlight}`,
            backdropFilter: "blur(12px)",
            transform: `translateX(${slideX}px) scale(${scale})`,
            opacity,
            width: 560,
          }}>
            {/* Icon with gradient */}
            <div style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: iconGradients[i] || iconGradients[0],
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              transform: `scale(${iconScale})`,
              boxShadow: `0 4px 16px rgba(0,0,0,0.3)`,
            }}>
              <span style={{ color: PAL.white, fontSize: 28, fontWeight: 800, fontFamily: MONO }}>{i + 1}</span>
            </div>
            {/* Text */}
            <div style={{ flex: 1 }}>
              <div style={{
                color: PAL.white,
                fontSize: 24,
                fontWeight: 700,
                fontFamily: FONT,
                marginBottom: 4,
                letterSpacing: "-0.3px",
              }}>{item.name}</div>
              <div style={{
                color: PAL.textMid,
                fontSize: 16,
                fontWeight: 400,
                fontFamily: FONT,
              }}>{item.description}</div>
            </div>
            {/* Arrow indicator */}
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: PAL.glass,
              border: `1px solid ${PAL.glassBorder}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              opacity: spring({ frame: frame - delay - 10, fps, from: 0, to: 1, config: { damping: 14 } }),
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M9 6l6 6-6 6" stroke={PAL.textMid} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// CIRCULAR PROGRESS — Gradient ring, glowing, animated counter, pulsing aura
// ═══════════════════════════════════════════════════════════════════════════════

const CircularProgressScene: React.FC<{ data: any }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const d = data;
  const radius = 100;
  const circumference = 2 * Math.PI * radius;
  const targetPct = d.percentage;
  const progress = interpolate(frame, [15, 70], [0, targetPct], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  // Pulsing aura
  const pulse = 1 + Math.sin(frame / 18) * 0.04;
  const auraOpacity = 0.15 + Math.sin(frame / 20) * 0.05;

  const ringColor = d.color === "#ef233c" ? PAL.rose : PAL.blue;
  const ringColorEnd = d.color === "#ef233c" ? "#fb7185" : PAL.blueDeep;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      {/* Title */}
      <div style={{ marginBottom: 50, display: "flex", justifyContent: "center" }}>
        <SectionTitle title={d.title} delay={3} />
      </div>

      {/* Ring */}
      <div style={{ position: "relative", width: 360, height: 360, transform: `scale(${pulse})` }}>
        {/* Aura glow */}
        <div style={{
          position: "absolute", inset: -30, borderRadius: "50%",
          background: `radial-gradient(circle, ${ringColor}${Math.round(auraOpacity * 255).toString(16).padStart(2, "0")} 0%, transparent 70%)`,
          filter: "blur(20px)",
        }} />

        <svg width="100%" height="100%" viewBox="0 0 220 220" style={{ position: "absolute" }}>
          <defs>
            <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={ringColor} />
              <stop offset="100%" stopColor={ringColorEnd} />
            </linearGradient>
            <filter id="ringGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Background ring */}
          <circle cx="110" cy="110" r={radius} fill="none" stroke={PAL.grid} strokeWidth={16} />

          {/* Progress ring glow */}
          <circle cx="110" cy="110" r={radius} fill="none" stroke={ringColor} strokeWidth={18}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            transform="rotate(-90 110 110)"
            opacity={0.3}
            filter="url(#ringGlow)" />

          {/* Progress ring */}
          <circle cx="110" cy="110" r={radius} fill="none" stroke="url(#ringGrad)" strokeWidth={14}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            transform="rotate(-90 110 110)" />
        </svg>

        {/* Center content */}
        <div style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          display: "flex", flexDirection: "column", alignItems: "center",
        }}>
          <AnimatedNumber
            value={progress}
            decimals={0}
            suffix="%"
            fontSize={64}
            color={PAL.white}
          />
          <span style={{
            fontSize: 18, fontWeight: 500, color: PAL.textMid,
            fontFamily: FONT, marginTop: 6,
          }}>{d.sublabel}</span>
        </div>
      </div>

      {/* Sublabel text below */}
      <div style={{
        marginTop: 40, fontSize: 20, fontWeight: 400, color: PAL.textMid,
        textAlign: "center", maxWidth: 500, fontFamily: FONT,
        opacity: interpolate(frame, [50, 65], [0, 1], { extrapolateRight: "clamp" }),
      }}>
        {d.label}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// TITLE CARD — Cinematic with animated gradient, floating particles
// ═══════════════════════════════════════════════════════════════════════════════

const TitleCard: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const titleScale = spring({ frame, fps, from: 0.7, to: 1, durationInFrames: 50, config: { damping: 12, mass: 0.8, stiffness: 80 } });
  const titleOpacity = spring({ frame, fps, from: 0, to: 1, durationInFrames: 30, config: { damping: 16 } });
  const underlineW = interpolate(frame, [25, 60], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const subOpacity = interpolate(frame, [45, 70], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const subY = interpolate(frame, [45, 70], [20, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const exitOp = interpolate(frame, [durationInFrames - 20, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Floating particles
  const particles = Array.from({ length: 12 }, (_, i) => ({
    x: (i * 67) % 720,
    y: ((i * 131) % 1280),
    speed: 0.3 + (i % 3) * 0.2,
    size: 2 + (i % 3),
    delay: i * 5,
  }));

  return (
    <AbsoluteFill style={{ opacity: exitOp }}>
      <AnimatedBackground variant="cool" />

      {/* Floating particles */}
      {particles.map((p, i) => {
        const py = (p.y - frame * p.speed) % 1280;
        const pOp = interpolate(frame, [p.delay, p.delay + 20], [0, 0.4], { extrapolateRight: "clamp" });
        return (
          <div key={i} style={{
            position: "absolute",
            left: p.x, top: py < 0 ? py + 1280 : py,
            width: p.size, height: p.size,
            borderRadius: "50%",
            background: PAL.blue,
            opacity: pOp,
            boxShadow: `0 0 ${p.size * 3}px ${PAL.blue}`,
          }} />
        );
      })}

      <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        {/* Decorative top line */}
        <div style={{
          width: 40, height: 3, borderRadius: 2,
          background: `linear-gradient(90deg, transparent, ${PAL.blue}, transparent)`,
          marginBottom: 30,
          opacity: titleOpacity,
        }} />

        {/* Title */}
        <h1 style={{
          fontFamily: FONT,
          fontSize: 48,
          fontWeight: 800,
          background: `linear-gradient(135deg, ${PAL.white} 0%, ${PAL.blue} 60%, ${PAL.purple} 100%)`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          margin: 0,
          textAlign: "center",
          padding: "0 40px",
          letterSpacing: "-1px",
          lineHeight: 1.15,
          opacity: titleOpacity,
          transform: `scale(${titleScale})`,
        }}>
          {title}
        </h1>

        {/* Underline */}
        <div style={{
          width: `${underlineW}%`,
          maxWidth: 280,
          height: 3,
          background: `linear-gradient(90deg, ${PAL.blue}, ${PAL.purple})`,
          borderRadius: 2,
          marginTop: 20,
          boxShadow: `0 0 12px ${PAL.blue}80`,
        }} />

        {/* Subtitle */}
        <p style={{
          fontFamily: FONT,
          fontSize: 20,
          fontWeight: 400,
          color: PAL.textMid,
          margin: 0,
          marginTop: 24,
          letterSpacing: "2px",
          textTransform: "uppercase",
          opacity: subOpacity,
          transform: `translateY(${subY}px)`,
        }}>
          {subtitle}
        </p>

        {/* Decorative bottom line */}
        <div style={{
          width: 40, height: 3, borderRadius: 2,
          background: `linear-gradient(90deg, transparent, ${PAL.purple}, transparent)`,
          marginTop: 30,
          opacity: subOpacity,
        }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// END CARD — Modern glassmorphic with gradient CTA
// ═══════════════════════════════════════════════════════════════════════════════

const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const scale = spring({ frame, fps, from: 0.85, to: 1, durationInFrames: 40, config: { damping: 12, mass: 0.6, stiffness: 90 } });
  const opacity = spring({ frame, fps, from: 0, to: 1, durationInFrames: 30, config: { damping: 16 } });
  const glowPulse = interpolate(Math.sin(frame * 0.06), [-1, 1], [0.3, 0.7]);
  const btnOp = spring({ frame: Math.max(0, frame - 25), fps, from: 0, to: 1, durationInFrames: 30, config: { damping: 14 } });
  const btnScale = spring({ frame: Math.max(0, frame - 25), fps, from: 0.8, to: 1, durationInFrames: 30, config: { damping: 12 } });
  const exitOp = interpolate(frame, [durationInFrames - 20, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ opacity: exitOp }}>
      <AnimatedBackground variant="cool" />

      <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{
          transform: `scale(${scale})`,
          opacity,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: 50,
          borderRadius: 24,
          border: `1px solid rgba(0, 212, 255, ${glowPulse})`,
          boxShadow: `0 0 50px rgba(0, 212, 255, ${glowPulse * 0.25}), 0 8px 32px rgba(0,0,0,0.4)`,
          background: PAL.glass,
          backdropFilter: "blur(20px)",
        }}>
          {/* Icon */}
          <div style={{
            width: 60, height: 60, borderRadius: 16,
            background: `linear-gradient(135deg, ${PAL.blue}, ${PAL.purple})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            marginBottom: 24,
            boxShadow: `0 4px 20px ${PAL.blue}40`,
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="white" strokeWidth="2" strokeLinejoin="round" />
              <path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2" strokeLinejoin="round" />
            </svg>
          </div>

          <h1 style={{
            fontFamily: FONT,
            fontSize: 36,
            fontWeight: 800,
            background: `linear-gradient(135deg, ${PAL.white} 0%, ${PAL.blue} 100%)`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            margin: 0,
            textAlign: "center",
            letterSpacing: "-0.5px",
          }}>
            Thanks for Watching
          </h1>

          {/* CTA button */}
          <div style={{
            marginTop: 32,
            padding: "16px 44px",
            background: `linear-gradient(135deg, ${PAL.blue}, ${PAL.purple})`,
            borderRadius: 12,
            opacity: btnOp,
            transform: `scale(${btnScale})`,
            boxShadow: `0 4px 20px ${PAL.blue}40`,
          }}>
            <span style={{
              color: PAL.white,
              fontSize: 18,
              fontWeight: 600,
              fontFamily: FONT,
              letterSpacing: "0.5px",
            }}>
              Learn More About Economics
            </span>
          </div>

          <p style={{
            color: PAL.textDim,
            fontSize: 14,
            marginTop: 28,
            letterSpacing: "1.5px",
            textTransform: "uppercase",
            fontFamily: FONT,
            margin: 0,
          }}>
            Stay Informed
          </p>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPOSITION
// ═══════════════════════════════════════════════════════════════════════════════

export const EconomyDocumentary: React.FC = () => {
  const cfg = config as any;

  const sceneSequences = cfg.scenes.map((s: any) => {
    const dataStr = JSON.stringify(s.data);
    return `      <Sequence from={${s.startFrame}} durationInFrames={${s.durationFrames}}>
        <SceneWrapper template="${s.template}" data={${dataStr}} />
      </Sequence>`;
  }).join("\n");

  return (
    <AbsoluteFill style={{ backgroundColor: PAL.bg0, fontFamily: FONT }}>
      <Audio src={staticFile("narration.wav")} />

      <Sequence from={cfg.titleCard.startFrame} durationInFrames={cfg.titleCard.endFrame - cfg.titleCard.startFrame}>
        <TitleCard title={cfg.titleCard.title} subtitle={cfg.titleCard.subtitle} />
      </Sequence>

      {cfg.scenes.map((s: any) => (
        <Sequence key={s.id} from={s.startFrame} durationInFrames={s.durationFrames}>
          <SceneWrapper template={s.template} data={s.data} />
        </Sequence>
      ))}

      <Sequence from={cfg.endCard.startFrame} durationInFrames={cfg.endCard.endFrame - cfg.endCard.startFrame}>
        <EndCard />
      </Sequence>
    </AbsoluteFill>
  );
};
