// === Zod schemas for validation ===

import { z } from "zod";
import { DEFAULT_CONTENT_TYPES } from "@automation/contracts";

export const createChannelSchema = z.object({
  name: z.string().min(1).max(200),
  niche: z.string().min(1).max(500),
  slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
  locale: z.string().default("en-US"),
  contentTypes: z.array(z.string()).default(DEFAULT_CONTENT_TYPES),
  targetDurationSeconds: z.number().int().min(15).max(120).default(45),
  sceneMin: z.number().int().min(1).max(20).default(4),
  sceneMax: z.number().int().min(1).max(20).default(8),
  storyStyle: z.string().default(""),
  visualStyle: z.string().default(""),
  imageProvider: z.string().default("gemini-flash-image"),
  ttsProvider: z.string().default("kokoro"),
  ttsVoiceId: z.string().default("af_heart"),
  aspectRatio: z.enum(["9:16", "16:9", "1:1", "4:5", "3:4", "21:9"]).default("9:16"),
  approvalEnabled: z.boolean().default(true),
  llmConfig: z.record(z.object({
    provider: z.enum(["gemini", "deepseek"]).nullable(),
    model: z.string().nullable(),
  })).nullable().default(null),
  imageModelCharacter: z.string().nullable().default(null),
  imageModelNonCharacter: z.string().nullable().default(null),
  researchEnabled: z.boolean().default(true),
  duplicateAdjudicationEnabled: z.boolean().default(true),
  videoGenerationEnabled: z.boolean().default(false),
  videoTemplate: z.string().default("gameplay-with-image-scenes"),
});

export const updateChannelSchema = createChannelSchema.partial();

export const createCharacterSchema = z.object({
  name: z.string().min(1).max(200),
  role: z.string().min(1).max(200),
});

export const updateCharacterSchema = createCharacterSchema.partial();

export const createCharacterVersionSchema = z.object({
  bible: z.record(z.any()),
});
