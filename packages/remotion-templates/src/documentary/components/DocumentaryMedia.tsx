import React from "react";
import { Easing, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { ThemeConfig } from "../../themes/index.ts";
import { DocumentaryCanvas, DocumentaryPill, DocumentaryReveal, EditorialImage, getDocumentaryTokens, type DocumentaryImageData } from "../canvas.tsx";
import { StoryIcon, type StoryIconName } from "../../primitives/StoryIcon.tsx";

interface TemplateProps<T> {
  data: T;
  theme?: ThemeConfig;
  delay?: number;
}

export interface HeroImageStoryData extends DocumentaryImageData {
  label?: string;
  title: string;
  subtitle?: string;
  credit?: string;
  icon?: StoryIconName;
}

export const HeroImageStory: React.FC<TemplateProps<HeroImageStoryData>> = ({ data, theme, delay = 0 }) => {
  const t = getDocumentaryTokens(theme);
  return (
    <DocumentaryCanvas theme={theme} delay={delay} eyebrow={data.label ?? "Visual dispatch"} footer={data.credit} contentStyle={{ justifyContent: "flex-end", paddingBottom: 95 }}>
      <EditorialImage {...data} theme={theme} delay={delay + 2} pan="right" frameStyle={{ position: "absolute", inset: "0 -48px 240px -52px", border: 0, boxShadow: "none" }} />
      <div style={{ position: "absolute", left: -52, right: -48, bottom: 178, height: 320, background: `linear-gradient(transparent, ${t.base})` }} />
      <DocumentaryReveal delay={delay + 18} direction="wipe" style={{ position: "relative" }}><h1 style={{ margin: 0, fontFamily: t.display, fontSize: data.title.length > 46 ? 78 : 98, lineHeight: 0.88, textTransform: "uppercase" }}>{data.title}</h1>{data.subtitle ? <p style={{ margin: "26px 0 0", maxWidth: 560, color: t.mid, fontFamily: t.serif, fontSize: 25, lineHeight: 1.4 }}>{data.subtitle}</p> : null}</DocumentaryReveal>
    </DocumentaryCanvas>
  );
};

export interface ArchivalPhotoData extends DocumentaryImageData {
  archiveId?: string;
  title: string;
  caption: string;
  date?: string;
  location?: string;
}

export const ArchivalPhoto: React.FC<TemplateProps<ArchivalPhotoData>> = ({ data, theme, delay = 0 }) => {
  const t = getDocumentaryTokens(theme);
  return (
    <DocumentaryCanvas theme={theme} delay={delay} eyebrow="Archive photograph" footer={data.archiveId ?? data.date} variant="warm">
      <DocumentaryReveal delay={delay + 4} direction="scale"><div style={{ position: "relative", padding: "22px 22px 36px", color: t.base, background: t.bright }}><EditorialImage {...data} imageTreatment={data.imageTreatment ?? "archive"} theme={theme} delay={delay + 8} pan="left" frameStyle={{ height: 590, border: `2px solid ${t.base}`, boxShadow: "none" }} /><div style={{ display: "flex", justifyContent: "space-between", gap: 20, marginTop: 22, fontFamily: t.mono, fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}><span>{data.location}</span><span>{data.date}</span></div></div></DocumentaryReveal>
      <DocumentaryReveal delay={delay + 28} direction="left" style={{ marginTop: 40 }}><h1 style={{ margin: 0, fontFamily: t.serif, fontSize: 33, lineHeight: 1.18 }}>{data.title}</h1><p style={{ margin: "13px 0 0", color: t.mid, fontSize: 20, lineHeight: 1.4 }}>{data.caption}</p></DocumentaryReveal>
    </DocumentaryCanvas>
  );
};

export interface PhotoStackData {
  label?: string;
  title: string;
  images: Array<DocumentaryImageData & { caption?: string }>;
  note?: string;
}

export const PhotoStack: React.FC<TemplateProps<PhotoStackData>> = ({ data, theme, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = getDocumentaryTokens(theme);
  const photos = data.images.slice(0, 3);
  return (
    <DocumentaryCanvas theme={theme} delay={delay} eyebrow={data.label ?? "Photo record"} footer={`${photos.length} images`} variant="paper">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, height: 480 }}>
        {photos.map((photo, index) => { const appear = spring({ frame: frame - delay - 5 - index * 12, fps, from: 0, to: 1, config: { damping: 13, mass: 0.7, stiffness: 105 } }); return <div key={`${photo.imageUrl}-${index}`} style={{ opacity: appear, transform: `scale(${appear})` }}><EditorialImage {...photo} theme={theme} delay={delay + 7 + index * 12} pan={index % 2 ? "left" : "right"} frameStyle={{ height: "100%", border: `2px solid ${t.base}`, boxShadow: "none" }} /></div>; })}
      </div>
      <DocumentaryReveal delay={delay + 42} direction="wipe"><div style={{ color: t.base, fontFamily: t.display, fontSize: 58, textTransform: "uppercase" }}>{data.title}</div>{data.note ? <div style={{ color: `${t.base}aa`, fontFamily: t.serif, fontSize: 21, marginTop: 12 }}>{data.note}</div> : null}</DocumentaryReveal>
    </DocumentaryCanvas>
  );
};

export interface ImageComparisonData {
  title: string;
  before: DocumentaryImageData & { label?: string };
  after: DocumentaryImageData & { label?: string };
  note?: string;
}

export const ImageComparison: React.FC<TemplateProps<ImageComparisonData>> = ({ data, theme, delay = 0 }) => {
  const frame = useCurrentFrame();
  const t = getDocumentaryTokens(theme);
  const divider = interpolate(frame, [delay + 12, delay + 82], [8, 82], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  return (
    <DocumentaryCanvas theme={theme} delay={delay} eyebrow={data.title} footer={data.note ?? "Visual comparison"}>
      <div style={{ position: "relative", height: 600, overflow: "hidden", background: t.surface }}>
        {data.after.imageUrl ? <Img src={data.after.imageUrl} alt={data.after.imageAlt ?? data.after.label ?? "After"} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: data.after.imageFocalPoint ?? "50% 50%" }} /> : <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: t.accent }}><StoryIcon name="image" size={100} color={t.base} /></div>}
        <div style={{ position: "absolute", inset: 0, clipPath: `inset(0 ${100 - divider}% 0 0)` }}>{data.before.imageUrl ? <Img src={data.before.imageUrl} alt={data.before.imageAlt ?? data.before.label ?? "Before"} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: data.before.imageFocalPoint ?? "50% 50%", filter: "grayscale(1) contrast(1.08)" }} /> : <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", background: t.elevated }}><StoryIcon name="archive" size={100} color={t.mid} /></div>}</div>
        <div style={{ position: "absolute", top: 0, bottom: 0, left: `${divider}%`, width: 5, background: t.bright, transform: "translateX(-50%)" }} />
        <div style={{ position: "absolute", left: 20, top: 20 }}><DocumentaryPill theme={theme} color={t.bright}>{data.before.label ?? "Before"}</DocumentaryPill></div><div style={{ position: "absolute", right: 20, top: 20 }}><DocumentaryPill theme={theme} inverted>{data.after.label ?? "After"}</DocumentaryPill></div>
      </div>
    </DocumentaryCanvas>
  );
};

export interface ImageQuoteData extends DocumentaryImageData {
  quote: string;
  speaker: string;
  context?: string;
}

export const ImageQuote: React.FC<TemplateProps<ImageQuoteData>> = ({ data, theme, delay = 0 }) => {
  const t = getDocumentaryTokens(theme);
  return (
    <DocumentaryCanvas theme={theme} delay={delay} eyebrow="Witness testimony" footer={data.speaker} contentStyle={{ justifyContent: "flex-end", paddingBottom: 90 }}>
      <EditorialImage {...data} theme={theme} delay={delay + 2} pan="up" frameStyle={{ position: "absolute", inset: "0 -48px 0 -52px", border: 0, boxShadow: "none" }} />
      <div style={{ position: "absolute", inset: "25% -48px -92px -52px", background: `linear-gradient(transparent, ${t.base} 58%)` }} />
      <DocumentaryReveal delay={delay + 16} direction="wipe" style={{ position: "relative" }}><blockquote style={{ margin: 0, fontFamily: t.serif, fontSize: data.quote.length > 110 ? 36 : 44, lineHeight: 1.24, fontWeight: 700 }}>{data.quote}”</blockquote><div style={{ marginTop: 26, color: t.bright, fontFamily: t.mono, fontSize: 15, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase" }}>{data.speaker}</div>{data.context ? <div style={{ color: t.mid, fontSize: 18, marginTop: 10 }}>{data.context}</div> : null}</DocumentaryReveal>
    </DocumentaryCanvas>
  );
};

export interface EvidenceZoomData extends DocumentaryImageData {
  label?: string;
  callout: string;
  targetX: number;
  targetY: number;
  source?: string;
}

export const EvidenceZoom: React.FC<TemplateProps<EvidenceZoomData>> = ({ data, theme, delay = 0 }) => {
  const frame = useCurrentFrame();
  const t = getDocumentaryTokens(theme);
  const scan = interpolate(frame, [delay + 10, delay + 68], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return (
    <DocumentaryCanvas theme={theme} delay={delay} eyebrow={data.label ?? "Evidence detail"} footer={data.source}>
      <EditorialImage {...data} theme={theme} delay={delay + 2} pan="none" frameStyle={{ height: 600, borderColor: t.bright, boxShadow: `14px 16px 0 ${t.accent}55` }} />
      <div style={{ position: "absolute", left: `calc(${data.targetX}% - 42px)`, top: `calc(${data.targetY}% - 42px)`, width: 84, height: 84, border: `7px solid ${t.accent}`, borderRadius: "50%", transform: `scale(${scan})`, boxShadow: `0 0 0 12px ${t.base}77` }} />
      <div style={{ position: "absolute", left: `calc(${data.targetX}% + 36px)`, top: `calc(${data.targetY}% - 2px)`, width: 190 * scan, height: 5, background: t.accent, transformOrigin: "left" }} />
      <DocumentaryReveal delay={delay + 32} direction="right" style={{ position: "absolute", right: -10, top: `calc(${data.targetY}% - 62px)`, width: 250, padding: "20px 22px", color: t.base, background: t.accent, fontFamily: t.serif, fontSize: 21, lineHeight: 1.3 }}>{data.callout}</DocumentaryReveal>
    </DocumentaryCanvas>
  );
};

export interface ImageMosaicData {
  label?: string;
  title: string;
  images: Array<DocumentaryImageData & { caption?: string }>;
  credit?: string;
}

export const ImageMosaic: React.FC<TemplateProps<ImageMosaicData>> = ({ data, theme, delay = 0 }) => {
  const t = getDocumentaryTokens(theme);
  const images = data.images.slice(0, 3);
  return (
    <DocumentaryCanvas theme={theme} delay={delay} eyebrow={data.label ?? "Visual archive"} footer={data.credit} contentStyle={{ justifyContent: "flex-start", paddingTop: 20 }}>
      <DocumentaryReveal delay={delay + 6} direction="wipe"><div style={{ fontFamily: t.display, fontSize: 82, lineHeight: 0.86, textTransform: "uppercase" }}>{data.title}</div></DocumentaryReveal>
      <div style={{ display: "grid", gridTemplateColumns: "1.12fr 0.88fr", gridTemplateRows: "1fr 1fr", gap: 12, height: 580, marginTop: 28 }}>
        {images.map((image, index) => <DocumentaryReveal key={`${image.imageUrl}-${index}`} delay={delay + 16 + index * 10} direction={index === 0 ? "left" : "right"} style={index === 0 ? { gridRow: "1 / 3" } : undefined}><div style={{ position: "relative", width: "100%", height: "100%" }}><EditorialImage {...image} theme={theme} delay={delay + 16 + index * 10} pan={index === 0 ? "up" : "right"} frameStyle={{ width: "100%", height: "100%", border: `2px solid ${t.bright}`, boxShadow: "none" }} /></div></DocumentaryReveal>)}
      </div>
    </DocumentaryCanvas>
  );
};

export interface CaptionedImageData extends DocumentaryImageData {
  label?: string;
  caption: string;
  detail?: string;
  credit?: string;
  icon?: StoryIconName;
}

export const CaptionedImage: React.FC<TemplateProps<CaptionedImageData>> = ({ data, theme, delay = 0 }) => {
  const t = getDocumentaryTokens(theme);
  return (
    <DocumentaryCanvas theme={theme} delay={delay} eyebrow={data.label ?? "Scene context"} footer={data.credit} contentStyle={{ justifyContent: "flex-end", paddingBottom: 90 }}>
      <EditorialImage {...data} theme={theme} delay={delay + 2} pan="right" frameStyle={{ position: "absolute", inset: "0 -48px 270px -52px", border: 0, boxShadow: "none" }} />
      <DocumentaryReveal delay={delay + 20} direction="right" style={{ position: "relative", marginLeft: 72, padding: "30px 32px", color: t.base, background: t.bright, borderBottom: `12px solid ${t.accent}` }}><div style={{ fontFamily: t.serif, fontSize: 31, lineHeight: 1.28, fontWeight: 700 }}>{data.caption}</div>{data.detail ? <div style={{ color: `${t.base}99`, fontSize: 19, lineHeight: 1.38, marginTop: 12 }}>{data.detail}</div> : null}</DocumentaryReveal>
    </DocumentaryCanvas>
  );
};
