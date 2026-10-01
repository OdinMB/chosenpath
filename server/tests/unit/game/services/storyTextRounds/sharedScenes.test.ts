import { describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { z } from "zod";
import { Story } from "core/models/Story.js";
import type { Beat, GameMode, Outcome, StoryPhase, SwitchAnalysis, ThreadAnalysis } from "core/types/index.js";
import { GameModes } from "core/types/index.js";
import {
  SHARED_SCENES_TEXT,
  scenesBlock,
  sharedScenesBase,
  sharedScenesRequest,
  takesScenesBlock,
  takesScenesPlanner,
} from "../../../../../src/game/services/storyTextRounds/sharedScenes.js";
import { beatCallLimits, beatStep, switchStep, threadStep } from "../../../../../src/game/services/storyTextSteps.js";
import { takesScenesBlock as productionTakesScenesBlock } from "../../../../../src/game/services/sharedScenes.js";
import { beatCheckOptions } from "../../../../../src/game/services/kidsTurnRules.js";
import { evalFiles } from "../../../../../src/evals/textModelEval/evalFiles.js";
import { caseStory } from "../../../../../src/evals/textModelEval/cases.js";
import { callLimitsOf, requestFor, requestText, shortTextCountOf } from "../../../../../src/evals/textModelEval/variants.js";
import { productionCallLimits } from "../../../../../src/shared/llm/chatModel.js";
import { firstSwitchBeat, laterSwitchBeat, threadBeat } from "../../../../helpers/promptStories.js";
import { createMockMultiplayerStory } from "../../../../helpers/testHelpers.js";
import { beatGeneration, outcome, thread } from "../../../../helpers/textFixtures.js";

/*
 * Shared scenes in group stories (eval only; decision A's split-scene retest,
 * the evening of 2026-10-01). In the third playthroughs every group story put a
 * person in two places at once, and each split came from a thread one player
 * picked that held a player of another thread or one of another thread's
 * people: the estate agents' friendship thread with Rory in it while Rory
 * restaged the conservatory (turns 6-7) and the reverse (9-11), the food
 * trucks' showcase with Omar's station across the lane while Omar loaded his
 * truck with Jo (12-15), the space pirates' Oren joining "Tomas and Davi at the
 * chart table" while Davi worked the engine (6), the buyer at the nursery
 * door in Rory's thread and at Noor's table in Tamsin's (17). The variant is
 * production's chapter planner with a line and a scene for each thread where
 * the picks split the players, and production's group turn with where
 * everyone is (each thread's players and scene) and a consistency line on a
 * chapter step with several threads; production's request byte for byte
 * everywhere else.
 *
 * Adopted in its fix-and-retest's form (sharedScenesB) after the run of
 * 2026-10-01 (evening), where its chains measured it: the variant builds on
 * production as it stood before (sharedScenesBase, the insertions taken out),
 * and production is sharedScenesB byte for byte, prompt and JSON schema, on
 * the chapter planner and a chapter's opening; a later chapter step keeps
 * production's turn as before, where the variant's turn alone did not pass
 * (below).
 */

jest.spyOn(console, "log").mockImplementation(() => undefined);

const json = (schema: Parameters<typeof toJsonSchema>[0]) => JSON.stringify(toJsonSchema(schema));
const occurrences = (text: string, passage: string) => text.split(passage).length - 1;

const CASES_DIR = path.resolve("..", "DOCS", "2026-09-26_gpt6-text-eval");
const frozen = fs.existsSync(path.join(CASES_DIR, "cases", "cases.json")) ? evalFiles(CASES_DIR).readCases() : [];

const FRIENDSHIP: Outcome = outcome("shared_friendship", { question: "What becomes of the agents' friendship?" });

function lastBeat(choice: number): Beat {
  return { ...beatGeneration({ text: "A text.", summary: "A summary." }), choice, resolution: "resolution1" };
}

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

function switchPhase(switches: SwitchAnalysis["switches"], firstBeatIndex: number): SwitchAnalysis {
  return { coordinationPatternAnalysis: "", coordinationPatternSummary: "", switches, firstBeatIndex, duration: 1 } as SwitchAnalysis;
}

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

const NAMES = ["Rory Finch", "Tamsin Okafor", "Oren Pike"];
const slots = (players: number) => Array.from({ length: players }, (_, i) => `player${i + 1}`);

function groupStory(phases: StoryPhase[], turns: number, picks: number[], players = 2, mode: GameMode = GameModes.Competitive): Story {
  const base = createMockMultiplayerStory(players).getState();
  const withPlayers = Object.fromEntries(
    Object.entries(base.players).map(([slot, player], i) => [
      slot,
      { ...player, name: NAMES[i], outcomes: [outcome(`${slot}_own`)], beatHistory: Array.from({ length: turns }, (_, k) => lastBeat(k === turns - 1 ? (picks[i] ?? 0) : 0)) },
    ])
  );
  return Story.create({ ...base, gameMode: mode, sharedOutcomes: [FRIENDSHIP], players: withPlayers, storyPhases: phases, maxTurns: 25 });
}

/** The chapter planner after a later switch: each player chose the direction at `picks[i]` of [friendship, own]. */
function chapterPlanning(picks: number[], players = 2): Story {
  const switches = slots(players).map((slot) => topicSwitch(slot, ["shared_friendship", `${slot}_own`]));
  return groupStory([switchPhase([{ ...topicSwitch("player1", ["shared_friendship"]), players: slots(players) }], 0), resolvedChapter(slots(players)), switchPhase(switches, 3)], 4, picks, players);
}

/** A chapter step (`done` of its three steps played, step 1 by default; 0 is the chapter's opening) of a chapter with one thread per entry, each with its scene where given. */
function chapterStep(threads: [string, string[], string?][], players = 2, done = 1): Story {
  const chapter: ThreadAnalysis = {
    relevantSwitchAndThreadInstructions: "",
    coordinationPatternSummary: "",
    duration: 3,
    firstBeatIndex: 2,
    threads: threads.map(([outcomeId, sideA, scene], i) => {
      const t = thread("challenge", 3, 2, sideA);
      return {
        ...t,
        id: `thread_${i}`,
        title: `Thread ${i + 1}`,
        outcomeId,
        progression: t.progression.map((step, k) => ({ ...step, resolution: k < done ? ("favorable" as const) : null })),
        ...(scene ? { scene } : {}),
      };
    }),
  };
  return groupStory([switchPhase([{ ...topicSwitch("player1", ["shared_friendship"]), players: slots(players) }], 1), chapter], 2 + done, [], players);
}

/** The prompt with the variant's insertions taken out again. */
function withoutInsertions(prompt: string, story?: Story): string {
  const passages = [SHARED_SCENES_TEXT.plannerLine, SHARED_SCENES_TEXT.turnLine, ...(story && takesScenesBlock(story) ? [scenesBlock(story)] : [])];
  return passages.reduce((text, passage) => text.split(passage).join(""), prompt);
}

type Loose = Record<string, unknown>;
const threadElement = (schema: z.AnyZodObject) => (schema.shape.threads as z.ZodArray<z.AnyZodObject>).element;

describe("the chapter planner: where the picks split the players, a line and a scene for each thread", () => {
  it("takes them in a group after its first chapter whose picks set more than one outcome", () => {
    expect(takesScenesPlanner(chapterPlanning([1, 1]))).toBe(true); // each their own
    expect(takesScenesPlanner(chapterPlanning([0, 1]))).toBe(true); // one on the friendship, one on their own
    expect(takesScenesPlanner(chapterPlanning([0, 0]))).toBe(false); // both on the friendship: one thread
    expect(takesScenesPlanner(firstSwitchBeat(2))).toBe(false);
  });

  it("adds the line once after the player configurations, and is production's prompt before the adoption byte for byte around it", () => {
    for (const picks of [[0, 1], [1, 1], [0, 0]]) {
      const story = chapterPlanning(picks);
      const [variant, production] = [sharedScenesRequest(story, "thread"), sharedScenesBase(story, "thread")];
      expect(occurrences(variant.prompt, SHARED_SCENES_TEXT.plannerLine)).toBe(takesScenesPlanner(story) ? 1 : 0);
      if (takesScenesPlanner(story)) expect(variant.prompt).toContain(`${SHARED_SCENES_TEXT.plannerAnchor}${SHARED_SCENES_TEXT.plannerLine}`);
      expect(withoutInsertions(variant.prompt)).toBe(production.prompt);
    }
  });

  it("asks each thread for its scene right after its players, production's reply schema before the adoption otherwise", () => {
    const story = chapterPlanning([0, 1]);
    const [variant, production] = [sharedScenesRequest(story, "thread"), sharedScenesBase(story, "thread")];
    const keys = Object.keys(threadElement(variant.schema).shape);
    expect(keys.slice(keys.indexOf("playersSideB"), keys.indexOf("playersSideB") + 2)).toEqual(["playersSideB", "scene"]);
    expect(threadElement(variant.schema).shape.scene.description).toBe(SHARED_SCENES_TEXT.sceneField);
    expect(keys.filter((key) => key !== "scene")).toEqual(Object.keys(threadElement(production.schema).shape));
    expect(json(threadElement(variant.schema).omit({ scene: true }))).toBe(json(threadElement(production.schema)));
    expect(json(variant.schema.omit({ threads: true }))).toBe(json(production.schema.omit({ threads: true })));
    // Where the line doesn't apply, production's schema
    const together = chapterPlanning([0, 0]);
    expect(json(sharedScenesRequest(together, "thread").schema)).toBe(json(threadStep.request(together).schema));
    expect(json(sharedScenesBase(story, "thread").schema)).toBe(json(threadStep.request(together).schema));
  });

  it("keeps each thread's scene in the plan it assembles, production's assembly before the adoption otherwise", () => {
    const story = chapterPlanning([0, 1]);
    const written = { kind: "exploration", outcomeId: "shared_friendship", playersSideA: ["player2"], playersSideB: [], title: "Off the Clock", steps: [], finalStep: { title: "F", question: "Q" }, possibleMilestones: {} };
    const reply = { grouping: "apart", duration: 2, threads: [{ ...written, scene: "The Amber Cup café, with the café owner." }, { ...written, playersSideA: ["player1"], title: "The Room", scene: "  " }] };
    const assembled = sharedScenesRequest(story, "thread").assemble?.(reply) as ThreadAnalysis;
    const production = sharedScenesBase(story, "thread").assemble(reply);
    expect((assembled.threads[0] as unknown as Loose).scene).toBe("The Amber Cup café, with the café owner.");
    expect("scene" in (assembled.threads[1] as unknown as Loose)).toBe(false);
    expect({ ...assembled, threads: assembled.threads.map(({ ...t }) => { delete (t as Loose).scene; return t; }) }).toEqual(production);
  });

  it("says the threads share one moment, a player is only in their own thread even where a pick names them, and each thread names its scene", () => {
    expect(SHARED_SCENES_TEXT.plannerLine).toContain("happen at the same moment, in one world");
    expect(SHARED_SCENES_TEXT.plannerLine).toContain("Every player is in exactly one thread and only in its scenes");
    expect(SHARED_SCENES_TEXT.plannerLine).toContain('"Meet Rory at the café"');
    expect(SHARED_SCENES_TEXT.plannerLine).toContain("this one plays without them");
    expect(SHARED_SCENES_TEXT.plannerLine).toContain("a key object");
    expect(SHARED_SCENES_TEXT.sceneField).toContain("Never a player of another thread");
  });
});

describe("the group turn: where everyone is, and a consistency line", () => {
  it("takes them on a group chapter step whose chapter has more than one thread", () => {
    expect(takesScenesBlock(chapterStep([["shared_friendship", ["player1"]], ["player2_own", ["player2"]]]))).toBe(true);
    expect(takesScenesBlock(chapterStep([["shared_friendship", ["player1", "player2"]]]))).toBe(false);
    expect(takesScenesBlock(threadBeat(2))).toBe(false);
    expect(takesScenesBlock(laterSwitchBeat(2))).toBe(false);
  });

  it("names each thread, its players and its scene where the plan holds one, and keeps everyone to their own thread", () => {
    const story = chapterStep([["shared_friendship", ["player2"], "The Amber Cup café, with the café owner."], ["player1_own", ["player1"]]]);
    const block = scenesBlock(story);
    expect(block.startsWith(SHARED_SCENES_TEXT.blockHead)).toBe(true);
    expect(block).toContain('- "Thread 1": Tamsin Okafor. Scene: The Amber Cup café, with the café owner.\n');
    expect(block).toContain('- "Thread 2": Rory Finch\n');
    expect(block.endsWith(SHARED_SCENES_TEXT.blockRule)).toBe(true);
    expect(SHARED_SCENES_TEXT.blockRule).toContain("never shown there, even where a choice or a step names them");
    const three = scenesBlock(chapterStep([["shared_friendship", ["player1", "player3"]], ["player2_own", ["player2"]]], 3));
    expect(three).toContain('- "Thread 1": Rory Finch and Oren Pike\n');
  });

  it("adds the block once before the thread configuration and the line once in the consistency section, production's turn before the adoption byte for byte around them", () => {
    const story = chapterStep([["shared_friendship", ["player1"], "A café."], ["player2_own", ["player2"]]]);
    const [variant, production] = [sharedScenesRequest(story, "beat"), sharedScenesBase(story, "beat")];
    expect(occurrences(variant.prompt, scenesBlock(story))).toBe(1);
    expect(variant.prompt).toContain(`${scenesBlock(story)}${SHARED_SCENES_TEXT.configurationAnchor}`);
    expect(occurrences(variant.prompt, SHARED_SCENES_TEXT.turnLine)).toBe(1);
    expect(variant.prompt).toContain(`${SHARED_SCENES_TEXT.turnAnchor}${SHARED_SCENES_TEXT.turnLine}`);
    expect(withoutInsertions(variant.prompt, story)).toBe(production.prompt);
    expect(json(variant.schema)).toBe(json(production.schema));
  });
});

describe("production's request byte for byte everywhere else", () => {
  it.each([
    ["a single player's chapter planner", () => threadBeat(1), "thread"],
    ["a group's opening switch planner", () => firstSwitchBeat(2), "switch"],
    ["a group's chapter planner, every player on one outcome", () => chapterPlanning([0, 0]), "thread"],
    ["a group's one-thread chapter step", () => threadBeat(2), "beat"],
    ["a group's switch turn", () => laterSwitchBeat(2), "beat"],
    ["a single player's step", () => threadBeat(1), "beat"],
  ] as const)("%s", (_, build, role) => {
    const story = build();
    const production = role === "switch" ? switchStep.request(story) : role === "thread" ? threadStep.request(story) : beatStep.request(story);
    const variant = sharedScenesRequest(story, role);
    expect(variant.prompt).toBe(production.prompt);
    expect(json(variant.schema)).toBe(json(production.schema));
  });

  (frozen.length ? it : it.skip)("every frozen case of each role: production's request before the adoption around the insertions, which only their situations carry", () => {
    let carried = 0;
    for (const c of frozen.filter((f) => (f.role === "beat" || f.role === "switch" || f.role === "thread") && f.state)) {
      const role = c.role as "beat" | "switch" | "thread";
      const story = caseStory(c, role === "beat");
      const production = role === "switch" ? switchStep.request(story).prompt : role === "thread" ? sharedScenesBase(story, "thread").prompt : sharedScenesBase(story, "beat").prompt;
      const variant = sharedScenesRequest(story, role).prompt;
      const takes = role === "thread" ? takesScenesPlanner(story) : role === "beat" ? takesScenesBlock(story) : false;
      expect([c.id, withoutInsertions(variant, story) === production, variant === production]).toEqual([c.id, true, !takes]);
      if (takes) carried++;
    }
    expect(carried).toBeGreaterThan(0);
  });
});

describe("the fix-and-retest (sharedScenesB): one person or group in one thread's scene, no stand-in for a contest's absent side", () => {
  it("adds one bullet to the planner line, before the scene bullet, and is the variant byte for byte otherwise", () => {
    expect(SHARED_SCENES_TEXT.plannerLineB).toBe(SHARED_SCENES_TEXT.plannerLine.replace(SHARED_SCENES_TEXT.sceneBullet, `${SHARED_SCENES_TEXT.oneSceneBullet}${SHARED_SCENES_TEXT.sceneBullet}`));
    expect(SHARED_SCENES_TEXT.oneSceneBullet).toContain("the same person (a captain, a buyer, a judge)");
    expect(SHARED_SCENES_TEXT.oneSceneBullet).toContain("only one thread's scene has them");
    expect(SHARED_SCENES_TEXT.oneSceneBullet).toContain("no rival's crew, station or vehicle");
    for (const picks of [[0, 1], [1, 1], [0, 0]]) {
      const story = chapterPlanning(picks);
      const [b, a] = [sharedScenesRequest(story, "thread", { b: true }), sharedScenesRequest(story, "thread")];
      expect(b.prompt).toBe(a.prompt.split(SHARED_SCENES_TEXT.plannerLine).join(SHARED_SCENES_TEXT.plannerLineB));
      expect(json(b.schema)).toBe(json(a.schema));
    }
    const step = chapterStep([["shared_friendship", ["player1"]], ["player2_own", ["player2"]]]);
    expect(sharedScenesRequest(step, "beat", { b: true }).prompt).toBe(sharedScenesRequest(step, "beat").prompt);
    const plan = requestFor("sharedScenesB", { role: "thread", story: chapterPlanning([0, 1]) });
    expect(requestText(plan)).toBe(sharedScenesRequest(chapterPlanning([0, 1]), "thread", { b: true }).prompt);
  });
});

describe("the adoption: production is sharedScenesB byte for byte where its chains measured it (the planner, the chapter's opening)", () => {
  const stories: [string, () => Story, "beat" | "thread"][] = [
    ["a group's chapter planner, one on the friendship, one on their own", () => chapterPlanning([0, 1]), "thread"],
    ["a group's chapter planner, each their own", () => chapterPlanning([1, 1]), "thread"],
    ["a three-player chapter planner", () => chapterPlanning([0, 1, 1], 3), "thread"],
    ["a group's chapter planner, every player on one outcome", () => chapterPlanning([0, 0]), "thread"],
    ["a group chapter's opening with two threads and a scene", () => chapterStep([["shared_friendship", ["player1"], "A café."], ["player2_own", ["player2"]]], 2, 0), "beat"],
    ["a three-player chapter's opening", () => chapterStep([["shared_friendship", ["player1", "player3"]], ["player2_own", ["player2"]]], 3, 0), "beat"],
    ["a group's one-thread chapter step", () => threadBeat(2), "beat"],
    ["a single player's chapter planner", () => threadBeat(1), "thread"],
  ];

  it.each(stories)("%s: prompt and JSON schema", (_, build, role) => {
    const story = build();
    const production = role === "thread" ? threadStep.request(story) : beatStep.request(story);
    const variant = sharedScenesRequest(story, role, { b: true });
    expect(variant.prompt).toBe(production.prompt);
    expect(json(variant.schema)).toBe(json(production.schema));
  });

  it.each([
    ["a group's later chapter step with two threads and a scene", () => chapterStep([["shared_friendship", ["player1"], "A café."], ["player2_own", ["player2"]]])],
    ["a three-player chapter's last step", () => chapterStep([["shared_friendship", ["player1", "player3"]], ["player2_own", ["player2"]]], 3, 2)],
  ] as const)("%s: production's turn as before, where the variant's turn alone did not pass (no split moved, more openings told again)", (_, build) => {
    const story = build();
    const production = beatStep.request(story);
    expect(production.prompt).toBe(sharedScenesBase(story, "beat").prompt);
    expect(json(production.schema)).toBe(json(sharedScenesBase(story, "beat").schema));
    expect(production.prompt).not.toBe(sharedScenesRequest(story, "beat", { b: true }).prompt);
  });

  it("keeps each written scene in the plan production assembles, as the variant did", () => {
    const story = chapterPlanning([0, 1]);
    const written = { kind: "exploration", outcomeId: "shared_friendship", playersSideA: ["player2"], playersSideB: [], title: "Off the Clock", steps: [], finalStep: { title: "F", question: "Q" }, possibleMilestones: {} };
    const reply = { grouping: "apart", duration: 2, threads: [{ ...written, scene: "The Amber Cup café, with the café owner." }, { ...written, playersSideA: ["player1"], title: "The Room", scene: "  " }] };
    expect(threadStep.request(story).assemble(reply)).toEqual(sharedScenesRequest(story, "thread", { b: true }).assemble?.(reply));
  });

  (frozen.length ? it : it.skip)("every frozen case of the chapter planner and the turn: sharedScenesB, but production's turn as before on a later chapter step", () => {
    const carried = { planner: 0, opening: 0, later: 0 };
    for (const c of frozen.filter((f) => (f.role === "beat" || f.role === "thread") && f.state)) {
      const role = c.role as "beat" | "thread";
      const story = caseStory(c, role === "beat");
      const production = role === "thread" ? threadStep.request(story) : beatStep.request(story);
      const later = role === "beat" && takesScenesBlock(story) && !productionTakesScenesBlock(story);
      const measured = later ? sharedScenesBase(story, "beat") : sharedScenesRequest(story, role, { b: true });
      expect([c.id, measured.prompt === production.prompt, json(measured.schema) === json(production.schema)]).toEqual([c.id, true, true]);
      if (role === "thread" && takesScenesPlanner(story)) carried.planner++;
      if (role === "beat" && productionTakesScenesBlock(story)) carried.opening++;
      if (later) carried.later++;
    }
    expect([carried.planner > 0, carried.opening > 0, carried.later > 0]).toEqual([true, true, true]);
  });
});

describe("the eval variant", () => {
  it("sends the chapter planner with production's limits, and the turn with production's turn limits and retry count", () => {
    const planning = chapterPlanning([0, 1]);
    const plan = requestFor("sharedScenes", { role: "thread", story: planning });
    expect(requestText(plan)).toBe(sharedScenesRequest(planning, "thread").prompt);
    expect(callLimitsOf(plan)).toEqual(productionCallLimits("threadAnalysis", 2));
    const step = chapterStep([["shared_friendship", ["player1"]], ["player2_own", ["player2"]]]);
    const turn = requestFor("sharedScenes", { role: "beat", story: step });
    expect(requestText(turn)).toBe(sharedScenesRequest(step, "beat").prompt);
    expect(callLimitsOf(turn)).toEqual(beatCallLimits(step));
    expect(shortTextCountOf(turn)).toBe(beatCheckOptions(step).textCount);
  });
});
