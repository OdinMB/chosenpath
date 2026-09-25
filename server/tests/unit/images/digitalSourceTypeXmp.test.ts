import sharp from "sharp";
import { addDigitalSourceTypeXmp } from "../../../src/images/digitalSourceTypeXmp.js";
import {
  JPEG_APP1,
  readJpegHeaderSegments,
} from "../../../src/images/jpegSegments.js";
import { TRAINED_ALGORITHMIC_MEDIA } from "core/types/index.js";

async function plainJpeg(): Promise<Buffer> {
  const pixels = Buffer.alloc(64 * 96 * 3);
  for (let i = 0; i < pixels.length; i++) {
    pixels[i] = (i * 31) % 256;
  }
  return sharp(pixels, { raw: { width: 64, height: 96, channels: 3 } })
    .jpeg()
    .toBuffer();
}

/** A JPEG header segment with the given marker and payload. */
function segment(marker: number, payload: string): Buffer {
  const body = Buffer.from(payload, "latin1");
  const header = Buffer.from([0xff, marker, 0, 0]);
  header.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([header, body]);
}

function withSegmentAfterSoi(jpeg: Buffer, extra: Buffer): Buffer {
  return Buffer.concat([jpeg.subarray(0, 2), extra, jpeg.subarray(2)]);
}

describe("addDigitalSourceTypeXmp", () => {
  it("writes the IPTC digital source type as XMP that image readers find", async () => {
    const result = addDigitalSourceTypeXmp(await plainJpeg());

    expect(result.status).toBe("marked");
    if (result.status !== "marked") return;
    const metadata = await sharp(result.image).metadata();
    const xmp = metadata.xmp?.toString("utf8") ?? "";
    expect(xmp).toContain("DigitalSourceType");
    expect(xmp).toContain(TRAINED_ALGORITHMIC_MEDIA);
  });

  it("leaves the image data untouched", async () => {
    const original = await plainJpeg();

    const result = addDigitalSourceTypeXmp(original);

    if (result.status !== "marked") throw new Error("expected a marked image");
    const before = await sharp(original).raw().toBuffer();
    const after = await sharp(result.image).raw().toBuffer();
    expect(after.equals(before)).toBe(true);
    // Only one segment was added: cutting it out gives back the original bytes
    const added = (readJpegHeaderSegments(result.image) ?? []).filter(
      (s) => s.marker === JPEG_APP1
    );
    expect(added).toHaveLength(1);
    const [{ start, end }] = added;
    expect(
      Buffer.concat([
        result.image.subarray(0, start),
        result.image.subarray(end),
      ]).equals(original)
    ).toBe(true);
  });

  it("does not mark an image twice", async () => {
    const once = addDigitalSourceTypeXmp(await plainJpeg());
    if (once.status !== "marked") throw new Error("expected a marked image");

    expect(addDigitalSourceTypeXmp(once.image)).toEqual({
      status: "skipped",
      reason: "already-marked",
    });
  });

  it("never touches an image that still carries content credentials, whose signature covers its bytes", async () => {
    const signed = withSegmentAfterSoi(
      await plainJpeg(),
      segment(0xeb, "JP\u0000\u0000jumbc2pa manifest")
    );

    expect(addDigitalSourceTypeXmp(signed)).toEqual({
      status: "skipped",
      reason: "has-content-credentials",
    });
  });

  it("skips an image that already has other XMP rather than add a second packet", async () => {
    const withXmp = withSegmentAfterSoi(
      await plainJpeg(),
      segment(0xe1, "http://ns.adobe.com/xap/1.0/\u0000<x:xmpmeta/>")
    );

    expect(addDigitalSourceTypeXmp(withXmp)).toEqual({
      status: "skipped",
      reason: "has-other-xmp",
    });
  });

  it("skips anything that is not a JPEG", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    expect(addDigitalSourceTypeXmp(png)).toEqual({
      status: "skipped",
      reason: "not-jpeg",
    });
  });
});
