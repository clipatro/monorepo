/**
 * Mystery namespace components — REVISED v2 (feed-optimized).
 *
 * Design principles (from viral short-form research):
 * 1. EVERY scene has a visual (blurred BG image at minimum, full image when relevant)
 * 2. Hook pattern: flash image + bold text in first 2 seconds
 * 3. Ken Burns zoom on all images (cinematic, holds attention)
 * 4. Bold, high-contrast captions with text shadows (readable on any BG)
 * 5. Narration matches visuals — what you see is what's being discussed
 * 6. Fast pacing — content visible in 0.3s, not 0.7s
 * 7. Cliffhanger ending, not "end of file"
 * 8. Accent color for highlights and key data, not just decoration
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { ThemeConfig } from "../../themes/index.ts";
import {
  MysteryCanvas,
  MysteryReveal,
  MysteryImage,
  MysteryPanel,
  MysteryLabel,
  getMysteryTokens,
  type MysteryImageData,
} from "../canvas.tsx";

// ─── 1. MysteryTitleCard — HOOK PATTERN (grab attention in 2s) ──────────────

export interface MysteryTitleCardData extends MysteryImageData {
  title: string;
  subtitle?: string;
  /** A hook question/statement that grabs attention (shown in first 2s) */
  hook?: string;
  caseLabel?: string;
}

export const MysteryTitleCard: React.FC<{ data: MysteryTitleCardData; theme?: ThemeConfig; delay?: number }> = ({ data, theme, delay = 0 }) => {
  const frame = useCurrentFrame();
  const t = getMysteryTokens(theme);

  // Phase 2 (frame 6+): Hook text slams in (bold, large)
  const hookProgress = interpolate(frame - delay - 6, [0, 8], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Phase 3 (frame 20+): Title appears
  const titleProgress = interpolate(frame - delay - 20, [0, 12], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Phase 4 (frame 32+): Subtitle
  const subtitleProgress = interpolate(frame - delay - 32, [0, 10], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <MysteryCanvas
      theme={theme}
      delay={delay}
      label={data.caseLabel}
      imageUrl={data.imageUrl}
      imageTreatment={data.imageTreatment ?? "dark"}
      bottomGradientOpacity={0.85}
      contentStyle={{ justifyContent: "center", alignItems: "center", textAlign: "center" }}
    >
      {/* Hook text — bold, large, slams in at frame 6 */}
      {data.hook && (
        <div style={{
          position: "relative",
          zIndex: 20,
          opacity: hookProgress,
          transform: `translateY(${(1 - hookProgress) * 24}px) scale(${0.92 + hookProgress * 0.08})`,
          marginBottom: 24,
        }}>
          <p style={{
            fontFamily: t.sans,
            fontSize: 36,
            fontWeight: 900,
            lineHeight: 1.15,
            color: t.bright,
            margin: 0,
            textShadow: "0 3px 20px rgba(0,0,0,0.95), 0 0 40px rgba(0,0,0,0.8)",
            letterSpacing: -0.5,
            maxWidth: 580,
          }}>
          {data.hook}
        </p>
        </div>
      )}

      {/* Title — serif, appears after hook */}
      <div style={{
        position: "relative",
        zIndex: 20,
        opacity: titleProgress,
        transform: `translateY(${(1 - titleProgress) * 18}px)`,
      }}>
        <h1 style={{
          fontFamily: t.serif,
          fontSize: 48,
          fontWeight: 400,
          lineHeight: 1.1,
          color: t.accent,
          margin: 0,
          letterSpacing: -0.5,
          textShadow: "0 2px 16px rgba(0,0,0,0.95)",
        }}>
          {data.title}
        </h1>
      </div>

      {/* Subtitle */}
      {data.subtitle && (
        <div style={{
          position: "relative",
          zIndex: 20,
          marginTop: 16,
          opacity: subtitleProgress * 0.9,
        }}>
          <p style={{
            fontFamily: t.sans,
            fontSize: 17,
            fontWeight: 500,
            lineHeight: 1.4,
            color: t.mid,
            margin: 0,
            letterSpacing: 0.3,
            textShadow: "0 1px 12px rgba(0,0,0,0.9)",
          }}>
            {data.subtitle}
          </p>
        </div>
      )}
    </MysteryCanvas>
  );
};

// ─── 2. MysteryImageReveal — full image with caption ────────────────────────

export interface MysteryImageRevealData extends MysteryImageData {
  caption?: string;
  caseLabel?: string;
  footer?: string;
}

export const MysteryImageReveal: React.FC<{ data: MysteryImageRevealData; theme?: ThemeConfig; delay?: number }> = ({ data, theme, delay = 0 }) => {
  const frame = useCurrentFrame();
  const t = getMysteryTokens(theme);
  const captionProgress = interpolate(frame - delay - 20, [0, 12], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic),
  });

  return (
    <MysteryCanvas
      theme={theme}
      delay={delay}
      label={data.caseLabel}
      footer={data.footer}
      imageUrl={data.imageUrl}
      imageTreatment={data.imageTreatment ?? "dark"}
      bottomGradientOpacity={0.8}
      contentStyle={{ justifyContent: "flex-end", paddingBottom: 60 }}
    >
      {/* Caption at bottom — bold, readable */}
      {data.caption && (
        <div style={{
          opacity: captionProgress,
          transform: `translateY(${(1 - captionProgress) * 16}px)`,
        }}>
          <p style={{
            fontFamily: t.sans,
            fontSize: 26,
            fontWeight: 700,
            lineHeight: 1.3,
            color: t.bright,
            margin: 0,
            textShadow: "0 2px 16px rgba(0,0,0,0.95), 0 0 30px rgba(0,0,0,0.7)",
            letterSpacing: -0.2,
          }}>
            {data.caption}
          </p>
        </div>
      )}
    </MysteryCanvas>
  );
};

// ─── 3. MysteryQuestion — pose the central mystery ──────────────────────────

export interface MysteryQuestionData extends MysteryImageData {
  question: string;
  context?: string;
  caseLabel?: string;
  footer?: string;
}

export const MysteryQuestion: React.FC<{ data: MysteryQuestionData; theme?: ThemeConfig; delay?: number }> = ({ data, theme, delay = 0 }) => {
  const frame = useCurrentFrame();
  const t = getMysteryTokens(theme);

  const contextProgress = interpolate(frame - delay - 4, [0, 10], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic),
  });
  const questionProgress = interpolate(frame - delay - 12, [0, 14], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic),
  });

  return (
    <MysteryCanvas
      theme={theme}
      delay={delay}
      label={data.caseLabel}
      footer={data.footer}
      imageUrl={data.imageUrl}
      imageTreatment={data.imageTreatment ?? "dark"}
      bottomGradientOpacity={0.85}
    >
      <div style={{ textAlign: "left" }}>
        {data.context && (
          <div style={{ opacity: contextProgress, marginBottom: 24 }}>
            <p style={{
              fontFamily: t.sans, fontSize: 18, fontWeight: 500, lineHeight: 1.5,
              color: t.mid, margin: 0, maxWidth: 520,
              textShadow: "0 1px 12px rgba(0,0,0,0.9)",
            }}>
              {data.context}
            </p>
          </div>
        )}

        <div style={{
          opacity: questionProgress,
          transform: `translateY(${(1 - questionProgress) * 14}px)`,
        }}>
          <p style={{
            fontFamily: t.serif, fontSize: 34, fontWeight: 400, lineHeight: 1.22,
            color: t.bright, margin: 0, letterSpacing: -0.3, maxWidth: 560,
            textShadow: "0 2px 18px rgba(0,0,0,0.95)",
          }}>
            {data.question}
          </p>
        </div>

        {/* Accent line under question */}
        <div style={{
          marginTop: 28, width: 50, height: 2, background: t.accent,
          opacity: questionProgress * 0.85,
        }} />
      </div>
    </MysteryCanvas>
  );
};

// ─── 4. MysteryClue — evidence image + annotation text ──────────────────────

export interface MysteryClueData extends MysteryImageData {
  clueNumber?: string;
  clue: string;
  source?: string;
  caseLabel?: string;
}

export const MysteryClue: React.FC<{ data: MysteryClueData; theme?: ThemeConfig; delay?: number }> = ({ data, theme, delay = 0 }) => {
  const frame = useCurrentFrame();
  const t = getMysteryTokens(theme);

  const textProgress = interpolate(frame - delay - 14, [0, 12], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic),
  });

  return (
    <MysteryCanvas
      theme={theme}
      delay={delay}
      label={data.clueNumber ?? data.caseLabel ?? "EVIDENCE"}
      footer={data.source}
      imageUrl={data.imageUrl}
      imageTreatment={data.imageTreatment ?? "noir"}
      bottomGradientOpacity={0.8}
      contentStyle={{ justifyContent: "flex-end", paddingBottom: 50 }}
    >
      {/* Clue text at bottom — bold, high-contrast */}
      <div style={{
        opacity: textProgress,
        transform: `translateY(${(1 - textProgress) * 16}px)`,
      }}>
        {/* Accent marker before clue */}
        <div style={{
          width: 36, height: 3, background: t.accent, marginBottom: 16,
          borderRadius: 2,
        }} />
        <p style={{
          fontFamily: t.sans, fontSize: 24, fontWeight: 700, lineHeight: 1.32,
          color: t.bright, margin: 0,
          textShadow: "0 2px 16px rgba(0,0,0,0.95), 0 0 30px rgba(0,0,0,0.7)",
          letterSpacing: -0.2,
        }}>
          {data.clue}
        </p>
      </div>
    </MysteryCanvas>
  );
};

// ─── 5. MysteryTimeline — events with visual progression ────────────────────

export interface MysteryTimelineData extends MysteryImageData {
  title?: string;
  events: Array<{
    date: string;
    title: string;
    detail?: string;
  }>;
  caseLabel?: string;
  footer?: string;
}

export const MysteryTimeline: React.FC<{ data: MysteryTimelineData; theme?: ThemeConfig; delay?: number }> = ({ data, theme, delay = 0 }) => {
  const frame = useCurrentFrame();
  const t = getMysteryTokens(theme);

  return (
    <MysteryCanvas
      theme={theme}
      delay={delay}
      label={data.caseLabel ?? "TIMELINE"}
      footer={data.footer}
      imageUrl={data.imageUrl}
      imageTreatment={data.imageTreatment ?? "dark"}
      bottomGradientOpacity={0.88}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {data.title && (
          <MysteryReveal delay={delay + 3} direction="up">
            <h2 style={{
              fontFamily: t.serif, fontSize: 30, fontWeight: 400, color: t.bright,
              margin: 0, marginBottom: 32, letterSpacing: -0.2,
              textShadow: "0 2px 14px rgba(0,0,0,0.95)",
            }}>
              {data.title}
            </h2>
          </MysteryReveal>
        )}

        {/* Timeline with vertical line */}
        <div style={{ position: "relative", paddingLeft: 32 }}>
          <div style={{
            position: "absolute", left: 6, top: 8, bottom: 8, width: 2,
            background: t.border, borderRadius: 1,
          }} />

          {data.events.map((event, i) => {
            const eventDelay = delay + 10 + i * 14;
            const eventProgress = interpolate(frame - eventDelay, [0, 12], [0, 1], {
              extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic),
            });

            return (
              <div key={i} style={{
                position: "relative",
                paddingBottom: i < data.events.length - 1 ? 30 : 0,
                opacity: eventProgress,
                transform: `translateX(${(1 - eventProgress) * -14}px)`,
              }}>
                {/* Dot on the line — accent for first, dim for rest */}
                <div style={{
                  position: "absolute", left: -32, top: 8, width: 13, height: 13,
                  borderRadius: "50%",
                  background: i === 0 ? t.accent : t.elevated,
                  border: `2px solid ${i === 0 ? t.accent : t.border}`,
                  boxShadow: i === 0 ? `0 0 12px ${t.accent}80` : "none",
                }} />

                <div style={{
                  fontFamily: t.mono, fontSize: 14, fontWeight: 600,
                  letterSpacing: 1.8, textTransform: "uppercase",
                  color: t.accent, marginBottom: 6,
                  textShadow: "0 1px 8px rgba(0,0,0,0.9)",
                }}>
                  {event.date}
                </div>
                <div style={{
                  fontFamily: t.serif, fontSize: 22, fontWeight: 400,
                  color: t.bright, lineHeight: 1.28, marginBottom: event.detail ? 6 : 0,
                  textShadow: "0 1px 10px rgba(0,0,0,0.9)",
                }}>
                  {event.title}
                </div>
                {event.detail && (
                  <div style={{
                    fontFamily: t.sans, fontSize: 16, fontWeight: 400,
                    color: t.mid, lineHeight: 1.45,
                    textShadow: "0 1px 8px rgba(0,0,0,0.9)",
                  }}>
                    {event.detail}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </MysteryCanvas>
  );
};

// ─── 6. MysteryQuote — quote with optional image ────────────────────────────

export interface MysteryQuoteData extends MysteryImageData {
  quote: string;
  speaker: string;
  role?: string;
  when?: string;
  caseLabel?: string;
}

export const MysteryQuote: React.FC<{ data: MysteryQuoteData; theme?: ThemeConfig; delay?: number }> = ({ data, theme, delay = 0 }) => {
  const frame = useCurrentFrame();
  const t = getMysteryTokens(theme);

  const quoteProgress = interpolate(frame - delay - 8, [0, 16], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic),
  });
  const attrProgress = interpolate(frame - delay - 20, [0, 12], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic),
  });

  return (
    <MysteryCanvas
      theme={theme}
      delay={delay}
      label={data.caseLabel}
      footer={data.when}
      imageUrl={data.imageUrl}
      imageTreatment={data.imageTreatment ?? "desaturated"}
      bottomGradientOpacity={0.85}
    >
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
        {/* Accent quote mark */}
        <div style={{
          width: 32, height: 3, background: t.accent,
          opacity: quoteProgress * 0.8, marginBottom: 22, borderRadius: 2,
        }} />

        <div style={{
          opacity: quoteProgress,
          transform: `translateY(${(1 - quoteProgress) * 12}px)`,
        }}>
          <blockquote style={{
            fontFamily: t.serif, fontSize: 26, fontWeight: 400, lineHeight: 1.38,
            color: t.bright, margin: 0, fontStyle: "italic", maxWidth: 540,
            textShadow: "0 2px 16px rgba(0,0,0,0.95)",
            letterSpacing: -0.2,
          }}>
            {data.quote}
          </blockquote>
        </div>

        {/* Attribution */}
        <div style={{ marginTop: 26, opacity: attrProgress }}>
          <div style={{
            fontFamily: t.mono, fontSize: 14, fontWeight: 600,
            letterSpacing: 1.5, textTransform: "uppercase", color: t.accent,
            textShadow: "0 1px 8px rgba(0,0,0,0.9)",
          }}>
            {data.speaker}
          </div>
          {data.role && (
            <div style={{
              fontFamily: t.sans, fontSize: 14, fontWeight: 400,
              color: t.mid, marginTop: 4,
              textShadow: "0 1px 8px rgba(0,0,0,0.9)",
            }}>
              {data.role}
            </div>
          )}
        </div>
      </div>
    </MysteryCanvas>
  );
};

// ─── 7. MysteryLocation — place + significance with map/image BG ────────────

export interface MysteryLocationData extends MysteryImageData {
  place: string;
  region?: string;
  coordinates?: string;
  significance: string;
  facts?: Array<{ label: string; value: string }>;
  caseLabel?: string;
}

export const MysteryLocation: React.FC<{ data: MysteryLocationData; theme?: ThemeConfig; delay?: number }> = ({ data, theme, delay = 0 }) => {
  const frame = useCurrentFrame();
  const t = getMysteryTokens(theme);

  const textProgress = interpolate(frame - delay - 12, [0, 14], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic),
  });
  const factsProgress = interpolate(frame - delay - 24, [0, 12], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic),
  });

  return (
    <MysteryCanvas
      theme={theme}
      delay={delay}
      label={data.caseLabel ?? "LOCATION"}
      footer={data.coordinates}
      imageUrl={data.imageUrl}
      imageTreatment={data.imageTreatment ?? "dark"}
      bottomGradientOpacity={0.8}
      contentStyle={{ justifyContent: "flex-end", paddingBottom: 50 }}
    >
      {/* Place name + significance at bottom */}
      <div style={{
        opacity: textProgress,
        transform: `translateY(${(1 - textProgress) * 14}px)`,
      }}>
        <h2 style={{
          fontFamily: t.serif, fontSize: 38, fontWeight: 400, color: t.bright,
          margin: 0, letterSpacing: -0.3,
          textShadow: "0 2px 16px rgba(0,0,0,0.95)",
        }}>
          {data.place}
        </h2>
        {data.region && (
          <div style={{
            fontFamily: t.mono, fontSize: 13, fontWeight: 600,
            letterSpacing: 1.8, textTransform: "uppercase", color: t.accent,
            marginTop: 8,
            textShadow: "0 1px 8px rgba(0,0,0,0.9)",
          }}>
            {data.region}
          </div>
        )}
        <p style={{
          fontFamily: t.sans, fontSize: 18, fontWeight: 500, lineHeight: 1.5,
          color: t.mid, margin: 0, marginTop: 16, maxWidth: 520,
          textShadow: "0 1px 12px rgba(0,0,0,0.9)",
        }}>
          {data.significance}
        </p>
      </div>

      {/* Quick facts */}
      {data.facts && data.facts.length > 0 && (
        <div style={{
          display: "flex", gap: 36, marginTop: 24, opacity: factsProgress,
        }}>
          {data.facts.map((f, i) => (
            <div key={i}>
              <div style={{
                fontFamily: t.mono, fontSize: 12, fontWeight: 600,
                letterSpacing: 1.5, textTransform: "uppercase", color: t.dim,
                marginBottom: 4,
                textShadow: "0 1px 6px rgba(0,0,0,0.9)",
              }}>
                {f.label}
              </div>
              <div style={{
                fontFamily: t.serif, fontSize: 22, fontWeight: 400, color: t.bright,
                textShadow: "0 1px 10px rgba(0,0,0,0.9)",
              }}>
                {f.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </MysteryCanvas>
  );
};

// ─── 8. MysteryStatistic — big number with context ──────────────────────────

export interface MysteryStatisticData extends MysteryImageData {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  label: string;
  context?: string;
  caseLabel?: string;
  footer?: string;
}

export const MysteryStatistic: React.FC<{ data: MysteryStatisticData; theme?: ThemeConfig; delay?: number }> = ({ data, theme, delay = 0 }) => {
  const frame = useCurrentFrame();
  const t = getMysteryTokens(theme);

  const countProgress = interpolate(frame - delay - 8, [0, 30], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic),
  });
  const currentValue = data.value * countProgress;
  const formatted = currentValue.toLocaleString("en-US", {
    minimumFractionDigits: data.decimals ?? 0,
    maximumFractionDigits: data.decimals ?? 0,
  });

  const contextProgress = interpolate(frame - delay - 24, [0, 14], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic),
  });

  return (
    <MysteryCanvas
      theme={theme}
      delay={delay}
      label={data.caseLabel ?? "KEY DATA"}
      footer={data.footer}
      imageUrl={data.imageUrl}
      imageTreatment={data.imageTreatment ?? "dark"}
      bottomGradientOpacity={0.88}
    >
      <div style={{ textAlign: "left" }}>
        {/* Label */}
        <MysteryReveal delay={delay + 3} direction="fade">
          <p style={{
            fontFamily: t.mono, fontSize: 14, fontWeight: 600,
            letterSpacing: 2, textTransform: "uppercase", color: t.mid,
            margin: 0, marginBottom: 20,
            textShadow: "0 1px 8px rgba(0,0,0,0.9)",
          }}>
            {data.label}
          </p>
        </MysteryReveal>

        {/* The number — huge, accent color, count-up animation */}
        <div style={{
          fontFamily: t.serif, fontSize: 110, fontWeight: 400, color: t.accent,
          lineHeight: 0.95, letterSpacing: -2,
          opacity: countProgress,
          textShadow: `0 0 40px ${t.accent}40, 0 4px 20px rgba(0,0,0,0.95)`,
        }}>
          {data.prefix}{formatted}{data.suffix}
        </div>

        {/* Context */}
        {data.context && (
          <p style={{
            fontFamily: t.sans, fontSize: 19, fontWeight: 500, lineHeight: 1.5,
            color: t.mid, margin: 0, marginTop: 28, maxWidth: 500,
            opacity: contextProgress,
            textShadow: "0 1px 12px rgba(0,0,0,0.9)",
          }}>
            {data.context}
          </p>
        )}

        {/* Accent line */}
        <div style={{
          marginTop: 30, width: 48, height: 2, background: t.accent,
          opacity: contextProgress * 0.85, borderRadius: 2,
        }} />
      </div>
    </MysteryCanvas>
  );
};

// ─── 9. MysteryEnding — cliffhanger, not a resolution ───────────────────────

export interface MysteryEndingData extends MysteryImageData {
  /** The closing statement — what we know */
  statement: string;
  /** An open question to leave the viewer with (the cliffhanger) */
  openQuestion?: string;
  caseLabel?: string;
}

export const MysteryEnding: React.FC<{ data: MysteryEndingData; theme?: ThemeConfig; delay?: number }> = ({ data, theme, delay = 0 }) => {
  const frame = useCurrentFrame();
  const t = getMysteryTokens(theme);

  const statementProgress = interpolate(frame - delay - 6, [0, 14], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic),
  });
  const questionProgress = interpolate(frame - delay - 22, [0, 16], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic),
  });

  return (
    <MysteryCanvas
      theme={theme}
      delay={delay}
      label={data.caseLabel ?? "THE QUESTION"}
      imageUrl={data.imageUrl}
      imageTreatment={data.imageTreatment ?? "dark"}
      bottomGradientOpacity={0.88}
      contentStyle={{ justifyContent: "center", alignItems: "center", textAlign: "center" }}
    >
      <div style={{ textAlign: "center", maxWidth: 560 }}>
        {/* Statement — what we know */}
        <div style={{
          opacity: statementProgress,
          transform: `translateY(${(1 - statementProgress) * 14}px)`,
        }}>
          <p style={{
            fontFamily: t.serif, fontSize: 28, fontWeight: 400, lineHeight: 1.32,
            color: t.bright, margin: 0,
            textShadow: "0 2px 16px rgba(0,0,0,0.95)",
            letterSpacing: -0.2,
          }}>
            {data.statement}
          </p>
        </div>

        {/* Divider */}
        <div style={{
          margin: "32px auto", width: 50, height: 2, background: t.accent,
          opacity: questionProgress * 0.8, borderRadius: 2,
        }} />

        {/* The open question — cliffhanger, in accent color */}
        {data.openQuestion && (
          <div style={{
            opacity: questionProgress,
            transform: `translateY(${(1 - questionProgress) * 12}px)`,
          }}>
            <p style={{
              fontFamily: t.serif, fontSize: 24, fontWeight: 400, lineHeight: 1.38,
              color: t.accent, margin: 0, fontStyle: "italic",
              textShadow: `0 0 24px ${t.accent}50, 0 2px 14px rgba(0,0,0,0.95)`,
              letterSpacing: -0.1,
            }}>
              {data.openQuestion}
            </p>
          </div>
        )}
      </div>
    </MysteryCanvas>
  );
};

// ─── 10. MysteryEndCard — CTA + follow prompt (NOT "end of file") ───────────

export interface MysteryEndCardData extends MysteryImageData {
  /** CTA text, e.g. "Follow for more mysteries" */
  cta?: string;
  /** The channel/handle name */
  channelName?: string;
  /** A final hook question to drive engagement */
  finalQuestion?: string;
}

export const MysteryEndCard: React.FC<{ data: MysteryEndCardData; theme?: ThemeConfig; delay?: number }> = ({ data, theme, delay = 0 }) => {
  const t = getMysteryTokens(theme);
  const frame = useCurrentFrame();

  const fadeProgress = interpolate(frame - delay, [0, 10], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic),
  });
  const ctaProgress = interpolate(frame - delay - 12, [0, 12], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic),
  });

  return (
    <MysteryCanvas
      theme={theme}
      delay={delay}
      imageUrl={data.imageUrl}
      imageTreatment={data.imageTreatment ?? "dark"}
      bottomGradientOpacity={0.9}
      contentStyle={{ justifyContent: "center", alignItems: "center", textAlign: "center" }}
    >
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", textAlign: "center", opacity: fadeProgress,
      }}>
        {/* Final question — the engagement hook */}
        {data.finalQuestion && (
          <p style={{
            fontFamily: t.serif, fontSize: 26, fontWeight: 400, lineHeight: 1.35,
            color: t.bright, margin: 0, marginBottom: 36, maxWidth: 480,
            textShadow: "0 2px 16px rgba(0,0,0,0.95)",
            fontStyle: "italic",
          }}>
            {data.finalQuestion}
          </p>
        )}

        {/* Accent dot */}
        <div style={{
          width: 8, height: 8, background: t.accent, borderRadius: "50%",
          marginBottom: 24,
          boxShadow: `0 0 16px ${t.accent}80`,
        }} />

        {/* CTA — bold, actionable */}
        <div style={{ opacity: ctaProgress }}>
          <p style={{
            fontFamily: t.sans, fontSize: 20, fontWeight: 800,
            letterSpacing: 1.5, textTransform: "uppercase", color: t.accent,
            margin: 0,
            textShadow: `0 0 20px ${t.accent}40, 0 2px 12px rgba(0,0,0,0.95)`,
          }}>
            {data.cta ?? "Follow for more mysteries"}
          </p>
          {data.channelName && (
            <p style={{
              fontFamily: t.mono, fontSize: 15, fontWeight: 500,
              color: t.mid, margin: 0, marginTop: 10,
              textShadow: "0 1px 8px rgba(0,0,0,0.9)",
            }}>
              @{data.channelName}
            </p>
          )}
        </div>
      </div>
    </MysteryCanvas>
  );
};
