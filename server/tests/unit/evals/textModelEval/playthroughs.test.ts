import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { GameModes, type BeatOption } from "core/types/index.js";
import { withBeatProblem } from "../../../../src/game/services/beatChecks.js";
import { pacedLengths, switchPacingProblem } from "../../../../src/game/services/pacing.js";
import { checkSwitchPlan, withPlanProblem } from "../../../../src/game/services/planChecks.js";
import { TURN_RESENDS } from "../../../../src/game/services/retryOnce.js";
import { replayRun } from "../../../../src/evals/textModelEval/playthroughReplay.js";
import { SETUP_PREMISES, buildMergedPrompt } from "../../../../src/evals/textModelEval/setupPremises.js";
import {
  PLAYTHROUGHS,
  PLAYTHROUGHS_2,
  PLAYTHROUGHS_3,
  START_POLICY,
  countedBonus,
  nextPolicy,
  pickOption,
  playStory,
  playthroughArm,
  playthroughSetupInput,
  seededRandom,
  turnSends,
  withSeededDice,
  type PlayCall,
  type PlayCallSpec,
} from "../../../../src/evals/textModelEval/playthroughs.js";
import { callLimitsOf, requestFor, requestText } from "../../../../src/evals/textModelEval/variants.js";
import { storyFromSetup } from "../../../../src/evals/textModelEval/setupChain.js";
import { beatSet, explorationOptions, outcome, PARAGRAPH, stat, switchAnalysis, threadAnalysis } from "../../../helpers/textFixtures.js";
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

  it("plays round 2 on the same four premises and two more: a two-player contest that can run through several chapters, and a short story read with a child", () => {
    expect(PLAYTHROUGHS_2.map((p) => [p.id, p.maxTurns])).toEqual([
      ["play-lemonade", 10],
      ["play-avalon", 25],
      ["play-food-trucks", 25],
      ["play-space-pirates", 25],
      ["play-estate-agents", 25],
      ["play-kids-mouse", 10],
    ]);
    // The first four are round 1's setups, input for input
    expect(PLAYTHROUGHS_2.slice(0, 4).map((p) => playthroughSetupInput(p))).toEqual(PLAYTHROUGHS.map((p) => playthroughSetupInput(p)));
    const [agents, mouse] = PLAYTHROUGHS_2.slice(4).map((p) => playthroughSetupInput(p));
    // Two rivals and one prize, no shared bond named: the setup's competitive slate gives the contest the most milestones
    expect([agents.playerCount, agents.gameMode, agents.kids]).toEqual([2, GameModes.Competitive, undefined]);
    expect(agents.premise).toBe("We're rival estate agents trying to sell the same haunted mansion to unsuspecting buyers...");
    // Read with a child as the client merges that category (its instruction, the child's age, the suggestion as context), with production's kids setup
    expect([mouse.playerCount, mouse.gameMode, mouse.kids]).toEqual([1, GameModes.SinglePlayer, true]);
    expect(mouse.premise).toBe(
      buildMergedPrompt("read-with-kids", { kidAge: "5" }, "I'm a field mouse trying to save my burrow village from the giant tabby cat by using my knowledge of the Big House's secret passages...")
    );
    expect(mouse.premise).toMatch(/^Create an age-appropriate story[\s\S]*How old is the child\?: 5[\s\S]*Additional context: I'm a field mouse/);
    // Neither new premise was played or set up in the eval before
    for (const p of SETUP_PREMISES) expect([agents.premise, mouse.premise]).not.toContain(p.premise);
    // A story read with a child records its category and, as the game does since the kids-turns stage (2026-10-01), the
    // age its premise states, as the read-with-kids setting since the kids-ages work of the same day (a premise sent
    // without the setting); the second round's stored runs predate the age
    const started = storyFromSetup({}, mouse, "mouse-story");
    expect([started.category, started.kidAges, started.readingAge]).toEqual(["read-with-kids", { min: 5, max: 5 }, undefined]);
    // A setup input that carries the setting (the kids-ages stage's setups) records it over the premise's line
    expect(storyFromSetup({}, { ...mouse, kidAges: { min: 10, max: 10 } }, "mouse-story").kidAges).toEqual({ min: 10, max: 10 });
    const lemonade = storyFromSetup({}, playthroughSetupInput(PLAYTHROUGHS[0]), "lemonade-story");
    expect([lemonade.category, lemonade.kidAges]).toEqual([undefined, undefined]);
  });

  it("plays round 3 on round 2's six premises, the story read with a child given its age through the read-with-kids setting (since 2026-10-01)", () => {
    expect(PLAYTHROUGHS_3.map((p) => [p.id, p.maxTurns])).toEqual(PLAYTHROUGHS_2.map((p) => [p.id, p.maxTurns]));
    const now = PLAYTHROUGHS_3.map((p) => playthroughSetupInput(p));
    const then = PLAYTHROUGHS_2.map((p) => playthroughSetupInput(p));
    // Round 2's setups, input for input, all but the mouse story's
    expect(now.slice(0, 5)).toEqual(then.slice(0, 5));
    // The setup form sends the setting beside the premise, into which it still merges the age line (StoryInitializer): round
    // 2's premise, and the ages as the setting
    const mouse = now[5];
    expect(PLAYTHROUGHS_3[5].premise?.kidAges).toEqual({ min: 5, max: 5 });
    expect(mouse).toEqual({ ...then[5], kidAges: { min: 5, max: 5 } });
    expect(mouse.premise).toBe(then[5].premise);
    // The story records the setting, as StoryCreationService does
    expect(storyFromSetup({}, mouse, "mouse-story").kidAges).toEqual({ min: 5, max: 5 });
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
    // Production's paced lengths (since the pacing-clues adoption, 2026-10-01): three milestones need three chapters
    expect(run.turns.map((t) => [t.turn, t.kind])).toEqual([
      [1, "first turn"],
      [2, "chapter opening"],
      [3, "chapter step"],
      [4, "chapter step"],
      [5, "switch turn"],
      [6, "chapter opening"],
      [7, "chapter step"],
      [8, "switch turn"],
      [9, "chapter opening"],
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
      [5, "switch plan"],
      [6, "chapter plan"],
      [8, "switch plan"],
      [9, "chapter plan"],
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
    // The chapters' milestones land: the main outcome's at the switch turns after the first two chapters, the side
    // outcome's (the last chapter's, which the fake's switch took as PACING's first outcome still needing one) at the ending
    expect(run.turns[4].milestones.player1_main).toBe(1);
    expect(run.turns[7].milestones.player1_main).toBe(2);
    expect(run.turns[10].milestones).toEqual({ player1_main: 2, player1_side: 1 });
    expect(run.end?.players.player1.outcomes.find((o) => o.id === "player1_main")?.milestones).toHaveLength(2);
    // The first chapter's stage (1 of 2) is judged; the second and third settle their outcome's last stage; every chapter
    // plan's results are judged against their kind; the ending is judged per player. The fake's chapters are challenges: no
    // option set to judge
    expect(judgeTargets.map((t) => [t.kind, t.turn, t.label])).toEqual([
      ["stage", 2, "player1_main"],
      ["results", 2, "player1_main"],
      ["results", 6, "player1_main"],
      ["results", 9, "player1_side"],
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
        // A length the paced lengths allow (2 or 3 beats here), so the outcome is the only problem
        const plan = threadAnalysis("challenge", 3, 0, ["player1"]);
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

  it("records the paced lengths production's chapter planner is given, and the pacing problem its switch plan check asks once more over (since 2026-10-01)", async () => {
    // The last switch (turn 8, one chapter left) offers the complete main outcome while the side one still needs its milestone
    const onMain = () => {
      const base = switchAnalysis(["player1"]);
      return { ...base, switches: [{ ...base.switches[0], type: "flavor", outcomeId: "player1_main", question: "Again?", topicChoices: [] }] };
    };
    const { call } = fakeCall(1, { reply: (role, nth) => (role === "switch" && nth === 2 ? onMain() : DEFAULT) });
    const { run } = await playStory(spec, input(1), call, { sample: 1 });
    expect(run.complete).toBe(true);
    const replayed = replayRun(run);
    const switchPlan = run.turns.find((t) => t.turn === 8)?.plan;
    const before = replayed.find((r) => r.turn === 8)?.beforePlan;
    if (!switchPlan || !before) throw new Error("no switch plan at turn 8");
    // Production's check (checkedSwitchPlan, switchPacingProblem by default) asked once more; the record says why
    expect(switchPlan.calls).toHaveLength(2);
    expect(switchPlan.calls[0].lengthProblem).toBe(switchPacingProblem(before, checkSwitchPlan(before, onMain() as never).plan));
    expect(switchPlan.calls[0].lengthProblem).toMatch(/player1 still needs/);
    expect(switchPlan.calls[1].retry).toBe(true);
    expect(switchPlan.calls[1].lengthProblem).toBeUndefined();
    // Each chapter plan records the lengths production's PACING printed for it (pacedLengths)
    const chapterPlans = run.turns.filter((t) => t.plan?.kind === "chapter plan");
    expect(chapterPlans).toHaveLength(3);
    for (const turn of chapterPlans) {
      const story = replayed.find((r) => r.turn === turn.turn)?.beforePlan;
      if (!story) throw new Error(`no story before turn ${turn.turn}`);
      expect(turn.plan?.pacing.pacedLengths).toEqual(pacedLengths(story).lengths);
    }
  });

  const unusablePlan = () => {
    const plan = threadAnalysis("challenge", 4, 0, ["player1"]);
    return { ...plan, threads: [{ ...plan.threads[0], outcomeId: "no_such_outcome" }] };
  };
  const shortName = (caseId: string) => caseId.replace(/^play-lemonade-s1-\d+-/, "");

  it("sends a turn whose writing failed once more, as production's queue does (since 2026-09-30), the whole turn from the same story", async () => {
    // The chapter opening's first reply brings nothing usable back (production's model throws after its re-sends)
    const { call, calls } = fakeCall(1, { reply: (role, nth) => (role === "beat" && nth === 1 ? undefined : DEFAULT) });
    const { run } = await playStory(spec, input(1), call, { sample: 1 });
    expect(TURN_RESENDS).toBe(1);
    expect(run.complete).toBe(true);
    const opening = run.turns[1];
    // The failed send keeps its plan and calls; the send that worked is the turn's
    expect(opening.failedSends).toEqual([expect.objectContaining({ send: "first", failure: expect.stringMatching(/no usable reply/), calls: [expect.objectContaining({ failed: true })] })]);
    expect(opening.failedSends?.[0].plan?.plan).toBeDefined();
    expect(opening.sentBy).toBe("resend");
    // A resend runs the whole turn again: production's chapter planner, then the turn
    expect(calls.filter((c) => /resend/.test(c.caseId)).map((c) => shortName(c.caseId))).toEqual(["chapter-plan-resend", "chapter-opening-resend"]);
    expect(opening.plan?.calls[0].caseId).toMatch(/chapter-plan-resend$/);
    // The player waits for every send: the failed send's plan, then the resend's plan and turn
    expect(opening.waitMs).toBe(3_000);
    // A turn that worked first time has no failed send
    expect(run.turns[2].failedSends).toBeUndefined();
    expect(run.turns[2].sentBy).toBeUndefined();
  });

  it("sends a turn whose chapter plan can't be used twice once more, and a turn whose retry has no options either", async () => {
    const { call } = fakeCall(1, { reply: (role, nth) => (role === "thread" && nth < 2 ? unusablePlan() : DEFAULT) });
    const { run } = await playStory(spec, input(1), call, { sample: 1 });
    expect(run.complete).toBe(true);
    expect(run.turns[1].failedSends).toEqual([
      expect.objectContaining({ send: "first", failure: expect.stringMatching(/usable thread plan/), plan: expect.objectContaining({ calls: [expect.objectContaining({ retry: false }), expect.objectContaining({ retry: true })] }) }),
    ]);
    const withoutOptions = () => beatSet(1, { player1: { ...beatSet(1).player1, options: [] } } as never);
    const { call: bare } = fakeCall(1, { reply: (role, nth) => (role === "beat" && (nth === 1 || nth === 2) ? withoutOptions() : DEFAULT) });
    const played = await playStory(spec, input(1), bare, { sample: 1 });
    expect(played.run.complete).toBe(true);
    expect(played.run.turns[1].failedSends?.[0].calls.map((c) => c.problem)).toEqual([expect.stringMatching(/no options/), expect.stringMatching(/no options/)]);
  });

  it("after the resend fails too, the player presses Try again on the notice as asked, which production sends with its own resend; with no press the story waits there", async () => {
    expect(turnSends(0)).toEqual(["first", "resend"]);
    expect(turnSends(1)).toEqual(["first", "resend", "try again", "try again resend"]);
    // The chapter plan is unusable in the first three sends (a call and its retry each)
    const { call, calls } = fakeCall(1, { reply: (role, nth) => (role === "thread" && nth < 6 ? unusablePlan() : DEFAULT) });
    const { run } = await playStory(spec, input(1), call, { sample: 1, tryAgain: 1 });
    expect(run.complete).toBe(true);
    expect(run.turns[1].failedSends?.map((s) => s.send)).toEqual(["first", "resend", "try again"]);
    expect(run.turns[1].sentBy).toBe("try again resend");
    expect(calls.filter((c) => c.role === "thread").map((c) => shortName(c.caseId)).slice(0, 7)).toEqual([
      "chapter-plan",
      "chapter-plan-retry",
      "chapter-plan-resend",
      "chapter-plan-resend-retry",
      "chapter-plan-try-again",
      "chapter-plan-try-again-retry",
      "chapter-plan-try-again-resend",
    ]);
    // No press: after the first send and its resend production shows the notice, and the story stops there
    const { call: never } = fakeCall(1, { reply: (role) => (role === "thread" ? unusablePlan() : DEFAULT) });
    const stuck = await playStory(spec, input(1), never, { sample: 1 });
    expect(stuck.run.complete).toBe(false);
    expect(stuck.run.stopped).toMatch(/^turn 2: production could not write the turn in 2 sends \(the first and its resend\)/);
    expect(stuck.run.turns[1].failedSends).toHaveLength(2);
    expect(stuck.run.turns[1].plan).toBeUndefined();
  });

  it("never sends again a call a spend limit kept from being sent: the story stops there", async () => {
    const { call: base, calls } = fakeCall(1);
    let beats = 0;
    const call: PlayCall = async (s) => (s.role === "beat" && beats++ === 1 ? { latencyMs: 0, costUsd: 0, sends: [], notSent: "the spend limit $0.0100" } : base(s));
    const { run } = await playStory(spec, input(1), call, { sample: 1, tryAgain: 1 });
    expect(run.stopped).toMatch(/turn 2: the chapter opening was not sent \(the spend limit/);
    expect(calls.some((c) => /resend|try-again/.test(c.caseId))).toBe(false);
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
    const { run } = await playStory(PLAYTHROUGHS[2], input(2), call, { sample: 1, repickStuckSwitches: true });
    const stuck = run.turns.find((t) => t.repicks?.length);
    // The chapter after the second switch (turn 5): turn 6, with production's paced lengths
    expect(stuck?.turn).toBe(6);
    // player1 had taken their own outcome (Option 2); they now take the shared direction player2 took (Option 1)
    expect(stuck?.repicks).toEqual([{ slot: "player1", from: 1, to: 0, text: "Option 1", outcomeId: "shared_harbour" }]);
    // Only after production's own sends failed: the first and its resend
    expect(stuck?.failedSends?.map((s) => s.send)).toEqual(["first", "resend"]);
    expect(stuck?.sentBy).toBe("after repick");
    expect(stuck?.plan?.plan).toBeDefined();
    // The plan the stuck turn kept (a third chapter follows it with production's paced lengths)
    const last = calls.find((c) => c.caseId === stuck?.plan?.calls.at(-1)?.caseId);
    expect(last?.caseId).toMatch(/chapter-plan-after-repick$/);
    expect(requestText(last?.request as never)).toContain('player1 chose direction 1 of 3: "Option 1"');
    // The switch turn's recorded pick says it was changed
    expect(run.turns[4].picks[0]).toMatchObject({ slot: "player1", option: 1, repickedTo: 0 });
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

  it("stops where production fails the turn in every send: the retry has no options either, each time", async () => {
    const { call } = fakeCall(1, { reply: (role, nth) => (role === "beat" && nth >= 1 ? withoutOptions() : DEFAULT) });
    const { run } = await playStory(spec, input(1), call, { sample: 1 });
    expect(run.stopped).toMatch(/turn 2: production could not write the turn in 2 sends.*no usable reply/);
  });

  it("hands the judged checks each chapter plan's results and, at each step of an exploration chapter, each player's options", async () => {
    // Three beats: the paced lengths allow 2 or 3 for the first chapter (since the pacing-clues adoption, 2026-10-01)
    const exploring = () => {
      const plan = threadAnalysis("exploration", 3, 0, ["player1"]);
      return { ...plan, threads: [{ ...plan.threads[0], outcomeId: "player1_main" }] };
    };
    const { call } = fakeCall(1, { reply: (role, nth) => (role === "thread" && nth === 0 ? exploring() : DEFAULT), chapterOptions: () => explorationOptions() });
    const { judgeTargets } = await playStory(spec, input(1), call, { sample: 1 });
    // The first chapter explores (turns 2-4); the others are challenges, whose options are not judged
    expect(judgeTargets.filter((t) => t.kind === "options").map((t) => [t.turn, t.label, t.key])).toEqual([
      [2, "player1", "play-lemonade-s1-t2-player1"],
      [3, "player1", "play-lemonade-s1-t3-player1"],
      [4, "player1", "play-lemonade-s1-t4-player1"],
    ]);
    const [first] = judgeTargets.filter((t) => t.kind === "options");
    expect(first.request.prompt).toContain("This step (1 of 3)");
    expect(first.request.prompt).toContain("Option 1: Option 1");
    expect(judgeTargets.filter((t) => t.kind === "results").map((t) => [t.turn, t.key])).toEqual([
      [2, "play-lemonade-s1-t2"],
      [6, "play-lemonade-s1-t6"],
      [9, "play-lemonade-s1-t9"],
    ]);
  });

  it("records, on each turn after a contest step or chapter, its result on the contest's scoreboard", async () => {
    // Two rivals: a contested shared outcome scored on a shared opposites stat, and a chapter that is that contest
    const contested = outcome("shared_harbour", { intendedNumberOfMilestones: 3, possibleResolutions: { sideAWins: "A takes it.", mixed: "Split.", sideBWins: "B takes it." }, resonance: "The harbour. Scored by Harbour Race." } as never);
    const board = stat("shared_race", { name: "Harbour Race", type: "opposites", initialValue: 50 } as never);
    const setup = { ...setupReply(2), sharedOutcomes: [contested], sharedStats: [...setupReply(2).sharedStats, board] };
    const contest = () => {
      const plan = threadAnalysis("contest", 4, 0, ["player1"], ["player2"]);
      return { ...plan, threads: [{ ...plan.threads[0], outcomeId: "shared_harbour" }] };
    };
    const { call } = fakeCall(2, { reply: (role) => (role === "setup" ? setup : role === "thread" ? contest() : DEFAULT) });
    const { run } = await playStory(PLAYTHROUGHS_2[4], { ...input(2), gameMode: GameModes.Competitive }, call, { sample: 1, turnLimit: 6 });
    // The chapter opening follows no step; each later step, and the switch after the chapter, follow a contest result
    expect(run.turns[1].contestResults).toBeUndefined();
    const step = run.turns[2].contestResults ?? [];
    expect(step).toEqual([expect.objectContaining({ outcomeId: "shared_harbour", board: "shared_race", oriented: true })]);
    expect(["sideAWins", "mixed", "sideBWins"]).toContain(step[0].result);
    expect(run.turns[5].contestResults?.[0]).toMatchObject({ outcomeId: "shared_harbour", board: "shared_race" });
  });

  it("records a contest the plan check made one side's challenge by the side it stored, as production's scoreboard repair reads it (since 2026-10-01)", async () => {
    const contested = outcome("shared_harbour", { intendedNumberOfMilestones: 3, possibleResolutions: { sideAWins: "A takes it.", mixed: "Split.", sideBWins: "B takes it." }, resonance: "The harbour. Scored by Harbour Race." } as never);
    const board = stat("shared_race", { name: "Harbour Race", type: "opposites", initialValue: 50 } as never);
    const setup = { ...setupReply(2), sharedOutcomes: [contested], sharedStats: [...setupReply(2).sharedStats, board] };
    const length = (spec: PlayCallSpec) => Math.max(...(/Allowed lengths for this thread: ([^.]+) beats/.exec(requestText(spec.request))?.[1].match(/\d+/g) ?? ["2"]).map(Number));
    // The first chapter: the contest with both rivals (a competitive story's first thread); the second: player2 alone on side B
    // of the contest, player1 on their own outcome, which the plan check makes player2's challenge
    const plan = (nth: number, spec: PlayCallSpec) => {
      const steps = length(spec);
      if (nth === 0) {
        const both = threadAnalysis("contest", steps, 0, ["player1"], ["player2"]);
        return { ...both, threads: [{ ...both.threads[0], outcomeId: "shared_harbour" }] };
      }
      const alone = threadAnalysis("contest", steps, 0, [], ["player2"]).threads[0];
      const own = threadAnalysis("challenge", steps, 0, ["player1"]).threads[0];
      return { ...threadAnalysis("challenge", steps, 0, ["player1"]), threads: [{ ...alone, id: "alone", outcomeId: "shared_harbour" }, { ...own, id: "own", outcomeId: "player1_main" }] };
    };
    const { call } = fakeCall(2, { reply: (role, nth, spec) => (role === "setup" ? setup : role === "thread" ? plan(nth, spec) : DEFAULT) });
    const { run } = await playStory(PLAYTHROUGHS_2[4], { ...input(2), gameMode: GameModes.Competitive }, call, { sample: 1, turnLimit: 10 });
    const converted = run.turns.flatMap((t) => (t.contestResults ?? []).filter((c) => c.converted).map((c) => ({ ...c, turn: t.turn })));
    expect(converted.length).toBeGreaterThan(0);
    for (const c of converted) {
      expect(c).toMatchObject({ outcomeId: "shared_harbour", board: "shared_race", oriented: true, converted: true });
      expect(["sideAWins", "mixed", "sideBWins"]).toContain(c.result);
    }
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

  it("asks for the setup once more where a seat's identities share a name, as production does since 2026-10-01, and keeps the reply its story starts from", async () => {
    const seat = (setupReply(1) as unknown as Record<string, Record<string, unknown>>).player1;
    const ari = ["Ari", "Ari", "Ari"].map((name) => ({ name, pronouns: { personal: "they", object: "them", possessive: "their", reflexive: "themselves" }, appearance: "tall" }));
    const { call, calls } = fakeCall(1, { reply: (role, nth) => (role === "setup" && nth === 0 ? { ...setupReply(1), player1: { ...seat, possibleCharacterIdentities: ari } } : DEFAULT) });
    const { run } = await playStory(spec, input(1), call, { sample: 1, turnLimit: 1 });
    expect(calls.filter((c) => c.role === "setup")).toHaveLength(2);
    expect(run.setup?.calls[0].problem).toMatch(/share a name/);
    const kept = (run.setup?.output as Record<string, { possibleCharacterIdentities: { name: string }[] }>).player1.possibleCharacterIdentities.map((i) => i.name);
    expect(kept).toEqual(["Ada player1", "Bram player1", "Cato player1"]);
    expect(run.start?.characterSelectionOptions.player1?.possibleCharacterIdentities.map((i) => i.name)).toEqual(kept);
  });
});
