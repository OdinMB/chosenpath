import sharp from "sharp";
import {
  findJunkReason,
  stripContentCredentials,
} from "../../../../src/evals/imageModelEval/outputs.js";

const SIZE = 1024;

async function uniformImage(): Promise<Buffer> {
  return sharp({
    create: { width: SIZE, height: SIZE, channels: 3, background: { r: 120, g: 120, b: 120 } },
  })
    .jpeg()
    .toBuffer();
}

async function variedImage(): Promise<Buffer> {
  const pixels = Buffer.alloc(SIZE * SIZE * 3);
  for (let i = 0; i < pixels.length; i++) {
    pixels[i] = (i * 97) % 256;
  }
  return sharp(pixels, { raw: { width: SIZE, height: SIZE, channels: 3 } })
    .jpeg()
    .toBuffer();
}

describe("findJunkReason", () => {
  it("accepts a varied image of the requested size", async () => {
    expect(await findJunkReason(await variedImage(), "1024x1024")).toBeUndefined();
  });

  it("flags a blank or near-uniform image", async () => {
    expect(await findJunkReason(await uniformImage(), "1024x1024")).toMatch(/near-uniform/);
  });

  it("flags an image whose size differs from the request", async () => {
    expect(await findJunkReason(await variedImage(), "1536x1024")).toMatch(/expected 1536x1024/);
  });

  it("skips the size check for size auto", async () => {
    expect(await findJunkReason(await variedImage(), "auto")).toBeUndefined();
  });
});

/** An APP11 segment (where C2PA content credentials live) carrying the given text. */
function app11(text: string): Buffer {
  const payload = Buffer.from(`JP${text}`, "latin1");
  const header = Buffer.from([0xff, 0xeb, 0, 0]);
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([header, payload]);
}

/** Inserts segments right after the JPEG's SOI marker. */
function withSegments(jpeg: Buffer, ...segments: Buffer[]): Buffer {
  return Buffer.concat([jpeg.subarray(0, 2), ...segments, jpeg.subarray(2)]);
}

describe("stripContentCredentials", () => {
  it("removes APP11 segments that name the generating model, without re-encoding", async () => {
    const original = await variedImage();
    const tagged = withSegments(original, app11("gpt-image-1.5 c2pa"), app11("more"));

    const stripped = stripContentCredentials(tagged);

    expect(stripped.equals(original)).toBe(true);
    expect(stripped.toString("latin1")).not.toContain("gpt-image");
    const metadata = await sharp(stripped).metadata();
    expect([metadata.width, metadata.height]).toEqual([SIZE, SIZE]);
  });

  it("returns the input unchanged when there is nothing to strip or it is not a JPEG", async () => {
    const plain = await variedImage();
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    expect(stripContentCredentials(plain).equals(plain)).toBe(true);
    expect(stripContentCredentials(png).equals(png)).toBe(true);
  });
});
