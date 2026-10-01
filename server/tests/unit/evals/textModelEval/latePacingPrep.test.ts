import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { z } from "zod";
import { LEDGER_STAGES, type Caps, type LedgerStage } from "../../../../src/evals/textModelEval/budget.js";
import type { EvalFiles } from "../../../../src/evals/textModelEval/evalFiles.js";
import { sha256, type ExecutedCall } from "../../../../src/evals/textModelEval/executor.js";
import { NEW_MYSTERY_CHECK } from "../../../../src/evals/textModelEval/cluesJudge.js";
import { playOn } from "../../../../src/evals/textModelEval/latePacingPlay.js";
import {
  LATE_PACING_SWITCH_ARMS,
  cluesPlayTargets,
  latePacingCall,
  mergeLatePacingRuns,
  playRunKey,
  playVariantsOf,
  renderSwitchCases,
  switchCaseReadings,
  type SwitchCaseRow,
} from "../../../../src/evals/textModelEval/latePacingPrep.js";
import { PLAYTHROUGHS, playStory, playthroughArm, type PlayRun } from "../../../../src/evals/textModelEval/playthroughs.js";
import type { CallRecord } from "../../../../src/evals/textModelEval/runner.js";
import type { PrepContext } from "../../../../src/evals/textModelEval/turnPrep.js";
import { executed } from "./fixtures.js";
import { fakeCall, input } from "./playFixtures.js";

/*
 * The late-pacing stage's CLI pieces (2026-10-01, fix 8 of the second
 * playthroughs' review): the short playthroughs' calls as prep jobs in the
 * stage under adopted15, never past the spend limit; their runs kept by
 * story, arm and sample; and the judge calls on their turns in the story's
 * late part.
 */

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const REQUEST = { prompt: "Plan the next chapter.", schema: z.object({ ok: z.boolean() }) };

function context() {
  const prep: CallRecord[] = [];
  const execute = jest.fn(async (): Promise<ExecutedCall> => ({ ...executed("valid"), promptHash: sha256(REQUEST.prompt) }));
  const files = { readRecords: () => [], loadOutput: () => ({ ok: true }), readPrepRecords: () => [...prep], readProbe: () => undefined, readFilterRecords: () => [] } as unknown as EvalFiles;
  const stageCaps = Object.fromEntries(LEDGER_STAGES.map((stage) => [stage, 100])) as Record<LedgerStage, number>;
  const caps: Caps = { stageCaps, globalCap: 100 };
  const lines: string[] = [];
  const ctx: PrepContext = {
    files,
    caps,
    deps: () => ({ execute, record: (r: CallRecord) => prep.push(r), now: () => 0, sleep: async () => undefined, warn: () => undefined }),
    refuse: () => undefined,
    tpm: 1e9,
    maxInFlight: 1,
    log: (line) => lines.push(line),
  };
  return { ctx, prep, execute, lines };
}

describe("latePacingCall: the short playthroughs' calls in the stage", () => {
  it("records each call as a play call in late-pacing under adopted15, on the arm the call names", async () => {
    const { ctx, prep } = context();
    const spec = { kind: "play" as const, caseId: "play-avalon-from17-s1-000-chapter-plan", role: "thread" as const, arm: playthroughArm("thread", 1, "latePacing"), players: 1, request: REQUEST };
    const result = await latePacingCall(ctx, 1, 1)(spec);
    expect(result).toMatchObject({ parsed: { ok: true } });
    expect(prep[0]).toMatchObject({ caseId: spec.caseId, armKey: "play>gpt-6-luna@low/latePacing", stage: "late-pacing", promptState: "adopted15", group: "prep", sample: 1 });
  });

  it("sends nothing past the spend limit", async () => {
    const { ctx, execute } = context();
    const spec = { kind: "play" as const, caseId: "x", role: "beat" as const, arm: playthroughArm("beat", 1), players: 1, request: REQUEST };
    expect((await latePacingCall(ctx, 1, 0)(spec)).notSent).toMatch(/spend limit/);
    expect(execute).not.toHaveBeenCalled();
  });
});

async function continued(variant: "adopted" | "latePacing", sample = 1): Promise<PlayRun> {
  const { call } = fakeCall(1);
  const { run: stored } = await playStory(PLAYTHROUGHS[0], input(1, 13), call, { sample: 1 });
  const at = stored.turns.find((t) => t.turn > 6 && t.plan?.kind === "chapter plan")!;
  const { call: again } = fakeCall(1);
  return (await playOn(stored, at.turn, variant, again, sample)).run;
}

describe("playVariantsOf: the arms a short-playthrough invocation plays", () => {
  it("plays production and the variant by default, the retest alone where --arms names it", () => {
    expect(playVariantsOf()).toEqual(["adopted", "latePacing"]);
    expect(playVariantsOf([])).toEqual(["adopted", "latePacing"]);
    expect(playVariantsOf(["latePacingB"])).toEqual(["latePacingB"]);
    expect(() => playVariantsOf(["planV2f"])).toThrow(/latePacingB/);
  });

  it("orders the retest's runs after the variant's", async () => {
    const [a, b] = [await continued("adopted"), await continued("latePacing")];
    const retest = { ...b, from: { ...b.from!, variant: "latePacingB" as const } };
    expect(mergeLatePacingRuns([], [retest, b, a]).map((r) => r.from?.variant)).toEqual(["adopted", "latePacing", "latePacingB"]);
  });
});

describe("the switch cases' readings", () => {
  const row = (armKey: string, caseId: string, sample: number, taken: boolean): SwitchCaseRow => ({
    armKey,
    caseId,
    sample,
    outputId: `${armKey}-${caseId}-${sample}`,
    reading: { fit: 1, players: [], completeWhileNeeded: taken, spare: false },
  });

  it("read the retest's arm too, and the retest's case apart from the stored switches, each arm's tally there", () => {
    expect(LATE_PACING_SWITCH_ARMS).toEqual(["gpt-6-luna@low/adopted", "gpt-6-luna@low/latePacing", "gpt-6-luna@low/latePacingB"]);
    const rows = [
      row("gpt-6-luna@low/adopted", "round-late-switch-avalon-t20", 1, false),
      row("gpt-6-luna@low/latePacingB", "round-late-switch-avalon-t20", 1, false),
      row("gpt-6-luna@low/latePacing", "round-late-switch-food-trucks-variant-t21", 1, true),
      row("gpt-6-luna@low/latePacing", "round-late-switch-food-trucks-variant-t21", 2, false),
      row("gpt-6-luna@low/latePacingB", "round-late-switch-food-trucks-variant-t21", 1, false),
    ];
    const text = renderSwitchCases(rows);
    expect(text).toContain("## The retest's switch (round-late-switch-food-trucks-variant-t21)");
    expect(text).toContain("- gpt-6-luna@low/latePacing: a complete outcome took a needed thread 1 of 2");
    expect(text).toContain("- gpt-6-luna@low/latePacingB: a complete outcome took a needed thread 0 of 1");
    expect(switchCaseReadings(rows.filter((r) => !r.caseId.includes("variant"))).neededKept.map((r) => r.armKey)).toEqual(["gpt-6-luna@low/adopted", "gpt-6-luna@low/latePacingB"]);
  });
});

describe("the runs and their judge calls", () => {
  it("keeps one run per story, start, arm and sample, a run played again replacing it", async () => {
    const [a, b] = [await continued("adopted"), await continued("latePacing")];
    const again = { ...(await continued("adopted")), stopped: "again" };
    const merged = mergeLatePacingRuns([a, b], [again]);
    expect(merged.map(playRunKey)).toEqual([playRunKey(a), playRunKey(b)]);
    expect(merged.find((r) => r.from?.variant === "adopted")?.stopped).toBe("again");
    expect(playRunKey(a)).toBe(`${a.spec.id}|${a.from?.turn}|adopted|1`);
  });

  it("judges each turn in the story's late part once per player, as the game kept it, under the arm's key", async () => {
    const run = await continued("latePacing");
    const targets = cluesPlayTargets([run]);
    // The story's own length (the fake's 13 turns), past two thirds
    const late = run.turns.filter((t) => t.reply && t.turn > (2 * run.input.maxTurns) / 3 && t.kind !== "ending");
    expect(late.length).toBeGreaterThan(0);
    expect(targets.map((t) => t.turn)).toEqual(late.map((t) => t.turn));
    for (const t of targets) {
      expect(t.check).toBe(NEW_MYSTERY_CHECK);
      expect(t.armKey).toBe(playthroughArm("beat", 1, "latePacing").key);
      expect(t.caseId).toBe(`${run.spec.id}-from${run.from?.turn}-t${t.turn}`);
      expect(t.key).toBe(`${run.spec.id}-from${run.from?.turn}-latePacing-s1-t${t.turn}-player1`);
    }
  });
});
