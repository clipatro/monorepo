/**
 * CircularProgress — animated progress ring with glow, animated counter.
 */
import React from "react";
import { useCurrentFrame, interpolate, Easing } from "remotion";
import type { ThemeConfig } from "../themes/index.ts";
import { SectionTitle } from "../primitives/SectionTitle.tsx";
import { AnimatedNumber } from "../primitives/AnimatedNumber.tsx";

export interface CircularProgressData {
  title: string;
  percentage: number;
  label: string;
  sublabel: string;
  color?: string;
}

interface Props {
  data: CircularProgressData;
  theme?: ThemeConfig;
  delay?: number;
}

export const CircularProgress: React.FC<Props> = ({ data, theme, delay = 0 }) => {
  const frame = useCurrentFrame();
  const t = theme;

  const d = data;
  const radius = 100;
  const circumference = 2 * Math.PI * radius;
  const progress = interpolate(frame, [delay + 15, delay + 70], [0, d.percentage], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  const pulse = 1 + Math.sin(frame / 18) * 0.04;
  const auraOpacity = 0.15 + Math.sin(frame / 20) * 0.05;

  const ringColor = d.color ?? t?.accents?.primary ?? "#00d4ff";
  const ringColorEnd = d.color === "#ef233c" ? "#fb7185" : (t?.accents?.primaryDeep ?? "#0099ff");
  const grid = t?.chart?.grid ?? "rgba(255,255,255,0.06)";
  const textBright = t?.text?.bright ?? "#ffffff";
  const textMid = t?.text?.mid ?? "rgba(255,255,255,0.65)";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ marginBottom: 50, display: "flex", justifyContent: "center" }}>
        <SectionTitle title={d.title} delay={delay + 3} theme={t} />
      </div>

      <div style={{ position: "relative", width: 360, height: 360, transform: `scale(${pulse})` }}>
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

          <circle cx="110" cy="110" r={radius} fill="none" stroke={grid} strokeWidth={16} />
          <circle cx="110" cy="110" r={radius} fill="none" stroke={ringColor} strokeWidth={18}
            strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
            strokeLinecap="round" transform="rotate(-90 110 110)" opacity={0.3} filter="url(#ringGlow)" />
          <circle cx="110" cy="110" r={radius} fill="none" stroke="url(#ringGrad)" strokeWidth={14}
            strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
            strokeLinecap="round" transform="rotate(-90 110 110)" />
        </svg>

        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <AnimatedNumber value={progress} decimals={0} suffix="%" fontSize={64} color={textBright} theme={t} />
          <span style={{ fontSize: 18, fontWeight: 500, color: textMid, fontFamily: t?.fonts?.sans ?? "Inter, sans-serif", marginTop: 6 }}>
            {d.sublabel}
          </span>
        </div>
      </div>

      <div style={{
        marginTop: 40, fontSize: 20, fontWeight: 400, color: textMid,
        textAlign: "center", maxWidth: 500, fontFamily: t?.fonts?.sans ?? "Inter, sans-serif",
        opacity: interpolate(frame, [delay + 50, delay + 65], [0, 1], { extrapolateRight: "clamp" }),
      }}>
        {d.label}
      </div>
    </div>
  );
};
