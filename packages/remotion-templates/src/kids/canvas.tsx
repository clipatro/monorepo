/**
 * KidsCanvas — the core frame for kids namespace components.
 *
 * Design language (bright, playful, energetic):
 * - SPLIT LAYOUT: image fills the top ~55% of the frame (fully visible,
 *   Ken Burns zoom, rounded bottom corners), text sits on a bright white
 *   rounded panel at the bottom ~45%. Both are clearly visible.
 * - Bright sky-blue background with soft floating decorative shapes (bubbles,
 *   stars, confetti) that drift slowly — the energy comes from color + motion.
 * - Fredoka (loaded via @remotion/google-fonts) for all titles/headlines.
 *   Nunito for body text and labels. Rounded, friendly, readable.
 * - Bouncy spring entrances — kids content should feel alive and playful.
 *   No quiet fades; use spring() with a playful damping/stiffness.
 * - Large border radius everywhere — cards, panels, image corners.
 * - One accent color per frame used boldly (a pill, a dot, a badge).
 * - Happy, warm, inviting — never dark or gloomy.
 */

import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { ThemeConfig } from "../themes/index.ts";
import { FREDOKA, NUNITO } from "./fonts.ts";

export interface KidsTokens {
  accent: string;
  accentDeep: string;
  secondary: string;
  tertiary: string;
  success: string;
  warning: string;
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
  radiusSm: number;
  radiusMd: number;
  radiusLg: number;
  radiusXl: number;
  cardShadow: string;
  glow: string;
}

export const getKidsTokens = (theme?: ThemeConfig): KidsTokens => ({
  accent: theme?.accents?.primary ?? "#FFD93D",
  accentDeep: theme?.accents?.primaryDeep ?? "#FFB300",
  secondary: theme?.accents?.secondary ?? "#FF6B6B",
  tertiary: theme?.accents?.tertiary ?? "#4ECDC4",
  success: theme?.accents?.success ?? "#6BCB77",
  warning: theme?.accents?.warning ?? "#FF9F43",
  bright: theme?.text?.bright ?? "#1a1a2e",
  mid: theme?.text?.mid ?? "rgba(26,26,46,0.72)",
  dim: theme?.text?.dim ?? "rgba(26,26,46,0.48)",
  base: theme?.bg?.base ?? "#4FC3F7",
  surface: theme?.bg?.surface ?? "#81D4FA",
  elevated: theme?.bg?.elevated ?? "#B3E5FC",
  border: theme?.glass?.border ?? "rgba(255,255,255,0.9)",
  display: theme?.fonts?.display ?? FREDOKA,
  serif: theme?.fonts?.serif ?? FREDOKA,
  sans: theme?.fonts?.sans ?? NUNITO,
  mono: theme?.fonts?.mono ?? NUNITO,
  radiusSm: theme?.radius?.sm ?? 12,
  radiusMd: theme?.radius?.md ?? 20,
  radiusLg: theme?.radius?.lg ?? 28,
  radiusXl: theme?.radius?.xl ?? 36,
  cardShadow: theme?.shadows?.card ?? "0 8px 24px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)",
  glow: theme?.shadows?.glow ?? "0 0 32px rgba(255,217,61,0.4)",
});

interface CanvasProps {
  children: React.ReactNode;
  theme?: ThemeConfig;
  delay?: number;
  /** Tiny playful label at the top of the text panel (e.g. "DID YOU KNOW?", "FUN FACT!") */
  label?: string;
  /** Footer text at the bottom of the text panel */
  footer?: string;
  contentStyle?: React.CSSProperties;
  /** Hero image URL — fills the top portion of the frame, fully visible, rounded corners */
  imageUrl?: string;
  /** Image treatment — kids images are bright and saturated by default */
  imageTreatment?: "bright" | "vivid" | "soft" | "clean";
  /** Height of the bottom text panel in px. Default 580 (~45% of 1280). Image fills the rest. */
  panelHeight?: number;
  /** Ken Burns zoom direction for the hero image */
  kenBurns?: "in" | "out" | "none";
  /** Ken Burns pan direction */
  kenBurnsPan?: "left" | "right" | "up" | "down" | "none";
  /** Accent badge color override for the label pill */
  labelColor?: string;
  /** Show floating decorative shapes in the background. Default true. */
  decorations?: boolean;
}

export const KidsCanvas: React.FC<CanvasProps> = ({
  children,
  theme,
  delay = 0,
  label,
  footer,
  contentStyle,
  imageUrl,
  imageTreatment = "bright",
  panelHeight = 580,
  kenBurns = "in",
  kenBurnsPan = "right",
  labelColor,
  decorations = true,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps, height } = useVideoConfig();
  const t = getKidsTokens(theme);

  // Bouncy spring entrance — playful, kids content should feel alive
  const entrance = spring({
    frame: frame - delay,
    fps,
    config: { damping: 14, stiffness: 110, mass: 0.9 },
  });

  // Ken Burns slow zoom on the hero image
  const travel = interpolate(frame, [0, Math.max(1, durationInFrames)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const baseScale = 1.08;
  const heroZoom =
    kenBurns === "in"
      ? baseScale + travel * 0.1
      : kenBurns === "out"
      ? baseScale + 0.1 - travel * 0.1
      : baseScale;
  const panDist = 20;
  const heroTx = kenBurnsPan === "left" ? -travel * panDist : kenBurnsPan === "right" ? travel * panDist : 0;
  const heroTy = kenBurnsPan === "up" ? -travel * panDist * 0.5 : kenBurnsPan === "down" ? travel * panDist * 0.5 : 0;

  // Image filter — kids images are bright, saturated, happy
  const heroFilter =
    imageTreatment === "vivid"
      ? "saturate(1.25) contrast(1.08) brightness(1.05)"
      : imageTreatment === "soft"
      ? "saturate(1.1) brightness(1.08) contrast(0.98)"
      : imageTreatment === "clean"
      ? "brightness(1.0)"
      : "saturate(1.15) contrast(1.05) brightness(1.03)";

  // Panel spring-up entrance (bouncy)
  const panelTranslate = (1 - entrance) * 60;

  // Exit fade
  const exit = interpolate(frame, [Math.max(0, durationInFrames - 10), durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.quad),
  });

  const imageHeight = height - panelHeight;
  const panelOverlap = 50; // px the rounded panel overlaps the image bottom

  // Decorative floating shapes — drift slowly, different speeds
  const decor = [
    { shape: "circle", color: t.accent, x: 60, y: 90, size: 48, speed: 0.3, phase: 0 },
    { shape: "star", color: t.secondary, x: 640, y: 140, size: 36, speed: 0.4, phase: 1.5 },
    { shape: "circle", color: t.tertiary, x: 120, y: 520, size: 32, speed: 0.25, phase: 3 },
    { shape: "triangle", color: t.accentDeep, x: 600, y: 480, size: 40, speed: 0.35, phase: 2.2 },
    { shape: "circle", color: t.secondary, x: 350, y: 60, size: 24, speed: 0.5, phase: 4 },
  ];

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(160deg, ${t.base} 0%, ${t.surface} 60%, ${t.elevated} 100%)`,
        color: t.bright,
        fontFamily: t.sans,
        overflow: "hidden",
        opacity: exit,
      }}
    >
      {/* ── Floating decorative shapes ── */}
      {decorations &&
        decor.map((d, i) => {
          const drift = Math.sin((frame + d.phase * 30) * 0.02 * d.speed) * 12;
          const driftY = Math.cos((frame + d.phase * 30) * 0.018 * d.speed) * 8;
          const decorEntrance = spring({
            frame: frame - delay - i * 4,
            fps,
            config: { damping: 12, stiffness: 100 },
          });
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: d.x,
                top: d.y + driftY,
                width: d.size,
                height: d.size,
                opacity: decorEntrance * 0.5,
                transform: `translateY(${drift}px) rotate(${drift * 1.5}deg)`,
                zIndex: 1,
              }}
            >
              {d.shape === "circle" && (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    borderRadius: "50%",
                    background: d.color,
                  }}
                />
              )}
              {d.shape === "star" && (
                <svg viewBox="0 0 24 24" width="100%" height="100%">
                  <path
                    d="M12 2l2.9 6.9L22 10l-5.5 4.8L18 22l-6-3.5L6 22l1.5-7.2L2 10l7.1-1.1z"
                    fill={d.color}
                  />
                </svg>
              )}
              {d.shape === "triangle" && (
                <svg viewBox="0 0 24 24" width="100%" height="100%">
                  <path d="M12 3l9 16H3z" fill={d.color} />
                </svg>
              )}
            </div>
          );
        })}

      {/* ── IMAGE AREA (top portion) ── fully visible, Ken Burns zoom, rounded bottom */}
      {imageUrl && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: imageHeight + panelOverlap,
            overflow: "hidden",
            borderBottomLeftRadius: t.radiusXl,
            borderBottomRightRadius: t.radiusXl,
            zIndex: 2,
          }}
        >
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

      {/* ── TEXT PANEL (bottom portion) ── bright white rounded card, text is clearly readable */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: panelHeight + panelOverlap,
          background: "rgba(255,255,255,0.96)",
          backdropFilter: "blur(8px)",
          borderTopLeftRadius: t.radiusXl,
          borderTopRightRadius: t.radiusXl,
          transform: `translateY(${panelTranslate}px)`,
          opacity: entrance,
          zIndex: 5,
          boxShadow: `0 -8px 32px rgba(0,0,0,0.1)`,
        }}
      />

      {/* Label — playful pill badge at the top of the text panel */}
      {label && (
        <div
          style={{
            position: "absolute",
            top: imageHeight - 24,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            opacity: entrance,
            transform: `translateY(${panelTranslate}px)`,
            zIndex: 10,
          }}
        >
          <span
            style={{
              display: "inline-block",
              padding: "10px 24px",
              borderRadius: 999,
              background: labelColor ?? t.accent,
              color: t.bright,
              fontFamily: t.display,
              fontSize: 16,
              fontWeight: 600,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              boxShadow: t.cardShadow,
            }}
          >
            {label}
          </span>
        </div>
      )}

      {/* Content area — inside the text panel, padded, vertically centered */}
      <div
        style={{
          position: "absolute",
          bottom: footer ? 70 : 48,
          left: 44,
          right: 44,
          top: imageHeight + (label ? 50 : 20),
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          opacity: entrance,
          transform: `translateY(${panelTranslate}px)`,
          zIndex: 10,
          ...contentStyle,
        }}
      >
        {children}
      </div>

      {/* Footer — sans, at the very bottom of the panel */}
      {footer && (
        <div
          style={{
            position: "absolute",
            bottom: 28,
            left: 44,
            right: 44,
            opacity: entrance * 0.6,
            transform: `translateY(${panelTranslate}px)`,
            zIndex: 10,
          }}
        >
          <span
            style={{
              fontFamily: t.sans,
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: 0.5,
              color: t.dim,
            }}
          >
            {footer}
          </span>
        </div>
      )}
    </AbsoluteFill>
  );
};

// ─── Reveal — bouncy spring entrance animation ──────────────────────────────

interface RevealProps {
  children: React.ReactNode;
  delay?: number;
  direction?: "up" | "left" | "right" | "scale" | "fade" | "pop";
  style?: React.CSSProperties;
  theme?: ThemeConfig;
}

export const KidsReveal: React.FC<RevealProps> = ({ children, delay: d = 0, direction = "up", style, theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = getKidsTokens(theme);

  const progress = spring({
    frame: frame - d,
    fps,
    config: { damping: 13, stiffness: 120, mass: 0.8 },
  });

  const x = direction === "left" ? (1 - progress) * -30 : direction === "right" ? (1 - progress) * 30 : 0;
  const y = direction === "up" ? (1 - progress) * 20 : 0;
  const scale = direction === "scale" ? 0.85 + progress * 0.15 : direction === "pop" ? 0.3 + progress * 0.7 : 1;

  return (
    <div style={{ opacity: progress, transform: `translate3d(${x}px, ${y}px, 0) scale(${scale})`, ...style }}>
      {children}
    </div>
  );
};

// ─── KidsImage — Ken Burns zoom image with rounded corners ───────────────────

export interface KidsImageData {
  imageUrl?: string;
  imageAlt?: string;
  imageFocalPoint?: string;
  /** Treatment: "bright" (default, saturated), "vivid" (extra saturated), "soft" (gentle), "clean" (as-is) */
  imageTreatment?: "bright" | "vivid" | "soft" | "clean";
}

interface KidsImageProps extends KidsImageData {
  theme?: ThemeConfig;
  delay?: number;
  /** Ken Burns pan direction */
  pan?: "left" | "right" | "up" | "down" | "none";
  /** Ken Burns zoom: "in" (zoom in), "out" (zoom out), "none" */
  zoom?: "in" | "out" | "none";
  style?: React.CSSProperties;
  /** Show rounded corners. Default true. */
  rounded?: boolean;
  /** Zoom intensity (1.0 = no zoom, 0.18 = 18% zoom) */
  zoomIntensity?: number;
}

export const KidsImage: React.FC<KidsImageProps> = ({
  imageUrl,
  imageAlt = "Kids image",
  imageFocalPoint = "50% 50%",
  imageTreatment = "bright",
  theme,
  delay = 0,
  pan = "right",
  zoom = "in",
  style,
  rounded = true,
  zoomIntensity = 0.15,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const t = getKidsTokens(theme);

  // Bouncy reveal
  const reveal = spring({
    frame: frame - delay,
    fps,
    config: { damping: 14, stiffness: 110 },
  });

  // Ken Burns — slow zoom + pan over the full duration
  const travel = interpolate(frame, [delay, Math.max(delay + 1, durationInFrames)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const baseScale = 1.05;
  const zoomScale =
    zoom === "in"
      ? baseScale + travel * zoomIntensity
      : zoom === "out"
      ? baseScale + zoomIntensity - travel * zoomIntensity
      : baseScale;

  const panDistance = 25;
  const tx = pan === "left" ? -travel * panDistance : pan === "right" ? travel * panDistance : 0;
  const ty = pan === "up" ? -travel * panDistance * 0.6 : pan === "down" ? travel * panDistance * 0.6 : 0;

  // Image treatments — bright, saturated, happy
  const filter =
    imageTreatment === "vivid"
      ? "saturate(1.3) contrast(1.1) brightness(1.05)"
      : imageTreatment === "soft"
      ? "saturate(1.1) brightness(1.08) contrast(0.97)"
      : imageTreatment === "clean"
      ? undefined
      : "saturate(1.18) contrast(1.06) brightness(1.03)";

  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        background: t.elevated,
        opacity: reveal,
        borderRadius: rounded ? t.radiusLg : 0,
        boxShadow: rounded ? t.cardShadow : undefined,
        ...style,
      }}
    >
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
        <div
          style={{
            width: "100%",
            height: "100%",
            background: `linear-gradient(135deg, ${t.surface}, ${t.elevated})`,
            display: "grid",
            placeItems: "center",
          }}
        >
          <span
            style={{
              fontFamily: t.display,
              fontSize: 18,
              fontWeight: 600,
              color: t.dim,
            }}
          >
            No image
          </span>
        </div>
      )}
    </div>
  );
};

// ─── KidsCaption — bold, playful text overlay ────────────────────────────────

interface CaptionProps {
  children: React.ReactNode;
  theme?: ThemeConfig;
  /** Highlight color for the caption background pill */
  highlightColor?: string;
  /** Font size in px. Default 30 */
  fontSize?: number;
  /** Position: "center" or "bottom" (60% down) */
  position?: "center" | "bottom";
  /** Max width in px */
  maxWidth?: number;
  style?: React.CSSProperties;
}

export const KidsCaption: React.FC<CaptionProps> = ({
  children,
  theme,
  highlightColor,
  fontSize = 28,
  position = "center",
  maxWidth = 580,
  style,
}) => {
  const t = getKidsTokens(theme);
  const hc = highlightColor ?? t.accent;

  return (
    <div
      style={{
        position: position === "bottom" ? "absolute" : "relative",
        bottom: position === "bottom" ? "16%" : "auto",
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        padding: "0 24px",
        zIndex: 20,
        ...style,
      }}
    >
      <div
        style={{
          fontFamily: t.display,
          fontSize,
          fontWeight: 600,
          lineHeight: 1.25,
          color: "#ffffff",
          textAlign: "center",
          maxWidth,
          padding: "12px 24px",
          borderRadius: t.radiusMd,
          background: `${hc}cc`,
          textShadow: "0 2px 8px rgba(0,0,0,0.3)",
        }}
      >
        {children}
      </div>
    </div>
  );
};

// ─── KidsPanel — a bright rounded surface for content grouping ───────────────

interface PanelProps {
  children: React.ReactNode;
  theme?: ThemeConfig;
  style?: React.CSSProperties;
  /** Background color override. Defaults to elevated. */
  background?: string;
}

export const KidsPanel: React.FC<PanelProps> = ({ children, theme, style, background }) => {
  const t = getKidsTokens(theme);
  return (
    <div
      style={{
        position: "relative",
        padding: 28,
        background: background ?? "rgba(255,255,255,0.9)",
        borderRadius: t.radiusLg,
        border: `2px solid ${t.border}`,
        boxShadow: t.cardShadow,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

// ─── KidsLabel — playful pill label with accent color ────────────────────────

export const KidsLabel: React.FC<{
  children: React.ReactNode;
  theme?: ThemeConfig;
  color?: string;
}> = ({ children, theme, color }) => {
  const t = getKidsTokens(theme);
  const c = color ?? t.secondary;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "8px 18px",
        borderRadius: 999,
        background: c,
        color: "#ffffff",
        fontFamily: t.display,
        fontSize: 15,
        fontWeight: 600,
        letterSpacing: 1,
        textTransform: "uppercase",
        boxShadow: t.cardShadow,
      }}
    >
      {children}
    </span>
  );
};

// ─── KidsSceneCanvas — full-bleed image canvas with overlay layer ────────────
//
// Unlike KidsCanvas (split layout: image top ~55%, white text panel bottom
// ~45%), KidsSceneCanvas fills the ENTIRE frame with the image and exposes a
// content layer on top for overlay primitives (speech bubbles, thought
// bubbles, caption strips, callout cards, scrims). Text is integrated into
// the scene, not separated from it.
//
// Features:
//  - Full-bleed image with object-fit cover, Ken Burns zoom + pan
//  - Optional gradient scrim (top, bottom, or both) for text legibility
//  - Bouncy spring entrance + gentle exit fade
//  - Optional floating decorative shapes (same playful vocabulary as KidsCanvas)
//  - Content layer positioned via `overlay` prop (top | center | bottom | free)
//  - Optional label pill and footer, positioned over the image
//  - Safe-area padding so overlays never touch the screen edge

export interface KidsSceneCanvasProps {
  children?: React.ReactNode;
  theme?: ThemeConfig;
  delay?: number;
  /** Hero image URL — fills the entire frame */
  imageUrl?: string;
  /** Image alt text */
  imageAlt?: string;
  /** Image focal point for object-position (e.g. "50% 30%") */
  imageFocalPoint?: string;
  /** Image treatment — kids images are bright and saturated by default */
  imageTreatment?: "bright" | "vivid" | "soft" | "clean";
  /** Ken Burns zoom direction */
  kenBurns?: "in" | "out" | "none";
  /** Ken Burns pan direction */
  kenBurnsPan?: "left" | "right" | "up" | "down" | "none";
  /** Zoom intensity (0.18 = 18% zoom over the duration). Default 0.12. */
  zoomIntensity?: number;
  /** Scrim gradient for text legibility over the image */
  scrim?: "none" | "top" | "bottom" | "both" | "full";
  /** Scrim strength (0-1). Default 0.55. */
  scrimStrength?: number;
  /** Where the overlay content layer is anchored */
  overlay?: "top" | "center" | "bottom" | "free";
  /** Padding around the overlay content (px). Default 48. */
  overlayPadding?: number;
  /** Tiny playful label pill (e.g. "DID YOU KNOW?") */
  label?: string;
  /** Label pill color override */
  labelColor?: string;
  /** Label position over the image */
  labelPosition?: "top-left" | "top-center" | "top-right";
  /** Footer text at the very bottom */
  footer?: string;
  /** Show floating decorative shapes. Default true. */
  decorations?: boolean;
  /** Style override for the overlay content layer */
  overlayStyle?: React.CSSProperties;
}

export const KidsSceneCanvas: React.FC<KidsSceneCanvasProps> = ({
  children,
  theme,
  delay = 0,
  imageUrl,
  imageAlt = "",
  imageFocalPoint = "50% 50%",
  imageTreatment = "bright",
  kenBurns = "in",
  kenBurnsPan = "right",
  zoomIntensity = 0.12,
  scrim = "bottom",
  scrimStrength = 0.55,
  overlay = "bottom",
  overlayPadding = 48,
  label,
  labelColor,
  labelPosition = "top-left",
  footer,
  decorations = true,
  overlayStyle,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const t = getKidsTokens(theme);

  // Bouncy spring entrance
  const entrance = spring({
    frame: frame - delay,
    fps,
    config: { damping: 14, stiffness: 110, mass: 0.9 },
  });

  // Ken Burns slow zoom + pan over the full duration
  const travel = interpolate(frame, [0, Math.max(1, durationInFrames)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const baseScale = 1.08;
  const heroZoom =
    kenBurns === "in"
      ? baseScale + travel * zoomIntensity
      : kenBurns === "out"
      ? baseScale + zoomIntensity - travel * zoomIntensity
      : baseScale;
  const panDist = 24;
  const heroTx = kenBurnsPan === "left" ? -travel * panDist : kenBurnsPan === "right" ? travel * panDist : 0;
  const heroTy = kenBurnsPan === "up" ? -travel * panDist * 0.5 : kenBurnsPan === "down" ? travel * panDist * 0.5 : 0;

  // Image filter — bright, saturated, happy
  const heroFilter =
    imageTreatment === "vivid"
      ? "saturate(1.25) contrast(1.08) brightness(1.05)"
      : imageTreatment === "soft"
      ? "saturate(1.1) brightness(1.08) contrast(0.98)"
      : imageTreatment === "clean"
      ? "brightness(1.0)"
      : "saturate(1.15) contrast(1.05) brightness(1.03)";

  // Exit fade
  const exit = interpolate(frame, [Math.max(0, durationInFrames - 10), durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.quad),
  });

  // Scrim gradient stops — soft, never opaque enough to hide the image
  const s = scrimStrength;
  const scrimBg =
    scrim === "none"
      ? undefined
      : scrim === "full"
      ? `rgba(0,0,0,${s * 0.45})`
      : scrim === "top"
      ? `linear-gradient(to bottom, rgba(0,0,0,${s}) 0%, rgba(0,0,0,${s * 0.5}) 35%, rgba(0,0,0,0) 65%)`
      : scrim === "bottom"
      ? `linear-gradient(to top, rgba(0,0,0,${s}) 0%, rgba(0,0,0,${s * 0.5}) 35%, rgba(0,0,0,0) 65%)`
      : `linear-gradient(to bottom, rgba(0,0,0,${s}) 0%, rgba(0,0,0,${s * 0.25}) 30%, rgba(0,0,0,${s * 0.25}) 70%, rgba(0,0,0,${s}) 100%)`;

  // Overlay content layer positioning
  const overlayAlign: React.CSSProperties =
    overlay === "top"
      ? { top: overlayPadding, bottom: "auto", justifyContent: "flex-start" }
      : overlay === "center"
      ? { top: overlayPadding, bottom: overlayPadding, justifyContent: "center" }
      : overlay === "free"
      ? { top: 0, bottom: 0, justifyContent: "flex-start" }
      : { top: "auto", bottom: footer ? overlayPadding + 36 : overlayPadding, justifyContent: "flex-end" };

  // Label pill position
  const labelPos: React.CSSProperties =
    labelPosition === "top-center"
      ? { left: 0, right: 0, justifyContent: "center" }
      : labelPosition === "top-right"
      ? { left: "auto", right: overlayPadding, justifyContent: "flex-end" }
      : { left: overlayPadding, right: "auto", justifyContent: "flex-start" };

  // Decorative floating shapes — same playful vocabulary as KidsCanvas
  const decor = [
    { shape: "circle", color: t.accent, x: 60, y: 90, size: 44, speed: 0.3, phase: 0 },
    { shape: "star", color: t.secondary, x: 620, y: 130, size: 32, speed: 0.4, phase: 1.5 },
    { shape: "circle", color: t.tertiary, x: 100, y: 480, size: 28, speed: 0.25, phase: 3 },
    { shape: "triangle", color: t.accentDeep, x: 590, y: 440, size: 36, speed: 0.35, phase: 2.2 },
    { shape: "circle", color: t.secondary, x: 340, y: 50, size: 22, speed: 0.5, phase: 4 },
  ];

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(160deg, ${t.base} 0%, ${t.surface} 60%, ${t.elevated} 100%)`,
        color: "#ffffff",
        fontFamily: t.sans,
        overflow: "hidden",
        opacity: exit,
      }}
    >
      {/* ── Full-bleed hero image ── */}
      {imageUrl && (
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", zIndex: 1 }}>
          <img
            src={imageUrl}
            alt={imageAlt}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: imageFocalPoint,
              filter: heroFilter,
              transform: `translate3d(${heroTx}px, ${heroTy}px, 0) scale(${heroZoom})`,
              opacity: entrance,
            }}
          />
        </div>
      )}

      {/* ── Scrim for text legibility ── */}
      {scrimBg && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: scrimBg,
            zIndex: 2,
            opacity: entrance,
          }}
        />
      )}

      {/* ── Floating decorative shapes ── */}
      {decorations &&
        decor.map((d, i) => {
          const drift = Math.sin((frame + d.phase * 30) * 0.02 * d.speed) * 12;
          const driftY = Math.cos((frame + d.phase * 30) * 0.018 * d.speed) * 8;
          const decorEntrance = spring({
            frame: frame - delay - i * 4,
            fps,
            config: { damping: 12, stiffness: 100 },
          });
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: d.x,
                top: d.y + driftY,
                width: d.size,
                height: d.size,
                opacity: decorEntrance * 0.4,
                transform: `translateY(${drift}px) rotate(${drift * 1.5}deg)`,
                zIndex: 3,
              }}
            >
              {d.shape === "circle" && (
                <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: d.color }} />
              )}
              {d.shape === "star" && (
                <svg viewBox="0 0 24 24" width="100%" height="100%">
                  <path d="M12 2l2.9 6.9L22 10l-5.5 4.8L18 22l-6-3.5L6 22l1.5-7.2L2 10l7.1-1.1z" fill={d.color} />
                </svg>
              )}
              {d.shape === "triangle" && (
                <svg viewBox="0 0 24 24" width="100%" height="100%">
                  <path d="M12 3l9 16H3z" fill={d.color} />
                </svg>
              )}
            </div>
          );
        })}

      {/* ── Label pill over the image ── */}
      {label && (
        <div
          style={{
            position: "absolute",
            top: overlayPadding - 8,
            display: "flex",
            ...labelPos,
            opacity: entrance,
            zIndex: 10,
          }}
        >
          <span
            style={{
              display: "inline-block",
              padding: "10px 24px",
              borderRadius: 999,
              background: labelColor ?? t.accent,
              color: t.bright,
              fontFamily: t.display,
              fontSize: 16,
              fontWeight: 600,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              boxShadow: t.cardShadow,
            }}
          >
            {label}
          </span>
        </div>
      )}

      {/* ── Overlay content layer (speech bubbles, captions, callouts, etc.) ── */}
      {children && (
        <div
          style={{
            position: "absolute",
            left: overlayPadding,
            right: overlayPadding,
            display: "flex",
            flexDirection: "column",
            opacity: entrance,
            zIndex: 10,
            ...overlayAlign,
            ...overlayStyle,
          }}
        >
          {children}
        </div>
      )}

      {/* ── Footer ── */}
      {footer && (
        <div
          style={{
            position: "absolute",
            bottom: 24,
            left: overlayPadding,
            right: overlayPadding,
            opacity: entrance * 0.7,
            zIndex: 10,
          }}
        >
          <span
            style={{
              fontFamily: t.sans,
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: 0.5,
              color: "#ffffff",
              textShadow: "0 1px 4px rgba(0,0,0,0.5)",
            }}
          >
            {footer}
          </span>
        </div>
      )}
    </AbsoluteFill>
  );
};

// ─── KidsScrim — reusable gradient scrim overlay primitive ──────────────────
//
// A standalone scrim layer that other overlay components (speech bubbles,
// caption strips, callout cards, etc.) can compose to guarantee text
// legibility over a full-bleed image. Renders only the gradient — no image,
// no content. Place it as a sibling beneath the text overlay in the z-stack.
//
// Modes:
//  - "none"   → renders nothing
//  - "top"    → darkens the top third (for top-anchored overlays)
//  - "bottom" → darkens the bottom third (for bottom-anchored overlays)
//  - "both"   → darkens top and bottom (for overlays at either edge)
//  - "full"   → flat semi-transparent black across the whole frame
//
// Strength (0-1) controls how dark the scrim gets. 0.55 is the kids default
// — strong enough for white text readability but never opaque enough to hide
// the bright, playful image underneath.

export type KidsScrimMode = "none" | "top" | "bottom" | "both" | "full";

/**
 * Build the CSS background value for a scrim gradient. Shared between
 * KidsSceneCanvas and KidsScrim so the gradient vocabulary stays consistent.
 * Returns `undefined` for mode "none" (caller should not render a layer).
 */
export function buildScrimBackground(mode: KidsScrimMode, strength: number): string | undefined {
  const s = Math.max(0, Math.min(1, strength));
  switch (mode) {
    case "none":
      return undefined;
    case "full":
      return `rgba(0,0,0,${s * 0.45})`;
    case "top":
      return `linear-gradient(to bottom, rgba(0,0,0,${s}) 0%, rgba(0,0,0,${s * 0.5}) 35%, rgba(0,0,0,0) 65%)`;
    case "bottom":
      return `linear-gradient(to top, rgba(0,0,0,${s}) 0%, rgba(0,0,0,${s * 0.5}) 35%, rgba(0,0,0,0) 65%)`;
    case "both":
      return `linear-gradient(to bottom, rgba(0,0,0,${s}) 0%, rgba(0,0,0,${s * 0.25}) 30%, rgba(0,0,0,${s * 0.25}) 70%, rgba(0,0,0,${s}) 100%)`;
    default:
      return undefined;
  }
}

export interface KidsScrimProps {
  theme?: ThemeConfig;
  delay?: number;
  /** Scrim gradient mode. Default "bottom". */
  mode?: KidsScrimMode;
  /** Scrim darkness (0-1). Default 0.55. */
  strength?: number;
  /** Animate the scrim in with a spring entrance. Default true. */
  animate?: boolean;
  /** z-index for the scrim layer. Default 2 (above image, below overlays). */
  zIndex?: number;
  /** Style override (e.g. to constrain the scrim to a sub-region). */
  style?: React.CSSProperties;
}

export const KidsScrim: React.FC<KidsScrimProps> = ({
  theme,
  delay = 0,
  mode = "bottom",
  strength = 0.55,
  animate = true,
  zIndex = 2,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const background = buildScrimBackground(mode, strength);
  if (!background) return null;

  // Spring entrance — matches the kids namespace's bouncy vocabulary
  const entrance = animate
    ? spring({ frame: frame - delay, fps, config: { damping: 14, stiffness: 110, mass: 0.9 } })
    : 1;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background,
        opacity: entrance,
        zIndex,
        pointerEvents: "none",
        ...style,
      }}
    />
  );
};

// Re-export the mode type alias for convenience alongside the component
export type { KidsScrimMode as ScrimMode };

// ─── KidsSpeechBubble — playful cartoon speech bubble overlay ────────────────
//
// A reusable, positionable speech bubble for character dialogue over a
// full-bleed scene. Designed for short lines of kids-cartoon dialogue:
//  - Rounded "pill" body with a bold outline and a soft drop shadow
//  - A little tail pointer that can point left, right, or down toward the
//    speaker in the scene
//  - Fredoka display font, generous line-height, white text on a bright
//    accent-colored body (or white body with dark text — pickable via `variant`)
//  - Bouncy spring entrance with a configurable direction, plus a gentle
//    "settle" wobble so it feels alive
//  - Optional speaker name label pill attached above the bubble
//  - Optional "emote" (a small playful emoji-like glyph drawn as SVG: star,
//    heart, exclamation, question) that pops in above the bubble
//
// Place it inside the overlay layer of KidsSceneCanvas (or absolutely
// position it via the `style` prop). It renders only the bubble — no image,
// no scrim. Compose with KidsScrim for legibility when needed.

export type SpeechBubbleVariant = "accent" | "white" | "coral" | "mint" | "sunshine";
export type SpeechBubbleTail = "left" | "right" | "down" | "none";
export type SpeechBubbleEmote = "none" | "star" | "heart" | "exclamation" | "question";

export interface KidsSpeechBubbleProps {
  /** The dialogue line. Keep it short — this is a speech bubble, not a paragraph. */
  text: string;
  theme?: ThemeConfig;
  delay?: number;
  /** Color variant. "accent" (yellow), "white", "coral", "mint", "sunshine". Default "white". */
  variant?: SpeechBubbleVariant;
  /** Tail pointer direction toward the speaker. Default "left". */
  tail?: SpeechBubbleTail;
  /** Position the tail along the bubble's edge (0-1, 0 = far end, 1 = near end). Default 0.3. */
  tailPosition?: number;
  /** Optional speaker name shown as a small pill above the bubble. */
  speaker?: string;
  /** Optional playful emote glyph above the bubble. Default "none". */
  emote?: SpeechBubbleEmote;
  /** Max width in px before text wraps. Default 460. */
  maxWidth?: number;
  /** Font size in px. Default 30. */
  fontSize?: number;
  /** Entrance direction. Default "pop". */
  entrance?: "pop" | "up" | "left" | "right" | "scale";
  /** Style override (e.g. absolute positioning over the scene). */
  style?: React.CSSProperties;
}

export const KidsSpeechBubble: React.FC<KidsSpeechBubbleProps> = ({
  text,
  theme,
  delay = 0,
  variant = "white",
  tail = "left",
  tailPosition = 0.3,
  speaker,
  emote = "none",
  maxWidth = 460,
  fontSize = 30,
  entrance = "pop",
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = getKidsTokens(theme);

  // Variant → body / text / outline colors
  const palette: Record<SpeechBubbleVariant, { body: string; text: string; outline: string }> = {
    accent: { body: t.accent, text: t.bright, outline: t.accentDeep },
    white: { body: "#ffffff", text: t.bright, outline: t.secondary },
    coral: { body: t.secondary, text: "#ffffff", outline: "#e85a5a" },
    mint: { body: t.tertiary, text: "#ffffff", outline: "#3bb8af" },
    sunshine: { body: t.warning, text: "#ffffff", outline: t.accentDeep },
  };
  const colors = palette[variant] ?? palette.white!;

  // Bouncy spring entrance
  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 11, stiffness: 130, mass: 0.8 },
  });

  // Gentle settle wobble after entrance — a small, decaying oscillation
  const wobble = Math.sin((frame - delay - 12) * 0.18) * Math.exp(-Math.max(0, frame - delay - 12) * 0.06) * 1.5;

  // Entrance transform
  const x = entrance === "left" ? (1 - progress) * -40 : entrance === "right" ? (1 - progress) * 40 : 0;
  const y = entrance === "up" ? (1 - progress) * 30 : 0;
  const scale = entrance === "pop" ? 0.3 + progress * 0.7 : entrance === "scale" ? 0.6 + progress * 0.4 : 1;

  // Tail geometry — a small triangle pointing toward the speaker
  const tailSize = 22;
  const tailPos = Math.max(0.08, Math.min(0.92, tailPosition));
  // Tail is rendered as an absolutely-positioned rotated square (a "fold")
  // for a cartoon look. Position depends on direction.
  const tailStyle: React.CSSProperties =
    tail === "left"
      ? {
          left: -tailSize / 2 + 2,
          top: `calc(${tailPos * 100}% - ${tailSize / 2}px)`,
          background: colors.body,
          borderBottom: `4px solid ${colors.outline}`,
          borderLeft: `4px solid ${colors.outline}`,
        }
      : tail === "right"
      ? {
          right: -tailSize / 2 + 2,
          top: `calc(${tailPos * 100}% - ${tailSize / 2}px)`,
          background: colors.body,
          borderBottom: `4px solid ${colors.outline}`,
          borderRight: `4px solid ${colors.outline}`,
        }
      : tail === "down"
      ? {
          bottom: -tailSize / 2 + 2,
          left: `calc(${tailPos * 100}% - ${tailSize / 2}px)`,
          background: colors.body,
          borderBottom: `4px solid ${colors.outline}`,
          borderLeft: `4px solid ${colors.outline}`,
        }
      : {};

  // Emote glyph (SVG) — pops in above the bubble
  const emoteProgress = spring({
    frame: frame - delay - 6,
    fps,
    config: { damping: 10, stiffness: 150, mass: 0.7 },
  });
  const emoteColor =
    emote === "heart"
      ? t.secondary
      : emote === "star"
      ? t.accent
      : emote === "exclamation"
      ? t.warning
      : emote === "question"
      ? t.tertiary
      : t.accent;

  const renderEmote = (): React.ReactNode => {
    if (emote === "none") return null;
    const size = 42;
    const glyph: React.ReactNode =
      emote === "star" ? (
        <svg viewBox="0 0 24 24" width={size} height={size}>
          <path d="M12 2l2.9 6.9L22 10l-5.5 4.8L18 22l-6-3.5L6 22l1.5-7.2L2 10l7.1-1.1z" fill={emoteColor} stroke="#ffffff" strokeWidth={1.5} />
        </svg>
      ) : emote === "heart" ? (
        <svg viewBox="0 0 24 24" width={size} height={size}>
          <path d="M12 21s-7.5-4.6-10-9.3C.4 8 2 4.5 5.2 4.5c2 0 3.4 1.2 4.8 3 1.4-1.8 2.8-3 4.8-3 3.2 0 4.8 3.5 3.2 7.2C19.5 16.4 12 21 12 21z" fill={emoteColor} stroke="#ffffff" strokeWidth={1.5} />
        </svg>
      ) : emote === "exclamation" ? (
        <svg viewBox="0 0 24 24" width={size} height={size}>
          <circle cx="12" cy="12" r="11" fill={emoteColor} stroke="#ffffff" strokeWidth={1.5} />
          <rect x="10.5" y="5" width="3" height="9" rx="1.5" fill="#ffffff" />
          <circle cx="12" cy="17.5" r="1.6" fill="#ffffff" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width={size} height={size}>
          <circle cx="12" cy="12" r="11" fill={emoteColor} stroke="#ffffff" strokeWidth={1.5} />
          <path d="M9 9.5a3 3 0 1 1 4.5 2.6c-.9.5-1.5 1-1.5 2.2" stroke="#ffffff" strokeWidth={2} fill="none" strokeLinecap="round" />
          <circle cx="12" cy="17.8" r="1.3" fill="#ffffff" />
        </svg>
      );
    return (
      <div
        style={{
          display: "flex",
          justifyContent: tail === "right" ? "flex-end" : "flex-start",
          marginBottom: 4,
          opacity: emoteProgress,
          transform: `scale(${0.3 + emoteProgress * 0.7}) rotate(${wobble * 6}deg)`,
        }}
      >
        {glyph}
      </div>
    );
  };

  // Speaker label pill
  const speakerProgress = spring({
    frame: frame - delay - 4,
    fps,
    config: { damping: 12, stiffness: 130, mass: 0.7 },
  });

  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: tail === "right" ? "flex-end" : "flex-start",
        maxWidth,
        opacity: progress,
        transform: `translate3d(${x}px, ${y}px, 0) scale(${scale}) rotate(${wobble}deg)`,
        ...style,
      }}
    >
      {/* Emote glyph */}
      {renderEmote()}

      {/* Speaker label */}
      {speaker && (
        <div
          style={{
            marginBottom: 6,
            opacity: speakerProgress,
            transform: `translateY(${(1 - speakerProgress) * -8}px)`,
          }}
        >
          <span
            style={{
              display: "inline-block",
              padding: "5px 14px",
              borderRadius: 999,
              background: colors.outline,
              color: "#ffffff",
              fontFamily: t.display,
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              boxShadow: t.cardShadow,
            }}
          >
            {speaker}
          </span>
        </div>
      )}

      {/* Bubble body */}
      <div
        style={{
          position: "relative",
          background: colors.body,
          color: colors.text,
          borderRadius: 28,
          padding: "18px 26px",
          fontFamily: t.display,
          fontSize,
          fontWeight: 600,
          lineHeight: 1.25,
          maxWidth,
          border: `4px solid ${colors.outline}`,
          boxShadow: "0 6px 20px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.12)",
        }}
      >
        {text}

        {/* Tail pointer */}
        {tail !== "none" && (
          <div
            style={{
              position: "absolute",
              width: tailSize,
              height: tailSize,
              borderRadius: 4,
              transform:
                tail === "left"
                  ? "rotate(45deg)"
                  : tail === "right"
                  ? "rotate(-45deg)"
                  : "rotate(45deg)",
              ...tailStyle,
            }}
          />
        )}
      </div>
    </div>
  );
};

// ─── KidsThoughtBubble — playful cartoon thought bubble overlay ──────────────
//
// Visually consistent with KidsSpeechBubble but clearly communicates a
// character's THOUGHTS rather than dialogue. Instead of a tail pointer, it
// uses the classic cartoon convention: a trail of 3 small circles that
// shrink toward the thinker, ending in a tiny "origin" dot.
//
//  - Rounded cloud-like bubble body (extra-rounded corners + a slightly
//    puffy outline) with the same color variants as KidsSpeechBubble
//  - 3 trailing thought circles of decreasing size, on the left/right/bottom
//    side, each springing in with a staggered bouncy pop
//  - Fredoka display font, same type scale as the speech bubble
//  - Optional speaker label pill above the bubble
//  - Optional emote glyph (star / heart / exclamation / question / lightbulb)
//    that pops in above the bubble — "lightbulb" is the natural choice for
//    "I have an idea!" thoughts
//  - Bouncy spring entrance + gentle floating drift (thoughts drift, they
//    don't wobble like speech)
//  - Reusable and configurable: position via `style`, side via `trailSide`,
//    size via `maxWidth` / `fontSize`

export type ThoughtBubbleVariant = "accent" | "white" | "coral" | "mint" | "sunshine";
export type ThoughtBubbleTrailSide = "left" | "right" | "down";
export type ThoughtBubbleEmote = "none" | "star" | "heart" | "exclamation" | "question" | "lightbulb";

export interface KidsThoughtBubbleProps {
  /** The thought line. Keep it short — internal monologue, not a paragraph. */
  text: string;
  theme?: ThemeConfig;
  delay?: number;
  /** Color variant. Same vocabulary as KidsSpeechBubble. Default "white". */
  variant?: ThoughtBubbleVariant;
  /** Which side the trailing thought circles appear on. Default "left". */
  trailSide?: ThoughtBubbleTrailSide;
  /** Optional thinker name shown as a small pill above the bubble. */
  speaker?: string;
  /** Optional playful emote glyph above the bubble. "lightbulb" = idea. Default "none". */
  emote?: ThoughtBubbleEmote;
  /** Max width in px before text wraps. Default 460. */
  maxWidth?: number;
  /** Font size in px. Default 30. */
  fontSize?: number;
  /** Entrance direction. Default "pop". */
  entrance?: "pop" | "up" | "left" | "right" | "scale";
  /** Style override (e.g. absolute positioning over the scene). */
  style?: React.CSSProperties;
}

export const KidsThoughtBubble: React.FC<KidsThoughtBubbleProps> = ({
  text,
  theme,
  delay = 0,
  variant = "white",
  trailSide = "left",
  speaker,
  emote = "none",
  maxWidth = 460,
  fontSize = 30,
  entrance = "pop",
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = getKidsTokens(theme);

  // Variant → body / text / outline colors (shared vocabulary with speech bubble)
  const palette: Record<ThoughtBubbleVariant, { body: string; text: string; outline: string }> = {
    accent: { body: t.accent, text: t.bright, outline: t.accentDeep },
    white: { body: "#ffffff", text: t.bright, outline: t.tertiary },
    coral: { body: t.secondary, text: "#ffffff", outline: "#e85a5a" },
    mint: { body: t.tertiary, text: "#ffffff", outline: "#3bb8af" },
    sunshine: { body: t.warning, text: "#ffffff", outline: t.accentDeep },
  };
  const colors = palette[variant] ?? palette.white!;

  // Bouncy spring entrance
  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 11, stiffness: 130, mass: 0.8 },
  });

  // Gentle floating drift — thoughts drift weightlessly (no wobble like speech)
  const drift = Math.sin((frame - delay) * 0.04) * 3;
  const driftY = Math.cos((frame - delay) * 0.035) * 2;

  // Entrance transform
  const x = entrance === "left" ? (1 - progress) * -40 : entrance === "right" ? (1 - progress) * 40 : 0;
  const y = entrance === "up" ? (1 - progress) * 30 : 0;
  const scale = entrance === "pop" ? 0.3 + progress * 0.7 : entrance === "scale" ? 0.6 + progress * 0.4 : 1;

  // Trailing thought circles — 3 circles of decreasing size + a tiny origin dot.
  // Each springs in with a staggered bouncy pop, after the bubble body appears.
  const trail = [
    { size: 22, offset: 26, delayOffset: 8 },
    { size: 15, offset: 52, delayOffset: 14 },
    { size: 9, offset: 74, delayOffset: 20 },
  ];

  const renderTrail = (): React.ReactNode => {
    if (trailSide === "down") {
      return (
        <div
          style={{
            position: "absolute",
            bottom: -8,
            left: "30%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
          }}
        >
          {trail.map((c, i) => {
            const p = spring({
              frame: frame - delay - c.delayOffset,
              fps,
              config: { damping: 10, stiffness: 150, mass: 0.6 },
            });
            return (
              <div
                key={i}
                style={{
                  width: c.size,
                  height: c.size,
                  borderRadius: "50%",
                  background: colors.body,
                  border: `3px solid ${colors.outline}`,
                  opacity: p,
                  transform: `scale(${0.2 + p * 0.8})`,
                  boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
                }}
              />
            );
          })}
        </div>
      );
    }
    // left or right
    const isRight = trailSide === "right";
    return (
      <div
        style={{
          position: "absolute",
          [isRight ? "right" : "left"]: -8,
          bottom: 18,
          display: "flex",
          flexDirection: isRight ? "row-reverse" : "row",
          alignItems: "center",
          gap: 4,
        }}
      >
        {trail.map((c, i) => {
          const p = spring({
            frame: frame - delay - c.delayOffset,
            fps,
            config: { damping: 10, stiffness: 150, mass: 0.6 },
          });
          return (
            <div
              key={i}
              style={{
                width: c.size,
                height: c.size,
                borderRadius: "50%",
                background: colors.body,
                border: `3px solid ${colors.outline}`,
                opacity: p,
                transform: `scale(${0.2 + p * 0.8}) translateY(${i * 4}px)`,
                boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
              }}
            />
          );
        })}
      </div>
    );
  };

  // Emote glyph (SVG) — pops in above the bubble. Adds "lightbulb" for ideas.
  const emoteProgress = spring({
    frame: frame - delay - 6,
    fps,
    config: { damping: 10, stiffness: 150, mass: 0.7 },
  });
  const emoteColor =
    emote === "heart"
      ? t.secondary
      : emote === "star"
      ? t.accent
      : emote === "exclamation"
      ? t.warning
      : emote === "question"
      ? t.tertiary
      : emote === "lightbulb"
      ? t.accent
      : t.accent;

  const renderEmote = (): React.ReactNode => {
    if (emote === "none") return null;
    const size = 42;
    const glyph: React.ReactNode =
      emote === "star" ? (
        <svg viewBox="0 0 24 24" width={size} height={size}>
          <path d="M12 2l2.9 6.9L22 10l-5.5 4.8L18 22l-6-3.5L6 22l1.5-7.2L2 10l7.1-1.1z" fill={emoteColor} stroke="#ffffff" strokeWidth={1.5} />
        </svg>
      ) : emote === "heart" ? (
        <svg viewBox="0 0 24 24" width={size} height={size}>
          <path d="M12 21s-7.5-4.6-10-9.3C.4 8 2 4.5 5.2 4.5c2 0 3.4 1.2 4.8 3 1.4-1.8 2.8-3 4.8-3 3.2 0 4.8 3.5 3.2 7.2C19.5 16.4 12 21 12 21z" fill={emoteColor} stroke="#ffffff" strokeWidth={1.5} />
        </svg>
      ) : emote === "exclamation" ? (
        <svg viewBox="0 0 24 24" width={size} height={size}>
          <circle cx="12" cy="12" r="11" fill={emoteColor} stroke="#ffffff" strokeWidth={1.5} />
          <rect x="10.5" y="5" width="3" height="9" rx="1.5" fill="#ffffff" />
          <circle cx="12" cy="17.5" r="1.6" fill="#ffffff" />
        </svg>
      ) : emote === "question" ? (
        <svg viewBox="0 0 24 24" width={size} height={size}>
          <circle cx="12" cy="12" r="11" fill={emoteColor} stroke="#ffffff" strokeWidth={1.5} />
          <path d="M9 9.5a3 3 0 1 1 4.5 2.6c-.9.5-1.5 1-1.5 2.2" stroke="#ffffff" strokeWidth={2} fill="none" strokeLinecap="round" />
          <circle cx="12" cy="17.8" r="1.3" fill="#ffffff" />
        </svg>
      ) : (
        // lightbulb — the "idea" emote, natural for thought bubbles
        <svg viewBox="0 0 24 24" width={size} height={size}>
          <path
            d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2v.3h6v-.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z"
            fill={emoteColor}
            stroke="#ffffff"
            strokeWidth={1.5}
          />
          <rect x="9.5" y="18" width="5" height="2" rx="1" fill="#ffffff" />
          <rect x="10" y="21" width="4" height="1.5" rx="0.75" fill="#ffffff" />
          <path d="M12 5v3M8.5 8.5l1.5 1.5M15.5 8.5L14 10" stroke="#ffffff" strokeWidth={1.2} strokeLinecap="round" />
        </svg>
      );
    return (
      <div
        style={{
          display: "flex",
          justifyContent: trailSide === "right" ? "flex-end" : "flex-start",
          marginBottom: 4,
          opacity: emoteProgress,
          transform: `scale(${0.3 + emoteProgress * 0.7}) translateY(${driftY}px)`,
        }}
      >
        {glyph}
      </div>
    );
  };

  // Speaker label pill
  const speakerProgress = spring({
    frame: frame - delay - 4,
    fps,
    config: { damping: 12, stiffness: 130, mass: 0.7 },
  });

  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: trailSide === "right" ? "flex-end" : "flex-start",
        maxWidth,
        opacity: progress,
        transform: `translate3d(${x + drift}px, ${y + driftY}px, 0) scale(${scale})`,
        ...style,
      }}
    >
      {/* Emote glyph */}
      {renderEmote()}

      {/* Speaker label */}
      {speaker && (
        <div
          style={{
            marginBottom: 6,
            opacity: speakerProgress,
            transform: `translateY(${(1 - speakerProgress) * -8}px)`,
          }}
        >
          <span
            style={{
              display: "inline-block",
              padding: "5px 14px",
              borderRadius: 999,
              background: colors.outline,
              color: "#ffffff",
              fontFamily: t.display,
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              boxShadow: t.cardShadow,
            }}
          >
            {speaker}
          </span>
        </div>
      )}

      {/* Bubble body — extra-rounded "cloud-like" corners distinguish thoughts from speech */}
      <div
        style={{
          position: "relative",
          background: colors.body,
          color: colors.text,
          borderRadius: 40,
          padding: "20px 28px",
          fontFamily: t.display,
          fontSize,
          fontWeight: 600,
          lineHeight: 1.25,
          maxWidth,
          border: `4px solid ${colors.outline}`,
          boxShadow: "0 6px 20px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.12)",
        }}
      >
        {text}

        {/* Trailing thought circles */}
        {renderTrail()}
      </div>
    </div>
  );
};

// ─── KidsCalloutCard — playful info/fact card overlay ────────────────────────
//
// A reusable, positionable callout card for fun facts, discoveries, important
// information, or short educational explanations over a full-bleed scene.
// Visually consistent with the speech and thought bubbles (same color
// vocabulary, Fredoka font, bouncy spring entrance, soft drop shadow) but
// clearly distinct: a flat-edged rounded card with a bold accent header bar
// and an optional icon badge, rather than a bubble with a tail or trail.
//
//  - Rounded card body with a 4px outline and soft drop shadow
//  - Bold accent header strip across the top (the "label" — e.g. "DID YOU
//    KNOW?", "DISCOVERY!", "FUN FACT!") in uppercase Fredoka
//  - Optional icon badge at the top-left of the header (star, lightbulb,
//    magnifying glass, exclamation, question, heart, info)
//  - Title (big, bold) + body text (slightly smaller, lighter weight)
//  - 5 color variants matching the bubble vocabulary
//  - Bouncy spring entrance with configurable direction + a gentle settle
//  - Optional footer line at the bottom of the card
//  - Reusable and configurable: position via `style`, size via `maxWidth`

export type CalloutCardVariant = "accent" | "white" | "coral" | "mint" | "sunshine";
export type CalloutCardIcon = "none" | "star" | "lightbulb" | "search" | "exclamation" | "question" | "heart" | "info";

export interface KidsCalloutCardProps {
  /** Big bold title line (the headline of the fact/discovery). */
  title: string;
  /** Body text — the explanation or fact. Keep it to 1-3 short sentences. */
  body?: string;
  theme?: ThemeConfig;
  delay?: number;
  /** Color variant. Same vocabulary as the bubbles. Default "white". */
  variant?: CalloutCardVariant;
  /** Header label text, e.g. "DID YOU KNOW?", "FUN FACT!", "DISCOVERY!". */
  label?: string;
  /** Optional icon badge in the header. Default "none". */
  icon?: CalloutCardIcon;
  /** Optional footer line at the bottom of the card. */
  footer?: string;
  /** Max width in px. Default 520. */
  maxWidth?: number;
  /** Title font size in px. Default 36. */
  titleFontSize?: number;
  /** Body font size in px. Default 24. */
  bodyFontSize?: number;
  /** Entrance direction. Default "up". */
  entrance?: "pop" | "up" | "left" | "right" | "scale";
  /** Style override (e.g. absolute positioning over the scene). */
  style?: React.CSSProperties;
}

export const KidsCalloutCard: React.FC<KidsCalloutCardProps> = ({
  title,
  body,
  theme,
  delay = 0,
  variant = "white",
  label,
  icon = "none",
  footer,
  maxWidth = 520,
  titleFontSize = 36,
  bodyFontSize = 24,
  entrance = "up",
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = getKidsTokens(theme);

  // Variant → card / text / header / outline colors
  const palette: Record<CalloutCardVariant, {
    card: string;
    text: string;
    header: string;
    headerText: string;
    outline: string;
  }> = {
    accent: { card: "#ffffff", text: t.bright, header: t.accent, headerText: t.bright, outline: t.accentDeep },
    white: { card: "#ffffff", text: t.bright, header: t.tertiary, headerText: "#ffffff", outline: t.tertiary },
    coral: { card: "#ffffff", text: t.bright, header: t.secondary, headerText: "#ffffff", outline: "#e85a5a" },
    mint: { card: "#ffffff", text: t.bright, header: t.tertiary, headerText: "#ffffff", outline: "#3bb8af" },
    sunshine: { card: "#ffffff", text: t.bright, header: t.warning, headerText: "#ffffff", outline: t.accentDeep },
  };
  const colors = palette[variant] ?? palette.white!;

  // Bouncy spring entrance
  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 12, stiffness: 120, mass: 0.85 },
  });

  // Gentle settle — a small decaying bounce after entrance
  const settle = Math.sin((frame - delay - 10) * 0.15) * Math.exp(-Math.max(0, frame - delay - 10) * 0.05) * 1.2;

  // Entrance transform
  const x = entrance === "left" ? (1 - progress) * -50 : entrance === "right" ? (1 - progress) * 50 : 0;
  const y = entrance === "up" ? (1 - progress) * 40 : 0;
  const scale = entrance === "pop" ? 0.4 + progress * 0.6 : entrance === "scale" ? 0.7 + progress * 0.3 : 1;

  // Staggered content entrance
  const titleProgress = spring({
    frame: frame - delay - 8,
    fps,
    config: { damping: 13, stiffness: 120, mass: 0.7 },
  });
  const bodyProgress = spring({
    frame: frame - delay - 16,
    fps,
    config: { damping: 14, stiffness: 110, mass: 0.7 },
  });
  const footerProgress = spring({
    frame: frame - delay - 22,
    fps,
    config: { damping: 14, stiffness: 100, mass: 0.7 },
  });

  // Icon badge — inline SVG, themed to the header color
  const renderIcon = (): React.ReactNode => {
    if (icon === "none") return null;
    const size = 28;
    const iconColor = colors.headerText;
    const glyphs: Record<Exclude<CalloutCardIcon, "none">, React.ReactNode> = {
      star: (
        <svg viewBox="0 0 24 24" width={size} height={size}>
          <path d="M12 2l2.9 6.9L22 10l-5.5 4.8L18 22l-6-3.5L6 22l1.5-7.2L2 10l7.1-1.1z" fill={iconColor} />
        </svg>
      ),
      lightbulb: (
        <svg viewBox="0 0 24 24" width={size} height={size}>
          <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2v.3h6v-.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z" fill={iconColor} />
          <rect x="9.5" y="18" width="5" height="2" rx="1" fill={iconColor} />
          <rect x="10" y="21" width="4" height="1.5" rx="0.75" fill={iconColor} />
        </svg>
      ),
      search: (
        <svg viewBox="0 0 24 24" width={size} height={size}>
          <circle cx="10.5" cy="10.5" r="7" fill="none" stroke={iconColor} strokeWidth={2.5} />
          <path d="M16 16l5 5" stroke={iconColor} strokeWidth={2.5} strokeLinecap="round" />
        </svg>
      ),
      exclamation: (
        <svg viewBox="0 0 24 24" width={size} height={size}>
          <circle cx="12" cy="12" r="11" fill={iconColor} />
          <rect x="10.5" y="5" width="3" height="9" rx="1.5" fill={colors.header} />
          <circle cx="12" cy="17.5" r="1.6" fill={colors.header} />
        </svg>
      ),
      question: (
        <svg viewBox="0 0 24 24" width={size} height={size}>
          <circle cx="12" cy="12" r="11" fill={iconColor} />
          <path d="M9 9.5a3 3 0 1 1 4.5 2.6c-.9.5-1.5 1-1.5 2.2" stroke={colors.header} strokeWidth={2} fill="none" strokeLinecap="round" />
          <circle cx="12" cy="17.8" r="1.3" fill={colors.header} />
        </svg>
      ),
      heart: (
        <svg viewBox="0 0 24 24" width={size} height={size}>
          <path d="M12 21s-7.5-4.6-10-9.3C.4 8 2 4.5 5.2 4.5c2 0 3.4 1.2 4.8 3 1.4-1.8 2.8-3 4.8-3 3.2 0 4.8 3.5 3.2 7.2C19.5 16.4 12 21 12 21z" fill={iconColor} />
        </svg>
      ),
      info: (
        <svg viewBox="0 0 24 24" width={size} height={size}>
          <circle cx="12" cy="12" r="11" fill={iconColor} />
          <rect x="10.5" y="10" width="3" height="8" rx="1.5" fill={colors.header} />
          <circle cx="12" cy="7" r="1.6" fill={colors.header} />
        </svg>
      ),
    };
    return glyphs[icon] ?? null;
  };

  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        maxWidth,
        opacity: progress,
        transform: `translate3d(${x}px, ${y}px, 0) scale(${scale}) rotate(${settle}deg)`,
        ...style,
      }}
    >
      <div
        style={{
          background: colors.card,
          color: colors.text,
          borderRadius: 24,
          overflow: "hidden",
          border: `4px solid ${colors.outline}`,
          boxShadow: "0 8px 24px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.12)",
        }}
      >
        {/* Header strip — bold accent bar with optional icon + label */}
        {(label || icon !== "none") && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 20px",
              background: colors.header,
              color: colors.headerText,
            }}
          >
            {renderIcon()}
            {label && (
              <span
                style={{
                  fontFamily: t.display,
                  fontSize: 18,
                  fontWeight: 700,
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                }}
              >
                {label}
              </span>
            )}
          </div>
        )}

        {/* Body — title + optional body text + optional footer */}
        <div style={{ padding: "20px 24px" }}>
          <div
            style={{
              opacity: titleProgress,
              transform: `translateY(${(1 - titleProgress) * 12}px)`,
            }}
          >
            <h3
              style={{
                fontFamily: t.display,
                fontSize: titleFontSize,
                fontWeight: 700,
                lineHeight: 1.15,
                color: colors.text,
                margin: 0,
              }}
            >
              {title}
            </h3>
          </div>

          {body && (
            <div
              style={{
                marginTop: 12,
                opacity: bodyProgress,
                transform: `translateY(${(1 - bodyProgress) * 10}px)`,
              }}
            >
              <p
                style={{
                  fontFamily: t.sans,
                  fontSize: bodyFontSize,
                  fontWeight: 600,
                  lineHeight: 1.35,
                  color: t.mid,
                  margin: 0,
                }}
              >
                {body}
              </p>
            </div>
          )}

          {footer && (
            <div
              style={{
                marginTop: 14,
                paddingTop: 12,
                borderTop: `2px dashed ${colors.outline}`,
                opacity: footerProgress,
              }}
            >
              <span
                style={{
                  fontFamily: t.sans,
                  fontSize: 16,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  color: t.dim,
                }}
              >
                {footer}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── KidsCaptionStrip — narration/label caption overlay ─────────────────────
//
// A reusable, positionable caption strip for short narration captions, scene
// labels, educational subtitles, or important story text over a full-bleed
// scene. Designed to integrate naturally over the visual — a slim, semi-
// opaque rounded bar that sits at the top, center, or bottom of the frame,
// with a subtle built-in scrim for legibility (no separate white panel).
//
//  - Slim rounded bar with a semi-translucent background (theme-tinted) so
//    the scene shows through subtly — never an opaque white panel
//  - Optional accent edge (left bar or underline) for a playful pop of color
//  - Optional small label pill on the left (e.g. "NARRATOR", "FACT", "SCENE 3")
//  - Fredoka display font for the caption text, generous line-height
//  - Bouncy spring entrance with configurable direction
//  - Optional gentle pulse on the accent edge to draw the eye
//  - 5 color variants matching the overlay vocabulary
//  - Positionable via `position` (top | center | bottom) or `style` override
//
// Compose with KidsSceneCanvas's overlay layer. For text-heavy scenes, pair
// with KidsScrim for extra legibility. The strip's own background is tuned
// to be readable on its own over most bright kids imagery.

export type CaptionStripVariant = "accent" | "white" | "coral" | "mint" | "sunshine";
export type CaptionStripPosition = "top" | "center" | "bottom";
export type CaptionStripEdge = "none" | "left" | "underline";

export interface KidsCaptionStripProps {
  /** The caption text. Keep it to 1-2 short lines. */
  text: string;
  theme?: ThemeConfig;
  delay?: number;
  /** Color variant. Same vocabulary as the other overlays. Default "white". */
  variant?: CaptionStripVariant;
  /** Where the strip anchors in the frame. Default "bottom". */
  position?: CaptionStripPosition;
  /** Accent edge style for a pop of color. Default "left". */
  edge?: CaptionStripEdge;
  /** Optional small label pill on the left (e.g. "NARRATOR", "SCENE 3"). */
  label?: string;
  /** Max width in px. Default 600. */
  maxWidth?: number;
  /** Font size in px. Default 30. */
  fontSize?: number;
  /** Entrance direction. Default "up". */
  entrance?: "up" | "left" | "right" | "scale" | "fade";
  /** Pulse the accent edge gently. Default true. */
  pulseEdge?: boolean;
  /** Style override (e.g. absolute positioning). */
  style?: React.CSSProperties;
}

export const KidsCaptionStrip: React.FC<KidsCaptionStripProps> = ({
  text,
  theme,
  delay = 0,
  variant = "white",
  position = "bottom",
  edge = "left",
  label,
  maxWidth = 600,
  fontSize = 30,
  entrance = "up",
  pulseEdge = true,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = getKidsTokens(theme);

  // Variant → strip bg / text / accent colors
  // The strip background is always semi-translucent so the scene shows through.
  // Light-background variants (white, accent) use dark text for legibility
  // regardless of the theme's text.bright color (which may be light for dark themes).
  const palette: Record<CaptionStripVariant, { bg: string; text: string; accent: string }> = {
    accent: { bg: `rgba(255,217,61,0.95)`, text: "#1a1a2e", accent: t.accentDeep },
    white: { bg: `rgba(255,255,255,0.95)`, text: "#1a1a2e", accent: t.secondary },
    coral: { bg: `rgba(255,107,107,0.95)`, text: "#ffffff", accent: "#e85a5a" },
    mint: { bg: `rgba(78,205,196,0.95)`, text: "#ffffff", accent: "#3bb8af" },
    sunshine: { bg: `rgba(255,159,67,0.95)`, text: "#ffffff", accent: t.accentDeep },
  };
  const colors = palette[variant] ?? palette.white!;

  // Bouncy spring entrance
  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 13, stiffness: 120, mass: 0.85 },
  });

  // Entrance transform
  const x = entrance === "left" ? (1 - progress) * -60 : entrance === "right" ? (1 - progress) * 60 : 0;
  const y = entrance === "up" ? (1 - progress) * 30 : 0;
  const scale = entrance === "scale" ? 0.85 + progress * 0.15 : 1;

  // Gentle accent edge pulse — a slow sinusoidal opacity/width wave
  const pulseTravel = interpolate(frame, [delay, Math.max(delay + 1, durationInFrames)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const edgePulse = pulseEdge ? 0.7 + Math.sin((frame - delay) * 0.08) * 0.3 : 1;

  // Position anchoring
  const positionStyle: React.CSSProperties =
    position === "top"
      ? { top: 40, bottom: "auto" }
      : position === "center"
      ? { top: "50%", transform: "translateY(-50%)" }
      : { bottom: 40, top: "auto" };

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        ...positionStyle,
        opacity: progress,
        zIndex: 10,
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          maxWidth,
          width: "max-content",
          padding: "14px 24px",
          borderRadius: 18,
          background: colors.bg,
          color: colors.text,
          backdropFilter: "blur(6px)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.16), 0 1px 4px rgba(0,0,0,0.10)",
          transform: `translate3d(${x}px, ${y}px, 0) scale(${scale})`,
        }}
      >
        {/* Accent edge — left bar */}
        {edge === "left" && (
          <div
            style={{
              flexShrink: 0,
              width: 6,
              alignSelf: "stretch",
              borderRadius: 999,
              background: colors.accent,
              opacity: edgePulse,
              transform: `scaleY(${0.9 + pulseTravel * 0.1})`,
            }}
          />
        )}

        {/* Optional label pill */}
        {label && (
          <span
            style={{
              flexShrink: 0,
              display: "inline-block",
              padding: "5px 14px",
              borderRadius: 999,
              background: colors.accent,
              color: variant === "white" || variant === "accent" ? t.bright : "#ffffff",
              fontFamily: t.display,
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            {label}
          </span>
        )}

        {/* Caption text */}
        <span
          style={{
            fontFamily: t.display,
            fontSize,
            fontWeight: 600,
            lineHeight: 1.25,
            color: colors.text,
            textShadow: variant === "white" || variant === "accent" ? "0 1px 2px rgba(0,0,0,0.08)" : "0 1px 4px rgba(0,0,0,0.25)",
          }}
        >
          {text}
        </span>

        {/* Accent edge — underline */}
        {edge === "underline" && (
          <div
            style={{
              position: "absolute",
              bottom: 6,
              left: 24,
              right: 24,
              height: 4,
              borderRadius: 999,
              background: colors.accent,
              opacity: edgePulse * 0.8,
              transform: `scaleX(${0.85 + pulseTravel * 0.15})`,
              transformOrigin: "left",
            }}
          />
        )}
      </div>
    </div>
  );
};
