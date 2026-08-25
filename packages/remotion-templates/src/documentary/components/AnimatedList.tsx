import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import type { ThemeConfig } from "../../themes/index.ts";
import { DocumentaryCanvas, DocumentaryReveal, getDocumentaryTokens } from "../canvas.tsx";
import { StoryIcon, type StoryIconName } from "../../primitives/StoryIcon.tsx";

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
    <DocumentaryCanvas theme={theme} delay={delay} eyebrow="Editorial index" icon={data.icon ?? "book"} footer={`${items.length} points`} contentStyle={{ justifyContent: "flex-start", paddingTop: 42 }}>
      <DocumentaryReveal delay={delay + 4} direction="wipe"><h1 style={{ margin: 0, fontFamily: t.display, fontSize: data.title.length > 50 ? 68 : 82, lineHeight: 0.9, textTransform: "uppercase" }}>{data.title}</h1></DocumentaryReveal>
      <div style={{ position: "relative", marginTop: 55, paddingLeft: 105 }}><div style={{ position: "absolute", left: 38, top: 26, bottom: 26, width: 6, background: t.elevated }}><div style={{ width: "100%", height: `${rail}%`, background: t.accent }} /></div>{items.map((item, index) => { const color = item.color ?? (index === items.length - 1 ? t.accent : t.bright); return <DocumentaryReveal key={`${item.name}-${index}`} delay={delay + 14 + index * 12} direction="right"><div style={{ position: "relative", minHeight: 160, padding: "20px 0 22px", borderBottom: index === items.length - 1 ? 0 : `2px solid ${t.border}` }}><div style={{ position: "absolute", left: -102, top: 28, width: 72, height: 72, color: t.base, background: color, display: "grid", placeItems: "center", transform: "rotate(45deg)", border: `7px solid ${t.base}` }}><StoryIcon name={item.icon ?? (index === 0 ? "search" : index === 1 ? "document" : index === 2 ? "scale" : "flag")} size={30} style={{ transform: "rotate(-45deg)" }} /></div><div style={{ color, fontFamily: t.mono, fontSize: 14, fontWeight: 700, letterSpacing: 1.4 }}>0{index + 1}</div><div style={{ fontFamily: t.serif, fontSize: 31, lineHeight: 1.18, fontWeight: 700, marginTop: 8 }}>{item.name}</div><div style={{ color: t.mid, fontSize: 19, lineHeight: 1.4, marginTop: 8 }}>{item.description}</div></div></DocumentaryReveal>; })}</div>
    </DocumentaryCanvas>
  );
};
