import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { BeatOption } from "core/types/index.js";
import { readStory, renderPlaythroughReadings } from "../../../../src/evals/textModelEval/playthroughChecks.js";
import { PLAYTHROUGHS, playStory, type PlayRun } from "../../../../src/evals/textModelEval/playthroughs.js";
import { threadAnalysis } from "../../../helpers/textFixtures.js";
import { DEFAULT, fakeCall, input, leverSet, type Overrides } from "./playFixtures.js";

/*
 * What the code checks on a whole played story: it ends on its turn count;
 * each chapter's length is one PACING allows and its milestone lands on its
 * outcome, stage by stage; the late switches push outcomes that still need
 * milestones; sacrifices and rewards per chapter against the owner's rule
 * (at most one reward; a second sacrifice needs a strong reason, read by
 * hand); every lever the player took is paid; stat changes fit their stats;
 * what production's repairs and retries did; the ending's outcomes as their
 * milestones leave them; waits per turn kind; cost.
 */

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function played(players: 1 | 2 = 1, overrides: Overrides = {}, maxTurns = 10): Promise<PlayRun> {
  const { run } = await playStory(PLAYTHROUGHS[players === 1 ? 0 : 2], input(players, maxTurns), fakeCall(players, overrides).call, { sample: 1 });
  return run;
}

describe("readStory", () => {
  it("reads a well-paced story: it ends on its turn count, each chapter's length is allowed and its milestone lands stage by stage", async () => {
    const readings = readStory(await played());
    expect(readings.endsOnTurnCount).toEqual({ ok: true, turnsBeforeEnding: 10, maxTurns: 10, endingTurn: 11 });
    expect(readings.chapters.map((c) => [c.index, c.firstTurn, c.lastTurn, c.duration, c.lengthAllowed, c.lastChapter])).toEqual([
      [1, 2, 5, 4, true, false],
      [2, 7, 10, 4, true, true],
    ]);
    expect(readings.chapters[0].threads[0]).toMatchObject({ outcomeId: "player1_main", stage: 1, of: 2, milestoneTurn: 6, milestoneText: "The ferry is ours.", milestoneLanded: true });
    expect(readings.chapters[1].threads[0]).toMatchObject({ stage: 2, of: 2, lastStage: true, milestoneTurn: 11, milestoneLanded: true });
    expect(readings.chapters[0].threads[0].resolution).toBeTruthy();
    const main = readings.outcomes.find((o) => o.id === "player1_main");
    expect(main).toMatchObject({ intended: 2, complete: true, problems: [] });
    expect(main?.milestones.map((m) => [m.turn, m.chapter])).toEqual([
      [6, 1],
      [11, 2],
    ]);
    expect(readings.outcomes.find((o) => o.id === "player1_side")).toMatchObject({ intended: 1, complete: false, milestones: [] });
    // The ending as production's ending reads the outcomes: the main one complete, the side one unfinished
    expect(readings.ending?.states.map((s) => [s.id, s.complete, s.milestones, s.intended])).toEqual([
      ["player1_main", true, 2, 2],
      ["player1_side", false, 0, 1],
    ]);
  });

  it("reads a story that overruns its length: a chapter length PACING doesn't allow, retried once and used, and the ending late", async () => {
    const readings = readStory(await played(1, { length: 3 }));
    expect(readings.endsOnTurnCount).toMatchObject({ ok: false, turnsBeforeEnding: 12, maxTurns: 10, endingTurn: 13 });
    const second = readings.chapters[1];
    expect(second).toMatchObject({ firstTurn: 6, duration: 3, allowedLengths: [2], lengthAllowed: false });
    expect(readings.repairs.planRetries).toEqual([expect.objectContaining({ turn: 6, kind: "chapter plan", lengthProblem: expect.stringMatching(/PACING allows 2 beats/) })]);
  });

  it("counts sacrifices and rewards per chapter against the owner's rule, and every one the player took", async () => {
    const readings = readStory(await played());
    const [first] = readings.chapters;
    expect(first.levers).toEqual([expect.objectContaining({ slot: "player1", sets: 4, sacrificeSets: 4, rewardSets: 0, sacrificeTurns: [2, 3, 4, 5], rewardTurns: [] })]);
    // The player takes a lever whenever offered, never twice in a row: turns 2 and 4
    expect(first.levers[0].taken).toEqual([
      { turn: 2, kind: "sacrifice" },
      { turn: 4, kind: "sacrifice" },
    ]);
    expect(readings.leverFlags).toContainEqual({ chapter: 1, slot: "player1", rule: "second sacrifice", turns: [3, 4, 5] });
    const reward: BeatOption = { optionType: "challenge", resourceType: "reward", riskType: "normal", text: "Take the harbour master's coin, gain 10 Supplies", basePoints: -30, modifiersToSuccessRate: [] };
    const rewards = readStory(await played(1, { chapterOptions: () => [leverSet()[0], leverSet()[1], reward] }));
    expect(rewards.leverFlags).toContainEqual({ chapter: 1, slot: "player1", rule: "second reward", turns: [3, 4, 5] });
  });

  it("reads whether each sacrifice or reward the player took was paid, and the stat changes that don't fit their stat", async () => {
    const unpaid = readStory(await played());
    expect(unpaid.leversPaid.counts).toMatchObject({ applied: 0, notApplied: 4 });
    expect(unpaid.leversPaid.missed[0]).toMatchObject({ turn: 3, slot: "player1", kind: "sacrifice", stat: "Courage", status: "notApplied" });
    // A turn that lowers Courage pays the sacrifice (a little each turn, so the stat never bottoms out at 0)
    const paid = readStory(await played(1, { statChanges: [{ type: "statChange", group: "player1", stat: "player_courage", change: "subtractNumber", value: 2 }] }));
    expect(paid.leversPaid.counts.applied).toBe(4);
    expect(paid.leversPaid.missed).toEqual([]);
    const misfit = readStory(await played(1, { statChanges: [{ type: "statChange", group: "shared", stat: "shared_supplies", change: "setString", value: "Plenty" }] }));
    expect(misfit.unfit.length).toBeGreaterThan(0);
    expect(misfit.unfit[0]).toMatchObject({ name: "Supplies", kinds: [expect.stringMatching(/cantApply/)] });
  });

  it("lists the turns production could not get past, where the harness asked the planner again", async () => {
    const { run } = await playStory(
      PLAYTHROUGHS[0],
      input(1),
      fakeCall(1, {
        reply: (role, nth) => {
          if (role !== "thread" || nth > 1) return DEFAULT;
          const plan = threadAnalysis("challenge", 4, 0, ["player1"]);
          return { ...plan, threads: [{ ...plan.threads[0], outcomeId: "no_such_outcome" }] };
        },
      }).call,
      { sample: 1, retryFailedTurns: 2 }
    );
    const readings = readStory(run);
    expect(readings.repairs.stuckTurns).toEqual([{ turn: 2, kind: "chapter plan", failure: expect.stringMatching(/usable thread plan/), rounds: 1 }]);
    expect(renderPlaythroughReadings([run], new Date(0))).toMatch(/production would have stopped at: turn 2/);
  });

  it("lists the plan design checks that failed, with the turn of each plan", async () => {
    const doubled = () => {
      const plan = threadAnalysis("challenge", 4, 0, ["player1"]);
      const [first] = plan.threads;
      const steps = [first.progression[0], first.progression[1], { ...first.progression[2], title: "The Last Push" }, { ...first.progression[3], title: "The Last Push" }];
      return { ...plan, threads: [{ ...first, outcomeId: "player1_main", progression: steps }] };
    };
    const readings = readStory(await played(1, { reply: (role, nth) => (role === "thread" && nth === 0 ? doubled() : DEFAULT) }));
    expect(readings.planCheckFailures.stepsOnce).toEqual([2]);
    expect(renderPlaythroughReadings([await played(1, { reply: (role, nth) => (role === "thread" && nth === 0 ? doubled() : DEFAULT) })], new Date(0))).toMatch(/### Plan design checks that failed[\s\S]*stepsOnce: turns 2/);
  });

  it("lists the repairs production made, the retries it sent and the re-sends", async () => {
    const readings = readStory(await played());
    // The fake's exploration options on chapter steps are retyped nowhere; its switch options are exploration already
    expect(readings.repairs.planRetries).toEqual([]);
    expect(readings.repairs.shortTextRetries).toEqual([]);
    expect(readings.repairs.resends).toEqual([]);
    expect(readings.repairs.setupRetries).toBe(0);
    expect(readings.repairs.stuckTurns).toEqual([]);
  });

  it("reads waits per turn kind against their allowances, and the story's cost", async () => {
    const readings = readStory(await played(1, { latencyMs: 20_000 }));
    const byKind = Object.fromEntries(readings.waits.map((w) => [w.kind, w]));
    expect(byKind["chapter opening"]).toMatchObject({ turns: 2, maxS: 40, allowanceS: 60, over: [] });
    expect(byKind["chapter step"]).toMatchObject({ turns: 6, p50S: 20, allowanceS: 45 });
    expect(byKind["switch turn"]).toMatchObject({ turns: 1, maxS: 40, allowanceS: 45 });
    expect(byKind["first turn"].over).toEqual([]);
    // Groups have 60 s everywhere
    const group = readStory(await played(2, { latencyMs: 50_000 }));
    expect(group.waits.find((w) => w.kind === "chapter step")).toMatchObject({ allowanceS: 60, over: [] });
    expect(group.waits.find((w) => w.kind === "first turn")?.over).toEqual([1]);
    // 1 setup and 15 story calls at $0.001 each
    expect(readings.cost.storyUsd).toBeCloseTo(0.016);
    expect(readings.cost.calls).toBe(16);
  });

  it("reads each switch's late pacing: whether it binds, and whether its directions push outcomes that still need milestones", async () => {
    // Ten turns fit two chapters and then one, against three and then two milestones still needed: both switches bind
    const readings = readStory(await played());
    expect(readings.latePacing.map((p) => [p.turn, p.threadsFit, p.stillNeeded, p.binding])).toEqual([
      [1, 2, 3, true],
      [6, 1, 2, true],
    ]);
    // The fake's switch pushes only the main outcome, so the untouched side outcome is never offered
    expect(readings.latePacing[1]).toMatchObject({ nextOutcomes: ["player1_main"], nextNeeded: true });
    expect(readings.latePacing[1].checks.lateOffersUntouched).toBe(false);
    // A 25-turn story with room for every milestone never binds
    const long = readStory(await played(1, {}, 25));
    expect(long.latePacing.some((p) => p.binding)).toBe(false);
  });

  it("renders the readings as markdown, a section per story", async () => {
    const run = await played();
    const text = renderPlaythroughReadings([run], new Date("2026-09-30T12:00:00Z"));
    for (const heading of ["# Whole-story playthroughs", "## play-lemonade (sample 1)", "### Chapters", "### Sacrifices and rewards", "### Waits", "### Repairs and retries", "### The ending"]) {
      expect(text).toContain(heading);
    }
    expect(text).toContain("ends on its turn count: yes (10 turns, then the ending at turn 11)");
  });
});
