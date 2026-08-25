import type React from "react";
import type { ThemeConfig } from "../themes/index.ts";
import { BeforeAfter, ComparisonSplit, KeyFact, MythFact, StatisticSpotlight, type BeforeAfterData, type ComparisonSplitData, type KeyFactData, type MythFactData, type StatisticSpotlightData } from "./components/DocumentaryFacts.tsx";
import { DocumentReveal, EventCountdown, EvidenceCard, SourceCitation, Timeline, type DocumentRevealData, type EventCountdownData, type EvidenceCardData, type SourceCitationData, type TimelineData } from "./components/DocumentaryEvidence.tsx";
import { CauseEffect, LocationCard, MapRoute, PersonProfile, ProcessSteps, type CauseEffectData, type LocationCardData, type MapRouteData, type PersonProfileData, type ProcessStepsData } from "./components/DocumentaryContext.tsx";
import { ChapterCard, ConclusionCard, HookHeadline, QuestionCard, QuoteCard, type ChapterCardData, type ConclusionCardData, type HookHeadlineData, type QuestionCardData, type QuoteCardData } from "./components/DocumentaryNarrative.tsx";
import type { TemplateDefinition } from "../registry/index.ts";

const sampleImage = "https://images.unsplash.com/photo-1682687220742-aba13b6e50ba";
const hookHeadline: HookHeadlineData = { kicker: "Hidden history", headline: "The decision that", emphasis: "changed everything", context: "A forgotten meeting redrew the future in less than twenty minutes.", imageUrl: sampleImage, imageAlt: "Remote mountain landscape", imageTreatment: "documentary", icon: "archive" };
const chapterCard: ChapterCardData = { chapter: "The turning point", number: 2, title: "A system under pressure", summary: "By the summer of 1971, the warning signs could no longer be ignored." };
const questionCard: QuestionCardData = { topic: "The central question", question: "What happens when a temporary measure becomes permanent?", prompt: "Follow the evidence before reaching a verdict." };
const quoteCard: QuoteCardData = { quote: "The past is never dead. It is not even past.", speaker: "William Faulkner", role: "American novelist", year: "1951", imageUrl: sampleImage, imageAlt: "Archival mountain landscape", imageTreatment: "archive" };
const conclusionCard: ConclusionCardData = { conclusion: "The crisis did not begin overnight.", takeaway: "It emerged from a chain of reasonable decisions whose combined consequences were anything but reasonable.", closingQuestion: "Which choice would you have made?" };
const keyFact: KeyFactData = { fact: "The official report was delayed for 17 years.", detail: "By the time it became public, the policy it examined had already shaped a generation.", source: "National Archives" };
const statisticSpotlight: StatisticSpotlightData = { label: "Scale of displacement", value: 2.4, suffix: "M", decimals: 1, context: "people were forced to leave their homes in less than eighteen months.", source: "UN historical estimate" };
const mythFact: MythFactData = { myth: "The collapse happened without warning.", fact: "At least six independent reports documented the danger years earlier.", source: "Declassified records" };
const comparisonSplit: ComparisonSplitData = { title: "Two versions of the same event", left: { label: "Official record", value: "3 days", detail: "The timeline released to the public." }, right: { label: "Archive", value: "11 days", detail: "The sequence reconstructed from internal memos." }, verdict: "An eight-day gap" };
const beforeAfter: BeforeAfterData = { title: "A decade of transformation", before: { label: "Before · 1960", value: "18%", detail: "of households had access." }, after: { label: "After · 1970", value: "71%", detail: "of households were connected." }, change: "+53 percentage points" };
const evidenceCard: EvidenceCardData = { exhibit: "Exhibit 04", title: "The memo confirms prior knowledge", finding: "Senior officials received the risk assessment nine months before the public announcement.", confidence: "high", source: "Archive file 27-B", imageUrl: sampleImage, imageAlt: "Field evidence landscape", imageTreatment: "monochrome" };
const sourceCitation: SourceCitationData = { index: 3, publisher: "National Archives", title: "Minutes of the Emergency Committee", date: "12 March 1968", excerpt: "All regional offices were instructed to preserve the records pending review.", urlLabel: "catalogue.gov/archive/committee-minutes" };
const documentReveal: DocumentRevealData = { documentType: "Declassified memorandum", title: "Immediate action required", date: "17 June 1974", lines: ["Distribution is limited to the committee.", "The current projection exceeds the published estimate.", "Regional offices must prepare contingency plans.", "Public disclosure is not recommended at this time."], highlightIndex: 1, stamp: "Declassified" };
const timeline: TimelineData = { title: "How the crisis unfolded", events: [{ date: "1968", title: "First warning", detail: "Researchers identify the structural risk." }, { date: "1971", title: "Policy shift", detail: "Temporary controls are introduced." }, { date: "1974", title: "Breaking point", detail: "The system can no longer absorb demand." }, { date: "1976", title: "Public inquiry", detail: "The hidden record begins to emerge." }] };
const eventCountdown: EventCountdownData = { count: 13, unit: "days", event: "until the border closed", detail: "Thousands had no idea how little time remained." };
const personProfile: PersonProfileData = { name: "Dr. Maya Rahman", role: "Lead investigator", years: "1938–2009", description: "Her field notes became the most complete firsthand record of the disaster.", facts: ["Interviewed 214 witnesses", "Preserved 1,800 photographs", "Report sealed for 12 years"], imageUrl: sampleImage, imageAlt: "Field landscape associated with the investigator", imageTreatment: "documentary" };
const locationCard: LocationCardData = { place: "Port Radnor", region: "Northern coast", coordinates: "42.3601° N · 71.0589° W", significance: "A small harbor that became the center of an international rescue effort.", facts: [{ label: "Population", value: "18K", icon: "user" }, { label: "Founded", value: "1842", icon: "landmark" }, { label: "Evacuated", value: "72%", icon: "route" }], imageUrl: sampleImage, imageAlt: "Remote coastal landscape", imageTreatment: "archive" };
const mapRoute: MapRouteData = { title: "The evacuation route", origin: "Port Radnor", destination: "North Haven", distance: "286 km", note: "The final convoy crossed three checkpoints in a single night." };
const processSteps: ProcessStepsData = { title: "How the operation worked", steps: [{ title: "Intercept", detail: "Messages were copied at relay stations." }, { title: "Decode", detail: "Analysts reconstructed fragmented signals." }, { title: "Verify", detail: "Independent sources confirmed the details." }, { title: "Act", detail: "Field teams received sealed instructions." }] };
const causeEffect: CauseEffectData = { title: "The chain reaction", cause: { title: "A sudden export ban", detail: "Supply fell while demand remained unchanged." }, effect: { title: "Prices tripled in six weeks", detail: "The shock spread through food, transport, and housing." }, connector: "One decision, nationwide consequences" };

const entry = <T,>(slug: string, name: string, subtitle: string, category: TemplateDefinition["category"], component: React.FC<{ data: T; theme?: ThemeConfig; delay?: number }>, data: T, durationInFrames = 150): TemplateDefinition => ({ slug, name, subtitle, category, component, defaultProps: { data }, durationInFrames, fps: 60, width: 720, height: 1280 });

export const documentaryRegistry: TemplateDefinition[] = [
  entry("hook-headline", "Hook Headline", "High-impact opening hook with kinetic emphasis", "Narrative", HookHeadline, hookHeadline, 135),
  entry("chapter-card", "Chapter Card", "Numbered documentary chapter transition", "Narrative", ChapterCard, chapterCard, 135),
  entry("question-card", "Question Card", "Central question with bold visual punctuation", "Narrative", QuestionCard, questionCard, 135),
  entry("quote-card", "Quote Card", "Editorial quotation with speaker attribution", "Narrative", QuoteCard, quoteCard, 150),
  entry("conclusion-card", "Conclusion Card", "Closing argument and memorable takeaway", "Narrative", ConclusionCard, conclusionCard, 150),
  entry("key-fact", "Key Fact", "Urgent documentary fact reveal", "Facts & Data", KeyFact, keyFact, 135),
  entry("statistic-spotlight", "Statistic Spotlight", "Large animated number with context", "Facts & Data", StatisticSpotlight, statisticSpotlight, 150),
  entry("myth-fact", "Myth vs Fact", "Evidence-led misconception correction", "Facts & Data", MythFact, mythFact, 150),
  entry("comparison-split", "Comparison Split", "Side-by-side contrast optimized for mobile", "Facts & Data", ComparisonSplit, comparisonSplit, 150),
  entry("before-after", "Before & After", "Animated change-over-time comparison", "Facts & Data", BeforeAfter, beforeAfter, 150),
  entry("evidence-card", "Evidence Card", "Verified finding with confidence signal", "Evidence", EvidenceCard, evidenceCard, 150),
  entry("source-citation", "Source Citation", "Readable on-screen source attribution", "Evidence", SourceCitation, sourceCitation, 150),
  entry("document-reveal", "Document Reveal", "Tactile archival document presentation", "Evidence", DocumentReveal, documentReveal, 180),
  entry("timeline", "Documentary Timeline", "Four-beat vertical historical timeline", "Evidence", Timeline, timeline, 180),
  entry("event-countdown", "Event Countdown", "High-stakes countdown to a key event", "Evidence", EventCountdown, eventCountdown, 135),
  entry("person-profile", "Person Profile", "Key figure profile with compact biography", "People & Places", PersonProfile, personProfile, 165),
  entry("location-card", "Location Card", "Place context, coordinates, and quick facts", "People & Places", LocationCard, locationCard, 150),
  entry("map-route", "Map Route", "Stylized journey and evacuation route", "People & Places", MapRoute, mapRoute, 165),
  entry("process-steps", "Process Steps", "Four-stage explanatory sequence", "Explainers", ProcessSteps, processSteps, 165),
  entry("cause-effect", "Cause & Effect", "Clear causal chain for complex stories", "Explainers", CauseEffect, causeEffect, 150),
];
