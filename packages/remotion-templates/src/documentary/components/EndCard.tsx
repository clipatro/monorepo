import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import type { ThemeConfig } from "../../themes/index.ts";
import { DocumentaryCanvas, DocumentaryReveal, getDocumentaryTokens } from "../canvas.tsx";
import { StoryIcon } from "../../primitives/StoryIcon.tsx";

interface Props {
  text?: string;
  ctaText?: string;
  footerText?: string;
  theme?: ThemeConfig;
}

export const EndCard: React.FC<Props> = ({ text = "The story continues", ctaText = "Follow the evidence", footerText = "Clipatro documentaries", theme }) => {
  const frame = useCurrentFrame();
  const t = getDocumentaryTokens(theme);
  const rule = interpolate(frame, [18, 58], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return (
    <DocumentaryCanvas theme={theme} eyebrow={footerText} icon="archive" footer="End of film" edition="CREDITS" variant="paper" contentStyle={{ justifyContent: "flex-start", paddingTop: 360 }}>
      <div style={{ position: "absolute", left: -52, right: -48, top: 180, height: 230, background: t.base, overflow: "hidden" }}><div style={{ position: "absolute", right: 34, top: -34, color: `${t.bright}18`, fontFamily: t.display, fontSize: 250, lineHeight: 1 }}>END</div></div>
      <DocumentaryReveal delay={8} direction="wipe" style={{ position: "relative", color: t.base }}><div style={{ display: "flex", alignItems: "center", gap: 22 }}><StoryIcon name="flag" size={54} color={t.accent} /><span style={{ fontFamily: t.mono, fontSize: 15, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>Final note</span></div><h1 style={{ margin: "34px 0 0", maxWidth: 590, fontFamily: t.display, fontSize: text.length > 48 ? 88 : 108, lineHeight: 0.84, textTransform: "uppercase" }}>{text}</h1></DocumentaryReveal>
      <div style={{ width: `${rule * 100}%`, height: 7, background: t.accent, marginTop: 48 }} />
      <DocumentaryReveal delay={34} direction="left" style={{ marginTop: 34 }}><div style={{ display: "inline-flex", alignItems: "center", gap: 14, padding: "18px 24px", color: t.bright, background: t.base, fontFamily: t.mono, fontSize: 17, fontWeight: 700, letterSpacing: 1.3, textTransform: "uppercase" }}><StoryIcon name="arrowDown" size={25} color={t.accent} />{ctaText}</div></DocumentaryReveal>
    </DocumentaryCanvas>
  );
};
