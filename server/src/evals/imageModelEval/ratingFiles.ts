import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { beatArmsForItem, coverPortraitArms } from "./arms.js";
import { findLeaks } from "./blinding.js";
import type { CallSite, EvalCase, EvalReference } from "./cases.js";
import type { RatingSetPlan } from "./itemScheduler.js";
import type { CallRecord } from "./runner.js";
import { latestFinalRecord } from "./runner.js";

/*
 * Owns the owner's blind rating sets: their definition, the item plan, and
 * the rating-sets.json / rating-key.json contents built from call records.
 */

const PROJECT = "chosenpath";
export const BEAT_SET_ID = "chosenpath-beat-illustrations";
export const COVER_SET_ID = "chosenpath-covers-portraits";
const LABELS = ["A", "B", "C", "D"];
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 4;
const MAX_ITEMS: Record<string, number> = { [BEAT_SET_ID]: 12, [COVER_SET_ID]: 5 };

const SET_TEXT: Record<string, { title: string; instructions: string }> = {
  [BEAT_SET_ID]: {
    title: "In-game beat illustrations",
    instructions:
      "Each picture should illustrate the scene above using the reference images shown. Judge whether characters look like their references, whether the style matches the references and style notes, how well it fits the scene, and whether any stray text or captions appear.",
  },
  [COVER_SET_ID]: {
    title: "Story covers and character portraits",
    instructions:
      "Each picture was generated from the description shown, as a story cover or character portrait. Judge fit to the description and style notes, overall appeal, and whether any stray text appears.",
  },
};

const COVER_KIND: Record<Exclude<CallSite, "beat">, string> = {
  "story-cover": "Cover for a custom story",
  "story-portrait": "Player character portrait for a custom story",
  "template-cover":
    "Cover for a pre-made world, shown in the story library at 512x768 (the pictures below are that size)",
  "template-portrait": "Player character portrait for a pre-made world",
};

export type RatingOption = { label: string; type: "image"; src: string };
export type RatingItem = { id: string; context_md: string; options: RatingOption[] };
export type RatingSet = {
  id: string;
  title: string;
  instructions: string;
  items: RatingItem[];
};
export type RatingSets = { project: string; sets: RatingSet[] };
/** item id -> label -> arm key (`<model>@<quality>[-<size>]`) */
export type RatingKey = Record<string, Record<string, string>>;

function itemId(setId: string, index: number): string {
  return `${setId}-${String(index + 1).padStart(2, "0")}`;
}

/** Assigns item ids and arms to the selected cases. */
export function planRatingSets(
  beatCases: EvalCase[],
  beatReserves: EvalCase[],
  coverPortraitCases: EvalCase[]
): RatingSetPlan[] {
  return [
    {
      setId: BEAT_SET_ID,
      items: beatCases.map((evalCase, i) => ({
        itemId: itemId(BEAT_SET_ID, i),
        arms: beatArmsForItem(i),
        evalCase,
      })),
      reserves: beatReserves,
    },
    {
      setId: COVER_SET_ID,
      items: coverPortraitCases.map((evalCase, i) => {
        if (evalCase.callSite === "beat") {
          throw new Error(`Beat case ${evalCase.id} in the cover/portrait set`);
        }
        return {
          itemId: itemId(COVER_SET_ID, i),
          arms: coverPortraitArms(evalCase.callSite),
          evalCase,
        };
      }),
      reserves: [],
    },
  ];
}

/** Where the rater-facing copy of a reference image lives (relative path). */
export function referenceFileFor(ref: EvalReference): string {
  const { source, sourceId, subDirectory, id } = ref.reference;
  const identity = [source, sourceId, subDirectory ?? "", id].join("/");
  const hash = createHash("sha256").update(identity).digest("hex").slice(0, 8);
  return `images/refs/ref-${hash}.jpeg`;
}

function markdownAlt(text: string): string {
  return text.replace(/[[\]]/g, "");
}

function contextFor(evalCase: EvalCase): string {
  const style = `**Story style notes:**\n\n${evalCase.styleNotes}`;
  if (evalCase.callSite !== "beat") {
    return [
      `**What was requested:** ${COVER_KIND[evalCase.callSite]}`,
      `**Description:** ${evalCase.description}`,
      style,
    ].join("\n\n");
  }
  const references =
    evalCase.references.length === 0
      ? "**Reference images given to the generator:** none"
      : [
          "**Reference images given to the generator:**",
          ...evalCase.references.map(
            (ref) => `![${markdownAlt(ref.alt)}](${referenceFileFor(ref)})`
          ),
        ].join("\n\n");
  return [`**Scene to illustrate:** ${evalCase.description}`, style, references].join(
    "\n\n"
  );
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * The label position of the baseline in each item: items are ranked by
 * sha256(itemId), and rank r puts the baseline at position r mod the item's
 * option count, so within a set every label holds the baseline about equally
 * often and no pattern follows the item order.
 */
function baselinePositions(items: { itemId: string; optionCount: number }[]): number[] {
  const positions = new Array<number>(items.length).fill(0);
  items
    .map((item, index) => ({ index, hash: sha256(item.itemId) }))
    .sort((a, b) => a.hash.localeCompare(b.hash))
    .forEach(({ index }, rank) => {
      positions[index] = rank % items[index].optionCount;
    });
  return positions;
}

/** Candidates in sha256(itemId|armKey) order, with the baseline inserted at its position. */
function orderOptions<T extends { arm: { key: string; baseline: boolean } }>(
  itemId: string,
  generated: T[],
  baselinePosition: number
): T[] {
  const baseline = generated.filter((g) => g.arm.baseline);
  const candidates = generated
    .filter((g) => !g.arm.baseline)
    .sort((a, b) =>
      sha256(`${itemId}|${a.arm.key}`).localeCompare(sha256(`${itemId}|${b.arm.key}`))
    );
  candidates.splice(baselinePosition, 0, ...baseline);
  return candidates;
}

/**
 * Builds rating-sets.json and rating-key.json from the final plan. Failed or
 * junk arms are dropped; an item needs its baseline plus at least one other
 * option. Options are labelled A-D: the baseline's label is balanced across
 * the set (baselinePositions), the candidates are ordered by hash.
 */
export function buildRatingFiles(
  plans: RatingSetPlan[],
  records: CallRecord[],
  outputExists: (outputFile: string) => boolean
): { ratingSets: RatingSets; ratingKey: RatingKey } {
  const ratingKey: RatingKey = {};
  const sets = plans.map((plan): RatingSet => {
    const rated = plan.items
      .map((item) => ({
        item,
        generated: item.arms
          .map((arm) => ({
            arm,
            record: latestFinalRecord(records, item.evalCase.id, arm.key),
          }))
          .filter(
            ({ record }) =>
              record?.status === "success" &&
              record.outputFile !== undefined &&
              outputExists(record.outputFile)
          ),
      }))
      .filter(
        ({ generated }) =>
          generated.some(({ arm }) => arm.baseline) && generated.length >= MIN_OPTIONS
      );
    const positions = baselinePositions(
      rated.map(({ item, generated }) => ({
        itemId: item.itemId,
        optionCount: generated.length,
      }))
    );

    const items: RatingItem[] = [];
    for (const [index, { item, generated }] of rated.entries()) {
      const ordered = orderOptions(item.itemId, generated, positions[index]);
      ratingKey[item.itemId] = Object.fromEntries(
        ordered.map(({ arm }, i) => [LABELS[i], arm.key])
      );
      items.push({
        id: item.itemId,
        context_md: contextFor(item.evalCase),
        options: ordered.map(({ record }, i) => ({
          label: LABELS[i],
          type: "image",
          src: record?.outputFile ?? "",
        })),
      });
    }
    return { id: plan.setId, ...SET_TEXT[plan.setId], items };
  });
  return { ratingSets: { project: PROJECT, sets }, ratingKey };
}

const ratingSetsSchema = z
  .object({
    project: z.literal(PROJECT),
    sets: z.array(
      z
        .object({
          id: z.string(),
          title: z.string(),
          instructions: z.string(),
          items: z.array(
            z
              .object({
                id: z.string(),
                context_md: z.string(),
                options: z
                  .array(
                    z
                      .object({
                        label: z.string(),
                        type: z.literal("image"),
                        src: z.string(),
                      })
                      .strict()
                  )
                  .min(MIN_OPTIONS)
                  .max(MAX_OPTIONS),
              })
              .strict()
          ),
        })
        .strict()
    ),
  })
  .strict();

function markdownImagePaths(markdown: string): string[] {
  return [...markdown.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]);
}

/**
 * Problems that make the rating file unusable or not blind; empty when valid.
 * File paths are checked relative to baseDir.
 */
export function validateRatingSets(file: unknown, baseDir: string): string[] {
  const parsed = ratingSetsSchema.safeParse(file);
  if (!parsed.success) {
    return parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  }
  const problems: string[] = [];
  for (const set of parsed.data.sets) {
    const limit = MAX_ITEMS[set.id];
    if (limit === undefined) {
      problems.push(`unknown set id ${set.id}`);
    } else if (set.items.length > limit) {
      problems.push(`${set.id} has ${set.items.length} items (max ${limit})`);
    }
    const idPattern = new RegExp(`^${set.id}-\\d{2}$`);
    for (const item of set.items) {
      if (!idPattern.test(item.id)) {
        problems.push(`item id ${item.id} does not match ${set.id}-NN`);
      }
      const labels = item.options.map((o) => o.label).join("");
      if (labels !== LABELS.slice(0, item.options.length).join("")) {
        problems.push(`${item.id}: labels ${labels} are not in order`);
      }
      const files = [
        ...item.options.map((o) => o.src),
        ...markdownImagePaths(item.context_md),
      ];
      for (const file of files) {
        if (!fs.existsSync(path.join(baseDir, file))) {
          problems.push(`${item.id}: missing file ${file}`);
        }
      }
    }
  }
  for (const leak of findLeaks(file)) {
    problems.push(`reveals a model: "${leak.slice(0, 80)}"`);
  }
  return problems;
}
