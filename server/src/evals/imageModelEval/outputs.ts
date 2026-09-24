import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { IMAGE_SIZES } from "core/types/index.js";
import type { ImageSize } from "core/types/index.js";
import { resizeTemplateCover } from "../../images/templateCover.js";
import type { PlannedCall } from "./runner.js";

/*
 * Vets and stores the images the eval generates: a junk check on the raw API
 * bytes, the same cover resize users see, and a file name that hides the arm.
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

const JPEG_SOI = 0xd8;
const JPEG_SOS = 0xda;
const JPEG_APP11 = 0xeb;

/**
 * Removes the JPEG's APP11 segments, where the API embeds C2PA content
 * credentials that name the generating model (e.g. "gpt-image-1.5"), so an
 * image viewer's metadata panel cannot unblind the rating. Lossless: the
 * image data is not re-encoded. Anything that is not a JPEG is returned as is.
 */
export function stripContentCredentials(image: Buffer): Buffer {
  if (image.length < 4 || image[0] !== 0xff || image[1] !== JPEG_SOI) {
    return image;
  }
  const kept: Buffer[] = [image.subarray(0, 2)];
  let offset = 2;
  let removed = false;
  // Header segments run until the start of scan; each is FF <marker> <2-byte length>
  while (offset + 4 <= image.length && image[offset] === 0xff) {
    const marker = image[offset + 1];
    if (marker === JPEG_SOS) {
      break;
    }
    const end = offset + 2 + image.readUInt16BE(offset + 2);
    if (marker === JPEG_APP11) {
      removed = true;
    } else {
      kept.push(image.subarray(offset, end));
    }
    offset = end;
  }
  if (!removed) {
    return image;
  }
  kept.push(image.subarray(offset));
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
  // The template cover is shown at library size, as users see it
  const shown =
    call.evalCase.callSite === "template-cover"
      ? await resizeTemplateCover(buffer)
      : buffer;
  const outputFile = outputFileFor(call);
  const target = path.join(outDir, outputFile);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, stripContentCredentials(shown));
  return { outputFile };
}
