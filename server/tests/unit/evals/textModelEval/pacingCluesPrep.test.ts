import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { LEDGER_STAGES, type Caps, type LedgerStage } from "../../../../src/evals/textModelEval/budget.js";
import { CLUES_CALIBRATION, NEW_MYSTERY_CHECK, cluesJudgeCaseId, type CluesAgreement } from "../../../../src/evals/textModelEval/cluesJudge.js";
import type { EvalFiles } from "../../../../src/evals/textModelEval/evalFiles.js";
import { sha256, type ExecutedCall } from "../../../../src/evals/textModelEval/executor.js";
import { outputIdOf } from "../../../../src/evals/textModelEval/judgedChecks.js";
import { LATE_PACING_STARTS, PACING_CLUES_STARTS } from "../../../../src/evals/textModelEval/latePacingCases.js";
import { continuationStart, playOn } from "../../../../src/evals/textModelEval/latePacingPlay.js";
import { playthroughs2Sent } from "../../../../src/evals/textModelEval/parallelThreadsCases.js";
import {
  PACING_CLUES_CALIBRATION,
  PACING_CLUES_VARIANTS,
  blindItemCode,
  blindKeyFor,
  blindRunCode,
  clueComparison,
  clueItems,
  clueJudgeTargets,
  handRows,
  mergePacingCluesRuns,
  pacingCluesCall,
  pacingCluesPlayVariants,
  renderBlindReading,
  stageJudgeTargets,
  type ClueRow,
} from "../../../../src/evals/textModelEval/pacingCluesPrep.js";
import { playthroughRunsFrom } from "../../../../src/evals/textModelEval/playthroughMode.js";
import { PLAYTHROUGHS, playStory, playthroughArm, type PlayRun } from "../../../../src/evals/textModelEval/playthroughs.js";
import type { CallRecord } from "../../../../src/evals/textModelEval/runner.js";
import { rateMove } from "../../../../src/evals/textModelEval/stopRule.js";
import type { PrepContext } from "../../../../src/evals/textModelEval/turnPrep.js";
import { requestFor, requestText } from "../../../../src/evals/textModelEval/variants.js";
import { chaptersThatFit, outcomeNeeds, turnsLeft } from "../../../../src/game/services/pacing.js";
import { LATE_PACING_TEXT } from "../../../../src/game/services/storyTextRounds/latePacing.js";
import { executed } from "./fixtures.js";
import { fakeCall, input } from "./playFixtures.js";

/*
 * The pacing-clues stage (2026-10-01, fix 8's retest in whole short
 * playthroughs, the coordinator's call after the owner's decisions): the
 * late-pacing stage's three starts and the space pirates' threshold switch,
 * each played on with production's code and the variant (pacingClues: the
 * fix-and-retest's planners and the late part's clue lines) to the story's
 * last chapter plan, as prep calls in the stage under adopted21; the late
 * turns both arms played, read blind by hand (runs coded, the key apart) and
 * by the clue judge's v2 once its calibration reads reliable.
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
  const ctx: PrepContext = {
    files,
    caps,
    deps: () => ({ execute, record: (r: CallRecord) => prep.push(r), now: () => 0, sleep: async () => undefined, warn: () => undefined }),
    refuse: () => undefined,
    tpm: 1e9,
    maxInFlight: 1,
    log: () => undefined,
  };
  return { ctx, prep, execute };
}

/** A stored 13-turn single-player story on the fakes, played on from its chapter plan after turn 6 by an arm. */
async function continued(variant: "adopted" | "pacingClues" | "pacingCluesB", sample = 1, players: 1 | 2 = 1): Promise<PlayRun> {
  const { call } = fakeCall(players);
  const { run: stored } = await playStory(PLAYTHROUGHS[0], input(players, 13), call, { sample: 1 });
  const at = stored.turns.find((t) => t.turn > 6 && t.plan?.kind === "chapter plan")!;
  const { call: again } = fakeCall(players);
  return (await playOn(stored, at.turn, variant, again, sample)).run;
}

const lastReply = (run: PlayRun) => Math.max(...run.turns.filter((t) => t.reply).map((t) => t.turn));

describe("the stage's starts and arms", () => {
  it("are the late-pacing stage's three starts and the space pirates' threshold switch at 14, production beside the variant", () => {
    expect(PACING_CLUES_STARTS.map((s) => [s.story, s.turn])).toEqual([...LATE_PACING_STARTS.map((s) => [s.story, s.turn]), ["play-space-pirates", 14]]);
    expect(PACING_CLUES_VARIANTS).toEqual(["adopted", "pacingClues"]);
  });

  it("records each call as a play call in pacing-clues under adopted21, on the arm the call names", async () => {
    const { ctx, prep } = context();
    const spec = { kind: "play" as const, caseId: "play-avalon-from17-s1-000-chapter-plan", role: "thread" as const, arm: playthroughArm("thread", 1, "pacingClues"), players: 1, request: REQUEST };
    expect(await pacingCluesCall(ctx, 1, 1)(spec)).toMatchObject({ parsed: { ok: true } });
    expect(prep[0]).toMatchObject({ caseId: spec.caseId, armKey: "play>gpt-6-luna@low/pacingClues", stage: "pacing-clues", promptState: "adopted21", group: "prep", sample: 1 });
    expect((await pacingCluesCall(ctx, 1, 0)({ ...spec, caseId: "x" })).notSent).toMatch(/spend limit/);
  });

  it("plays production and the variant by default, the fix-and-retest (pacingCluesB) alone where --arms names it", () => {
    expect(pacingCluesPlayVariants()).toEqual(["adopted", "pacingClues"]);
    expect(pacingCluesPlayVariants(["pacingCluesB"])).toEqual(["pacingCluesB"]);
    expect(() => pacingCluesPlayVariants(["latePacingB"])).toThrow(/pacingCluesB/);
  });

  it("keeps one run per story, start, arm and sample, production before the variant, a run played again replacing it", async () => {
    const [a, b] = [await continued("adopted"), await continued("pacingClues")];
    const again = { ...(await continued("adopted")), stopped: "again" };
    const merged = mergePacingCluesRuns([b, a], [again]);
    expect(merged.map((r) => r.from?.variant)).toEqual(["adopted", "pacingClues"]);
    expect(merged[0].stopped).toBe("again");
  });
});

describe("the late turns both arms played", () => {
  it("reads each run's turns in the story's late part up to the last turn both arms wrote for that story and sample, once per player", async () => {
    const runs = [await continued("adopted", 1, 2), await continued("pacingClues", 1, 2)];
    const items = clueItems(runs);
    const end = Math.min(...runs.map(lastReply));
    for (const run of runs) {
      const late = run.turns.filter((t) => t.reply && t.kind !== "ending" && t.turn > (2 * run.input.maxTurns) / 3 && t.turn <= end);
      expect(late.length).toBeGreaterThan(0);
      const mine = items.filter((i) => i.variant === run.from?.variant);
      expect(mine.map((i) => [i.turn, i.slot])).toEqual(late.flatMap((t) => [[t.turn, "player1"], [t.turn, "player2"]]));
      expect(mine.map((i) => i.k)).toEqual(late.flatMap((_, j) => [j + 1, j + 1]));
      expect(mine.every((i) => i.judgeKey === `${run.spec.id}-from${run.from?.turn}-${run.from?.variant}-s1-t${i.turn}-${i.slot}`)).toBe(true);
    }
  });

  it("reads production and the variant only: the fix-and-retest's runs move neither the window nor the items", async () => {
    const runs = [await continued("adopted"), await continued("pacingClues")];
    const retest = { ...(await continued("pacingClues")), turns: [], from: { ...runs[1].from!, variant: "pacingCluesB" as const } };
    expect(clueItems([...runs, retest]).map((i) => i.judgeKey)).toEqual(clueItems(runs).map((i) => i.judgeKey));
    expect(mergePacingCluesRuns([], [retest, runs[1], runs[0]]).map((r) => r.from?.variant)).toEqual(["adopted", "pacingClues", "pacingCluesB"]);
  });

  it("judges each of them at the clue judge's v2, under the arm's key", async () => {
    const runs = [await continued("adopted"), await continued("pacingClues")];
    const items = clueItems(runs);
    const targets = clueJudgeTargets(items);
    expect(targets.map((t) => t.key)).toEqual(items.map((i) => i.judgeKey));
    expect(targets.every((t) => t.check === NEW_MYSTERY_CHECK && t.samples === 1)).toBe(true);
    expect(targets.map((t) => t.armKey)).toEqual(items.map((i) => playthroughArm("beat", 1, i.variant).key));
    expect(cluesJudgeCaseId(targets[0].key, NEW_MYSTERY_CHECK)).toMatch(/^judge-clues-new-v2-/);
  });
});

describe("the blind reading", () => {
  it("codes each run by the salt and names no arm; each late turn under its run's code, in order, each player's text", async () => {
    const runs = [await continued("adopted"), await continued("pacingClues")];
    const md = renderBlindReading(runs, "salt-1");
    for (const word of ["adopted", "pacingClues", "production", "variant", "latePacing", "Luna"]) expect(md).not.toContain(word);
    const codes = runs.map((r) => blindRunCode("salt-1", r));
    expect(new Set(codes).size).toBe(2);
    expect(codes.every((c) => /^[0-9A-F]{5}$/.test(c))).toBe(true);
    expect(blindRunCode("salt-2", runs[0])).not.toBe(codes[0]);
    const items = clueItems(runs);
    for (const item of items) {
      const code = blindItemCode("salt-1", item);
      expect(code).toBe(`${blindRunCode("salt-1", runs.find((r) => r.from?.variant === item.variant)!)}.${item.k}.${item.slot}`);
      expect(md).toContain(`#### ${code.split(".").slice(0, 2).join(".")}\n`);
      expect(md).toContain(`**${code}**`);
    }
    // A run's turns in order
    const [first, second] = items.filter((i) => i.variant === "adopted").map((i) => md.indexOf(`**${blindItemCode("salt-1", i)}**`));
    expect(first).toBeLessThan(second);
  });

  it("its key unblinds each run's code to its story, start, arm and sample", async () => {
    const runs = [await continued("adopted"), await continued("pacingClues", 2)];
    const key = blindKeyFor(runs, "salt-1");
    expect(key.salt).toBe("salt-1");
    expect(key.runs[blindRunCode("salt-1", runs[1])]).toEqual({ story: runs[1].spec.id, from: runs[1].from?.turn, variant: "pacingClues", sample: 2 });
  });
});

describe("the clue readings", () => {
  const row = (variant: "adopted" | "pacingClues", sample: number, pass?: boolean): ClueRow => ({ story: "s", variant, sample, turn: 17, slot: "player1", ...(pass !== undefined ? { pass } : {}) });

  it("count player turns with no new mystery per arm, production's two samples the noise, the stop rule on top; partial and unread left out", () => {
    const rows = [row("adopted", 1, true), row("adopted", 1, false), row("adopted", 2, false), row("adopted", 2, false), row("adopted", 2), row("pacingClues", 1, true), row("pacingClues", 2, true), row("pacingClues", 2, true)];
    const c = clueComparison(rows);
    expect([c.production, c.variant, c.noise]).toEqual([{ hits: 1, n: 4 }, { hits: 3, n: 3 }, 0.5]);
    expect(c.move).toEqual(rateMove({ hits: 1, n: 4 }, { hits: 3, n: 3 }, 0.5));
    expect(c.unread).toEqual({ production: 1, variant: 0 });
  });

  it("unblind the hand verdicts through the key, a code read nowhere left unread", async () => {
    const runs = [await continued("adopted"), await continued("pacingClues")];
    const key = blindKeyFor(runs, "salt-1");
    const items = clueItems(runs);
    const hand = { [blindItemCode("salt-1", items[0])]: { hand: false as const, note: "New: a bell no one rang" } };
    const rows = handRows(items, key, hand);
    expect(rows[0]).toMatchObject({ variant: items[0].variant, turn: items[0].turn, pass: false, note: "New: a bell no one rang" });
    expect(rows.slice(1).every((r) => r.pass === undefined)).toBe(true);
    expect(handRows(items, key, { [blindItemCode("salt-1", items[1])]: { hand: "partial", note: "either way" } })[1].pass).toBeUndefined();
  });
});

describe("the clue judge in this stage", () => {
  it("calibrates v2 on the late-turn items only (the stage plays no ending)", () => {
    expect(PACING_CLUES_CALIBRATION).toEqual(CLUES_CALIBRATION.filter((i) => i.check === NEW_MYSTERY_CHECK));
    expect(PACING_CLUES_CALIBRATION).toHaveLength(25);
  });

  it("judges the stage's turns only once its calibration reads reliable", async () => {
    const targets = clueJudgeTargets(clueItems([await continued("adopted"), await continued("pacingClues")]));
    const agreement = (reliable: boolean): CluesAgreement[] => [
      { check: NEW_MYSTERY_CHECK, decided: 21, agree: 21, falseFails: 0, falsePasses: 0, handPasses: 14, handFails: 7, pairs: 25, pairsAgree: 25, partial: { yes: 0, no: 0 }, reliable },
    ];
    expect(stageJudgeTargets(targets, agreement(true))).toEqual(targets);
    expect(stageJudgeTargets(targets, agreement(false))).toEqual([]);
    expect(stageJudgeTargets(targets, [])).toEqual([]);
  });
});

const DIR = path.resolve("..", "DOCS", "2026-09-26_gpt6-text-eval");
const stored2: PlayRun[] = fs.existsSync(path.join(DIR, "playthroughs-2.json")) ? playthroughRunsFrom(JSON.parse(fs.readFileSync(path.join(DIR, "playthroughs-2.json"), "utf-8"))) : [];
const storedHashes = (() => {
  const file = path.join(DIR, "prep-calls.jsonl");
  if (!fs.existsSync(file)) return new Map<string, string>();
  const records = fs
    .readFileSync(file, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { outputFile?: string; promptHash?: string });
  return new Map(records.flatMap((r) => (r.outputFile && r.promptHash ? [[outputIdOf(r.outputFile), r.promptHash] as [string, string]] : [])));
})();

describe("the space pirates' start (skipped where the output folder is absent)", () => {
  (stored2.length ? it : it.skip)("is the switch where production gave the complete ship a grouped thread, its request the one the run sent; the variant's differs in step b only", () => {
    const run = stored2.find((r) => r.spec.id === "play-space-pirates" && r.sample === 1) as PlayRun;
    const { story, policies } = continuationStart(run, 14);
    const played = run.turns.find((t) => t.turn === 14);
    expect(played?.plan?.kind).toBe("switch plan");
    expect(sha256(playthroughs2Sent({ role: "switch", story }))).toBe(storedHashes.get(outputIdOf(played?.plan?.calls[0]?.outputFile ?? "")));
    // Three threads fit; the scout's own outcome still needs both its milestones; the ship is complete with the chapter
    // that just ended
    expect(chaptersThatFit(turnsLeft(story))).toBe(3);
    expect(outcomeNeeds(story, "player3", true).find((n) => n.id === "player3_scout_private_anchor")?.stillNeeded).toBe(2);
    expect(outcomeNeeds(story, "player1", true).find((n) => n.id === "shared_wayward_comet_ready")?.complete).toBe(true);
    const production = requestText(requestFor("adopted", { role: "switch", story }));
    expect(requestText(requestFor("pacingClues", { role: "switch", story }))).toBe(production.replace(LATE_PACING_TEXT.stepB, LATE_PACING_TEXT.stepBVariantB));
    expect(Object.keys(policies).sort()).toEqual(story.getPlayerSlots().sort());
  });
});
