/**
 * @automation/remotion-templates
 *
 * Themable Remotion component catalog with hot-reloadable Studio.
 *
 * Usage:
 *   import { BarChart, midnightTheme } from "@automation/remotion-templates";
 *   <BarChart data={data} theme={midnightTheme} />
 *
 *   // Or use the registry:
 *   import { getTemplate } from "@automation/remotion-templates/registry";
 *   const template = getTemplate("bar-chart");
 *
 *   // Or create a custom theme:
 *   import { createTheme } from "@automation/remotion-templates/themes";
 *   const myTheme = createTheme("midnight", { accents: { primary: "#ff6b00" } });
 */

// Components
export { BarChart, type BarChartData } from "./components/BarChart.tsx";
export { LineChart, type LineChartData } from "./components/LineChart.tsx";
export { PieChart, type PieChartData } from "./components/PieChart.tsx";
export { AnimatedList, type AnimatedListData } from "./components/AnimatedList.tsx";
export { CircularProgress, type CircularProgressData } from "./components/CircularProgress.tsx";
export { TitleCard } from "./components/TitleCard.tsx";
export { EndCard } from "./components/EndCard.tsx";

// Primitives
export { AnimatedNumber } from "./primitives/AnimatedNumber.tsx";
export { GradientText } from "./primitives/GradientText.tsx";
export { GlassCard } from "./primitives/GlassCard.tsx";
export { AnimatedBackground } from "./primitives/AnimatedBackground.tsx";
export { SectionTitle } from "./primitives/SectionTitle.tsx";

// Themes
export {
  type ThemeConfig,
  midnightTheme,
  sunsetTheme,
  forestTheme,
  royalTheme,
  themes,
  defaultTheme,
  getTheme,
  createTheme,
} from "./themes/index.ts";

// Registry
export {
  type TemplateEntry,
  type TemplateCategory,
  registry,
  getTemplate,
  listTemplates,
  listCategories,
} from "./registry/index.ts";
