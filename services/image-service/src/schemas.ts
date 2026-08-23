import { z } from "zod";

// === Zod schemas ===

const llmOverrideFields = {
  llmProvider: z.enum(["gemini", "deepseek"]).optional(),
  llmModel: z.string().optional(),
};

const imageOverrideFields = {
  imageProvider: z.string().nullish().transform(v => v ?? undefined),
  imageModelCharacter: z.string().nullish().transform(v => v ?? undefined),
  imageModelNonCharacter: z.string().nullish().transform(v => v ?? undefined),
};

const aspectRatioSchema = z.enum(["9:16", "16:9", "1:1", "4:5", "3:4", "21:9"]);

const scenePlanSchema = z.object({
  storyId: z.string().min(1),
  runId: z.string().optional(),
  stepId: z.string().optional(),
  scenePlanConfig: z.object({
    sceneType: z.string().optional(),
    imageRequirement: z.boolean().optional(),
    visualPlanFields: z.array(z.string()).optional(),
    clipPromptFields: z.array(z.string()).optional(),
    clipDurationSeconds: z.object({
      min: z.number(),
      max: z.number(),
    }).optional(),
  }).optional(),
  ...llmOverrideFields,
});

const compilePromptSchema = z.object({
  sceneId: z.string().min(1),
  aspectRatio: aspectRatioSchema.default("9:16"),
});

const generateSchema = z.object({
  sceneId: z.string().min(1),
  runId: z.string().optional(),
  stepId: z.string().optional(),
  aspectRatio: aspectRatioSchema.default("9:16"),
  temperature: z.number().min(0).max(2).default(0.85),
  /** Optional custom prompt override — bypasses the 10-part prompt compiler. */
  customPrompt: z.string().optional(),
  /** Path to the previous scene's generated image, passed as the last reference
   *  for visual continuity. The generate-batch endpoint passes this automatically. */
  prevSceneImagePath: z.string().optional(),
  ...imageOverrideFields,
});

const generateBatchSchema = z.object({
  storyId: z.string().min(1),
  runId: z.string().optional(),
  stepId: z.string().optional(),
  aspectRatio: aspectRatioSchema.default("9:16"),
  temperature: z.number().min(0).max(2).default(0.85),
  /** When true, return only a cost estimate without generating any images. */
  estimateOnly: z.boolean().default(false),
  ...imageOverrideFields,
});

const acceptSchema = z.object({
  assetId: z.string().min(1),
});

const rejectSchema = z.object({
  assetId: z.string().min(1),
  reason: z.string().optional(),
});

const flowPromptsSchema = z.object({
  storyId: z.string().min(1),
  aspectRatio: aspectRatioSchema.default("9:16"),
});

export {
  scenePlanSchema,
  compilePromptSchema,
  generateSchema,
  generateBatchSchema,
  acceptSchema,
  rejectSchema,
  flowPromptsSchema,
};
