import type React from "react";
import type { ThemeConfig } from "../themes/index.ts";
import { ArchivalPhoto, CaptionedImage, EvidenceZoom, HeroImageStory, ImageComparison, ImageMosaic, ImageQuote, PhotoStack, type ArchivalPhotoData, type CaptionedImageData, type EvidenceZoomData, type HeroImageStoryData, type ImageComparisonData, type ImageMosaicData, type ImageQuoteData, type PhotoStackData } from "./components/DocumentaryMedia.tsx";
import type { TemplateDefinition } from "../registry/index.ts";

const sampleImage = "https://images.unsplash.com/photo-1682687220742-aba13b6e50ba";
const hero: HeroImageStoryData = { label: "From the field", title: "The landscape remembers", subtitle: "Every visible scar records a decision made decades earlier.", imageUrl: sampleImage, imageAlt: "Mountain landscape", imageTreatment: "documentary", credit: "Field archive" };
const archival: ArchivalPhotoData = { title: "The last expedition north", caption: "The team photographed the pass three weeks before winter closed the route.", imageUrl: sampleImage, imageAlt: "Historic expedition landscape", imageTreatment: "archive", archiveId: "ARC-1974-018", date: "October 1974", location: "Northern range" };
const stack: PhotoStackData = { title: "Three views, one landscape", note: "Taken from the same ridge across a single season.", images: [{ imageUrl: sampleImage, imageAlt: "Wide landscape", imageTreatment: "archive", imageFocalPoint: "30% 50%", caption: "Frame 01 · West ridge" }, { imageUrl: sampleImage, imageAlt: "Landscape detail", imageTreatment: "monochrome", imageFocalPoint: "70% 45%", caption: "Frame 02 · Valley" }, { imageUrl: sampleImage, imageAlt: "Landscape summit", imageTreatment: "documentary", imageFocalPoint: "50% 28%", caption: "Frame 03 · Summit" }] };
const comparison: ImageComparisonData = { title: "A landscape transformed", before: { imageUrl: sampleImage, imageAlt: "Landscape before", label: "Archive · 1974", imageFocalPoint: "35% 50%" }, after: { imageUrl: sampleImage, imageAlt: "Landscape after", label: "Survey · Today", imageFocalPoint: "62% 50%" }, note: "Same ridge, fifty years apart" };
const imageQuote: ImageQuoteData = { quote: "We could see the weather changing before the instruments recorded it.", speaker: "Mara Ellison", context: "Field geologist · 1974 survey", imageUrl: sampleImage, imageAlt: "Mountain survey landscape", imageTreatment: "documentary" };
const zoom: EvidenceZoomData = { label: "Survey image 07", callout: "This exposed layer marks the earlier shoreline.", targetX: 47, targetY: 38, source: "Geological field archive", imageUrl: sampleImage, imageAlt: "Landscape with geological detail", imageTreatment: "documentary" };
const mosaic: ImageMosaicData = { title: "The terrain of the investigation", credit: "Field archive", images: [{ imageUrl: sampleImage, imageAlt: "Mountain panorama", imageFocalPoint: "35% 50%", caption: "Western approach" }, { imageUrl: sampleImage, imageAlt: "Mountain valley", imageFocalPoint: "70% 55%", imageTreatment: "monochrome", caption: "Valley floor" }, { imageUrl: sampleImage, imageAlt: "Mountain summit", imageFocalPoint: "48% 25%", imageTreatment: "archive", caption: "Survey summit" }] };
const captioned: CaptionedImageData = { label: "Scene evidence", caption: "The original route crossed the exposed ridge before descending into the valley.", detail: "Survey markers remain visible along the eastern face.", credit: "Northern expedition archive", imageUrl: sampleImage, imageAlt: "Mountain route", imageTreatment: "documentary", icon: "route" };

const entry = <T,>(slug: string, name: string, subtitle: string, component: React.FC<{ data: T; theme?: ThemeConfig; delay?: number }>, data: T, durationInFrames = 180): TemplateDefinition => ({ slug, name, subtitle, category: "Image & Media", component, defaultProps: { data }, durationInFrames, fps: 60, width: 720, height: 1280 });

export const mediaRegistry: TemplateDefinition[] = [
  entry("hero-image-story", "Hero Image Story", "Full-bleed image with an asymmetric editorial headline", HeroImageStory, hero, 165),
  entry("archival-photo", "Archival Photo", "Historical image presented as a tactile archive object", ArchivalPhoto, archival, 180),
  entry("photo-stack", "Photo Stack", "Two or three related photographs landing as a physical stack", PhotoStack, stack, 180),
  entry("image-comparison", "Image Comparison", "Animated wipe between two aligned visual states", ImageComparison, comparison, 180),
  entry("image-quote", "Image Quote", "Image-led witness or expert testimony", ImageQuote, imageQuote, 180),
  entry("evidence-zoom", "Evidence Zoom", "Image detail with a forensic target and callout", EvidenceZoom, zoom, 180),
  entry("image-mosaic", "Image Mosaic", "Three-image editorial collage for visual context", ImageMosaic, mosaic, 180),
  entry("captioned-image", "Captioned Image", "Cinematic image with a concise explanatory caption", CaptionedImage, captioned, 165),
];
