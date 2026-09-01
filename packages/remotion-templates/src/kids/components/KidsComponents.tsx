/**
 * Kids namespace components — bright, playful, energetic.
 *
 * Design principles:
 * 1. SPLIT LAYOUT — image fills the top ~55% (fully visible, Ken Burns zoom,
 *    rounded bottom corners), text sits on a bright white rounded panel at the
 *    bottom ~45%. Both are clearly visible. (Handled by KidsCanvas.)
 * 2. Fredoka (loaded via @remotion/google-fonts) for ALL display/title text.
 *    Nunito for body text and labels. Rounded, friendly, readable.
 * 3. Consistent type scale:
 *    - Title:      64px Fredoka, weight 600, lineHeight 1.05
 *    - Headline:   44px Fredoka, weight 600, lineHeight 1.1   (questions, big statements)
 *    - Statement:  34px Fredoka, weight 500, lineHeight 1.2   (facts, clues, fun facts)
 *    - Body:       26px Nunito, weight 600, lineHeight 1.35   (context, explanations)
 *    - Caption:    28px Fredoka, weight 500, lineHeight 1.25  (image captions)
 *    - List item:  30px Fredoka, weight 600, lineHeight 1.2
 *    - Number:     120px Fredoka, weight 700, lineHeight 0.9  (big stats)
 *    - Label:      16px Fredoka, weight 600, letterSpacing 1.5, uppercase
 *    - Footer:     14px Nunito, weight 700, letterSpacing 0.5
 * 4. Bouncy spring entrances — kids content should feel alive and playful.
 *    Use spring() with playful damping/stiffness. No quiet fades.
 * 5. One bold accent color per frame — a pill, a dot, a badge.
 * 6. Happy, warm, inviting — never dark or gloomy.
 * 7. Stagger multi-element entrances by i * 8 frames for playful pop-in.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate, Easing } from "remotion";
import type { ThemeConfig } from "../../themes/index.ts";
import {
  KidsCanvas,
  KidsSceneCanvas,
  KidsScrim,
  KidsCaptionStrip,
  KidsCalloutCard,
  KidsReveal,
  getKidsTokens,
  type KidsImageData,
} from "../canvas.tsx";

// ─── 1. KidsTitleCard — big playful opening title (full-bleed) ──────────────

export interface KidsTitleCardData extends KidsImageData {
  title: string;
  subtitle?: string;
  /** A hook question/statement that grabs attention (shown in first 2s) */
  hook?: string;
  /** Label pill text, e.g. "FUN FACTS!", "DID YOU KNOW?" */
  label?: string;
}

export const KidsTitleCard: React.FC<{ data: KidsTitleCardData; theme?: ThemeConfig; delay?: number }> = ({ data, theme, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = getKidsTokens(theme);

  // Staggered spring entrances — hook → title → subtitle
  const hookProgress = spring({ frame: frame - delay - 6, fps, config: { damping: 13, stiffness: 120 } });
  const titleProgress = spring({ frame: frame - delay - 18, fps, config: { damping: 12, stiffness: 110 } });
  const subtitleProgress = spring({ frame: frame - delay - 30, fps, config: { damping: 14, stiffness: 100 } });

  // Gentle title "breathing" — a slow scale pulse so the title feels alive
  const breathe = 1 + Math.sin((frame - delay) * 0.04) * 0.015;

  // Scrim strength adapts: stronger at start for the title reveal, eases slightly
  const scrimTravel = interpolate(frame, [delay, Math.max(delay + 1, durationInFrames)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const scrimStrength = 0.7 - scrimTravel * 0.1;

  return (
    <KidsSceneCanvas
      theme={theme}
      delay={delay}
      imageUrl={data.imageUrl}
      imageAlt={data.imageAlt}
      imageFocalPoint={data.imageFocalPoint}
      imageTreatment={data.imageTreatment ?? "bright"}
      kenBurns="in"
      kenBurnsPan="right"
      zoomIntensity={0.14}
      scrim="both"
      scrimStrength={scrimStrength}
      overlay="center"
      overlayPadding={56}
      label={data.label}
      labelPosition="top-center"
      labelColor={t.secondary}
      decorations={true}
      overlayStyle={{ alignItems: "center", textAlign: "center" }}
    >
      {/* Hook — appears first, in the secondary accent color */}
      {data.hook && (
        <div style={{
          opacity: hookProgress,
          transform: `translateY(${(1 - hookProgress) * 20}px) scale(${0.9 + hookProgress * 0.1})`,
          marginBottom: 28,
        }}>
          <p style={{
            fontFamily: t.display,
            fontSize: 36,
            fontWeight: 600,
            lineHeight: 1.15,
            color: "#ffffff",
            margin: 0,
            maxWidth: 560,
            textShadow: "0 2px 12px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.4)",
          }}>
            {data.hook}
          </p>
        </div>
      )}

      {/* Title — big, bold, with a layered text-shadow for legibility over any image */}
      <div style={{
        opacity: titleProgress,
        transform: `translateY(${(1 - titleProgress) * 24}px) scale(${(0.85 + titleProgress * 0.15) * breathe})`,
      }}>
        <h1 style={{
          fontFamily: t.display,
          fontSize: 68,
          fontWeight: 700,
          lineHeight: 1.05,
          color: "#ffffff",
          margin: 0,
          textShadow: `0 4px 0 ${t.accentDeep}, 0 6px 20px rgba(0,0,0,0.6), 0 2px 4px rgba(0,0,0,0.5)`,
        }}>
          {data.title}
        </h1>
      </div>

      {/* Subtitle — appears last, softer */}
      {data.subtitle && (
        <div style={{
          marginTop: 24,
          opacity: subtitleProgress,
          transform: `translateY(${(1 - subtitleProgress) * 16}px)`,
        }}>
          <p style={{
            fontFamily: t.sans,
            fontSize: 28,
            fontWeight: 700,
            lineHeight: 1.35,
            color: "rgba(255,255,255,0.92)",
            margin: 0,
            textShadow: "0 2px 8px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.4)",
          }}>
            {data.subtitle}
          </p>
        </div>
      )}
    </KidsSceneCanvas>
  );
};

// ─── 2. KidsImageReveal — full-bleed image with playful caption ─────────────

export interface KidsImageRevealData extends KidsImageData {
  caption?: string;
  label?: string;
  footer?: string;
}

export const KidsImageReveal: React.FC<{ data: KidsImageRevealData; theme?: ThemeConfig; delay?: number }> = ({ data, theme, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = getKidsTokens(theme);

  // Caption springs in slightly after the image reveal begins
  const captionProgress = spring({ frame: frame - delay - 16, fps, config: { damping: 13, stiffness: 115 } });

  return (
    <KidsSceneCanvas
      theme={theme}
      delay={delay}
      imageUrl={data.imageUrl}
      imageAlt={data.imageAlt}
      imageFocalPoint={data.imageFocalPoint}
      imageTreatment={data.imageTreatment ?? "bright"}
      kenBurns="in"
      kenBurnsPan="right"
      zoomIntensity={0.12}
      scrim="bottom"
      scrimStrength={0.5}
      overlay="bottom"
      overlayPadding={48}
      label={data.label}
      labelPosition="top-left"
      footer={data.footer}
      decorations={false}
    >
      {data.caption && (
        <div style={{
          opacity: captionProgress,
          transform: `translateY(${(1 - captionProgress) * 20}px) scale(${0.92 + captionProgress * 0.08})`,
        }}>
          <p style={{
            fontFamily: t.display,
            fontSize: 36,
            fontWeight: 600,
            lineHeight: 1.2,
            color: "#ffffff",
            margin: 0,
            maxWidth: 600,
            textAlign: "left",
            textShadow: "0 2px 12px rgba(0,0,0,0.6), 0 1px 4px rgba(0,0,0,0.5)",
          }}>
            {data.caption}
          </p>
        </div>
      )}
    </KidsSceneCanvas>
  );
};

// ─── 3. KidsQuestion — engaging question over full-bleed scene ─────────────

export interface KidsQuestionData extends KidsImageData {
  question: string;
  context?: string;
  label?: string;
  footer?: string;
}

export const KidsQuestion: React.FC<{ data: KidsQuestionData; theme?: ThemeConfig; delay?: number }> = ({ data, theme, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = getKidsTokens(theme);

  // Staggered entrances — context fades in, then the question pops with a "?" emote
  const contextProgress = spring({ frame: frame - delay - 4, fps, config: { damping: 14, stiffness: 110 } });
  const questionProgress = spring({ frame: frame - delay - 14, fps, config: { damping: 12, stiffness: 120 } });

  // Gentle question "float" — a subtle vertical drift so the question feels alive
  const float = Math.sin((frame - delay) * 0.05) * 2;

  return (
    <KidsSceneCanvas
      theme={theme}
      delay={delay}
      imageUrl={data.imageUrl}
      imageAlt={data.imageAlt}
      imageFocalPoint={data.imageFocalPoint}
      imageTreatment={data.imageTreatment ?? "bright"}
      kenBurns="in"
      kenBurnsPan="right"
      zoomIntensity={0.1}
      scrim="bottom"
      scrimStrength={0.6}
      overlay="bottom"
      overlayPadding={48}
      label={data.label ?? "QUESTION!"}
      labelPosition="top-left"
      labelColor={t.tertiary}
      footer={data.footer}
      decorations={false}
    >
      <div style={{ textAlign: "left", transform: `translateY(${float}px)` }}>
        {/* Context line — appears first, softer */}
        {data.context && (
          <div style={{ opacity: contextProgress, marginBottom: 18 }}>
            <p style={{
              fontFamily: t.sans, fontSize: 28, fontWeight: 700, lineHeight: 1.35,
              color: "rgba(255,255,255,0.88)", margin: 0, maxWidth: 580,
              textShadow: "0 2px 8px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.4)",
            }}>
              {data.context}
            </p>
          </div>
        )}

        {/* Question — big, bold, with a playful "?" accent and layered shadow */}
        <div style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          opacity: questionProgress,
          transform: `translateY(${(1 - questionProgress) * 20}px) scale(${0.9 + questionProgress * 0.1})`,
        }}>
          {/* Big "?" glyph in the tertiary accent — pops the question feel */}
          <span style={{
            fontFamily: t.display,
            fontSize: 56,
            fontWeight: 700,
            lineHeight: 0.9,
            color: t.tertiary,
            textShadow: `0 3px 0 ${t.accentDeep}, 0 4px 16px rgba(0,0,0,0.5)`,
            flexShrink: 0,
          }}>
            ?
          </span>
          <p style={{
            fontFamily: t.display, fontSize: 46, fontWeight: 600, lineHeight: 1.1,
            color: "#ffffff", margin: 0, maxWidth: 540,
            textShadow: "0 3px 12px rgba(0,0,0,0.6), 0 1px 3px rgba(0,0,0,0.5)",
          }}>
            {data.question}
          </p>
        </div>
      </div>
    </KidsSceneCanvas>
  );
};

// ─── 4. KidsFunFact — playful discovery over full-bleed scene ───────────────

export interface KidsFunFactData extends KidsImageData {
  /** The fun fact statement */
  fact: string;
  /** Optional "Did you know?" style prefix shown as a highlight */
  highlight?: string;
  label?: string;
  footer?: string;
}

export const KidsFunFact: React.FC<{ data: KidsFunFactData; theme?: ThemeConfig; delay?: number }> = ({ data, theme, delay = 0 }) => {
  const t = getKidsTokens(theme);

  // The highlight text becomes the callout card's label header.
  // If no highlight is provided, default to "DID YOU KNOW?".
  const cardLabel = data.highlight ?? "DID YOU KNOW?";

  return (
    <KidsSceneCanvas
      theme={theme}
      delay={delay}
      imageUrl={data.imageUrl}
      imageAlt={data.imageAlt}
      imageFocalPoint={data.imageFocalPoint}
      imageTreatment={data.imageTreatment ?? "vivid"}
      kenBurns="in"
      kenBurnsPan="right"
      zoomIntensity={0.12}
      scrim="bottom"
      scrimStrength={0.5}
      overlay="bottom"
      overlayPadding={48}
      label={data.label ?? "FUN FACT!"}
      labelPosition="top-left"
      labelColor={t.secondary}
      footer={data.footer}
      decorations={false}
    >
      {/* Callout card — the fact lives in a playful, structured card that
          feels like a "discovery" popping up over the scene. The lightbulb
          icon reinforces the "aha!" moment. */}
      <KidsCalloutCard
        theme={theme}
        delay={delay + 8}
        title={data.fact}
        variant="white"
        label={cardLabel}
        icon="lightbulb"
        entrance="up"
        maxWidth={560}
        titleFontSize={34}
        style={{ alignSelf: "center" }}
      />
    </KidsSceneCanvas>
  );
};

// ─── 5. KidsNumberStat — big animated number over full-bleed scene ──────────

export interface KidsNumberStatData extends KidsImageData {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  /** What the number represents */
  label: string;
  /** A sentence explaining the number */
  context?: string;
  label2?: string;
  footer?: string;
}

export const KidsNumberStat: React.FC<{ data: KidsNumberStatData; theme?: ThemeConfig; delay?: number }> = ({ data, theme, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = getKidsTokens(theme);

  const countProgress = interpolate(frame - delay - 8, [0, 30], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic),
  });
  const currentValue = data.value * countProgress;
  const formatted = currentValue.toLocaleString("en-US", {
    minimumFractionDigits: data.decimals ?? 0,
    maximumFractionDigits: data.decimals ?? 0,
  });

  const labelProgress = spring({ frame: frame - delay - 4, fps, config: { damping: 13, stiffness: 120 } });
  const contextProgress = spring({ frame: frame - delay - 24, fps, config: { damping: 14, stiffness: 100 } });

  // Gentle number "pulse" — a slow scale breath so the big number feels alive
  const pulse = 1 + Math.sin((frame - delay) * 0.06) * 0.02;

  return (
    <KidsSceneCanvas
      theme={theme}
      delay={delay}
      imageUrl={data.imageUrl}
      imageAlt={data.imageAlt}
      imageFocalPoint={data.imageFocalPoint}
      imageTreatment={data.imageTreatment ?? "bright"}
      kenBurns="in"
      kenBurnsPan="right"
      zoomIntensity={0.1}
      scrim="full"
      scrimStrength={0.45}
      overlay="center"
      overlayPadding={56}
      label={data.label2 ?? "WOW!"}
      labelPosition="top-center"
      labelColor={t.warning}
      footer={data.footer}
      decorations={false}
      overlayStyle={{ alignItems: "center", textAlign: "center" }}
    >
      {/* Label — what the number represents */}
      <div style={{
        opacity: labelProgress,
        marginBottom: 16,
      }}>
        <p style={{
          fontFamily: t.display, fontSize: 26, fontWeight: 600,
          color: t.accent, margin: 0,
          textShadow: "0 2px 8px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.4)",
        }}>
          {data.label}
        </p>
      </div>

      {/* The number — Fredoka, huge, count-up animation, with a layered shadow */}
      <div style={{
        fontFamily: t.display, fontSize: 140, fontWeight: 700, color: "#ffffff",
        lineHeight: 0.9, letterSpacing: -3,
        opacity: countProgress,
        fontVariantNumeric: "tabular-nums",
        transform: `scale(${pulse})`,
        textShadow: `0 6px 0 ${t.accentDeep}, 0 8px 24px rgba(0,0,0,0.6), 0 3px 8px rgba(0,0,0,0.5)`,
      }}>
        {data.prefix}{formatted}{data.suffix}
      </div>

      {/* Context — appears after the number finishes counting */}
      {data.context && (
        <p style={{
          fontFamily: t.sans, fontSize: 28, fontWeight: 700, lineHeight: 1.35,
          color: "rgba(255,255,255,0.92)", margin: 0, marginTop: 28, maxWidth: 540,
          opacity: contextProgress,
          textShadow: "0 2px 8px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.4)",
        }}>
          {data.context}
        </p>
      )}
    </KidsSceneCanvas>
  );
};

// ─── 6. KidsTimeline — steps with playful dots over full-bleed scene ────────

export interface KidsTimelineData extends KidsImageData {
  title?: string;
  steps: Array<{
    label: string;
    title: string;
    detail?: string;
  }>;
  label2?: string;
  footer?: string;
}

export const KidsTimeline: React.FC<{ data: KidsTimelineData; theme?: ThemeConfig; delay?: number }> = ({ data, theme, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = getKidsTokens(theme);

  return (
    <KidsSceneCanvas
      theme={theme}
      delay={delay}
      imageUrl={data.imageUrl}
      imageAlt={data.imageAlt}
      imageFocalPoint={data.imageFocalPoint}
      imageTreatment={data.imageTreatment ?? "bright"}
      kenBurns="in"
      kenBurnsPan="right"
      zoomIntensity={0.1}
      scrim="bottom"
      scrimStrength={0.62}
      overlay="bottom"
      overlayPadding={48}
      label={data.label2 ?? "STEPS!"}
      labelPosition="top-left"
      labelColor={t.success}
      footer={data.footer}
      decorations={false}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {data.title && (
          <KidsReveal delay={delay + 4} direction="up" theme={theme}>
            <h2 style={{
              fontFamily: t.display, fontSize: 42, fontWeight: 600, color: "#ffffff",
              margin: 0, marginBottom: 24, lineHeight: 1.1,
              textShadow: "0 3px 12px rgba(0,0,0,0.6), 0 1px 3px rgba(0,0,0,0.5)",
            }}>
              {data.title}
            </h2>
          </KidsReveal>
        )}

        {/* Timeline with thick playful line */}
        <div style={{ position: "relative", paddingLeft: 36 }}>
          <div style={{
            position: "absolute", left: 8, top: 10, bottom: 10, width: 4,
            background: t.tertiary, borderRadius: 999,
            boxShadow: `0 0 12px ${t.tertiary}66`,
          }} />

          {data.steps.map((step, i) => {
            const stepDelay = delay + 10 + i * 8;
            const stepProgress = spring({ frame: frame - stepDelay, fps, config: { damping: 12, stiffness: 130 } });
            const dotColor = [t.accent, t.secondary, t.tertiary, t.success, t.warning][i % 5];

            return (
              <div key={i} style={{
                position: "relative",
                paddingBottom: i < data.steps.length - 1 ? 22 : 0,
                opacity: stepProgress,
                transform: `translateX(${(1 - stepProgress) * -16}px) scale(${0.9 + stepProgress * 0.1})`,
              }}>
                {/* Big playful dot on the line — with a glow for visibility over the image */}
                <div style={{
                  position: "absolute", left: -36, top: 4, width: 20, height: 20,
                  borderRadius: "50%",
                  background: dotColor ?? t.accent,
                  border: `3px solid #ffffff`,
                  boxShadow: `0 2px 8px rgba(0,0,0,0.3), 0 0 12px ${dotColor ?? t.accent}88`,
                }} />

                <div style={{
                  fontFamily: t.display, fontSize: 16, fontWeight: 700,
                  letterSpacing: 1, textTransform: "uppercase",
                  color: dotColor ?? t.accent, marginBottom: 4,
                  textShadow: "0 1px 4px rgba(0,0,0,0.5)",
                }}>
                  {step.label}
                </div>
                <div style={{
                  fontFamily: t.display, fontSize: 30, fontWeight: 600,
                  color: "#ffffff", lineHeight: 1.15, marginBottom: step.detail ? 4 : 0,
                  textShadow: "0 2px 8px rgba(0,0,0,0.6), 0 1px 2px rgba(0,0,0,0.4)",
                }}>
                  {step.title}
                </div>
                {step.detail && (
                  <div style={{
                    fontFamily: t.sans, fontSize: 22, fontWeight: 600,
                    color: "rgba(255,255,255,0.88)", lineHeight: 1.35,
                    textShadow: "0 1px 4px rgba(0,0,0,0.5)",
                  }}>
                    {step.detail}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </KidsSceneCanvas>
  );
};

// ─── 7. KidsQuote — memorable character/story moment over full-bleed scene ──

export interface KidsQuoteData extends KidsImageData {
  quote: string;
  speaker: string;
  role?: string;
  label?: string;
  footer?: string;
}

export const KidsQuote: React.FC<{ data: KidsQuoteData; theme?: ThemeConfig; delay?: number }> = ({ data, theme, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = getKidsTokens(theme);

  const quoteProgress = spring({ frame: frame - delay - 8, fps, config: { damping: 12, stiffness: 115 } });
  const attrProgress = spring({ frame: frame - delay - 20, fps, config: { damping: 14, stiffness: 100 } });

  // Gentle quote "float" — a subtle drift so the quote feels like a living moment
  const float = Math.sin((frame - delay) * 0.035) * 2;
  const floatY = Math.cos((frame - delay) * 0.03) * 1.5;

  // Big quotation mark has its own bouncy entrance + slow rotation
  const markProgress = spring({ frame: frame - delay - 4, fps, config: { damping: 10, stiffness: 140, mass: 0.7 } });
  const markRotate = Math.sin((frame - delay) * 0.02) * 4;

  return (
    <KidsSceneCanvas
      theme={theme}
      delay={delay}
      imageUrl={data.imageUrl}
      imageAlt={data.imageAlt}
      imageFocalPoint={data.imageFocalPoint}
      imageTreatment={data.imageTreatment ?? "soft"}
      kenBurns="in"
      kenBurnsPan="right"
      zoomIntensity={0.1}
      scrim="both"
      scrimStrength={0.55}
      overlay="center"
      overlayPadding={56}
      label={data.label}
      labelPosition="top-left"
      labelColor={t.accent}
      footer={data.footer}
      decorations={false}
    >
      <div style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        transform: `translate(${float}px, ${floatY}px)`,
      }}>
        {/* Big playful quotation mark — bounces in with its own spring + gentle rotation */}
        <div style={{
          fontFamily: t.display, fontSize: 96, fontWeight: 700, color: t.accent,
          lineHeight: 0.6, marginBottom: 12,
          opacity: markProgress,
          transform: `scale(${0.3 + markProgress * 0.7}) rotate(${markRotate}deg)`,
          textShadow: `0 4px 16px rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.4)`,
        }}>
          &ldquo;
        </div>

        {/* The quote — white with layered shadows for strong presence over any image */}
        <div style={{
          opacity: quoteProgress,
          transform: `translateY(${(1 - quoteProgress) * 16}px) scale(${0.92 + quoteProgress * 0.08})`,
        }}>
          <blockquote style={{
            fontFamily: t.display, fontSize: 38, fontWeight: 600, lineHeight: 1.25,
            color: "#ffffff", margin: 0, maxWidth: 580,
            textShadow: "0 3px 12px rgba(0,0,0,0.6), 0 1px 3px rgba(0,0,0,0.5)",
          }}>
            {data.quote}
          </blockquote>
        </div>

        {/* Attribution — speaker name in accent color + role in softer white */}
        <div style={{ marginTop: 28, opacity: attrProgress, display: "flex", alignItems: "center", gap: 12 }}>
          {/* Accent dash before the speaker name */}
          <div style={{
            width: 5, height: 32, borderRadius: 999, background: t.secondary,
            boxShadow: `0 0 10px ${t.secondary}88`,
            flexShrink: 0,
          }} />
          <div>
            <div style={{
              fontFamily: t.display, fontSize: 24, fontWeight: 700,
              color: t.secondary,
              textShadow: "0 2px 8px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.4)",
            }}>
              {data.speaker}
            </div>
            {data.role && (
              <div style={{
                fontFamily: t.sans, fontSize: 22, fontWeight: 600,
                color: "rgba(255,255,255,0.85)", marginTop: 4, lineHeight: 1.35,
                textShadow: "0 1px 4px rgba(0,0,0,0.5)",
              }}>
                {data.role}
              </div>
            )}
          </div>
        </div>
      </div>
    </KidsSceneCanvas>
  );
};

// ─── 8. KidsTopList — playful countdown over full-bleed scene ───────────────

export interface KidsTopListData extends KidsImageData {
  title?: string;
  items: Array<{
    rank: number;
    title: string;
    detail?: string;
  }>;
  label?: string;
  footer?: string;
}

export const KidsTopList: React.FC<{ data: KidsTopListData; theme?: ThemeConfig; delay?: number }> = ({ data, theme, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = getKidsTokens(theme);
  const rankColors = [t.accent, t.secondary, t.tertiary, t.success, t.warning];

  return (
    <KidsSceneCanvas
      theme={theme}
      delay={delay}
      imageUrl={data.imageUrl}
      imageAlt={data.imageAlt}
      imageFocalPoint={data.imageFocalPoint}
      imageTreatment={data.imageTreatment ?? "bright"}
      kenBurns="in"
      kenBurnsPan="right"
      zoomIntensity={0.1}
      scrim="bottom"
      scrimStrength={0.62}
      overlay="bottom"
      overlayPadding={48}
      label={data.label ?? "TOP LIST!"}
      labelPosition="top-left"
      labelColor={t.warning}
      footer={data.footer}
      decorations={false}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {data.title && (
          <KidsReveal delay={delay + 4} direction="up" theme={theme}>
            <h2 style={{
              fontFamily: t.display, fontSize: 40, fontWeight: 600, color: "#ffffff",
              margin: 0, marginBottom: 20, lineHeight: 1.1,
              textShadow: "0 3px 12px rgba(0,0,0,0.6), 0 1px 3px rgba(0,0,0,0.5)",
            }}>
              {data.title}
            </h2>
          </KidsReveal>
        )}

        {data.items.map((item, i) => {
          const itemDelay = delay + 8 + i * 8;
          const itemProgress = spring({ frame: frame - itemDelay, fps, config: { damping: 11, stiffness: 140 } });
          const rankColor = rankColors[i % rankColors.length] ?? t.accent;

          // Rank badge has its own pop-in, slightly ahead of the item
          const badgeProgress = spring({ frame: frame - itemDelay + 2, fps, config: { damping: 9, stiffness: 160, mass: 0.6 } });

          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 16,
              paddingBottom: i < data.items.length - 1 ? 16 : 0,
              opacity: itemProgress,
              transform: `translateX(${(1 - itemProgress) * -24}px) scale(${0.85 + itemProgress * 0.15})`,
            }}>
              {/* Rank badge — big playful circle with number, glowing in its own color */}
              <div style={{
                flexShrink: 0, width: 56, height: 56, borderRadius: "50%",
                background: rankColor, color: "#ffffff",
                display: "grid", placeItems: "center",
                fontFamily: t.display, fontSize: 30, fontWeight: 700,
                border: "3px solid #ffffff",
                boxShadow: `0 4px 12px rgba(0,0,0,0.3), 0 0 16px ${rankColor}aa`,
                transform: `scale(${0.2 + badgeProgress * 0.8})`,
              }}>
                {item.rank}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: t.display, fontSize: 30, fontWeight: 600,
                  color: "#ffffff", lineHeight: 1.15,
                  textShadow: "0 2px 8px rgba(0,0,0,0.6), 0 1px 2px rgba(0,0,0,0.4)",
                }}>
                  {item.title}
                </div>
                {item.detail && (
                  <div style={{
                    fontFamily: t.sans, fontSize: 22, fontWeight: 600,
                    color: "rgba(255,255,255,0.88)", lineHeight: 1.3, marginTop: 2,
                    textShadow: "0 1px 4px rgba(0,0,0,0.5)",
                  }}>
                    {item.detail}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </KidsSceneCanvas>
  );
};

// ─── 9. KidsEnding — satisfying story conclusion over full-bleed scene ──────

export interface KidsEndingData extends KidsImageData {
  /** The closing message — warm and positive */
  message: string;
  /** A final encouraging thought or question */
  encouragement?: string;
  label?: string;
}

export const KidsEnding: React.FC<{ data: KidsEndingData; theme?: ThemeConfig; delay?: number }> = ({ data, theme, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = getKidsTokens(theme);

  const messageProgress = spring({ frame: frame - delay - 6, fps, config: { damping: 12, stiffness: 115 } });
  const encouragementProgress = spring({ frame: frame - delay - 22, fps, config: { damping: 13, stiffness: 110 } });

  // Gentle warm "float" — the message drifts softly, like a warm conclusion settling in
  const float = Math.sin((frame - delay) * 0.03) * 2;
  const floatY = Math.cos((frame - delay) * 0.025) * 1.5;

  // Message has a subtle breathing pulse — it's the hero, it should feel alive
  const breathe = 1 + Math.sin((frame - delay) * 0.04) * 0.012;

  return (
    <KidsSceneCanvas
      theme={theme}
      delay={delay}
      imageUrl={data.imageUrl}
      imageAlt={data.imageAlt}
      imageFocalPoint={data.imageFocalPoint}
      imageTreatment={data.imageTreatment ?? "bright"}
      kenBurns="out"
      kenBurnsPan="right"
      zoomIntensity={0.08}
      scrim="both"
      scrimStrength={0.6}
      overlay="center"
      overlayPadding={56}
      label={data.label ?? "REMEMBER!"}
      labelPosition="top-center"
      labelColor={t.success}
      decorations={true}
      overlayStyle={{ alignItems: "center", textAlign: "center" }}
    >
      <div style={{
        textAlign: "center",
        maxWidth: 580,
        transform: `translate(${float}px, ${floatY}px)`,
      }}>
        {/* Message — the hero of this frame, big and warm with layered shadows */}
        <div style={{
          opacity: messageProgress,
          transform: `translateY(${(1 - messageProgress) * 20}px) scale(${(0.9 + messageProgress * 0.1) * breathe})`,
        }}>
          <p style={{
            fontFamily: t.display, fontSize: 44, fontWeight: 600, lineHeight: 1.15,
            color: "#ffffff", margin: 0,
            textShadow: `0 4px 0 ${t.accentDeep}, 0 6px 20px rgba(0,0,0,0.6), 0 2px 4px rgba(0,0,0,0.5)`,
          }}>
            {data.message}
          </p>
        </div>

        {/* Encouragement — softer, in the secondary accent, appears after the message settles */}
        {data.encouragement && (
          <div style={{
            marginTop: 32, opacity: encouragementProgress,
            transform: `translateY(${(1 - encouragementProgress) * 16}px) scale(${0.92 + encouragementProgress * 0.08})`,
          }}>
            <p style={{
              fontFamily: t.display, fontSize: 32, fontWeight: 500, lineHeight: 1.25,
              color: t.secondary, margin: 0,
              textShadow: "0 2px 10px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.4)",
            }}>
              {data.encouragement}
            </p>
          </div>
        )}
      </div>
    </KidsSceneCanvas>
  );
};

// ─── 10. KidsEndCard — polished final frame with CTA over full-bleed scene ──

export interface KidsEndCardData extends KidsImageData {
  /** CTA text, e.g. "Subscribe for more fun!" */
  cta?: string;
  /** The channel/handle name */
  channelName?: string;
  /** A final hook question to drive engagement */
  finalQuestion?: string;
}

export const KidsEndCard: React.FC<{ data: KidsEndCardData; theme?: ThemeConfig; delay?: number }> = ({ data, theme, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = getKidsTokens(theme);

  const fadeProgress = spring({ frame: frame - delay, fps, config: { damping: 13, stiffness: 110 } });
  const questionProgress = spring({ frame: frame - delay - 6, fps, config: { damping: 12, stiffness: 120 } });
  const ctaProgress = spring({ frame: frame - delay - 14, fps, config: { damping: 11, stiffness: 130, mass: 0.8 } });
  const channelProgress = spring({ frame: frame - delay - 22, fps, config: { damping: 14, stiffness: 100 } });

  // CTA button has a strong, playful pulse — it's the final call to action
  const pulse = 1 + Math.sin((frame - delay) * 0.12) * 0.04;

  // Subtle glow pulse on the CTA button — draws the eye
  const glowPulse = 0.6 + Math.sin((frame - delay) * 0.12) * 0.3;

  return (
    <KidsSceneCanvas
      theme={theme}
      delay={delay}
      imageUrl={data.imageUrl}
      imageAlt={data.imageAlt}
      imageFocalPoint={data.imageFocalPoint}
      imageTreatment={data.imageTreatment ?? "bright"}
      kenBurns="out"
      kenBurnsPan="right"
      zoomIntensity={0.08}
      scrim="both"
      scrimStrength={0.62}
      overlay="center"
      overlayPadding={56}
      decorations={true}
      overlayStyle={{ alignItems: "center", textAlign: "center" }}
    >
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", textAlign: "center", opacity: fadeProgress,
      }}>
        {/* Final hook question — appears first, in white with strong shadow */}
        {data.finalQuestion && (
          <div style={{
            opacity: questionProgress,
            transform: `translateY(${(1 - questionProgress) * 16}px) scale(${0.92 + questionProgress * 0.08})`,
            marginBottom: 36,
          }}>
            <p style={{
              fontFamily: t.display, fontSize: 34, fontWeight: 600, lineHeight: 1.2,
              color: "#ffffff", margin: 0, maxWidth: 520,
              textShadow: "0 3px 12px rgba(0,0,0,0.6), 0 1px 3px rgba(0,0,0,0.5)",
            }}>
              {data.finalQuestion}
            </p>
          </div>
        )}

        {/* CTA button — big, playful, glowing, pulsing. The visual finish of the video. */}
        <div style={{ opacity: ctaProgress, transform: `scale(${ctaProgress * pulse})` }}>
          <div style={{
            display: "inline-block",
            padding: "18px 40px",
            borderRadius: 999,
            background: t.secondary,
            color: "#ffffff",
            fontFamily: t.display,
            fontSize: 30,
            fontWeight: 700,
            border: "4px solid #ffffff",
            boxShadow: `0 6px 20px rgba(0,0,0,0.3), 0 0 ${24 * glowPulse}px ${t.secondary}cc`,
          }}>
            {data.cta ?? "Subscribe for more fun!"}
          </div>
        </div>

        {/* Channel name — appears last, in softer white */}
        {data.channelName && (
          <div style={{
            marginTop: 20, opacity: channelProgress,
            transform: `translateY(${(1 - channelProgress) * 10}px)`,
          }}>
            <p style={{
              fontFamily: t.sans, fontSize: 22, fontWeight: 700,
              color: "rgba(255,255,255,0.9)", margin: 0,
              textShadow: "0 2px 8px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.4)",
            }}>
              @{data.channelName}
            </p>
          </div>
        )}
      </div>
    </KidsSceneCanvas>
  );
};
