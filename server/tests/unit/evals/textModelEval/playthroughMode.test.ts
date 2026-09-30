import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { z } from "zod";
import { LEDGER_STAGES, type Caps, type LedgerStage } from "../../../../src/evals/textModelEval/budget.js";
import type { EvalFiles } from "../../../../src/evals/textModelEval/evalFiles.js";
import { sha256, type ExecutedCall } from "../../../../src/evals/textModelEval/executor.js";
import { JUDGE_ARMS } from "../../../../src/evals/textModelEval/judgedChecks.js";
import { DEFAULT_STAGE_CAPS } from "../../../../src/evals/textModelEval/budget.js";
import {
  PLAYTHROUGH_PROMPT_STATE,
  PLAYTHROUGH_ROUNDS,
  judgeTargets,
  measuredCallCosts,
  mergePlayRuns,
  playAndJudge,
  playthroughCall,
  playthroughEstimate,
  playthroughsMode,
  printPlaythroughPlan,
  type ModeCall,
} from "../../../../src/evals/textModelEval/playthroughMode.js";
import { PLAYTHROUGHS, PLAYTHROUGHS_2, playthroughArm, type JudgeTarget, type PlayRun } from "../../../../src/evals/textModelEval/playthroughs.js";
import type { CallRecord } from "../../../../src/evals/textModelEval/runner.js";
import type { PrepContext } from "../../../../src/evals/textModelEval/turnPrep.js";
import { executed, record } from "./fixtures.js";
import { threadAnalysis } from "../../../helpers/textFixtures.js";
import { DEFAULT, fakeCall } from "./playFixtures.js";

/*
 * The --playthroughs mode: each story's calls as prep jobs in the playthroughs
 * stage under adopted4, never past the spend limit even with the four stories
 * in flight at once; the judged stage and ending checks after each story; the
 * estimate the dry run prints; and the files it writes (playthroughs.json and
 * .md, a page per story and an index), --report-only without a call.
 */

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const REQUEST = { prompt: "Plan the next switch.", schema: z.object({ ok: z.boolean() }) };

function context(options: { prep?: CallRecord[]; outcome?: "valid" | "invalid-json" } = {}) {
  const prep: CallRecord[] = [...(options.prep ?? [])];
  const execute = jest.fn(async (): Promise<ExecutedCall> => ({ ...executed(options.outcome ?? "valid"), promptHash: sha256(REQUEST.prompt) }));
  const written: Record<string, unknown> = {};
  const byFile: Record<string, { markdown: string; json: unknown }> = {};
  const pages: Record<string, string> = {};
  const files = {
    readRecords: () => [],
    loadOutput: () => ({ ok: true }),
    readPrepRecords: () => [...prep],
    readProbe: () => undefined,
    readFilterRecords: () => [],
    readPlaythroughs: (base = "playthroughs") => (base === "playthroughs" ? written.json : byFile[base]?.json),
    writePlaythroughs: (markdown: string, json: unknown, base = "playthroughs") => {
      byFile[base] = { markdown, json };
      if (base === "playthroughs") Object.assign(written, { markdown, json });
    },
    writeStoryPage: (name: string, html: string, dir = "stories") => {
      pages[`${dir}/${name}`.replace(/^stories\//, "")] = html;
      return `${dir}/${name}`;
    },
  } as unknown as EvalFiles;
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
  return { ctx, prep, execute, written, byFile, pages, lines };
}

const spec = { kind: "play" as const, caseId: "play-lemonade-s1-001-switch-plan", role: "switch" as const, arm: playthroughArm("switch", 1), players: 1, request: REQUEST };

describe("playthroughCall: the stories' calls in their own stage", () => {
  it("records each call as a play call in the playthroughs stage under adopted4, and gives back its reply, wait, cost and sends", async () => {
    const { ctx, prep } = context();
    const result = await playthroughCall(ctx, 1, 1)(spec);
    expect(result).toMatchObject({ parsed: { ok: true }, latencyMs: 1_000, sends: [expect.objectContaining({ outcome: "valid" })] });
    expect(prep[0]).toMatchObject({ caseId: spec.caseId, armKey: "play>gpt-6-luna@low/adopted", stage: "playthroughs", promptState: "adopted4", group: "prep", sample: 1 });
    expect(PLAYTHROUGH_PROMPT_STATE).toBe("adopted4");
  });

  it("keeps a re-sent reply's attempts, and gives back no reply where production could use none", async () => {
    const { ctx } = context({ outcome: "invalid-json" });
    const result = await playthroughCall(ctx, 1, 1)(spec);
    expect(result.parsed).toBeUndefined();
    expect(result.sends).toHaveLength(3);
  });

  it("records round 2's calls in its own stage under its own tag: production's current code", async () => {
    const round = PLAYTHROUGH_ROUNDS[2];
    expect(round).toMatchObject({ round: 2, stage: "playthroughs-2", promptState: "adopted7", fileBase: "playthroughs-2", pagesDir: "stories/round2", tryAgain: 1, report: "2026-09-30_playthroughs-2-report.md" });
    expect(round.specs).toBe(PLAYTHROUGHS_2);
    expect(PLAYTHROUGH_ROUNDS[1]).toMatchObject({ round: 1, stage: "playthroughs", promptState: PLAYTHROUGH_PROMPT_STATE, fileBase: "playthroughs", pagesDir: "stories", tryAgain: 0 });
    expect(DEFAULT_STAGE_CAPS[round.stage]).toBe(1.2);
    const { ctx, prep } = context();
    await playthroughCall(ctx, 1, 1, round)(spec);
    expect(prep[0]).toMatchObject({ caseId: spec.caseId, stage: "playthroughs-2", promptState: "adopted7" });
  });

  it("sends nothing past the spend limit, and says so", async () => {
    const { ctx, execute, lines } = context();
    const result = await playthroughCall(ctx, 1, 0)(spec);
    expect(execute).not.toHaveBeenCalled();
    expect(result.notSent).toMatch(/spend limit/);
    expect(lines.join("\n")).toMatch(/not sent/);
  });
});

describe("the judged checks after each story", () => {
  const target = (kind: "stage" | "ending", key: string): JudgeTarget => ({ key, kind, turn: kind === "stage" ? 2 : 11, label: kind === "stage" ? "player1_main" : "player1", request: REQUEST });

  it("judges each chapter's stage and each player's ending once, on Luna low, reading the verdict, the evidence and its lines", async () => {
    const calls: Parameters<ModeCall>[0][] = [];
    const call: ModeCall = async (s) => {
      calls.push(s);
      const parsed =
        s.role === "thread"
          ? { stages: ["find the ferry", "win it"], staysWithinStage: { evidence: "Step 3 asks how to win it.", answer: "no" } }
          : { outcomes: [{ outcomeId: "player1_main", told: "resolved", quote: "the ferry is ours" }], outcomesToldAsLeft: { evidence: "fine", answer: "yes" } };
      return { parsed, latencyMs: 500, costUsd: 0.0003, sends: [] };
    };
    const items = await judgeTargets([target("stage", "play-lemonade-s1-t2-0"), target("ending", "play-lemonade-s1-t11-player1")], call);
    expect(calls.map((c) => [c.kind, c.caseId, c.arm.key])).toEqual([
      ["judge", "judge-play-stage-v2-play-lemonade-s1-t2-0", JUDGE_ARMS[0].key],
      ["judge", "judge-play-ending-v1-play-lemonade-s1-t11-player1", JUDGE_ARMS[0].key],
    ]);
    expect(items).toEqual([
      { key: "play-lemonade-s1-t2-0", kind: "stage", turn: 2, label: "player1_main", verdict: false, evidence: "Step 3 asks how to win it.", lines: ["find the ferry", "win it"], costUsd: 0.0003 },
      { key: "play-lemonade-s1-t11-player1", kind: "ending", turn: 11, label: "player1", verdict: true, evidence: "fine", lines: ['player1_main: resolved ("the ferry is ours")'], costUsd: 0.0003 },
    ]);
  });

  it("judges each option set at an exploration step and each chapter plan's results with the choice-result stage's calibrated checks", async () => {
    const calls: Parameters<ModeCall>[0][] = [];
    const call: ModeCall = async (s) => {
      calls.push(s);
      const parsed =
        s.role === "beat"
          ? { options: [{ option: 1, carriesOut: "1", why: "same" }, { option: 2, carriesOut: "none", why: "asks" }], optionsFollowResults: { evidence: "Option 2 asks.", answer: "no" } }
          : { results: [{ thread: 1, step: 1, result: "favorable", label: "outcome", why: "turns out" }], resultsFitKind: { evidence: "All outcomes.", answer: "yes" } };
      return { parsed, latencyMs: 400, costUsd: 0.0005, sends: [] };
    };
    const items = await judgeTargets(
      [
        { key: "play-lemonade-s1-t3-player1", kind: "options", turn: 3, label: "player1", request: REQUEST },
        { key: "play-lemonade-s1-t2", kind: "results", turn: 2, label: "player1_main", request: REQUEST },
      ],
      call
    );
    expect(calls.map((c) => [c.caseId, c.role, c.outputTokens])).toEqual([
      ["judge-play-options-v1-play-lemonade-s1-t3-player1", "beat", 500],
      ["judge-play-results-v1-play-lemonade-s1-t2", "thread", 900],
    ]);
    expect(items).toEqual([
      { key: "play-lemonade-s1-t3-player1", kind: "options", turn: 3, label: "player1", verdict: false, evidence: "Option 2 asks.", lines: ["option 1 → 1 (same)", "option 2 → none (asks)"], costUsd: 0.0005 },
      { key: "play-lemonade-s1-t2", kind: "results", turn: 2, label: "player1_main", verdict: true, evidence: "All outcomes.", lines: ["thread 1 step 1 favorable: outcome (turns out)"], costUsd: 0.0005 },
    ]);
  });

  it("plays a story and judges it, the judges after the story's last turn", async () => {
    const { call: play } = fakeCall(1);
    const kinds: string[] = [];
    const call: ModeCall = async (s) => {
      kinds.push(s.kind);
      if (s.kind === "judge") return { parsed: { stages: [], staysWithinStage: { evidence: "ok", answer: "yes" }, outcomes: [], outcomesToldAsLeft: { evidence: "ok", answer: "yes" } }, latencyMs: 1, costUsd: 0, sends: [] };
      return (await play(s)) ?? { latencyMs: 0, costUsd: 0, sends: [] };
    };
    const run = await playAndJudge(PLAYTHROUGHS[0], call, { sample: 1 });
    expect(run.complete).toBe(true);
    expect(run.judged?.map((j) => [j.kind, j.verdict])).toEqual([
      ["stage", true],
      ["results", undefined],
      ["results", undefined],
      ["ending", true],
    ]);
    expect(kinds.slice(-4)).toEqual(["judge", "judge", "judge", "judge"]);
    expect(kinds.filter((k) => k === "play").length).toBe(16);
  });
});

describe("a turn production failed", () => {
  it("is sent as production sends it: the queue's resend, then in round 2 the player's Try again and its resend; the run is marked with its round", async () => {
    const unusable = { ...threadAnalysis("challenge", 4, 0, ["player1"]), threads: [{ ...threadAnalysis("challenge", 4, 0, ["player1"]).threads[0], outcomeId: "no_such_outcome" }] };
    const judged: ModeCall = async () => ({ latencyMs: 0, costUsd: 0, sends: [] });
    const playWith = (fails: number) => {
      const { call: play } = fakeCall(1, { reply: (role, nth) => (role === "thread" && nth < fails ? unusable : DEFAULT) });
      return (async (s) => (s.kind === "judge" ? judged(s) : ((await play(s)) ?? { latencyMs: 0, costUsd: 0, sends: [] }))) as ModeCall;
    };
    // Three failed sends (a call and its retry each): round 2's player presses Try again, whose resend works
    const run = await playAndJudge(PLAYTHROUGHS_2[0], playWith(6), { sample: 1 }, undefined, PLAYTHROUGH_ROUNDS[2]);
    expect(run.complete).toBe(true);
    expect(run.round).toBe(2);
    expect(run.turns[1].failedSends?.map((s) => s.send)).toEqual(["first", "resend", "try again"]);
    // Round 1's rules press nothing: the story waits at the notice
    const stuck = await playAndJudge(PLAYTHROUGHS[0], playWith(6), { sample: 1 });
    expect(stuck.complete).toBe(false);
    expect(stuck.round).toBe(1);
  });
});

describe("the estimate the dry run prints", () => {
  it("counts a story's calls from its length (a setup, every turn with the ending, a switch and a chapter plan per chapter of 3 to 5 turns) and prices them from measured costs", () => {
    const costs = { setup: 0.007, beat: 0.0034, switch: 0.0011, thread: 0.0014 };
    const long = playthroughEstimate(PLAYTHROUGHS[1], () => costs);
    expect(long.calls).toEqual({ min: 37, typical: 39, max: 43 });
    expect(long.usd).toBeCloseTo(0.007 + 26 * 0.0034 + 6 * (0.0011 + 0.0014));
    const short = playthroughEstimate(PLAYTHROUGHS[0], () => costs);
    expect(short.calls).toEqual({ min: 16, typical: 18, max: 18 });
  });

  it("prints round 2's six stories with the judged checks, the stage's cap and its spend so far", () => {
    const lines: string[] = [];
    const files = { readRecords: () => [], readPlaythroughs: () => undefined, readPrepRecords: () => [] } as unknown as EvalFiles;
    printPlaythroughPlan(files, (line) => lines.push(line), PLAYTHROUGH_ROUNDS[2]);
    const text = lines.join("\n");
    expect(text).toContain("stage playthroughs-2, cap $1.2, under adopted7");
    for (const p of PLAYTHROUGHS_2) expect(text).toContain(`  ${p.id}: `);
    expect(text).toMatch(/All six: est \$\d\.\d{3} before retries, plus the judged checks \(about \d+ calls, about \$0\.\d{2}\)/);
  });

  it("reads the measured cost of production's own calls per arm, role and player count", () => {
    const records = [
      record({ callArmKey: "gpt-6-luna@medium/adopted", role: "beat", players: 1, promptState: "adopted1", costUsd: 0.003 }),
      record({ callArmKey: "gpt-6-luna@medium/adopted", role: "beat", players: 1, promptState: "adopted3", costUsd: 0.005 }),
      record({ callArmKey: "gpt-6-luna@medium/prod", role: "beat", players: 1, promptState: "round0", costUsd: 0.1 }),
    ];
    const costs = measuredCallCosts(records);
    expect(costs(1).beat).toBeCloseTo(0.004);
    // No record for the group turn model: the final check's measured cost stands in
    expect(costs(3).beat).toBeCloseTo(0.0055);
  });
});

describe("the files: playthroughs.json and .md, a page per story and an index", () => {
  const run = (id: string, sample = 1) => ({ spec: PLAYTHROUGHS.find((p) => p.id === id), sample, input: { playerCount: 1, maxTurns: 10, premise: "p", gameMode: "singlePlayer" }, turns: [], stopped: "x", complete: false }) as unknown as PlayRun;

  it("replaces a story and sample played again, keeps the others, in the stories' order", () => {
    const merged = mergePlayRuns([run("play-avalon"), run("play-lemonade")], [{ ...run("play-lemonade"), stopped: "again" }, run("play-lemonade", 2)]);
    expect(merged.map((r) => [r.spec.id, r.sample, r.stopped])).toEqual([
      ["play-lemonade", 1, "again"],
      ["play-lemonade", 2, "x"],
      ["play-avalon", 1, "x"],
    ]);
  });

  it("--report-only renders the file's stories without a call", async () => {
    const { ctx, execute, written, pages } = context();
    const { call } = fakeCall(1);
    const played = await playAndJudge(PLAYTHROUGHS[0], async (s) => (s.kind === "judge" ? { latencyMs: 0, costUsd: 0, sends: [] } : ((await call(s)) ?? { latencyMs: 0, costUsd: 0, sends: [] })), { sample: 1 });
    written.json = { runs: [played] };
    await playthroughsMode(ctx, { sample: 1, reportOnly: true });
    expect(execute).not.toHaveBeenCalled();
    expect(Object.keys(pages).sort()).toEqual(["index.html", "play-lemonade.html"]);
    expect(String(written.markdown)).toContain("## play-lemonade (sample 1)");
    expect((written.json as { runs: PlayRun[] }).runs).toHaveLength(1);
  });

  it("writes round 2 to its own files and pages (playthroughs-2, stories/round2), leaving round 1's as they are", async () => {
    const { ctx, written, byFile, pages } = context();
    const { call } = fakeCall(1);
    const played = await playAndJudge(PLAYTHROUGHS_2[0], async (s) => (s.kind === "judge" ? { latencyMs: 0, costUsd: 0, sends: [] } : ((await call(s)) ?? { latencyMs: 0, costUsd: 0, sends: [] })), { sample: 1 }, undefined, PLAYTHROUGH_ROUNDS[2]);
    byFile["playthroughs-2"] = { markdown: "", json: { runs: [played] } };
    await playthroughsMode(ctx, { sample: 1, reportOnly: true, round: PLAYTHROUGH_ROUNDS[2] });
    expect(written.json).toBeUndefined();
    expect(Object.keys(pages).sort()).toEqual(["round2/index.html", "round2/play-lemonade.html"]);
    expect(byFile["playthroughs-2"].markdown).toContain("# Whole-story playthroughs on production's own code, round 2");
    expect(pages["round2/index.html"]).toContain("Round 2");
  });
});
