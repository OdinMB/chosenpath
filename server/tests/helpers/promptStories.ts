// Stories at the points of play that the beat, switch and thread prompts branch on
import { Story } from "core/models/Story.js";
import type { Beat, StoryPhase, StoryState, ThreadAnalysis } from "core/types/index.js";
import { createMockMultiplayerStory, createMockStory } from "./testHelpers.js";
import { beatGeneration, switchAnalysis, threadAnalysis } from "./textFixtures.js";

type Overrides = Partial<StoryState>;

export function slotsOf(players: number): string[] {
  return Array.from({ length: players }, (_, i) => `player${i + 1}`);
}

/** A past beat whose text names its slot and history index, e.g. "player1 history text 2". */
export function historyText(slot: string, index: number): string {
  return `${slot} history text ${index}`;
}

function history(slot: string, length: number): Beat[] {
  return Array.from({ length }, (_, i) => ({
    ...beatGeneration({ text: historyText(slot, i), summary: `${slot} summary ${i}` }),
    choice: 0,
    resolution: "favorable" as const,
  }));
}

function storyAt(players: number, turns: number, phases: StoryPhase[], overrides: Overrides): Story {
  const base = (players > 1 ? createMockMultiplayerStory(players) : createMockStory()).getState();
  const withHistory = Object.fromEntries(
    Object.entries(base.players).map(([slot, player]) => [slot, { ...player, beatHistory: history(slot, turns) }])
  );
  return Story.create({ ...base, players: withHistory, storyPhases: phases, ...overrides });
}

/** A challenge thread with every step resolved favorably. */
export function resolvedThread(
  duration: number,
  firstBeatIndex: number,
  players: number,
  title = "A Thread"
): ThreadAnalysis {
  const analysis = threadAnalysis("challenge", duration, firstBeatIndex, slotsOf(players));
  return {
    ...analysis,
    threads: analysis.threads.map((thread) => ({
      ...thread,
      title,
      progression: thread.progression.map((step) => ({ ...step, resolution: "favorable" as const })),
      resolution: "favorable" as const,
      milestone: `${title} milestone`,
    })),
  };
}

/** The opening switch beat (turn 0). */
export function firstSwitchBeat(players = 1, overrides: Overrides = {}): Story {
  return storyAt(players, 0, [switchAnalysis(slotsOf(players), 0)], overrides);
}

/** Step 2 of a 3-beat challenge thread that started at history index 2 (step 1 resolved). */
export function threadBeat(players = 1, overrides: Overrides = {}): Story {
  const thread = threadAnalysis("challenge", 3, 2, slotsOf(players));
  thread.threads[0].progression[0].resolution = "favorable";
  return storyAt(players, 3, [switchAnalysis(slotsOf(players), 1), thread], overrides);
}

/** The switch analysis right after a thread resolved (turn 3). */
export function switchAnalysisAfterThread(players = 1, overrides: Overrides = {}): Story {
  return storyAt(players, 3, [switchAnalysis(slotsOf(players), 0), resolvedThread(2, 1, players)], overrides);
}

/** The switch beat that narrates a resolved thread (turn 3). */
export function laterSwitchBeat(players = 1, overrides: Overrides = {}): Story {
  const phases = [switchAnalysis(slotsOf(players), 0), resolvedThread(2, 1, players), switchAnalysis(slotsOf(players), 3)];
  return storyAt(players, 3, phases, overrides);
}

/** The thread analysis after the players chose in a later switch beat (turn 4). */
export function threadAnalysisAfterSwitch(players = 1, overrides: Overrides = {}): Story {
  const phases = [switchAnalysis(slotsOf(players), 0), resolvedThread(2, 1, players), switchAnalysis(slotsOf(players), 3)];
  return storyAt(players, 4, phases, overrides);
}

/** The ending at max turns: an older resolved thread, a switch, then the final resolved thread. */
export function endingBeat(players = 1, overrides: Overrides = {}): Story {
  const phases = [
    switchAnalysis(slotsOf(players), 0),
    resolvedThread(2, 1, players, "Older Thread"),
    switchAnalysis(slotsOf(players), 3),
    resolvedThread(2, 4, players, "Final Thread"),
  ];
  return storyAt(players, 6, phases, { maxTurns: 6, ...overrides });
}
