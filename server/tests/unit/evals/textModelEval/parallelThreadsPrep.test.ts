import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { Story } from "core/models/Story.js";
import type { Beat, Outcome, StoryPhase, SwitchAnalysis, ThreadAnalysis } from "core/types/index.js";
import { GameModes } from "core/types/index.js";
import { PARALLEL_THREADS_CASES } from "../../../../src/evals/textModelEval/arms.js";
import { PLACES_CALIBRATION } from "../../../../src/evals/textModelEval/parallelThreadsJudge.js";
import {
  PARALLEL_CHAINS,
  PARALLEL_SWITCH_ARMS,
  chapterPlanRows,
  parallelCalibrationTargets,
  parallelPlanReadings,
  parallelReadings,
  parallelRepliesToJudge,
  parallelTargetsToSend,
  switchPlanRows,
} from "../../../../src/evals/textModelEval/parallelThreadsPrep.js";
import { playthroughRunsFrom } from "../../../../src/evals/textModelEval/playthroughMode.js";
import type { PlayRun } from "../../../../src/evals/textModelEval/playthroughs.js";
import type { CallRecord } from "../../../../src/evals/textModelEval/runner.js";
import { createMockMultiplayerStory } from "../../../helpers/testHelpers.js";
import { beatGeneration, outcome, thread } from "../../../helpers/textFixtures.js";
import { evalCase, record, tags } from "./fixtures.js";

/*
 * The parallel-threads stage's judge calls and plan readings: the judge's
 * calibration (hand-read stored group turns, two samples) and every chain's
 * turn of the stage's arms under adopted11 (placesConsistent, one call per
 * group turn), each read as the game keeps it: the chain's plan checked and
 * applied, the turn repaired; the switch plans' and the chains' plans read by
 * the game, no calls.
 */

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const [PROD_SWITCH, VARIANT_SWITCH] = PARALLEL_SWITCH_ARMS;
const [PROD_CHAIN, VARIANT_CHAIN] = PARALLEL_CHAINS;
const [SWITCH_CASE] = PARALLEL_THREADS_CASES.switches;
const [CHAPTER_CASE] = PARALLEL_THREADS_CASES.chapters;

const SALE: Outcome = outcome("shared_sale", {
  question: "Who sells the house?",
  possibleResolutions: { sideAWins: "Rory sells it.", mixed: "Neither sells it.", sideBWins: "Nia sells it." },
  intendedNumberOfMilestones: 3,
});

const sw = (players: string[], type: "topic" | "flavor", outcomes: string[]): SwitchAnalysis["switches"][number] =>
  ({
    players,
    type,
    relevantSuggestedThreadTypes: [],
    previousThreadTypesToBeAvoided: [],
    relevantSwitchAndThreadInstructions: "",
    outcomeId: type === "flavor" ? outcomes[0] : "",
    question: type === "flavor" ? "Who?" : "",
    topicChoices: type === "topic" ? outcomes.map((id) => `Toward ${id} (${id})`) : [],
    ...(type === "topic" ? { topicDirections: outcomes.map((id) => ({ direction: `Toward ${id}`, outcomeId: id })) } : {}),
    relationshipToOtherSwitches: "",
    title: "A switch",
    id: `sw_${players.join("_")}_${type}`,
  }) as SwitchAnalysis["switches"][number];

const switchPhase = (switches: SwitchAnalysis["switches"], firstBeatIndex: number): SwitchAnalysis =>
  ({ coordinationPatternAnalysis: "", coordinationPatternSummary: "", switches, firstBeatIndex, duration: 1 }) as SwitchAnalysis;

function saleChapter(): ThreadAnalysis {
  const t = thread("challenge", 2, 1, ["player1", "player2"]);
  return {
    relevantSwitchAndThreadInstructions: "",
    coordinationPatternSummary: "",
    duration: 2,
    firstBeatIndex: 1,
    threads: [{ ...t, outcomeId: "shared_sale", progression: t.progression.map((s) => ({ ...s, resolution: "favorable" as const })), resolution: "favorable" as const, milestone: "Sold?" }],
  };
}

/** A two-player contest story: Rory and Nia, the sale at `recorded` of 3. */
function story(phases: StoryPhase[], turns: number, recorded: number, picks: number[] = [0, 0]) {
  const base = createMockMultiplayerStory(2).getState();
  const players = Object.fromEntries(
    Object.entries(base.players).map(([slot, player], i) => [
      slot,
      {
        ...player,
        name: ["Rory Vale", "Nia Hart"][i],
        outcomes: [outcome(`${slot}_own`)],
        beatHistory: Array.from({ length: turns }, (_, k): Beat => ({ ...beatGeneration({ text: "A text.", summary: "S." }), choice: k === turns - 1 ? picks[i] : 0, resolution: "resolution1" })),
      },
    ])
  );
  return Story.create({ ...base, gameMode: GameModes.Competitive, sharedOutcomes: [{ ...SALE, milestones: Array.from({ length: recorded }, (_, k) => `M${k}`) }], players, storyPhases: phases, maxTurns: 25 }).getState();
}

// The switch planner's input: the sale at 1 of 3 plus the chapter that just ended, so its next thread settles the last stage
const switchState = story([switchPhase([sw(["player1", "player2"], "flavor", ["shared_sale"])], 0), saleChapter()], 3, 1);
// The chapter planner's input: the sale at 2 of 3; Rory chose his own outcome, Nia the sale
const chapterState = story(
  [switchPhase([sw(["player1", "player2"], "flavor", ["shared_sale"])], 0), saleChapter(), switchPhase([sw(["player1"], "topic", ["player1_own", "shared_sale"]), sw(["player2"], "topic", ["shared_sale", "player2_own"])], 3)],
  4,
  2,
  [0, 0]
);

const group = tags({ source: "round", multiplayer: true, players: 2 });
const cases = [evalCase(SWITCH_CASE, "switch", { state: switchState, tags: group }), evalCase(CHAPTER_CASE, "thread", { state: chapterState, tags: group })];

const oneSidedPlan = (namesRory: boolean): ThreadAnalysis => {
  const own = thread("exploration", 2, 4, ["player1"]);
  const sale = thread("challenge", 2, 4, ["player2"]);
  const results = { favorable: "Mara signs with Nia.", mixed: "Mara waits.", unfavorable: namesRory ? "Mara signs through Rory." : "Mara turns Nia down." };
  return {
    relevantSwitchAndThreadInstructions: "",
    coordinationPatternSummary: "",
    duration: 2,
    firstBeatIndex: 4,
    threads: [
      { ...own, id: "own", outcomeId: "player1_own", title: "The Archive" },
      { ...sale, id: "sale", outcomeId: "shared_sale", title: "The Open House", possibleMilestones: results, progression: sale.progression.map((s) => ({ ...s, possibleResolutions: results })) },
    ],
  };
};

const turnReply = {
  statChanges: [],
  newMilestones: "",
  player1: { title: "T", text: "Rory reads in the archive.\n\nThe ledger lies open.", options: [], interludes: [], plan: { establishedFacts: [], newGameElements: [] } },
  player2: { title: "T", text: "Nia greets Mara at the open house.\n\nThe gate stands open.", options: [], interludes: [], plan: { establishedFacts: [], newGameElements: [] } },
};

const out = (n: number) => `outputs\\${String(n).padStart(20, "0")}.json`;
const base = { promptState: "adopted11", stage: "parallel-threads" as const, baseline: false, players: 2 };
const records: CallRecord[] = [
  record({ ...base, role: "switch", group: "switch", caseId: SWITCH_CASE, armKey: PROD_SWITCH, callArmKey: PROD_SWITCH, jobKey: `${SWITCH_CASE}|${PROD_SWITCH}|adopted11|s1`, outputFile: out(1) }),
  record({ ...base, role: "switch", group: "switch", caseId: SWITCH_CASE, armKey: VARIANT_SWITCH, callArmKey: VARIANT_SWITCH, jobKey: `${SWITCH_CASE}|${VARIANT_SWITCH}|adopted11|s1`, outputFile: out(2) }),
  // Production's chain: its plan (step 1), then its turn (step 2)
  record({ ...base, role: "thread", group: "pipeline", caseId: CHAPTER_CASE, armKey: PROD_CHAIN, callArmKey: PROD_SWITCH, jobKey: `${CHAPTER_CASE}|${PROD_CHAIN}|adopted11|s1`, step: 1, jobFinal: false, outputFile: out(3) }),
  record({ ...base, role: "beat", group: "pipeline", caseId: CHAPTER_CASE, armKey: PROD_CHAIN, callArmKey: PROD_SWITCH, jobKey: `${CHAPTER_CASE}|${PROD_CHAIN}|adopted11|s1`, step: 2, outputFile: out(4) }),
  // The variant's chain
  record({ ...base, role: "thread", group: "pipeline", caseId: CHAPTER_CASE, armKey: VARIANT_CHAIN, callArmKey: VARIANT_SWITCH, jobKey: `${CHAPTER_CASE}|${VARIANT_CHAIN}|adopted11|s1`, step: 1, jobFinal: false, outputFile: out(5) }),
  record({ ...base, role: "beat", group: "pipeline", caseId: CHAPTER_CASE, armKey: VARIANT_CHAIN, callArmKey: VARIANT_SWITCH, jobKey: `${CHAPTER_CASE}|${VARIANT_CHAIN}|adopted11|s1`, step: 2, outputFile: out(6) }),
  // Another tag, a failed turn: not read
  record({ ...base, promptState: "adopted10", role: "beat", group: "pipeline", caseId: CHAPTER_CASE, armKey: PROD_CHAIN, callArmKey: PROD_SWITCH, jobKey: `${CHAPTER_CASE}|${PROD_CHAIN}|adopted10|s1`, step: 2, outputFile: out(7) }),
  record({ ...base, role: "beat", group: "pipeline", caseId: CHAPTER_CASE, armKey: VARIANT_CHAIN, callArmKey: VARIANT_SWITCH, jobKey: `${CHAPTER_CASE}|${VARIANT_CHAIN}|adopted11|s2`, sample: 2, step: 2, outcome: "schema-mismatch", outputFile: out(8) }),
];
const outputs: Record<string, unknown> = {
  [out(1)]: switchPhase([sw(["player1"], "topic", ["shared_sale", "player1_own"]), sw(["player2"], "topic", ["shared_sale", "player2_own"])], 3),
  [out(2)]: switchPhase([sw(["player1", "player2"], "flavor", ["shared_sale"])], 3),
  [out(3)]: oneSidedPlan(true),
  [out(4)]: turnReply,
  [out(5)]: oneSidedPlan(false),
  [out(6)]: turnReply,
  [out(7)]: turnReply,
};
const lookup = { records, cases, load: (r: CallRecord) => outputs[r.outputFile ?? ""] };

describe("the replies to judge", () => {
  it("reads every chain's final usable turn of the stage's arms under its tag, one call per group turn, on the story its own plan made", () => {
    const replies = parallelRepliesToJudge(lookup);
    expect(replies.map((r) => [r.armKey, r.caseId, r.sample, r.target.key])).toEqual([
      [PROD_CHAIN, CHAPTER_CASE, 1, "00000000000000000004"],
      [VARIANT_CHAIN, CHAPTER_CASE, 1, "00000000000000000006"],
    ]);
    const prompt = replies[0].target.request.prompt;
    expect(prompt).toContain('Thread "The Archive": Rory Vale (player1)');
    expect(prompt).toContain('Thread "The Open House": Nia Hart (player2)');
    expect(prompt).toContain("[1] Nia greets Mara at the open house.");
  });

  it("sends the calibration and every reply, or with --cases only those named", () => {
    const replies = parallelRepliesToJudge(lookup);
    const calibration = [{ itemId: "cal", key: "cal-x", request: replies[0].target.request, samples: 2 }];
    expect(parallelTargetsToSend(calibration, replies, undefined).map((t) => [t.key, t.samples])).toEqual([
      ["cal-x", 2],
      ["00000000000000000004", 1],
      ["00000000000000000006", 1],
    ]);
    expect(parallelTargetsToSend(calibration, replies, ["cal"]).map((t) => t.key)).toEqual(["cal-x"]);
  });
});

describe("the plans, read by the game", () => {
  it("reads how each switch plan offers the contest at its last stage", () => {
    expect(switchPlanRows(lookup).map((r) => [r.armKey, r.offers])).toEqual([
      [PROD_SWITCH, [{ outcomeId: "shared_sale", offered: "a direction among others", passes: false }]],
      [VARIANT_SWITCH, [{ outcomeId: "shared_sale", offered: "grouped", passes: true }]],
    ]);
  });

  it("reads each chain's plan as the game keeps it: its repairs, a one-sided contest's absent names, the last stage settled by one side", () => {
    const rows = chapterPlanRows(lookup);
    expect(rows.map((r) => [r.armKey, r.oneSided.map((o) => o.absentNamed), r.decidedAlone.map((a) => a.stage)])).toEqual([
      [PROD_CHAIN, [["Rory Vale"]], ["3 of 3"]],
      [VARIANT_CHAIN, [[]], ["3 of 3"]],
    ]);
  });

  it("reads the variant against production on the plans under the stop rule", () => {
    const groups = parallelPlanReadings(switchPlanRows(lookup), chapterPlanRows(lookup));
    expect(groups.map((g) => g.label)).toEqual([
      "Switches: a contest's last stage offered only as a grouped thread",
      "Chapters: a one-sided contest names no absent player",
      "Chapters: no contest's last stage settled by one side alone",
    ]);
    const switches = groups[0].readings.find((r) => r.armKey === VARIANT_SWITCH);
    expect([switches?.plans, switches?.referenceKey, switches?.vsReference?.reference]).toEqual([{ hits: 1, n: 1 }, PROD_SWITCH, { hits: 0, n: 1 }]);
  });
});

describe("the readings", () => {
  it("read the variant's chain against production's chain", () => {
    const plan = (armKey: string, sample: number, passes: boolean) => ({ armKey, caseId: "c", sample, outputId: `${armKey}${sample}`, passes, threads: 1 });
    const readings = parallelReadings([plan(PROD_CHAIN, 1, false), plan(PROD_CHAIN, 2, false), plan(VARIANT_CHAIN, 1, true), plan(VARIANT_CHAIN, 2, true)]);
    const variant = readings.find((r) => r.armKey === VARIANT_CHAIN);
    expect([variant?.referenceKey, variant?.vsReference?.reference, variant?.vsReference?.arm]).toEqual([PROD_CHAIN, { hits: 0, n: 2 }, { hits: 2, n: 2 }]);
  });
});

describe("the calibration's targets", () => {
  it("says so where a stored playthrough turn is not there", () => {
    const { targets, problems } = parallelCalibrationTargets([], [{ id: "stored", story: "play-food-trucks", turn: 6, hand: true, note: "n" }]);
    expect(targets).toEqual([]);
    expect(problems).toEqual([expect.stringMatching(/^stored: /)]);
  });

  const DIR = path.resolve("..", "DOCS", "2026-09-26_gpt6-text-eval");
  const stored2: PlayRun[] = fs.existsSync(path.join(DIR, "playthroughs-2.json")) ? playthroughRunsFrom(JSON.parse(fs.readFileSync(path.join(DIR, "playthroughs-2.json"), "utf-8"))) : [];

  (stored2.length ? it : it.skip)("builds every hand-read item on the stored playthroughs, each a group chapter step, its edits applied, at two samples", () => {
    const { targets, problems } = parallelCalibrationTargets(stored2);
    expect(problems).toEqual([]);
    expect(targets.map((t) => t.itemId)).toEqual(PLACES_CALIBRATION.map((i) => i.id));
    for (const t of targets) expect([t.itemId, t.samples, t.key]).toEqual([t.itemId, 2, `cal-${t.itemId}`]);
    const constructed = targets.find((t) => t.itemId === "constructed-space-pirates-t8-jori");
    expect(constructed?.request.prompt).toContain("Jori is up on the bridge, plotting the Comet’s course out of Needlepoint");
    const stored = targets.find((t) => t.itemId === "stored-space-pirates-t10");
    expect(stored?.request.prompt).toContain('Thread "The Pylons’ Narrow Passage": Jori');
  });
});
