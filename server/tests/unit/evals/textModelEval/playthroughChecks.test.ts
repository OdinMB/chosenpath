import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { BeatOption } from "core/types/index.js";
import { ownStatsLine, readStory, renderPlaythroughReadings } from "../../../../src/evals/textModelEval/playthroughChecks.js";
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

  it("lists the turns production could not get past in a run stored before its resend, where the harness asked the planner again (round 1)", async () => {
    const run = structuredClone(await played());
    const plan = run.turns[1].plan;
    if (!plan) throw new Error("no chapter plan at turn 2");
    plan.failedRounds = [{ calls: plan.calls, failure: "No usable thread plan: unknown outcome" }];
    const readings = readStory(run);
    expect(readings.repairs.stuckTurns).toEqual([{ turn: 2, kind: "chapter plan", failure: expect.stringMatching(/usable thread plan/), rounds: 1 }]);
    expect(readings.waitsLeftOut).toEqual([2]);
    expect(renderPlaythroughReadings([run], new Date(0))).toMatch(/production would have stopped at: turn 2/);
  });

  const unusable = () => {
    const plan = threadAnalysis("challenge", 4, 0, ["player1"]);
    return { ...plan, threads: [{ ...plan.threads[0], outcomeId: "no_such_outcome" }] };
  };

  it("lists the turns production sent again, and those where the players saw the failure notice and pressed Try again", async () => {
    // Turn 2's chapter plan fails in its first send; turn 7's in the first send and its resend
    const { run } = await playStory(
      PLAYTHROUGHS[0],
      input(1),
      fakeCall(1, { reply: (role, nth) => (role === "thread" && (nth <= 1 || (nth >= 3 && nth <= 6)) ? unusable() : DEFAULT) }).call,
      { sample: 1, tryAgain: 1 }
    );
    expect(run.complete).toBe(true);
    const readings = readStory(run);
    expect(readings.repairs.resentTurns).toEqual([
      { turn: 2, kind: "chapter opening", failed: ["first"], sentBy: "resend", tryAgain: false, failures: [expect.stringMatching(/usable thread plan/)] },
      { turn: 7, kind: "chapter opening", failed: ["first", "resend"], sentBy: "try again", tryAgain: true, failures: [expect.stringMatching(/usable thread plan/), expect.stringMatching(/usable thread plan/)] },
    ]);
    // A turn the queue's resend saved counts in the waits, every send included; one the players had to send again does not
    expect(readings.waitsLeftOut).toEqual([7]);
    expect(readings.waits.find((w) => w.kind === "chapter opening")).toMatchObject({ turns: 1, maxS: 4 });
    const text = renderPlaythroughReadings([run], new Date(0));
    expect(text).toContain("- turns production sent again: turn 2 (the first send failed");
    expect(text).toMatch(/turn 7 \(the first send and its resend failed[^)]*; the players saw the failure notice and pressed Try again/);
    expect(text).toContain("Turns left out of the waits (the players were told the turn failed, or production could not get past it): turn 7.");
  });

  it("reads whether each player's own stats moved over the story", async () => {
    const still = readStory(await played());
    expect(still.ownStats).toEqual([{ slot: "player1", stat: "player_courage", name: "Courage", start: expect.any(Number), end: expect.any(Number), changedAt: [] }]);
    const moving = readStory(await played(1, { statChanges: [{ type: "statChange", group: "player1", stat: "player_courage", change: "subtractNumber", value: 2 }] }));
    expect(moving.ownStats[0].changedAt.length).toBeGreaterThan(5);
    expect(moving.ownStats[0].end).toBe((moving.ownStats[0].start as number) - 2 * moving.ownStats[0].changedAt.length);
    expect(renderPlaythroughReadings([await played()], new Date(0))).toContain("Players' own stats that moved: none (of 1 stat per player, 1 player).");
  });

  it("tells an own stat that moved and came back from one that ended elsewhere (round 2's estate agents: Nia's credibility 40 → 30 → 40)", async () => {
    const run = structuredClone(await played());
    const start = run.start?.players.player1?.statValues.find((v) => v.statId === "player_courage")?.value as number;
    run.turns.forEach((t) => {
      const value = t.turn >= 3 && t.turn < 6 ? start - 10 : start;
      t.statValues = { ...t.statValues, players: { ...t.statValues.players, player1: [{ statId: "player_courage", value }] } };
    });
    const readings = readStory(run);
    expect(readings.ownStats[0]).toMatchObject({ start, end: start, changedAt: [3, 6] });
    expect(ownStatsLine(readings)).toBe(`Players' own stats that moved: none (of 1 stat per player, 1 player); moved and back where they started: Courage (player1: ${start} → ${start}, 2 turns).`);
  });

  it("reads a lever charged again on the turn after its payment: production drops it since 2026-09-30, and a run stored before shows where", async () => {
    // Every turn lowers Courage by 2: the turn after a lever pays it by 2, and the turn after that would charge it again
    const courage = { type: "statChange", group: "player1", stat: "player_courage", change: "subtractNumber", value: 2 };
    const live = readStory(await played(1, { statChanges: [courage] }));
    expect(live.fixes.leverChargedAgain.length).toBeGreaterThan(0);
    expect(live.leversPaid.chargedAgain).toEqual([]);
    // The same story as a run stored before the repair: one of those turns' kept reply still carries the second charge
    const stored = structuredClone(await played(1, { statChanges: [courage] }));
    const fired = stored.turns.find((t) => t.repairs.some((r) => r.startsWith("leverChargedAgain")));
    if (!fired?.reply) throw new Error("no turn where the repair fired");
    fired.reply = { ...fired.reply, statChanges: [...fired.reply.statChanges, courage as never] };
    fired.repairs = fired.repairs.filter((r) => !r.startsWith("leverChargedAgain"));
    const readings = readStory(stored);
    expect(readings.leversPaid.chargedAgain).toEqual([{ turn: fired.turn, detail: "player1/player_courage: -2, the sacrifice the previous turn paid" }]);
    expect(renderPlaythroughReadings([stored], new Date(0))).toContain(
      `Levers charged again on the turn after the one that paid them (each kept reply through production's current repairs, leverChargedAgain): turn ${fired.turn} (player1/player_courage: -2, the sacrifice the previous turn paid).`
    );
    expect(renderPlaythroughReadings([await played()], new Date(0))).toContain("Levers charged again on the turn after the one that paid them (each kept reply through production's current repairs, leverChargedAgain): none.");
  });

  it("reads each scoreboard move against the contest result it follows", async () => {
    const run = structuredClone(await played(2));
    const start = run.start;
    if (!start) throw new Error("no start");
    start.sharedOutcomes = [{ ...start.sharedOutcomes[0], possibleResolutions: { sideAWins: "A.", mixed: "Split.", sideBWins: "B." }, resonance: "The harbour. Scored by Harbour Race." } as never];
    start.sharedStats = [...start.sharedStats, { ...start.sharedStats[0], id: "shared_race", name: "Harbour Race", type: "opposites" } as never];
    const others = [...(start.sharedStatValues ?? [])];
    const race = (value: number) => [...others, { statId: "shared_race", value }];
    const results = (result: string) => [{ outcomeId: start.sharedOutcomes[0].id, board: "shared_race", result, oriented: true }];
    start.sharedStatValues = race(50);
    const set = (turn: number, value: number, result?: string, repaired = false) => {
      const t = run.turns[turn - 1];
      t.statValues = { ...t.statValues, shared: race(value) };
      if (result) t.contestResults = results(result);
      if (repaired) t.repairs = [...t.repairs, "scoreboardDirection: shared_race: 60 -> 45 after side A won; 60 -> 75"];
    };
    [1, 2].forEach((t) => set(t, 50));
    set(3, 60, "sideAWins");
    set(4, 70, "sideBWins");
    set(5, 70, "mixed");
    set(6, 85, "sideAWins", true);
    set(7, 95);
    // A step's win holds the scoreboard, as the setup's rule moves it only after a chapter; a switch turn after a won chapter should move it
    set(8, 95, "sideBWins");
    for (const t of [9, 10]) set(t, 95);
    set(11, 95, "sideAWins");
    const moves = readStory(run).scoreboard;
    expect(moves.map((m) => [m.turn, m.before, m.after, m.winner ?? null, m.reading, m.repaired])).toEqual([
      [3, 50, 60, "sideA", "toward the winner", false],
      [4, 60, 70, "sideB", "the wrong way", false],
      [5, 70, 70, null, "held", false],
      [6, 70, 85, "sideA", "toward the winner", true],
      [7, 85, 95, null, "moved with no contest result", false],
      [8, 95, 95, "sideB", "held after a step win", false],
      [11, 95, 95, "sideA", "held after a chapter win", false],
    ]);
    expect(renderPlaythroughReadings([run], new Date(0))).toMatch(
      /Scoreboard moves: Harbour Race: 7 turns[^\n]*the wrong way at turn 4[^\n]*held after a step win 1[^\n]*held after a chapter win at turn 11[^\n]*moved with no contest result at turn 7[^\n]*production turned 1 move around \(turn 6\)/
    );
  });

  it("lists which of production's fixes of 2026-09-30 fired, by turn", async () => {
    // The last step written twice, word for word: production's plan check drops the copy (PL-14)
    const doubled = () => {
      const plan = threadAnalysis("challenge", 4, 0, ["player1"]);
      const [first] = plan.threads;
      return { ...plan, threads: [{ ...first, outcomeId: "player1_main", progression: [first.progression[0], first.progression[1], first.progression[2], { ...first.progression[2] }] }] };
    };
    const readings = readStory(await played(1, { reply: (role, nth) => (role === "thread" && nth === 0 ? doubled() : DEFAULT) }));
    expect(readings.fixes.lastStepRepeated).toEqual([2]);
    expect(readings.fixes.sharedLeverRepeated).toEqual([]);
    const shared: BeatOption = { optionType: "challenge", resourceType: "sacrifice", riskType: "normal", text: "Spend 10 Supplies to charge", basePoints: 30, modifiersToSuccessRate: [] };
    const group = readStory(await played(2, { chapterOptions: () => [leverSet()[0], leverSet()[1], shared] }));
    expect(group.fixes.sharedLeverRepeated.length).toBeGreaterThan(0);
    expect(renderPlaythroughReadings([await played(1, { reply: (role, nth) => (role === "thread" && nth === 0 ? doubled() : DEFAULT) })], new Date(0))).toContain(
      "- production's fixes of 2026-09-30 that fired: last step written twice, the copy dropped: turn 2"
    );
  });

  it("reads the judged checks on each option set at an exploration step and on each chapter plan's results", async () => {
    const run = structuredClone(await played());
    run.judged = [
      { key: "play-lemonade-s1-t3-player1", kind: "options", turn: 3, label: "player1", verdict: true, evidence: "fine", lines: ["option 1 → 1 (same)"], costUsd: 0.0004 },
      { key: "play-lemonade-s1-t4-player1", kind: "options", turn: 4, label: "player1", verdict: false, evidence: "Option 2 asks instead.", lines: ["option 2 → none (asks)"], costUsd: 0.0004 },
      { key: "play-lemonade-s1-t2", kind: "results", turn: 2, label: "player1_main", verdict: false, evidence: "Step 2 names the approach.", lines: [], costUsd: 0.0008 },
    ];
    const readings = readStory(run);
    expect(readings.choices.options.map((o) => [o.turn, o.slot, o.verdict])).toEqual([
      [3, "player1", true],
      [4, "player1", false],
    ]);
    expect(readings.choices.results.map((r) => [r.turn, r.verdict])).toEqual([[2, false]]);
    expect(readings.cost.judgeUsd).toBeCloseTo(0.0016);
    const text = renderPlaythroughReadings([run], new Date(0));
    expect(text).toContain("### Options and results (judged)");
    expect(text).toContain("Option sets that carry out the result at each position: 1 of 2 (not at turn 4 player1: Option 2 asks instead.)");
    expect(text).toContain("Chapter plans whose results fit their kind: 0 of 1 (not at turn 2: Step 2 names the approach.)");
  });

  it("lists the plan design checks that failed, with the turn of each plan", async () => {
    // The last step twice, relabelled: production's plan check drops only an exact copy (PL-14), so this one stays
    const doubled = () => {
      const plan = threadAnalysis("challenge", 4, 0, ["player1"]);
      const [first] = plan.threads;
      const steps = [first.progression[0], first.progression[1], { ...first.progression[2], title: "The Last Push", question: "Push: Q" }, { ...first.progression[3], title: "The Last Push" }];
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
    const run = await played(2, {
      chapterOptions: () => [leverSet()[0], leverSet()[1], shared],
      statChanges: [{ type: "statChange", group: "shared", stat: "shared_supplies", change: "subtractNumber", value: 2 }],
    });
    // Since 2026-09-30 production offers a shared lever to one seat per turn (beatRepairs, sharedLeverRepeated): only player1 takes it
    expect(run.turns.flatMap((t) => t.levers).every((l) => l.slot === "player1")).toBe(true);
    // A run stored before that, where both seats took it at the same turns and one change of Supplies followed each time
    const before: PlayRun = { ...run, turns: run.turns.map((t) => ({ ...t, levers: t.levers.flatMap((l) => [l, { ...l, slot: "player2" }]) })) };
    const readings = readStory(before);
    expect(readings.leversPaid.sharedOnce.length).toBeGreaterThan(0);
    expect(readings.leversPaid.sharedOnce[0]).toMatchObject({ stat: "Supplies", slots: ["player1", "player2"] });
    expect(readings.leversPaid.counts.sharedOnce).toBe(readings.leversPaid.sharedOnce.length);
    expect(readings.leversPaid.counts.applied).toBe(readings.leversPaid.sharedOnce.length);
  });

  it("lists the one-paragraph retries whose second reply was one paragraph too", async () => {
    const run = await played(1, {
      reply: (role, nth) => (role === "beat" && (nth === 3 || nth === 4) ? beatSet(1, { player1: { ...beatSet(1).player1, text: "One short paragraph.", options: leverSet() } } as never) : DEFAULT),
    });
    const readings = readStory(run);
    expect(readings.waitsLeftOut).toEqual([]);
    expect(readings.repairs.shortTextRetries).toEqual([4]);
    expect(readings.repairs.shortTextUsedAsIs).toEqual([4]);
    const text = renderPlaythroughReadings([run], new Date(0));
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
