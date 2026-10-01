import { jest } from "@jest/globals";
import type { Story } from "core/models/Story.js";
import type { GameMode, Outcome, Switch, SwitchAnalysis, Thread, ThreadAnalysis } from "core/types/index.js";
import { GameModes } from "core/types/index.js";
import { getThreadType } from "core/types/thread.js";
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
import { endedChapter, roundStory, topicSwitch } from "../../../helpers/roundStories.js";
import { pacedLengths, switchPacingProblem } from "../../../../src/game/services/pacing.js";
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

/** A two-step contest on shared_crown with these sides, as planner v2 stores it (its kind riding along). */
function contestThread(sideA: string[], sideB: string[], id: string): Thread {
  const base = aThread("contest", 2, sideA, sideB, { outcomeId: "shared_crown", id });
  return {
    ...base,
    kind: "contest",
    possibleMilestones: { sideAWins: "A takes the crown", mixed: "They share it", sideBWins: "B takes the crown" },
    progression: base.progression.map((step, i) => ({ ...step, possibleResolutions: { sideAWins: `A leads ${i}`, mixed: `Even ${i}`, sideBWins: `B leads ${i}` } })),
  } as Thread;
}

const SHIP = outcome("player3_ship");

/**
 * A group at its chapter plan after a switch where each player picked the
 * direction on the outcome given here, one switch per player; after one
 * chapter, or, with `first`, before the story's first.
 */
function groupAfterPicks(gameMode: GameMode, picks: Record<string, string>, options: { first?: boolean } = {}): Story {
  const slots = Object.keys(picks);
  const own: Record<string, Outcome[]> = { player1: [TRUST], player2: [DEBT], player3: [SHIP] };
  const switches = slots.map((slot) => topic([slot], [`Go after it (${picks[slot]})`], `${slot}_switch`));
  const current = { ...switchAnalysis(slots, options.first ? 0 : 4), switches };
  return roundStory({
    players: slots.length,
    turns: options.first ? 1 : 5,
    maxTurns: 20,
    gameMode,
    sharedOutcomes: [ESCAPE, CROWN],
    playerOutcomes: Object.fromEntries(slots.map((slot) => [slot, own[slot]])),
    phases: options.first ? [current] : [switchAnalysis(slots, 0), endedChapter("shared_escape", 3, 1, "They slip the harbour", slots), current],
    lastChoice: 0,
  });
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

    describe("directions kept beside their outcome (planner v2's topicDirections)", () => {
      type Direction = { direction: string; outcomeId: string };
      const directionsOf = (plan: SwitchAnalysis) => (plan.switches[0] as Switch & { topicDirections?: Direction[] }).topicDirections;
      const JUNK: Direction = { direction: 'Decode the note marked "Red Dawn": who sent it?', outcomeId: "shared_escape" };
      const HARBOR: Direction = { direction: "Confront the harbor master about the forged permits", outcomeId: "player1_trust" };
      const COVE: Direction = { direction: "Follow the smugglers to their hidden cove at dusk", outcomeId: "shared_escape" };
      /** A topic switch as planner v2's assembly stores it: "text (id)" strings, the pairs beside them. */
      const v2Switch = (directions: Direction[]): Switch =>
        ({
          ...topic(["player1"], directions.map((d) => `${d.direction} (${d.outcomeId})`)),
          topicDirections: directions,
        }) as Switch;

      it("drops a junk direction from both lists, so the options and their outcomes stay in step", () => {
        const story = switchStory(1);

        const result = checkSwitchPlan(story, switchPlan(story, [v2Switch([JUNK, HARBOR, COVE])]));

        expect(result.plan.switches[0].topicChoices).toEqual([`${HARBOR.direction} (player1_trust)`, `${COVE.direction} (shared_escape)`]);
        expect(directionsOf(result.plan)).toEqual([HARBOR, COVE]);
        expect(kinds(result.repairs)).toEqual(["directionJunk"]);
      });

      it("trims both lists to three", () => {
        const story = switchStory(1);
        const fourth: Direction = { direction: "Bribe the lighthouse keeper for the tide tables", outcomeId: "player1_trust" };

        const result = checkSwitchPlan(story, switchPlan(story, [v2Switch([HARBOR, COVE, HARBOR, fourth])]));

        expect(directionsOf(result.plan)).toEqual([HARBOR, COVE, HARBOR]);
      });

      it("clears both on a flavor switch", () => {
        const story = switchStory(1);
        const written = { ...v2Switch([HARBOR, COVE]), type: "flavor", outcomeId: "shared_escape", question: "Do they get out?" } as Switch;

        const result = checkSwitchPlan(story, switchPlan(story, [written]));

        expect(result.plan.switches[0].topicChoices).toEqual([]);
        expect(directionsOf(result.plan)).toEqual([]);
      });

      it("leaves a switch planned before planner v2 without them", () => {
        const story = switchStory(1);

        const result = checkSwitchPlan(story, switchPlan(story, [topic(["player1"], GOOD.slice(0, 3))]));

        expect(directionsOf(result.plan)).toBeUndefined();
      });
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

    // The playthroughs of 2026-09-30: the planner put two players into the contest another player picked as well as into
    // the threads they picked, and keeping the first thread dropped both of their picks without a word
    it("keeps a player written into two threads in the one on the outcome their switch pick named", () => {
      const story = groupAfterPicks(GameModes.CooperativeCompetitive, { player1: "shared_crown", player2: "player2_debt", player3: "shared_escape" });
      const reply = threadPlan([
        contestThread(["player1"], ["player2", "player3"], "the_contest"),
        aThread("exploration", 2, ["player2"], [], { id: "debt", outcomeId: "player2_debt" }),
        aThread("challenge", 2, ["player3"], [], { id: "escape", outcomeId: "shared_escape" }),
      ]);

      const result = checkThreadPlan(story, reply);

      expect(result.problem).toBeUndefined();
      expect(result.plan.threads.map((t) => [t.id, t.playersSideA, t.playersSideB])).toEqual([
        ["the_contest", ["player1"], []],
        ["debt", ["player2"], []],
        ["escape", ["player3"], []],
      ]);
      expect(result.repairs).toContainEqual({ kind: "threadPlayerRepeated", detail: "the_contest: player2" });
      expect(result.repairs).toContainEqual({ kind: "threadPlayerRepeated", detail: "the_contest: player3" });
      expect(kinds(result.repairs)).not.toContain("threadDropped");
    });

    it("keeps a player in the first of their threads when their pick names none of them, or in a story's first chapter", () => {
      const picks = { player1: "shared_crown", player2: "player2_debt" };
      const later = checkThreadPlan(groupAfterPicks(GameModes.Cooperative, picks), threadPlan([
        aThread("challenge", 2, ["player1", "player2"], [], { id: "t1" }),
        aThread("challenge", 2, ["player2"], [], { id: "t2", outcomeId: "player1_trust" }),
      ]));
      expect(later.plan.threads.map((t) => t.id)).toEqual(["t1"]);
      // The first chapter groups every player by rule, whatever they picked
      const first = checkThreadPlan(groupAfterPicks(GameModes.Cooperative, picks, { first: true }), threadPlan([
        aThread("challenge", 2, ["player1", "player2"], [], { id: "together" }),
        aThread("challenge", 2, ["player2"], [], { id: "own", outcomeId: "player2_debt" }),
      ]));
      expect(first.plan.threads.map((t) => t.id)).toEqual(["together"]);
      expect(first.problem).toBeUndefined();
    });
  });

  /*
   * A contest only one side's players are in (the playthroughs of
   * 2026-09-30: the players picked different directions and one side alone
   * picked the contest; the planner wrote the contest anyway, the check found
   * it unusable, its one retry repeated it and the turn failed for good) is
   * that side's challenge for this chapter: its results turn from "a side
   * wins" into how the attempt goes for the players in it.
   */
  describe("one-sided contests (PL-12)", () => {
    const THREE = { player1: "shared_escape", player2: "shared_crown", player3: "player3_ship" };

    it("makes a contest with only side B's player, the others in threads of their own, that player's challenge", () => {
      const story = groupAfterPicks(GameModes.CooperativeCompetitive, THREE);
      const reply = threadPlan([
        aThread("challenge", 2, ["player1"], [], { id: "escape" }),
        contestThread([], ["player2"], "the_ledger"),
        aThread("exploration", 2, ["player3"], [], { id: "ship", outcomeId: "player3_ship" }),
      ]);

      const result = checkThreadPlan(story, reply, { lengths: true });

      expect(result.problem).toBeUndefined();
      const ledger = result.plan.threads[1];
      expect([ledger.playersSideA, ledger.playersSideB]).toEqual([["player2"], []]);
      expect(ledger.possibleMilestones).toEqual({ favorable: "B takes the crown", mixed: "They share it", unfavorable: "A takes the crown" });
      expect(ledger.progression.map((step) => step.possibleResolutions)).toEqual([
        { favorable: "B leads 0", mixed: "Even 0", unfavorable: "A leads 0" },
        { favorable: "B leads 1", mixed: "Even 1", unfavorable: "A leads 1" },
      ]);
      expect(getThreadType(ledger)).toBe("challenge");
      expect((ledger as Thread & { kind?: string }).kind).toBe("challenge");
      expect(result.repairs).toContainEqual({ kind: "contestOneSided", detail: "the_ledger" });
    });

    it("makes a contest with only side A's players that side's challenge, side A's win its favorable result", () => {
      const story = groupAfterPicks(GameModes.Competitive, { player1: "shared_crown", player2: "player2_debt" });
      const reply = threadPlan([contestThread(["player1"], [], "the_route"), aThread("exploration", 2, ["player2"], [], { id: "debt", outcomeId: "player2_debt" })]);

      const result = checkThreadPlan(story, reply);

      expect(result.problem).toBeUndefined();
      expect(result.plan.threads[0]).toMatchObject({
        playersSideA: ["player1"],
        playersSideB: [],
        possibleMilestones: { favorable: "A takes the crown", mixed: "They share it", unfavorable: "B takes the crown" },
      });
      expect(kinds(result.repairs)).toEqual(["contestOneSided"]);
    });

    it("keeps a one-sided contest a problem in a contest game when every player is in it: the opponents are missing, not elsewhere", () => {
      const story = groupAfterPicks(GameModes.Competitive, { player1: "shared_crown", player2: "shared_crown" });

      expect(checkThreadPlan(story, threadPlan([contestThread(["player1", "player2"], [], "all_a")])).problem).toContain("side B");
      expect(checkThreadPlan(story, threadPlan([contestThread([], ["player1", "player2"], "all_b")])).problem).toContain("side A");
    });

    it("makes contest results with one side a challenge in a cooperative group, where no contest can be played", () => {
      const story = groupAfterPicks(GameModes.Cooperative, { player1: "shared_crown", player2: "shared_crown" });

      const result = checkThreadPlan(story, threadPlan([contestThread(["player1", "player2"], [], "together")]));

      expect(result.problem).toBeUndefined();
      expect(getThreadType(result.plan.threads[0])).toBe("challenge");
    });

    it("leaves a single player's contest results a problem: a single player's outcomes are never contested", () => {
      const result = checkThreadPlan(threadStory(1), threadPlan([contestThread(["player1"], [], "alone")]));

      expect(result.problem).toContain("side B");
    });

    /*
     * The third playthroughs' space pirates (2026-10-01): the seal's first contest held only Oren (player3), on side B, so
     * the check made it his challenge; his favorable result was his camp's win, and the switch after it moved the score
     * toward the other camp, since nothing stored which side the challenge was. It stores it now (favorableSide): the
     * board side whose win the favorable result is, player1's side A wherever player1 is in it, player2's side B in a
     * two-player game, else the side the planner wrote (the planner is told player1's camp is side A).
     */
    it("stores the board side whose win the challenge's favorable result is, so the scoreboard can follow it (the space pirates' turn 6)", () => {
      const story = groupAfterPicks(GameModes.CooperativeCompetitive, THREE);
      const sideB = checkThreadPlan(story, threadPlan([aThread("challenge", 2, ["player1"], [], { id: "escape" }), contestThread([], ["player2"], "the_ledger"), aThread("exploration", 2, ["player3"], [], { id: "ship", outcomeId: "player3_ship" })]));
      expect(sideB.plan.threads.map((t) => t.favorableSide)).toEqual([undefined, "sideB", undefined]);
      const sideA = checkThreadPlan(story, threadPlan([aThread("challenge", 2, ["player1"], [], { id: "escape" }), contestThread(["player2"], [], "the_ledger"), aThread("exploration", 2, ["player3"], [], { id: "ship", outcomeId: "player3_ship" })]));
      expect(sideA.plan.threads[1].favorableSide).toBe("sideA");
      // player1's own: side A
      const own = checkThreadPlan(groupAfterPicks(GameModes.Competitive, { player1: "shared_crown", player2: "player2_debt" }), threadPlan([contestThread(["player1"], [], "the_route"), aThread("exploration", 2, ["player2"], [], { id: "debt", outcomeId: "player2_debt" })]));
      expect(own.plan.threads[0].favorableSide).toBe("sideA");
    });

    it("takes player2's side as side B in a two-player game whatever side the planner wrote, the results staying the written side's", () => {
      const story = groupAfterPicks(GameModes.Competitive, { player1: "player1_trust", player2: "shared_crown" });
      const result = checkThreadPlan(story, threadPlan([aThread("challenge", 2, ["player1"], [], { id: "trust", outcomeId: "player1_trust" }), contestThread(["player2"], [], "the_route")]));
      expect(result.problem).toBeUndefined();
      expect(result.plan.threads[1]).toMatchObject({ favorableSide: "sideB", possibleMilestones: { favorable: "A takes the crown", unfavorable: "B takes the crown" } });
    });

    it("leaves every thread it doesn't convert without a stored side", () => {
      const story = groupAfterPicks(GameModes.CooperativeCompetitive, { player1: "shared_crown", player2: "shared_crown", player3: "player3_ship" });
      const result = checkThreadPlan(story, threadPlan([contestThread(["player1"], ["player2"], "the_crown"), aThread("exploration", 2, ["player3"], [], { id: "ship", outcomeId: "player3_ship" })]));
      expect(result.plan.threads.map((t) => t.favorableSide)).toEqual([undefined, undefined]);
    });

    it("uses a first reply whose only fault was the one-sided contest: no retry, every player where they picked", async () => {
      // The space pirates' turn 6: Ari alone in the contest he picked, the other two in the threads they picked
      const story = groupAfterPicks(GameModes.CooperativeCompetitive, { player1: "shared_crown", player2: "player2_debt", player3: "shared_escape" });
      const reply = threadPlan([
        contestThread(["player1"], [], "the_clerk"),
        aThread("exploration", 2, ["player2"], [], { id: "debt", outcomeId: "player2_debt" }),
        aThread("challenge", 2, ["player3"], [], { id: "escape" }),
      ]);
      const prompts: string[] = [];
      const invoke = async (prompt: string) => {
        prompts.push(prompt);
        return reply;
      };

      const plan = await checkedThreadPlan(story, "PROMPT", invoke, () => undefined);

      expect(prompts).toEqual(["PROMPT"]);
      expect(plan.threads.map((t) => [t.id, t.playersSideA, getThreadType(t)])).toEqual([
        ["the_clerk", ["player1"], "challenge"],
        ["debt", ["player2"], "exploration"],
        ["escape", ["player3"], "challenge"],
      ]);
    });
  });

  /*
   * A cooperative story holding a contested outcome (a template's author can
   * put one in a cooperative World; the editor only warns): the planner
   * writes that outcome's chapter as a contest with players on both sides,
   * which a cooperative game can't play. Until 2026-10-01 the check refused
   * it, its one retry wrote the same, and the turn failed for good. Now the
   * contest is the group's shared challenge, as a one-sided contest is that
   * side's (PL-12): every player in it on side A, the side player1 was on (side
   * A where player1 is elsewhere) winning as the favorable result.
   */
  describe("a contest in a cooperative story (PL-12)", () => {
    const COOP = { player1: "shared_crown", player2: "shared_crown", player3: "shared_crown" };

    it("makes a two-sided contest the group's shared challenge, player1's side's win the favorable result", () => {
      const story = groupAfterPicks(GameModes.Cooperative, COOP);

      const result = checkThreadPlan(story, threadPlan([contestThread(["player1", "player3"], ["player2"], "the_vote")]), { lengths: true });

      expect(result.problem).toBeUndefined();
      expect(result.lengthProblem).toBeUndefined();
      const vote = result.plan.threads[0];
      expect([vote.playersSideA, vote.playersSideB]).toEqual([["player1", "player3", "player2"], []]);
      expect(vote.possibleMilestones).toEqual({ favorable: "A takes the crown", mixed: "They share it", unfavorable: "B takes the crown" });
      expect(vote.progression.map((step) => step.possibleResolutions)).toEqual([
        { favorable: "A leads 0", mixed: "Even 0", unfavorable: "B leads 0" },
        { favorable: "A leads 1", mixed: "Even 1", unfavorable: "B leads 1" },
      ]);
      expect(getThreadType(vote)).toBe("challenge");
      expect((vote as Thread & { kind?: string }).kind).toBe("challenge");
      expect(result.repairs).toEqual([{ kind: "contestInCooperative", detail: "the_vote" }]);
    });

    it("takes side B's win as the favorable result where player1 is on side B, and side A's where player1 is elsewhere", () => {
      const onB = checkThreadPlan(groupAfterPicks(GameModes.Cooperative, COOP), threadPlan([contestThread(["player2"], ["player1", "player3"], "the_vote")]));
      expect(onB.problem).toBeUndefined();
      expect(onB.plan.threads[0]).toMatchObject({
        playersSideA: ["player2", "player1", "player3"],
        playersSideB: [],
        possibleMilestones: { favorable: "B takes the crown", mixed: "They share it", unfavorable: "A takes the crown" },
      });

      const story = groupAfterPicks(GameModes.Cooperative, { player1: "player1_trust", player2: "shared_crown", player3: "shared_crown" });
      const elsewhere = checkThreadPlan(story, threadPlan([
        aThread("challenge", 2, ["player1"], [], { id: "trust", outcomeId: "player1_trust" }),
        contestThread(["player3"], ["player2"], "the_vote"),
      ]));
      expect(elsewhere.problem).toBeUndefined();
      expect(elsewhere.plan.threads[1]).toMatchObject({ playersSideA: ["player3", "player2"], possibleMilestones: { favorable: "A takes the crown" } });
      // The board side whose win the favorable result is: player1's, side A, wherever player1 is in it; else the written side
      expect(onB.plan.threads[0].favorableSide).toBe("sideA");
      expect(elsewhere.plan.threads[1].favorableSide).toBe("sideA");
    });

    it("uses the first reply: no retry, so the chapter is never refused twice", async () => {
      const story = groupAfterPicks(GameModes.Cooperative, COOP);
      const prompts: string[] = [];
      const invoke = async (prompt: string) => {
        prompts.push(prompt);
        return threadPlan([contestThread(["player1"], ["player2", "player3"], "the_vote")]);
      };

      const plan = await checkedThreadPlan(story, "PROMPT", invoke, () => undefined);

      expect(prompts).toEqual(["PROMPT"]);
      expect(plan.threads.map((t) => [t.id, t.playersSideA, getThreadType(t)])).toEqual([["the_vote", ["player1", "player2", "player3"], "challenge"]]);
    });

    it("keeps a contest in a contest game, and a cooperative thread with players on side B but no contest results a problem", () => {
      for (const mode of [GameModes.Competitive, GameModes.CooperativeCompetitive]) {
        const result = checkThreadPlan(groupAfterPicks(mode, COOP), threadPlan([contestThread(["player1", "player3"], ["player2"], "the_vote")]));
        expect(result.problem).toBeUndefined();
        expect(getThreadType(result.plan.threads[0])).toBe("contest");
        expect(kinds(result.repairs)).toEqual([]);
      }
      const challengeWithSideB = aThread("challenge", 2, ["player1"], [], { outcomeId: "shared_crown", playersSideB: ["player2", "player3"] });
      expect(checkThreadPlan(groupAfterPicks(GameModes.Cooperative, COOP), threadPlan([challengeWithSideB])).problem).toContain("competitive");
    });

    it("leaves a single player's two-sided contest a problem: a single player has no second side", () => {
      const result = checkThreadPlan(threadStory(1, GameModes.Cooperative), threadPlan([contestThread(["player1"], ["player2"], "alone")]));

      expect(result.problem).toBeDefined();
    });
  });

  describe("contests (PL-5)", () => {
    const contest = () => aThread("contest", 3, ["player1"], ["player2"], { outcomeId: "shared_crown" });

    it("makes a contest in a cooperative game the group's challenge (PL-12, since 2026-10-01; a problem before)", () => {
      const result = checkThreadPlan(threadStory(2, GameModes.Cooperative), threadPlan([contest()]));

      expect(result.problem).toBeUndefined();
      expect(getThreadType(result.plan.threads[0])).toBe("challenge");
      expect(result.plan.threads[0].playersSideA).toEqual(["player1", "player2"]);
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

    it("reads another length rule where one is given (an eval variant's), production's otherwise", () => {
      const onlyTwo = () => [2];
      const result = checkThreadPlan(threadStory(1), threadPlan([aThread("challenge", 3, ["player1"])]), { lengths: true, allowedLengths: onlyTwo });
      expect(result.lengthProblem).toBe("the thread is 3 beats long, and with 6 turns left, this one included, PACING allows 2 beats");
      expect(checkThreadPlan(threadStory(1), threadPlan([aThread("challenge", 2, ["player1"])]), { lengths: true, allowedLengths: onlyTwo }).lengthProblem).toBeUndefined();
      expect(checkThreadPlan(threadStory(1), threadPlan([aThread("challenge", 3, ["player1"])]), { lengths: true }).lengthProblem).toBeUndefined();
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

    it("puts player1's camp on side A in a three-player contest", () => {
      const story = threadStory(3, GameModes.Competitive);

      const result = checkThreadPlan(story, threadPlan([contest(["player2"], ["player1", "player3"])]));

      expect([result.plan.threads[0].playersSideA, result.plan.threads[0].playersSideB]).toEqual([["player1", "player3"], ["player2"]]);
      expect(kinds(result.repairs)).toEqual(["contestSidesSwapped"]);
    });

    it("leaves a contest with player1 on side A untouched", () => {
      const story = threadStory(3, GameModes.Competitive);
      const reply = threadPlan([contest(["player1"], ["player2", "player3"])]);

      const result = checkThreadPlan(story, reply);

      expect(result.plan).toEqual(reply);
      expect(result.repairs).toEqual([]);
    });

    it("keeps the sides as written in a contest player1 sits out: the camps live in the setup's text, not in the slots", () => {
      // Camps {player1, player3} against {player2}: player3 holds camp A's side while player1 has a thread of their own
      const story = threadStory(3, GameModes.CooperativeCompetitive);
      const alone = aThread("challenge", 2, ["player1"], [], { id: "alone", outcomeId: "player1_trust" });
      const reply = threadPlan([alone, { ...contest(["player3"], ["player2"]), id: "the_contest" }]);

      const result = checkThreadPlan(story, reply);

      expect(result.plan).toEqual(reply);
      expect(kinds(result.repairs)).toEqual([]);
      expect(result.problem).toBeUndefined();
    });
  });

  describe("an exact copy of the chapter's last step (PL-14)", () => {
    const LAST = { title: "The Last Push", question: "Escape: How does the crew get the ferry out before the tide turns?" };

    /** The thread with its last step written twice, as planners wrote it (in steps and again as finalStep): the copy with its own step results, the last with the milestones. */
    function lastStepTwice(written: Thread, copy: Partial<typeof LAST> = {}): Thread {
      const steps = written.progression;
      const last = { ...steps[steps.length - 1], ...LAST };
      const twice = { ...last, ...copy, possibleResolutions: { favorable: "ahead", mixed: "level", unfavorable: "behind" } };
      return { ...written, progression: [...steps.slice(0, -2), twice, last] };
    }

    it("drops a step that is an exact copy of the last one, keeps the last with the milestones, and takes the length from the steps", () => {
      const written = lastStepTwice(aThread("challenge", 4, ["player1"]));
      const result = checkThreadPlan(threadStory(1), threadPlan([written]), { lengths: true });

      const [kept] = result.plan.threads;
      expect(kept.progression).toEqual([written.progression[0], written.progression[1], written.progression[3]]);
      expect(result.plan.duration).toBe(3);
      expect(kinds(result.repairs)).toEqual(["lastStepRepeated", "durationFromSteps"]);
      expect(result.repairs[0].detail).toBe("a_thread: The Last Push");
      // Four beats were more than PACING allows with 6 turns left; three are not
      expect(result.problem).toBeUndefined();
      expect(result.lengthProblem).toBeUndefined();
    });

    it("keeps a copy that is relabelled or reworded: only an exact copy is dropped, whitespace aside", () => {
      const relabelled = lastStepTwice(aThread("challenge", 3, ["player1"]), { question: `Final ${LAST.question}` });
      expect(checkThreadPlan(threadStory(1), threadPlan([relabelled])).plan.threads[0].progression).toHaveLength(3);
      const spaced = lastStepTwice(aThread("challenge", 3, ["player1"]), { question: ` ${LAST.question.replace(" How", "  How")} ` });
      expect(checkThreadPlan(threadStory(1), threadPlan([spaced])).plan.threads[0].progression).toHaveLength(2);
    });

    it("keeps the copy, noted, where dropping it would leave a length PACING doesn't allow and the written one it does", () => {
      // Three turns left: the last chapter takes exactly three beats
      const story = withOutcomes(threadAnalysisAfterSwitch(1, { maxTurns: 7 }), [ESCAPE], PLAYER_OUTCOMES);
      const written = lastStepTwice(aThread("challenge", 3, ["player1"]));
      const result = checkThreadPlan(story, threadPlan([written]), { lengths: true });

      expect(result.plan.threads[0].progression).toEqual(written.progression);
      expect(notes(result.repairs)).toContain("lastStepRepeatedKept");
      expect(kinds(result.repairs)).not.toContain("lastStepRepeated");
      expect(result.lengthProblem).toBeUndefined();
    });

    it("keeps a two-step thread whose steps are one step twice: a thread needs two steps", () => {
      const written = lastStepTwice(aThread("challenge", 2, ["player1"]));
      const result = checkThreadPlan(threadStory(1), threadPlan([written]));

      expect(result.plan.threads[0].progression).toHaveLength(2);
      expect(notes(result.repairs)).toContain("lastStepRepeatedKept");
      expect(result.problem).toBeUndefined();
    });

    it("in a group plan, drops the copies only where every thread is left with the same number of steps", () => {
      const own = (slot: string, outcomeId: string) => aThread("challenge", 3, [slot], [], { id: `${slot}_thread`, outcomeId });
      const oneDoubled = threadPlan([lastStepTwice(own("player1", "player1_trust")), own("player2", "player2_debt")]);
      const uneven = checkThreadPlan(threadStory(2), oneDoubled);
      expect(uneven.plan.threads.map((t) => t.progression.length)).toEqual([3, 3]);
      expect(notes(uneven.repairs)).toContain("lastStepRepeatedKept");
      expect(uneven.problem).toBeUndefined();

      // Four beats are more than PACING allows with 6 turns left, which never fails a turn; threads of different lengths would
      const long = (slot: string, outcomeId: string) => aThread("challenge", 4, [slot], [], { id: `${slot}_thread`, outcomeId });
      const tooLong = checkThreadPlan(threadStory(2), threadPlan([lastStepTwice(long("player1", "player1_trust")), long("player2", "player2_debt")]), { lengths: true });
      expect(tooLong.plan.threads.map((t) => t.progression.length)).toEqual([4, 4]);
      expect(tooLong.problem).toBeUndefined();
      expect(tooLong.lengthProblem).toBeDefined();

      const bothDoubled = threadPlan([lastStepTwice(own("player1", "player1_trust")), lastStepTwice(own("player2", "player2_debt"))]);
      const even = checkThreadPlan(threadStory(2), bothDoubled);
      expect(even.plan.threads.map((t) => t.progression.length)).toEqual([2, 2]);
      expect(even.plan.duration).toBe(2);
      expect(kinds(even.repairs).filter((k) => k === "lastStepRepeated")).toHaveLength(2);
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

    it("checks against another length rule where one is given, and retries told it", async () => {
      const onlyTwo = () => [2];
      const { invoke, prompts } = planner(fits(), threadPlan([aThread("challenge", 2, ["player1"])]));

      const plan = await checkedThreadPlan(threadStory(1), "THE PROMPT", invoke, () => undefined, onlyTwo);

      expect(prompts[1]).toBe(withPlanProblem("THE PROMPT", "the thread is 3 beats long, and with 6 turns left, this one included, PACING allows 2 beats"));
      expect(plan.duration).toBe(2);
    });

    it("keeps the first reply when the second can't be used at all", async () => {
      const { invoke } = planner(tooLong(), unknownOutcome());

      const plan = await checkedThreadPlan(threadStory(1), "THE PROMPT", invoke, () => undefined);

      expect(plan.duration).toBe(4);
      expect(plan.threads[0].outcomeId).toBe("shared_escape");
    });

    it("keeps the first reply when the retry's call fails outright: a length never fails the turn", async () => {
      const lines: string[] = [];
      const log = (line: string) => lines.push(line);
      const invoke = jest.fn(async (prompt: string) => {
        if (prompt === "THE PROMPT") return tooLong();
        throw Object.assign(new Error("Request timed out."), { name: "APIConnectionTimeoutError" });
      });

      const plan = await checkedThreadPlan(threadStory(1), "THE PROMPT", invoke, log);

      expect(invoke).toHaveBeenCalledTimes(2);
      expect(plan.duration).toBe(4);
    });

    it("still fails when the first reply can't be used and the retry's call fails", async () => {
      const invoke = jest.fn(async (prompt: string) => {
        if (prompt === "THE PROMPT") return unknownOutcome();
        throw new Error("Request timed out.");
      });

      await expect(checkedThreadPlan(threadStory(1), "THE PROMPT", invoke, () => undefined)).rejects.toThrow("Request timed out.");
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

  /*
   * The pacing-clues stage's fix-and-retest (2026-10-01, eval only): a switch
   * plan read against another pacing rule (the variant's), its problem worth
   * the one retry but never a reason to fail the turn, as a chapter length is.
   * A rule given replaces production's own (PACING's arithmetic since the
   * stage's adoption, below).
   */
  describe("a switch plan read against another pacing rule (an eval variant's)", () => {
    const story = switchStory(1);
    const first = () => switchPlan(story, [topic(["player1"], GOOD.slice(0, 3))]);
    const second = () => switchPlan(story, [topic(["player1"], GOOD.slice(1, 4))]);
    const rule = (_: Story, plan: SwitchAnalysis) => (plan.switches[0]?.topicChoices?.[0] === GOOD[0] ? "keep the archive for the story's last thread" : undefined);

    it("calls once more told the rule's problem, and applies the reply that keeps it", async () => {
      const lines: string[] = [];
      const { invoke, prompts } = planner(first(), second());
      await expect(checkedSwitchPlan(story, "THE PROMPT", invoke, (line) => lines.push(line), rule)).resolves.toEqual(second());
      expect(prompts[1]).toBe(withPlanProblem("THE PROMPT", "keep the archive for the story's last thread"));
      expect(lines.join("\n")).toContain('"pacingNotFollowed":1');
    });

    it("keeps the second reply when it still misses, and the first when the retry's call fails: the rule never fails the turn", async () => {
      const again = planner(first(), first());
      await expect(checkedSwitchPlan(story, "THE PROMPT", again.invoke, () => undefined, rule)).resolves.toEqual(first());
      expect(again.invoke).toHaveBeenCalledTimes(2);
      const invoke = jest.fn(async (prompt: string) => {
        if (prompt === "THE PROMPT") return first();
        throw new Error("Request timed out.");
      });
      await expect(checkedSwitchPlan(story, "THE PROMPT", invoke, () => undefined, rule)).resolves.toEqual(first());
    });

    it("is production's check, PACING's arithmetic included, without a rule given: a plan that keeps it is applied after one call", async () => {
      expect(switchPacingProblem(story, first())).toBeUndefined();
      const plain = planner(first());
      await expect(checkedSwitchPlan(story, "THE PROMPT", plain.invoke, () => undefined)).resolves.toEqual(first());
      expect(plain.invoke).toHaveBeenCalledTimes(1);
    });
  });

  /*
   * The pacing-clues stage's adoption (2026-10-01, its fix-and-retest
   * pacingCluesB): production reads a usable switch plan against PACING's
   * arithmetic (switchPacingProblem) and a chapter plan against the paced
   * lengths, each worth the one retry told the problem, never a reason to fail
   * the turn. Measured in short whole-story playthroughs: the last chapter kept
   * a milestone to settle 2 of 8 -> 8 of 8, no milestone left unfinished.
   */
  describe("PACING's arithmetic, production's check since the pacing-clues adoption", () => {
    const PENDING = "outcome_1";
    /** A single player's switch after a chapter on outcome_1 (pending, its one milestone), the main outcome 1 of 2, at turn 4 of 7: one thread left. */
    const lastSwitch = () =>
      switchAnalysisAfterThread(1, {
        maxTurns: 7,
        sharedOutcomes: [outcome(PENDING, { intendedNumberOfMilestones: 1 }), outcome("main", { intendedNumberOfMilestones: 2, milestones: ["The first stage"] })],
      });
    const onComplete = (story: Story) => switchPlan(story, [flavor(["player1"], PENDING, "How does it end?")]);
    const onMain = (story: Story) => switchPlan(story, [flavor(["player1"], "main", "How does it end?")]);

    it("asks a switch plan once more where it offers a complete outcome to a player with no thread to spare, told why, and applies the reply that keeps it", async () => {
      const story = lastSwitch();
      const problem = switchPacingProblem(story, checkSwitchPlan(story, onComplete(story)).plan);
      expect(problem).toContain("player1 still needs 1 milestone with 1 thread left");
      const lines: string[] = [];
      const { invoke, prompts } = planner(onComplete(story), onMain(story));
      await expect(checkedSwitchPlan(story, "THE PROMPT", invoke, (line) => lines.push(line))).resolves.toEqual(onMain(story));
      expect(prompts[1]).toBe(withPlanProblem("THE PROMPT", problem ?? ""));
      expect(lines.join("\n")).toContain('"pacingNotFollowed":1');
    });

    it("keeps the second plan when it still misses: the rule never fails the turn; a rule of none reads nothing (the eval's variants measured before)", async () => {
      const story = lastSwitch();
      const again = planner(onComplete(story), onComplete(story));
      await expect(checkedSwitchPlan(story, "THE PROMPT", again.invoke, () => undefined)).resolves.toEqual(onComplete(story));
      expect(again.invoke).toHaveBeenCalledTimes(2);
      const none = planner(onComplete(story));
      await expect(checkedSwitchPlan(story, "THE PROMPT", none.invoke, () => undefined, () => undefined)).resolves.toEqual(onComplete(story));
      expect(none.invoke).toHaveBeenCalledTimes(1);
    });

    /** A single player's chapter plan at turn 17 of 25 after a switch on shared_escape (1 of 3): one milestone still needed after it. */
    const pacedChapter = () =>
      roundStory({
        turns: 16,
        maxTurns: 25,
        sharedOutcomes: [outcome("shared_escape", { intendedNumberOfMilestones: 3, milestones: ["Out of the cells"] })],
        playerOutcomes: { player1: [] },
        phases: [endedChapter("shared_escape", 3, 12, "Out of the cells"), topicSwitch([["Run for the gate", "shared_escape"]], 15)],
        lastChoice: 0,
      });

    it("reads a chapter plan's length against the paced lengths, naming them", async () => {
      const story = pacedChapter();
      expect(pacedLengths(story)).toEqual({ lengths: [4], narrowed: "longer" });
      const three = threadPlan([aThread("challenge", 3, ["player1"])]);
      expect(checkThreadPlan(story, three, { lengths: true }).lengthProblem).toBe("the thread is 3 beats long, and with 9 turns left, this one included, PACING allows 4 beats");
      expect(checkThreadPlan(story, threadPlan([aThread("challenge", 4, ["player1"])]), { lengths: true }).lengthProblem).toBeUndefined();
      const { invoke, prompts } = planner(three, threadPlan([aThread("challenge", 4, ["player1"])]));
      const plan = await checkedThreadPlan(story, "THE PROMPT", invoke, () => undefined);
      expect(prompts[1]).toBe(withPlanProblem("THE PROMPT", "the thread is 3 beats long, and with 9 turns left, this one included, PACING allows 4 beats"));
      expect(plan.duration).toBe(4);
    });
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
