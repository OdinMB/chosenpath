import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { GameModes, type BeatOption } from "core/types/index.js";
import { withBeatProblem } from "../../../../src/game/services/beatChecks.js";
import { withPlanProblem } from "../../../../src/game/services/planChecks.js";
import { SETUP_PREMISES } from "../../../../src/evals/textModelEval/setupPremises.js";
import {
  PLAYTHROUGHS,
  START_POLICY,
  countedBonus,
  nextPolicy,
  pickOption,
  playStory,
  playthroughArm,
  playthroughSetupInput,
  seededRandom,
  withSeededDice,
} from "../../../../src/evals/textModelEval/playthroughs.js";
import { callLimitsOf, requestFor, requestText } from "../../../../src/evals/textModelEval/variants.js";
import { beatSet, explorationOptions, PARAGRAPH, switchAnalysis, threadAnalysis } from "../../../helpers/textFixtures.js";
import { DEFAULT, fakeCall, input, leverSet, setupReply } from "./playFixtures.js";

/*
 * Whole-story playthroughs on production's own code and models: a new setup,
 * character selection, then every turn as the game plays it (the switch and
 * chapter planners with production's plan check and its one retry, the turn
 * with its one-paragraph retry and repairs, the stat changes, the chapter
 * resolution, the ending), each choice made by a fixed, varied policy and
 * rolled with the game's own dice on a seeded source.
 */

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("the four playthroughs", () => {
  it("plays a short and a full-length single-player story, a two-player contest and three players cooperative-competitive, on fresh premises", () => {
    expect(PLAYTHROUGHS.map((p) => [p.id, p.maxTurns])).toEqual([
      ["play-lemonade", 10],
      ["play-avalon", 25],
      ["play-food-trucks", 25],
      ["play-space-pirates", 25],
    ]);
    const inputs = PLAYTHROUGHS.map((p) => playthroughSetupInput(p));
    expect(inputs.map((i) => [i.playerCount, i.gameMode])).toEqual([
      [1, GameModes.SinglePlayer],
      [1, GameModes.SinglePlayer],
      [2, GameModes.Competitive],
      [3, GameModes.CooperativeCompetitive],
    ]);
    // The single-player premises are frozen ones; the group premises are the site's own suggestions, none played before
    expect(inputs[0].premise).toBe(SETUP_PREMISES.find((p) => p.id === "setup-learn-lemonade")?.premise);
    expect(inputs[1].premise).toBe(SETUP_PREMISES.find((p) => p.id === "setup-custom-avalon")?.premise);
    expect(inputs[2].premise).toMatch(/food truck/);
    expect(inputs[3].premise).toMatch(/space pirates/);
    for (const i of inputs) expect(i.kids).toBeUndefined();
    // No premise from the setup chain, which played its stories through the first chapter
    for (const id of ["setup-vent-subscription", "setup-kids-animal-rescue", "setup-fiction-bounty-hunters", "setup-pretend-cofounders"]) {
      expect(PLAYTHROUGHS.some((p) => p.premiseId === id)).toBe(false);
    }
  });

  it("plays every call on production's own code (adopted) and production's settings for the role and player count", () => {
    expect(playthroughArm("setup", 1).key).toBe("gpt-6-luna@low/adopted");
    expect(playthroughArm("beat", 1).key).toBe("gpt-6-luna@medium/adopted");
    expect(playthroughArm("beat", 2).key).toBe("gpt-6-luna@low/adopted");
    expect(playthroughArm("beat", 3).key).toBe("gpt-6-luna@low/adopted");
    expect(playthroughArm("switch", 1).key).toBe("gpt-6-luna@low/adopted");
    expect(playthroughArm("thread", 3).key).toBe("gpt-6-luna@low/adopted");
  });
});

describe("the player's policy: fixed and varied", () => {
  const challenge = (text: string, extra: Partial<Extract<BeatOption, { optionType: "challenge" }>> = {}): BeatOption => ({
    optionType: "challenge",
    resourceType: "normal",
    riskType: "normal",
    text,
    basePoints: 0,
    modifiersToSuccessRate: [],
    ...extra,
  });
  const bonus = (effect: number, statId = "player_courage") => ({ statId, reason: "r", effect });

  it("counts a stat bonus as the game does: the first two, each within ±15", () => {
    expect(countedBonus(challenge("a", { modifiersToSuccessRate: [bonus(20), bonus(-5), bonus(15)] }))).toBe(10);
    expect(countedBonus({ optionType: "exploration", resourceType: "normal", text: "x" })).toBe(0);
  });

  it("takes a sacrifice or reward whenever one is offered, but never twice in a row", () => {
    const options = leverSet();
    const first = pickOption(options, START_POLICY);
    expect(first).toMatchObject({ option: 2, rule: "lever" });
    const after = nextPolicy(START_POLICY, options, first);
    expect(after.lastLever).toBe(true);
    expect(pickOption(options, after).rule).not.toBe("lever");
  });

  it("otherwise rotates stat-backed, riskiest and sensible over the challenge picks", () => {
    const options = [
      challenge("steady", { basePoints: 5 }),
      challenge("strong", { basePoints: -10, modifiersToSuccessRate: [bonus(15)] }),
      challenge("wild", { basePoints: -5, riskType: "risky" }),
    ];
    let state = START_POLICY;
    const rules: string[] = [];
    const picked: number[] = [];
    for (let i = 0; i < 4; i++) {
      const pick = pickOption(options, state);
      rules.push(pick.rule);
      picked.push(pick.option);
      state = nextPolicy(state, options, pick);
    }
    expect(rules).toEqual(["stat-backed", "riskiest", "sensible", "stat-backed"]);
    expect(picked).toEqual([1, 2, 0, 1]);
  });

  it("reads the riskiest as the risky option with the lowest points, else the lowest points", () => {
    const state = { ...START_POLICY, challengePicks: 1 };
    const noRisky = [challenge("a", { basePoints: 0 }), challenge("b", { basePoints: -15, modifiersToSuccessRate: [bonus(10)] }), challenge("c", { basePoints: -10 })];
    expect(pickOption(noRisky, state).option).toBe(2);
  });

  it("rotates exploration choices by position, and each player starts at a different place in the rotation", () => {
    const options = explorationOptions();
    let state = START_POLICY;
    const picked: number[] = [];
    for (let i = 0; i < 4; i++) {
      const pick = pickOption(options, state);
      expect(pick.rule).toBe("exploration");
      picked.push(pick.option);
      state = nextPolicy(state, options, pick);
    }
    expect(picked).toEqual([0, 1, 2, 0]);
    expect(pickOption(options, START_POLICY, 1).option).toBe(1);
    expect(pickOption(leverSet(), { ...START_POLICY, lastLever: true }, 1).rule).toBe("riskiest");
  });

  it("says why it chose", () => {
    expect(pickOption(leverSet(), START_POLICY).why).toMatch(/sacrifice/);
    expect(pickOption(leverSet(), { ...START_POLICY, lastLever: true }).why).toMatch(/Courage|\+10/);
  });
});

describe("the game's dice on a seeded source", () => {
  it("gives the same rolls for the same seed and restores Math.random", () => {
    const original = Math.random;
    const a = withSeededDice("story|t3|player1", () => [Math.random(), Math.random()]);
    const b = withSeededDice("story|t3|player1", () => [Math.random(), Math.random()]);
    expect(a).toEqual(b);
    expect(withSeededDice("story|t4|player1", () => Math.random())).not.toBe(a[0]);
    expect(Math.random).toBe(original);
    for (const value of a) expect(value >= 0 && value < 1).toBe(true);
    const random = seededRandom("x");
    expect(random()).toBe(seededRandom("x")());
  });

  it("restores Math.random when the play throws", () => {
    const original = Math.random;
    expect(() =>
      withSeededDice("s", () => {
        throw new Error("boom");
      })
    ).toThrow("boom");
    expect(Math.random).toBe(original);
  });
});

describe("playStory: a whole story as the game plays it", () => {
  const spec = PLAYTHROUGHS[0];

  it("plays setup, character selection and every turn to the ending on the story's turn count, on production's requests", async () => {
    const { call, calls } = fakeCall(1);
    const { run, judgeTargets } = await playStory(spec, input(1), call, { sample: 1 });
    expect(run.stopped).toBe("the ending");
    expect(run.complete).toBe(true);
    expect(run.turns.map((t) => [t.turn, t.kind])).toEqual([
      [1, "first turn"],
      [2, "chapter opening"],
      [3, "chapter step"],
      [4, "chapter step"],
      [5, "chapter step"],
      [6, "switch turn"],
      [7, "chapter opening"],
      [8, "chapter step"],
      [9, "chapter step"],
      [10, "chapter step"],
      [11, "ending"],
    ]);
    // The setup request is production's, with production's limits
    expect(requestText(calls[0].request)).toBe(requestText(requestFor("adopted", { role: "setup", setup: input(1) })));
    expect(callLimitsOf(calls[0].request)).toEqual(callLimitsOf(requestFor("adopted", { role: "setup", setup: input(1) })));
    // Production's settings per role
    expect([...new Set(calls.filter((c) => c.role === "beat").map((c) => c.arm.key))]).toEqual(["gpt-6-luna@medium/adopted"]);
    expect([...new Set(calls.filter((c) => c.role !== "beat").map((c) => c.arm.key))]).toEqual(["gpt-6-luna@low/adopted"]);
    // Planners where the game runs them: a switch plan before the first turn and each switch turn, a chapter plan before each opening
    expect(run.turns.filter((t) => t.plan).map((t) => [t.turn, t.plan?.kind])).toEqual([
      [1, "switch plan"],
      [2, "chapter plan"],
      [6, "switch plan"],
      [7, "chapter plan"],
    ]);
    // Each call has its own case id, and the story starts after character selection
    expect(new Set(calls.map((c) => c.caseId)).size).toBe(calls.length);
    expect(calls[0].caseId).toBe("play-lemonade-s1-000-setup");
    expect(run.start?.characterSelectionCompleted).toBe(true);
    expect(run.start?.players.player1.name).toMatch(/player1/);
    // Every turn but the ending has the player's pick, rolled or mapped
    for (const turn of run.turns.slice(0, -1)) {
      expect(turn.picks).toHaveLength(1);
      expect(turn.picks[0].resolution).not.toBeNull();
    }
    expect(run.turns[10].picks).toEqual([]);
    // The chapter's milestones land: one at the switch turn after the first chapter, one at the ending
    expect(run.turns[5].milestones.player1_main).toBe(1);
    expect(run.turns[10].milestones.player1_main).toBe(2);
    expect(run.end?.players.player1.outcomes.find((o) => o.id === "player1_main")?.milestones).toHaveLength(2);
    // The first chapter's stage (1 of 2) is judged; the second is the outcome's last stage; the ending is judged per player
    expect(judgeTargets.map((t) => [t.kind, t.turn, t.label])).toEqual([
      ["stage", 2, "player1_main"],
      ["ending", 11, "player1"],
    ]);
    // What each call cost and waited
    expect(run.turns[1].waitMs).toBe(2_000);
    expect(run.turns[2].waitMs).toBe(1_000);
    expect(run.turns[1].costUsd).toBeCloseTo(0.002);
  });

  it("records a turn's mechanics, the previous lever's payment and the stats after it", async () => {
    const { call } = fakeCall(1);
    const { run } = await playStory(spec, input(1), call, { sample: 1 });
    const opening = run.turns[1];
    expect(opening.picks[0]).toMatchObject({ rule: "lever", resourceType: "sacrifice", option: 2 });
    expect(opening.mechanics?.choices.player1.length).toBe(3);
    // The next turn reads whether the sacrifice was paid: the fake writes no stat change
    expect(run.turns[2].levers).toEqual([expect.objectContaining({ slot: "player1", kind: "sacrifice", status: "notApplied" })]);
    expect(run.turns[2].statValues.players.player1.map((v) => v.statId)).toContain("player_courage");
    // A turn that takes the sacrifice's 10 Courage pays it
    const paying = fakeCall(1, { statChanges: [{ type: "statChange", group: "player1", stat: "player_courage", change: "subtractNumber", value: 10 }] });
    const paid = await playStory(spec, input(1), paying.call, { sample: 1 });
    expect(paid.run.turns[2].levers).toEqual([expect.objectContaining({ status: "applied" })]);
  });

  it("plays the same story twice to the same requests: choices by policy, the dice seeded", async () => {
    const one = fakeCall(1);
    const two = fakeCall(1);
    await playStory(spec, input(1), one.call, { sample: 1 });
    await playStory(spec, input(1), two.call, { sample: 1 });
    expect(two.calls.map((c) => [c.caseId, requestText(c.request)])).toEqual(one.calls.map((c) => [c.caseId, requestText(c.request)]));
  });

  it("plays each group player's own pick, the rotation offset per seat", async () => {
    const { call, calls } = fakeCall(2);
    const { run } = await playStory(PLAYTHROUGHS[2], input(2), call, { sample: 1 });
    expect(run.complete).toBe(true);
    expect([...new Set(calls.filter((c) => c.role === "beat").map((c) => c.arm.key))]).toEqual(["gpt-6-luna@low/adopted"]);
    const first = run.turns[0];
    expect(first.picks.map((p) => p.slot)).toEqual(["player1", "player2"]);
    expect(first.picks[0].option).not.toBe(first.picks[1].option);
  });

  it("gives an unusable plan production's one retry, told the problem, and keeps both calls", async () => {
    const { call, calls } = fakeCall(1, {
      reply: (role, nth) => {
        if (role !== "thread" || nth !== 0) return DEFAULT;
        const plan = threadAnalysis("challenge", 4, 0, ["player1"]);
        return { ...plan, threads: [{ ...plan.threads[0], outcomeId: "no_such_outcome" }] };
      },
    });
    const { run } = await playStory(spec, input(1), call, { sample: 1 });
    const planned = run.turns[1].plan;
    expect(planned?.calls).toHaveLength(2);
    expect(planned?.calls[0].problem).toBeTruthy();
    expect(planned?.calls[1].retry).toBe(true);
    const retry = calls.find((c) => c.caseId === planned?.calls[1].caseId);
    const first = calls.find((c) => c.caseId === planned?.calls[0].caseId);
    expect(requestText(retry?.request as never)).toBe(withPlanProblem(requestText(first?.request as never), planned?.calls[0].problem as string));
    expect(run.complete).toBe(true);
  });

  it("stops where a plan can't be used twice, as production fails the turn", async () => {
    const { call } = fakeCall(1, {
      reply: (role) => {
        if (role !== "thread") return DEFAULT;
        const plan = threadAnalysis("challenge", 4, 0, ["player1"]);
        return { ...plan, threads: [{ ...plan.threads[0], outcomeId: "no_such_outcome" }] };
      },
    });
    const { run } = await playStory(spec, input(1), call, { sample: 1 });
    expect(run.complete).toBe(false);
    expect(run.stopped).toMatch(/turn 2.*chapter plan.*could not be used/);
    expect(run.turns.at(-1)?.plan?.failure).toBeTruthy();
  });

  it("where production would fail the turn on a plan unusable twice, asks production's checked planner again when told to, and marks the turn", async () => {
    const unusable = () => {
      const plan = threadAnalysis("challenge", 4, 0, ["player1"]);
      return { ...plan, threads: [{ ...plan.threads[0], outcomeId: "no_such_outcome" }] };
    };
    const { call, calls } = fakeCall(1, { reply: (role, nth) => (role === "thread" && nth < 2 ? unusable() : DEFAULT) });
    const { run } = await playStory(spec, input(1), call, { sample: 1, retryFailedTurns: 2 });
    expect(run.complete).toBe(true);
    const planned = run.turns[1].plan;
    // The failed round keeps both of production's calls; the next round is production's checked planner again
    expect(planned?.failedRounds).toEqual([{ calls: [expect.objectContaining({ retry: false }), expect.objectContaining({ retry: true })], failure: expect.stringMatching(/usable thread plan/) }]);
    expect(planned?.calls).toHaveLength(1);
    expect(planned?.calls[0].caseId).toMatch(/chapter-plan-again-1$/);
    expect(calls.filter((c) => c.role === "thread").map((c) => c.caseId.replace(/^play-lemonade-s1-\d+-/, ""))).toEqual(["chapter-plan", "chapter-plan-retry", "chapter-plan-again-1", "chapter-plan"]);
    // Where the harness gives up, it says so
    const { call: never } = fakeCall(1, { reply: (role) => (role === "thread" ? unusable() : DEFAULT) });
    const stuck = await playStory(spec, input(1), never, { sample: 1, retryFailedTurns: 1 });
    expect(stuck.run.stopped).toMatch(/turn 2.*chapter plan.*could not be used/);
    expect(stuck.run.turns[1].plan?.failedRounds).toHaveLength(1);
  });

  it("where a group chapter can't be planned from the players' switch picks, has the stuck players pick the shared direction another player took, then plans once more, and marks it", async () => {
    // The second switch: a topic switch per player, each offering the shared outcome, their own, and (player2) the shared one last
    const direction = (text: string, outcomeId: string) => ({ direction: text, outcomeId });
    const topic = (slot: string, directions: { direction: string; outcomeId: string }[]) => ({
      ...switchAnalysis([slot]).switches[0],
      id: `sw_${slot}`,
      players: [slot],
      type: "topic",
      topicChoices: directions.map((d) => `${d.direction} (${d.outcomeId})`),
      topicDirections: directions,
    });
    const splitSwitch = {
      ...switchAnalysis(["player1", "player2"]),
      switches: [
        topic("player1", [direction("Tavi", "shared_harbour"), direction("Own", "player1_main"), direction("Side", "player1_side")]),
        topic("player2", [direction("Own", "player2_main"), direction("Side", "player2_side"), direction("Tavi", "shared_harbour")]),
      ],
    };
    const unusable = { ...threadAnalysis("challenge", 4, 0, ["player1", "player2"]), threads: [{ ...threadAnalysis("challenge", 4, 0, ["player1", "player2"]).threads[0], outcomeId: "no_such_outcome" }] };
    const { call, calls } = fakeCall(2, {
      reply: (role, nth, s) => {
        if (role === "switch" && nth === 1) return splitSwitch;
        // After the split switch, a chapter can be planned only once both players picked the shared direction
        const prompt = requestText(s.request);
        if (role === "thread" && nth >= 1 && prompt.includes("player1 chose direction 2 of 3")) return unusable;
        return DEFAULT;
      },
    });
    const { run } = await playStory(PLAYTHROUGHS[2], input(2), call, { sample: 1, retryFailedTurns: 1, repickStuckSwitches: true });
    const stuck = run.turns.find((t) => t.repicks?.length);
    expect(stuck?.turn).toBe(7);
    // player1 had taken their own outcome (Option 2); they now take the shared direction player2 took (Option 1)
    expect(stuck?.repicks).toEqual([{ slot: "player1", from: 1, to: 0, text: "Option 1", outcomeId: "shared_harbour" }]);
    expect(stuck?.plan?.failedRounds).toHaveLength(2);
    expect(stuck?.plan?.plan).toBeDefined();
    const last = calls.filter((c) => c.role === "thread").at(-1);
    expect(last?.caseId).toMatch(/chapter-plan-after-repick$/);
    expect(requestText(last?.request as never)).toContain('player1 chose direction 1 of 3: "Option 1"');
    // The switch turn's recorded pick says it was changed
    expect(run.turns[5].picks[0]).toMatchObject({ slot: "player1", option: 1, repickedTo: 0 });
    expect(run.complete).toBe(true);
  });

  it("gives a one-paragraph turn production's one retry, told so", async () => {
    const { call, calls } = fakeCall(1, {
      reply: (role, nth) => (role === "beat" && nth === 0 ? beatSet(1, { player1: { ...beatSet(1).player1, text: PARAGRAPH } } as never) : DEFAULT),
    });
    const { run } = await playStory(spec, input(1), call, { sample: 1 });
    const first = run.turns[0];
    expect(first.calls).toHaveLength(2);
    expect(first.calls[0].problem).toMatch(/single paragraph/);
    const [one, two] = first.calls.map((c) => calls.find((s) => s.caseId === c.caseId));
    expect(requestText(two?.request as never)).toBe(withBeatProblem(requestText(one?.request as never), first.calls[0].problem as string));
  });

  it("stops after the turns asked for (a smoke), and where a call brings nothing back", async () => {
    const { call, calls } = fakeCall(1);
    const smoke = await playStory(spec, input(1), call, { sample: 1, turnLimit: 2 });
    expect(smoke.run.turns.map((t) => t.kind)).toEqual(["first turn", "chapter opening"]);
    expect(smoke.run.stopped).toBe("after turn 2 (the turns asked for)");
    expect(calls.map((c) => c.role)).toEqual(["setup", "switch", "beat", "thread", "beat"]);
    const { call: silent } = fakeCall(1, { reply: (role) => (role === "switch" ? undefined : DEFAULT) });
    const stopped = await playStory(spec, input(1), silent, { sample: 1 });
    expect(stopped.run.stopped).toMatch(/turn 1.*switch plan.*no usable reply/);
  });

  const withoutOptions = () => beatSet(1, { player1: { ...beatSet(1).player1, options: [] } } as never);

  it("gives a turn with no options production's one retry, told so, and plays on with the retry's options", async () => {
    const { call, calls } = fakeCall(1, { reply: (role, nth) => (role === "beat" && nth === 1 ? withoutOptions() : DEFAULT) });
    const { run } = await playStory(spec, input(1), call, { sample: 1 });
    const second = run.turns[1];
    expect(second.calls).toHaveLength(2);
    expect(second.calls[0].problem).toMatch(/no options/);
    const [one, two] = second.calls.map((c) => calls.find((s) => s.caseId === c.caseId));
    expect(requestText(two?.request as never)).toBe(withBeatProblem(requestText(one?.request as never), second.calls[0].problem as string));
    expect(run.complete).toBe(true);
  });

  it("stops where production fails the turn: the retry has no options either", async () => {
    const { call } = fakeCall(1, { reply: (role, nth) => (role === "beat" && (nth === 1 || nth === 2) ? withoutOptions() : DEFAULT) });
    const { run } = await playStory(spec, input(1), call, { sample: 1 });
    expect(run.stopped).toMatch(/turn 2.*no usable reply/);
  });

  it("asks no ending for options: the game shows none there", async () => {
    const { call, calls } = fakeCall(1, { reply: (role, _nth, s) => (role === "beat" && /-ending$/.test(s.caseId) ? withoutOptions() : DEFAULT) });
    const { run } = await playStory(spec, input(1), call, { sample: 1 });
    expect(run.complete).toBe(true);
    expect(calls.filter((c) => /ending/.test(c.caseId))).toHaveLength(1);
  });

  it("starts from a setup production would start from, asking once more when it can't", async () => {
    const seat = (setupReply(1) as unknown as Record<string, Record<string, unknown>>).player1;
    const { call, calls } = fakeCall(1, { reply: (role, nth) => (role === "setup" && nth === 0 ? { ...setupReply(1), player1: { ...seat, outcomes: [] } } : DEFAULT) });
    const { run } = await playStory(spec, input(1), call, { sample: 1, turnLimit: 1 });
    expect(calls.filter((c) => c.role === "setup")).toHaveLength(2);
    expect(run.setup?.calls[0].problem).toMatch(/no outcomes/);
    expect(run.turns).toHaveLength(1);
  });
});
