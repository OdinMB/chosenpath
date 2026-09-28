import { jest } from "@jest/globals";
import type { Story } from "core/models/Story.js";
import type { GameMode, Outcome, Switch, SwitchAnalysis, Thread, ThreadAnalysis } from "core/types/index.js";
import { GameModes } from "core/types/index.js";
import {
  checkedSwitchPlan,
  checkedThreadPlan,
  checkSwitchPlan,
  checkThreadPlan,
  logPlanRepairs,
  withPlanProblem,
} from "../../../../src/game/services/planChecks.js";
import { UnusableResultError } from "../../../../src/game/services/retryOnce.js";
import type { Repair } from "../../../../src/game/services/textRepairs.js";
import {
  firstThreadAnalysis,
  switchAnalysisAfterThread,
  threadAnalysisAfterSwitch,
} from "../../../helpers/promptStories.js";
import { outcome, switchAnalysis, thread, threadAnalysis, type ThreadKind } from "../../../helpers/textFixtures.js";

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// --- Stories and plans ---

const ESCAPE = outcome("shared_escape");
const CROWN = outcome("shared_crown", {
  possibleResolutions: { sideAWins: "Side A takes the crown.", mixed: "They share it.", sideBWins: "Side B takes the crown." },
});
const TRUST = outcome("player1_trust");
const DEBT = outcome("player2_debt");

/** The story with these shared outcomes and these outcomes on the players' lists (none for a player not named). */
function withOutcomes(story: Story, shared: Outcome[], perPlayer: Record<string, Outcome[]> = {}): Story {
  const players = Object.fromEntries(
    Object.entries(story.getPlayers()).map(([slot, player]) => [slot, { ...player, outcomes: perPlayer[slot] ?? [] }])
  );
  return story.clone({ sharedOutcomes: shared, players });
}

const PLAYER_OUTCOMES = { player1: [TRUST], player2: [DEBT] };
const modeOf = (gameMode?: GameMode) => (gameMode ? { gameMode } : {});

/** A later switch analysis (turn 3) in a story holding ESCAPE and the players' outcomes. */
const switchStory = (players = 1, gameMode?: GameMode) =>
  withOutcomes(switchAnalysisAfterThread(players, modeOf(gameMode)), [ESCAPE], PLAYER_OUTCOMES);

/** A later thread analysis (turn 4) in a story holding ESCAPE, CROWN and the players' outcomes. */
const threadStory = (players = 1, gameMode?: GameMode) =>
  withOutcomes(threadAnalysisAfterSwitch(players, modeOf(gameMode)), [ESCAPE, CROWN], PLAYER_OUTCOMES);

/** The first thread analysis of a story (turn 1, no thread plan yet). */
const firstThreadStory = (players: number, gameMode?: GameMode, shared: Outcome[] = [ESCAPE, CROWN]) =>
  withOutcomes(firstThreadAnalysis(players, modeOf(gameMode)), shared, PLAYER_OUTCOMES);

const GOOD = [
  "Search the flooded archive for the missing ledger (shared_escape)",
  "Confront the harbor master about the forged permits (player1_trust)",
  "Follow the smugglers to their hidden cove at dusk (shared_escape)",
  "Bribe the lighthouse keeper for the tide tables (player1_trust)",
];

function topic(players: string[], topicChoices: string[], id = "a_switch"): Switch {
  return { ...switchAnalysis(players).switches[0], players, topicChoices, id };
}

function flavor(players: string[], outcomeId: string, question: string, id = "a_flavor"): Switch {
  return { ...topic(players, [], id), type: "flavor", outcomeId, question };
}

function switchPlan(story: Story, switches: Switch[]): SwitchAnalysis {
  return { ...switchAnalysis(story.getPlayerSlots()), switches };
}

function aThread(kind: ThreadKind, steps: number, sideA: string[], sideB: string[] = [], overrides: Partial<Thread> = {}): Thread {
  return { ...thread(kind, steps, 0, sideA, sideB), outcomeId: "shared_escape", ...overrides };
}

function threadPlan(threads: Thread[], duration = threads[0]?.progression.length ?? 3): ThreadAnalysis {
  return { ...threadAnalysis("challenge", duration, 0), duration, threads };
}

const kinds = (repairs: Repair[]) => repairs.filter((r) => !r.note).map((r) => r.kind);
const notes = (repairs: Repair[]) => repairs.filter((r) => r.note).map((r) => r.kind);

// --- Switch plans ---

describe("checkSwitchPlan", () => {
  it("passes a usable plan through unchanged", () => {
    const story = switchStory(2);
    const reply = switchPlan(story, [topic(["player1"], GOOD.slice(0, 3), "s1"), flavor(["player2"], "player2_debt", "Does Kai pay?")]);

    const result = checkSwitchPlan(story, reply);

    expect(result.problem).toBeUndefined();
    expect(result.repairs).toEqual([]);
    expect(result.plan).toEqual(reply);
  });

  describe("players (PL-1)", () => {
    it("keeps a player in the first switch they are in, and drops a switch left without players", () => {
      const story = switchStory(2);
      const reply = switchPlan(story, [
        topic(["player1"], GOOD.slice(0, 3), "s1"),
        topic(["player1", "player2"], GOOD.slice(0, 3), "s2"),
        topic(["player2"], GOOD.slice(0, 3), "s3"),
      ]);

      const result = checkSwitchPlan(story, reply);

      expect(result.plan.switches.map((s) => [s.id, s.players])).toEqual([
        ["s1", ["player1"]],
        ["s2", ["player2"]],
      ]);
      expect(kinds(result.repairs)).toEqual(["switchPlayerRepeated", "switchPlayerRepeated", "switchDropped"]);
      expect(result.problem).toBeUndefined();
    });

    it("gives a single player the first switch only", () => {
      const story = switchStory(1);
      const reply = switchPlan(story, [topic(["player1"], GOOD.slice(0, 3), "s1"), topic(["player1"], GOOD.slice(1, 4), "s2")]);

      const result = checkSwitchPlan(story, reply);

      expect(result.plan.switches.map((s) => s.id)).toEqual(["s1"]);
      expect(kinds(result.repairs)).toEqual(["switchPlayerRepeated", "switchDropped"]);
      expect(result.problem).toBeUndefined();
    });

    it("drops a slot the story doesn't have", () => {
      const story = switchStory(1);
      const reply = switchPlan(story, [topic(["player1", "player2"], GOOD.slice(0, 3))]);

      const result = checkSwitchPlan(story, reply);

      expect(result.plan.switches[0].players).toEqual(["player1"]);
      expect(kinds(result.repairs)).toEqual(["switchSlotUnknown"]);
    });

    it("finds a player in no switch a problem", () => {
      const story = switchStory(2);
      const result = checkSwitchPlan(story, switchPlan(story, [topic(["player1"], GOOD.slice(0, 3))]));

      expect(result.problem).toContain("player2 is in no switch");
    });
  });

  describe("flavor switches (PL-2)", () => {
    it("clears a flavor switch's directions", () => {
      const story = switchStory(1);
      const reply = switchPlan(story, [{ ...flavor(["player1"], "shared_escape", "Do they get out?"), topicChoices: GOOD.slice(0, 3) }]);

      const result = checkSwitchPlan(story, reply);

      expect(result.plan.switches[0].topicChoices).toEqual([]);
      expect(kinds(result.repairs)).toEqual(["flavorDirectionsCleared"]);
      expect(result.problem).toBeUndefined();
    });

    it("finds an unknown outcome a problem, naming it and the story's outcomes", () => {
      const story = switchStory(1);
      const result = checkSwitchPlan(story, switchPlan(story, [flavor(["player1"], "shared_escpe", "Do they get out?")]));

      expect(result.problem).toContain('"shared_escpe"');
      expect(result.problem).toContain("use one of: shared_escape, player1_trust");
    });

    it("finds a blank question a problem", () => {
      const story = switchStory(1);
      const result = checkSwitchPlan(story, switchPlan(story, [flavor(["player1"], "shared_escape", "  ")]));

      expect(result.problem).toContain("question");
    });
  });

  describe("topic directions (PL-3)", () => {
    const STORED_JUNK = ["relationshipToOtherSwitches״: ", "title״: ", "id״: ", "description״: ", "relationshipToOtherSwitches  "];
    const OTHER_JUNK = [
      "",
      "   ",
      "Go north",
      "players: player1 and player2 search together",
      'description": "Search the flooded archive',
      'Search the flooded archive", "relationshipToOtherSwitches": "single',
      "Search the flooded archive for the ledger”: now",
    ];

    it.each([...STORED_JUNK, ...OTHER_JUNK])("drops the junk direction %j", (junk) => {
      const story = switchStory(1);
      const reply = switchPlan(story, [topic(["player1"], [GOOD[0], junk, GOOD[1]])]);

      const result = checkSwitchPlan(story, reply);

      expect(result.plan.switches[0].topicChoices).toEqual([GOOD[0], GOOD[1]]);
      expect(kinds(result.repairs)).toEqual(["directionJunk"]);
      // Two usable directions left is enough
      expect(result.problem).toBeUndefined();
    });

    it("keeps a direction that only starts with a field name's letters", () => {
      const story = switchStory(1);
      const choices = [
        "Title fight at the harbor against the champion (shared_escape)",
        "Identify the forger behind the permits (player1_trust)",
        "Types of rope matter when climbing the cliff (shared_escape)",
      ];

      const result = checkSwitchPlan(story, switchPlan(story, [topic(["player1"], choices)]));

      expect(result.plan.switches[0].topicChoices).toEqual(choices);
      expect(result.repairs).toEqual([]);
    });

    it("drops a direction whose bracketed ids are all unknown", () => {
      const story = switchStory(1);
      const unknownOnly = "Sneak into the governor's ball tonight (shared_ball, player1_mask)";
      const oneKnown = "Sneak into the governor's ball tonight (shared_escape, player1_mask)";

      const result = checkSwitchPlan(story, switchPlan(story, [topic(["player1"], [GOOD[0], unknownOnly, oneKnown])]));

      expect(result.plan.switches[0].topicChoices).toEqual([GOOD[0], oneKnown]);
      expect(kinds(result.repairs)).toEqual(["directionUnknownOutcomes"]);
    });

    it("keeps directions naming two known outcomes or none, with notes", () => {
      const story = switchStory(1);
      const two = "Search the flooded archive for the ledger (shared_escape, player1_trust)";
      const none = "Walk the quiet streets at night and think it all over";

      const result = checkSwitchPlan(story, switchPlan(story, [topic(["player1"], [GOOD[0], two, none])]));

      expect(result.plan.switches[0].topicChoices).toEqual([GOOD[0], two, none]);
      expect(kinds(result.repairs)).toEqual([]);
      expect(notes(result.repairs)).toEqual(["directionManyOutcomes", "directionNoOutcome"]);
    });

    it("keeps the first three directions", () => {
      const story = switchStory(1);
      const result = checkSwitchPlan(story, switchPlan(story, [topic(["player1"], GOOD)]));

      expect(result.plan.switches[0].topicChoices).toEqual(GOOD.slice(0, 3));
      expect(kinds(result.repairs)).toEqual(["directionsTrimmed"]);
    });

    it("finds fewer than two usable directions a problem", () => {
      const story = switchStory(1);
      const result = checkSwitchPlan(story, switchPlan(story, [topic(["player1"], [GOOD[0], "title״: ", ""], "choose_path")]));

      expect(result.plan.switches[0].topicChoices).toEqual([GOOD[0]]);
      expect(result.problem).toContain('the topic switch "choose_path"');
    });
  });

  it("skips the outcome rules in a story that holds no outcomes, with a note", () => {
    const story = switchAnalysisAfterThread(1);
    const invented = ["Search the flooded archive (made_up_outcome)", "Confront the harbor master (another_made_up)"];

    const flavorResult = checkSwitchPlan(story, switchPlan(story, [flavor(["player1"], "made_up_outcome", "Do they get out?")]));
    const topicResult = checkSwitchPlan(story, switchPlan(story, [topic(["player1"], invented)]));

    expect(flavorResult.problem).toBeUndefined();
    expect(topicResult.problem).toBeUndefined();
    expect(topicResult.plan.switches[0].topicChoices).toEqual(invented);
    expect(notes(flavorResult.repairs)).toEqual(["outcomeChecksSkipped"]);
    expect(notes(topicResult.repairs)).toEqual(["outcomeChecksSkipped"]);
  });
});

// --- Thread plans ---

describe("checkThreadPlan", () => {
  it("passes a usable plan through unchanged", () => {
    const story = threadStory(1);
    const reply = threadPlan([aThread("challenge", 3, ["player1"])]);

    const result = checkThreadPlan(story, reply);

    expect(result.problem).toBeUndefined();
    expect(result.repairs).toEqual([]);
    expect(result.plan).toEqual(reply);
  });

  describe("players (PL-4)", () => {
    it("gives a single player the first thread only", () => {
      const story = threadStory(1);
      const reply = threadPlan([aThread("challenge", 3, ["player1"], [], { id: "t1" }), aThread("challenge", 3, ["player1"], [], { id: "t2" })]);

      const result = checkThreadPlan(story, reply);

      expect(result.plan.threads.map((t) => t.id)).toEqual(["t1"]);
      expect(kinds(result.repairs)).toEqual(["threadPlayerRepeated", "threadDropped"]);
      expect(result.problem).toBeUndefined();
    });

    it("keeps a player in the first thread they are in", () => {
      const story = threadStory(3);
      const reply = threadPlan([
        aThread("challenge", 3, ["player1", "player2"], [], { id: "t1" }),
        aThread("challenge", 3, ["player2", "player3"], [], { id: "t2" }),
      ]);

      const result = checkThreadPlan(story, reply);

      expect(result.plan.threads.map((t) => t.playersSideA)).toEqual([["player1", "player2"], ["player3"]]);
      expect(kinds(result.repairs)).toEqual(["threadPlayerRepeated"]);
      expect(result.problem).toBeUndefined();
    });

    it("drops a slot the story doesn't have", () => {
      const story = threadStory(1);
      const result = checkThreadPlan(story, threadPlan([aThread("challenge", 3, ["player1", "player3"])]));

      expect(result.plan.threads[0].playersSideA).toEqual(["player1"]);
      expect(kinds(result.repairs)).toEqual(["threadSlotUnknown"]);
    });

    it("finds a player in no thread a problem", () => {
      const story = threadStory(2);
      const result = checkThreadPlan(story, threadPlan([aThread("challenge", 3, ["player1"])]));

      expect(result.problem).toContain("player2 is in no thread");
    });
  });

  describe("contests (PL-5)", () => {
    const contest = () => aThread("contest", 3, ["player1"], ["player2"], { outcomeId: "shared_crown" });

    it("finds a contest in a cooperative game a problem", () => {
      const result = checkThreadPlan(threadStory(2, GameModes.Cooperative), threadPlan([contest()]));

      expect(result.problem).toContain("contest");
    });

    it.each([GameModes.Competitive, GameModes.CooperativeCompetitive])("allows a contest in a %s game", (gameMode) => {
      const result = checkThreadPlan(threadStory(2, gameMode), threadPlan([contest()]));

      expect(result.problem).toBeUndefined();
    });

    it("finds a contest with nobody on side A a problem", () => {
      const reply = threadPlan([aThread("contest", 3, [], ["player1", "player2"], { outcomeId: "shared_crown" })]);

      const result = checkThreadPlan(threadStory(2, GameModes.Competitive), reply);

      expect(result.problem).toContain("side A");
    });

    it("finds a contest in a single-player game a problem", () => {
      const result = checkThreadPlan(threadStory(1), threadPlan([aThread("contest", 3, ["player1"], ["player2"])]));

      expect(result.problem).toBeDefined();
    });
  });

  it("finds an unknown outcome a problem, naming it and the story's outcomes (PL-6)", () => {
    const story = threadStory(1);
    const result = checkThreadPlan(story, threadPlan([aThread("challenge", 3, ["player1"], [], { outcomeId: "shared_escpe" })]));

    expect(result.problem).toContain('"shared_escpe"');
    expect(result.problem).toContain("use one of: shared_escape, shared_crown, player1_trust");
  });

  describe("length (PL-7)", () => {
    it("takes the length from the steps when every thread agrees", () => {
      const story = threadStory(1);
      const result = checkThreadPlan(story, threadPlan([aThread("challenge", 2, ["player1"])], 3));

      expect(result.plan.duration).toBe(2);
      expect(kinds(result.repairs)).toEqual(["durationFromSteps"]);
      expect(result.problem).toBeUndefined();
    });

    it("finds threads with different step counts a problem", () => {
      const story = threadStory(2);
      const reply = threadPlan([aThread("challenge", 2, ["player1"], [], { id: "t1" }), aThread("challenge", 3, ["player2"], [], { id: "t2" })], 3);

      expect(checkThreadPlan(story, reply).problem).toContain("steps");
    });

    it.each([1, 5])("finds %i steps a problem", (steps) => {
      const result = checkThreadPlan(threadStory(1), threadPlan([aThread("challenge", steps, ["player1"])], steps));

      expect(result.problem).toContain("steps");
    });
  });

  describe("the length PACING allows (planner v2's length rule, production's check only)", () => {
    // Turn 4 of 10: 6 turns left, this one included, so 2 or 3 beats (4 would leave 2, too few for a switch and a chapter)
    it("finds a length PACING does not allow a problem, naming the lengths it does", () => {
      const result = checkThreadPlan(threadStory(1), threadPlan([aThread("challenge", 4, ["player1"])]), { lengths: true });

      expect(result.problem).toBeUndefined();
      expect(result.lengthProblem).toBe("the thread is 4 beats long, and with 6 turns left, this one included, PACING allows 2 or 3 beats");
    });

    it("asks the last chapter for exactly the turns left", () => {
      const story = threadStory(1).clone({ maxTurns: 7 });
      const result = checkThreadPlan(story, threadPlan([aThread("challenge", 2, ["player1"])]), { lengths: true });

      expect(result.lengthProblem).toBe("the thread is 2 beats long, and with 3 turns left, this one included, PACING allows 3 beats");
      expect(checkThreadPlan(story, threadPlan([aThread("challenge", 3, ["player1"])]), { lengths: true }).lengthProblem).toBeUndefined();
    });

    it("reads the length after it is taken from the steps, the same for a group", () => {
      const story = threadStory(2);
      const reply = threadPlan([aThread("challenge", 4, ["player1", "player2"])], 3);
      expect(checkThreadPlan(story, reply, { lengths: true }).lengthProblem).toContain("the thread is 4 beats long");
    });

    it("finds nothing when no length fits (too few turns left to end on the turn count)", () => {
      const story = threadStory(1).clone({ maxTurns: 5 });
      expect(checkThreadPlan(story, threadPlan([aThread("challenge", 3, ["player1"])]), { lengths: true }).lengthProblem).toBeUndefined();
    });

    it("is not read without the option, so the eval's plan readings stay as they ran", () => {
      expect(checkThreadPlan(threadStory(1), threadPlan([aThread("challenge", 4, ["player1"])])).lengthProblem).toBeUndefined();
    });
  });

  describe("one kind per thread (PL-8)", () => {
    it("finds exploration steps followed by a challenge step a problem", () => {
      const mixed = aThread("exploration", 3, ["player1"]);
      mixed.progression[2] = { ...mixed.progression[2], possibleResolutions: { favorable: "good", mixed: "so-so", unfavorable: "bad" } };

      expect(checkThreadPlan(threadStory(1), threadPlan([mixed])).problem).toContain("result");
    });

    it("finds milestones of another kind than the steps a problem", () => {
      const mixed = { ...aThread("exploration", 3, ["player1"]), possibleMilestones: { favorable: "good", mixed: "so-so", unfavorable: "bad" } };

      expect(checkThreadPlan(threadStory(1), threadPlan([mixed])).problem).toContain("result");
    });

    it("finds contest results without a side B a problem", () => {
      const story = threadStory(2, GameModes.Competitive);
      const reply = threadPlan([aThread("contest", 3, ["player1", "player2"], [], { outcomeId: "shared_crown" })]);

      expect(checkThreadPlan(story, reply).problem).toContain("side B");
    });

    it("finds a filled side B without contest results a problem", () => {
      const story = threadStory(2, GameModes.Competitive);
      const reply = threadPlan([{ ...aThread("challenge", 3, ["player1"]), playersSideB: ["player2"] }]);

      expect(checkThreadPlan(story, reply).problem).toContain("side B");
    });
  });

  it("gives duplicate thread ids a numeric suffix (PL-9)", () => {
    const story = threadStory(3);
    const reply = threadPlan([
      aThread("challenge", 3, ["player1"]),
      aThread("challenge", 3, ["player2"]),
      aThread("challenge", 3, ["player3"]),
    ]);

    const result = checkThreadPlan(story, reply);

    expect(result.plan.threads.map((t) => t.id)).toEqual(["a_thread", "a_thread_2", "a_thread_3"]);
    expect(kinds(result.repairs)).toEqual(["threadIdDuplicate", "threadIdDuplicate"]);
    expect(result.problem).toBeUndefined();
  });

  describe("the first thread of a multiplayer story (PL-10)", () => {
    const together = (overrides: Partial<Thread> = {}) => aThread("challenge", 3, ["player1", "player2"], [], overrides);

    it("finds two threads a problem", () => {
      const reply = threadPlan([aThread("challenge", 3, ["player1"], [], { id: "t1" }), aThread("challenge", 3, ["player2"], [], { id: "t2" })]);

      expect(checkThreadPlan(firstThreadStory(2), reply).problem).toContain("first thread");
    });

    it("finds a thread on a player's outcome a problem when the story holds a shared one", () => {
      const result = checkThreadPlan(firstThreadStory(2), threadPlan([together({ outcomeId: "player1_trust" })]));

      expect(result.problem).toContain("shared outcome");
      expect(result.problem).toContain("use one of: shared_escape, shared_crown");
    });

    it("accepts one thread with every player on a shared outcome", () => {
      expect(checkThreadPlan(firstThreadStory(2), threadPlan([together()])).problem).toBeUndefined();
    });

    it("asks a competitive story for a contested shared outcome when it holds one", () => {
      const story = firstThreadStory(2, GameModes.Competitive);
      const onContested = aThread("contest", 3, ["player1"], ["player2"], { outcomeId: "shared_crown" });

      expect(checkThreadPlan(story, threadPlan([together()])).problem).toContain("contested shared outcome");
      expect(checkThreadPlan(story, threadPlan([onContested])).problem).toBeUndefined();
    });

    it("accepts any shared outcome in a competitive story without a contested one", () => {
      const story = firstThreadStory(2, GameModes.Competitive, [ESCAPE]);

      expect(checkThreadPlan(story, threadPlan([together()])).problem).toBeUndefined();
    });

    it("leaves later threads free to split the players", () => {
      const reply = threadPlan([aThread("challenge", 3, ["player1"], [], { id: "t1" }), aThread("challenge", 3, ["player2"], [], { id: "t2" })]);

      expect(checkThreadPlan(threadStory(2), reply).problem).toBeUndefined();
    });
  });

  describe("contest sides (PL-11)", () => {
    function contest(sideA: string[], sideB: string[]): Thread {
      const base = aThread("contest", 2, sideA, sideB, { outcomeId: "shared_crown" });
      return {
        ...base,
        possibleMilestones: { sideAWins: "A takes the crown", mixed: "They share it", sideBWins: "B takes the crown" },
        progression: base.progression.map((step, i) => ({
          ...step,
          possibleResolutions: { sideAWins: `A leads ${i}`, mixed: `Even ${i}`, sideBWins: `B leads ${i}` },
        })),
      };
    }

    it("puts player1 on side A in a two-player contest, swapping the results", () => {
      const story = threadStory(2, GameModes.Competitive);

      const result = checkThreadPlan(story, threadPlan([contest(["player2"], ["player1"])]));

      const [swapped] = result.plan.threads;
      expect([swapped.playersSideA, swapped.playersSideB]).toEqual([["player1"], ["player2"]]);
      expect(swapped.possibleMilestones).toEqual({ sideAWins: "B takes the crown", mixed: "They share it", sideBWins: "A takes the crown" });
      expect(swapped.progression.map((step) => step.possibleResolutions)).toEqual([
        { sideAWins: "B leads 0", mixed: "Even 0", sideBWins: "A leads 0" },
        { sideAWins: "B leads 1", mixed: "Even 1", sideBWins: "A leads 1" },
      ]);
      expect(kinds(result.repairs)).toEqual(["contestSidesSwapped"]);
      expect(result.problem).toBeUndefined();
    });

    it("puts the lowest slot on side A in a three-player contest", () => {
      const story = threadStory(3, GameModes.Competitive);

      const result = checkThreadPlan(story, threadPlan([contest(["player2"], ["player1", "player3"])]));

      expect([result.plan.threads[0].playersSideA, result.plan.threads[0].playersSideB]).toEqual([["player1", "player3"], ["player2"]]);
      expect(kinds(result.repairs)).toEqual(["contestSidesSwapped"]);
    });

    it("leaves a contest with the lowest slot on side A untouched", () => {
      const story = threadStory(3, GameModes.Competitive);
      const reply = threadPlan([contest(["player1"], ["player2", "player3"])]);

      const result = checkThreadPlan(story, reply);

      expect(result.plan).toEqual(reply);
      expect(result.repairs).toEqual([]);
    });
  });

  it("skips the outcome rules in a story that holds no outcomes, with a note", () => {
    const story = threadAnalysisAfterSwitch(1);
    const result = checkThreadPlan(story, threadPlan([aThread("challenge", 3, ["player1"], [], { outcomeId: "made_up_outcome" })]));

    expect(result.problem).toBeUndefined();
    expect(notes(result.repairs)).toEqual(["outcomeChecksSkipped"]);
  });
});

// --- The retry protocol (PL-13) ---

describe("checked plan calls", () => {
  const unknownOutcome = () => threadPlan([aThread("challenge", 3, ["player1"], [], { outcomeId: "shared_escpe" })]);
  const usable = () => threadPlan([aThread("challenge", 3, ["player1"])]);

  /** A planner call that answers with the given replies in turn, recording each prompt. */
  function planner<P>(...replies: P[]) {
    const prompts: string[] = [];
    const invoke = jest.fn(async (prompt: string) => {
      prompts.push(prompt);
      const reply = replies[prompts.length - 1];
      if (!reply) throw new Error("called too often");
      return reply;
    });
    return { invoke, prompts };
  }

  it("applies a usable reply's repaired plan after one call", async () => {
    const { invoke } = planner(threadPlan([aThread("challenge", 2, ["player1"])], 3));

    const plan = await checkedThreadPlan(threadStory(1), "THE PROMPT", invoke, () => undefined);

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(plan.duration).toBe(2);
  });

  it("calls once more with the problem at the end of the prompt when the reply can't be used", async () => {
    const story = threadStory(1);
    const { invoke, prompts } = planner(unknownOutcome(), usable());

    const plan = await checkedThreadPlan(story, "THE PROMPT", invoke, () => undefined);

    const problem = checkThreadPlan(story, unknownOutcome()).problem ?? "";
    expect(prompts).toEqual(["THE PROMPT", withPlanProblem("THE PROMPT", problem)]);
    expect(prompts[1]).toBe(`THE PROMPT\n\nYour previous plan could not be used: ${problem}. Write the plan again.`);
    expect(plan).toEqual(usable());
  });

  it("fails when the second reply can't be used either, keeping the problem off the message", async () => {
    const { invoke } = planner(unknownOutcome(), unknownOutcome());

    const failure = checkedThreadPlan(threadStory(1), "THE PROMPT", invoke, () => undefined);

    await expect(failure).rejects.toBeInstanceOf(UnusableResultError);
    await expect(failure).rejects.toThrow(/^Failed to generate a usable thread plan$/);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  describe("a chapter length PACING does not allow", () => {
    const tooLong = () => threadPlan([aThread("challenge", 4, ["player1"])]);
    const fits = () => threadPlan([aThread("challenge", 3, ["player1"])]);
    const lengthProblem = () => checkThreadPlan(threadStory(1), tooLong(), { lengths: true }).lengthProblem ?? "";

    it("calls once more, told the lengths PACING allows, and applies the reply that fits", async () => {
      const { invoke, prompts } = planner(tooLong(), fits());

      const plan = await checkedThreadPlan(threadStory(1), "THE PROMPT", invoke, () => undefined);

      expect(prompts[1]).toBe(withPlanProblem("THE PROMPT", lengthProblem()));
      expect(plan.duration).toBe(3);
    });

    it("keeps the second reply when only its length still misses: a length never fails the turn", async () => {
      const lines: string[] = [];
      const { invoke } = planner(tooLong(), tooLong());

      const plan = await checkedThreadPlan(threadStory(1), "THE PROMPT", invoke, (line) => lines.push(line));

      expect(invoke).toHaveBeenCalledTimes(2);
      expect(plan.duration).toBe(4);
      expect(lines.join("\n")).toContain('"lengthNotAllowed":1');
    });

    it("keeps the first reply when the second can't be used at all", async () => {
      const { invoke } = planner(tooLong(), unknownOutcome());

      const plan = await checkedThreadPlan(threadStory(1), "THE PROMPT", invoke, () => undefined);

      expect(plan.duration).toBe(4);
      expect(plan.threads[0].outcomeId).toBe("shared_escape");
    });

    it("tells the retry both problems when the first reply has both", async () => {
      const both = () => threadPlan([aThread("challenge", 4, ["player1"], [], { outcomeId: "shared_escpe" })]);
      const { invoke, prompts } = planner(both(), fits());

      await checkedThreadPlan(threadStory(1), "THE PROMPT", invoke, () => undefined);

      const checked = checkThreadPlan(threadStory(1), both(), { lengths: true });
      expect(prompts[1]).toBe(withPlanProblem("THE PROMPT", `${checked.problem}; ${checked.lengthProblem}`));
    });
  });

  it("checks switch plans the same way", async () => {
    const story = switchStory(1);
    const oneDirection = () => switchPlan(story, [topic(["player1"], [GOOD[0]])]);
    const threeDirections = () => switchPlan(story, [topic(["player1"], GOOD.slice(0, 3))]);

    const retried = planner(oneDirection(), threeDirections());
    await expect(checkedSwitchPlan(story, "THE PROMPT", retried.invoke, () => undefined)).resolves.toEqual(threeDirections());
    expect(retried.prompts[1]).toBe(withPlanProblem("THE PROMPT", checkSwitchPlan(story, oneDirection()).problem ?? ""));

    const failing = planner(oneDirection(), oneDirection());
    await expect(checkedSwitchPlan(story, "THE PROMPT", failing.invoke, () => undefined)).rejects.toThrow(
      /^Failed to generate a usable switch plan$/
    );
  });

  it("logs one [LLM] repair line per reply, with counts only", async () => {
    const lines: string[] = [];
    const { invoke } = planner(threadPlan([aThread("challenge", 2, ["player1", "player3"], [], { outcomeId: "shared_escape" })], 3));

    await checkedThreadPlan(threadStory(1), "THE PROMPT", invoke, (line) => lines.push(line));

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^repair /);
    expect(lines[0]).toContain('"role":"threadAnalysis"');
    expect(lines[0]).toContain('"threadSlotUnknown":1');
    expect(lines[0]).toContain('"durationFromSteps":1');
    expect(lines[0]).not.toContain("shared_escape");
  });

  it("logs the skipped outcome checks once per story", () => {
    const lines: string[] = [];
    const log = (line: string) => lines.push(line);
    const story = threadAnalysisAfterSwitch(1).clone({ id: "story-without-outcomes" });
    const skipped: Repair[] = [{ kind: "outcomeChecksSkipped", note: true }];

    logPlanRepairs("threadAnalysis", story, skipped, log);
    logPlanRepairs("switchAnalysis", story, skipped, log);
    logPlanRepairs("threadAnalysis", story.clone({ id: "another-story-without-outcomes" }), skipped, log);

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("story-without-outcomes");
    expect(lines.join("\n")).not.toMatch(/^repair /m);
  });
});
