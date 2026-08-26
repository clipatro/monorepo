import React from "react";
import type { ThemeConfig } from "../../themes/index.ts";
import { DocumentaryCanvas, DocumentaryReveal, getDocumentaryTokens } from "../canvas.tsx";

interface Props {
  title: string;
  subtitle: string;
  theme?: ThemeConfig;
}

export const TitleCard: React.FC<Props> = ({ title, subtitle, theme }) => {
  const t = getDocumentaryTokens(theme);
  return (
    <DocumentaryCanvas theme={theme} eyebrow="Clipatro original" footer="A short documentary" contentStyle={{ justifyContent: "flex-end", paddingBottom: 130 }}>
      <DocumentaryReveal delay={12} direction="wipe" style={{ position: "relative" }}>
        <h1 style={{ margin: 0, maxWidth: 610, fontFamily: t.display, fontSize: title.length > 42 ? 90 : 112, lineHeight: 0.84, textTransform: "uppercase", textWrap: "balance" }}>{title}</h1>
      </DocumentaryReveal>
      <DocumentaryReveal delay={30} direction="left" style={{ marginTop: 40, maxWidth: 560 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 20 }}>
          <span style={{ width: 68, height: 8, marginTop: 15, background: t.accent, flexShrink: 0 }} />
          <div style={{ color: t.mid, fontFamily: t.serif, fontSize: 31, lineHeight: 1.28, fontStyle: "italic" }}>{subtitle}</div>
        </div>
      </DocumentaryReveal>
    </DocumentaryCanvas>
  );
};
