/**
 * Zod validation schemas for publish-service routes.
 */

import { z } from "zod";

// === Platform connection ===

const connectSchema = z.object({
  channelId: z.string().min(1),
  platform: z.string().min(1),
  redirectUrl: z.string().url().optional(),
});

const callbackSchema = z.object({
  channelId: z.string().min(1),
  platform: z.string().min(1),
  /** The Zernio account ID returned after OAuth. */
  accountId: z.string().min(1),
  username: z.string().optional(),
  displayName: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// === Publishing ===

const platformTargetSchema = z.object({
  platform: z.string().min(1),
  accountId: z.string().min(1),
});

const platformOverrideSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  tiktokSettings: z
    .object({
      privacyLevel: z
        .enum(["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"])
        .optional(),
      duet: z.boolean().optional(),
      stitch: z.boolean().optional(),
      comment: z.boolean().optional(),
      autoAddMusic: z.boolean().optional(),
      brandContentToggle: z.boolean().optional(),
      brandOrganicToggle: z.boolean().optional(),
      contentPostingMethod: z
        .enum(["DIRECT_POST", "MEDIA_UPLOAD"])
        .optional(),
    })
    .optional(),
  youtubeSettings: z
    .object({
      selfDeclaredMadeForKids: z.boolean().optional(),
      thumbnailUrl: z.string().optional(),
    })
    .optional(),
});

const publishSchema = z.object({
  channelId: z.string().min(1),
  videoAssetId: z.string().optional(),
  runId: z.string().optional(),
  platforms: z.array(platformTargetSchema).min(1),
  metadata: z.object({
    title: z.string().min(1),
    description: z.string().default(""),
    tags: z.array(z.string()).default([]),
    hashtags: z.array(z.string()).default([]),
    platformOverrides: z.record(platformOverrideSchema).optional(),
    scheduledFor: z.string().nullable().default(null),
    publishNow: z.boolean().default(true),
  }),
});

export {
  connectSchema,
  callbackSchema,
  publishSchema,
  platformTargetSchema,
  platformOverrideSchema,
};
