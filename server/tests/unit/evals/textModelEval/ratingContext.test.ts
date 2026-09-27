import { Story } from "core/models/Story.js";
import type { Beat, StoryPhase, StoryState } from "core/types/index.js";
import { LEAK_PATTERN, metadataLeaks } from "../../../../src/evals/textModelEval/blinding.js";
import type { FixedAnalysis } from "../../../../src/evals/textModelEval/cases.js";
import {
  CONTEXT_LABELS,
  contextBeatType,
  turnContext,
  type ContextLine,
  type ContextSection,
} from "../../../../src/evals/textModelEval/ratingContext.js";
import type { TurnContent } from "../../../../src/evals/textModelEval/ratingContent.js";
import { renderRatingPage } from "../../../../src/evals/textModelEval/ratingPage.js";
import { startsOpen } from "../../../../src/evals/textModelEval/ratingRows.js";
import { pageFieldLabels, ratingSetFromKey, type RatingKey, type RatingSet } from "../../../../src/evals/textModelEval/ratingSets.js";
import type { CallRecord } from "../../../../src/evals/textModelEval/runner.js";
import { createMockBeat, createMockStoryState } from "../../../helpers/testHelpers.js";
import { BASELINE, LUNA, evalCase, record } from "./fixtures.js";
import { all, kids, parseHtml, select, textOf, type HtmlNode } from "./htmlTree.js";

/*
 * The background above a turn's options: which fields of the story state
 * (plus the case's fixed analysis) become which lines, per kind of turn.
 */

function step(title: string, question: string, resolution: string | null = null) {
  return { title, question, possibleResolutions: { favorable: `${title} goes well`, mixed: `${title} half works`, unfavorable: `${title} fails` }, resolution };
}

function contestStep(title: string, resolution: string | null = null) {
  return { title, question: `Duel: Who wins the ${title}?`, possibleResolutions: { sideAWins: `${title} A`, mixed: `${title} split`, sideBWins: `${title} B` }, resolution };
}

function outcome(id: string, question: string, milestones: string[] = [], intended = 2) {
  return { id, question, possibleResolutions: { favorable: "Won.", mixed: "Half won.", unfavorable: "Lost." }, resonance: "It matters.", intendedNumberOfMilestones: intended, milestones };
}

const STEPS = [
  ["Docks", "Search: How does Ada search the docks?"],
  ["Rooftops", "Pursuit: How does Ada follow over the roofs?"],
  ["Bell tower", "Showdown: How does Ada face the thief?"],
] as const;

const steps = (...resolutions: (string | null)[]) => STEPS.map(([title, question], i) => step(title, question, resolutions[i] ?? null));

function thread(overrides: Record<string, unknown> = {}) {
  return {
    id: "through_the_fog",
    title: "Through the Fog",
    outcomeId: "player1_catch",
    playersSideA: ["player1"],
    playersSideB: [],
    previousThreadTypesToBeAvoided: [],
    relevantSuggestedThreadTypes: [],
    typeOfThread: "Chase",
    typeOfMilestone: "Whether the thief is caught",
    possibleMilestones: { favorable: "Ada corners the thief.", mixed: "The thief escapes, wounded.", unfavorable: "The thief vanishes." },
    progression: steps(),
    firstBeatIndex: 1,
    duration: 3,
    resolution: null,
    milestone: null,
    ...overrides,
  };
}

const threadPhase = (firstBeatIndex: number, threads: unknown[]) => ({
  relevantSwitchAndThreadInstructions: "",
  coordinationPatternSummary: "",
  duration: 3,
  threads,
  firstBeatIndex,
});

const switchPhase = (firstBeatIndex: number, switches: unknown[]) => ({
  coordinationPatternAnalysis: "single-player",
  coordinationPatternSummary: "single-player",
  switches,
  firstBeatIndex,
  duration: 1,
});

function aSwitch(overrides: Record<string, unknown> = {}) {
  return {
    players: ["player1"],
    type: "flavor",
    relevantSuggestedThreadTypes: [],
    previousThreadTypesToBeAvoided: [],
    relevantSwitchAndThreadInstructions: "",
    outcomeId: "player1_catch",
    question: "How does Ada chase the thief?",
    topicChoices: [],
    relationshipToOtherSwitches: "single-player",
    title: "The Chase Begins",
    id: "chase_begins",
    ...overrides,
  };
}

const TOPIC = aSwitch({
  type: "topic",
  outcomeId: "",
  question: "",
  title: "What Next",
  topicChoices: ["Chase the thief again (player1_catch)", "Settle down in the port (player1_home)", "Leave town"],
});

const beat = (title: string, summary: string, resolution: string | null, choice = 0) => createMockBeat({ title, summary, resolution, choice });

const FIRST_BEAT = beat("The Chase Begins", "Ada hears of the theft.", "resolution1");
const THREAD_BEATS = [
  beat("Through the Fog (1/3)", "Ada searches the docks.", "favorable", 1),
  beat("Through the Fog (2/3)", "Ada runs over the roofs.", "favorable"),
  beat("Through the Fog (3/3)", "Ada climbs the bell tower.", "unfavorable"),
];

function story(phases: unknown[], beats: unknown[], overrides: Partial<StoryState> = {}): StoryState {
  const base = createMockStoryState({
    title: "The Harbour Heist",
    maxTurns: 10,
    guidelines: {
      world: "A foggy port.",
      rules: ["No magic."],
      tone: ["tense"],
      conflicts: ["Guild against crown"],
      decisions: [],
      typesOfThreads: [],
      switchAndThreadInstructions: ["After each chase, the guild grows suspicious."],
    },
  });
  base.players.player1 = {
    ...base.players.player1,
    name: "Ada",
    outcomes: [outcome("player1_catch", "Does Ada catch the thief?", ["Ada found the trail."], 3), outcome("player1_home", "Does Ada find a home?")],
    beatHistory: beats as Beat[],
  };
  return { ...base, storyPhases: phases as StoryPhase[], ...overrides };
}

const ENDED = thread({ progression: steps("favorable", "favorable", "unfavorable"), resolution: "unfavorable", milestone: "The thief vanishes." });

/** A plain thread step: step 2 of 3, no analysis this turn. */
const PLAIN = story([switchPhase(0, [aSwitch()]), threadPhase(1, [thread({ progression: steps("favorable") })])], [FIRST_BEAT, THREAD_BEATS[0]]);
/** A thread has just ended; the fixed analysis is a topic switch. */
const AFTER_THREAD = story([switchPhase(0, [aSwitch()]), threadPhase(1, [ENDED])], [FIRST_BEAT, ...THREAD_BEATS]);
const TOPIC_SWITCH = { kind: "switch", phase: switchPhase(4, [TOPIC]) } as unknown as FixedAnalysis;
/** The first turn: no phases yet; the fixed analysis is the opening switch. */
const FIRST = story([], []);
const OPENING = { kind: "switch", phase: switchPhase(0, [aSwitch()]) } as unknown as FixedAnalysis;
/** A new thread starts; the fixed analysis is its plan. */
const BEFORE_THREAD = story([switchPhase(0, [aSwitch()])], [FIRST_BEAT]);
const NEW_THREAD = { kind: "thread", phase: threadPhase(1, [thread()]) } as unknown as FixedAnalysis;
/** The ending: the thread just resolved on the last turn. */
const ENDING = story(
  [switchPhase(0, [aSwitch()]), threadPhase(1, [thread({ progression: steps("favorable", "favorable", "favorable"), resolution: "favorable", milestone: "Ada corners the thief." })])],
  [FIRST_BEAT, ...THREAD_BEATS],
  { maxTurns: 4 }
);

function outline(lines: ContextLine[] = [], depth = 0): string[] {
  return lines.flatMap((l) => [
    `${"  ".repeat(depth)}${[l.label, l.text].filter(Boolean).join(": ")}${l.id ? ` #${l.id}` : ""}${l.marks?.length ? ` [${l.marks.join(", ")}]` : ""}`,
    ...outline(l.sub, depth + 1),
  ]);
}

function section(sections: ContextSection[], key: string): ContextSection {
  const found = sections.find((s) => s.key === key);
  if (!found) throw new Error(`No context section "${key}" in ${sections.map((s) => s.key).join(", ")}`);
  return found;
}

const keysOf = (sections: ContextSection[]) => sections.map((s) => s.key);

const PLAN_STEPS_CURRENT_2 = [
  "  Plan",
  "    Step 1: Docks — Search: How does Ada search the docks?",
  "      Result: Favorable — Docks goes well",
  "    Step 2: Rooftops — Pursuit: How does Ada follow over the roofs? [current]",
  "      Favorable: Rooftops goes well",
  "      Mixed: Rooftops half works",
  "      Unfavorable: Rooftops fails",
  "    Step 3: Bell tower — Showdown: How does Ada face the thief?",
];

const CHAPTER_RESULTS = ["  Possible results", "    Favorable: Ada corners the thief.", "    Mixed: The thief escapes, wounded.", "    Unfavorable: The thief vanishes."];

describe("turnContext: a plain thread step", () => {
  const ctx = turnContext(PLAIN);

  it("shows the chapter, the step, the outcome it advances and the plan with the current step marked", () => {
    expect(outline(section(ctx, "chapter").entries)).toEqual([
      "Turn: 3 of 10 · thread, step 2 of 3",
      "Chapter: Through the Fog",
      "  Type: challenge · Chase",
      "  Advances outcome: Does Ada catch the thief? #player1_catch",
      "    Milestones so far: 1 of 3",
      "      Ada found the trail.",
      "  Kind of milestone: Whether the thief is caught",
      "  Length: 3 turns",
      ...PLAN_STEPS_CURRENT_2,
      ...CHAPTER_RESULTS,
    ]);
  });

  it("orders the folds: this chapter, outcomes, before this turn, story so far, the story", () => {
    expect(keysOf(ctx)).toEqual(["chapter", "outcomes", "before", "storySoFar", "story"]);
    expect(ctx.map((s) => s.heading)).toEqual(["This chapter", "Outcomes", "Before this turn", "Story so far", "The story"]);
  });

  it("lists every outcome with its milestones, marking the one this chapter advances", () => {
    expect(outline(section(ctx, "outcomes").entries)).toEqual([
      "Character: Ada",
      "  Does Ada catch the thief? #player1_catch [advances]",
      "    Milestones so far: 1 of 3",
      "      Ada found the trail.",
      "  Does Ada find a home? #player1_home",
      "    Milestones so far: 0 of 2",
    ]);
  });

  it("keeps what happened just before as it was", () => {
    expect(section(ctx, "before").lines).toEqual(["Character: Ada", "Previous beat: Ada searches the docks.", "Chosen: Test option 2", "Outcome: it went well"]);
  });

  it("tells the story so far by chapter: a switch's question, outcome and chosen option; a thread's outcome and result; the beats", () => {
    expect(outline(section(ctx, "storySoFar").entries)).toEqual([
      "Chapter 1: The Chase Begins",
      "  Type: switch · flavor",
      "  Question: How does Ada chase the thief?",
      "  For outcome: Does Ada catch the thief? #player1_catch",
      "  Turn 1: The Chase Begins — Ada hears of the theft.",
      "    Chosen: Test option 1",
      "Chapter 2: Through the Fog",
      "  Type: challenge · Chase",
      "  For outcome: Does Ada catch the thief? #player1_catch",
      "  Result: in progress",
      "  Turn 2: Through the Fog (1/3) — Ada searches the docks.",
    ]);
  });

  it("shows the story's title, world, rules, tone, conflicts and its own rules for chapters", () => {
    expect(outline(section(ctx, "story").entries)).toEqual([
      "Title: The Harbour Heist",
      "World: A foggy port.",
      "World rules",
      "  No magic.",
      "Tone",
      "  tense",
      "Conflicts",
      "  Guild against crown",
      "Chapter rules",
      "  After each chase, the guild grows suspicious.",
    ]);
  });
});

describe("turnContext: a switch right after a thread", () => {
  const ctx = turnContext(AFTER_THREAD, TOPIC_SWITCH);

  it("shows the chapter that just ended with its milestone due and every step's result, then the switch and the outcome each direction advances", () => {
    expect(outline(section(ctx, "chapter").entries)).toEqual([
      "Turn: 5 of 10 · switch",
      "Just ended: Through the Fog",
      "  Result: Unfavorable",
      "  Milestone to add this turn: The thief vanishes.",
      "  For outcome: Does Ada catch the thief? #player1_catch [due]",
      "  Type: challenge · Chase",
      "  Plan",
      "    Step 1: Docks — Search: How does Ada search the docks?",
      "      Result: Favorable — Docks goes well",
      "    Step 2: Rooftops — Pursuit: How does Ada follow over the roofs?",
      "      Result: Favorable — Rooftops goes well",
      "    Step 3: Bell tower — Showdown: How does Ada face the thief?",
      "      Result: Unfavorable — Bell tower fails",
      "Chapter: What Next",
      "  Type: topic, a choice of direction",
      "  Directions offered",
      "    Chase the thief again (player1_catch)",
      "      Advances outcome: Does Ada catch the thief? #player1_catch",
      "    Settle down in the port (player1_home)",
      "      Advances outcome: Does Ada find a home? #player1_home",
      "    Leave town",
      "Planned for this turn; every version below was written from the same plan.",
    ]);
  });

  it("marks the ended chapter's outcome as getting its milestone this turn, and none as advanced by the open topic switch", () => {
    expect(outline(section(ctx, "outcomes").entries).filter((line) => line.includes("["))).toEqual(["  Does Ada catch the thief? #player1_catch [due]"]);
  });

  it("lists the ended chapter with its outcome, result and planned milestone, and not the new switch", () => {
    expect(outline(section(ctx, "storySoFar").entries)).toEqual([
      "Chapter 1: The Chase Begins",
      "  Type: switch · flavor",
      "  Question: How does Ada chase the thief?",
      "  For outcome: Does Ada catch the thief? #player1_catch",
      "  Turn 1: The Chase Begins — Ada hears of the theft.",
      "    Chosen: Test option 1",
      "Chapter 2: Through the Fog",
      "  Type: challenge · Chase",
      "  For outcome: Does Ada catch the thief? #player1_catch",
      "  Result: Unfavorable",
      "  Planned milestone: The thief vanishes.",
      "  Turn 2: Through the Fog (1/3) — Ada searches the docks.",
      "  Turn 3: Through the Fog (2/3) — Ada runs over the roofs.",
      "  Turn 4: Through the Fog (3/3) — Ada climbs the bell tower.",
    ]);
  });

  it("shows a flavor switch's set question and the outcome it advances, marked with the milestone due on it too", () => {
    const flavor = turnContext(AFTER_THREAD, { kind: "switch", phase: switchPhase(4, [aSwitch()]) } as unknown as FixedAnalysis);
    const chapter = outline(section(flavor, "chapter").entries);
    const at = chapter.indexOf("Chapter: The Chase Begins");
    expect(chapter.slice(at, at + 6)).toEqual([
      "Chapter: The Chase Begins",
      "  Type: flavor, a set question and a choice of approach",
      "  Advances outcome: Does Ada catch the thief? #player1_catch",
      "    Milestones so far: 1 of 3",
      "      Ada found the trail.",
      "  Question: How does Ada chase the thief?",
    ]);
    expect(outline(section(flavor, "outcomes").entries)[1]).toBe("  Does Ada catch the thief? #player1_catch [due, advances]");
  });

  it("notes a direction's outcome id the story does not hold", () => {
    const odd = { kind: "switch", phase: switchPhase(4, [{ ...TOPIC, topicChoices: ["Leave town (player1_gone)", "Rest (player1_home)"] }]) } as unknown as FixedAnalysis;
    const chapter = outline(section(turnContext(AFTER_THREAD, odd), "chapter").entries);
    const at = chapter.indexOf("  Directions offered");
    expect(chapter.slice(at, at + 6)).toEqual([
      "  Directions offered",
      "    Leave town (player1_gone)",
      "      Advances outcome: player1_gone",
      "        not among the story's outcomes",
      "    Rest (player1_home)",
      "      Advances outcome: Does Ada find a home? #player1_home",
    ]);
  });
});

describe("turnContext: the first turn", () => {
  const ctx = turnContext(FIRST, OPENING);

  it("keeps the introduction and chosen characters, and adds the opening switch and the outcomes", () => {
    expect(keysOf(ctx)).toEqual(["chapter", "outcomes", "introduction", "characters", "story"]);
    expect(section(ctx, "introduction")).toEqual({ key: "introduction", heading: "Introduction", lines: ["Test Story Introduction", "Welcome to the test story!"] });
    expect(section(ctx, "characters").lines).toEqual(["player1: Ada, Test character background"]);
    const chapter = outline(section(ctx, "chapter").entries);
    expect(chapter[0]).toBe("Turn: 1 of 10 · switch, on the first turn");
    expect(chapter[1]).toBe("Chapter: The Chase Begins");
    expect(chapter.some((line) => line.startsWith("Just ended"))).toBe(false);
    expect(chapter[chapter.length - 1]).toBe("Planned for this turn; every version below was written from the same plan.");
  });

  it("says so when the story holds no introduction, no name and no outcomes, and notes the direction ids it lacks", () => {
    const bare = story([], []);
    const state: StoryState = {
      ...bare,
      sharedOutcomes: [],
      characterSelectionIntroduction: { title: "", text: "" },
      players: { player1: { ...bare.players.player1, name: "", fluff: "", outcomes: [] } },
    };
    const topic = aSwitch({ type: "topic", outcomeId: "", question: "", topicChoices: ["Read the data (outcome_dashboard_insights)", "Go home"] });
    const ctx = turnContext(state, { kind: "switch", phase: switchPhase(0, [topic]) } as unknown as FixedAnalysis);
    expect(keysOf(ctx)).toEqual(["chapter", "outcomes", "introduction", "characters", "story"]);
    expect(section(ctx, "outcomes").lines).toEqual(["The story holds no outcomes."]);
    expect(section(ctx, "introduction").lines).toEqual(["The story has no introduction."]);
    expect(section(ctx, "characters").lines).toEqual(["player1: no name in the story"]);
    const chapter = outline(section(ctx, "chapter").entries);
    const at = chapter.indexOf("  Directions offered");
    expect(chapter.slice(at, at + 5)).toEqual([
      "  Directions offered",
      "    Read the data (outcome_dashboard_insights)",
      "      Advances outcome: outcome_dashboard_insights",
      "        not among the story's outcomes",
      "    Go home",
    ]);
  });
});

describe("turnContext: a new thread's first step (an analysis turn)", () => {
  const ctx = turnContext(BEFORE_THREAD, NEW_THREAD);

  it("shows the plan the fixed analysis made, with step 1 current, and says every version got it", () => {
    const chapter = outline(section(ctx, "chapter").entries);
    expect(chapter[0]).toBe("Turn: 2 of 10 · thread, step 1 of 3, a new thread starts");
    expect(chapter.slice(8, 13)).toEqual([
      "  Plan",
      "    Step 1: Docks — Search: How does Ada search the docks? [current]",
      "      Favorable: Docks goes well",
      "      Mixed: Docks half works",
      "      Unfavorable: Docks fails",
    ]);
    expect(chapter[chapter.length - 1]).toBe("Planned for this turn; every version below was written from the same plan.");
    expect(outline(section(ctx, "outcomes").entries)[1]).toBe("  Does Ada catch the thief? #player1_catch [advances]");
  });

  it("does not list the new thread in the story so far", () => {
    expect(outline(section(ctx, "storySoFar").entries)).toEqual([
      "Chapter 1: The Chase Begins",
      "  Type: switch · flavor",
      "  Question: How does Ada chase the thief?",
      "  For outcome: Does Ada catch the thief? #player1_catch",
      "  Turn 1: The Chase Begins — Ada hears of the theft.",
      "    Chosen: Test option 1",
    ]);
  });

  it("does not claim a shared plan on a plain thread step", () => {
    expect(outline(section(turnContext(PLAIN), "chapter").entries).some((line) => line.startsWith("Planned"))).toBe(false);
  });
});

describe("turnContext: the ending", () => {
  const ctx = turnContext(ENDING);

  it("says the story closes, shows the chapter that just ended and every outcome it must resolve", () => {
    expect(outline(section(ctx, "chapter").entries)).toEqual([
      "Turn: 5 · the ending, the story closes",
      "Just ended: Through the Fog",
      "  Result: Favorable",
      "  Milestone to add this turn: Ada corners the thief.",
      "  For outcome: Does Ada catch the thief? #player1_catch [due]",
      "  Type: challenge · Chase",
      "  Plan",
      "    Step 1: Docks — Search: How does Ada search the docks?",
      "      Result: Favorable — Docks goes well",
      "    Step 2: Rooftops — Pursuit: How does Ada follow over the roofs?",
      "      Result: Favorable — Rooftops goes well",
      "    Step 3: Bell tower — Showdown: How does Ada face the thief?",
      "      Result: Favorable — Bell tower goes well",
      "Must resolve",
      "  Does Ada catch the thief? #player1_catch",
      "    Milestones so far: 1 of 3",
      "      Ada found the trail.",
      "    Favorable: Won.",
      "    Mixed: Half won.",
      "    Unfavorable: Lost.",
      "  Does Ada find a home? #player1_home",
      "    Milestones so far: 0 of 2",
      "    Favorable: Won.",
      "    Mixed: Half won.",
      "    Unfavorable: Lost.",
    ]);
    expect(outline(section(ctx, "outcomes").entries).filter((line) => line.includes("["))).toEqual(["  Does Ada catch the thief? #player1_catch [due]"]);
  });
});

describe("turnContext: multiplayer", () => {
  function duo(threads: unknown[]): StoryState {
    const base = story([switchPhase(0, [aSwitch({ players: ["player1", "player2"] })]), threadPhase(1, threads)], [FIRST_BEAT, THREAD_BEATS[0]]);
    return {
      ...base,
      sharedOutcomes: [outcome("shared_port", "Is the port saved?")],
      players: {
        ...base.players,
        player2: {
          ...base.players.player1,
          name: "Bo",
          fluff: "A dock worker",
          outcomes: [outcome("player2_rich", "Does Bo get rich?")],
          beatHistory: [beat("The Chase Begins", "Bo hears of the theft.", "resolution2"), beat("Tug of War (1/3)", "Bo grabs the rope.", "sideAWins", 2)] as unknown as Beat[],
        },
      },
    };
  }
  const contest = thread({
    title: "Tug of War",
    outcomeId: "shared_port",
    playersSideA: ["player1"],
    playersSideB: ["player2"],
    typeOfThread: "Duel",
    possibleMilestones: { sideAWins: "Ada holds the port.", mixed: "They split the port.", sideBWins: "Bo takes the port." },
    progression: [contestStep("Pier", "sideAWins"), contestStep("Crane"), contestStep("Gate")],
  });
  const ctx = turnContext(duo([contest]));

  it("names the sides of a contest, whose outcome it advances and each step's result", () => {
    expect(outline(section(ctx, "chapter").entries).slice(1, 12)).toEqual([
      "Chapter: Tug of War",
      "  Type: contest · Duel",
      "  Side A: Ada",
      "  Side B: Bo",
      "  Advances outcome: Is the port saved? #shared_port",
      "    For: all players (shared)",
      "    Milestones so far: 0 of 2",
      "  Kind of milestone: Whether the thief is caught",
      "  Length: 3 turns",
      "  Plan",
      "    Step 1: Pier — Duel: Who wins the Pier?",
    ]);
    expect(outline(section(ctx, "chapter").entries)).toContain("      Result: Side A wins — Pier A");
    expect(outline(section(ctx, "chapter").entries)).toContain("    Side B wins: Bo takes the port.");
  });

  it("groups outcomes as shared and per character, and keeps one before-this-turn fold per player", () => {
    expect(outline(section(ctx, "outcomes").entries)).toEqual([
      "Shared outcomes",
      "  Is the port saved? #shared_port [advances]",
      "    Milestones so far: 0 of 2",
      "Character: Ada",
      "  Does Ada catch the thief? #player1_catch",
      "    Milestones so far: 1 of 3",
      "      Ada found the trail.",
      "  Does Ada find a home? #player1_home",
      "    Milestones so far: 0 of 2",
      "Character: Bo",
      "  Does Bo get rich? #player2_rich",
      "    Milestones so far: 0 of 2",
    ]);
    expect(ctx.filter((s) => s.key?.startsWith("before")).map((s) => [s.key, s.heading])).toEqual([
      ["before.player1", "Before this turn: player 1"],
      ["before.player2", "Before this turn: player 2"],
    ]);
  });

  it("lists a shared outcome that each player's outcomes also copy once, as shared, as the game looks it up", () => {
    const base = duo([contest]);
    const copied: StoryState = {
      ...base,
      players: Object.fromEntries(
        Object.entries(base.players).map(([slot, p]) => [slot, { ...p, outcomes: [outcome("shared_port", "Is the port saved?"), ...p.outcomes] }])
      ),
    };
    const out = outline(section(turnContext(copied), "outcomes").entries);
    expect(out).toEqual(outline(section(ctx, "outcomes").entries));
    expect(out.filter((l) => l.includes("Is the port saved?"))).toEqual(["  Is the port saved? #shared_port [advances]"]);
  });

  it("gives each player's beat in the story so far", () => {
    expect(outline(section(ctx, "storySoFar").entries).filter((line) => line.includes("Turn 2"))).toEqual([
      "  Turn 2: Ada · Through the Fog (1/3) — Ada searches the docks.",
      "  Turn 2: Bo · Tug of War (1/3) — Bo grabs the rope.",
    ]);
  });

  it("shows parallel threads as one chapter each, with their players", () => {
    const parallel = turnContext(duo([thread(), thread({ title: "Counting Coins", outcomeId: "player2_rich", playersSideA: ["player2"] })]));
    const chapter = outline(section(parallel, "chapter").entries);
    expect(chapter.filter((line) => line.startsWith("Chapter") || line.startsWith("  Players"))).toEqual([
      "Chapter: Through the Fog",
      "  Players: Ada",
      "Chapter: Counting Coins",
      "  Players: Bo",
    ]);
    expect(outline(section(parallel, "outcomes").entries).filter((line) => line.includes("[advances]"))).toEqual([
      "  Does Ada catch the thief? #player1_catch [advances]",
      "  Does Bo get rich? #player2_rich [advances]",
    ]);
  });
});

describe("turnContext: missing fields", () => {
  it("reads an empty state without throwing", () => {
    const ctx = turnContext({} as StoryState);
    expect(keysOf(ctx)).toEqual(["chapter"]);
    expect(outline(section(ctx, "chapter").entries)).toEqual(["Turn: 1"]);
  });

  it("shows only the fields a sparse state holds", () => {
    const sparse = { players: { player1: { name: "Ada", beatHistory: [{ summary: "Ada waits." }] } }, storyPhases: [{ threads: [{ title: "Bare" }] }] } as unknown as StoryState;
    const ctx = turnContext(sparse);
    expect(keysOf(ctx)).toEqual(["chapter", "before", "storySoFar"]);
    expect(outline(section(ctx, "chapter").entries)).toEqual(["Turn: 2 · thread, step 1, a new thread starts", "Chapter: Bare"]);
    expect(section(ctx, "before").lines).toEqual(["Character: Ada", "Previous beat: Ada waits."]);
    expect(outline(section(ctx, "storySoFar").entries)).toEqual(["Turn 1: Ada waits."]);
  });

  it("names an outcome id the story does not hold, rather than guessing one", () => {
    const ctx = turnContext(story([switchPhase(0, [aSwitch()]), threadPhase(1, [thread({ outcomeId: "player1_gone", progression: steps("favorable") })])], [FIRST_BEAT, THREAD_BEATS[0]]));
    const chapter = outline(section(ctx, "chapter").entries);
    expect(chapter.slice(3, 5)).toEqual(["  Advances outcome: player1_gone", "    not among the story's outcomes"]);
    expect(outline(section(ctx, "outcomes").entries).filter((line) => line.includes("[advances]"))).toEqual([]);
  });
});

describe("contextBeatType", () => {
  it("agrees with the game's beat type on every kind of turn", () => {
    const applied = (state: StoryState, fixed?: FixedAnalysis) =>
      fixed ? { ...state, storyPhases: [...state.storyPhases, fixed.phase] } : state;
    const turns: [StoryState, FixedAnalysis | undefined, string][] = [
      [PLAIN, undefined, "thread"],
      [AFTER_THREAD, TOPIC_SWITCH, "switch"],
      [FIRST, OPENING, "switch"],
      [BEFORE_THREAD, NEW_THREAD, "thread"],
      [ENDING, undefined, "ending"],
      [FIRST, undefined, "intro"],
    ];
    for (const [state, fixed, expected] of turns) {
      expect(contextBeatType(state, fixed)).toBe(expected);
      expect(Story.create(applied(state, fixed)).getCurrentBeatType()).toBe(expected);
    }
  });
});

describe("turn context: blinding", () => {
  const bareFirst: StoryState = {
    ...FIRST,
    sharedOutcomes: [],
    characterSelectionIntroduction: { title: "", text: "" },
    players: { player1: { ...FIRST.players.player1, name: "", outcomes: [] } },
  };
  const contexts = [
    turnContext(PLAIN),
    turnContext(AFTER_THREAD, TOPIC_SWITCH),
    turnContext(FIRST, OPENING),
    turnContext(bareFirst, OPENING),
    turnContext(BEFORE_THREAD, NEW_THREAD),
    turnContext(ENDING),
  ];
  const labelsOf = (lines: ContextLine[] = []): string[] => lines.flatMap((l) => [...(l.label ? [l.label] : []), ...labelsOf(l.sub)]);

  it("takes every heading and label from the registered fixed text, none of it a leak word", () => {
    const registered = new Set(pageFieldLabels("turn"));
    for (const sections of contexts) {
      for (const s of sections) {
        expect(registered.has(s.heading.replace(/: player \d+$/, ""))).toBe(true);
        for (const label of labelsOf(s.entries)) expect([label, registered.has(label.replace(/ \d+$/, ""))]).toEqual([label, true]);
      }
    }
    expect(pageFieldLabels("turn")).toEqual(expect.arrayContaining(Object.values(CONTEXT_LABELS)));
    expect(Object.values(CONTEXT_LABELS).filter((label) => LEAK_PATTERN.test(label))).toEqual([]);
  });

  it("reads the context's labels in the metadata check", () => {
    const leaky: RatingSet = {
      ...turnSet([{ key: "chapter", heading: "This chapter", lines: [], entries: [{ label: "Effort", text: "x" }] }]),
      fieldLabels: [],
    };
    expect(metadataLeaks(leaky)).toEqual(['turn-01 context label: "Effort"']);
  });
});

function turnSet(context: ContextSection[]): RatingSet {
  const content: TurnContent = { kind: "turn", beats: [{ slot: "player1", playerName: "Ada", title: "Rooftops", paragraphs: ["You run."], options: ["Jump", "Wait", "Call out"], interludes: [] }] };
  return {
    setId: "text-turn",
    pageId: "page",
    kind: "turn",
    title: "Turns",
    instructions: [],
    fieldLabels: pageFieldLabels("turn"),
    items: [{ id: "turn-01", context, options: ["A", "B"].map((label) => ({ label, content })) }],
    preview: false,
  };
}

describe("renderRatingPage: the turn context", () => {
  const set = turnSet(turnContext({ ...PLAIN, guidelines: { ...PLAIN.guidelines, world: "A port </script><b>bold</b>" } }));
  const html = renderRatingPage(set);
  const tree = parseHtml(html);

  it("folds the story so far and the story at load, and leaves the rest open", () => {
    const folds = select(tree, "details.ctx");
    expect(folds.map((d) => d.attrs["data-sec"])).toEqual(["chapter", "outcomes", "before", "storySoFar", "story"]);
    expect(folds.map((d) => d.attrs.open !== undefined)).toEqual([true, true, true, false, false]);
    expect(folds.map((d) => textOf(kids(d, "summary")[0]))).toEqual(["This chapter", "Outcomes", "Before this turn", "Story so far", "The story"]);
    expect(["storySoFar", "story"].filter((key) => startsOpen("turn", key))).toEqual([]);
    expect(["chapter", "outcomes", "before", "before.player2", "introduction", "characters"].filter((key) => !startsOpen("turn", key))).toEqual([]);
  });

  it("marks the current step and the advancing outcome visibly", () => {
    const current = select(tree, "li.current");
    expect(current).toHaveLength(1);
    expect(textOf(current[0])).toBe(
      "Step 2: Rooftops — Pursuit: How does Ada follow over the roofs? current step Favorable: Rooftops goes well Mixed: Rooftops half works Unfavorable: Rooftops fails"
    );
    const advancing = select(tree, "li.advances");
    expect(advancing).toHaveLength(1);
    expect(textOf(advancing[0])).toBe("Does Ada catch the thief? player1_catch this chapter advances it Milestones so far: 1 of 3 Ada found the trail.");
    expect(select(tree, "span.badge").map(textOf)).toEqual(["current step", "this chapter advances it"]);
  });

  it("marks an outcome with every badge it carries: the milestone due this turn and the chapter advancing it", () => {
    const flavor = renderRatingPage(turnSet(turnContext(AFTER_THREAD, { kind: "switch", phase: switchPhase(4, [aSwitch()]) } as unknown as FixedAnalysis)));
    const outcomes = select(parseHtml(flavor), "details.ctx").find((d) => d.attrs["data-sec"] === "outcomes") as HtmlNode;
    const marked = select(outcomes, "li.due");
    expect(marked.map((li) => li.attrs.class)).toEqual(["due advances"]);
    expect(select(marked[0], "span.badge").map(textOf)).toEqual(["gets a milestone this turn", "this chapter advances it"]);
  });

  it("wraps long unbroken words and ids in the context, so a narrow screen does not scroll sideways", () => {
    expect(html).toMatch(/\.context\{[^}]*overflow-wrap:anywhere/);
  });

  it("changes nothing outside the context: the options, the controls, the ids and the page data", () => {
    const bare = renderRatingPage({ ...set, items: set.items.map((item) => ({ ...item, context: [] })) });
    expect(html.replace(/<div class="context">[\s\S]*?<\/div>(?=\n<div class="compare)/, "")).toBe(bare);
  });

  it("escapes narrative and keeps the leak words out of every attribute", () => {
    expect(html).not.toContain("</script><b>");
    expect(html).toContain("A port &lt;/script&gt;&lt;b&gt;bold&lt;/b&gt;");
    const attributes = all(tree, () => true).flatMap((n) => Object.values(n.attrs));
    expect(attributes.filter((value) => LEAK_PATTERN.test(value))).toEqual([]);
  });
});

describe("ratingSetFromKey: the turn context", () => {
  it("builds the context from the case state with its fixed analysis applied, as every option's beat call saw it", () => {
    const c = evalCase("cont-a-t2", "beat", { state: BEFORE_THREAD, fixedAnalysis: NEW_THREAD });
    const output = { player1: { title: "Through the Fog (1/3)", text: "You search.", options: [{ text: "Look" }], interludes: [] } };
    const records: CallRecord[] = [BASELINE, LUNA].map((arm) =>
      record({ caseId: c.id, armKey: arm.key, callArmKey: arm.key, baseline: arm.baseline, outputFile: arm.key })
    );
    const ref = (armKey: string) => ({ promptState: "prefix", armKey, sample: 1, caseId: c.id });
    const key: RatingKey = {
      setId: "text-turn",
      pageId: "page",
      salt: "salt",
      keyFile: "text-turn-page.json",
      createdAt: "2026-09-27T00:00:00.000Z",
      baseline: { promptState: "prefix", armKey: BASELINE.key },
      items: { "turn-01": { caseId: c.id, labels: { A: ref(LUNA.key), B: ref(BASELINE.key) } } },
      labelDistribution: {},
      notes: [],
    };
    const set = ratingSetFromKey(key, records, [c], () => output);
    const chapter = outline(section(set.items[0].context, "chapter").entries);
    expect(chapter[0]).toBe("Turn: 2 of 10 · thread, step 1 of 3, a new thread starts");
    expect(chapter[1]).toBe("Chapter: Through the Fog");
    expect(set.fieldLabels).toEqual(expect.arrayContaining(Object.values(CONTEXT_LABELS)));
    expect(metadataLeaks(set)).toEqual([]);
  });
});
