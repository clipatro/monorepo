/**
 * R2Storage — stores files in Cloudflare R2 via the S3-compatible API.
 *
 * Uses @aws-sdk/client-s3 for object operations and
 * @aws-sdk/s3-request-presigner for generating presigned URLs.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl as awsGetSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageAdapter } from "./types.ts";

export interface R2StorageConfig {
  bucket: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Optional public URL prefix (e.g. https://pub-xxx.r2.dev). */
  publicUrl?: string;
}

export class R2Storage implements StorageAdapter {
  readonly backend = "r2" as const;
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string | null;

  constructor(config: R2StorageConfig) {
    this.bucket = config.bucket;
    this.publicUrl = config.publicUrl ?? null;
    this.client = new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async put(
    key: string,
    data: Buffer | ArrayBuffer | Uint8Array,
    contentType?: string,
  ): Promise<void> {
    const body = data instanceof Buffer ? data : Buffer.from(data as Uint8Array);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!response.Body) {
      throw new Error(`R2 object not found: ${key}`);
    }
    // The AWS SDK returns different stream types depending on the runtime.
    // In Bun, response.Body is a Node.js Readable stream, not a web ReadableStream.
    const body = response.Body as any;
    // Try web ReadableStream first (browser/worker-like environments)
    if (typeof body.getReader === "function") {
      const reader = body.getReader();
      const chunks: Uint8Array[] = [];
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      return Buffer.concat(chunks);
    }
    // Node.js Readable stream (Bun runtime)
    if (typeof body.toArray === "function") {
      // Bun's ReadableStream has a toArray() method
      const chunks = await body.toArray();
      return Buffer.concat(chunks);
    }
    // Fallback: use Node.js stream events
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async getStream(key: string): Promise<ReadableStream<Uint8Array>> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!response.Body) {
      throw new Error(`R2 object not found: ${key}`);
    }
    // AWS SDK returns a ReadableStream in Bun environment
    return response.Body as ReadableStream<Uint8Array>;
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch {
      // No-op if object doesn't exist
    }
  }

  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return awsGetSignedUrl(this.client, command, { expiresIn });
  }

  getPublicUrl(key: string): string | null {
    if (!this.publicUrl) return null;
    return `${this.publicUrl}/${key}`;
  }

  getLocalPath(_key: string): string | null {
    return null;
  }

  async list(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;
    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      if (response.Contents) {
        for (const obj of response.Contents) {
          if (obj.Key) {
            // Strip the prefix from the key
            keys.push(obj.Key.slice(prefix.length));
          }
        }
      }
      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);
    return keys;
  }
}
