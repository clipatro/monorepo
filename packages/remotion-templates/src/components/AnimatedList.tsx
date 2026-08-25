/**
 * AnimatedList — glassmorphic cards with gradient icons and smooth slide-in.
 */
import React from "react";
import { useCurrentFrame, useVideoConfig, spring } from "remotion";
import type { ThemeConfig } from "../themes/index.ts";
import { SectionTitle } from "../primitives/SectionTitle.tsx";

export interface AnimatedListData {
  title: string;
  items: Array<{ name: string; description: string; color?: string }>;
}

interface Props {
  data: AnimatedListData;
  theme?: ThemeConfig;
  delay?: number;
}

export const AnimatedList: React.FC<Props> = ({ data, theme, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = theme;

  const d = data;
  const chartColors = t?.chartColors ?? ["#00d4ff", "#a855f7", "#10b981"];
  const glassBg = t?.glass?.bg ?? "rgba(255,255,255,0.04)";
  const glassBorder = t?.glass?.border ?? "rgba(255,255,255,0.08)";
  const glassHighlight = t?.glass?.highlight ?? "rgba(255,255,255,0.06)";
  const textBright = t?.text?.bright ?? "#ffffff";
  const textMid = t?.text?.mid ?? "rgba(255,255,255,0.65)";
  const sansFont = t?.fonts?.sans ?? "Inter, sans-serif";
  const monoFont = t?.fonts?.mono ?? "'SF Mono', monospace";

  const iconGradients = (i: number) => {
    const c = chartColors[i % chartColors.length];
    const c2 = chartColors[(i + 1) % chartColors.length];
    return `linear-gradient(135deg, ${c}, ${c2})`;
  };

  return (
    <div style={{ width: 620, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ marginBottom: 50, display: "flex", justifyContent: "center" }}>
        <SectionTitle title={d.title} delay={delay + 3} theme={t} />
      </div>

      {d.items.map((item, i) => {
        const itemDelay = delay + 10 + i * 18;
        const slideX = spring({ frame: frame - itemDelay, fps, from: -150, to: 0, config: { damping: 13, mass: 0.7, stiffness: 90 } });
        const opacity = spring({ frame: frame - itemDelay, fps, from: 0, to: 1, config: { damping: 14 } });
        const scale = spring({ frame: frame - itemDelay, fps, from: 0.85, to: 1, config: { damping: 13, mass: 0.6 } });
        const iconScale = spring({ frame: frame - itemDelay - 5, fps, from: 0, to: 1, config: { damping: 10, stiffness: 100 } });

        return (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 20, marginBottom: 20,
            padding: "20px 24px", borderRadius: t?.radius?.lg ?? 18,
            background: glassBg, border: `1px solid ${glassBorder}`,
            boxShadow: `0 4px 20px rgba(0,0,0,0.3), inset 0 1px 0 ${glassHighlight}`,
            backdropFilter: "blur(12px)",
            transform: `translateX(${slideX}px) scale(${scale})`,
            opacity, width: 560,
          }}>
            <div style={{
              width: 64, height: 64, borderRadius: t?.radius?.md ?? 12,
              background: iconGradients(i),
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, transform: `scale(${iconScale})`,
              boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
            }}>
              <span style={{ color: textBright, fontSize: 28, fontWeight: 800, fontFamily: monoFont }}>{i + 1}</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: textBright, fontSize: 24, fontWeight: 700, fontFamily: sansFont, marginBottom: 4, letterSpacing: "-0.3px" }}>
                {item.name}
              </div>
              <div style={{ color: textMid, fontSize: 16, fontWeight: 400, fontFamily: sansFont }}>
                {item.description}
              </div>
            </div>
            <div style={{
              width: 32, height: 32, borderRadius: t?.radius?.sm ?? 8,
              background: glassBg, border: `1px solid ${glassBorder}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              opacity: spring({ frame: frame - itemDelay - 10, fps, from: 0, to: 1, config: { damping: 14 } }),
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M9 6l6 6-6 6" stroke={textMid} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        );
      })}
    </div>
  );
};
