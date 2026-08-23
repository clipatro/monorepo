import { z } from "zod";
import { KNOWN_CONTENT_TYPES } from "@automation/contracts";

export const researchSchema = z.object({
  topic: z.string().min(1),
  contentType: z.enum(KNOWN_CONTENT_TYPES as [string, ...string[]]),
  channelId: z.string().optional(),
  requiredIdeas: z.array(z.string()).optional(),
  forbiddenIdeas: z.array(z.string()).optional(),
  runId: z.string().optional(),
  stepId: z.string().optional(),
  // Grounding override (always Gemini, but model can be overridden)
  llmProvider: z.enum(["gemini", "deepseek"]).optional(),
  llmModel: z.string().optional(),
  // Structuring override (separate from grounding)
  structuringLlm: z.object({
    llmProvider: z.enum(["gemini", "deepseek"]).optional(),
    llmModel: z.string().optional(),
  }).optional(),
});
