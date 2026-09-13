/**
 * ZernioAdapter — implements the Publisher facade using the Zernio API.
 *
 * Zernio is a unified social media publishing API that wraps 16+ platforms
 * (YouTube, TikTok, Instagram, Facebook, etc.) behind a single REST endpoint.
 * It handles OAuth, token refresh, and per-platform formatting.
 *
 * API docs: https://docs.zernio.com
 * Base URL:  https://zernio.com/api/v1
 *
 * Swapping to another provider (Postiz, Buffer, direct APIs) requires only
 * implementing a new adapter against the Publisher interface — no route or
 * caller changes.
 */

import type { Publisher } from "@automation/contracts";
import type {
  PublishConnectRequest,
  PublishConnectResponse,
  PublishListAccountsRequest,
  PublishListAccountsResponse,
  PublishDisconnectRequest,
  PublishRequest,
  PublishResponse,
  PublishStatusRequest,
  PublishStatusResponse,
  PlatformAccount,
  PublishJobPlatformResult,
} from "@automation/contracts";
import { ProviderError } from "@automation/contracts";

const ZERNIO_BASE_URL = "https://zernio.com/api/v1";

/** Zernio API error response shape. */
interface ZernioError {
  error: string;
  code?: string;
  details?: Record<string, unknown>;
}

export class ZernioAdapter implements Publisher {
  constructor(private readonly apiKey: string) {
    if (!apiKey) {
      throw new Error("ZernioAdapter requires a ZERNIO_API_KEY");
    }
  }

  // === OAuth connection ===

  async getConnectUrl(
    request: PublishConnectRequest,
  ): Promise<PublishConnectResponse> {
    const params = new URLSearchParams({
      profileId: request.channelId,
    });
    if (request.redirectUrl) {
      params.set("redirect_url", request.redirectUrl);
    }

    const res = await fetch(
      `${ZERNIO_BASE_URL}/connect/${request.platform}?${params}`,
      {
        method: "GET",
        headers: this.authHeaders(),
      },
    );

    if (!res.ok) {
      const err = await this.parseError(res);
      throw new ProviderError(
        `Zernio connect URL failed: ${err.error}`,
        "zernio",
        "api",
        undefined,
        res.status >= 500,
      );
    }

    const data = (await res.json()) as { authUrl: string; state?: string };
    return {
      authUrl: data.authUrl,
      state: data.state ?? "",
    };
  }

  // === List connected accounts ===

  async listAccounts(
    request: PublishListAccountsRequest,
  ): Promise<PublishListAccountsResponse> {
    const res = await fetch(`${ZERNIO_BASE_URL}/accounts`, {
      method: "GET",
      headers: this.authHeaders(),
    });

    if (!res.ok) {
      const err = await this.parseError(res);
      throw new ProviderError(
        `Zernio list accounts failed: ${err.error}`,
        "zernio",
        "api",
        undefined,
        res.status >= 500,
      );
    }

    const data = (await res.json()) as {
      accounts: Array<{
        _id: string;
        platform: string;
        username?: string;
        displayName?: string;
        isActive?: boolean;
        profileId?: string;
      }>;
    };

    // Filter by channel (profileId) and optionally by platform
    const accounts: PlatformAccount[] = data.accounts
      .filter((a) => a.profileId === request.channelId)
      .filter((a) => !request.platform || a.platform === request.platform)
      .map((a) => ({
        id: a._id,
        channelId: request.channelId,
        platform: a.platform as PlatformAccount["platform"],
        providerAccountId: a._id,
        username: a.username ?? null,
        displayName: a.displayName ?? null,
        isActive: a.isActive !== false,
        metadata: null,
        connectedAt: new Date().toISOString(),
      }));

    return { accounts };
  }

  // === Disconnect an account ===

  async disconnectAccount(
    request: PublishDisconnectRequest,
  ): Promise<void> {
    const res = await fetch(
      `${ZERNIO_BASE_URL}/accounts/${request.providerAccountId}`,
      {
        method: "DELETE",
        headers: this.authHeaders(),
      },
    );

    if (!res.ok && res.status !== 404) {
      const err = await this.parseError(res);
      throw new ProviderError(
        `Zernio disconnect failed: ${err.error}`,
        "zernio",
        "api",
        undefined,
        res.status >= 500,
      );
    }
  }

  // === Publish: upload video + create post ===

  async publish(request: PublishRequest): Promise<PublishResponse> {
    const jobId = crypto.randomUUID();

    // Step 1: Get a presigned upload URL for the video
    const filename = this.extractFilename(request.videoFilePath);
    const presignRes = await fetch(`${ZERNIO_BASE_URL}/media/presign`, {
      method: "POST",
      headers: {
        ...this.authHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filename,
        contentType: request.videoMimeType,
      }),
    });

    if (!presignRes.ok) {
      const err = await this.parseError(presignRes);
      return {
        jobId,
        status: "failed",
        providerPostId: null,
        results: request.platforms.map((p) => ({
          platform: p.platform as PublishJobPlatformResult["platform"],
          accountId: p.accountId,
          status: "failed" as const,
          postUrl: null,
          postId: null,
          error: `Upload URL failed: ${err.error}`,
        })),
        error: `Failed to get upload URL: ${err.error}`,
      };
    }

    const presignData = (await presignRes.json()) as {
      uploadUrl: string;
      publicUrl: string;
      key: string;
      expiresIn: number;
    };

    // Step 2: Upload the video file directly to the presigned URL
    const videoFile = Bun.file(request.videoFilePath);
    const videoBuffer = await videoFile.arrayBuffer();

    const uploadRes = await fetch(presignData.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": request.videoMimeType },
      body: videoBuffer,
    });

    if (!uploadRes.ok) {
      const uploadErr = await uploadRes.text().catch(() => "Unknown error");
      return {
        jobId,
        status: "failed",
        providerPostId: null,
        results: request.platforms.map((p) => ({
          platform: p.platform as PublishJobPlatformResult["platform"],
          accountId: p.accountId,
          status: "failed" as const,
          postUrl: null,
          postId: null,
          error: `Video upload failed: ${uploadErr}`,
        })),
        error: `Video upload failed: ${uploadErr}`,
      };
    }

    // Step 3: Create the post targeting the selected platforms
    const postBody = this.buildPostBody(request, presignData.publicUrl);

    const postRes = await fetch(`${ZERNIO_BASE_URL}/posts`, {
      method: "POST",
      headers: {
        ...this.authHeaders(),
        "Content-Type": "application/json",
        "x-request-id": jobId,
      },
      body: JSON.stringify(postBody),
    });

    if (!postRes.ok) {
      const err = await this.parseError(postRes);
      const isDup = postRes.status === 409;
      return {
        jobId,
        status: "failed",
        providerPostId: null,
        results: request.platforms.map((p) => ({
          platform: p.platform as PublishJobPlatformResult["platform"],
          accountId: p.accountId,
          status: "failed" as const,
          postUrl: null,
          postId: null,
          error: isDup
            ? "Duplicate content — this exact content was posted within 24 hours"
            : err.error,
        })),
        error: err.error,
      };
    }

    const postData = (await postRes.json()) as {
      post: {
        _id: string;
        status: string;
        platforms: Array<{
          platform: string;
          accountId: { _id: string } | string;
          status: string;
          platformPostUrl?: string;
        }>;
      };
      message?: string;
    };

    // Map per-platform results
    const results: PublishJobPlatformResult[] = request.platforms.map((target) => {
      const platformResult = postData.post.platforms?.find(
        (p) =>
          p.platform === target.platform &&
          (typeof p.accountId === "string"
            ? p.accountId === target.accountId
            : p.accountId._id === target.accountId),
      );

      return {
        platform: target.platform as PublishJobPlatformResult["platform"],
        accountId: target.accountId,
        status: this.mapPlatformStatus(platformResult?.status),
        postUrl: platformResult?.platformPostUrl ?? null,
        postId: postData.post._id,
        error: null,
      };
    });

    const allPublished = results.every((r) => r.status === "published");
    const anyFailed = results.some((r) => r.status === "failed");

    return {
      jobId,
      status: allPublished
        ? "published"
        : anyFailed
          ? "failed"
          : "publishing",
      providerPostId: postData.post._id,
      results,
      error: anyFailed
        ? results.find((r) => r.status === "failed")?.error ?? null
        : null,
    };
  }

  // === Get post status ===

  async getPostStatus(
    request: PublishStatusRequest,
  ): Promise<PublishStatusResponse> {
    // The jobId is the Zernio post ID (we set x-request-id = jobId when creating)
    // But the actual post ID is stored in publish_jobs.provider_post_id
    // This method is called with the Zernio post ID as jobId
    const res = await fetch(`${ZERNIO_BASE_URL}/posts/${request.jobId}`, {
      method: "GET",
      headers: this.authHeaders(),
    });

    if (!res.ok) {
      const err = await this.parseError(res);
      return {
        jobId: request.jobId,
        status: "failed",
        providerPostId: null,
        results: [],
        error: err.error,
      };
    }

    const data = (await res.json()) as {
      post: {
        _id: string;
        status: string;
        platforms: Array<{
          platform: string;
          accountId: { _id: string } | string;
          status: string;
          platformPostUrl?: string;
        }>;
      };
    };

    const results: PublishJobPlatformResult[] = (data.post.platforms ?? []).map(
      (p) => ({
        platform: p.platform as PublishJobPlatformResult["platform"],
        accountId: typeof p.accountId === "string" ? p.accountId : p.accountId._id,
        status: this.mapPlatformStatus(p.status),
        postUrl: p.platformPostUrl ?? null,
        postId: data.post._id,
        error: null,
      }),
    );

    const allPublished = results.length > 0 && results.every((r) => r.status === "published");

    return {
      jobId: request.jobId,
      status: allPublished ? "published" : this.mapJobStatus(data.post.status),
      providerPostId: data.post._id,
      results,
      error: null,
    };
  }

  // === Private helpers ===

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey}` };
  }

  private async parseError(res: Response): Promise<ZernioError> {
    try {
      return (await res.json()) as ZernioError;
    } catch {
      return { error: `HTTP ${res.status} ${res.statusText}` };
    }
  }

  private extractFilename(path: string): string {
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 1] ?? "video.mp4";
  }

  private mapPlatformStatus(
    status: string | undefined,
  ): "pending" | "publishing" | "published" | "failed" {
    switch (status) {
      case "published":
      case "success":
        return "published";
      case "publishing":
      case "processing":
        return "publishing";
      case "failed":
      case "error":
        return "failed";
      default:
        return "pending";
    }
  }

  private mapJobStatus(
    status: string,
  ): "pending" | "uploading" | "publishing" | "published" | "failed" | "cancelled" {
    switch (status) {
      case "published":
      case "success":
        return "published";
      case "publishing":
      case "processing":
        return "publishing";
      case "failed":
      case "error":
        return "failed";
      case "cancelled":
        return "cancelled";
      case "uploading":
        return "uploading";
      default:
        return "pending";
    }
  }

  private buildPostBody(
    request: PublishRequest,
    videoUrl: string,
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      title: request.metadata.title,
      content: request.metadata.description || request.metadata.title,
      mediaItems: [
        {
          type: "video",
          url: videoUrl,
        },
      ],
      platforms: request.platforms.map((p) => {
        const platformEntry: Record<string, unknown> = {
          platform: p.platform,
          accountId: p.accountId,
        };

        // Apply per-platform overrides
        const override = request.metadata.platformOverrides?.[p.platform];
        if (override) {
          if (override.title) {
            platformEntry.platformSpecificData = {
              ...(platformEntry.platformSpecificData as Record<string, unknown> | undefined),
              title: override.title,
            };
          }
          if (override.tiktokSettings && p.platform === "tiktok") {
            platformEntry.platformSpecificData = {
              ...(platformEntry.platformSpecificData as Record<string, unknown> | undefined),
              ...override.tiktokSettings,
            };
          }
          if (override.youtubeSettings && p.platform === "youtube") {
            platformEntry.platformSpecificData = {
              ...(platformEntry.platformSpecificData as Record<string, unknown> | undefined),
              ...override.youtubeSettings,
            };
          }
        }

        return platformEntry;
      }),
    };

    if (request.metadata.tags.length > 0) {
      body.tags = request.metadata.tags;
    }

    if (request.metadata.hashtags.length > 0) {
      body.hashtags = request.metadata.hashtags;
    }

    if (request.metadata.scheduledFor) {
      body.scheduledFor = request.metadata.scheduledFor;
      body.publishNow = false;
    } else if (request.metadata.publishNow) {
      body.publishNow = true;
    } else {
      body.isDraft = true;
    }

    return body;
  }
}
