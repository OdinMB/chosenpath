import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { IMAGE_SIZES } from "core/types/index.js";
import type { ImageSize } from "core/types/index.js";
import {
  JPEG_APP11,
  readJpegHeaderSegments,
} from "../../images/jpegSegments.js";
import type { PlannedCall } from "./runner.js";

/*
 * Vets and stores the images the eval generates: a junk check on the raw API
 * bytes, and a file name that hides the arm. Every flow, the template cover
 * included, stores the image as the API returned it, which is what users see.
 */

/** Below this maximum channel standard deviation an image is blank or near-uniform. */
const MIN_CHANNEL_STDEV = 3;

export function shortHash(text: string, length: number): string {
  return createHash("sha256").update(text).digest("hex").slice(0, length);
}

/** Returns why the image is unusable, or undefined when it is fine. */
export async function findJunkReason(
  buffer: Buffer,
  requestedSize: ImageSize
): Promise<string | undefined> {
  const metadata = await sharp(buffer).metadata();
  if (requestedSize !== IMAGE_SIZES.AUTO) {
    const [width, height] = requestedSize.split("x").map(Number);
    if (metadata.width !== width || metadata.height !== height) {
      return `size ${metadata.width}x${metadata.height}, expected ${requestedSize}`;
    }
  }
  const stats = await sharp(buffer).stats();
  const maxStdev = Math.max(...stats.channels.map((c) => c.stdev));
  if (maxStdev < MIN_CHANNEL_STDEV) {
    return `near-uniform image (max channel stdev ${maxStdev.toFixed(2)})`;
  }
  return undefined;
}

/**
 * Removes the JPEG's APP11 segments, where the API embeds C2PA content
 * credentials that name the generating model (e.g. "gpt-image-1.5"), so an
 * image viewer's metadata panel cannot unblind the rating. Lossless: the
 * image data is not re-encoded. Anything that is not a JPEG is returned as is.
 *
 * EVAL ONLY. Removing the machine-readable AI marks from images people see
 * breaks the AI Act's marking duty (Art. 50(2)) and the Code of Practice's
 * non-removal measure. Never call this outside src/evals/: the server's ESLint
 * config rejects any import of src/evals/ from other source files.
 */
export function stripContentCredentials(image: Buffer): Buffer {
  const segments = readJpegHeaderSegments(image);
  if (!segments?.some((segment) => segment.marker === JPEG_APP11)) {
    return image;
  }
  const kept: Buffer[] = [image.subarray(0, 2)];
  for (const segment of segments) {
    if (segment.marker !== JPEG_APP11) {
      kept.push(image.subarray(segment.start, segment.end));
    }
  }
  kept.push(image.subarray(segments[segments.length - 1].end));
  return Buffer.concat(kept);
}

/** Rewrites a stored file without its content credentials; a no-op when it has none. */
export function stripContentCredentialsInFile(filePath: string) {
  const original = fs.readFileSync(filePath);
  const stripped = stripContentCredentials(original);
  if (stripped !== original) {
    fs.writeFileSync(filePath, stripped);
  }
}

/** Relative path (from the output folder) of a generated image. */
export function outputFileFor(call: PlannedCall): string {
  const hash = shortHash(`${call.itemId}|${call.evalCase.id}|${call.arm.key}`, 6);
  return `images/${call.itemId}-${hash}.jpeg`;
}

export async function storeOutput(
  outDir: string,
  call: PlannedCall,
  buffer: Buffer
): Promise<{ outputFile?: string; junkReason?: string }> {
  const junkReason = await findJunkReason(buffer, call.arm.size);
  if (junkReason) {
    return { junkReason };
  }
  const outputFile = outputFileFor(call);
  const target = path.join(outDir, outputFile);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, stripContentCredentials(buffer));
  return { outputFile };
}
