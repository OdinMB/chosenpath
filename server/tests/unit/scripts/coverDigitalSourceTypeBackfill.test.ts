import fs from "fs";
import os from "os";
import path from "path";
import sharp from "sharp";
import { backfillCoverDigitalSourceType } from "../../../src/scripts/coverDigitalSourceTypeBackfill.js";
import { TRAINED_ALGORITHMIC_MEDIA } from "core/types/index.js";

let templatesDir: string;

async function jpeg(): Promise<Buffer> {
  return sharp({
    create: { width: 32, height: 48, channels: 3, background: { r: 10, g: 80, b: 200 } },
  })
    .jpeg()
    .toBuffer();
}

/** A JPEG carrying an APP11 segment, as covers with C2PA credentials do. */
async function signedJpeg(): Promise<Buffer> {
  const plain = await jpeg();
  const payload = Buffer.from("JP\u0000\u0000jumbc2pa", "latin1");
  const header = Buffer.from([0xff, 0xeb, 0, 0]);
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([plain.subarray(0, 2), header, payload, plain.subarray(2)]);
}

function writeCover(templateId: string, bytes: Buffer): string {
  const imagesDir = path.join(templatesDir, templateId, "images");
  fs.mkdirSync(imagesDir, { recursive: true });
  const file = path.join(imagesDir, "cover.jpeg");
  fs.writeFileSync(file, bytes);
  return file;
}

beforeEach(() => {
  templatesDir = fs.mkdtempSync(path.join(os.tmpdir(), "cover-backfill-"));
});

afterEach(() => {
  fs.rmSync(templatesDir, { recursive: true, force: true });
});

describe("backfillCoverDigitalSourceType", () => {
  it("reports what it would mark and changes nothing in a dry run", async () => {
    const original = await jpeg();
    const cover = writeCover("stripped-template", original);

    const report = backfillCoverDigitalSourceType(templatesDir, { write: false });

    expect(report.marked).toEqual([cover]);
    expect(fs.readFileSync(cover).equals(original)).toBe(true);
  });

  it("marks stripped covers and leaves signed covers and templates without a cover alone", async () => {
    const stripped = writeCover("stripped-template", await jpeg());
    const signedBytes = await signedJpeg();
    const signed = writeCover("signed-template", signedBytes);
    fs.mkdirSync(path.join(templatesDir, "no-cover-template", "images"), {
      recursive: true,
    });

    const report = backfillCoverDigitalSourceType(templatesDir, { write: true });

    expect(report.marked).toEqual([stripped]);
    expect(report.skipped).toEqual([
      { file: signed, reason: "has-content-credentials" },
    ]);
    const xmp = (await sharp(fs.readFileSync(stripped)).metadata()).xmp;
    expect(xmp?.toString("utf8")).toContain(TRAINED_ALGORITHMIC_MEDIA);
    expect(fs.readFileSync(signed).equals(signedBytes)).toBe(true);
  });

  it("is safe to run twice", async () => {
    const cover = writeCover("stripped-template", await jpeg());
    backfillCoverDigitalSourceType(templatesDir, { write: true });
    const afterFirstRun = fs.readFileSync(cover);

    const report = backfillCoverDigitalSourceType(templatesDir, { write: true });

    expect(report.marked).toEqual([]);
    expect(report.skipped).toEqual([{ file: cover, reason: "already-marked" }]);
    expect(fs.readFileSync(cover).equals(afterFirstRun)).toBe(true);
  });
});
