import fs from "fs";
import path from "path";
import type { RatingSetPlan } from "./itemScheduler.js";
import type { ProbeReport } from "./probe.js";
import {
  buildRatingFiles,
  referenceFileFor,
  validateRatingSets,
  BEAT_SET_ID,
  COVER_SET_ID,
  type RatingSets,
} from "./ratingFiles.js";
import { stripContentCredentialsInFile } from "./outputs.js";
import { computeArmMetrics, renderResults } from "./resultsReport.js";
import type { CallRecord } from "./runner.js";

/*
 * Writes the owner's files into the eval folder: reference copies, rating
 * sets, rating key and results.md. Fails loudly if the rating file is not
 * valid or not blind.
 */

function copyReferences(outDir: string, plans: RatingSetPlan[], ratingSets: RatingSets) {
  const ratedIds = new Set(ratingSets.sets.flatMap((s) => s.items.map((i) => i.id)));
  for (const item of plans.flatMap((p) => p.items)) {
    if (!ratedIds.has(item.itemId)) {
      continue;
    }
    for (const ref of item.evalCase.references) {
      const target = path.join(outDir, referenceFileFor(ref));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(ref.path, target);
      stripContentCredentialsInFile(target);
    }
  }
}

/**
 * Images stored before storeOutput stripped content credentials are cleaned here.
 * Every rated image also gets the same modification time: baselines are generated
 * first, so sorting a folder by date would otherwise point at today's setting.
 */
function stripRatedImages(outDir: string, ratingSets: RatingSets, stampedAt: Date) {
  for (const option of ratingSets.sets.flatMap((s) => s.items.flatMap((i) => i.options))) {
    const file = path.join(outDir, option.src);
    stripContentCredentialsInFile(file);
    fs.utimesSync(file, stampedAt, stampedAt);
  }
}

function writeJson(filePath: string, value: unknown) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function writeDeliverable(input: {
  outDir: string;
  plans: RatingSetPlan[];
  records: CallRecord[];
  partial: boolean;
  runSpendUsd: number;
  probe?: ProbeReport;
  now: Date;
}): RatingSets {
  const { outDir, plans, records } = input;
  const outputExists = (file: string) => fs.existsSync(path.join(outDir, file));
  const { ratingSets, ratingKey } = buildRatingFiles(plans, records, outputExists);

  copyReferences(outDir, plans, ratingSets);
  stripRatedImages(outDir, ratingSets, input.now);

  const itemCount = (setId: string) =>
    ratingSets.sets.find((s) => s.id === setId)?.items.length ?? 0;
  fs.writeFileSync(
    path.join(outDir, "results.md"),
    renderResults({
      generatedAt: input.now.toISOString(),
      metrics: computeArmMetrics(records),
      probe: input.probe,
      runSpendUsd: input.runSpendUsd,
      partial: input.partial,
      ratedItems: {
        beats: itemCount(BEAT_SET_ID),
        coversPortraits: itemCount(COVER_SET_ID),
      },
    })
  );

  // Only a valid, blind file is written; results.md above stays for diagnosis
  const problems = validateRatingSets(ratingSets, outDir);
  if (problems.length > 0) {
    throw new Error(
      `rating-sets.json was not written, it is not usable for a blind rating:\n- ${problems.join("\n- ")}`
    );
  }
  writeJson(path.join(outDir, "rating-sets.json"), ratingSets);
  writeJson(path.join(outDir, "rating-key.json"), ratingKey);
  return ratingSets;
}
