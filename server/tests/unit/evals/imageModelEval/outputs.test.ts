import sharp from "sharp";
import { findJunkReason } from "../../../../src/evals/imageModelEval/outputs.js";

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
