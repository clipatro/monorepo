/**
 * Studio Root — registers a composition for every template in the registry,
 * plus a "Gallery" overview composition and theme comparison compositions.
 *
 * When you run `remotion studio src/index.ts`, you'll see all templates
 * in the left sidebar. Click any one to preview it with hot reloading.
 *
 * Edit any component in packages/remotion-templates/src/components/*.tsx
 * and the studio will instantly reflect your changes.
 */
import React from "react";
import { Composition, AbsoluteFill } from "remotion";
import {
  registry,
  midnightTheme,
  sunsetTheme,
  forestTheme,
  royalTheme,
  AnimatedBackground,
  BarChart,
  LineChart,
  PieChart,
  AnimatedList,
  CircularProgress,
  TitleCard,
  EndCard,
  type BarChartData,
  type LineChartData,
  type PieChartData,
  type AnimatedListData,
  type CircularProgressData,
} from "@automation/remotion-templates";

// ─── Theme switcher wrapper ──────────────────────────────────────────────────

const ThemeWrapper: React.FC<{
  theme: typeof midnightTheme;
  children: React.ReactNode;
}> = ({ theme, children }) => {
  return (
    <AbsoluteFill>
      <AnimatedBackground theme={theme} />
      <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ─── Sample data (economy-themed for consistency) ────────────────────────────

const barData: BarChartData = {
  title: "U.S. National Debt (Trillions)",
  yAxisLabel: "Trillions of $",
  maxValue: 35,
  bars: [
    { label: "1990", value: 3.2 },
    { label: "2000", value: 5.6 },
    { label: "2010", value: 13.5 },
    { label: "2020", value: 26.9 },
    { label: "2023", value: 33, color: "#f43f5e" },
  ],
};

const lineData: LineChartData = {
  title: "Federal Interest Payments (Billions)",
  yAxisLabel: "Billions of $",
  maxValue: 700,
  lineColor: "#f43f5e",
  points: [
    { label: "2010", value: 196 },
    { label: "2015", value: 223 },
    { label: "2020", value: 345 },
    { label: "2023", value: 600 },
  ],
};

const pieData: PieChartData = {
  title: "Where Do Federal Dollars Go?",
  segments: [
    { label: "Interest", value: 15, color: "#f43f5e" },
    { label: "Defense", value: 15, color: "#00d4ff" },
    { label: "Health Care", value: 25, color: "#a855f7" },
    { label: "Social Security", value: 20, color: "#f59e0b" },
    { label: "Other", value: 25, color: "#10b981" },
  ],
};

const listData: AnimatedListData = {
  title: "Keys to Fiscal Responsibility",
  items: [
    { name: "Careful Spending", description: "Prioritize essential investments" },
    { name: "Fair Taxation", description: "Ensure everyone pays their share" },
    { name: "Long-Term Planning", description: "Think beyond the next election" },
  ],
};

const progressData: CircularProgressData = {
  title: "National Debt as % of GDP",
  percentage: 120,
  label: "120%",
  sublabel: "of GDP",
  color: "#f43f5e",
};

// ─── Gallery: all templates in one composition ───────────────────────────────

const Gallery: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: "#06080f", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
      <h1 style={{ color: "#fff", fontSize: 32, fontFamily: "Inter, sans-serif" }}>
        Remotion Template Gallery
      </h1>
      <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 16, fontFamily: "Inter, sans-serif" }}>
        {registry.length} templates registered · Click individual compositions to preview
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 680 }}>
        {registry.map((t) => (
          <div key={t.slug} style={{
            padding: "16px 20px",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12,
          }}>
            <div style={{ color: "#00d4ff", fontSize: 14, fontWeight: 600, fontFamily: "Inter, sans-serif" }}>
              {t.name}
            </div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 4 }}>
              {t.subtitle}
            </div>
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginTop: 8 }}>
              {t.category} · {t.durationInFrames}f · {t.fps}fps
            </div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// ─── Theme comparison: same BarChart across all 4 themes ─────────────────────

const ThemeComparison: React.FC = () => {
  return (
    <AbsoluteFill style={{ display: "flex", flexDirection: "column", background: "#06080f" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", flex: 1 }}>
        <ThemeWrapper theme={midnightTheme}>
          <BarChart data={barData} theme={midnightTheme} />
        </ThemeWrapper>
        <ThemeWrapper theme={sunsetTheme}>
          <BarChart data={barData} theme={sunsetTheme} />
        </ThemeWrapper>
        <ThemeWrapper theme={forestTheme}>
          <BarChart data={barData} theme={forestTheme} />
        </ThemeWrapper>
        <ThemeWrapper theme={royalTheme}>
          <BarChart data={barData} theme={royalTheme} />
        </ThemeWrapper>
      </div>
    </AbsoluteFill>
  );
};

// ─── Root: register all compositions ─────────────────────────────────────────

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Gallery overview */}
      <Composition
        id="Gallery"
        component={Gallery}
        durationInFrames={120}
        fps={60}
        width={720}
        height={1280}
      />

      {/* Theme comparison */}
      <Composition
        id="Theme-Comparison"
        component={ThemeComparison}
        durationInFrames={180}
        fps={60}
        width={1440}
        height={1280}
      />

      {/* One composition per template, per theme */}
      {registry.map((template) => {
        const Comp = template.component;
        return (
          <Composition
            key={template.slug}
            id={template.slug}
            component={Comp}
            durationInFrames={template.durationInFrames}
            fps={template.fps}
            width={template.width}
            height={template.height}
            defaultProps={template.defaultProps}
          />
        );
      })}

      {/* Midnight theme variants (explicit theme prop) */}
      <Composition
        id="midnight-bar-chart"
        component={() => <ThemeWrapper theme={midnightTheme}><BarChart data={barData} theme={midnightTheme} /></ThemeWrapper>}
        durationInFrames={180}
        fps={60}
        width={720}
        height={1280}
      />
      <Composition
        id="midnight-line-chart"
        component={() => <ThemeWrapper theme={midnightTheme}><LineChart data={lineData} theme={midnightTheme} /></ThemeWrapper>}
        durationInFrames={180}
        fps={60}
        width={720}
        height={1280}
      />
      <Composition
        id="midnight-pie-chart"
        component={() => <ThemeWrapper theme={midnightTheme}><PieChart data={pieData} theme={midnightTheme} /></ThemeWrapper>}
        durationInFrames={180}
        fps={60}
        width={720}
        height={1280}
      />
      <Composition
        id="midnight-animated-list"
        component={() => <ThemeWrapper theme={midnightTheme}><AnimatedList data={listData} theme={midnightTheme} /></ThemeWrapper>}
        durationInFrames={150}
        fps={60}
        width={720}
        height={1280}
      />
      <Composition
        id="midnight-circular-progress"
        component={() => <ThemeWrapper theme={midnightTheme}><CircularProgress data={progressData} theme={midnightTheme} /></ThemeWrapper>}
        durationInFrames={150}
        fps={60}
        width={720}
        height={1280}
      />
      <Composition
        id="midnight-title-card"
        component={() => <TitleCard title="The National Debt Explained" subtitle="What You Need to Know" theme={midnightTheme} />}
        durationInFrames={150}
        fps={60}
        width={720}
        height={1280}
      />
      <Composition
        id="midnight-end-card"
        component={() => <EndCard theme={midnightTheme} />}
        durationInFrames={120}
        fps={60}
        width={720}
        height={1280}
      />

      {/* Sunset theme variants */}
      <Composition
        id="sunset-bar-chart"
        component={() => <ThemeWrapper theme={sunsetTheme}><BarChart data={barData} theme={sunsetTheme} /></ThemeWrapper>}
        durationInFrames={180}
        fps={60}
        width={720}
        height={1280}
      />
      <Composition
        id="sunset-title-card"
        component={() => <TitleCard title="The National Debt Explained" subtitle="What You Need to Know" theme={sunsetTheme} />}
        durationInFrames={150}
        fps={60}
        width={720}
        height={1280}
      />
      <Composition
        id="sunset-end-card"
        component={() => <EndCard theme={sunsetTheme} />}
        durationInFrames={120}
        fps={60}
        width={720}
        height={1280}
      />

      {/* Forest theme variants */}
      <Composition
        id="forest-bar-chart"
        component={() => <ThemeWrapper theme={forestTheme}><BarChart data={barData} theme={forestTheme} /></ThemeWrapper>}
        durationInFrames={180}
        fps={60}
        width={720}
        height={1280}
      />
      <Composition
        id="forest-title-card"
        component={() => <TitleCard title="The National Debt Explained" subtitle="What You Need to Know" theme={forestTheme} />}
        durationInFrames={150}
        fps={60}
        width={720}
        height={1280}
      />

      {/* Royal theme variants */}
      <Composition
        id="royal-bar-chart"
        component={() => <ThemeWrapper theme={royalTheme}><BarChart data={barData} theme={royalTheme} /></ThemeWrapper>}
        durationInFrames={180}
        fps={60}
        width={720}
        height={1280}
      />
      <Composition
        id="royal-title-card"
        component={() => <TitleCard title="The National Debt Explained" subtitle="What You Need to Know" theme={royalTheme} />}
        durationInFrames={150}
        fps={60}
        width={720}
        height={1280}
      />
    </>
  );
};
