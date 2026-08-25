/**
 * MysteryCanvas — the core frame for mystery namespace components.
 *
 * REVISED design language (v2 — feed-optimized):
 * - EVERY scene has a blurred background image for visual depth (no pure black)
 * - Bold, high-contrast captions (Hormozi-style: thick stroke, large font)
 * - Ken Burns zoom on all images (100% → 115% slow zoom for cinematic feel)
 * - Fast entrance (content visible in 0.3s, not 0.7s)
 * - Dark gradient overlay on top of blurred BG for text readability
 * - Accent color used for highlights and key elements, not just a thin line
 * - Text positioned in safe zone (60-70% down, away from platform UI)
 *
 * The mystery comes from visuals + suspense, not from empty space.
 */

import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { ThemeConfig } from "../themes/index.ts";

export interface MysteryTokens {
  accent: string;
  accentDeep: string;
  secondary: string;
  bright: string;
  mid: string;
  dim: string;
  base: string;
  surface: string;
  elevated: string;
  border: string;
  display: string;
  serif: string;
  sans: string;
  mono: string;
  radius: number;
}

export const getMysteryTokens = (theme?: ThemeConfig): MysteryTokens => ({
  accent: theme?.accents?.primary ?? "#c4a062",
  accentDeep: theme?.accents?.primaryDeep ?? "#9a7d4a",
  secondary: theme?.accents?.secondary ?? "#5a6a78",
  bright: theme?.text?.bright ?? "#ffffff",
  mid: theme?.text?.mid ?? "rgba(220,220,215,0.88)",
  dim: theme?.text?.dim ?? "rgba(200,200,195,0.65)",
  base: theme?.bg?.base ?? "#0a0b0d",
  surface: theme?.bg?.surface ?? "#111316",
  elevated: theme?.bg?.elevated ?? "#1a1d21",
  border: theme?.glass?.border ?? "rgba(255,255,255,0.12)",
  display: theme?.fonts?.display ?? "'League Gothic', 'Arial Narrow', sans-serif",
  serif: theme?.fonts?.serif ?? "Georgia, 'Times New Roman', serif",
  sans: theme?.fonts?.sans ?? "Inter, Helvetica, sans-serif",
  mono: theme?.fonts?.mono ?? "'IBM Plex Mono', monospace",
  radius: theme?.radius?.md ?? 6,
});

interface CanvasProps {
  children: React.ReactNode;
  theme?: ThemeConfig;
  delay?: number;
  /** Tiny label in the top-left (e.g. "EVIDENCE", "LOCATION") */
  label?: string;
  /** Faint footer text */
  footer?: string;
  contentStyle?: React.CSSProperties;
  /** Hero image URL — shown FULLSCREEN and CLEARLY (not blurred). This is what viewers see. */
  imageUrl?: string;
  /** Image treatment applied to the hero image */
  imageTreatment?: "dark" | "noir" | "desaturated" | "clean";
  /** How dark to make the bottom gradient overlay (0-1). Default 0.7 — only affects bottom 45% for text readability */
  bottomGradientOpacity?: number;
  /** Ken Burns zoom direction for the hero image */
  kenBurns?: "in" | "out" | "none";
  /** Ken Burns pan direction */
  kenBurnsPan?: "left" | "right" | "up" | "down" | "none";
}

export const MysteryCanvas: React.FC<CanvasProps> = ({
  children,
  theme,
  delay = 0,
  label,
  footer,
  contentStyle,
  imageUrl,
  imageTreatment = "dark",
  bottomGradientOpacity = 0.7,
  kenBurns = "in",
  kenBurnsPan = "right",
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const t = getMysteryTokens(theme);

  // Fast entrance — content visible in 0.3s (9 frames at 30fps)
  const entrance = interpolate(frame - delay, [0, 9], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Ken Burns slow zoom on the hero image
  const travel = interpolate(frame, [0, Math.max(1, durationInFrames)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const baseScale = 1.08; // slightly zoomed to avoid edge gaps during pan
  const heroZoom = kenBurns === "in" ? baseScale + travel * 0.12 : kenBurns === "out" ? baseScale + 0.12 - travel * 0.12 : baseScale;
  const panDist = 25;
  const heroTx = kenBurnsPan === "left" ? -travel * panDist : kenBurnsPan === "right" ? travel * panDist : 0;
  const heroTy = kenBurnsPan === "up" ? -travel * panDist * 0.5 : kenBurnsPan === "down" ? travel * panDist * 0.5 : 0;

  // Hero image filter — LIGHT treatment so the image is clearly visible
  const heroFilter =
    imageTreatment === "noir"
      ? "grayscale(1) contrast(1.1) brightness(0.95)"
      : imageTreatment === "desaturated"
      ? "grayscale(0.4) contrast(1.05) brightness(0.98) saturate(0.85)"
      : imageTreatment === "clean"
      ? "brightness(1.0)"
      : "brightness(0.92) contrast(1.05) saturate(0.95)"; // "dark" — very light

  // Exit fade
  const exit = interpolate(frame, [Math.max(0, durationInFrames - 10), durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.quad),
  });

  return (
    <AbsoluteFill style={{ background: t.base, color: t.bright, fontFamily: t.sans, overflow: "hidden", opacity: exit }}>
      {/* HERO IMAGE — fullscreen, clearly visible, Ken Burns zoom. This is what viewers SEE. */}
      {imageUrl && (
        <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
          <img
            src={imageUrl}
            alt=""
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center",
              filter: heroFilter,
              transform: `translate3d(${heroTx}px, ${heroTy}px, 0) scale(${heroZoom})`,
              opacity: entrance,
            }}
          />
        </div>
      )}

      {/* Dark gradient ONLY at the bottom 50% — for text readability. Top half stays clear so the image is visible. */}
      <div style={{
        position: "absolute",
        inset: 0,
        background: `linear-gradient(to bottom, transparent 0%, transparent 50%, rgba(8,9,10,${bottomGradientOpacity * 0.5}) 70%, rgba(8,9,10,${bottomGradientOpacity}) 100%)`,
        pointerEvents: "none",
      }} />

      {/* Subtle top gradient for label readability */}
      <div style={{
        position: "absolute",
        top: 0, left: 0, right: 0, height: 120,
        background: `linear-gradient(to bottom, rgba(8,9,10,0.6) 0%, transparent 100%)`,
        pointerEvents: "none",
      }} />

      {/* Accent line at top */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: t.accent, opacity: entrance * 0.85, zIndex: 5 }} />

      {/* Label in top-left */}
      {label && (
        <div style={{
          position: "absolute",
          top: 36,
          left: 32,
          display: "flex",
          alignItems: "center",
          gap: 8,
          opacity: entrance * 0.9,
          zIndex: 10,
        }}>
          <span style={{ width: 5, height: 5, background: t.accent, borderRadius: "50%" }} />
          <span style={{
            fontFamily: t.mono,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: 2.5,
            textTransform: "uppercase",
            color: t.mid,
            textShadow: "0 1px 8px rgba(0,0,0,0.9)",
          }}>
            {label}
          </span>
        </div>
      )}

      {/* Content area — positioned in safe zone, lower-center for feed optimization */}
      <div style={{
        position: "absolute",
        inset: "80px 36px 70px 36px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        opacity: entrance,
        zIndex: 10,
        ...contentStyle,
      }}>
        {children}
      </div>

      {/* Footer */}
      {footer && (
        <div style={{
          position: "absolute",
          bottom: 32,
          left: 32,
          right: 32,
          display: "flex",
          justifyContent: "space-between",
          opacity: entrance * 0.6,
          zIndex: 10,
        }}>
          <span style={{
            fontFamily: t.mono,
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            color: t.dim,
            textShadow: "0 1px 6px rgba(0,0,0,0.9)",
          }}>
            {footer}
          </span>
        </div>
      )}
    </AbsoluteFill>
  );
};

// ─── Reveal — entrance animation ────────────────────────────────────────────

interface RevealProps {
  children: React.ReactNode;
  delay?: number;
  direction?: "up" | "left" | "right" | "scale" | "fade";
  style?: React.CSSProperties;
}

export const MysteryReveal: React.FC<RevealProps> = ({ children, delay: d = 0, direction = "up", style }) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame - d, [0, 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const x = direction === "left" ? (1 - progress) * -30 : direction === "right" ? (1 - progress) * 30 : 0;
  const y = direction === "up" ? (1 - progress) * 18 : 0;
  const scale = direction === "scale" ? 0.95 + progress * 0.05 : 1;

  return (
    <div style={{ opacity: progress, transform: `translate3d(${x}px, ${y}px, 0) scale(${scale})`, ...style }}>
      {children}
    </div>
  );
};

// ─── MysteryImage — Ken Burns zoom image presentation ────────────────────────

export interface MysteryImageData {
  imageUrl?: string;
  imageAlt?: string;
  imageFocalPoint?: string;
  /** Treatment: "clean" (as-is), "dark" (darkened), "desaturated" (near B&W), "noir" (high contrast B&W) */
  imageTreatment?: "clean" | "dark" | "desaturated" | "noir";
}

interface MysteryImageProps extends MysteryImageData {
  theme?: ThemeConfig;
  delay?: number;
  /** Ken Burns pan direction */
  pan?: "left" | "right" | "up" | "down" | "none";
  /** Ken Burns zoom: "in" (zoom in), "out" (zoom out), "none" */
  zoom?: "in" | "out" | "none";
  style?: React.CSSProperties;
  vignette?: boolean;
  /** Zoom intensity (1.0 = no zoom, 1.3 = 30% zoom) */
  zoomIntensity?: number;
}

export const MysteryImage: React.FC<MysteryImageProps> = ({
  imageUrl,
  imageAlt = "Mystery image",
  imageFocalPoint = "50% 50%",
  imageTreatment = "dark",
  theme,
  delay = 0,
  pan = "right",
  zoom = "in",
  style,
  vignette = true,
  zoomIntensity = 0.18,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const t = getMysteryTokens(theme);

  // Fast reveal
  const reveal = interpolate(frame - delay, [0, 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Ken Burns — slow zoom + pan over the full duration
  const travel = interpolate(frame, [delay, Math.max(delay + 1, durationInFrames)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Zoom: start at 1.05 (slightly zoomed to avoid edge gaps), end at 1.05 + intensity
  const baseScale = 1.05;
  const zoomScale = zoom === "in" ? baseScale + travel * zoomIntensity : zoom === "out" ? baseScale + zoomIntensity - travel * zoomIntensity : baseScale;

  // Pan
  const panDistance = 30;
  const tx = pan === "left" ? -travel * panDistance : pan === "right" ? travel * panDistance : 0;
  const ty = pan === "up" ? -travel * panDistance * 0.6 : pan === "down" ? travel * panDistance * 0.6 : 0;

  // Image treatments — lighter than before for visibility
  const filter =
    imageTreatment === "noir"
      ? "grayscale(1) contrast(1.12) brightness(0.92)"
      : imageTreatment === "desaturated"
      ? "grayscale(0.5) contrast(1.05) brightness(0.95) saturate(0.8)"
      : imageTreatment === "dark"
      ? "brightness(0.85) contrast(1.08) saturate(0.9)"
      : undefined;

  return (
    <div style={{ position: "relative", overflow: "hidden", background: t.surface, opacity: reveal, ...style }}>
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={imageAlt}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: imageFocalPoint,
            filter,
            transform: `translate3d(${tx}px, ${ty}px, 0) scale(${zoomScale})`,
          }}
        />
      ) : (
        <div style={{
          width: "100%",
          height: "100%",
          background: `linear-gradient(135deg, ${t.surface}, ${t.base})`,
          display: "grid",
          placeItems: "center",
        }}>
          <span style={{ fontFamily: t.mono, fontSize: 12, letterSpacing: 2, color: t.dim, textTransform: "uppercase" }}>
            No image
          </span>
        </div>
      )}
      {/* Subtle vignette */}
      {vignette && (
        <div style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.25) 100%)",
          pointerEvents: "none",
        }} />
      )}
    </div>
  );
};

// ─── MysteryCaption — bold, high-contrast text overlay (Hormozi-style) ───────

interface CaptionProps {
  children: React.ReactNode;
  theme?: ThemeConfig;
  /** Highlight color for key words */
  highlightColor?: string;
  /** Font size in px. Default 28 */
  fontSize?: number;
  /** Position: "center" or "bottom" (60% down) */
  position?: "center" | "bottom";
  /** Max width in px */
  maxWidth?: number;
  style?: React.CSSProperties;
}

export const MysteryCaption: React.FC<CaptionProps> = ({
  children,
  theme,
  highlightColor,
  fontSize = 28,
  position = "center",
  maxWidth = 600,
  style,
}) => {
  const t = getMysteryTokens(theme);
  const hc = highlightColor ?? t.accent;

  return (
    <div style={{
      position: position === "bottom" ? "absolute" : "relative",
      bottom: position === "bottom" ? "12%" : "auto",
      left: 0,
      right: 0,
      display: "flex",
      justifyContent: "center",
      padding: "0 24px",
      zIndex: 20,
      ...style,
    }}>
      <div style={{
        fontFamily: t.sans,
        fontSize,
        fontWeight: 800,
        lineHeight: 1.25,
        color: t.bright,
        textAlign: "center",
        maxWidth,
        textShadow: "0 2px 16px rgba(0,0,0,0.95), 0 0 30px rgba(0,0,0,0.7)",
        letterSpacing: -0.3,
      }}>
        {children}
      </div>
    </div>
  );
};

// ─── MysteryPanel — a flat surface for content grouping ──────────────────────

interface PanelProps {
  children: React.ReactNode;
  theme?: ThemeConfig;
  style?: React.CSSProperties;
}

export const MysteryPanel: React.FC<PanelProps> = ({ children, theme, style }) => {
  const t = getMysteryTokens(theme);
  return (
    <div style={{
      position: "relative",
      padding: 24,
      background: "rgba(15,16,18,0.85)",
      backdropFilter: "blur(12px)",
      borderRadius: t.radius,
      border: `1px solid ${t.border}`,
      ...style,
    }}>
      {children}
    </div>
  );
};

// ─── MysteryLabel — mono label with accent dot ───────────────────────────────

export const MysteryLabel: React.FC<{
  children: React.ReactNode;
  theme?: ThemeConfig;
  color?: string;
}> = ({ children, theme, color }) => {
  const t = getMysteryTokens(theme);
  const c = color ?? t.accent;
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      fontFamily: t.mono,
      fontSize: 12,
      fontWeight: 600,
      letterSpacing: 2,
      textTransform: "uppercase",
      color: t.mid,
      textShadow: "0 1px 8px rgba(0,0,0,0.9)",
    }}>
      <span style={{ width: 5, height: 5, background: c, borderRadius: "50%" }} />
      {children}
    </span>
  );
};
