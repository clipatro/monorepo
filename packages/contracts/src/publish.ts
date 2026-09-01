/**
 * Publishing facade types — Phase 10 (D023).
 *
 * The facade is provider-agnostic. Adapters (Zernio, Postiz, Buffer,
 * direct official APIs) implement the Publisher interface against this
 * contract. Swapping a provider = implementing one adapter. No caller
 * changes.
 */

// === Supported social platforms ===

export type SocialPlatform =
  | "youtube"
  | "tiktok"
  | "instagram"
  | "facebook"
  | "twitter"
  | "linkedin"
  | "threads"
  | "pinterest"
  | "reddit"
  | "bluesky"
  | "snapchat"
  | "telegram"
  | "discord"
  | "slack"
  | "whatsapp"
  | "googlebusiness";

// === Platform account (a connected social media account) ===

export interface PlatformAccount {
  id: string;
  channelId: string;
  platform: SocialPlatform;
  /** Provider-specific account identifier (e.g. Zernio accountId). */
  providerAccountId: string;
  username: string | null;
  displayName: string | null;
  isActive: boolean;
  /** Provider-specific metadata (profile picture URL, follower count, etc.). */
  metadata: Record<string, unknown> | null;
  connectedAt: string;
}

// === Publish job ===

export type PublishJobStatus =
  | "pending"
  | "uploading"
  | "publishing"
  | "published"
  | "failed"
  | "cancelled";

export interface PublishJobPlatformResult {
  platform: SocialPlatform;
  accountId: string;
  status: "pending" | "publishing" | "published" | "failed";
  /** Public URL of the published post, when available. */
  postUrl: string | null;
  /** Provider-specific post identifier. */
  postId: string | null;
  error: string | null;
}

export interface PublishJob {
  id: string;
  channelId: string;
  /** The video asset being published. */
  videoAssetId: string | null;
  /** The workflow run that produced the video. */
  runId: string | null;
  status: PublishJobStatus;
  /** Which platforms + accounts were targeted. */
  platforms: Array<{
    platform: SocialPlatform;
    accountId: string;
  }>;
  /** Per-platform metadata (title, description, tags, etc.). */
  metadata: PublishMetadata;
  /** Provider-specific post ID (e.g. Zernio post _id). */
  providerPostId: string | null;
  /** Per-platform results after publishing. */
  results: PublishJobPlatformResult[];
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

// === Publish metadata ===

export interface PublishMetadata {
  /** Default title for the video (platform-specific titles can override). */
  title: string;
  /** Default caption/description. */
  description: string;
  /** Tags/keywords (YouTube). */
  tags: string[];
  /** Hashtags (stored for reference, included in caption text). */
  hashtags: string[];
  /** Per-platform overrides. */
  platformOverrides?: Partial<Record<SocialPlatform, PlatformMetadataOverride>>;
  /** Schedule for later (ISO 8601), or null for immediate publish. */
  scheduledFor: string | null;
  /** Whether to publish immediately (true) or save as draft (false). */
  publishNow: boolean;
}

export interface PlatformMetadataOverride {
  title?: string;
  description?: string;
  tags?: string[];
  /** TikTok-specific settings. */
  tiktokSettings?: {
    privacyLevel?: "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "SELF_ONLY";
    duet?: boolean;
    stitch?: boolean;
    comment?: boolean;
    autoAddMusic?: boolean;
    brandContentToggle?: boolean;
    brandOrganicToggle?: boolean;
    contentPostingMethod?: "DIRECT_POST" | "MEDIA_UPLOAD";
  };
  /** YouTube-specific settings. */
  youtubeSettings?: {
    selfDeclaredMadeForKids?: boolean;
    thumbnailUrl?: string;
  };
}

// === Publisher facade ===

export interface Publisher {
  /** Get the OAuth authorization URL for connecting a platform account. */
  getConnectUrl(
    request: PublishConnectRequest,
  ): Promise<PublishConnectResponse>;

  /** List connected accounts for a channel. */
  listAccounts(
    request: PublishListAccountsRequest,
  ): Promise<PublishListAccountsResponse>;

  /** Disconnect a platform account. */
  disconnectAccount(
    request: PublishDisconnectRequest,
  ): Promise<void>;

  /** Upload a video file and publish to one or more platforms. */
  publish(
    request: PublishRequest,
  ): Promise<PublishResponse>;

  /** Get the status of a publish job. */
  getPostStatus(
    request: PublishStatusRequest,
  ): Promise<PublishStatusResponse>;
}

// === Request / response types ===

export interface PublishConnectRequest {
  channelId: string;
  platform: SocialPlatform;
  /** The redirect URL after OAuth completes. */
  redirectUrl: string;
}

export interface PublishConnectResponse {
  authUrl: string;
  state: string;
}

export interface PublishListAccountsRequest {
  channelId: string;
  /** Filter by platform, or null for all. */
  platform?: SocialPlatform | null;
}

export interface PublishListAccountsResponse {
  accounts: PlatformAccount[];
}

export interface PublishDisconnectRequest {
  channelId: string;
  platform: SocialPlatform;
  providerAccountId: string;
}

export interface PublishRequest {
  channelId: string;
  /** Local file path of the video to publish. */
  videoFilePath: string;
  /** MIME type of the video (e.g. "video/mp4"). */
  videoMimeType: string;
  /** The video asset ID from the assets table, if applicable. */
  videoAssetId: string | null;
  /** The workflow run ID, if applicable. */
  runId: string | null;
  /** Target platforms and accounts. */
  platforms: Array<{
    platform: SocialPlatform;
    accountId: string;
  }>;
  /** Publishing metadata. */
  metadata: PublishMetadata;
}

export interface PublishResponse {
  jobId: string;
  status: PublishJobStatus;
  /** Provider-specific post ID. */
  providerPostId: string | null;
  /** Per-platform results. */
  results: PublishJobPlatformResult[];
  /** Error message if the job failed. */
  error: string | null;
}

export interface PublishStatusRequest {
  channelId: string;
  jobId: string;
}

export interface PublishStatusResponse {
  jobId: string;
  status: PublishJobStatus;
  providerPostId: string | null;
  results: PublishJobPlatformResult[];
  error: string | null;
}

// === Provider capability registry ===

export interface PublishCapabilityRegistry {
  publisher?: Publisher;
}
