/**
 * Mystery namespace components — REVISED v4 (bottom panel + Playfair Display).
 *
 * Design principles:
 * 1. SPLIT LAYOUT — image fills the top ~58% (fully visible, Ken Burns zoom),
 *    text sits on a SOLID dark panel at the bottom ~42%. Text is never overlaid
 *    on the image. Both are clearly visible.
 * 2. Playfair Display (loaded via @remotion/google-fonts) for ALL content text.
 *    IBM Plex Mono for ALL labels/metadata. No Times New Roman fallback.
 * 3. Consistent type scale:
 *    - Title:      56px serif, weight 400, lineHeight 1.08
 *    - Headline:   38px serif, weight 400, lineHeight 1.15  (questions, place names)
 *    - Statement:  30px serif, weight 400, lineHeight 1.28  (clues, statements, quotes)
 *    - Body:       22px serif, weight 400, lineHeight 1.45  (context, significance)
 *    - Caption:    26px serif, weight 400, lineHeight 1.32  (image captions)
 *    - Event:      24px serif, weight 400, lineHeight 1.3   (timeline events)
 *    - Number:     96px serif, weight 400, lineHeight 0.95  (statistics)
 *    - Label:      13px mono,  weight 600, letterSpacing 2.5, uppercase
 *    - Date:       14px mono,  weight 600, letterSpacing 1.8, uppercase
 *    - Footer:     11px mono,  weight 500, letterSpacing 1.5, uppercase
 * 4. No text shadows — text is on a solid dark panel, shadows are unnecessary.
 * 5. One accent element per frame — the thin line at the panel's top edge
 *    (from MysteryCanvas). Components do NOT add their own accent bars.
 * 6. Quiet cubic-ease entrances (14-frame reveals). No springs, no bounces.
 * 7. Cliffhanger endings, not "end of file".
 */

import React from "react";
import { useCurrentFrame, interpolate, Easing } from "remotion";
import type { ThemeConfig } from "../../themes/index.ts";
import {
  MysteryCanvas,
  MysteryReveal,
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

  const hookProgress = interpolate(frame - delay - 8, [0, 14], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const titleProgress = interpolate(frame - delay - 24, [0, 14], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const subtitleProgress = interpolate(frame - delay - 38, [0, 12], [0, 1], {
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
      contentStyle={{ justifyContent: "center", alignItems: "center", textAlign: "center" }}
    >
      {data.hook && (
        <div style={{
          opacity: hookProgress,
          transform: `translateY(${(1 - hookProgress) * 16}px)`,
          marginBottom: 28,
        }}>
          <p style={{
            fontFamily: t.serif,
            fontSize: 36,
            fontWeight: 400,
            lineHeight: 1.18,
            color: t.bright,
            margin: 0,
            fontStyle: "italic",
            letterSpacing: -0.3,
            maxWidth: 560,
          }}>
            {data.hook}
          </p>
        </div>
      )}

      <div style={{
        opacity: titleProgress,
        transform: `translateY(${(1 - titleProgress) * 14}px)`,
      }}>
        <h1 style={{
          fontFamily: t.serif,
          fontSize: 56,
          fontWeight: 400,
          lineHeight: 1.08,
          color: t.accent,
          margin: 0,
          letterSpacing: -0.5,
        }}>
          {data.title}
        </h1>
      </div>

      {data.subtitle && (
        <div style={{
          marginTop: 18,
          opacity: subtitleProgress * 0.85,
        }}>
          <p style={{
            fontFamily: t.serif,
            fontSize: 22,
            fontWeight: 400,
            lineHeight: 1.4,
            color: t.mid,
            margin: 0,
            letterSpacing: 0.1,
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
  const captionProgress = interpolate(frame - delay - 22, [0, 14], [0, 1], {
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
    >
      {data.caption && (
        <div style={{
          opacity: captionProgress,
          transform: `translateY(${(1 - captionProgress) * 14}px)`,
        }}>
          <p style={{
            fontFamily: t.serif,
            fontSize: 26,
            fontWeight: 400,
            lineHeight: 1.32,
            color: t.bright,
            margin: 0,
            letterSpacing: -0.2,
            maxWidth: 580,
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

  const contextProgress = interpolate(frame - delay - 6, [0, 14], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic),
  });
  const questionProgress = interpolate(frame - delay - 18, [0, 16], [0, 1], {
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
    >
      <div style={{ textAlign: "left" }}>
        {data.context && (
          <div style={{ opacity: contextProgress, marginBottom: 24 }}>
            <p style={{
              fontFamily: t.serif, fontSize: 22, fontWeight: 400, lineHeight: 1.45,
              color: t.mid, margin: 0, maxWidth: 540,
            }}>
              {data.context}
            </p>
          </div>
        )}

        <div style={{
          opacity: questionProgress,
          transform: `translateY(${(1 - questionProgress) * 12}px)`,
        }}>
          <p style={{
            fontFamily: t.serif, fontSize: 38, fontWeight: 400, lineHeight: 1.15,
            color: t.bright, margin: 0, letterSpacing: -0.3, maxWidth: 560,
          }}>
            {data.question}
          </p>
        </div>
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

  const textProgress = interpolate(frame - delay - 16, [0, 14], [0, 1], {
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
    >
      <div style={{
        opacity: textProgress,
        transform: `translateY(${(1 - textProgress) * 14}px)`,
      }}>
        <p style={{
          fontFamily: t.serif, fontSize: 30, fontWeight: 400, lineHeight: 1.28,
          color: t.bright, margin: 0,
          letterSpacing: -0.2,
          maxWidth: 580,
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
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {data.title && (
          <MysteryReveal delay={delay + 4} direction="up">
            <h2 style={{
              fontFamily: t.serif, fontSize: 34, fontWeight: 400, color: t.bright,
              margin: 0, marginBottom: 28, letterSpacing: -0.3, lineHeight: 1.15,
            }}>
              {data.title}
            </h2>
          </MysteryReveal>
        )}

        {/* Timeline with vertical line */}
        <div style={{ position: "relative", paddingLeft: 32 }}>
          <div style={{
            position: "absolute", left: 6, top: 8, bottom: 8, width: 1.5,
            background: t.border, borderRadius: 1,
          }} />

          {data.events.map((event, i) => {
            const eventDelay = delay + 12 + i * 14;
            const eventProgress = interpolate(frame - eventDelay, [0, 14], [0, 1], {
              extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic),
            });

            return (
              <div key={i} style={{
                position: "relative",
                paddingBottom: i < data.events.length - 1 ? 24 : 0,
                opacity: eventProgress,
                transform: `translateX(${(1 - eventProgress) * -12}px)`,
              }}>
                {/* Dot on the line — accent for first, dim for rest */}
                <div style={{
                  position: "absolute", left: -32, top: 8, width: 13, height: 13,
                  borderRadius: "50%",
                  background: i === 0 ? t.accent : t.elevated,
                  border: `2px solid ${i === 0 ? t.accent : t.border}`,
                }} />

                <div style={{
                  fontFamily: t.mono, fontSize: 13, fontWeight: 600,
                  letterSpacing: 1.8, textTransform: "uppercase",
                  color: t.accent, marginBottom: 6,
                }}>
                  {event.date}
                </div>
                <div style={{
                  fontFamily: t.serif, fontSize: 22, fontWeight: 400,
                  color: t.bright, lineHeight: 1.3, marginBottom: event.detail ? 4 : 0,
                }}>
                  {event.title}
                </div>
                {event.detail && (
                  <div style={{
                    fontFamily: t.serif, fontSize: 17, fontWeight: 400,
                    color: t.mid, lineHeight: 1.45,
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

  const quoteProgress = interpolate(frame - delay - 10, [0, 16], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic),
  });
  const attrProgress = interpolate(frame - delay - 24, [0, 14], [0, 1], {
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
    >
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{
          opacity: quoteProgress,
          transform: `translateY(${(1 - quoteProgress) * 12}px)`,
        }}>
          <blockquote style={{
            fontFamily: t.serif, fontSize: 30, fontWeight: 400, lineHeight: 1.35,
            color: t.bright, margin: 0, fontStyle: "italic", maxWidth: 560,
            letterSpacing: -0.2,
          }}>
            {data.quote}
          </blockquote>
        </div>

        {/* Attribution — mono */}
        <div style={{ marginTop: 28, opacity: attrProgress }}>
          <div style={{
            fontFamily: t.mono, fontSize: 14, fontWeight: 600,
            letterSpacing: 1.8, textTransform: "uppercase", color: t.accent,
          }}>
            {data.speaker}
          </div>
          {data.role && (
            <div style={{
              fontFamily: t.serif, fontSize: 18, fontWeight: 400,
              color: t.mid, marginTop: 6, lineHeight: 1.4,
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

  const textProgress = interpolate(frame - delay - 14, [0, 16], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic),
  });
  const factsProgress = interpolate(frame - delay - 28, [0, 14], [0, 1], {
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
    >
      <div style={{
        opacity: textProgress,
        transform: `translateY(${(1 - textProgress) * 14}px)`,
      }}>
        <h2 style={{
          fontFamily: t.serif, fontSize: 38, fontWeight: 400, color: t.bright,
          margin: 0, letterSpacing: -0.3, lineHeight: 1.1,
        }}>
          {data.place}
        </h2>
        {data.region && (
          <div style={{
            fontFamily: t.mono, fontSize: 13, fontWeight: 600,
            letterSpacing: 2, textTransform: "uppercase", color: t.accent,
            marginTop: 10,
          }}>
            {data.region}
          </div>
        )}
        <p style={{
          fontFamily: t.serif, fontSize: 22, fontWeight: 400, lineHeight: 1.45,
          color: t.mid, margin: 0, marginTop: 18, maxWidth: 540,
        }}>
          {data.significance}
        </p>
      </div>

      {data.facts && data.facts.length > 0 && (
        <div style={{
          display: "flex", gap: 36, marginTop: 28, opacity: factsProgress,
        }}>
          {data.facts.map((f, i) => (
            <div key={i}>
              <div style={{
                fontFamily: t.mono, fontSize: 12, fontWeight: 600,
                letterSpacing: 1.8, textTransform: "uppercase", color: t.dim,
                marginBottom: 6,
              }}>
                {f.label}
              </div>
              <div style={{
                fontFamily: t.serif, fontSize: 24, fontWeight: 400, color: t.bright,
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

  const countProgress = interpolate(frame - delay - 10, [0, 36], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic),
  });
  const currentValue = data.value * countProgress;
  const formatted = currentValue.toLocaleString("en-US", {
    minimumFractionDigits: data.decimals ?? 0,
    maximumFractionDigits: data.decimals ?? 0,
  });

  const contextProgress = interpolate(frame - delay - 28, [0, 16], [0, 1], {
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
    >
      <div style={{ textAlign: "left" }}>
        {/* Label — mono */}
        <MysteryReveal delay={delay + 4} direction="fade">
          <p style={{
            fontFamily: t.mono, fontSize: 14, fontWeight: 600,
            letterSpacing: 2.5, textTransform: "uppercase", color: t.accent,
            margin: 0, marginBottom: 20,
          }}>
            {data.label}
          </p>
        </MysteryReveal>

        {/* The number — serif, large, count-up animation */}
        <div style={{
          fontFamily: t.serif, fontSize: 96, fontWeight: 400, color: t.bright,
          lineHeight: 0.95, letterSpacing: -2,
          opacity: countProgress,
          fontVariantNumeric: "tabular-nums",
        }}>
          {data.prefix}{formatted}{data.suffix}
        </div>

        {/* Context — serif */}
        {data.context && (
          <p style={{
            fontFamily: t.serif, fontSize: 22, fontWeight: 400, lineHeight: 1.45,
            color: t.mid, margin: 0, marginTop: 28, maxWidth: 520,
            opacity: contextProgress,
          }}>
            {data.context}
          </p>
        )}
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

  const statementProgress = interpolate(frame - delay - 8, [0, 16], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic),
  });
  const questionProgress = interpolate(frame - delay - 26, [0, 18], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic),
  });

  return (
    <MysteryCanvas
      theme={theme}
      delay={delay}
      label={data.caseLabel ?? "THE QUESTION"}
      imageUrl={data.imageUrl}
      imageTreatment={data.imageTreatment ?? "dark"}
      contentStyle={{ justifyContent: "center", alignItems: "center", textAlign: "center" }}
    >
      <div style={{ textAlign: "center", maxWidth: 560 }}>
        <div style={{
          opacity: statementProgress,
          transform: `translateY(${(1 - statementProgress) * 14}px)`,
        }}>
          <p style={{
            fontFamily: t.serif, fontSize: 30, fontWeight: 400, lineHeight: 1.3,
            color: t.bright, margin: 0,
            letterSpacing: -0.2,
          }}>
            {data.statement}
          </p>
        </div>

        {data.openQuestion && (
          <div style={{
            marginTop: 32,
            opacity: questionProgress,
            transform: `translateY(${(1 - questionProgress) * 12}px)`,
          }}>
            <p style={{
              fontFamily: t.serif, fontSize: 26, fontWeight: 400, lineHeight: 1.35,
              color: t.accent, margin: 0, fontStyle: "italic",
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

  const fadeProgress = interpolate(frame - delay, [0, 14], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic),
  });
  const ctaProgress = interpolate(frame - delay - 16, [0, 14], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic),
  });

  return (
    <MysteryCanvas
      theme={theme}
      delay={delay}
      imageUrl={data.imageUrl}
      imageTreatment={data.imageTreatment ?? "dark"}
      contentStyle={{ justifyContent: "center", alignItems: "center", textAlign: "center" }}
    >
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", textAlign: "center", opacity: fadeProgress,
      }}>
        {data.finalQuestion && (
          <p style={{
            fontFamily: t.serif, fontSize: 28, fontWeight: 400, lineHeight: 1.35,
            color: t.bright, margin: 0, marginBottom: 36, maxWidth: 500,
            fontStyle: "italic",
          }}>
            {data.finalQuestion}
          </p>
        )}

        <div style={{ opacity: ctaProgress }}>
          <p style={{
            fontFamily: t.mono, fontSize: 16, fontWeight: 600,
            letterSpacing: 2, textTransform: "uppercase", color: t.accent,
            margin: 0,
          }}>
            {data.cta ?? "Follow for more mysteries"}
          </p>
          {data.channelName && (
            <p style={{
              fontFamily: t.mono, fontSize: 14, fontWeight: 500,
              letterSpacing: 1.5, color: t.mid, margin: 0, marginTop: 12,
            }}>
              @{data.channelName}
            </p>
          )}
        </div>
      </div>
    </MysteryCanvas>
  );
};
