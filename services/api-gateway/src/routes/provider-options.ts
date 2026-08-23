/**
 * Provider options endpoint — returns available LLM providers/models, TTS
 * providers/voices, image providers/models, and the list of LLM pipeline steps
 * that can be individually configured per channel.
 *
 * The frontend uses this to render the per-step LLM config UI in the channel
 * form, and to populate dynamic dropdowns for providers, models, and voices.
 */

import type { Hono } from "@automation/server";

export function registerProviderOptionsRoutes(app: Hono): void {
	app.get("/api/providers", (c) => {
		return c.json({
			llm: {
				providers: [
					{
						id: "gemini",
						label: "Google Gemini",
						models: [
							{ id: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
							{ id: "gemini-3.7-flash", label: "Gemini 3.7 Flash (grounding)" },
						],
					},
					{
						id: "deepseek",
						label: "DeepSeek",
						models: [{ id: "deepseek-v4-flash", label: "DeepSeek V4 Flash" }],
					},
				],
				/**
				 * Steps that can be individually configured per channel.
				 * `allowedProviders` constrains the dropdown — e.g. research_grounding
				 * only supports Gemini (DeepSeek has no web search).
				 */
				steps: [
					{
						key: "classification",
						label: "Classification",
						description:
							"Classifies the topic into fictional story, psychology concept, or true case.",
						allowedProviders: ["gemini", "deepseek"],
					},
					{
						key: "research_grounding",
						label: "Research Grounding",
						description:
							"Google Search grounding to find sources. Always Gemini (DeepSeek has no web search).",
						allowedProviders: ["gemini"],
					},
					{
						key: "research_structuring",
						label: "Research Structuring",
						description:
							"Structures grounding results into sources and claims.",
						allowedProviders: ["gemini", "deepseek"],
					},
					{
						key: "story_candidates",
						label: "Story Candidates",
						description:
							"Generates 3 story candidates from the topic and research.",
						allowedProviders: ["gemini", "deepseek"],
					},
					{
						key: "duplicate_adjudication",
						label: "Duplicate Adjudication",
						description:
							"LLM adjudication for borderline duplicate detection cases.",
						allowedProviders: ["gemini", "deepseek"],
					},
					{
						key: "scene_planning",
						label: "Scene Planning",
						description:
							"Plans 4-8 scenes with narration and visual requirements from the approved story.",
						allowedProviders: ["gemini", "deepseek"],
					},
					{
						key: "story_dna",
						label: "Story DNA Extraction",
						description:
							"Extracts narrative DNA (protagonist, conflict, resolution) from the selected candidate.",
						allowedProviders: ["gemini", "deepseek"],
					},
				],
			},
			tts: {
				providers: [
					{
						id: "kokoro",
						label: "Kokoro (local, free)",
						models: [
							{ id: "af_heart", label: "Heart (female, warm)" },
							{ id: "af_bella", label: "Bella (female, soft)" },
							{ id: "af_sky", label: "Sky (female, clear)" },
							{ id: "am_michael", label: "Michael (male, deep)" },
							{ id: "am_adam", label: "Adam (male, neutral)" },
							{ id: "am_giorgio", label: "Giorgio (male, rich)" },
						],
					},
					{
						id: "gemini",
						label: "Gemini TTS (paid)",
						models: [
							{ id: "Algenib", label: "Algenib (Male)" },
							{ id: "Enceladus", label: "Enceladus (Male)" },
							{ id: "Erinome", label: "Erinome (Female)" },
							{ id: "Gacrux", label: "Gacrux (Female)" },
						],
					},
					{
						id: "chatterbox",
						label: "Chatterbox (self-hosted)",
						models: [{ id: "default", label: "Default" }],
					},
				],
			},
			image: {
				providers: [
					{
						id: "fal",
						label: "fal.ai (FLUX.2)",
						models: [
							{
								id: "fal-ai/flux-2/klein/9b/edit",
								label: "FLUX.2 Klein 9B Edit",
							},
							{
								id: "fal-ai/flux-2/klein/4b/edit",
								label: "FLUX.2 Klein 4B Edit",
							},
						],
					},
					{
						id: "gemini",
						label: "Google Gemini (Flash Image)",
						models: [
							{
								id: "gemini-3.1-flash-image",
								label: "Gemini 3.1 Flash Image (character)",
							},
							{
								id: "gemini-3.1-flash-lite-image",
								label: "Gemini 3.1 Flash Lite Image (non-character)",
							},
						],
					},
				],
			},
		video: {
			providers: [
				{
					id: "fal",
					label: "fal.ai (LTX-Video)",
					models: [
						{
							id: "fal-ai/ltx-video",
							label: "LTX-Video (preview, $0.02/clip, 768x512)",
						},
						{
							id: "fal-ai/ltx-2.3/text-to-video/fast",
							label: "LTX 2.3 Fast (1080p, $0.04/s = $0.24/6s clip)",
						},
						{
							id: "fal-ai/ltx-2.3/text-to-video",
							label: "LTX 2.3 Pro (1080p, $0.06/s = $0.36/6s clip)",
						},
						{
							id: "fal-ai/ltx-video-13b-distilled",
							label: "LTX-Video 13B Distilled ($0.04/clip)",
						},
					],
				},
			],
		},
		});
	});
}
