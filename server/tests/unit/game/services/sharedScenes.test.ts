import { describe, expect, it, jest } from "@jest/globals";
import { z } from "zod";
import { Story } from "core/models/Story.js";
import type { Beat, Outcome, StoryPhase, SwitchAnalysis, ThreadAnalysis } from "core/types/index.js";
import { GameModes } from "core/types/index.js";
import {
  SHARED_SCENES,
  sceneOf,
  scenesBlock,
  takesScenesBlock,
  takesScenesPlanner,
} from "../../../../src/game/services/sharedScenes.js";
import { assembleThreadPlan, threadReplySchema } from "../../../../src/game/services/plannerReplies.js";
import { beatStep, threadStep } from "../../../../src/game/services/storyTextSteps.js";
import { firstSwitchBeat, laterSwitchBeat, threadBeat } from "../../../helpers/promptStories.js";
import { createMockMultiplayerStory } from "../../../helpers/testHelpers.js";
import { beatGeneration, outcome, thread } from "../../../helpers/textFixtures.js";

/*
 * Shared scenes in group stories (production since the scenes stage of
 * 2026-10-01 evening, decision A): where the picks split a group, the chapter
 * planner is told that every player is in one thread even where a pick names
 * another player, that one person or group is in one thread's scene, and
 * writes each thread's scene; the group turn on a chapter's opening step with
 * several threads reads where everyone is (each thread's players and scene)
 * and a consistency line. Measured as the eval's sharedScenesB, whose chains
 * (the planner, then the chapter's opening) passed; its turn on later steps,
 * measured alone, did not, so a later step keeps production's turn.
 */

jest.spyOn(console, "log").mockImplementation(() => undefined);

const occurrences = (text: string, passage: string) => text.split(passage).length - 1;

const FRIENDSHIP: Outcome = outcome("shared_friendship", { question: "What becomes of the agents' friendship?" });
const NAMES = ["Rory Finch", "Tamsin Okafor", "Oren Pike"];
const slots = (players: number) => Array.from({ length: players }, (_, i) => `player${i + 1}`);

const lastBeat = (choice: number): Beat => ({ ...beatGeneration({ text: "A text.", summary: "A summary." }), choice, resolution: "resolution1" });

function topicSwitch(slot: string, outcomes: string[]): SwitchAnalysis["switches"][number] {
  return {
    players: [slot],
    type: "topic",
    relevantSuggestedThreadTypes: [],
    previousThreadTypesToBeAvoided: [],
    relevantSwitchAndThreadInstructions: "",
    outcomeId: "",
    question: "",
    topicChoices: outcomes.map((id) => `Go toward ${id} (${id})`),
    topicDirections: outcomes.map((id) => ({ direction: `Go toward ${id}`, outcomeId: id })),
    relationshipToOtherSwitches: "",
    title: `Switch of ${slot}`,
    id: `switch_${slot}`,
  } as SwitchAnalysis["switches"][number];
}

const switchPhase = (switches: SwitchAnalysis["switches"], firstBeatIndex: number): SwitchAnalysis =>
  ({ coordinationPatternAnalysis: "", coordinationPatternSummary: "", switches, firstBeatIndex, duration: 1 }) as SwitchAnalysis;

function resolvedChapter(players: string[]): ThreadAnalysis {
  const t = thread("challenge", 2, 1, players);
  return {
    relevantSwitchAndThreadInstructions: "",
    coordinationPatternSummary: "",
    duration: 2,
    firstBeatIndex: 1,
    threads: [{ ...t, id: "done", outcomeId: "shared_friendship", progression: t.progression.map((s) => ({ ...s, resolution: "favorable" as const })), resolution: "favorable" as const, milestone: "M" }],
  };
}

function groupStory(phases: StoryPhase[], turns: number, picks: number[], players = 2): Story {
  const base = createMockMultiplayerStory(players).getState();
  const withPlayers = Object.fromEntries(
    Object.entries(base.players).map(([slot, player], i) => [slot, { ...player, name: NAMES[i], outcomes: [outcome(`${slot}_own`)], beatHistory: Array.from({ length: turns }, (_, k) => lastBeat(k === turns - 1 ? (picks[i] ?? 0) : 0)) }])
  );
  return Story.create({ ...base, gameMode: GameModes.Competitive, sharedOutcomes: [FRIENDSHIP], players: withPlayers, storyPhases: phases, maxTurns: 25 });
}

function chapterPlanning(picks: number[], players = 2): Story {
  const switches = slots(players).map((slot) => topicSwitch(slot, ["shared_friendship", `${slot}_own`]));
  return groupStory([switchPhase([{ ...topicSwitch("player1", ["shared_friendship"]), players: slots(players) }], 0), resolvedChapter(slots(players)), switchPhase(switches, 3)], 4, picks, players);
}

/** A group chapter step of a chapter with one thread per entry (its scene where given), `done` of its three steps played (0: the chapter's opening). */
function chapterStep(threads: [string, string[], string?][], players = 2, done = 0): Story {
  const chapter: ThreadAnalysis = {
    relevantSwitchAndThreadInstructions: "",
    coordinationPatternSummary: "",
    duration: 3,
    firstBeatIndex: 2,
    threads: threads.map(([outcomeId, sideA, scene], i) => {
      const t = thread("challenge", 3, 2, sideA);
      return { ...t, id: `thread_${i}`, title: `Thread ${i + 1}`, outcomeId, progression: t.progression.map((step, k) => ({ ...step, resolution: k < done ? ("favorable" as const) : null })), ...(scene ? { scene } : {}) };
    }),
  };
  return groupStory([switchPhase([{ ...topicSwitch("player1", ["shared_friendship"]), players: slots(players) }], 1), chapter], 2 + done, [], players);
}

type Loose = Record<string, unknown>;
const threadElement = (schema: z.AnyZodObject) => (schema.shape.threads as z.ZodArray<z.AnyZodObject>).element;

describe("when the scenes apply", () => {
  it("the chapter planner's: a group after its first chapter whose picks set more than one outcome", () => {
    expect(takesScenesPlanner(chapterPlanning([1, 1]))).toBe(true);
    expect(takesScenesPlanner(chapterPlanning([0, 1]))).toBe(true);
    expect(takesScenesPlanner(chapterPlanning([0, 0]))).toBe(false);
    expect(takesScenesPlanner(firstSwitchBeat(2))).toBe(false);
    expect(takesScenesPlanner(threadBeat(1))).toBe(false);
  });

  it("the group turn's: a group chapter's opening step whose chapter has more than one thread (as the chains measured it; not a later step)", () => {
    expect(takesScenesBlock(chapterStep([["shared_friendship", ["player1"]], ["player2_own", ["player2"]]]))).toBe(true);
    expect(takesScenesBlock(chapterStep([["shared_friendship", ["player1", "player3"]], ["player2_own", ["player2"]]], 3))).toBe(true);
    // A later step: the turn alone on the round's stored plans moved no split and told more openings again
    expect(takesScenesBlock(chapterStep([["shared_friendship", ["player1"]], ["player2_own", ["player2"]]], 2, 1))).toBe(false);
    expect(takesScenesBlock(chapterStep([["shared_friendship", ["player1"]], ["player2_own", ["player2"]]], 2, 2))).toBe(false);
    expect(takesScenesBlock(chapterStep([["shared_friendship", ["player1", "player2"]]]))).toBe(false);
    expect(takesScenesBlock(threadBeat(2))).toBe(false);
    expect(takesScenesBlock(laterSwitchBeat(2))).toBe(false);
    expect(takesScenesBlock(threadBeat(1))).toBe(false);
  });
});

describe("the chapter planner", () => {
  it("prints the line once after the player configurations where the picks split the group, and nowhere else", () => {
    const split = threadStep.request(chapterPlanning([0, 1])).prompt;
    expect(occurrences(split, SHARED_SCENES.plannerLine)).toBe(1);
    expect(split).toContain(`- Mixed setup: Some players are in a joint thread while others are in independent threads.${SHARED_SCENES.plannerLine}`);
    for (const story of [chapterPlanning([0, 0]), firstSwitchBeat(2), threadBeat(1)]) expect(threadStep.request(story).prompt).not.toContain(SHARED_SCENES.plannerLine);
  });

  it("says every player is in one thread even where a pick names another, one person or group in one thread's scene, no stand-in for a contest's absent side", () => {
    expect(SHARED_SCENES.plannerLine).toContain("Every player is in exactly one thread and only in its scenes");
    expect(SHARED_SCENES.plannerLine).toContain('"Meet Rory at the café"');
    expect(SHARED_SCENES.plannerLine).toContain("only one thread's scene has them");
    expect(SHARED_SCENES.plannerLine).toContain("no rival's crew, station or vehicle");
    expect(SHARED_SCENES.plannerLine).toContain("Each thread's scene says where it happens and who and what is there besides its players.");
  });

  it("asks each thread for its scene right after its players where the picks split the group, and keeps it on the plan", () => {
    const story = chapterPlanning([0, 1]);
    const keys = Object.keys(threadElement(threadReplySchema(story)).shape);
    expect(keys.slice(keys.indexOf("playersSideB"), keys.indexOf("playersSideB") + 2)).toEqual(["playersSideB", "scene"]);
    expect(threadElement(threadReplySchema(story)).shape.scene.description).toBe(SHARED_SCENES.sceneField);
    expect(Object.keys(threadElement(threadReplySchema(chapterPlanning([0, 0]))).shape)).not.toContain("scene");
    const written = { kind: "exploration", outcomeId: "shared_friendship", playersSideA: ["player2"], playersSideB: [], title: "Off the Clock", steps: [], finalStep: { title: "F", question: "Q" }, possibleMilestones: {} };
    const plan = assembleThreadPlan(story, { grouping: "apart", duration: 2, threads: [{ ...written, scene: " The Amber Cup café. " }, { ...written, playersSideA: ["player1"], title: "The Room", scene: "" }] });
    expect([sceneOf(plan.threads[0]), "scene" in (plan.threads[1] as unknown as Loose)]).toEqual(["The Amber Cup café.", false]);
    // The plan the story stores keeps it
    expect(sceneOf(threadStep.apply(story, plan).getCurrentThreadAnalysis()?.threads[0])).toBe("The Amber Cup café.");
  });
});

describe("the group turn", () => {
  it("prints where everyone is before the thread configuration and the consistency line once, on a chapter's opening step with several threads only", () => {
    const story = chapterStep([["shared_friendship", ["player2"], "The Amber Cup café, with the café owner."], ["player1_own", ["player1"]]]);
    const prompt = beatStep.request(story).prompt;
    expect(occurrences(prompt, scenesBlock(story))).toBe(1);
    expect(prompt).toContain(`${scenesBlock(story)}\n======= CURRENT THREAD CONFIGURATION =======`);
    expect(occurrences(prompt, SHARED_SCENES.turnLine)).toBe(1);
    expect(prompt).toContain(`- This is particularly important if several players are in the same thread or switch (so the beats for the different players are consistent with each other).\n${SHARED_SCENES.turnLine}`);
    const later = chapterStep([["shared_friendship", ["player2"], "The Amber Cup café, with the café owner."], ["player1_own", ["player1"]]], 2, 1);
    for (const other of [later, chapterStep([["shared_friendship", ["player1", "player2"]]]), threadBeat(2), laterSwitchBeat(2), threadBeat(1)]) {
      expect(beatStep.request(other).prompt).not.toContain(SHARED_SCENES.blockHead);
      expect(beatStep.request(other).prompt).not.toContain(SHARED_SCENES.turnLine);
    }
  });

  it("names each thread, its players and its scene where the plan holds one, then the rule", () => {
    const story = chapterStep([["shared_friendship", ["player2"], "The Amber Cup café, with the café owner."], ["player1_own", ["player1"]]]);
    expect(scenesBlock(story)).toBe(
      `${SHARED_SCENES.blockHead}- "Thread 1": Tamsin Okafor. Scene: The Amber Cup café, with the café owner.\n- "Thread 2": Rory Finch\n${SHARED_SCENES.blockRule}`
    );
    expect(scenesBlock(chapterStep([["shared_friendship", ["player1", "player3"]], ["player2_own", ["player2"]]], 3))).toContain('- "Thread 1": Rory Finch and Oren Pike\n');
    expect(SHARED_SCENES.blockRule).toContain("never shown there, even where a choice or a step names them");
  });
});
