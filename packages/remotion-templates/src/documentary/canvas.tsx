import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { ThemeConfig } from "../themes/index.ts";
import { StoryIcon, type StoryIconName } from "../primitives/StoryIcon.tsx";

export interface DocumentaryTokens {
  accent: string;
  accentDeep: string;
  secondary: string;
  success: string;
  warning: string;
  danger: string;
  bright: string;
  mid: string;
  dim: string;
  base: string;
  surface: string;
  elevated: string;
  glass: string;
  border: string;
  display: string;
  serif: string;
  sans: string;
  mono: string;
  radius: number;
  shadow: string;
  chartColors: string[];
}

export interface DocumentaryImageData {
  imageUrl?: string;
  imageAlt?: string;
  imageFocalPoint?: string;
  imageTreatment?: "clean" | "documentary" | "archive" | "monochrome";
}

export const getDocumentaryTokens = (theme?: ThemeConfig): DocumentaryTokens => ({
  accent: theme?.accents?.primary ?? "#e85d3f",
  accentDeep: theme?.accents?.primaryDeep ?? "#a93621",
  secondary: theme?.accents?.secondary ?? "#d8b25c",
  success: theme?.accents?.success ?? "#4d8b6a",
  warning: theme?.accents?.warning ?? "#d79032",
  danger: theme?.accents?.danger ?? "#c84032",
  bright: theme?.text?.bright ?? "#f3efe7",
  mid: theme?.text?.mid ?? "rgba(243,239,231,0.72)",
  dim: theme?.text?.dim ?? "rgba(243,239,231,0.46)",
  base: theme?.bg?.base ?? "#10100f",
  surface: theme?.bg?.surface ?? "#191917",
  elevated: theme?.bg?.elevated ?? "#25231f",
  glass: theme?.glass?.bg ?? "rgba(243,239,231,0.06)",
  border: theme?.glass?.border ?? "rgba(243,239,231,0.18)",
  display: theme?.fonts?.display ?? "'League Gothic', 'Arial Narrow', sans-serif",
  serif: theme?.fonts?.serif ?? "Georgia, 'Times New Roman', serif",
  sans: theme?.fonts?.sans ?? "Montserrat, Helvetica, sans-serif",
  mono: theme?.fonts?.mono ?? "'IBM Plex Mono', monospace",
  radius: Math.min(theme?.radius?.md ?? 10, 12),
  shadow: theme?.shadows?.card ?? "12px 16px 0 rgba(0,0,0,0.32)",
  chartColors: theme?.chartColors?.length ? theme.chartColors : ["#e85d3f", "#d8b25c", "#4d8b6a", "#6489a6"],
});

interface CanvasProps {
  children: React.ReactNode;
  theme?: ThemeConfig;
  delay?: number;
  eyebrow?: string;
  footer?: string;
  variant?: "default" | "cool" | "warm" | "paper";
  icon?: StoryIconName;
  edition?: string;
  contentStyle?: React.CSSProperties;
}

export const DocumentaryCanvas: React.FC<CanvasProps> = ({
  children,
  theme,
  delay = 0,
  eyebrow,
  footer,
  variant = "default",
  icon,
  edition,
  contentStyle,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = getDocumentaryTokens(theme);
  const entrance = spring({ frame: frame - delay - 4, fps, from: 0, to: 1, config: { damping: 18, mass: 0.75, stiffness: 105 } });
  const exit = interpolate(frame, [Math.max(0, durationInFrames - 10), durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.quad) });
  const canvasBg = variant === "paper" ? t.bright : t.base;
  const canvasFg = variant === "paper" ? t.base : t.bright;

  return (
    <AbsoluteFill style={{ background: canvasBg, color: canvasFg, fontFamily: t.sans, overflow: "hidden", opacity: exit }}>
      {/* Subtle paper texture — very faint, doesn't distract */}
      <div style={{ position: "absolute", inset: 0, opacity: variant === "paper" ? 0.05 : 0.06, backgroundImage: `repeating-linear-gradient(0deg, transparent 0 5px, ${variant === "paper" ? t.base : t.bright} 6px)` }} />

      {/* Eyebrow label only — no icon, no edition, no dot. Only if explicitly provided. */}
      {eyebrow && (
        <div style={{ position: "absolute", top: 48, left: 48, right: 48, display: "flex", alignItems: "center", opacity: entrance * 0.8 }}>
          <div style={{ fontFamily: t.mono, fontSize: 14, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: variant === "paper" ? `${t.base}aa` : t.mid }}>
            {eyebrow}
          </div>
        </div>
      )}

      {/* Content area — extra bottom space for captions */}
      <div style={{ position: "absolute", inset: "80px 48px 120px 48px", display: "flex", flexDirection: "column", justifyContent: "center", ...contentStyle }}>
        {children}
      </div>

      {/* Footer — only if explicitly provided. No corner bracket. */}
      {footer && (
        <div style={{ position: "absolute", left: 48, right: 48, bottom: 36, opacity: entrance * 0.5 }}>
          <div style={{ fontFamily: t.mono, fontSize: 12, fontWeight: 600, letterSpacing: 1.3, textTransform: "uppercase", color: variant === "paper" ? `${t.base}88` : t.dim, maxWidth: 430, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{footer}</div>
        </div>
      )}
    </AbsoluteFill>
  );
};

interface RevealProps {
  children: React.ReactNode;
  delay?: number;
  direction?: "up" | "left" | "right" | "scale" | "wipe";
  style?: React.CSSProperties;
}

export const DocumentaryReveal: React.FC<RevealProps> = ({ children, delay = 0, direction = "up", style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({ frame: frame - delay, fps, from: 0, to: 1, config: { damping: direction === "scale" ? 13 : 19, mass: 0.7, stiffness: direction === "scale" ? 125 : 110 } });
  const x = direction === "left" ? (1 - progress) * -90 : direction === "right" ? (1 - progress) * 90 : 0;
  const y = direction === "up" ? (1 - progress) * 50 : 0;
  const scale = direction === "scale" ? 0.78 + progress * 0.22 : 1;
  const clipPath = direction === "wipe" ? `inset(0 ${100 - progress * 100}% 0 0)` : undefined;
  return <div style={{ opacity: progress, transform: `translate3d(${x}px, ${y}px, 0) scale(${scale})`, clipPath, ...style }}>{children}</div>;
};

interface PanelProps {
  children: React.ReactNode;
  theme?: ThemeConfig;
  style?: React.CSSProperties;
  accent?: string;
  tone?: "ink" | "paper" | "accent";
}

export const DocumentaryPanel: React.FC<PanelProps> = ({ children, theme, style, accent, tone = "ink" }) => {
  const t = getDocumentaryTokens(theme);
  const resolved = accent ?? t.accent;
  const isPaper = tone === "paper";
  const isAccent = tone === "accent";
  return (
    <div style={{ position: "relative", padding: 30, color: isPaper || isAccent ? t.base : t.bright, background: isPaper ? t.bright : isAccent ? resolved : t.surface, border: `2px solid ${isPaper ? `${t.base}44` : resolved}`, borderRadius: t.radius, boxShadow: `10px 12px 0 ${isPaper ? `${t.base}22` : `${resolved}2b`}`, overflow: "hidden", ...style }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 7, background: resolved }} />
      <div style={{ position: "relative" }}>{children}</div>
    </div>
  );
};

export const DocumentaryPill: React.FC<{ children: React.ReactNode; theme?: ThemeConfig; color?: string; inverted?: boolean }> = ({ children, theme, color, inverted = false }) => {
  const t = getDocumentaryTokens(theme);
  const resolved = color ?? t.accent;
  return <span style={{ display: "inline-flex", alignItems: "center", minHeight: 32, padding: "5px 11px", color: inverted ? t.base : resolved, background: inverted ? resolved : "transparent", border: `2px solid ${resolved}`, borderRadius: 2, fontFamily: t.mono, fontSize: 13, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase" }}>{children}</span>;
};

interface EditorialImageProps extends DocumentaryImageData {
  theme?: ThemeConfig;
  delay?: number;
  pan?: "left" | "right" | "up" | "down" | "none";
  style?: React.CSSProperties;
  frameStyle?: React.CSSProperties;
  fallbackIcon?: StoryIconName;
}

export const EditorialImage: React.FC<EditorialImageProps> = ({
  imageUrl,
  imageAlt = "Documentary image",
  imageFocalPoint = "50% 50%",
  imageTreatment = "documentary",
  theme,
  delay = 0,
  pan = "right",
  style,
  frameStyle,
  fallbackIcon = "image",
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const t = getDocumentaryTokens(theme);
  const reveal = interpolate(frame, [delay, delay + 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const travel = interpolate(frame, [delay, Math.max(delay + 1, durationInFrames)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const tx = pan === "left" ? 20 - travel * 36 : pan === "right" ? -20 + travel * 36 : 0;
  const ty = pan === "up" ? 18 - travel * 34 : pan === "down" ? -18 + travel * 34 : 0;
  const filter = imageTreatment === "archive" ? "sepia(0.42) saturate(0.72) contrast(1.1)" : imageTreatment === "monochrome" ? "grayscale(1) contrast(1.14)" : imageTreatment === "documentary" ? "saturate(0.82) contrast(1.08)" : undefined;

  return (
    <div style={{ position: "relative", overflow: "hidden", background: t.elevated, border: `3px solid ${t.bright}`, boxShadow: `12px 14px 0 ${t.accent}`, clipPath: `inset(0 ${100 - reveal * 100}% 0 0)`, ...frameStyle }}>
      {imageUrl ? (
        <Img src={imageUrl} alt={imageAlt} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: imageFocalPoint, filter, transform: `translate3d(${tx}px, ${ty}px, 0) scale(${1.08 + travel * 0.05})`, ...style }} />
      ) : (
        <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", color: t.accent, backgroundImage: `repeating-linear-gradient(135deg, ${t.surface} 0 18px, ${t.elevated} 18px 36px)` }}><StoryIcon name={fallbackIcon} size={88} /></div>
      )}
    </div>
  );
};
