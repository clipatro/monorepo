import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import type { ThemeConfig } from "../../themes/index.ts";
import { DocumentaryCanvas, DocumentaryReveal, EditorialImage, getDocumentaryTokens, type DocumentaryImageData } from "../canvas.tsx";
import { type StoryIconName } from "../../primitives/StoryIcon.tsx";

interface TemplateProps<T> {
  data: T;
  theme?: ThemeConfig;
  delay?: number;
}

export interface EvidenceCardData extends DocumentaryImageData {
  exhibit?: string;
  title: string;
  finding: string;
  confidence?: "high" | "medium" | "low";
  source?: string;
  icon?: StoryIconName;
}

export const EvidenceCard: React.FC<TemplateProps<EvidenceCardData>> = ({ data, theme, delay = 0 }) => {
  const frame = useCurrentFrame();
  const t = getDocumentaryTokens(theme);
  const confidenceValue = data.confidence === "low" ? 34 : data.confidence === "medium" ? 67 : 100;
  const meter = interpolate(frame, [delay + 22, delay + 62], [0, confidenceValue], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return (
    <DocumentaryCanvas theme={theme} delay={delay} eyebrow={data.exhibit ?? "Evidence file"} footer={data.source}>
      {data.imageUrl ? <EditorialImage {...data} theme={theme} delay={delay + 2} pan="left" frameStyle={{ position: "absolute", right: -48, top: 52, width: 330, height: 420 }} /> : null}
      <DocumentaryReveal delay={delay + 8} direction="wipe" style={{ width: data.imageUrl ? 330 : 570 }}><h1 style={{ margin: 0, fontFamily: t.display, fontSize: data.imageUrl ? 52 : data.title.length > 52 ? 70 : 82, lineHeight: data.imageUrl ? 0.96 : 0.9, textTransform: "uppercase" }}>{data.title}</h1></DocumentaryReveal>
      <DocumentaryReveal delay={delay + 26} direction="left" style={{ marginTop: 38, width: 550 }}><div style={{ color: t.mid, fontFamily: t.serif, fontSize: 29, lineHeight: 1.38 }}>{data.finding}</div></DocumentaryReveal>
      <DocumentaryReveal delay={delay + 40} style={{ marginTop: 42 }}><div style={{ display: "flex", alignItems: "center", gap: 18 }}><div style={{ color: t.dim, fontFamily: t.mono, fontSize: 13, letterSpacing: 1.4, textTransform: "uppercase" }}>Confidence</div><div style={{ width: 300, height: 14, background: t.elevated, border: `2px solid ${t.border}` }}><div style={{ width: `${meter}%`, height: "100%", background: data.confidence === "low" ? t.danger : data.confidence === "medium" ? t.warning : t.success }} /></div><div style={{ color: t.bright, fontFamily: t.mono, fontSize: 15, textTransform: "uppercase" }}>{data.confidence ?? "high"}</div></div></DocumentaryReveal>
    </DocumentaryCanvas>
  );
};

export interface SourceCitationData {
  index?: number;
  publisher: string;
  title: string;
  date?: string;
  excerpt?: string;
  urlLabel?: string;
  icon?: StoryIconName;
}

export const SourceCitation: React.FC<TemplateProps<SourceCitationData>> = ({ data, theme, delay = 0 }) => {
  const t = getDocumentaryTokens(theme);
  return (
    <DocumentaryCanvas theme={theme} delay={delay} eyebrow="Source record" footer={data.date} variant="paper">
      <DocumentaryReveal delay={delay + 6} direction="left"><div style={{ color: t.accent, fontFamily: t.display, fontSize: 145, lineHeight: 0.75 }}>[{String(data.index ?? 1).padStart(2, "0")}]</div></DocumentaryReveal>
      <DocumentaryReveal delay={delay + 16} direction="wipe"><div style={{ color: t.base, fontFamily: t.mono, fontSize: 16, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>{data.publisher} · {data.date}</div><h1 style={{ margin: "28px 0 0", color: t.base, fontFamily: t.serif, fontSize: 51, lineHeight: 1.12, letterSpacing: -1.4 }}>{data.title}</h1></DocumentaryReveal>
      {data.excerpt ? <DocumentaryReveal delay={delay + 30} direction="right" style={{ marginTop: 40, marginLeft: 62 }}><div style={{ color: `${t.base}b8`, fontFamily: t.serif, fontSize: 26, lineHeight: 1.45, fontStyle: "italic" }}>“{data.excerpt}”</div></DocumentaryReveal> : null}
    </DocumentaryCanvas>
  );
};

export interface DocumentRevealData {
  documentType?: string;
  title: string;
  date?: string;
  lines: string[];
  highlightIndex?: number;
  stamp?: string;
  icon?: StoryIconName;
}

export const DocumentReveal: React.FC<TemplateProps<DocumentRevealData>> = ({ data, theme, delay = 0 }) => {
  const frame = useCurrentFrame();
  const t = getDocumentaryTokens(theme);
  return (
    <DocumentaryCanvas theme={theme} delay={delay} eyebrow={data.documentType ?? "Primary document"} footer={data.date} variant="warm">
      <DocumentaryReveal delay={delay + 6} direction="scale">
        <div style={{ position: "relative", minHeight: 500, padding: "50px 42px", color: t.base, background: t.bright, border: `1px solid ${t.base}44`, overflow: "hidden" }}>
          <div style={{ position: "relative" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 20, paddingBottom: 18, borderBottom: `3px solid ${t.base}` }}><span style={{ fontFamily: t.mono, fontSize: 13, fontWeight: 700, letterSpacing: 1.6, textTransform: "uppercase" }}>{data.documentType ?? "Archived record"}</span><span style={{ fontFamily: t.mono, fontSize: 13 }}>{data.date}</span></div><h1 style={{ fontFamily: t.serif, fontSize: 44, lineHeight: 1.08, margin: "30px 0", letterSpacing: -1 }}>{data.title}</h1>{data.lines.slice(0, 5).map((line, index) => { const isHighlight = index === data.highlightIndex; const opacity = interpolate(frame, [delay + 18 + index * 8, delay + 28 + index * 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }); return <div key={`${line}-${index}`} style={{ opacity, position: "relative", fontFamily: t.serif, fontSize: 20, lineHeight: 1.48, marginBottom: 12, padding: isHighlight ? "6px 8px" : "6px 0", background: isHighlight ? `${t.warning}66` : "transparent" }}>{line}{isHighlight ? <span style={{ position: "absolute", left: -10, top: 0, bottom: 0, width: 5, background: t.warning }} /> : null}</div>; })}</div>
        </div>
      </DocumentaryReveal>
    </DocumentaryCanvas>
  );
};

export interface TimelineData {
  title: string;
  events: Array<{ date: string; title: string; detail?: string; color?: string; icon?: StoryIconName }>;
}

export const Timeline: React.FC<TemplateProps<TimelineData>> = ({ data, theme, delay = 0 }) => {
  const frame = useCurrentFrame();
  const t = getDocumentaryTokens(theme);
  const events = data.events.slice(0, 4);
  const rail = interpolate(frame, [delay + 8, delay + 82], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return (
    <DocumentaryCanvas theme={theme} delay={delay} eyebrow={data.title} footer={`${events.length} defining moments`}>
      <div style={{ position: "absolute", left: 158, top: 52, bottom: 54, width: 8, background: t.elevated }}><div style={{ width: "100%", height: `${rail}%`, background: t.accent }} /></div>
      <div style={{ display: "grid", gap: 4 }}>
        {events.map((event, index) => { const color = event.color ?? (index === events.length - 1 ? t.accent : t.bright); return <DocumentaryReveal key={`${event.date}-${event.title}`} delay={delay + 14 + index * 13} direction="right"><div style={{ display: "grid", gridTemplateColumns: "112px 50px 1fr", alignItems: "center", minHeight: 120 }}><div style={{ color, fontFamily: t.display, fontSize: 56, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{event.date}</div><div style={{ position: "relative", height: "100%" }}><div style={{ position: "absolute", left: 21, top: "50%", width: 18, height: 18, transform: "translateY(-50%)", background: color, borderRadius: "50%" }} /></div><div style={{ paddingLeft: 20 }}><span style={{ color: t.bright, fontFamily: t.serif, fontSize: 27, fontWeight: 700 }}>{event.title}</span>{event.detail ? <div style={{ color: t.mid, fontSize: 18, lineHeight: 1.35, marginTop: 8 }}>{event.detail}</div> : null}</div></div></DocumentaryReveal>; })}
      </div>
    </DocumentaryCanvas>
  );
};

export interface EventCountdownData {
  label?: string;
  count: number;
  unit: string;
  event: string;
  detail?: string;
  icon?: StoryIconName;
}

export const EventCountdown: React.FC<TemplateProps<EventCountdownData>> = ({ data, theme, delay = 0 }) => {
  const frame = useCurrentFrame();
  const t = getDocumentaryTokens(theme);
  const progress = interpolate(frame, [delay + 8, delay + 52], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const count = Math.round(data.count * progress);
  const circumference = 2 * Math.PI * 190;
  return (
    <DocumentaryCanvas theme={theme} delay={delay} eyebrow={data.label ?? "Countdown to impact"} footer={data.unit}>
      <div style={{ position: "relative", width: 420, height: 420, alignSelf: "center" }}><svg viewBox="0 0 440 440" width="100%" height="100%"><circle cx="220" cy="220" r="190" fill="none" stroke={t.elevated} strokeWidth="28" /><circle cx="220" cy="220" r="190" fill="none" stroke={t.accent} strokeWidth="28" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} transform="rotate(-90 220 220)" strokeLinecap="square" /></svg><div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}><div><div style={{ color: t.bright, fontFamily: t.display, fontSize: 150, lineHeight: 0.72, fontVariantNumeric: "tabular-nums" }}>{count}</div><div style={{ color: t.accent, fontFamily: t.mono, fontSize: 19, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase", marginTop: 22 }}>{data.unit}</div></div></div></div>
      <DocumentaryReveal delay={delay + 28} direction="wipe"><div style={{ textAlign: "center", fontFamily: t.serif, fontSize: 40, lineHeight: 1.16, fontWeight: 700 }}>{data.event}</div>{data.detail ? <div style={{ color: t.mid, textAlign: "center", fontSize: 20, lineHeight: 1.4, marginTop: 18 }}>{data.detail}</div> : null}</DocumentaryReveal>
    </DocumentaryCanvas>
  );
};
