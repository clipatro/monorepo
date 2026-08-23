import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

// === Helpers ===

function uuid(): string {
  return crypto.randomUUID();
}

function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Read PNG/JPEG dimensions from a buffer (no external deps). */
function imageDimensions(buf: Buffer): { width: number; height: number } {
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) break;
      const marker = buf[i + 1] ?? 0;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      }
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
      } else {
        const len = buf.readUInt16BE(i + 2);
        i += 2 + len;
      }
    }
  }
  return { width: 0, height: 0 };
}

/** Validate an image buffer: type, dimensions, aspect ratio, non-corrupt. */
function validateImage(
  buf: Buffer,
  mimeType: string,
  expectedAspect?: string,
): { valid: boolean; width: number; height: number; errors: string[] } {
  const errors: string[] = [];

  // Check MIME type
  const validMimes = ["image/png", "image/jpeg", "image/webp"];
  if (!validMimes.includes(mimeType)) {
    errors.push(`Unsupported MIME type: ${mimeType}`);
  }

  // Check non-empty
  if (buf.length === 0) {
    errors.push("Empty image buffer");
    return { valid: false, width: 0, height: 0, errors };
  }

  // Read dimensions
  const { width, height } = imageDimensions(buf);
  if (width === 0 || height === 0) {
    errors.push("Could not read image dimensions (corrupt or unsupported format)");
  }

  // Check aspect ratio (if specified)
  if (expectedAspect && width > 0 && height > 0) {
    const [ew, eh] = expectedAspect.split(":").map(Number);
    if (ew && eh) {
      const expected = ew / eh;
      const actual = width / height;
      const tolerance = 0.05; // 5% tolerance
      if (Math.abs(actual - expected) / expected > tolerance) {
        errors.push(`Aspect ratio ${width}:${height} (~${actual.toFixed(2)}) does not match expected ${expectedAspect} (~${expected.toFixed(2)})`);
      }
    }
  }

  return { valid: errors.length === 0, width, height, errors };
}

// === Asset storage ===

async function saveImageAsset(
  channelId: string,
  runId: string,
  sceneId: string,
  imageBuffer: Buffer,
  mimeType: string,
  artifactStorePath: string,
): Promise<{ filePath: string; fileName: string }> {
  const ext = mimeType.includes("jpeg") ? "jpg" : mimeType.includes("webp") ? "webp" : "png";
  const fileName = `${uuid()}.${ext}`;
  const dir = join(artifactStorePath, "channels", channelId, "runs", runId, "scenes", sceneId);
  const filePath = join(dir, fileName);

  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  await writeFile(filePath, imageBuffer);
  return { filePath, fileName };
}

// === Reference image optimization (ffmpeg) ===

/**
 * Downscale a reference image buffer to a square target size using ffmpeg.
 * Preserves aspect ratio (pads with black) and re-encodes as JPEG quality 2.
 * Returns the optimized buffer. Used to reduce fal.ai per-megapixel input cost.
 *
 * If ffmpeg is not available, returns the original buffer unchanged.
 */
async function optimizeReferenceImage(
  buffer: Buffer,
  targetSize: number = 512,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  // Check ffmpeg availability once (cached on the function)
  if (!(await isFfmpegAvailable())) {
    const dims = imageDimensions(buffer);
    return { buffer, width: dims.width, height: dims.height };
  }

  const filter = `scale=${targetSize}:${targetSize}:force_original_aspect_ratio=decrease,pad=${targetSize}:${targetSize}:(ow-iw)/2:(oh-ih)/2:black`;
  const args = [
    "-y",
    "-i", "pipe:0",
    "-vf", filter,
    "-q:v", "2",
    "-f", "image2",
    "-vcodec", "mjpeg",
    "pipe:1",
  ];

  const result = await runFfmpeg(buffer, args);
  if (!result.stdout || result.stdout.length === 0) {
    // ffmpeg failed silently — return original
    const dims = imageDimensions(buffer);
    return { buffer, width: dims.width, height: dims.height };
  }

  const dims = imageDimensions(result.stdout);
  return {
    buffer: result.stdout,
    width: dims.width || targetSize,
    height: dims.height || targetSize,
  };
}

let ffmpegAvailable: boolean | null = null;

async function isFfmpegAvailable(): Promise<boolean> {
  if (ffmpegAvailable !== null) return ffmpegAvailable;
  try {
    const result = await runFfmpeg(Buffer.alloc(0), ["-version"]);
    ffmpegAvailable = result.exitCode === 0;
  } catch {
    ffmpegAvailable = false;
  }
  return ffmpegAvailable;
}

function runFfmpeg(
  stdin: Buffer,
  args: string[],
): Promise<{ stdout: Buffer; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn("ffmpeg", args, { stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on("close", (code) => {
      resolve({
        stdout: Buffer.concat(chunks),
        stderr,
        exitCode: code ?? 0,
      });
    });

    proc.on("error", () => {
      resolve({ stdout: Buffer.alloc(0), stderr: "", exitCode: 1 });
    });

    if (stdin.length > 0) {
      proc.stdin.write(stdin);
    }
    proc.stdin.end();
  });
}

export { uuid, sha256, imageDimensions, validateImage, saveImageAsset, optimizeReferenceImage };
