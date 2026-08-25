import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import type { ThemeConfig } from "../../themes/index.ts";
import { DocumentaryCanvas, DocumentaryReveal, getDocumentaryTokens } from "../canvas.tsx";
import { StoryIcon } from "../../primitives/StoryIcon.tsx";

interface Props {
  title: string;
  subtitle: string;
  theme?: ThemeConfig;
}

export const TitleCard: React.FC<Props> = ({ title, subtitle, theme }) => {
  const frame = useCurrentFrame();
  const t = getDocumentaryTokens(theme);
  const band = interpolate(frame, [8, 46], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return (
    <DocumentaryCanvas theme={theme} eyebrow="Clipatro original" icon="camera" footer="A short documentary" edition="PREMIERE" contentStyle={{ justifyContent: "flex-end", paddingBottom: 90 }}>
      <div style={{ position: "absolute", top: 80, left: -52, right: -48, height: 360, background: t.accent, transformOrigin: "left", transform: `scaleX(${band})` }} />
      <div style={{ position: "absolute", top: 112, right: 4, color: t.base, fontFamily: t.mono, fontSize: 13, fontWeight: 700, letterSpacing: 2, writingMode: "vertical-rl", textTransform: "uppercase" }}>Documentary / Field edition</div>
      <DocumentaryReveal delay={12} direction="wipe" style={{ position: "relative" }}><StoryIcon name="archive" size={56} color={t.accent} /><h1 style={{ margin: "28px 0 0", maxWidth: 610, fontFamily: t.display, fontSize: title.length > 42 ? 90 : 112, lineHeight: 0.84, textTransform: "uppercase", textWrap: "balance" }}>{title}</h1></DocumentaryReveal>
      <DocumentaryReveal delay={30} direction="left" style={{ marginTop: 40, maxWidth: 560 }}><div style={{ display: "flex", alignItems: "flex-start", gap: 20 }}><span style={{ width: 68, height: 8, marginTop: 15, background: t.accent, flexShrink: 0 }} /><div style={{ color: t.mid, fontFamily: t.serif, fontSize: 31, lineHeight: 1.28, fontStyle: "italic" }}>{subtitle}</div></div></DocumentaryReveal>
    </DocumentaryCanvas>
  );
};
