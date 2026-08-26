import React from "react";
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
  const t = getDocumentaryTokens(theme);
  return (
    <DocumentaryCanvas theme={theme} eyebrow={footerText} footer="End of film" variant="paper" contentStyle={{ justifyContent: "flex-start", paddingTop: 140 }}>
      <DocumentaryReveal delay={8} direction="wipe" style={{ position: "relative", color: t.base }}>
        <div style={{ fontFamily: t.mono, fontSize: 15, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>Final note</div>
        <h1 style={{ margin: "34px 0 0", maxWidth: 590, fontFamily: t.display, fontSize: text.length > 48 ? 88 : 108, lineHeight: 0.84, textTransform: "uppercase" }}>{text}</h1>
      </DocumentaryReveal>
      <DocumentaryReveal delay={34} direction="left" style={{ marginTop: 48 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 14, padding: "18px 24px", color: t.bright, background: t.base, fontFamily: t.mono, fontSize: 17, fontWeight: 700, letterSpacing: 1.3, textTransform: "uppercase" }}>
          <StoryIcon name="arrowDown" size={25} color={t.accent} />{ctaText}
        </div>
      </DocumentaryReveal>
    </DocumentaryCanvas>
  );
};
