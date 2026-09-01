/**
 * Shared utilities for publish-service.
 */

import { randomUUID } from "node:crypto";

/** Generate a UUID v4. */
export function uuid(): string {
  return randomUUID();
}

/** List of supported social platforms with display metadata. */
export const SUPPORTED_PLATFORMS = [
  { value: "youtube", label: "YouTube", icon: "Youtube" },
  { value: "tiktok", label: "TikTok", icon: "Music" },
  { value: "instagram", label: "Instagram", icon: "Instagram" },
  { value: "facebook", label: "Facebook", icon: "Facebook" },
  { value: "twitter", label: "X (Twitter)", icon: "Twitter" },
  { value: "linkedin", label: "LinkedIn", icon: "Linkedin" },
  { value: "threads", label: "Threads", icon: "MessageCircle" },
  { value: "pinterest", label: "Pinterest", icon: "Image" },
  { value: "reddit", label: "Reddit", icon: "MessageSquare" },
  { value: "bluesky", label: "Bluesky", icon: "Cloud" },
  { value: "snapchat", label: "Snapchat", icon: "Ghost" },
  { value: "telegram", label: "Telegram", icon: "Send" },
  { value: "discord", label: "Discord", icon: "MessageCircle" },
  { value: "slack", label: "Slack", icon: "Hash" },
  { value: "googlebusiness", label: "Google Business", icon: "MapPin" },
] as const;
