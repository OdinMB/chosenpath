import { describe, expect, it, jest } from "@jest/globals";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { Story } from "core/models/Story.js";
import type { Beat, Outcome, StoryPhase, SwitchAnalysis, ThreadAnalysis } from "core/types/index.js";
import { GameModes } from "core/types/index.js";
import {
  PLACES_CALIBRATION,
  PLACES_CHECK,
  PLACES_JUDGE_PROMPT_VERSION,
  placesJudgeCaseId,
  contestDecidedAlone,
  lastStageOffers,
  oneSidedNames,
  placesEvidenceFrom,
  placesJudgeRequest,
  placesJudgeSchema,
  placesVerdictFrom,
  renderPlacesJudge,
  scorePlacesCalibration,
} from "../../../../src/evals/textModelEval/parallelThreadsJudge.js";
import { threadBeat } from "../../../helpers/promptStories.js";
import { createMockMultiplayerStory } from "../../../helpers/testHelpers.js";
import { beatGeneration, beatSet, outcome, thread } from "../../../helpers/textFixtures.js";

/*
 * The parallel-threads stage's checks (2026-10-01, fix 4 of the second
 * playthroughs' review). The judged check placesConsistent reads one group
 * turn, every player's text, with who is in which thread: is every person,
 * group and vehicle in one place, in no scene of a thread they are not in,
 * and every shared place in one state? Beside it, three readings the game
 * makes on the plans themselves: how a switch offers a contested outcome
 * whose next thread settles its last stage, which absent players a one-sided
 * thread on a contested outcome names, and whether a chapter settles a
 * contested outcome's last stage with one side alone.
 */

jest.spyOn(console, "log").mockImplementation(() => undefined);

const CONTESTED: Outcome = outcome("shared_sale", {
  question: "Who sells the house?",
  possibleResolutions: { sideAWins: "Rory sells it.", mixed: "Neither sells it.", sideBWins: "Nia sells it." },
  intendedNumberOfMilestones: 3,
});

const NAMES = ["Rory Vale", "Nia Hart", "Pip Moss"];

function groupStory(phases: StoryPhase[], turns: number, saleMilestones: number, players = 2): Story {
  const base = createMockMultiplayerStory(players).getState();
  const withPlayers = Object.fromEntries(
    Object.entries(base.players).map(([slot, player], i) => [
      slot,
      {
        ...player,
        name: NAMES[i],
        outcomes: [outcome(`${slot}_own`)],
        beatHistory: Array.from({ length: turns }, (): Beat => ({ ...beatGeneration({ text: "A text.", summary: "A summary." }), choice: 0, resolution: "resolution1" })),
      },
    ])
  );
  const sale = { ...CONTESTED, milestones: Array.from({ length: saleMilestones }, (_, k) => `Sale milestone ${k + 1}`) };
  return Story.create({ ...base, gameMode: GameModes.Competitive, sharedOutcomes: [sale], players: withPlayers, storyPhases: phases, maxTurns: 25 });
}

const slots = (players: number) => Array.from({ length: players }, (_, i) => `player${i + 1}`);

function switchPhase(switches: SwitchAnalysis["switches"], firstBeatIndex: number): SwitchAnalysis {
  return { coordinationPatternAnalysis: "", coordinationPatternSummary: "", switches, firstBeatIndex, duration: 1 } as SwitchAnalysis;
}

const sw = (players: string[], type: "topic" | "flavor", outcomes: string[]): SwitchAnalysis["switches"][number] =>
  ({
    players,
    type,
    relevantSuggestedThreadTypes: [],
    previousThreadTypesToBeAvoided: [],
    relevantSwitchAndThreadInstructions: "",
    outcomeId: type === "flavor" ? outcomes[0] : "",
    question: type === "flavor" ? "Who?" : "",
    topicChoices: type === "topic" ? outcomes.map((id) => `Toward ${id} (${id})`) : [],
    ...(type === "topic" ? { topicDirections: outcomes.map((id) => ({ direction: `Toward ${id}`, outcomeId: id })) } : {}),
    relationshipToOtherSwitches: "",
    title: "A switch",
    id: `sw_${players.join("_")}`,
  }) as SwitchAnalysis["switches"][number];

/** A resolved two-step chapter on the sale with every player (history 1-2). */
function saleChapter(players: number): ThreadAnalysis {
  const t = thread("challenge", 2, 1, slots(players));
  return {
    relevantSwitchAndThreadInstructions: "",
    coordinationPatternSummary: "",
    duration: 2,
    firstBeatIndex: 1,
    threads: [{ ...t, outcomeId: "shared_sale", progression: t.progression.map((s) => ({ ...s, resolution: "favorable" as const })), resolution: "favorable" as const, milestone: "Sold?" }],
  };
}

/** The switch planner's input after the sale chapter: the sale at `recorded` of 3 plus the pending one. */
const beforeSwitch = (recorded: number, players = 2) => groupStory([switchPhase([sw(slots(players), "flavor", ["shared_sale"])], 0), saleChapter(players)], 3, recorded, players);

/** The chapter planner's input after a later switch: the sale at `recorded` of 3. */
const beforeChapter = (recorded: number, players = 2) =>
  groupStory([switchPhase([sw(slots(players), "flavor", ["shared_sale"])], 0), saleChapter(players), switchPhase([sw(slots(players), "flavor", ["shared_sale"])], 3)], 4, recorded, players);

const plan = (switches: SwitchAnalysis["switches"]): SwitchAnalysis => switchPhase(switches, 3);

function chapterPlan(threads: { outcomeId: string; sideA: string[]; sideB?: string[]; question?: string; results?: Record<string, string> }[]): ThreadAnalysis {
  return {
    relevantSwitchAndThreadInstructions: "",
    coordinationPatternSummary: "",
    duration: 2,
    firstBeatIndex: 4,
    threads: threads.map((t, i) => {
      const kind = t.sideB?.length ? "contest" : "challenge";
      const base = thread(kind, 2, 4, t.sideA, t.sideB ?? []);
      const results = t.results ?? base.possibleMilestones;
      return {
        ...base,
        id: `t${i}`,
        outcomeId: t.outcomeId,
        question: t.question ?? "What happens?",
        possibleMilestones: results,
        progression: base.progression.map((s) => ({ ...s, question: t.question ?? "Q", possibleResolutions: results })),
      } as ThreadAnalysis["threads"][number];
    }),
  };
}

describe("how a switch offers a contested outcome whose next thread settles its last stage", () => {
  it("reads grouped (a flavor switch with every player), not offered, a direction one side could take alone, or a flavor switch for some players", () => {
    const story = beforeSwitch(1); // 1 recorded + 1 pending of 3: the next thread settles the last stage
    expect(lastStageOffers(story, plan([sw(["player1", "player2"], "flavor", ["shared_sale"])]))).toEqual([{ outcomeId: "shared_sale", offered: "grouped", passes: true }]);
    expect(lastStageOffers(story, plan([sw(["player1"], "topic", ["player1_own"]), sw(["player2"], "topic", ["player2_own"])]))).toEqual([{ outcomeId: "shared_sale", offered: "not offered", passes: true }]);
    expect(lastStageOffers(story, plan([sw(["player1"], "topic", ["shared_sale", "player1_own"]), sw(["player2"], "topic", ["shared_sale", "player2_own"])]))).toEqual([
      { outcomeId: "shared_sale", offered: "a direction among others", passes: false },
    ]);
    expect(lastStageOffers(story, plan([sw(["player1"], "flavor", ["shared_sale"]), sw(["player2"], "topic", ["player2_own"])]))).toEqual([
      { outcomeId: "shared_sale", offered: "a flavor switch for some players", passes: false },
    ]);
  });

  it("reads nothing where no contested outcome's next thread settles its last stage", () => {
    expect(lastStageOffers(beforeSwitch(0), plan([sw(["player1"], "topic", ["shared_sale"]), sw(["player2"], "topic", ["shared_sale"])]))).toEqual([]);
    expect(lastStageOffers(beforeSwitch(2), plan([sw(["player1", "player2"], "flavor", ["shared_sale"])]))).toEqual([]);
  });
});

describe("the absent players a one-sided thread on a contested outcome names", () => {
  it("names another player's character where the thread's players are one side, in its question, steps or results", () => {
    const story = beforeChapter(1);
    const named = chapterPlan([
      { outcomeId: "shared_sale", sideA: ["player2"], question: "Can Nia win Mara over?", results: { favorable: "Mara signs with Nia.", mixed: "Mara waits.", unfavorable: "Mara signs through Rory, giving Rory the commission." } },
      { outcomeId: "player1_own", sideA: ["player1"], question: "What does Rory do with Nia's note?" },
    ]);
    expect(oneSidedNames(story, named)).toEqual([{ threadId: "t0", outcomeId: "shared_sale", players: ["player2"], absentNamed: ["Rory Vale"], passes: false }]);
    const clean = chapterPlan([{ outcomeId: "shared_sale", sideA: ["player2"], question: "Can Nia win Mara over?", results: { favorable: "Mara signs with Nia.", mixed: "Mara waits.", unfavorable: "Mara turns Nia down." } }, { outcomeId: "player1_own", sideA: ["player1"] }]);
    expect(oneSidedNames(story, clean)).toEqual([{ threadId: "t0", outcomeId: "shared_sale", players: ["player2"], absentNamed: [], passes: true }]);
  });

  it("reads no two-sided contest, no own outcome's thread and no thread every player is in", () => {
    const story = beforeChapter(1);
    expect(oneSidedNames(story, chapterPlan([{ outcomeId: "shared_sale", sideA: ["player1"], sideB: ["player2"], question: "Rory or Nia?" }]))).toEqual([]);
    expect(oneSidedNames(story, chapterPlan([{ outcomeId: "shared_sale", sideA: ["player1", "player2"], question: "Rory and Nia?" }]))).toEqual([]);
    expect(oneSidedNames(story, chapterPlan([{ outcomeId: "player1_own", sideA: ["player1"], question: "Nia?" }, { outcomeId: "player2_own", sideA: ["player2"] }]))).toEqual([]);
  });
});

describe("a contested outcome's last stage settled by one side alone", () => {
  it("flags a chapter whose thread settles a contested outcome's last stage with some players only, on one side", () => {
    const alone = chapterPlan([{ outcomeId: "shared_sale", sideA: ["player2"] }, { outcomeId: "player1_own", sideA: ["player1"] }]);
    expect(contestDecidedAlone(beforeChapter(2), alone)).toEqual([{ threadId: "t0", outcomeId: "shared_sale", stage: "3 of 3", players: ["player2"] }]);
    // Not at an earlier stage, not with both sides, not with every player
    expect(contestDecidedAlone(beforeChapter(1), alone)).toEqual([]);
    expect(contestDecidedAlone(beforeChapter(2), chapterPlan([{ outcomeId: "shared_sale", sideA: ["player1"], sideB: ["player2"] }]))).toEqual([]);
    expect(contestDecidedAlone(beforeChapter(2), chapterPlan([{ outcomeId: "shared_sale", sideA: ["player1", "player2"] }]))).toEqual([]);
  });
});

describe("the judge's request", () => {
  const story = (() => {
    const s = threadBeat(3);
    const state = structuredClone(s.getState());
    state.players = Object.fromEntries(Object.entries(state.players).map(([slot, p], i) => [slot, { ...p, name: NAMES[i] }]));
    const chapter = state.storyPhases[1] as ThreadAnalysis;
    const [first] = chapter.threads;
    chapter.threads = [
      { ...first, id: "docks", title: "A Hand on the Rail", playersSideA: ["player1"] },
      { ...first, id: "pylons", title: "The Pylons", playersSideA: ["player2", "player3"], possibleMilestones: { resolution1: "a", resolution2: "b", resolution3: "c" } },
    ];
    return Story.create(state);
  })();
  const reply = beatSet(3, {
    player1: { ...beatSet(1).player1, text: "You stand on the dock.\n\nThe ship's lights flicker across the lane." },
    player2: { ...beatSet(1).player1, text: "You fly the ship through the pylons.\n\nRory speaks over the bridge channel." },
    player3: { ...beatSet(1).player1, text: "You watch the pylons pass." },
  } as never);

  it("reads who is in which thread, each player's text as they read it, and asks the question, never the prompt", () => {
    const request = placesJudgeRequest(story, reply);
    if (!request) throw new Error("no request");
    expect(request.prompt).toContain('Thread "A Hand on the Rail": Rory Vale (player1)');
    expect(request.prompt).toContain('Thread "The Pylons": Nia Hart (player2), Pip Moss (player3)');
    expect(request.prompt).toContain("Rory Vale's text (player1):\n[1] You stand on the dock.\n[2] The ship's lights flicker across the lane.");
    expect(request.prompt).toContain("Nia Hart's text (player2):\n[1] You fly the ship through the pylons.\n[2] Rory speaks over the bridge channel.");
    expect(request.prompt).toContain(`${PLACES_CHECK}: `);
    expect(request.prompt).not.toContain("GENERATE ONE STORY BEAT");
    expect(JSON.stringify(placesJudgeSchema().shape)).toContain(PLACES_CHECK);
  });

  it("asks at prompt v2 (the calibration's one fix) about places only: separate scenes may share a place, a same-named group is one only where the texts make it so", () => {
    expect(PLACES_JUDGE_PROMPT_VERSION).toBe(2);
    const v2 = placesJudgeRequest(story, reply)?.prompt ?? "";
    expect(v2).toContain("separate scenes can share a place");
    expect(v2).toContain("each player's own crew, staff or neighbors are their own");
    expect(v2).not.toContain("in a scene of a thread they are not in");
    expect(placesJudgeCaseId("x")).toBe("judge-places-v2-x");
    // v1 still builds as it ran, so its records read under their own keys
    const v1 = placesJudgeRequest(story, reply, 1)?.prompt ?? "";
    expect(v1).toContain("no one is in a scene of a thread they are not in");
    expect(placesJudgeCaseId("x", 1)).toBe("judge-places-v1-x");
    const schemaText = (version: 1 | 2) => JSON.stringify(toJsonSchema(placesJudgeSchema(version)));
    expect(schemaText(2)).not.toContain("not in their thread");
    expect(schemaText(1)).toContain("not in their thread");
  });

  it("reads group chapter steps only", () => {
    expect(placesJudgeRequest(threadBeat(1), beatSet(1))).toBeUndefined();
  });

  it("reads the verdict and the evidence", () => {
    const parsed = { people: [{ who: "Rory", places: "his text: the dock; Nia's text: the bridge channel", conflict: "two places" }], [PLACES_CHECK]: { evidence: "Rory is on the dock and on the bridge.", answer: "no" } };
    expect(placesVerdictFrom(parsed)).toBe(false);
    expect(placesVerdictFrom({ [PLACES_CHECK]: { answer: "yes" } })).toBe(true);
    expect(placesVerdictFrom({})).toBeUndefined();
    expect(placesEvidenceFrom(parsed)).toEqual({ evidence: "Rory is on the dock and on the bridge.", lines: ["Rory (two places): his text: the dock; Nia's text: the bridge channel"] });
  });
});

describe("the calibration", () => {
  it("holds hand-read items on both sides, each id once, stored turns and constructed versions", () => {
    const ids = PLACES_CALIBRATION.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    const yes = PLACES_CALIBRATION.filter((i) => i.hand === true).length;
    const no = PLACES_CALIBRATION.filter((i) => i.hand === false).length;
    expect(yes).toBeGreaterThanOrEqual(8);
    expect(no).toBeGreaterThanOrEqual(8);
    expect(PLACES_CALIBRATION.filter((i) => i.hand === false && i.edits?.length).length).toBeGreaterThanOrEqual(3);
    // A constructed version is a failing one
    for (const item of PLACES_CALIBRATION.filter((i) => i.edits?.length)) expect([item.id, item.hand]).toEqual([item.id, false]);
  });

  it("scores agreement on sample 1, the samples' agreement and the partial items apart", () => {
    const items = [
      { id: "a", hand: true as const },
      { id: "b", hand: false as const },
      { id: "c", hand: "partial" as const },
    ];
    const reading = scorePlacesCalibration(items, [
      { itemId: "a", samples: [true, true] },
      { itemId: "b", samples: [true, false] },
      { itemId: "c", samples: [false, false] },
    ]);
    expect(reading).toMatchObject({ decided: 2, agree: 1, falsePasses: 1, falseFails: 0, handPasses: 1, handFails: 1, pairs: 3, pairsAgree: 2, partial: { yes: 0, no: 1 }, reliable: false });
  });

  it("renders the calibration, the readings and the plan readings", () => {
    const markdown = renderPlacesJudge({
      report: {
        calibration: scorePlacesCalibration([], []),
        items: PLACES_CALIBRATION.slice(0, 1),
        judged: [],
        readings: [],
        failures: [],
        plans: { switches: [], chapters: [] },
      },
      spentUsd: 0.01,
      generatedAt: new Date("2026-10-01T00:00:00Z"),
      problems: [],
    });
    expect(markdown).toContain(`## ${PLACES_CHECK}`);
    expect(markdown).toContain("## The plans");
  });
});
