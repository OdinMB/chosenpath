import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { KID_AGE_LABEL, kidAgeAnswer } from "core/types/index.js";
import { KIDS_AGES_CASES, KIDS_AGES_MOUSE_SOURCES, armsFor, stageChecksTurns, stagePlansCase } from "../../../../src/evals/textModelEval/arms.js";
import { caseStory } from "../../../../src/evals/textModelEval/cases.js";
import { evalFiles } from "../../../../src/evals/textModelEval/evalFiles.js";
import { sha256 } from "../../../../src/evals/textModelEval/executor.js";
import { outputIdOf } from "../../../../src/evals/textModelEval/judgedChecks.js";
import { requestInputFor } from "../../../../src/evals/textModelEval/jobPlan.js";
import { KIDS_AGES_CHAIN, kidsAgesCases, kidsAgesCasesToFreeze, premiseAtAge } from "../../../../src/evals/textModelEval/kidsAgesCases.js";
import { chainRunsFrom } from "../../../../src/evals/textModelEval/setupChain.js";
import { requestFor, requestText } from "../../../../src/evals/textModelEval/variants.js";
import { KIDS_AGES_SETUP_TEXT, KIDS_AGES_TEXT } from "../../../../src/game/services/storyTextRounds/kidsAges.js";
import { beatStep } from "../../../../src/game/services/storyTextSteps.js";

/*
 * The kids-ages stage's cases (2026-10-01): the kids-turns stage's mouse turns
 * read with a child aged 4 and 10, the two-player animal rescue's first turn
 * and switch turn from setup round 3's stored chain at 4, 7 and 10, and two
 * setups at 10; no calls.
 */

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("the stage's arms", () => {
  it("run production and the variant twice on each turn case on its player count's turn model, each turn with production's checked retry, and once on each setup", () => {
    const sorted = (ids: readonly string[] | undefined) => [...(ids ?? [])].sort().join(",");
    expect(armsFor("kids-ages", "beat").map((p) => [p.arm.key, p.samples, p.scope, sorted(p.caseIds)])).toEqual([
      ["gpt-6-luna@medium/adopted", 2, "single-player", sorted(KIDS_AGES_CASES.single)],
      ["gpt-6-luna@medium/kidsAges", 2, "single-player", sorted(KIDS_AGES_CASES.single)],
      ["gpt-6-luna@low/adopted", 2, "multiplayer", sorted(KIDS_AGES_CASES.groups)],
      ["gpt-6-luna@low/kidsAges", 2, "multiplayer", sorted(KIDS_AGES_CASES.groups)],
    ]);
    expect(armsFor("kids-ages", "setup").map((p) => [p.arm.key, p.samples, sorted(p.caseIds)])).toEqual([
      ["gpt-6-luna@low/adopted", 1, sorted(KIDS_AGES_CASES.setups)],
      ["gpt-6-luna@low/kidsAges", 1, sorted(KIDS_AGES_CASES.setups)],
    ]);
    expect(armsFor("kids-ages", "thread")).toEqual([]);
    expect(stageChecksTurns("kids-ages")).toBe(true);
  });

  it("names its cases: the mouse turns at 4 and 10, the group's two turns at 4, 7 and 10, the setups at 10; each planned from the stage on", () => {
    expect(KIDS_AGES_CASES.single).toHaveLength(12);
    expect(KIDS_AGES_CASES.single).toContain("round-kids-ages-mouse-t3-a4");
    expect(KIDS_AGES_CASES.single).toContain("round-kids-ages-mouse-t11-a10");
    expect(KIDS_AGES_CASES.groups).toEqual([
      "round-kids-ages-rescue-first-a4",
      "round-kids-ages-rescue-switch-a4",
      "round-kids-ages-rescue-first-a7",
      "round-kids-ages-rescue-switch-a7",
      "round-kids-ages-rescue-first-a10",
      "round-kids-ages-rescue-switch-a10",
    ]);
    expect(KIDS_AGES_CASES.setups).toEqual(["round-setup-kids-ages-mouse-a10", "round-setup-kids-ages-rescue-a10"]);
    for (const id of [...KIDS_AGES_CASES.single, ...KIDS_AGES_CASES.groups, ...KIDS_AGES_CASES.setups]) {
      expect([id, stagePlansCase("late-pacing", id), stagePlansCase("kids-ages", id)]).toEqual([id, false, true]);
    }
  });
});

describe("premiseAtAge", () => {
  it("makes the form's age line this age, and nothing else", () => {
    const premise = `Create an age-appropriate story.\n\n${KID_AGE_LABEL}: 7-10\n\nAdditional context: rescue`;
    expect(premiseAtAge(premise, 10)).toBe(`Create an age-appropriate story.\n\n${KID_AGE_LABEL}: 10\n\nAdditional context: rescue`);
    expect(premiseAtAge("A story with no age line.", 10)).toBeUndefined();
  });
});

const DIR = path.resolve("..", "DOCS", "2026-09-26_gpt6-text-eval");
const haveFiles = fs.existsSync(path.join(DIR, "cases", "cases.json")) && fs.existsSync(path.join(DIR, "setup-chain.json"));
const files = haveFiles ? evalFiles(DIR) : undefined;
const frozen = files ? files.readCases() : [];
const runs = files ? chainRunsFrom(files.readSetupChain() ?? {}, files.loadOutputFile) : [];
const storedHashes = (() => {
  const file = path.join(DIR, "prep-calls.jsonl");
  if (!fs.existsSync(file)) return new Map<string, string>();
  const records = fs.readFileSync(file, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { outputFile?: string; promptHash?: string });
  return new Map(records.flatMap((r) => (r.outputFile && r.promptHash ? [[outputIdOf(r.outputFile), r.promptHash] as [string, string]] : [])));
})();

describe("kidsAgesCases on the frozen cases and the stored setup chain (skipped where the output folder is absent)", () => {
  const built = haveFiles ? kidsAgesCases(frozen, runs) : { cases: [], problems: [] };
  const byId = new Map(built.cases.map((c) => [c.id, c]));

  (haveFiles ? it : it.skip)("builds every case the stage names, without a problem", () => {
    expect(built.problems).toEqual([]);
    expect(built.cases.map((c) => c.id).sort()).toEqual([...KIDS_AGES_CASES.single, ...KIDS_AGES_CASES.groups, ...KIDS_AGES_CASES.setups].sort());
    // Frozen once, they are left as they are unless rebuilt
    expect(kidsAgesCasesToFreeze([...frozen, ...built.cases], runs, false)).toMatchObject({ cases: [], skipped: built.cases.map((c) => c.id) });
    expect(kidsAgesCasesToFreeze([...frozen, ...built.cases], runs, true).cases).toHaveLength(built.cases.length);
  });

  (haveFiles ? it : it.skip)("records each mouse turn as read with a child of its age, the older age taken out, its turn and plan as frozen", () => {
    for (const source of KIDS_AGES_MOUSE_SOURCES) {
      const base = frozen.find((c) => c.id === source);
      for (const age of [4, 10]) {
        const c = byId.get(`${source.replace("round-kids-mouse-", "round-kids-ages-mouse-")}-a${age}`);
        expect(c?.state?.kidAges).toEqual({ min: age, max: age });
        expect(c?.state?.readingAge).toBeUndefined();
        expect([c?.tags.category, c?.tags.kids, c?.tags.players]).toEqual(["kids-ages", true, 1]);
        expect(c?.fixedAnalysis).toEqual(base?.fixedAnalysis);
        const story = caseStory(c!);
        // Production's kids turn names the age; the variant writes for the band
        expect(beatStep.request(story).prompt).toContain(`a child aged ${age}`);
        expect(requestText(requestFor("kidsAges", requestInputFor(c!)))).toContain(KIDS_AGES_TEXT[age === 4 ? "3-5" : "9-12"].context);
      }
      // At 7 the variant is production's request byte for byte, so the stage builds no single-player case there
      const atSeven = { ...base!, state: { ...base!.state!, kidAges: { min: 7, max: 7 } } };
      expect(requestText(requestFor("kidsAges", requestInputFor(atSeven)))).toBe(requestText(requestFor("adopted", requestInputFor(atSeven))));
    }
  });

  (haveFiles ? it : it.skip)("rebuilds the group's two turns as the chain sent them (the chain's group turn form, prompt hash), read with a child of each age", () => {
    const run = runs.find((r) => r.premise.id === KIDS_AGES_CHAIN.chain && r.sample === KIDS_AGES_CHAIN.sample);
    const sent = (kind: string) => run?.steps.find((s) => s.kind === kind)?.outputFile ?? "";
    for (const age of [4, 7, 10]) {
      for (const [turn, kind] of [
        ["first", "first turn"],
        ["switch", "switch turn"],
      ] as const) {
        const c = byId.get(`round-kids-ages-rescue-${turn}-a${age}`);
        expect([c?.state?.category, c?.state?.kidAges, c?.tags.players, c?.tags.kids, c?.fixedAnalysis?.kind]).toEqual(["read-with-kids", { min: age, max: age }, 2, true, "switch"]);
        const story = caseStory(c!);
        expect(story.getCurrentBeatType()).toBe("switch");
        expect(story.isFirstBeat()).toBe(turn === "first");
        // The chain played groups on today's form at the round0 prompt state ("prod")
        expect(sha256(requestText(requestFor("prod", requestInputFor(c!))))).toBe(storedHashes.get(outputIdOf(sent(kind))));
      }
    }
  });

  (haveFiles ? it : it.skip)("sets the two setups up for a child aged 10: the age line and the setting; the variant's budget is the 9-12 band's", () => {
    for (const id of KIDS_AGES_CASES.setups) {
      const c = byId.get(id);
      expect([c?.role, c?.tags.kids, c?.setup?.kidAges]).toEqual(["setup", true, { min: 10, max: 10 }]);
      expect(kidAgeAnswer(c?.setup?.premise ?? "")).toBe("10");
      const input = requestInputFor(c!);
      expect(requestText(requestFor("kidsAges", input))).toContain(KIDS_AGES_SETUP_TEXT.budget.to);
      expect(requestText(requestFor("adopted", input))).toContain(KIDS_AGES_SETUP_TEXT.budget.from);
      // Below 9 the variant's setup is production's byte for byte, so the stage builds none there
      for (const age of [4, 7]) {
        const younger = { ...c!, setup: { ...c!.setup!, kidAges: { min: age, max: age } } };
        expect(requestText(requestFor("kidsAges", requestInputFor(younger)))).toBe(requestText(requestFor("adopted", requestInputFor(younger))));
      }
    }
  });
});
