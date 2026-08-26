import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import type { ThemeConfig } from "../../themes/index.ts";
import { DocumentaryCanvas, DocumentaryReveal, getDocumentaryTokens } from "../canvas.tsx";
import { type StoryIconName } from "../../primitives/StoryIcon.tsx";

export interface AnimatedListData {
  title: string;
  items: Array<{ name: string; description: string; color?: string; icon?: StoryIconName }>;
  icon?: StoryIconName;
}

interface Props {
  data: AnimatedListData;
  theme?: ThemeConfig;
  delay?: number;
}

export const AnimatedList: React.FC<Props> = ({ data, theme, delay = 0 }) => {
  const frame = useCurrentFrame();
  const t = getDocumentaryTokens(theme);
  const items = data.items.slice(0, 4);
  const rail = interpolate(frame, [delay + 10, delay + 72], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return (
    <DocumentaryCanvas theme={theme} delay={delay} eyebrow="Editorial index" footer={`${items.length} points`} contentStyle={{ justifyContent: "flex-start", paddingTop: 20 }}>
      <DocumentaryReveal delay={delay + 4} direction="wipe"><h1 style={{ margin: 0, fontFamily: t.display, fontSize: data.title.length > 50 ? 68 : 82, lineHeight: 0.9, textTransform: "uppercase" }}>{data.title}</h1></DocumentaryReveal>
      <div style={{ position: "relative", marginTop: 36, paddingLeft: 105 }}><div style={{ position: "absolute", left: 38, top: 26, bottom: 26, width: 6, background: t.elevated }}><div style={{ width: "100%", height: `${rail}%`, background: t.accent }} /></div>{items.map((item, index) => { const color = item.color ?? (index === items.length - 1 ? t.accent : t.bright); return <DocumentaryReveal key={`${item.name}-${index}`} delay={delay + 14 + index * 12} direction="right"><div style={{ position: "relative", minHeight: 130, padding: "16px 0 18px" }}><div style={{ position: "absolute", left: -102, top: 24, width: 56, height: 56, color: t.base, background: color, display: "grid", placeItems: "center", borderRadius: "50%" }}><span style={{ fontFamily: t.display, fontSize: 24 }}>0{index + 1}</span></div><div style={{ color, fontFamily: t.mono, fontSize: 14, fontWeight: 700, letterSpacing: 1.4 }}>0{index + 1}</div><div style={{ fontFamily: t.serif, fontSize: 28, lineHeight: 1.18, fontWeight: 700, marginTop: 6 }}>{item.name}</div><div style={{ color: t.mid, fontSize: 18, lineHeight: 1.4, marginTop: 6 }}>{item.description}</div></div></DocumentaryReveal>; })}</div>
    </DocumentaryCanvas>
  );
};
