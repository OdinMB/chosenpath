import { jest } from "@jest/globals";
import { Story } from "core/models/Story.js";
import type { StoryState, ThreadAnalysis } from "core/types/index.js";
import type { EvalRole } from "../../../../src/evals/textModelEval/arms.js";
import { caseStory, type EvalCase } from "../../../../src/evals/textModelEval/cases.js";
import {
  AGENCY_IMPLICATIONS,
  EDITED_CASES,
  EXPLORATION_CASE,
  NEONATE_CASES,
  NOVI_REG_STAT_RULES,
  afterBeatReply,
  editedCase,
  editedCases,
  explorationStepCase,
  intendedMilestones,
  maxTurns,
  multiplayerAfterFirstCases,
  narrativeImplications,
  neonateFeedingCases,
  switchAndThreadInstructions,
  turnsLeft,
  type RoundCall,
} from "../../../../src/evals/textModelEval/roundCases.js";
import { milestoneBudget } from "../../../../src/evals/textModelEval/setupDesignChecks.js";
import { threadStep, type TextRequest } from "../../../../src/game/services/storyTextSteps.js";
import { firstThreadAnalysis, switchAnalysisAfterThread } from "../../../helpers/promptStories.js";
import { createMockStoryState } from "../../../helpers/testHelpers.js";
import { beatSet, challengeOptions, explorationOptions, outcome, stat, switchAnalysis, threadAnalysis } from "../../../helpers/textFixtures.js";
import { evalCase, tags } from "./fixtures.js";

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const EXPOSE = "player1_expose_waste_ring";
const IDENTITY = "player1_redefine_identity";
const INFLUENCE = "player1_influence_city_ai";

/** Novi Reg's shape: turn 3 after a chapter on the Waste Ring, three outcomes (3, 2, 1) and Personal Agency. */
function noviRegState(overrides: Partial<StoryState> = {}): StoryState {
  const state = structuredClone(switchAnalysisAfterThread(1, { maxTurns: 20, ...overrides }).getState());
  state.players.player1.outcomes = [
    outcome(EXPOSE, { intendedNumberOfMilestones: 3 }),
    outcome(IDENTITY, { intendedNumberOfMilestones: 2 }),
    outcome(INFLUENCE, { intendedNumberOfMilestones: 1 }),
  ];
  state.playerStats = [stat("player_personal_agency", { narrativeImplications: ["Low agency limits options."] })];
  return state;
}

const turnsLeftIn = (c: EvalCase) => {
  const story = caseStory(c, false);
  return story.getMaxTurns() - story.getCurrentTurn();
};

const intendedOf = (c: EvalCase) => Object.fromEntries((c.state?.players.player1.outcomes ?? []).map((o) => [o.id, o.intendedNumberOfMilestones]));

describe("state edits", () => {
  it("sets the story's length so a number of turns is left, the next one included", () => {
    const state = noviRegState();
    turnsLeft(5).apply(state);
    expect(state.maxTurns).toBe(Story.create(state).getCurrentTurn() + 5);
    maxTurns(10).apply(state);
    expect(state.maxTurns).toBe(10);
  });

  it("sets intended milestones on the shared list and every player's, and refuses an outcome the story lacks", () => {
    const state = noviRegState({ sharedOutcomes: [outcome("shared_city", { intendedNumberOfMilestones: 3 })] });
    intendedMilestones({ [EXPOSE]: 1, shared_city: 2 }).apply(state);
    expect(state.players.player1.outcomes.find((o) => o.id === EXPOSE)?.intendedNumberOfMilestones).toBe(1);
    expect(state.sharedOutcomes[0].intendedNumberOfMilestones).toBe(2);
    expect(() => intendedMilestones({ player1_nothing: 1 }).apply(state)).toThrow("player1_nothing");
  });

  it("replaces the switch/thread instructions and a stat's implications whole, and refuses a stat the story lacks", () => {
    const state = noviRegState();
    switchAndThreadInstructions(NOVI_REG_STAT_RULES).apply(state);
    narrativeImplications("player_personal_agency", AGENCY_IMPLICATIONS).apply(state);
    expect(state.guidelines.switchAndThreadInstructions).toEqual(NOVI_REG_STAT_RULES);
    expect(state.playerStats[0].narrativeImplications).toEqual(AGENCY_IMPLICATIONS);
    expect(() => narrativeImplications("player_nothing", ["x"]).apply(state)).toThrow("player_nothing");
  });
});

describe("editedCase", () => {
  const base = evalCase("cont-base-t3", "beat", {
    state: noviRegState(),
    fixedAnalysis: { kind: "switch", phase: switchAnalysis(["player1"], 3) },
    storedOutput: { player1: {} },
    tags: tags({ dark: true, hasStoredOutput: true, analysisTurn: true }),
  });
  const spec = { id: "round-switch-x", role: "switch" as const, base: base.id, category: "late-switch", purpose: "A late switch.", edits: [turnsLeft(4)] };

  it("makes a planning case from the base's state before analysis, tagged as a round case, and leaves the base as it was", () => {
    const built = editedCase(base, spec);
    expect(built).toMatchObject({ id: "round-switch-x", role: "switch" });
    expect(built.fixedAnalysis).toBeUndefined();
    expect(built.storedOutput).toBeUndefined();
    expect(built.tags).toMatchObject({ source: "round", category: "late-switch", dark: true, hasStoredOutput: false, analysisTurn: false, subset15: false });
    expect(built.note).toContain("A late switch.");
    expect(built.note).toContain("cont-base-t3");
    expect(built.note).toContain("4 turns are left");
    expect(turnsLeftIn(built)).toBe(4);
    expect(base.state?.maxTurns).toBe(20);
  });
});

describe("EDITED_CASES", () => {
  const frozen = [...new Set(EDITED_CASES.map((s) => s.base))].map((id) => evalCase(id, id.startsWith("thread-") ? "thread" : "switch", { state: noviRegState() }));
  const { cases, skipped } = editedCases(frozen);
  const byId = new Map(cases.map((c) => [c.id, c]));

  it("builds every spec, each id once and marked as a round case", () => {
    expect(skipped).toEqual([]);
    expect(cases.map((c) => c.id)).toEqual(EDITED_CASES.map((s) => s.id));
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    expect(cases.every((c) => c.id.startsWith("round-") && c.tags.source === "round")).toBe(true);
  });

  it("leaves five and three turns at the late switches", () => {
    expect(turnsLeftIn(byId.get("round-switch-late5-8988006e-t8") as EvalCase)).toBe(5);
    expect(turnsLeftIn(byId.get("round-switch-late3-8988006e-t8") as EvalCase)).toBe(3);
  });

  it("scales the short and the 20-turn story's milestones to the setup document's budget for their length", () => {
    const sum = (c: EvalCase) => Object.values(intendedOf(c)).reduce((a, b) => a + b, 0);
    for (const id of ["round-switch-short10-8988006e-t4", "round-thread-short10-8988006e-t5"]) {
      const c = byId.get(id) as EvalCase;
      expect(c.state?.maxTurns).toBe(10);
      expect(sum(c)).toBe(milestoneBudget(10));
    }
    for (const id of ["round-switch-long20-8988006e-t4", "round-thread-long20-8988006e-t5"]) {
      const c = byId.get(id) as EvalCase;
      expect(c.state?.maxTurns).toBe(20);
      expect(sum(c)).toBe(milestoneBudget(20));
    }
  });

  it("puts one outcome at n of n in the complete-outcome case, and the new-form rules in the trigger cases", () => {
    expect(intendedOf(byId.get("round-switch-complete-8988006e-t8") as EvalCase)[EXPOSE]).toBe(1);
    const stat = byId.get("round-switch-trigger-stat-8988006e-t8") as EvalCase;
    expect(stat.state?.guidelines.switchAndThreadInstructions).toEqual(NOVI_REG_STAT_RULES);
    expect(stat.state?.playerStats[0].narrativeImplications).toEqual(AGENCY_IMPLICATIONS);
    for (const id of ["round-switch-trigger-timing-8988006e-t8", "round-switch-trigger-opening-2db542e9-t0"]) {
      expect((byId.get(id) as EvalCase).state?.guidelines.switchAndThreadInstructions?.length).toBe(3);
    }
  });

  it("reports a spec whose base is not frozen instead of throwing", () => {
    expect(editedCases([]).skipped).toHaveLength(EDITED_CASES.length);
  });
});

/** A fake call that answers each role in turn and records what it was asked. */
function fakeCall(answers: Partial<Record<EvalRole, unknown[]>>) {
  const asked: { role: EvalRole; caseId: string; players: number; request: TextRequest }[] = [];
  const call: RoundCall = async (role, caseId, request, players) => {
    asked.push({ role, caseId, players, request });
    const next = answers[role]?.shift();
    return next === undefined ? undefined : { parsed: next, outputFile: `outputs/${caseId}.json` };
  };
  return { call, asked };
}

describe("afterBeatReply", () => {
  it("adds the beat and applies its stat changes, as the game keeps them", () => {
    const story = Story.create({ ...noviRegState(), sharedStats: [stat("shared_surveillance")], sharedStatValues: [{ statId: "shared_surveillance", value: 50 }] });
    const reply = beatSet(1, { statChanges: [{ type: "statChange", group: "shared", stat: "shared_surveillance", change: "addNumber", value: 5 }] });
    const after = afterBeatReply(story, reply);
    expect(after.getCurrentTurn()).toBe(story.getCurrentTurn() + 1);
    expect(after.getState().sharedStatValues.find((v) => v.statId === "shared_surveillance")?.value).toBe(55);
  });
});

describe("explorationStepCase", () => {
  it("plays the chapter-opening case's stored first step and freezes the chapter's second step", () => {
    const opening = evalCase("cont-explore-t1", "beat", {
      state: firstThreadAnalysis(1).getState(),
      fixedAnalysis: { kind: "thread", phase: threadAnalysis("exploration", 3, 1) },
      tags: tags({ analysisTurn: true, hasStoredOutput: true }),
    });
    const { cases, problems } = explorationStepCase(opening, { parsed: beatSet(1), outputFile: "outputs/step1.json" });
    expect(problems).toEqual([]);
    const [built] = cases;
    expect(built).toMatchObject({ id: EXPLORATION_CASE, role: "beat" });
    expect(built.fixedAnalysis).toBeUndefined();
    expect(built.tags).toMatchObject({ source: "round", category: "exploration-step", analysisTurn: false, firstBeat: false });
    expect(built.note).toContain("outputs/step1.json");
    const story = caseStory(built);
    expect(story.getCurrentBeatType()).toBe("thread");
    expect(story.getCurrentThreadType()).toBe("exploration");
    expect(story.getCurrentThreadBeatsCompleted()).toBe(1);
  });
});

describe("neonateFeedingCases", () => {
  const base = evalCase("switch-neonate-t0", "switch", { state: createMockStoryState({ maxTurns: 25 }) });
  const plan = switchAnalysis(["player1"], 0);
  const feedingBeat = beatSet(1, {
    player1: { ...beatSet(1).player1, options: explorationOptions().map((o, i) => (i === 1 ? { ...o, text: "Find a discreet way to feed tonight" } : o)) },
  } as never);
  const predation = (): ThreadAnalysis => {
    const analysis = threadAnalysis("challenge", 2, 1);
    analysis.threads[0].typeOfThread = "Predation (feeding on mortals)";
    return analysis;
  };

  it("chooses the feeding option, asks the default planner for the chapter, and freezes the plan and its first step", async () => {
    const { call, asked } = fakeCall({ thread: [predation()] });
    const { cases, problems } = await neonateFeedingCases(base, { plan: { parsed: plan, outputFile: "p" }, beat: { parsed: feedingBeat, outputFile: "b" } }, call);
    expect(problems).toEqual([]);
    expect(asked.map((a) => [a.role, a.caseId, a.players])).toEqual([["thread", NEONATE_CASES.thread, 1]]);
    const [threadCase, beatCase] = cases;
    expect(threadCase).toMatchObject({ id: NEONATE_CASES.thread, role: "thread" });
    expect(threadCase.state?.players.player1.beatHistory[0].choice).toBe(1);
    expect(beatCase).toMatchObject({ id: NEONATE_CASES.beat, role: "beat" });
    expect(beatCase.fixedAnalysis?.kind).toBe("thread");
    expect(beatCase.tags).toMatchObject({ analysisTurn: true, category: "neonate-feeding" });
    expect(caseStory(beatCase).getCurrentThreadDuration()).toBe(2);
    // The planner was asked on exactly the thread case's input, so the migration check can reuse the call
    expect(asked[0].request.prompt).toBe(threadStep.request(caseStory(threadCase, false)).prompt);
  });

  it("builds nothing when the stored first beat offers no feeding option, and says when the plan is no feeding chapter", async () => {
    const none = await neonateFeedingCases(base, { plan: { parsed: plan, outputFile: "p" }, beat: { parsed: beatSet(1), outputFile: "b" } }, fakeCall({}).call);
    expect(none.cases).toEqual([]);
    expect(none.problems[0]).toContain("no feeding option");
    const other = await neonateFeedingCases(base, { plan: { parsed: plan, outputFile: "p" }, beat: { parsed: feedingBeat, outputFile: "b" } }, fakeCall({ thread: [threadAnalysis("challenge", 2, 1)] }).call);
    expect(other.cases).toHaveLength(2);
    expect(other.problems[0]).toContain("no feeding chapter");
  });
});

describe("multiplayerAfterFirstCases", () => {
  const players = ["player1", "player2"];
  const opening = evalCase("cont-tpl-abcd1234-p2-t1", "beat", {
    state: firstThreadAnalysis(2, { maxTurns: 25 }).getState(),
    fixedAnalysis: { kind: "thread", phase: threadAnalysis("challenge", 2, 1, players) },
    tags: tags({ players: 2, multiplayer: true, analysisTurn: true }),
  });
  const challengeSet = () => beatSet(2, {
    player1: { ...beatSet(2).player1, options: challengeOptions() },
    player2: { ...beatSet(2).player2, options: challengeOptions() },
  } as never);

  it("plays the first chapter to its end, then freezes the switch plan, the switch turn, the next chapter plan and its first step", async () => {
    const { call, asked } = fakeCall({
      beat: [challengeSet(), beatSet(2)],
      switch: [switchAnalysis(players, 0)],
      thread: [threadAnalysis("challenge", 3, 0, players)],
    });
    const { cases, problems } = await multiplayerAfterFirstCases(opening, { parsed: challengeSet(), outputFile: "outputs/step1.json" }, call);
    expect(problems).toEqual([]);
    expect(asked.map((a) => [a.role, a.caseId, a.players])).toEqual([
      ["beat", "build-beat-round-mp-abcd1234-p2-t2", 2],
      ["switch", "round-switch-mp-abcd1234-p2-t3", 2],
      ["beat", "round-beat-mp-switchturn-abcd1234-p2-t3", 2],
      ["thread", "round-thread-mp-abcd1234-p2-t4", 2],
    ]);
    expect(cases.map((c) => [c.id, c.role, c.fixedAnalysis?.kind])).toEqual([
      ["round-switch-mp-abcd1234-p2-t3", "switch", undefined],
      ["round-beat-mp-switchturn-abcd1234-p2-t3", "beat", "switch"],
      ["round-thread-mp-abcd1234-p2-t4", "thread", undefined],
      ["round-beat-mp-abcd1234-p2-t4", "beat", "thread"],
    ]);
    expect(cases.every((c) => c.tags.multiplayer && c.tags.category === "multiplayer-after-first")).toBe(true);
    // The switch comes after the first chapter, and the chapter plan after the switch turn
    const switchStory = caseStory(cases[0], false);
    expect(switchStory.determineNextBeatType()).toBe("switch");
    expect(switchStory.hasThreadAnalysis()).toBe(true);
    expect(caseStory(cases[3]).getCurrentBeatType()).toBe("thread");
  });

  it("stops where a call produced nothing, keeping the cases built so far", async () => {
    const { cases, problems } = await multiplayerAfterFirstCases(
      opening,
      { parsed: challengeSet(), outputFile: "s" },
      fakeCall({ beat: [challengeSet()], switch: [] }).call
    );
    expect(cases.map((c) => c.id)).toEqual(["round-switch-mp-abcd1234-p2-t3"]);
    expect(problems[0]).toContain("switch plan");
  });
});
