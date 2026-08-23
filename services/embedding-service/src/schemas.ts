import { z } from "zod";

export const embedSchema = z.object({
  texts: z.array(z.string().min(1)).min(1).max(100),
  metadata: z.array(z.string()).optional(),
});

export const similaritySchema = z.object({
  textA: z.string().min(1),
  textB: z.string().min(1),
});
