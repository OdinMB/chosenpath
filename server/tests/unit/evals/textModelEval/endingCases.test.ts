import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import type { StoryState } from "core/types/index.js";
import { GameModes } from "core/types/index.js";
import { caseStory } from "../../../../src/evals/textModelEval/cases.js";
import { evalFiles } from "../../../../src/evals/textModelEval/evalFiles.js";
import { ENDING_STATE_BUILT_CASES } from "../../../../src/evals/textModelEval/arms.js";
import {
  ENDING_CASE_SPECS,
  beforeSwitchTurn,
  endingCasesToFreeze,
  endingStateCases,
} from "../../../../src/evals/textModelEval/endingCases.js";
import type { ChainRun } from "../../../../src/evals/textModelEval/setupChain.js";
import { outcomeStatesAtEnding } from "../../../../src/game/services/storyTextRounds/endingState.js";
import { endedChapter, flavorSwitch, outcome, roundStory, topicSwitch } from "../../../helpers/roundStories.js";
import { stat } from "../../../helpers/textFixtures.js";
import { evalCase } from "./fixtures.js";

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const EXPOSE = "player1_expose_waste_ring";
const IDENTITY = "player1_redefine_identity";
const INFLUENCE = "player1_influence_city_ai";

/** Novi Reg after its second chapter (turn 8): the Waste Ring at 1 of 3, the chapter that just ended on it. */
function noviRegT8(): StoryState {
  return roundStory({
    turns: 8,
    maxTurns: 20,
    playerOutcomes: {
      player1: [
        outcome(EXPOSE, { intendedNumberOfMilestones: 3, milestones: ["The ledger is found"] }),
        outcome(IDENTITY, { intendedNumberOfMilestones: 2 }),
        outcome(INFLUENCE, { intendedNumberOfMilestones: 1 }),
      ],
    },
    phases: [topicSwitch([["Dig", EXPOSE]], 0), endedChapter(EXPOSE, 3, 1, "The ledger"), flavorSwitch(EXPOSE, "q", 4), endedChapter(EXPOSE, 3, 5, "The exposé")],
  }).getState();
}

const CONTEST = { sideAWins: "A wins", mixed: "draw", sideBWins: "B wins" };

/**
 * A setup chain's run as setupChain.ts stores it: after the switch turn that
 * follows the first chapter (its milestone, facts and introductions applied),
 * the turn's reply as the game kept it last among the steps.
 */
function chainRun(id: string, players: number, contest: string, scoreboard: string, chapterOutcome: string, extraShared: string[] = []): ChainRun {
  const slots = Array.from({ length: players }, (_, i) => `player${i + 1}`);
  const story = roundStory({
    players,
    turns: 5,
    maxTurns: 25,
    gameMode: players === 3 ? GameModes.CooperativeCompetitive : GameModes.Competitive,
    sharedOutcomes: [
      outcome(contest, { intendedNumberOfMilestones: 3, possibleResolutions: CONTEST, resonance: `Scored by ${scoreboard}.`, milestones: contest === chapterOutcome ? ["The switch turn's milestone"] : [] }),
      ...extraShared.map((sid) => outcome(sid, { intendedNumberOfMilestones: 2, milestones: sid === chapterOutcome ? ["The switch turn's milestone"] : [] })),
    ],
    playerOutcomes: Object.fromEntries(slots.map((slot) => [slot, [outcome(`${slot}_own`)]])),
    phases: [flavorSwitch(chapterOutcome, "q", 0, slots), endedChapter(chapterOutcome, 3, 1, "The chapter", slots), topicSwitch([["Next", contest]], 4, slots)],
  });
  const state = story.getState();
  const withChanges: StoryState = {
    ...state,
    sharedStats: [stat(scoreboard, { type: "opposites" })],
    sharedStatValues: [{ statId: scoreboard, value: 50 }],
    storyElements: [{ ...(state.storyElements[0] ?? {}), id: "ada", name: "Ada", facts: ["An old fact", "The switch turn's fact"] } as StoryState["storyElements"][number]],
    worldFacts: ["A world fact", "The switch turn's world fact"],
    players: Object.fromEntries(
      Object.entries(state.players).map(([slot, p]) => [slot, { ...p, knownStoryElements: slot === "player1" ? ["ada"] : ["ada", "old_friend"] }])
    ),
  };
  const start: StoryState = {
    ...withChanges,
    storyElements: withChanges.storyElements.map((e) => ({ ...e, facts: ["An old fact"] })),
    worldFacts: ["A world fact"],
    players: Object.fromEntries(Object.entries(withChanges.players).map(([slot, p]) => [slot, { ...p, beatHistory: [], knownStoryElements: slot === "player2" ? ["old_friend"] : [] }])),
  };
  const reply = {
    statChanges: [],
    newMilestones: [{ type: "newMilestone", outcomeGroup: "shared", outcome: chapterOutcome, newMilestone: "The switch turn's milestone" }],
    ...Object.fromEntries(
      slots.map((slot, i) => [
        slot,
        {
          plan: {
            establishedFacts: i === 0 ? [{ type: "newFact", storyElementId: "ada", fact: "The switch turn's fact" }, { type: "newFact", storyElementId: "world", fact: "The switch turn's world fact" }] : [],
            newGameElements: [],
            newIntroductionsOfStoryElements: [{ type: "addIntroductionOfStoryElement", player: slot, storyElementId: "ada" }],
          },
        },
      ])
    ),
  };
  return {
    premise: { id, premiseId: `setup-${id}`, maxTurns: 25, tests: "" },
    sample: 1,
    input: { premise: "p", playerCount: players as 2 | 3, gameMode: withChanges.gameMode, maxTurns: 25 },
    steps: [
      { kind: "setup", turn: 0, caseId: `${id}-s1-00-setup`, armKey: "a" },
      { kind: "switch plan", turn: 4, caseId: `${id}-s1-08-switch-plan`, armKey: "a" },
      { kind: "switch turn", turn: 4, caseId: `${id}-s1-09-switch-turn`, armKey: "a", output: reply },
    ],
    start,
    end: withChanges,
    stopped: "the switch turn after the first chapter",
  };
}

const bounty = () => chainRun("chain-bounty-hunters", 2, "shared_bounty_claim", "shared_bounty_score", "shared_bounty_claim");
const cofounders = () => chainRun("chain-cofounders", 3, "shared_lattice_governance", "shared_governance_score", "shared_north_quay_pilot", ["shared_north_quay_pilot"]);
const frozenBases = () => [evalCase("synth-8988006e-t8-pregeneration_7_player1_2", "beat", { state: noviRegT8() })];

describe("a setup chain's story cut back before its switch turn", () => {
  it("drops the switch turn's beat, its plan, and what it added: its milestone, its facts, the introductions nothing earlier made", () => {
    const run = bounty();
    const state = beforeSwitchTurn(run);
    expect(Object.values(state.players).map((p) => p.beatHistory.length)).toEqual([4, 4]);
    expect(state.storyPhases).toHaveLength(2);
    expect(state.sharedOutcomes[0].milestones).toEqual([]);
    expect(state.storyElements.find((e) => e.id === "ada")?.facts).toEqual(["An old fact"]);
    expect(state.worldFacts).toEqual(["A world fact"]);
    expect(state.players.player1.knownStoryElements).toEqual([]);
    // Known from the start, so the turn's introduction added nothing there
    expect(state.players.player2.knownStoryElements).toEqual(["old_friend"]);
    // The run is left as it was
    expect(run.end?.storyPhases).toHaveLength(3);
    expect(run.end?.sharedOutcomes[0].milestones).toEqual(["The switch turn's milestone"]);
  });

  it("refuses a run that did not stop after its switch turn", () => {
    const run = { ...bounty(), steps: bounty().steps.slice(0, 2) };
    expect(() => beforeSwitchTurn(run)).toThrow(/switch turn/);
  });
});

describe("the built endings (ending-state, 2026-09-30)", () => {
  const { cases, problems } = endingStateCases(frozenBases(), [bounty(), cofounders()]);
  const byId = new Map(cases.map((c) => [c.id, c]));

  it("builds one ending per spec, each marked as a round ending case", () => {
    expect(problems).toEqual([]);
    expect(cases.map((c) => c.id)).toEqual([...ENDING_STATE_BUILT_CASES.single, ...ENDING_STATE_BUILT_CASES.groups]);
    expect(ENDING_CASE_SPECS.map((s) => s.id)).toEqual(cases.map((c) => c.id));
    for (const built of cases) {
      expect(built.role).toBe("beat");
      expect(built.tags).toMatchObject({ source: "round", category: "ending-state", ending: true, beatType: "ending", hasStoredOutput: false });
      expect(caseStory(built).getCurrentBeatType()).toBe("ending");
      expect(built.fixedAnalysis).toBeUndefined();
    }
  });

  it("a single player: the Waste Ring complete with the ending's milestone, the other two unfinished", () => {
    const story = caseStory(byId.get("round-end-complete-8988006e-t8")!);
    expect(outcomeStatesAtEnding(story).map((s) => [s.id, s.milestones, s.intended, s.complete])).toEqual([
      [EXPOSE, 2, 2, true],
      [IDENTITY, 0, 2, false],
      [INFLUENCE, 0, 1, false],
    ]);
  });

  it("the two-player contest complete, and the same contest unfinished, side B ahead on the scoreboard in both", () => {
    const complete = caseStory(byId.get("round-end-contest-complete-bounty-t4")!);
    const unfinished = caseStory(byId.get("round-end-contest-unfinished-bounty-t4")!);
    expect(outcomeStatesAtEnding(complete)[0]).toMatchObject({ id: "shared_bounty_claim", milestones: 1, intended: 1, complete: true });
    expect(outcomeStatesAtEnding(unfinished)[0]).toMatchObject({ id: "shared_bounty_claim", milestones: 1, intended: 3, complete: false });
    for (const story of [complete, unfinished]) {
      expect(story.getCurrentTurn()).toBe(4);
      expect(story.getState().sharedStatValues.find((v) => v.statId === "shared_bounty_score")?.value).toBe(35);
      expect(story.getResolvedThreadAnalysis()?.threads.map((t) => t.outcomeId)).toEqual(["shared_bounty_claim"]);
    }
  });

  it("three players in two camps: the pilot complete, the camps' contest unfinished with player1's camp ahead", () => {
    const story = caseStory(byId.get("round-end-camps-cofounders-t4")!);
    const states = outcomeStatesAtEnding(story);
    expect(states.find((s) => s.id === "shared_north_quay_pilot")).toMatchObject({ milestones: 1, intended: 1, complete: true });
    expect(states.find((s) => s.id === "shared_lattice_governance")).toMatchObject({ milestones: 0, complete: false });
    expect(story.getState().sharedStatValues.find((v) => v.statId === "shared_governance_score")?.value).toBe(60);
    expect(story.getNumberOfPlayers()).toBe(3);
  });

  it("reports what is missing instead of building from nothing", () => {
    const missing = endingStateCases([], []);
    expect(missing.cases).toEqual([]);
    expect(missing.problems).toEqual([
      "round-end-complete-8988006e-t8: no frozen case synth-8988006e-t8-pregeneration_7_player1_2",
      "round-end-contest-complete-bounty-t4: no setup chain run chain-bounty-hunters s1",
      "round-end-contest-unfinished-bounty-t4: no setup chain run chain-bounty-hunters s1",
      "round-end-camps-cofounders-t4: no setup chain run chain-cofounders s1",
    ]);
  });

  it("reports a built state that is not the ending its spec says, instead of freezing it", () => {
    const early = [evalCase("synth-8988006e-t8-pregeneration_7_player1_2", "beat", { state: { ...noviRegT8(), storyPhases: noviRegT8().storyPhases.slice(0, 3) } })];
    expect(endingStateCases(early, [bounty(), cofounders()]).problems).toEqual([expect.stringMatching(/^round-end-complete-8988006e-t8: /)]);
  });

  it("freezes only the endings not frozen yet, unless rebuilding (--build-ending-cases)", () => {
    const fresh = endingCasesToFreeze([...frozenBases(), cases[0]], [bounty(), cofounders()], false);
    expect(fresh.skipped).toEqual([cases[0].id]);
    expect(fresh.cases.map((c) => c.id)).toEqual(cases.slice(1).map((c) => c.id));
    expect(endingCasesToFreeze([...frozenBases(), cases[0]], [bounty(), cofounders()], true).cases).toHaveLength(4);
  });
});

const CASES_DIR = path.resolve("..", "DOCS", "2026-09-26_gpt6-text-eval");
const files = evalFiles(CASES_DIR);
const haveBoth = fs.existsSync(path.join(CASES_DIR, "cases", "cases.json")) && fs.existsSync(path.join(CASES_DIR, "setup-chain.json"));

(haveBoth ? describe : describe.skip)("on the frozen case and the stored setup chain", () => {
  it("builds every ending with its outcomes where its spec says", () => {
    const chain = files.readSetupChain() as { runs: ChainRun[] };
    const { cases, problems } = endingStateCases(files.readCases(), chain.runs);
    expect(problems).toEqual([]);
    expect(cases).toHaveLength(4);
  });
});
