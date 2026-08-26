import React from "react";
import type { ThemeConfig } from "../../themes/index.ts";
import { DocumentaryCanvas, DocumentaryReveal, EditorialImage, getDocumentaryTokens, type DocumentaryImageData } from "../canvas.tsx";
import { type StoryIconName } from "../../primitives/StoryIcon.tsx";

interface TemplateProps<T> {
  data: T;
  theme?: ThemeConfig;
  delay?: number;
}

export interface HookHeadlineData extends DocumentaryImageData {
  kicker: string;
  headline: string;
  emphasis?: string;
  context?: string;
  icon?: StoryIconName;
}

export const HookHeadline: React.FC<TemplateProps<HookHeadlineData>> = ({ data, theme, delay = 0 }) => {
  const t = getDocumentaryTokens(theme);
  return (
    <DocumentaryCanvas theme={theme} delay={delay} eyebrow={data.kicker} footer="Opening argument" contentStyle={{ justifyContent: "flex-end", paddingBottom: 90 }}>
      {data.imageUrl ? <EditorialImage {...data} theme={theme} delay={delay + 2} pan="right" frameStyle={{ position: "absolute", inset: "20px -48px 310px 110px", border: 0, boxShadow: "none" }} /> : null}
      <DocumentaryReveal delay={delay + 10} direction="wipe" style={{ position: "relative", zIndex: 2 }}>
        <div style={{ fontFamily: t.display, fontSize: data.headline.length > 38 ? 88 : 106, lineHeight: 0.86, letterSpacing: 0.5, textTransform: "uppercase", maxWidth: 610, textShadow: data.imageUrl ? `0 5px 24px ${t.base}` : undefined }}>{data.headline}</div>
      </DocumentaryReveal>
      {data.emphasis ? <DocumentaryReveal delay={delay + 22} direction="left" style={{ position: "relative", zIndex: 2, marginTop: 18 }}><div style={{ display: "inline", padding: "3px 12px 8px", color: t.base, background: t.accent, fontFamily: t.serif, fontSize: 48, lineHeight: 1.15, fontStyle: "italic", boxDecorationBreak: "clone" }}>{data.emphasis}</div></DocumentaryReveal> : null}
      {data.context ? <DocumentaryReveal delay={delay + 34} style={{ position: "relative", zIndex: 2, marginTop: 30, maxWidth: 560 }}><p style={{ color: t.mid, fontSize: 23, lineHeight: 1.42, margin: 0 }}>{data.context}</p></DocumentaryReveal> : null}
    </DocumentaryCanvas>
  );
};

export interface ChapterCardData extends DocumentaryImageData {
  chapter: string;
  number: number;
  title: string;
  summary?: string;
  icon?: StoryIconName;
}

export const ChapterCard: React.FC<TemplateProps<ChapterCardData>> = ({ data, theme, delay = 0 }) => {
  const t = getDocumentaryTokens(theme);
  const chapterNumber = String(data.number).padStart(2, "0");
  return (
    <DocumentaryCanvas theme={theme} delay={delay} eyebrow={data.chapter} icon={data.icon ?? "book"} footer={`Chapter ${chapterNumber}`}>
      {data.imageUrl ? <EditorialImage {...data} theme={theme} delay={delay + 5} pan="left" frameStyle={{ position: "absolute", top: 95, right: -48, width: 365, height: 520 }} /> : null}
      <DocumentaryReveal delay={delay + 6} direction="left"><div style={{ fontFamily: t.display, color: t.accent, fontSize: 280, lineHeight: 0.72, letterSpacing: -8 }}>{chapterNumber}</div></DocumentaryReveal>
      <DocumentaryReveal delay={delay + 20} direction="wipe" style={{ maxWidth: data.imageUrl ? 390 : 585 }}><h1 style={{ margin: 40, marginLeft: 0, fontFamily: t.serif, fontSize: 58, lineHeight: 1.03, fontWeight: 700, letterSpacing: -2 }}>{data.title}</h1></DocumentaryReveal>
      {data.summary ? <DocumentaryReveal delay={delay + 32}><div style={{ maxWidth: data.imageUrl ? 390 : 540, paddingTop: 20, borderTop: `3px solid ${t.accent}`, color: t.mid, fontSize: 22, lineHeight: 1.48 }}>{data.summary}</div></DocumentaryReveal> : null}
    </DocumentaryCanvas>
  );
};

export interface QuestionCardData {
  topic?: string;
  question: string;
  prompt?: string;
  icon?: StoryIconName;
}

export const QuestionCard: React.FC<TemplateProps<QuestionCardData>> = ({ data, theme, delay = 0 }) => {
  const t = getDocumentaryTokens(theme);
  return (
    <DocumentaryCanvas theme={theme} delay={delay} eyebrow={data.topic ?? "The central question"} footer="Interrogate the premise" variant="paper">
      <div style={{ position: "absolute", right: 80, top: 176, color: t.accent, fontFamily: t.display, fontSize: 260, lineHeight: 0.8, opacity: 0.5 }}>?</div>
      <DocumentaryReveal delay={delay + 12} direction="wipe" style={{ position: "relative", width: 505 }}><h1 style={{ margin: 0, color: t.base, fontFamily: t.serif, fontSize: data.question.length > 82 ? 48 : 58, lineHeight: 1.08, letterSpacing: -2 }}>{data.question}</h1></DocumentaryReveal>
      {data.prompt ? <DocumentaryReveal delay={delay + 30} direction="left" style={{ position: "relative", width: 455, marginTop: 44 }}><div style={{ color: `${t.base}bb`, fontSize: 21, lineHeight: 1.45 }}>{data.prompt}</div></DocumentaryReveal> : null}
    </DocumentaryCanvas>
  );
};

export interface QuoteCardData extends DocumentaryImageData {
  quote: string;
  speaker: string;
  role?: string;
  year?: string;
  icon?: StoryIconName;
}

export const QuoteCard: React.FC<TemplateProps<QuoteCardData>> = ({ data, theme, delay = 0 }) => {
  const t = getDocumentaryTokens(theme);
  return (
    <DocumentaryCanvas theme={theme} delay={delay} eyebrow="In their own words" icon={data.icon ?? "quote"} footer={data.year} variant="warm">
      {data.imageUrl ? <EditorialImage {...data} theme={theme} delay={delay + 4} pan="up" frameStyle={{ position: "absolute", right: -48, top: 40, width: 285, height: 640, borderColor: t.accent }} /> : <div style={{ position: "absolute", right: -20, top: 60, width: 225, height: 520, background: t.accent }} />}
      <DocumentaryReveal delay={delay + 8} direction="wipe" style={{ width: data.imageUrl ? 430 : 500 }}>
        <div style={{ fontFamily: t.serif, fontSize: data.quote.length > 120 ? 38 : 47, lineHeight: 1.2, letterSpacing: -1.3 }}><span style={{ color: t.accent, fontSize: 92, lineHeight: 0, verticalAlign: -28 }}>“</span>{data.quote}”</div>
      </DocumentaryReveal>
      <DocumentaryReveal delay={delay + 28} direction="left" style={{ marginTop: 46 }}>
        <div style={{ display: "flex", alignItems: "stretch", gap: 18 }}><div style={{ width: 8, background: t.accent }} /><div><div style={{ maxWidth: 365, fontFamily: t.display, fontSize: data.speaker.length > 16 ? 31 : 37, letterSpacing: 0.8, textTransform: "uppercase" }}>{data.speaker}</div>{data.role ? <div style={{ color: t.mid, fontFamily: t.mono, fontSize: 15, letterSpacing: 1, marginTop: 7 }}>{data.role}</div> : null}</div></div>
      </DocumentaryReveal>
    </DocumentaryCanvas>
  );
};

export interface ConclusionCardData {
  label?: string;
  conclusion: string;
  takeaway: string;
  closingQuestion?: string;
  icon?: StoryIconName;
}

export const ConclusionCard: React.FC<TemplateProps<ConclusionCardData>> = ({ data, theme, delay = 0 }) => {
  const t = getDocumentaryTokens(theme);
  return (
    <DocumentaryCanvas theme={theme} delay={delay} eyebrow={data.label ?? "What it means"} footer="End of chapter" contentStyle={{ justifyContent: "flex-start", paddingTop: 50 }}>
      <DocumentaryReveal delay={delay + 6} direction="wipe"><div style={{ fontFamily: t.display, fontSize: 112, lineHeight: 0.82, textTransform: "uppercase", maxWidth: 600 }}>{data.conclusion}</div></DocumentaryReveal>
      <DocumentaryReveal delay={delay + 24} direction="right" style={{ margin: "52px -48px 0 -52px", padding: "36px 52px", color: t.base, background: t.accent }}><div style={{ fontFamily: t.serif, fontSize: 29, lineHeight: 1.35, fontWeight: 700 }}>{data.takeaway}</div></DocumentaryReveal>
      {data.closingQuestion ? <DocumentaryReveal delay={delay + 40} style={{ marginTop: 38 }}><div style={{ fontFamily: t.serif, fontSize: 27, lineHeight: 1.3, fontStyle: "italic", color: t.mid }}>{data.closingQuestion}</div></DocumentaryReveal> : null}
    </DocumentaryCanvas>
  );
};
