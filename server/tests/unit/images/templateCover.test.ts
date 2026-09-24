import sharp from "sharp";
import { resizeTemplateCover } from "../../../src/images/templateCover.js";

async function pngOfSize(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 40, g: 90, b: 160 } },
  })
    .png()
    .toBuffer();
}

describe("resizeTemplateCover", () => {
  it("shrinks a 1024x1536 cover to a 512x768 progressive JPEG", async () => {
    const resized = await resizeTemplateCover(await pngOfSize(1024, 1536));
    const metadata = await sharp(resized).metadata();

    expect(metadata.format).toBe("jpeg");
    expect(metadata.width).toBe(512);
    expect(metadata.height).toBe(768);
    expect(metadata.isProgressive).toBe(true);
  });

  it("does not enlarge a cover that is already smaller than the target", async () => {
    const resized = await resizeTemplateCover(await pngOfSize(256, 384));
    const metadata = await sharp(resized).metadata();

    expect(metadata.width).toBe(256);
    expect(metadata.height).toBe(384);
  });

  it("returns the original buffer when the input is not an image", async () => {
    const notAnImage = Buffer.from("not an image");

    expect(await resizeTemplateCover(notAnImage)).toBe(notAnImage);
  });
});
