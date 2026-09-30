import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { BeatOption } from "core/types/index.js";
import { readStory, renderPlaythroughReadings } from "../../../../src/evals/textModelEval/playthroughChecks.js";
import { PLAYTHROUGHS, playStory, type PlayRun } from "../../../../src/evals/textModelEval/playthroughs.js";
import { beatSet, switchAnalysis, threadAnalysis } from "../../../helpers/textFixtures.js";
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

  it("reads the threads that fit from the turns left with production's count, and says where the planner was told another", async () => {
    const run = await played();
    // A run recorded before the count's fix: the switch at turn 6 of 10 (5 turns left) was told 1, the right count; say it was told 0
    const told = structuredClone(run);
    const plan = told.turns.find((t) => t.turn === 6)?.plan;
    if (!plan) throw new Error("no switch plan at turn 6");
    plan.pacing.threadsFit = 0;
    const reading = readStory(told).latePacing.find((p) => p.turn === 6);
    expect(reading).toMatchObject({ threadsFit: 1, toldFit: 0, stillNeeded: 2, binding: true });
    expect(readStory(run).latePacing.find((p) => p.turn === 6)?.toldFit).toBeUndefined();
    expect(renderPlaythroughReadings([told], new Date(0))).toMatch(/\| 6 \| 1 \(told 0\) \| 2 \| yes \|/);
  });

  describe("group chapters: whose choice decided each step, and whether each player's switch pick was followed", () => {
    // Both players in the second chapter, an exploration chapter on player2's own outcome (the first must be on a shared
    // one); exploration choices rotate, each seat offset, so they choose differently
    const onPlayer2 = () =>
      played(2, {
        reply: (role, nth) => {
          if (role !== "thread" || nth !== 1) return DEFAULT;
          const plan = threadAnalysis("exploration", 4, 0, ["player1", "player2"]);
          return { ...plan, threads: [{ ...plan.threads[0], outcomeId: "player2_main", title: "Luz's Promise" }] };
        },
      });

    it("lists each step of a group exploration thread with every player's choice, the result the game used and the outcome's owner", async () => {
      const readings = readStory(await onPlayer2());
      const steps = readings.groupSteps.filter((s) => s.chapter === 2);
      expect(steps.map((s) => s.turn)).toEqual([7, 8, 9, 10]);
      const [first] = steps;
      expect(first.picks[0].resolution).not.toBe(first.picks[1].resolution);
      expect(first).toMatchObject({ kind: "exploration", outcomeId: "player2_main", owner: "player2", thread: "Luz's Promise" });
      expect(first.picks.map((p) => p.slot)).toEqual(["player1", "player2"]);
      // The owner's choice decides a thread on their own outcome (production since 2026-09-30)
      expect(first.result).toBe(first.picks[1].resolution);
      expect(first.ownerOverridden).toBe(false);
      expect(readings.groupSteps.filter((s) => s.ownerOverridden)).toEqual([]);
    });

    it("flags a step where the game used another player's choice on the owner's own outcome (production before 2026-09-30)", async () => {
      const run = await onPlayer2();
      const overridden = structuredClone(run);
      const phase = overridden.end?.storyPhases.find((p) => "threads" in p && p.firstBeatIndex === 6);
      if (!phase || !("threads" in phase)) throw new Error("no second chapter");
      const firstPick = run.turns.find((t) => t.turn === 7)?.picks.find((p) => p.slot === "player1")?.resolution;
      phase.threads[0].progression[0].resolution = firstPick as never;
      const readings = readStory(overridden);
      expect(readings.groupSteps.find((s) => s.turn === 7)).toMatchObject({ result: firstPick, ownerOverridden: true });
      expect(renderPlaythroughReadings([overridden], new Date(0))).toMatch(/### Group chapters: whose choice decided each step[\s\S]*\| 7 \| 2 \|[^\n]*player2_main \(player2\)[^\n]*\| yes \|/);
    });

    it("lists each group player's switch pick against the thread they were planned into", async () => {
      // A topic switch where player2 picks their own outcome, then a chapter putting both players on the shared one
      const switchWithPicks = () => {
        const base = switchAnalysis(["player1", "player2"]);
        const directions = [
          { direction: "Guard the harbour", outcomeId: "shared_harbour" },
          { direction: "Mend the harbour nets", outcomeId: "shared_harbour" },
          { direction: "Chase your own lead", outcomeId: "player2_main" },
        ];
        return { ...base, switches: [{ ...base.switches[0], topicChoices: directions.map((d) => `${d.direction} (${d.outcomeId})`), topicDirections: directions }] };
      };
      const readings = readStory(await played(2, { reply: (role, nth) => (role === "switch" && nth === 1 ? switchWithPicks() : DEFAULT) }));
      // The first chapter groups every player by rule; the second follows switch turn 6, where the seats' rotations pick
      // directions 2 (player1, the shared outcome) and 3 (player2, their own), and the fake plans both on the shared one
      const second = readings.switchPicks.filter((p) => p.turn === 7);
      expect(second.map((p) => [p.slot, p.pickedOutcome, p.placedOn, p.kept])).toEqual([
        ["player1", "shared_harbour", "shared_harbour", true],
        ["player2", "player2_main", "shared_harbour", false],
      ]);
      expect(readings.switchPicks.some((p) => p.turn === 2)).toBe(false);
      expect(renderPlaythroughReadings([await played(2, { reply: (role, nth) => (role === "switch" && nth === 1 ? switchWithPicks() : DEFAULT) })], new Date(0))).toMatch(
        /Switch picks not followed: turn 7, player2 picked player2_main, planned on shared_harbour/
      );
    });
  });

  it("counts one shared change that pays two players' sacrifices once, not as two paid levers", async () => {
    const shared: BeatOption = { optionType: "challenge", resourceType: "sacrifice", riskType: "normal", text: "Spend 10 Supplies to charge", basePoints: 30, modifiersToSuccessRate: [] };
    const readings = readStory(
      await played(2, {
        chapterOptions: () => [leverSet()[0], leverSet()[1], shared],
        statChanges: [{ type: "statChange", group: "shared", stat: "shared_supplies", change: "subtractNumber", value: 2 }],
      })
    );
    // Both seats take the sacrifice at the same turns, and one change of Supplies follows each time
    expect(readings.leversPaid.sharedOnce.length).toBeGreaterThan(0);
    expect(readings.leversPaid.sharedOnce[0]).toMatchObject({ stat: "Supplies", slots: ["player1", "player2"] });
    expect(readings.leversPaid.counts.sharedOnce).toBe(readings.leversPaid.sharedOnce.length);
    expect(readings.leversPaid.counts.applied).toBe(readings.leversPaid.sharedOnce.length);
  });

  it("lists the turns whose wait is left out, and the one-paragraph retries whose second reply was one paragraph too", async () => {
    const { run } = await playStory(
      PLAYTHROUGHS[0],
      input(1),
      fakeCall(1, {
        reply: (role, nth) => {
          if (role === "thread" && nth <= 1) {
            const plan = threadAnalysis("challenge", 4, 0, ["player1"]);
            return { ...plan, threads: [{ ...plan.threads[0], outcomeId: "no_such_outcome" }] };
          }
          if (role === "beat" && (nth === 3 || nth === 4)) return beatSet(1, { player1: { ...beatSet(1).player1, text: "One short paragraph.", options: leverSet() } } as never);
          return DEFAULT;
        },
      }).call,
      { sample: 1, retryFailedTurns: 2 }
    );
    const readings = readStory(run);
    expect(readings.waitsLeftOut).toEqual([2]);
    expect(readings.repairs.shortTextRetries).toEqual([4]);
    expect(readings.repairs.shortTextUsedAsIs).toEqual([4]);
    const text = renderPlaythroughReadings([run], new Date(0));
    expect(text).toContain("left out of the waits (production would have stopped there): turn 2");
    expect(text).toContain("one-paragraph turns retried: 4 (the retry was one paragraph too, and was used: 4)");
  });

  it("lists the turns retried for a beat without options apart from the one-paragraph retries", async () => {
    const run = await played(1, { reply: (role, nth) => (role === "beat" && nth === 3 ? beatSet(1, { player1: { ...beatSet(1).player1, options: [] } } as never) : DEFAULT) });
    const readings = readStory(run);
    expect(readings.repairs.optionsRetries).toEqual([4]);
    expect(readings.repairs.shortTextRetries).toEqual([]);
    expect(readings.repairs.shortTextUsedAsIs).toEqual([]);
    expect(renderPlaythroughReadings([run], new Date(0))).toContain("turns without options retried: 4");
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
