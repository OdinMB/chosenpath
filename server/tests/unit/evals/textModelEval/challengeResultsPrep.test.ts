import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { Story } from "core/models/Story.js";
import type { SwitchAnalysis, ThreadAnalysis } from "core/types/index.js";
import { CHALLENGE_RESULTS_CASES } from "../../../../src/evals/textModelEval/arms.js";
import {
  CHALLENGE_PLAN_ARMS,
  ROUND2_RESULTS_HAND,
  approachShareReadings,
  challengeReadings,
  plansToJudge,
  storedAgreement,
  targetsToSend,
} from "../../../../src/evals/textModelEval/challengeResultsPrep.js";
import { RESULTS_CHECK } from "../../../../src/evals/textModelEval/choiceResultJudge.js";
import { playthroughRunsFrom } from "../../../../src/evals/textModelEval/playthroughMode.js";
import type { PlayRun } from "../../../../src/evals/textModelEval/playthroughs.js";
import type { CallRecord } from "../../../../src/evals/textModelEval/runner.js";
import { threadAnalysisAfterSwitch } from "../../../helpers/promptStories.js";
import { outcome, thread } from "../../../helpers/textFixtures.js";
import { evalCase, record, tags } from "./fixtures.js";

/*
 * The challenge-results stage's judge calls and readings: the calibrated
 * resultsFitKind (choiceResultJudge.ts, reliable at the choice-result stage)
 * on every chapter plan of the stage's arms under adopted12, one call per
 * plan, each read after the game's plan check; readings pooled, by player
 * count and by the switch the chapter follows; the share of challenge and
 * contest results the judge labels the player's choice; and, no calls, the
 * second round's stored readings of the same judge against the hand.
 */

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const [PROD, VARIANT] = CHALLENGE_PLAN_ARMS;
const [SINGLE] = CHALLENGE_RESULTS_CASES.single;
const [GROUP] = CHALLENGE_RESULTS_CASES.groups;

/** The chapter planner's input after a later switch, player1's own outcome at 0 of 2; a flavor switch on it, or the fixture's topic switch. */
function planning(players: number, flavor: boolean) {
  const base = threadAnalysisAfterSwitch(players).getState();
  const withOutcomes = Object.fromEntries(Object.entries(base.players).map(([slot, player]) => [slot, { ...player, outcomes: [outcome(slot === "player1" ? "outcome_1" : `${slot}_own`)] }]));
  const phases = base.storyPhases.map((phase, i) => {
    if (i !== base.storyPhases.length - 1 || !flavor) return phase;
    const sw = phase as SwitchAnalysis;
    return { ...sw, switches: sw.switches.map((s) => ({ ...s, type: "flavor" as const, outcomeId: "outcome_1", question: "How?", topicChoices: [] })) };
  });
  return Story.create({ ...base, players: withOutcomes, storyPhases: phases }).getState();
}

const cases = [
  evalCase(SINGLE, "thread", { state: planning(1, true), tags: tags({ source: "round" }) }),
  evalCase(GROUP, "thread", { state: planning(2, false), tags: tags({ source: "round", multiplayer: true, players: 2 }) }),
];

const plan = (favorable: string): ThreadAnalysis => {
  const t = thread("challenge", 2, 4, ["player1"]);
  const results = { favorable, mixed: "The guard hesitates.", unfavorable: "The guard calls his sergeant." };
  return {
    relevantSwitchAndThreadInstructions: "",
    coordinationPatternSummary: "",
    duration: 2,
    firstBeatIndex: 4,
    threads: [{ ...t, title: "The Gate", possibleMilestones: results, progression: t.progression.map((s) => ({ ...s, possibleResolutions: results })) }],
  };
};

const out = (n: number) => `outputs\\${String(n).padStart(20, "0")}.json`;
const base = { promptState: "adopted12", stage: "challenge-results" as const, baseline: false, role: "thread" as const, group: "thread" as const };
const records: CallRecord[] = [
  record({ ...base, caseId: SINGLE, armKey: PROD, callArmKey: PROD, jobKey: `${SINGLE}|${PROD}|adopted12|s1`, outputFile: out(1) }),
  record({ ...base, caseId: SINGLE, armKey: VARIANT, callArmKey: VARIANT, jobKey: `${SINGLE}|${VARIANT}|adopted12|s1`, outputFile: out(2) }),
  record({ ...base, caseId: GROUP, armKey: PROD, callArmKey: PROD, players: 2, jobKey: `${GROUP}|${PROD}|adopted12|s1`, outputFile: out(3) }),
  // Another tag, another arm, a failed call, another case: not read
  record({ ...base, promptState: "adopted11", caseId: SINGLE, armKey: PROD, callArmKey: PROD, jobKey: `${SINGLE}|${PROD}|adopted11|s1`, outputFile: out(4) }),
  record({ ...base, caseId: SINGLE, armKey: "gpt-6-luna@low/planV2f", callArmKey: "gpt-6-luna@low/planV2f", jobKey: `${SINGLE}|planV2f|adopted12|s1`, outputFile: out(5) }),
  record({ ...base, caseId: SINGLE, armKey: VARIANT, callArmKey: VARIANT, sample: 2, jobKey: `${SINGLE}|${VARIANT}|adopted12|s2`, outcome: "schema-mismatch", outputFile: out(6) }),
  record({ ...base, caseId: "other-plan", armKey: PROD, callArmKey: PROD, jobKey: `other-plan|${PROD}|adopted12|s1`, outputFile: out(7) }),
];
const outputs: Record<string, unknown> = {
  [out(1)]: plan("Rikkit keeps his papers steady, and the guard waves him through."),
  [out(2)]: plan("The guard waves Rikkit through."),
  [out(3)]: plan("The guard waves them through."),
  [out(4)]: plan("x"),
  [out(5)]: plan("x"),
  [out(7)]: plan("x"),
};
const lookup = { records, cases: [...cases, evalCase("other-plan", "thread", { state: planning(1, false) })], load: (r: CallRecord) => outputs[r.outputFile ?? ""] };

describe("the plans to judge", () => {
  it("reads every final usable plan of the stage's arms under its tag on its cases, one resultsFitKind call per plan, after the plan check", () => {
    const plans = plansToJudge(lookup);
    expect(plans.map((p) => [p.armKey, p.caseId, p.sample, p.outputId, p.targets.map((t) => [t.check, t.key, t.samples])])).toEqual([
      [PROD, SINGLE, 1, "00000000000000000001", [[RESULTS_CHECK, "00000000000000000001", 1]]],
      [VARIANT, SINGLE, 1, "00000000000000000002", [[RESULTS_CHECK, "00000000000000000002", 1]]],
      [PROD, GROUP, 1, "00000000000000000003", [[RESULTS_CHECK, "00000000000000000003", 1]]],
    ]);
    const prompt = plans[0].targets[0].request.prompt;
    expect(prompt).toContain("Thread 1: The Gate (a challenge chapter");
    expect(prompt).toContain("favorable: Rikkit keeps his papers steady, and the guard waves him through.");
    // The judge reads the plan, never the prompt
    expect(prompt).not.toContain("PLAYER DECISIONS");
    expect(plans.map((p) => p.kinds)).toEqual([["challenge"], ["challenge"], ["challenge"]]);
  });

  it("sends every plan, or with --cases only those named", () => {
    const plans = plansToJudge(lookup);
    expect(targetsToSend(plans, undefined).map((t) => t.key)).toEqual(["00000000000000000001", "00000000000000000002", "00000000000000000003"]);
    expect(targetsToSend(plans, [GROUP]).map((t) => t.key)).toEqual(["00000000000000000003"]);
  });
});

describe("the readings", () => {
  const verdict = (armKey: string, caseId: string, sample: number, passes: boolean) => ({ armKey, caseId, sample, outputId: `${armKey}${caseId}${sample}`, passes, threads: 1 });
  const verdicts = [
    verdict(PROD, SINGLE, 1, false),
    verdict(PROD, SINGLE, 2, true),
    verdict(VARIANT, SINGLE, 1, true),
    verdict(VARIANT, SINGLE, 2, true),
    verdict(PROD, GROUP, 1, false),
    verdict(PROD, GROUP, 2, false),
    verdict(VARIANT, GROUP, 1, true),
    verdict(VARIANT, GROUP, 2, false),
  ];

  it("read the variant against production pooled, by player count and by the switch the chapter follows", () => {
    const groups = challengeReadings(verdicts, cases);
    expect(groups.map((g) => g.label)).toEqual(["Every plan", "One player", "Groups", "After a flavor switch", "After a topic switch"]);
    const variantIn = (label: string) => groups.find((g) => g.label === label)?.readings.find((r) => r.armKey === VARIANT);
    expect([variantIn("Every plan")?.referenceKey, variantIn("Every plan")?.vsReference?.reference, variantIn("Every plan")?.vsReference?.arm]).toEqual([PROD, { hits: 1, n: 4 }, { hits: 3, n: 4 }]);
    expect(variantIn("One player")?.vsReference?.arm).toEqual({ hits: 2, n: 2 });
    expect(variantIn("Groups")?.vsReference?.arm).toEqual({ hits: 1, n: 2 });
    // The single-player case follows a flavor switch, the group case a topic switch
    expect(variantIn("After a flavor switch")?.vsReference?.reference).toEqual({ hits: 1, n: 2 });
    expect(variantIn("After a topic switch")?.vsReference?.reference).toEqual({ hits: 0, n: 2 });
  });

  it("pools the challenge and contest results the judge labels the player's choice, the variant against production", () => {
    const row = (armKey: string, sample: number, choice: number, results: number) => ({ armKey, caseId: SINGLE, sample, choice, results });
    const readings = approachShareReadings([row(PROD, 1, 3, 6), row(PROD, 2, 2, 6), row(VARIANT, 1, 0, 6), row(VARIANT, 2, 1, 6)]);
    const variant = readings.find((r) => r.armKey === VARIANT);
    expect([variant?.share, variant?.vsReference?.reference, variant?.vsReference?.noise]).toEqual([{ hits: 1, n: 12 }, { hits: 5, n: 12 }, expect.closeTo(1 / 6, 5)]);
    expect(variant?.vsReference?.beyondNoise).toBe("lower");
  });
});

describe("the second round's stored readings against the hand (no calls)", () => {
  it("names each of the round's 33 chapter plans once, by story and turn", () => {
    const keys = ROUND2_RESULTS_HAND.map((i) => `${i.story}-t${i.turn}`);
    expect(new Set(keys).size).toBe(33);
    expect(ROUND2_RESULTS_HAND.filter((i) => i.hand === false).length).toBe(20);
    expect(ROUND2_RESULTS_HAND.filter((i) => i.hand === "partial").length).toBe(3);
  });

  it("counts the stored judge's verdicts against the hand, partial items apart, and says where a verdict is missing", () => {
    const run = (story: string, judged: { turn: number; verdict?: boolean }[]) =>
      ({ spec: { id: story }, judged: judged.map((j) => ({ key: `${story}-s1-t${j.turn}`, kind: "results", turn: j.turn, label: "", verdict: j.verdict, lines: [], costUsd: 0 })) }) as unknown as PlayRun;
    const items = [
      { story: "play-a", turn: 2, hand: true as const, note: "" },
      { story: "play-a", turn: 5, hand: false as const, note: "" },
      { story: "play-a", turn: 9, hand: "partial" as const, note: "" },
      { story: "play-b", turn: 2, hand: false as const, note: "" },
    ];
    const agreement = storedAgreement([run("play-a", [{ turn: 2, verdict: true }, { turn: 5, verdict: true }, { turn: 9, verdict: true }])], items);
    expect(agreement).toMatchObject({ decided: 2, agree: 1, falsePasses: 1, falseFails: 0, partial: { yes: 1, no: 0 }, unread: 1 });
  });

  const DIR = path.resolve("..", "DOCS", "2026-09-26_gpt6-text-eval");
  const stored2: PlayRun[] = fs.existsSync(path.join(DIR, "playthroughs-2.json")) ? playthroughRunsFrom(JSON.parse(fs.readFileSync(path.join(DIR, "playthroughs-2.json"), "utf-8"))) : [];

  (stored2.length ? it : it.skip)("on the stored round: every plan read, the judge agreeing with the hand on every decided plan", () => {
    const agreement = storedAgreement(stored2);
    expect(agreement).toMatchObject({ decided: 30, agree: 30, unread: 0, partial: { yes: 3, no: 0 } });
  });
});
