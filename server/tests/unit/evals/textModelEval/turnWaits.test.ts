import { describe, expect, it } from "@jest/globals";
import { renderResults } from "../../../../src/evals/textModelEval/resultsReport.js";
import { resolveCaps } from "../../../../src/evals/textModelEval/budget.js";
import type { CallRecord } from "../../../../src/evals/textModelEval/runner.js";
import {
  renderTurnWaits,
  renderTurnWaitsBySample,
  turnKindOf,
  turnWaitReadings,
  turnWaitsBySample,
  type TurnKind,
} from "../../../../src/evals/textModelEval/turnWaits.js";
import type { FixedAnalysis } from "../../../../src/evals/textModelEval/cases.js";
import { createMockStoryState } from "../../../helpers/testHelpers.js";
import { switchAnalysisAfterThread, threadAnalysisAfterSwitch } from "../../../helpers/promptStories.js";
import { evalCase, record, tags } from "./fixtures.js";

const MEDIUM = "gpt-6-luna@medium/prod";
const LOW = "gpt-6-luna@low/prod";

describe("turnKindOf: the turn a case measures (turn doc A.C)", () => {
  const fixed = (kind: "switch" | "thread") => ({ kind, phase: {} }) as unknown as FixedAnalysis;

  it("reads a beat case's kind from its tags and its fixed analysis", () => {
    expect(turnKindOf(evalCase("a", "beat", { tags: tags({ firstBeat: true }), fixedAnalysis: fixed("switch") }))).toBe("first turn");
    expect(turnKindOf(evalCase("b", "beat", { tags: tags({ ending: true }) }))).toBe("ending");
    expect(turnKindOf(evalCase("c", "beat", { fixedAnalysis: fixed("switch") }))).toBe("switch turn");
    expect(turnKindOf(evalCase("d", "beat", { fixedAnalysis: fixed("thread") }))).toBe("chapter opening");
    expect(turnKindOf(evalCase("e", "beat"))).toBe("chapter step");
  });

  it("reads a planner case as the turn it plans: a chapter plan opens a chapter, a switch plan at turn 0 is the first turn", () => {
    expect(turnKindOf(evalCase("t", "thread", { state: threadAnalysisAfterSwitch(1).getState() }))).toBe("chapter opening");
    expect(turnKindOf(evalCase("s0", "switch", { state: createMockStoryState() }))).toBe("first turn");
    expect(turnKindOf(evalCase("s", "switch", { state: switchAnalysisAfterThread(1).getState() }))).toBe("switch turn");
    expect(turnKindOf(evalCase("x", "setup"))).toBeUndefined();
  });
});

describe("turnWaitReadings: p95 per turn kind against the turn rounds' allowance", () => {
  const kinds = new Map<string, TurnKind>([
    ["step-1", "chapter step"],
    ["step-2", "chapter step"],
    ["open-1", "chapter opening"],
    ["switch-1", "switch turn"],
    ["plan-t", "chapter opening"],
    ["plan-s", "switch turn"],
    ["mp-first", "first turn"],
  ]);
  const beat = (caseId: string, armKey: string, seconds: number, overrides: Partial<CallRecord> = {}): CallRecord =>
    record({ jobKey: `${caseId}|${armKey}|round0|s1`, promptState: "round0", caseId, armKey, callArmKey: armKey, model: "gpt-6-luna", baseline: false, latencyMs: seconds * 1000, ...overrides });
  const planner = (caseId: string, role: "switch" | "thread", seconds: number) =>
    beat(caseId, LOW, seconds, { role, group: role, jobKey: `${caseId}|${LOW}|round0|s1` });
  const chain = (caseId: string, seconds: number) =>
    beat(caseId, `pipeline:${LOW}>${MEDIUM}`, 30, { group: "pipeline", step: 2, callArmKey: MEDIUM, turnLatencyMs: seconds * 1000 });

  const records = [
    beat("step-1", MEDIUM, 10),
    beat("step-2", MEDIUM, 50),
    // A call that hung until the eval's timeout, then an answer: the hang is counted apart and in no percentile
    beat("step-1", MEDIUM, 300, { jobKey: "step-1|x|round0|s2", sample: 2, attempt: 1, final: false, jobFinal: false, outcome: "timeout" }),
    beat("step-1", MEDIUM, 12, { jobKey: "step-1|x|round0|s2", sample: 2, attempt: 2 }),
    beat("open-1", MEDIUM, 30),
    beat("switch-1", MEDIUM, 30),
    planner("plan-t", "thread", 9),
    planner("plan-s", "switch", 20),
    chain("plan-t", 40),
    beat("mp-first", LOW, 55, { players: 2 }),
  ];
  const readings = turnWaitReadings(records, kinds);
  const row = (armKey: string, kind: TurnKind, players = 1) => readings.find((r) => r.armKey === armKey && r.kind === kind && r.players === players);

  it("holds Luna medium turns to 45 s, reading a turn that waits for nothing else alone", () => {
    expect(row(MEDIUM, "chapter step")).toMatchObject({ turns: 3, turnP95: 50, wait: { p95: 50, source: "turn" }, allowanceS: 45, within: false, hangs: 1 });
  });

  it("reads a chapter opening from the chain that measured planner and turn together, against 60 s (coordinator, 2026-09-28)", () => {
    // A chapter opening may take up to 60 s p95 if no slower than today's form; 45 s stays for every other kind
    expect(row(MEDIUM, "chapter opening")).toMatchObject({ turns: 1, turnP95: 30, wait: { p95: 40, n: 1, source: "chain", planner: LOW }, allowanceS: 60, within: true });
  });

  it("adds the planner's p95 to a switch turn no chain measured (production's planner for the player count)", () => {
    expect(row(MEDIUM, "switch turn")).toMatchObject({ turnP95: 30, wait: { p95: 50, source: "summed", planner: LOW }, allowanceS: 45, within: false });
  });

  it("holds every other arm to 60 s, per player count", () => {
    expect(row(LOW, "first turn", 2)).toMatchObject({ turnP95: 55, wait: { p95: 55, source: "turn" }, allowanceS: 60, within: true });
    expect(row(LOW, "first turn", 1)).toBeUndefined();
  });

  it("leaves the planners and the chains out as arms of their own, and renders a table", () => {
    expect(readings.map((r) => r.armKey).every((key) => key === MEDIUM || key === LOW)).toBe(true);
    const text = renderTurnWaits(readings).join("\n");
    expect(text).toContain("| round0 | gpt-6-luna@medium/prod | 1 | chapter opening | 1 | 30.0 s | 40.0 s (chain, 1) | 60 s | within | 0 | 0 |");
    expect(text).toContain("| round0 | gpt-6-luna@medium/prod | 1 | switch turn | 1 | 30.0 s | 50.0 s (summed with gpt-6-luna@low/prod) | 45 s | over | 0 | 0 |");
  });

  it("appears in results.md when the case kinds are given", () => {
    const text = renderResults({
      records,
      checks: new Map(),
      tags: new Map([...kinds.keys()].map((id) => [id, tags()])),
      caps: resolveCaps({}).caps,
      turnKinds: kinds,
      generatedAt: new Date(0),
    });
    expect(text).toContain("### Turn waits per kind");
    expect(text).toContain("| round0 | gpt-6-luna@low/prod | 2 | first turn | 1 | 55.0 s | 55.0 s (turn) | 60 s | within | 0 | 0 |");
  });
});

describe("a re-sent attempt is part of its turn's wait (turn round 3: B9's output cap cut a runaway, and production re-sends it)", () => {
  const B9 = "gpt-6-luna@medium/turnR3Form";
  const kinds = new Map<string, TurnKind>([["first-1", "first turn"]]);
  const attempt = (sample: number, n: number, seconds: number, outcome: CallRecord["outcome"] = "valid", final = true): CallRecord =>
    record({
      jobKey: `first-1|${B9}|round0|s${sample}`,
      promptState: "round0",
      caseId: "first-1",
      armKey: B9,
      callArmKey: B9,
      model: "gpt-6-luna",
      baseline: false,
      sample,
      attempt: n,
      latencyMs: seconds * 1000,
      outcome,
      final,
      jobFinal: final,
    });
  const records = [
    attempt(1, 1, 20),
    // Cut at the output cap after 67.7 s, then answered in 33.3 s: the player waits for both
    attempt(2, 1, 67.7, "length", false),
    attempt(2, 2, 33.3),
    // A dropped connection is retried after a backoff, not re-sent at once: it stays out of the wait, like a hang
    attempt(3, 1, 0.1, "network-error", false),
    attempt(3, 2, 25),
  ];
  const [row] = turnWaitReadings(records, kinds);

  it("adds the cut attempt's wait to its retry's, and counts the cut apart from the hangs", () => {
    expect(row).toMatchObject({ turns: 3, wait: { source: "turn" }, hangs: 0, cuts: 1 });
    expect(row.turnP95).toBeCloseTo(101, 5);
    expect(row.within).toBe(false);
  });

  it("reads the same whole-job wait per sample", () => {
    const bySample = turnWaitsBySample(records, kinds);
    expect(bySample.find((r) => r.sample === 2)?.p95).toBeCloseTo(101, 5);
    expect(bySample.find((r) => r.sample === 3)?.p95).toBe(25);
  });

  it("renders the cut attempts beside the hung calls", () => {
    const text = renderTurnWaits([row]).join("\n");
    expect(text).toContain("| Hung calls | Cut at the output cap |");
    expect(text).toContain("| round0 | gpt-6-luna@medium/turnR3Form | 1 | first turn | 3 | 101.0 s | 101.0 s (turn) | 45 s | over | 0 | 1 |");
  });
});

describe("turnWaitsBySample: each sample of an arm as its own run, for the drift between runs (turn round 2)", () => {
  const kinds = new Map<string, TurnKind>([
    ["step-1", "chapter step"],
    ["step-2", "chapter step"],
    ["plan-s", "switch turn"],
  ]);
  const at = (minute: number) => new Date(Date.UTC(2026, 8, 28, 10, minute)).toISOString();
  const beat = (caseId: string, sample: number, seconds: number, outputTokens: number, minute: number, overrides: Partial<CallRecord> = {}): CallRecord =>
    record({
      jobKey: `${caseId}|${MEDIUM}|round0|s${sample}`,
      promptState: "round0",
      caseId,
      armKey: MEDIUM,
      callArmKey: MEDIUM,
      model: "gpt-6-luna",
      baseline: false,
      sample,
      latencyMs: seconds * 1000,
      outputTokens,
      startedAt: at(minute),
      ...overrides,
    });
  const records = [
    beat("step-1", 1, 20, 2000, 0),
    beat("step-2", 1, 40, 4000, 5),
    beat("step-1", 4, 30, 2000, 50),
    beat("step-2", 4, 60, 4000, 55),
    // A chain's turn: its wait is the chain's, its pace the turn's own
    beat("plan-s", 1, 25, 2500, 20, { armKey: `pipeline:${LOW}>${MEDIUM}`, group: "pipeline", step: 2, turnLatencyMs: 32_000 }),
  ];
  const rows = turnWaitsBySample(records, kinds);

  it("reads each sample apart: its turns, median and p95, pace per output token and its hours", () => {
    expect(rows.find((r) => r.armKey === MEDIUM && r.sample === 1)).toMatchObject({ kind: "chapter step", turns: 2, p50: 20, p95: 40, msPerToken: 10, from: at(0), to: at(5) });
    expect(rows.find((r) => r.armKey === MEDIUM && r.sample === 4)).toMatchObject({ turns: 2, p50: 30, p95: 60, msPerToken: 15 });
  });

  it("reads a chain by its measured wait", () => {
    expect(rows.find((r) => r.armKey.startsWith("pipeline:"))).toMatchObject({ kind: "switch turn", turns: 1, p95: 32, msPerToken: 10 });
  });

  it("renders a table", () => {
    const text = renderTurnWaitsBySample(rows).join("\n");
    expect(text).toContain("### Turn waits per sample");
    expect(text).toContain("| round0 | gpt-6-luna@medium/prod | 1 | chapter step | 4 | 2 | 30.0 s | 60.0 s | 15.0 | 2026-09-28 10:50-10:55 UTC |");
  });
});
