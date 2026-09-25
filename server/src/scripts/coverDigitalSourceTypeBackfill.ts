import fs from "fs";
import path from "path";
import {
  addDigitalSourceTypeXmp,
  type DigitalSourceTypeSkipReason,
} from "../images/digitalSourceTypeXmp.js";

/*
 * One-off backfill: adds the IPTC digital source type to the template covers
 * stored before covers were kept as the image API returned them. Those were
 * resized and lost the vendor's C2PA credentials, which cannot be recovered;
 * this unsigned marker is the fallback. Covers that still carry credentials
 * are skipped. CLI: backfillCoverDigitalSourceType.ts.
 */

export type BackfillReport = {
  /** Covers marked (or, in a dry run, that would be marked). */
  marked: string[];
  skipped: Array<{ file: string; reason: DigitalSourceTypeSkipReason }>;
};

function coverFiles(templatesDir: string): string[] {
  return fs
    .readdirSync(templatesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(templatesDir, entry.name, "images", "cover.jpeg"))
    .filter((file) => fs.existsSync(file))
    .sort();
}

/** Writes through a temporary file, so a crash never leaves a half-written cover. */
function replaceFile(file: string, bytes: Buffer): void {
  const temporary = `${file}.backfill-tmp`;
  fs.writeFileSync(temporary, bytes);
  fs.renameSync(temporary, file);
}

export function backfillCoverDigitalSourceType(
  templatesDir: string,
  options: { write: boolean }
): BackfillReport {
  const report: BackfillReport = { marked: [], skipped: [] };
  for (const file of coverFiles(templatesDir)) {
    const result = addDigitalSourceTypeXmp(fs.readFileSync(file));
    if (result.status === "skipped") {
      report.skipped.push({ file, reason: result.reason });
      continue;
    }
    if (options.write) {
      replaceFile(file, result.image);
    }
    report.marked.push(file);
  }
  return report;
}
