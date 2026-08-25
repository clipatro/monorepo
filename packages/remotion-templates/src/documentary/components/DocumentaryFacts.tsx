import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import type { ThemeConfig } from "../../themes/index.ts";
import { DocumentaryCanvas, DocumentaryPill, DocumentaryReveal, getDocumentaryTokens } from "../canvas.tsx";
import { StoryIcon, type StoryIconName } from "../../primitives/StoryIcon.tsx";

interface TemplateProps<T> {
  data: T;
  theme?: ThemeConfig;
  delay?: number;
}

export interface KeyFactData {
  label?: string;
  fact: string;
  detail?: string;
  source?: string;
  icon?: StoryIconName;
}

export const KeyFact: React.FC<TemplateProps<KeyFactData>> = ({ data, theme, delay = 0 }) => {
  const frame = useCurrentFrame();
  const t = getDocumentaryTokens(theme);
  const stamp = interpolate(frame, [delay + 8, delay + 30], [-18, -3], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.back(1.6)) });
  return (
    <DocumentaryCanvas theme={theme} delay={delay} eyebrow={data.label ?? "Key fact"} icon={data.icon ?? "alert"} footer={data.source} variant="paper">
      <div style={{ position: "absolute", top: 95, right: 8, transform: `rotate(${stamp}deg)`, padding: "14px 18px", color: t.accent, border: `5px double ${t.accent}`, fontFamily: t.mono, fontSize: 18, fontWeight: 700, letterSpacing: 2.5, textTransform: "uppercase" }}>Verified</div>
      <DocumentaryReveal delay={delay + 10} direction="wipe" style={{ width: 575 }}><h1 style={{ margin: 0, color: t.base, fontFamily: t.display, fontSize: data.fact.length > 100 ? 78 : 94, lineHeight: 0.92, fontWeight: 400, textTransform: "uppercase", letterSpacing: 0.2 }}>{data.fact}</h1></DocumentaryReveal>
      {data.detail ? <DocumentaryReveal delay={delay + 30} direction="left" style={{ marginTop: 42, width: 520 }}><div style={{ padding: "24px 0 0 26px", borderTop: `4px solid ${t.accent}`, borderLeft: `4px solid ${t.accent}`, color: `${t.base}bb`, fontFamily: t.serif, fontSize: 27, lineHeight: 1.4 }}>{data.detail}</div></DocumentaryReveal> : null}
    </DocumentaryCanvas>
  );
};

export interface StatisticSpotlightData {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  context: string;
  source?: string;
  icon?: StoryIconName;
  scaleMax?: number;
}

export const StatisticSpotlight: React.FC<TemplateProps<StatisticSpotlightData>> = ({ data, theme, delay = 0 }) => {
  const frame = useCurrentFrame();
  const t = getDocumentaryTokens(theme);
  const progress = interpolate(frame, [delay + 8, delay + 58], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const shown = data.value * progress;
  const fill = Math.min(1, data.value / (data.scaleMax ?? data.value)) * progress;
  return (
    <DocumentaryCanvas theme={theme} delay={delay} eyebrow={data.label} icon={data.icon ?? "trend"} footer={data.source ?? "Measured impact"} contentStyle={{ justifyContent: "flex-end", paddingBottom: 72 }}>
      <div style={{ position: "absolute", top: 100, left: -52, right: -48, height: 420, background: t.accent, transformOrigin: "left", transform: `scaleX(${0.15 + fill * 0.85})` }} />
      <div style={{ position: "absolute", top: 128, left: 0, color: t.base, fontFamily: t.display, fontSize: 210, lineHeight: 0.82, fontVariantNumeric: "tabular-nums", letterSpacing: -4 }}>{data.prefix}{shown.toFixed(data.decimals ?? 0)}{data.suffix}</div>
      <DocumentaryReveal delay={delay + 26} direction="wipe" style={{ position: "relative" }}><div style={{ fontFamily: t.serif, fontSize: 36, lineHeight: 1.26, maxWidth: 560 }}>{data.context}</div></DocumentaryReveal>
      <DocumentaryReveal delay={delay + 40} direction="left" style={{ marginTop: 38 }}><div style={{ display: "flex", alignItems: "center", gap: 14, color: t.mid, fontFamily: t.mono, fontSize: 14, letterSpacing: 1.2, textTransform: "uppercase" }}><StoryIcon name="scan" size={24} color={t.accent} />Proportion visualized against stated scale</div></DocumentaryReveal>
    </DocumentaryCanvas>
  );
};

export interface MythFactData {
  myth: string;
  fact: string;
  source?: string;
  icon?: StoryIconName;
}

export const MythFact: React.FC<TemplateProps<MythFactData>> = ({ data, theme, delay = 0 }) => {
  const frame = useCurrentFrame();
  const t = getDocumentaryTokens(theme);
  const strike = interpolate(frame, [delay + 18, delay + 46], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return (
    <DocumentaryCanvas theme={theme} delay={delay} eyebrow="Claim audit" icon={data.icon ?? "scale"} footer={data.source ?? "Evidence check"}>
      <DocumentaryReveal delay={delay + 6} direction="left">
        <div style={{ position: "relative", padding: "34px 34px 40px", background: t.elevated, border: `2px solid ${t.danger}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, color: t.danger, fontFamily: t.mono, fontSize: 15, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}><StoryIcon name="x" size={25} />Claim</div>
          <div style={{ color: t.mid, fontFamily: t.serif, fontSize: 33, lineHeight: 1.3, marginTop: 20 }}>{data.myth}</div>
          <div style={{ position: "absolute", left: 24, top: "54%", width: `${strike}%`, maxWidth: 560, height: 7, background: t.danger, transform: "rotate(-3deg)", transformOrigin: "left" }} />
        </div>
      </DocumentaryReveal>
      <DocumentaryReveal delay={delay + 26} direction="right" style={{ marginTop: 30, marginLeft: 54 }}>
        <div style={{ padding: "34px 36px 38px", color: t.base, background: t.bright, borderBottom: `12px solid ${t.success}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, color: t.success, fontFamily: t.mono, fontSize: 15, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}><StoryIcon name="check" size={25} />Record</div>
          <div style={{ fontFamily: t.serif, fontSize: 34, lineHeight: 1.28, fontWeight: 700, marginTop: 20 }}>{data.fact}</div>
        </div>
      </DocumentaryReveal>
    </DocumentaryCanvas>
  );
};

export interface ComparisonSplitData {
  title: string;
  left: { label: string; value: string; detail?: string; icon?: StoryIconName };
  right: { label: string; value: string; detail?: string; icon?: StoryIconName };
  verdict?: string;
}

export const ComparisonSplit: React.FC<TemplateProps<ComparisonSplitData>> = ({ data, theme, delay = 0 }) => {
  const frame = useCurrentFrame();
  const t = getDocumentaryTokens(theme);
  const divider = interpolate(frame, [delay + 8, delay + 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const sides = [{ ...data.left, color: t.accent }, { ...data.right, color: t.secondary }];
  return (
    <DocumentaryCanvas theme={theme} delay={delay} eyebrow={data.title} icon="scale" footer={data.verdict}>
      <div style={{ position: "absolute", top: 70, bottom: 80, left: "50%", width: 4, background: t.bright, transformOrigin: "top", transform: `scaleY(${divider})` }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 44 }}>
        {sides.map((side, index) => <DocumentaryReveal key={side.label} delay={delay + 14 + index * 14} direction={index === 0 ? "left" : "right"}>
          <div style={{ minHeight: 560, display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: index === 0 ? "flex-start" : "flex-end", textAlign: index === 0 ? "left" : "right" }}>
            <div><StoryIcon name={side.icon ?? (index === 0 ? "document" : "archive")} size={48} color={side.color} /><div style={{ marginTop: 22, color: side.color, fontFamily: t.mono, fontSize: 15, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" }}>{side.label}</div></div>
            <div><div style={{ color: side.color, fontFamily: t.display, fontSize: side.value.length > 8 ? 80 : 112, lineHeight: 0.86, fontVariantNumeric: "tabular-nums" }}>{side.value}</div>{side.detail ? <div style={{ color: t.mid, fontSize: 21, lineHeight: 1.42, marginTop: 24 }}>{side.detail}</div> : null}</div>
          </div>
        </DocumentaryReveal>)}
      </div>
      <div style={{ position: "absolute", left: "50%", top: 346, width: 62, height: 62, transform: "translateX(-50%) rotate(45deg)", background: t.bright, border: `5px solid ${t.base}`, display: "grid", placeItems: "center" }}><span style={{ transform: "rotate(-45deg)", color: t.base, fontFamily: t.mono, fontWeight: 700 }}>VS</span></div>
    </DocumentaryCanvas>
  );
};

export interface BeforeAfterData {
  title: string;
  before: { label?: string; value: string; detail: string };
  after: { label?: string; value: string; detail: string };
  change?: string;
}

export const BeforeAfter: React.FC<TemplateProps<BeforeAfterData>> = ({ data, theme, delay = 0 }) => {
  const frame = useCurrentFrame();
  const t = getDocumentaryTokens(theme);
  const progress = interpolate(frame, [delay + 16, delay + 72], [0.08, 0.92], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  return (
    <DocumentaryCanvas theme={theme} delay={delay} eyebrow={data.title} icon="time" footer={data.change ?? "Change over time"} variant="paper">
      <div style={{ position: "absolute", left: 18, right: 18, top: 390, height: 12, background: `${t.base}22` }}><div style={{ height: "100%", width: `${progress * 100}%`, background: t.accent }} /><div style={{ position: "absolute", left: `calc(${progress * 100}% - 28px)`, top: -22, width: 56, height: 56, background: t.base, border: `8px solid ${t.accent}`, borderRadius: "50%" }} /></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 38, color: t.base }}>
        {[data.before, data.after].map((item, index) => <DocumentaryReveal key={index} delay={delay + 8 + index * 28} direction={index === 0 ? "left" : "right"}><div style={{ minHeight: 590, display: "flex", flexDirection: "column", justifyContent: index === 0 ? "flex-start" : "flex-end", paddingBottom: index === 0 ? 0 : 20 }}><DocumentaryPill theme={theme} color={index === 0 ? `${t.base}88` : t.accent}>{item.label ?? (index === 0 ? "Before" : "After")}</DocumentaryPill><div style={{ marginTop: 28, color: index === 0 ? `${t.base}99` : t.accent, fontFamily: t.display, fontSize: 104, lineHeight: 0.85 }}>{item.value}</div><div style={{ marginTop: 20, color: `${t.base}aa`, fontFamily: t.serif, fontSize: 23, lineHeight: 1.4 }}>{item.detail}</div></div></DocumentaryReveal>)}
      </div>
    </DocumentaryCanvas>
  );
};
