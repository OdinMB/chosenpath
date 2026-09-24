import fs from "fs";
import os from "os";
import path from "path";
import {
  buildRatingFiles,
  planRatingSets,
  validateRatingSets,
  BEAT_SET_ID,
} from "../../../../src/evals/imageModelEval/ratingFiles.js";
import type { RatingSets } from "../../../../src/evals/imageModelEval/ratingFiles.js";
import type { EvalCase } from "../../../../src/evals/imageModelEval/cases.js";
import type { RatingSetPlan } from "../../../../src/evals/imageModelEval/itemScheduler.js";
import type { CallRecord } from "../../../../src/evals/imageModelEval/runner.js";

function beatCase(id: string): EvalCase {
  return {
    id,
    callSite: "beat",
    prompt: "prompt",
    references: [],
    description: `Scene ${id}`,
    styleNotes: "- Visual style: watercolor",
  };
}

function coverCase(id: string): EvalCase {
  return { ...beatCase(id), callSite: "story-cover" };
}

function plansFor(beatIds: string[]): RatingSetPlan[] {
  return planRatingSets(beatIds.map(beatCase), [], [coverCase("cover-1")]);
}

function successRecords(
  plans: RatingSetPlan[],
  failing: (caseId: string, armKey: string) => CallRecord["status"] | undefined = () => undefined
): CallRecord[] {
  return plans.flatMap((p) =>
    p.items.flatMap((item) =>
      item.arms.map((arm): CallRecord => {
        const status = failing(item.evalCase.id, arm.key) ?? "success";
        return {
          itemId: item.itemId,
          caseId: item.evalCase.id,
          armKey: arm.key,
          model: arm.model,
          quality: arm.quality,
          size: arm.size,
          startedAt: "",
          latencyMs: 1,
          status,
          attempt: 1,
          final: true,
          costUsd: 0.01,
          costSource: "usage",
          outputFile: status === "success" ? `images/${item.itemId}-${arm.key}.jpeg` : undefined,
        };
      })
    )
  );
}

const exists = () => true;

describe("buildRatingFiles", () => {
  it("orders options the same way on every build, and does not always put the baseline first", () => {
    const plans = plansFor(["a", "b", "c", "d", "e", "f"]);
    const records = successRecords(plans);

    const first = buildRatingFiles(plans, records, exists);
    const second = buildRatingFiles(plans, records, exists);

    expect(second).toEqual(first);
    const baselineLabels = Object.values(first.ratingKey).map(
      (labels) => Object.entries(labels).find(([, arm]) => arm === "gpt-image-1.5@medium")?.[0]
    );
    expect(new Set(baselineLabels).size).toBeGreaterThan(1);
  });

  it("spreads the baseline evenly over the labels within a set", () => {
    const ids = Array.from({ length: 12 }, (_, i) => `case-${i}`);
    const plans = plansFor(ids);
    const { ratingKey } = buildRatingFiles(plans, successRecords(plans), exists);

    const counts: Record<string, number> = {};
    for (const [itemId, labels] of Object.entries(ratingKey)) {
      if (!itemId.startsWith(BEAT_SET_ID)) continue;
      const label = Object.entries(labels).find(([, arm]) => arm === "gpt-image-1.5@medium")?.[0];
      counts[label ?? "none"] = (counts[label ?? "none"] ?? 0) + 1;
    }

    expect(counts).toEqual({ A: 3, B: 3, C: 3, D: 3 });
  });

  it("maps every option label to exactly one arm in the key", () => {
    const plans = plansFor(["a", "b"]);
    const { ratingSets, ratingKey } = buildRatingFiles(plans, successRecords(plans), exists);

    for (const set of ratingSets.sets) {
      for (const item of set.items) {
        expect(Object.keys(ratingKey[item.id])).toEqual(item.options.map((o) => o.label));
        expect(item.options.map((o) => o.label)).toEqual(
          ["A", "B", "C", "D"].slice(0, item.options.length)
        );
        expect(new Set(Object.values(ratingKey[item.id])).size).toBe(item.options.length);
      }
    }
  });

  it("drops failed and junk arms, and items without a baseline or a second option", () => {
    const plans = plansFor(["keeps", "no-baseline", "alone"]);
    const records = successRecords(plans, (caseId, armKey) => {
      const isBaseline = armKey === "gpt-image-1.5@medium";
      if (caseId === "keeps" && armKey.includes("sunburst")) return "junk";
      if (caseId === "keeps" && armKey.endsWith("-1536x1024")) return "error";
      if (caseId === "no-baseline" && isBaseline) return "error";
      if (caseId === "alone" && !isBaseline) return "error";
      return undefined;
    });

    const { ratingSets, ratingKey } = buildRatingFiles(plans, records, exists);
    const beatItems = ratingSets.sets.find((s) => s.id === BEAT_SET_ID)?.items ?? [];

    expect(beatItems.map((i) => i.id)).toEqual([`${BEAT_SET_ID}-01`]);
    const keptArms = Object.values(ratingKey[`${BEAT_SET_ID}-01`]);
    expect(keptArms).toHaveLength(2);
    expect(keptArms.some((k) => k.includes("sunburst") || k.endsWith("-1536x1024"))).toBe(false);
  });
});

describe("validateRatingSets", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "rating-sets-"));
    fs.mkdirSync(path.join(dir, "images"));
    for (const name of ["a.jpeg", "b.jpeg", "c.jpeg", "d.jpeg", "e.jpeg"]) {
      fs.writeFileSync(path.join(dir, "images", name), "x");
    }
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function file(context: string, optionCount = 2): RatingSets {
    return {
      project: "chosenpath",
      sets: [
        {
          id: BEAT_SET_ID,
          title: "Beats",
          instructions: "Pick the best picture.",
          items: [
            {
              id: `${BEAT_SET_ID}-01`,
              context_md: context,
              options: ["a", "b", "c", "d", "e"].slice(0, optionCount).map((name, i) => ({
                label: "ABCDE"[i],
                type: "image" as const,
                src: `images/${name}.jpeg`,
              })),
            },
          ],
        },
      ],
    };
  }

  it("accepts a well-formed, blind file", () => {
    expect(validateRatingSets(file("**Scene:** a harbour in Egypt"), dir)).toEqual([]);
  });

  it("rejects text that names a model", () => {
    expect(validateRatingSets(file("made with gpt-image-2.5"), dir)).not.toEqual([]);
    expect(validateRatingSets(file("warm light, lens flare"), dir)).not.toEqual([]);
  });

  it("rejects an item with 5 options", () => {
    expect(validateRatingSets(file("a harbour", 5), dir)).not.toEqual([]);
  });

  it("rejects a missing image file", () => {
    fs.rmSync(path.join(dir, "images", "b.jpeg"));
    expect(validateRatingSets(file("a harbour"), dir)).toEqual([
      `${BEAT_SET_ID}-01: missing file images/b.jpeg`,
    ]);
  });
});
