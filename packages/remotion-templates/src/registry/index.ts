/**
 * Template Registry — catalog of all available templates.
 *
 * Each template is registered with:
 * - slug: unique identifier
 * - name: display name
 * - category: grouping (Charts, Text, Intro, etc.)
 * - component: the React component
 * - defaultProps: sample data for preview
 * - durationInFrames: default duration for preview
 *
 * The registry is used by:
 * - The Studio app to render preview compositions
 * - The video pipeline to select templates by slug
 * - The catalog CLI to list available templates
 */

import React from "react";
import { BarChart, type BarChartData } from "../documentary/components/BarChart.tsx";
import { LineChart, type LineChartData } from "../documentary/components/LineChart.tsx";
import { PieChart, type PieChartData } from "../documentary/components/PieChart.tsx";
import { AnimatedList, type AnimatedListData } from "../documentary/components/AnimatedList.tsx";
import { CircularProgress, type CircularProgressData } from "../documentary/components/CircularProgress.tsx";
import { TitleCard } from "../documentary/components/TitleCard.tsx";
import { EndCard } from "../documentary/components/EndCard.tsx";
import type { ThemeConfig } from "../themes/index.ts";
import { getComponentCapability, type ComponentCapability } from "../documentary/capabilities.ts";
import { documentaryRegistry } from "../documentary/registry.ts";
import { mediaRegistry } from "../documentary/media-registry.ts";
import { getMysteryComponentCapability, type MysteryComponentCapability } from "../mystery/capabilities.ts";
import { mysteryRegistry } from "../mystery/registry.ts";
import { getKidsComponentCapability, type KidsComponentCapability } from "../kids/capabilities.ts";
import { kidsRegistry } from "../kids/registry.ts";

export type TemplateCategory =
  | "Charts & Data"
  | "Text"
  | "Intro & Outro"
  | "Content Animation"
  | "Narrative"
  | "Facts & Data"
  | "Evidence"
  | "People & Places"
  | "Explainers"
  | "Image & Media";

export interface TemplateDefinition {
  slug: string;
  name: string;
  subtitle: string;
  category: TemplateCategory;
  component: React.FC<any>;
  defaultProps: any;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
}

export interface TemplateEntry extends TemplateDefinition {
  capability: ComponentCapability | MysteryComponentCapability | KidsComponentCapability;
}

// ─── Sample data for previews ────────────────────────────────────────────────

const sampleBarData: BarChartData = {
  title: "U.S. National Debt (Trillions)",
  yAxisLabel: "Trillions of $",
  maxValue: 35,
  bars: [
    { label: "1990", value: 3.2 },
    { label: "2000", value: 5.6 },
    { label: "2010", value: 13.5 },
    { label: "2020", value: 26.9 },
    { label: "2023", value: 33 },
  ],
};

const sampleLineData: LineChartData = {
  title: "Federal Interest Payments (Billions)",
  yAxisLabel: "Billions of $",
  maxValue: 700,
  points: [
    { label: "2010", value: 196 },
    { label: "2015", value: 223 },
    { label: "2020", value: 345 },
    { label: "2023", value: 600 },
  ],
};

const samplePieData: PieChartData = {
  title: "Where Do Federal Dollars Go?",
  segments: [
    { label: "Interest", value: 20 },
    { label: "Defense", value: 20 },
    { label: "Health Care", value: 33 },
    { label: "Social Security", value: 27 },
  ],
};

const sampleListData: AnimatedListData = {
  title: "Keys to Fiscal Responsibility",
  items: [
    { name: "Careful Spending", description: "Prioritize essential investments" },
    { name: "Fair Taxation", description: "Ensure everyone pays their share" },
    { name: "Long-Term Planning", description: "Think beyond the next election" },
  ],
};

const sampleProgressData: CircularProgressData = {
  title: "National Debt as % of GDP",
  percentage: 120,
  label: "Debt exceeded the size of annual economic output.",
  sublabel: "of GDP",
};

// ─── Registry ────────────────────────────────────────────────────────────────

const templateDefinitions: TemplateDefinition[] = [
  {
    slug: "bar-chart",
    name: "Bar Chart",
    subtitle: "Animated bar chart with gradient bars and glow",
    category: "Charts & Data",
    component: BarChart,
    defaultProps: { data: sampleBarData },
    durationInFrames: 180,
    fps: 60,
    width: 720,
    height: 1280,
  },
  {
    slug: "line-chart",
    name: "Line Chart",
    subtitle: "Animated line chart with gradient area fill",
    category: "Charts & Data",
    component: LineChart,
    defaultProps: { data: sampleLineData },
    durationInFrames: 180,
    fps: 60,
    width: 720,
    height: 1280,
  },
  {
    slug: "pie-chart",
    name: "Pie Chart",
    subtitle: "Animated pie chart with glowing segments",
    category: "Charts & Data",
    component: PieChart,
    defaultProps: { data: samplePieData },
    durationInFrames: 180,
    fps: 60,
    width: 720,
    height: 1280,
  },
  {
    slug: "animated-list",
    name: "Animated List",
    subtitle: "Glassmorphic list cards with slide-in animation",
    category: "Content Animation",
    component: AnimatedList,
    defaultProps: { data: sampleListData },
    durationInFrames: 150,
    fps: 60,
    width: 720,
    height: 1280,
  },
  {
    slug: "circular-progress",
    name: "Circular Progress",
    subtitle: "Animated progress ring with counter",
    category: "Charts & Data",
    component: CircularProgress,
    defaultProps: { data: sampleProgressData },
    durationInFrames: 150,
    fps: 60,
    width: 720,
    height: 1280,
  },
  {
    slug: "title-card",
    name: "Title Card",
    subtitle: "Cinematic title with floating particles",
    category: "Intro & Outro",
    component: TitleCard,
    defaultProps: { title: "The National Debt Explained", subtitle: "What You Need to Know" },
    durationInFrames: 150,
    fps: 60,
    width: 720,
    height: 1280,
  },
  {
    slug: "end-card",
    name: "End Card",
    subtitle: "Glassmorphic outro with CTA button",
    category: "Intro & Outro",
    component: EndCard,
    defaultProps: {},
    durationInFrames: 120,
    fps: 60,
    width: 720,
    height: 1280,
  },
  ...documentaryRegistry,
  ...mediaRegistry,
  ...mysteryRegistry,
  ...kidsRegistry,
];

export const registry: TemplateEntry[] = templateDefinitions.map((definition) => {
  const capability = getComponentCapability(definition.slug) ?? getMysteryComponentCapability(definition.slug) ?? getKidsComponentCapability(definition.slug);
  if (!capability) throw new Error(`Missing component capability metadata: ${definition.slug}`);
  return { ...definition, capability };
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getTemplate(slug: string): TemplateEntry | undefined {
  return registry.find((t) => t.slug === slug);
}

export function listTemplates(category?: TemplateCategory): TemplateEntry[] {
  if (category) return registry.filter((t) => t.category === category);
  return registry;
}

export function listCategories(): { name: TemplateCategory; count: number }[] {
  const cats = new Set(registry.map((t) => t.category));
  return Array.from(cats).map((name) => ({
    name,
    count: registry.filter((t) => t.category === name).length,
  }));
}
