import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import type { ThemeConfig } from "../../themes/index.ts";
import { DocumentaryCanvas, DocumentaryPill, DocumentaryReveal, EditorialImage, getDocumentaryTokens, type DocumentaryImageData } from "../canvas.tsx";
import { StoryIcon, type StoryIconName } from "../../primitives/StoryIcon.tsx";

interface TemplateProps<T> {
  data: T;
  theme?: ThemeConfig;
  delay?: number;
}

export interface PersonProfileData extends DocumentaryImageData {
  name: string;
  role: string;
  years?: string;
  description: string;
  facts?: string[];
  icon?: StoryIconName;
}

export const PersonProfile: React.FC<TemplateProps<PersonProfileData>> = ({ data, theme, delay = 0 }) => {
  const t = getDocumentaryTokens(theme);
  return (
    <DocumentaryCanvas theme={theme} delay={delay} eyebrow="Key figure" icon={data.icon ?? "user"} footer={data.years} contentStyle={{ justifyContent: "flex-end", paddingBottom: 40 }}>
      <EditorialImage {...data} theme={theme} delay={delay + 2} pan="up" fallbackIcon="user" frameStyle={{ position: "absolute", inset: "18px -48px 410px 70px", height: 530, border: 0, boxShadow: `14px 18px 0 ${t.accent}` }} />
      <DocumentaryReveal delay={delay + 16} direction="wipe" style={{ position: "relative" }}><DocumentaryPill theme={theme} inverted>{data.role}</DocumentaryPill><h1 style={{ margin: "24px 0 0", fontFamily: t.display, fontSize: data.name.length > 22 ? 82 : 102, lineHeight: 0.84, textTransform: "uppercase" }}>{data.name}</h1></DocumentaryReveal>
      <DocumentaryReveal delay={delay + 28} direction="left"><p style={{ color: t.mid, fontFamily: t.serif, fontSize: 25, lineHeight: 1.42, margin: "26px 0 0", maxWidth: 580 }}>{data.description}</p></DocumentaryReveal>
      {data.facts?.length ? <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 22px", marginTop: 24 }}>{data.facts.slice(0, 3).map((fact, index) => <DocumentaryReveal key={fact} delay={delay + 38 + index * 8} direction="up"><div style={{ display: "flex", alignItems: "center", gap: 9, color: t.bright, fontFamily: t.mono, fontSize: 13, fontWeight: 700, letterSpacing: 0.5 }}><StoryIcon name={index === 0 ? "eye" : index === 1 ? "camera" : "document"} size={19} color={t.accent} />{fact}</div></DocumentaryReveal>)}</div> : null}
    </DocumentaryCanvas>
  );
};

export interface LocationCardData extends DocumentaryImageData {
  place: string;
  region?: string;
  coordinates?: string;
  significance: string;
  facts?: Array<{ label: string; value: string; icon?: StoryIconName }>;
  icon?: StoryIconName;
}

export const LocationCard: React.FC<TemplateProps<LocationCardData>> = ({ data, theme, delay = 0 }) => {
  const t = getDocumentaryTokens(theme);
  return (
    <DocumentaryCanvas theme={theme} delay={delay} eyebrow={data.region ?? "Location dossier"} icon={data.icon ?? "compass"} footer={data.coordinates} variant="paper" contentStyle={{ justifyContent: "flex-end", paddingBottom: 44 }}>
      <EditorialImage {...data} theme={theme} delay={delay + 3} pan="right" fallbackIcon="location" frameStyle={{ position: "absolute", left: -52, right: -48, top: 12, height: 610, border: 0, boxShadow: "none" }} />
      <div style={{ position: "absolute", left: -52, right: -48, top: 430, height: 250, background: t.bright, clipPath: "polygon(0 34%, 100% 0, 100% 100%, 0 100%)" }} />
      <DocumentaryReveal delay={delay + 18} direction="wipe" style={{ position: "relative", color: t.base }}><div style={{ display: "flex", gap: 18, alignItems: "center" }}><StoryIcon name="location" size={42} color={t.accent} /><h1 style={{ margin: 0, fontFamily: t.display, fontSize: 96, lineHeight: 0.84, textTransform: "uppercase" }}>{data.place}</h1></div><p style={{ margin: "24px 0 0", maxWidth: 560, color: `${t.base}bb`, fontFamily: t.serif, fontSize: 24, lineHeight: 1.42 }}>{data.significance}</p></DocumentaryReveal>
      {data.facts?.length ? <div style={{ position: "relative", display: "grid", gridTemplateColumns: `repeat(${Math.min(3, data.facts.length)}, 1fr)`, gap: 2, marginTop: 30, background: `${t.base}33`, border: `2px solid ${t.base}33` }}>{data.facts.slice(0, 3).map((fact, index) => <DocumentaryReveal key={fact.label} delay={delay + 32 + index * 9}><div style={{ minHeight: 108, padding: "16px 12px", color: t.base, background: t.bright }}><StoryIcon name={fact.icon ?? (index === 0 ? "user" : index === 1 ? "landmark" : "route")} size={22} color={t.accent} /><div style={{ fontFamily: t.display, fontSize: 35, marginTop: 7 }}>{fact.value}</div><div style={{ fontFamily: t.mono, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8 }}>{fact.label}</div></div></DocumentaryReveal>)}</div> : null}
    </DocumentaryCanvas>
  );
};

export interface MapRouteData {
  title: string;
  origin: string;
  destination: string;
  distance?: string;
  stops?: string[];
  note?: string;
  icon?: StoryIconName;
}

export const MapRoute: React.FC<TemplateProps<MapRouteData>> = ({ data, theme, delay = 0 }) => {
  const frame = useCurrentFrame();
  const t = getDocumentaryTokens(theme);
  const progress = interpolate(frame, [delay + 10, delay + 76], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  const route = "M62 338 C160 166 230 448 326 278 S474 112 558 235";
  const dotX = interpolate(progress, [0, 0.32, 0.62, 1], [62, 210, 362, 558]);
  const dotY = interpolate(progress, [0, 0.32, 0.62, 1], [338, 292, 228, 235]);
  return (
    <DocumentaryCanvas theme={theme} delay={delay} eyebrow={data.title} icon={data.icon ?? "route"} footer={data.distance ?? "Journey log"}>
      <div style={{ position: "relative", height: 650, border: `3px solid ${t.bright}`, background: t.surface, boxShadow: `14px 16px 0 ${t.accent}55`, overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, opacity: 0.35, backgroundImage: `linear-gradient(${t.border} 2px, transparent 2px), linear-gradient(90deg, ${t.border} 2px, transparent 2px)`, backgroundSize: "52px 52px" }} />
        <svg viewBox="0 0 620 560" width="100%" height="100%"><path d="M4 88 C120 12 198 82 304 40 S478 72 612 18" fill="none" stroke={t.border} strokeWidth="3" /><path d="M0 488 C110 392 210 512 334 445 S504 398 620 438" fill="none" stroke={t.border} strokeWidth="3" /><path d={route} fill="none" stroke={t.bright} strokeWidth="16" strokeLinecap="square" strokeDasharray="720" strokeDashoffset={720 * (1 - progress)} /><path d={route} fill="none" stroke={t.accent} strokeWidth="5" strokeLinecap="square" strokeDasharray="12 14" strokeDashoffset={720 * (1 - progress)} />{[[62, 338], [558, 235]].map(([x, y], index) => <g key={index}><rect x={(x ?? 0) - 18} y={(y ?? 0) - 18} width="36" height="36" fill={index === 0 ? t.bright : t.accent} transform={`rotate(45 ${x} ${y})`} /><circle cx={x} cy={y} r="6" fill={t.base} /></g>)}<circle cx={dotX} cy={dotY} r="13" fill={t.accent} stroke={t.base} strokeWidth="6" /></svg>
        <div style={{ position: "absolute", left: 46, top: 430, color: t.bright, fontFamily: t.display, fontSize: 36, textTransform: "uppercase" }}>{data.origin}</div><div style={{ position: "absolute", right: 30, top: 148, color: t.accent, fontFamily: t.display, fontSize: 36, textTransform: "uppercase", textAlign: "right" }}>{data.destination}</div>
      </div>
      {data.note ? <DocumentaryReveal delay={delay + 34} direction="left" style={{ marginTop: 34 }}><div style={{ display: "flex", gap: 16, alignItems: "flex-start", color: t.mid, fontFamily: t.serif, fontSize: 23, lineHeight: 1.4 }}><StoryIcon name="flag" size={29} color={t.accent} style={{ flexShrink: 0 }} />{data.note}</div></DocumentaryReveal> : null}
    </DocumentaryCanvas>
  );
};

export interface ProcessStepsData {
  title: string;
  steps: Array<{ title: string; detail?: string; color?: string; icon?: StoryIconName }>;
}

export const ProcessSteps: React.FC<TemplateProps<ProcessStepsData>> = ({ data, theme, delay = 0 }) => {
  const frame = useCurrentFrame();
  const t = getDocumentaryTokens(theme);
  const steps = data.steps.slice(0, 4);
  const path = interpolate(frame, [delay + 6, delay + 72], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return (
    <DocumentaryCanvas theme={theme} delay={delay} eyebrow={data.title} icon="workflow" footer={`${steps.length} stages`}>
      <div style={{ position: "absolute", left: 90, top: 110, bottom: 110, width: 6, background: t.elevated }}><div style={{ height: `${path}%`, background: t.accent }} /></div>
      <div style={{ display: "grid", gap: 8 }}>
        {steps.map((step, index) => { const color = step.color ?? (index === steps.length - 1 ? t.accent : t.bright); return <DocumentaryReveal key={`${step.title}-${index}`} delay={delay + 12 + index * 12} direction="right"><div style={{ display: "grid", gridTemplateColumns: "80px 1fr", alignItems: "center", minHeight: 150 }}><div style={{ position: "relative", width: 74, height: 74, display: "grid", placeItems: "center", color: t.base, background: color, transform: "rotate(45deg)", border: `7px solid ${t.base}` }}><StoryIcon name={step.icon ?? (index === 0 ? "search" : index === 1 ? "fingerprint" : index === 2 ? "shield" : "zap")} size={30} style={{ transform: "rotate(-45deg)" }} /></div><div style={{ paddingLeft: 34 }}><div style={{ color, fontFamily: t.mono, fontSize: 14, fontWeight: 700, letterSpacing: 1.5 }}>0{index + 1}</div><div style={{ fontFamily: t.serif, fontSize: 31, fontWeight: 700, marginTop: 5 }}>{step.title}</div>{step.detail ? <div style={{ color: t.mid, fontSize: 18, lineHeight: 1.35, marginTop: 7 }}>{step.detail}</div> : null}</div></div></DocumentaryReveal>; })}
      </div>
    </DocumentaryCanvas>
  );
};

export interface CauseEffectData {
  title: string;
  cause: { title: string; detail?: string; icon?: StoryIconName };
  effect: { title: string; detail?: string; icon?: StoryIconName };
  connector?: string;
}

export const CauseEffect: React.FC<TemplateProps<CauseEffectData>> = ({ data, theme, delay = 0 }) => {
  const frame = useCurrentFrame();
  const t = getDocumentaryTokens(theme);
  const impact = interpolate(frame, [delay + 22, delay + 58], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return (
    <DocumentaryCanvas theme={theme} delay={delay} eyebrow={data.title} icon="workflow" footer={data.connector ?? "Cause and consequence"}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: 650, border: `3px solid ${t.bright}` }}>
        <DocumentaryReveal delay={delay + 6} direction="left"><div style={{ height: "100%", padding: "42px 30px", color: t.base, background: t.bright, display: "flex", flexDirection: "column", justifyContent: "space-between" }}><div><StoryIcon name={data.cause.icon ?? "alert"} size={54} color={t.warning} /><div style={{ marginTop: 18, color: t.warning, fontFamily: t.mono, fontSize: 14, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>Cause</div></div><div><div style={{ fontFamily: t.serif, fontSize: 37, lineHeight: 1.16, fontWeight: 700 }}>{data.cause.title}</div>{data.cause.detail ? <div style={{ color: `${t.base}99`, fontSize: 20, lineHeight: 1.4, marginTop: 18 }}>{data.cause.detail}</div> : null}</div></div></DocumentaryReveal>
        <DocumentaryReveal delay={delay + 28} direction="right"><div style={{ height: "100%", padding: "42px 30px", background: t.accent, color: t.base, display: "flex", flexDirection: "column", justifyContent: "space-between" }}><div><StoryIcon name={data.effect.icon ?? "trend"} size={54} /><div style={{ marginTop: 18, fontFamily: t.mono, fontSize: 14, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>Effect</div></div><div><div style={{ fontFamily: t.display, fontSize: 58, lineHeight: 0.94, textTransform: "uppercase" }}>{data.effect.title}</div>{data.effect.detail ? <div style={{ color: `${t.base}aa`, fontSize: 20, lineHeight: 1.4, marginTop: 18 }}>{data.effect.detail}</div> : null}</div></div></DocumentaryReveal>
      </div>
      <div style={{ position: "absolute", left: `calc(50% - ${30 * impact}px)`, top: 370, width: 60, height: 60, color: t.base, background: t.secondary, border: `7px solid ${t.base}`, borderRadius: "50%", display: "grid", placeItems: "center", transform: `scale(${impact})` }}><StoryIcon name="zap" size={30} /></div>
    </DocumentaryCanvas>
  );
};
