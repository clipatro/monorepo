import { z } from "zod";

// === Zod schemas ===

const llmOverrideFields = {
  llmProvider: z.enum(["gemini", "deepseek"]).optional(),
  llmModel: z.string().optional(),
};

const classifySchema = z.object({
  topic: z.string().min(1),
  channelId: z.string().optional(),
  storyline: z.string().optional(),
  providedContentType: z.string().optional(),
  runId: z.string().optional(),
  stepId: z.string().optional(),
  ...llmOverrideFields,
});

const generateSchema = z.object({
  channel: z.string().min(1),
  topic: z.string().min(1),
  contentType: z.enum(["fictional_story", "psychology_concept_story", "true_case"]).optional(),
  targetDurationSeconds: z.number().int().min(15).max(300).optional(),
  emotionalDirection: z.string().optional(),
  requiredIdeas: z.array(z.string()).optional(),
  forbiddenIdeas: z.array(z.string()).optional(),
  noveltyContext: z.string().optional(),
  candidateCount: z.number().int().min(1).max(5).optional(),
  storyline: z.string().optional(),
  creativeDirection: z.string().optional(),
  research: z.object({
    sources: z.array(z.object({
      id: z.string(), title: z.string(), url: z.string().optional(), excerpt: z.string(),
    })).optional(),
    claims: z.array(z.object({
      id: z.string(), claim: z.string(), sourceIds: z.array(z.string()), confidence: z.string(),
    })).optional(),
    allowedFacts: z.array(z.string()).optional(),
    warnings: z.array(z.string()).optional(),
  }).optional(),
  runId: z.string().optional(),
  stepId: z.string().optional(),
  ...llmOverrideFields,
});

const duplicatesSchema = z.object({
  channelId: z.string().min(1),
  runId: z.string().min(1),
  candidates: z.array(z.object({
    title: z.string(),
    hook: z.string(),
    premise: z.string(),
    storyline: z.string(),
    contentType: z.string(),
    emotionalArc: z.string(),
    corePsychologicalIdea: z.string(),
    mainCharacterRole: z.string(),
    keyEvents: z.array(z.string()),
    twistOrResolution: z.string(),
    lessonOrTakeaway: z.string(),
    fingerprint: z.string(),
    sourceReferences: z.array(z.string()).optional(),
  })),
  stepId: z.string().optional(),
  skipAdjudication: z.boolean().optional(),
  ...llmOverrideFields,
});

const noveltySchema = z.object({
  channelId: z.string().min(1),
  topic: z.string().min(1),
  limit: z.number().int().min(1).max(20).optional(),
});

const versionSchema = z.object({
  runId: z.string().min(1),
  channelId: z.string().min(1),
  candidate: z.object({
    title: z.string(),
    hook: z.string(),
    premise: z.string(),
    storyline: z.string(),
    contentType: z.string(),
    emotionalArc: z.string(),
    corePsychologicalIdea: z.string(),
    mainCharacterRole: z.string(),
    keyEvents: z.array(z.string()),
    twistOrResolution: z.string(),
    lessonOrTakeaway: z.string(),
    fingerprint: z.string(),
    sourceReferences: z.array(z.string()).optional(),
    characters: z.array(z.object({
      name: z.string(),
      existingCharacterId: z.string().nullable().optional(),
      roleInStory: z.string(),
    })).optional(),
    newCharacters: z.array(z.object({
      name: z.string(),
      bible: z.record(z.any()),
      roleInStory: z.string(),
    })).optional(),
  }),
  research: z.object({
    sources: z.array(z.object({
      id: z.string(), title: z.string(), url: z.string().optional(), excerpt: z.string(),
    })).optional(),
    claims: z.array(z.object({
      id: z.string(), claim: z.string(), sourceIds: z.array(z.string()), confidence: z.string(),
    })).optional(),
  }).optional(),
  characterVersionId: z.string().optional(),
  ...llmOverrideFields,
});

export { classifySchema, generateSchema, duplicatesSchema, noveltySchema, versionSchema };
