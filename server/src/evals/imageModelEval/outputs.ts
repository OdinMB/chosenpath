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
  fs.writeFileSync(target, shown);
  return { outputFile };
}
