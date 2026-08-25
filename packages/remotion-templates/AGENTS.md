# AGENTS.md — @automation/remotion-templates

> **Read this before adding or modifying any template component.**

## What this package is

A themable Remotion component catalog. Every component accepts a `theme` prop
so the same template can be rendered with different color palettes for different
channels. A Remotion Studio project provides hot-reloading previews for all
registered templates.

## Package layout

```
packages/remotion-templates/
├── src/
│   ├── index.ts                 # Public exports — add new components here
│   ├── themes/index.ts          # ThemeConfig type, 4 built-in themes, createTheme()
│   ├── primitives/              # Reusable building blocks (GlassCard, GradientText, etc.)
│   ├── components/              # Full template components (BarChart, TitleCard, etc.)
│   └── registry/index.ts        # Template registry — every component is registered here
└── studio/
    └── src/
        ├── index.ts             # registerRoot entry point
        └── Root.tsx             # All preview compositions
```

## Theme system

Every component MUST accept an optional `theme?: ThemeConfig` prop. If omitted,
components fall back to sensible defaults (the midnight theme's values or raw
fallbacks). Never hardcode colors — always pull from the theme.

### ThemeConfig shape

```ts
interface ThemeConfig {
  name: string;
  bg:       { base: string; surface: string; elevated: string };
  glass:    { bg: string; border: string; highlight: string };
  text:     { bright: string; mid: string; dim: string };
  accents:  { primary: string; primaryDeep: string; secondary: string;
              tertiary: string; success: string; warning: string; danger: string };
  chartColors: string[];           // cycled through data series
  chart:    { grid: string; axis: string };
  fonts:    { sans: string; mono: string };
  radius:   { sm: number; md: number; lg: number; xl: number };
  shadows:  { card: string; glow: string };
}
```

### Using themes in a component

```tsx
import type { ThemeConfig } from "../themes/index.ts";

interface Props {
  data: MyData;
  theme?: ThemeConfig;
  delay?: number;
}

export const MyComponent: React.FC<Props> = ({ data, theme, delay = 0 }) => {
  // Always provide fallbacks so the component works even without a theme
  const t = theme;
  const accent = t?.accents?.primary ?? "#00d4ff";
  const textBright = t?.text?.bright ?? "#ffffff";
  const glassBg = t?.glass?.bg ?? "rgba(255,255,255,0.04)";
  const sansFont = t?.fonts?.sans ?? "Inter, sans-serif";
  // ...
};
```

### Built-in themes

| Name      | Vibe              | Primary   |
|-----------|-------------------|-----------|
| midnight  | Cool, tech        | #00d4ff   |
| sunset    | Warm, energetic   | #f97316   |
| forest    | Natural, calm     | #10b981   |
| royal     | Premium, gold     | #fbbf24   |

### Creating a custom theme

```ts
import { createTheme } from "@automation/remotion-templates";

const channelTheme = createTheme("midnight", {
  name: "my-channel",
  accents: { primary: "#ff6b00", primaryDeep: "#cc5500" },
  bg: { base: "#0a0500", surface: "#150a00", elevated: "#1f0e00" },
});
```

`createTheme` does a deep merge of the base theme with your overrides, so you
only specify the fields you want to change.

## Primitives

Always prefer composing primitives over re-implementing glass/glow/gradient
logic. Available in `src/primitives/`:

| Primitive            | Purpose                                          |
|----------------------|--------------------------------------------------|
| `AnimatedBackground` | Deep space bg with drifting orbs, grid, vignette  |
| `GlassCard`          | Glassmorphic container with spring entrance       |
| `GradientText`       | Text with gradient fill (WebkitBackgroundClip)     |
| `AnimatedNumber`     | Spring-animated counter with mono font             |
| `SectionTitle`       | Gradient title with spring slide-in entrance       |

Import pattern:
```tsx
import { GlassCard } from "../primitives/GlassCard.tsx";
import { SectionTitle } from "../primitives/SectionTitle.tsx";
```

## Component conventions

### 1. Props pattern

Every component follows this interface:
```ts
interface Props {
  data: SomeDataType;     // typed data object
  theme?: ThemeConfig;    // optional theme
  delay?: number;         // frames before entrance animation starts (default 0 or 5)
}
```

### 2. Export both component and data type

```tsx
export interface BarChartData {
  title: string;
  bars: Array<{ label: string; value: number; color?: string }>;
}

export const BarChart: React.FC<Props> = ({ data, theme, delay = 5 }) => { ... };
```

### 3. Animation timing

- Use `useCurrentFrame()` and `useVideoConfig()` from remotion
- Use `spring()` for entrance animations (scale, opacity, slide)
- Use `interpolate()` with `extrapolateRight: "clamp"` for progress-based animations
- Stagger multi-element entrances by `i * 10` or `i * 15` frames
- Use `Easing.out(Easing.cubic)` for smooth deceleration on bars/lines

### 4. Color access pattern

Always access theme colors with `?.` and `??` fallbacks:
```tsx
const accent = t?.accents?.primary ?? "#00d4ff";
const grid = t?.chart?.grid ?? "rgba(255,255,255,0.06)";
```

### 5. Chart colors

For data series (bars, pie segments, etc.), cycle through `theme.chartColors`:
```tsx
const color = bar.color ?? chartColors[i % chartColors.length];
```

Allow per-item color overrides via an optional `color` field in the data.

### 6. SVG filters for glow

```tsx
<defs>
  <filter id="myGlow" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="6" result="blur" />
    <feMerge>
      <feMergeNode in="blur" />
      <feMergeNode in="SourceGraphic" />
    </feMerge>
  </filter>
</defs>
```

### 7. Glassmorphism

```tsx
const glassStyle: React.CSSProperties = {
  background: t?.glass?.bg ?? "rgba(255,255,255,0.04)",
  border: `1px solid ${t?.glass?.border ?? "rgba(255,255,255,0.08)"}`,
  borderRadius: t?.radius?.xl ?? 24,
  boxShadow: t.shadows?.card ?? "0 8px 32px rgba(0,0,0,0.4)",
  backdropFilter: "blur(20px)",
};
```

Or just use the `GlassCard` primitive which handles all of this.

## How to add a new template

### Step 1: Create the component

Create `src/components/MyTemplate.tsx`:

```tsx
import React from "react";
import { useCurrentFrame, useVideoConfig, spring } from "remotion";
import type { ThemeConfig } from "../themes/index.ts";
import { GlassCard } from "../primitives/GlassCard.tsx";
import { SectionTitle } from "../primitives/SectionTitle.tsx";

export interface MyTemplateData {
  title: string;
  // ... your data fields
}

interface Props {
  data: MyTemplateData;
  theme?: ThemeConfig;
  delay?: number;
}

export const MyTemplate: React.FC<Props> = ({ data, theme, delay = 5 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = theme;

  // ... implementation

  return (
    <GlassCard width={620} height={820} delay={delay} theme={t}>
      {/* content */}
    </GlassCard>
  );
};
```

### Step 2: Export from index.ts

Add to `src/index.ts`:
```ts
export { MyTemplate, type MyTemplateData } from "./components/MyTemplate.tsx";
```

### Step 3: Register in the registry

Add to `src/registry/index.ts`:
```ts
import { MyTemplate, type MyTemplateData } from "../components/MyTemplate.tsx";

// Add sample data
const sampleMyData: MyTemplateData = {
  title: "Sample Title",
  // ...
};

// Add to the registry array
{
  slug: "my-template",           // kebab-case, unique
  name: "My Template",           // display name
  subtitle: "Short description",
  category: "Charts & Data",     // or "Text", "Intro & Outro", "Content Animation"
  component: MyTemplate,
  defaultProps: { data: sampleMyData },
  durationInFrames: 180,         // at 60fps, 180 frames = 3 seconds
  fps: 60,
  width: 720,
  height: 1280,
},
```

### Step 4: Add studio preview composition

Add to `studio/src/Root.tsx`:
```tsx
import { MyTemplate } from "@automation/remotion-templates";

// In the RemotionRoot component:
<Composition
  id="my-template"
  component={MyTemplate}
  durationInFrames={180}
  fps={60}
  width={720}
  height={1280}
  defaultProps={{ data: sampleMyData }}
/>
```

### Step 5: Verify

1. Run `bun run studio` — your template should appear in the studio sidebar
2. Click it to preview with hot reloading
3. Run `bun tsc --noEmit 2>&1 | grep remotion-templates` — should be clean

## Studio usage

```bash
# Start the studio (hot reloading dev server)
bun run studio

# Render a specific composition to MP4
npx remotion render packages/remotion-templates/studio/src/index.ts <composition-id> out.mp4

# The studio runs on http://localhost:3100
```

### Studio compositions

The studio registers these composition types:
- `Gallery` — overview of all registered templates
- `Theme-Comparison` — same BarChart across all 4 themes side-by-side
- `<slug>` — one per template with default props (no explicit theme)
- `<theme>-<slug>` — template rendered with a specific theme

### Hot reloading

Edit any `.tsx` file in `src/components/`, `src/primitives/`, or `src/themes/`
and the studio instantly reflects your changes. No restart needed.

## Registry API

```ts
import { getTemplate, listTemplates, listCategories } from "@automation/remotion-templates/registry";

const template = getTemplate("bar-chart");     // TemplateEntry | undefined
const charts = listTemplates("Charts & Data"); // TemplateEntry[]
const cats = listCategories();                  // { name, count }[]
```

## Remotion version

All Remotion packages are pinned to **4.0.411**. When upgrading, update all
`@remotion/*` and `remotion` packages together to the same version, plus
`zod@3.22.3` (Remotion's required version).

## Common pitfalls

1. **Don't hardcode colors.** Always pull from the theme with fallbacks.
2. **Don't forget `extrapolateRight: "clamp"`** on `interpolate()` calls, or
   animations will overshoot.
3. **Stagger multi-element entrances** so items don't all appear at once.
4. **Use `spring()` for organic motion** (entrances, scale, opacity) and
   `interpolate()` for deterministic progress (chart drawing, line strokes).
5. **Export the data type** alongside the component so consumers get type safety.
6. **Register the template** in both `src/registry/index.ts` and
   `studio/src/Root.tsx` — the registry is for programmatic use, the studio
   composition is for visual preview.
7. **Use `noUncheckedIndexedAccess`** — array access returns `T | undefined`.
   Use `!` or guards when you know the index is safe.
