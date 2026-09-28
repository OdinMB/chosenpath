import type { Outcome, StoryState } from "core/types/index.js";
import { GameModes } from "core/types/index.js";
import {
  NO_OUTCOMES_PROBLEM,
  NO_SHARED_OUTCOME_PROBLEM,
  contestsPlayable,
  isContestedOutcome,
  storyStartProblem,
  storyStateStartProblem,
  templateStartProblem,
} from "core/utils/outcomeReadiness.js";
import { outcome } from "../../helpers/textFixtures.js";

const shared = [outcome("shared_ritual_stopped")];
const mine = [outcome("player1_trust_regained")];

/** A template or setup reply's outcome lists: shared outcomes and each seat's options. */
function setup(sharedOutcomes: Outcome[], seats: Record<string, Outcome[]>) {
  return {
    sharedOutcomes,
    ...Object.fromEntries(Object.entries(seats).map(([slot, outcomes]) => [slot, { outcomes }])),
  };
}

describe("storyStartProblem", () => {
  it("refuses a story with no outcomes at all", () => {
    expect(storyStartProblem({ sharedOutcomes: [], seatOutcomes: [[]], playerCount: 1 })).toBe(NO_OUTCOMES_PROBLEM);
    expect(storyStartProblem({ sharedOutcomes: undefined, seatOutcomes: [undefined, []], playerCount: 2 })).toBe(
      NO_OUTCOMES_PROBLEM
    );
  });

  it("refuses a multiplayer story without a shared outcome", () => {
    expect(storyStartProblem({ sharedOutcomes: [], seatOutcomes: [mine, []], playerCount: 2 })).toBe(
      NO_SHARED_OUTCOME_PROBLEM
    );
  });

  it("starts a single-player story with only shared outcomes, or only its seat's", () => {
    expect(storyStartProblem({ sharedOutcomes: shared, seatOutcomes: [[]], playerCount: 1 })).toBeNull();
    expect(storyStartProblem({ sharedOutcomes: [], seatOutcomes: [mine], playerCount: 1 })).toBeNull();
  });

  it("starts a multiplayer story with a shared outcome, even when the seats have none", () => {
    expect(storyStartProblem({ sharedOutcomes: shared, seatOutcomes: [[], []], playerCount: 2 })).toBeNull();
  });
});

describe("templateStartProblem", () => {
  it("reads only the seats in play", () => {
    const secondSeatOnly = setup([], { player1: [], player2: [outcome("player2_debt_paid")], player3: [] });

    expect(templateStartProblem(secondSeatOnly, 1)).toBe(NO_OUTCOMES_PROBLEM);
    expect(templateStartProblem(secondSeatOnly, 2)).toBe(NO_SHARED_OUTCOME_PROBLEM);
  });

  it("starts a template whose seats in play have what the story needs", () => {
    const template = setup(shared, { player1: mine, player2: [] });

    expect(templateStartProblem(template, 1)).toBeNull();
    expect(templateStartProblem(template, 2)).toBeNull();
  });

  it("treats a missing list or seat as empty", () => {
    expect(templateStartProblem({}, 1)).toBe(NO_OUTCOMES_PROBLEM);
    expect(templateStartProblem(setup(shared, {}), 3)).toBeNull();
  });
});

describe("storyStateStartProblem", () => {
  function state(sharedOutcomes: Outcome[], seats: Record<string, Outcome[]>): Pick<StoryState, "sharedOutcomes" | "players"> {
    return {
      sharedOutcomes,
      players: Object.fromEntries(
        Object.entries(seats).map(([slot, outcomes]) => [slot, { outcomes } as StoryState["players"][string]])
      ),
    };
  }

  it("applies the rule to the story's shared outcomes and its players' outcomes", () => {
    expect(storyStateStartProblem(state([], { player1: [], player2: mine }), 2)).toBe(NO_SHARED_OUTCOME_PROBLEM);
    expect(storyStateStartProblem(state([], { player1: [] }), 1)).toBe(NO_OUTCOMES_PROBLEM);
    expect(storyStateStartProblem(state(shared, { player1: [], player2: [] }), 2)).toBeNull();
  });
});

describe("isContestedOutcome", () => {
  it("is true for an outcome with side A and side B resolutions only", () => {
    const contest = outcome("shared_crown", {
      possibleResolutions: { sideAWins: "A takes the crown.", mixed: "They share it.", sideBWins: "B takes the crown." },
    });
    expect(isContestedOutcome(contest)).toBe(true);
    expect(isContestedOutcome(outcome("shared_ritual_stopped"))).toBe(false);
  });
});

describe("contestsPlayable", () => {
  it("is true for two or more players in a competitive or cooperative-competitive game", () => {
    expect(contestsPlayable(GameModes.Competitive, 2)).toBe(true);
    expect(contestsPlayable(GameModes.CooperativeCompetitive, 3)).toBe(true);
  });

  it("is false in cooperative and single-player games, and for one player in any mode", () => {
    expect(contestsPlayable(GameModes.Cooperative, 2)).toBe(false);
    expect(contestsPlayable(GameModes.SinglePlayer, 1)).toBe(false);
    expect(contestsPlayable(GameModes.Competitive, 1)).toBe(false);
    expect(contestsPlayable(undefined, 3)).toBe(false);
  });
});
