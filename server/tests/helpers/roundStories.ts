// Stories for the turn rounds' eval-only variants: outcomes with milestones, chapters behind, a switch the player chose from
import { Story } from "core/models/Story.js";
import type { Beat, GameMode, Outcome, StoryPhase, SwitchAnalysis, ThreadAnalysis } from "core/types/index.js";
import { GameModes } from "core/types/index.js";
import { createMockMultiplayerStory, createMockStory } from "./testHelpers.js";
import { beatGeneration, outcome, switchAnalysis, threadAnalysis } from "./textFixtures.js";

export { outcome };

export type RoundStoryOptions = {
  players?: number;
  /** Beats written so far (the story's current turn) */
  turns: number;
  maxTurns: number;
  /** Each player's own outcomes, by slot */
  playerOutcomes?: Record<string, Outcome[]>;
  sharedOutcomes?: Outcome[];
  phases?: StoryPhase[];
  /** The option each player chose on their last beat */
  lastChoice?: number;
  gameMode?: GameMode;
  switchAndThreadInstructions?: string[];
  typesOfThreads?: string[];
};

function history(slot: string, turns: number, lastChoice: number): Beat[] {
  return Array.from({ length: turns }, (_, i) => ({
    ...beatGeneration({ text: `${slot} beat ${i}`, summary: `${slot} summary ${i}`, title: `Beat ${i}` }),
    options: [0, 1, 2].map((n) => ({ optionType: "exploration" as const, resourceType: "normal" as const, text: `${slot} option ${i}.${n}` })),
    choice: i === turns - 1 ? lastChoice : 0,
    resolution: i === turns - 1 ? null : ("favorable" as const),
  }));
}

export function roundStory(options: RoundStoryOptions): Story {
  const players = options.players ?? 1;
  const base = (players > 1 ? createMockMultiplayerStory(players) : createMockStory()).getState();
  const withPlayers = Object.fromEntries(
    Object.entries(base.players).map(([slot, player]) => [
      slot,
      { ...player, outcomes: options.playerOutcomes?.[slot] ?? [], beatHistory: history(slot, options.turns, options.lastChoice ?? 0) },
    ])
  );
  return Story.create({
    ...base,
    gameMode: options.gameMode ?? (players > 1 ? GameModes.Cooperative : GameModes.SinglePlayer),
    guidelines: {
      ...base.guidelines,
      typesOfThreads: options.typesOfThreads ?? base.guidelines.typesOfThreads,
      switchAndThreadInstructions: options.switchAndThreadInstructions ?? [],
    },
    players: withPlayers,
    sharedOutcomes: options.sharedOutcomes ?? [],
    storyPhases: options.phases ?? [],
    maxTurns: options.maxTurns,
  });
}

/** A resolved chapter on one outcome, `duration` beats from `firstBeatIndex`, with its planned milestone. */
export function endedChapter(outcomeId: string, duration: number, firstBeatIndex: number, milestone: string, players = ["player1"]): ThreadAnalysis {
  const analysis = threadAnalysis("challenge", duration, firstBeatIndex, players);
  return {
    ...analysis,
    threads: analysis.threads.map((thread) => ({
      ...thread,
      outcomeId,
      title: `Chapter on ${outcomeId}`,
      id: `chapter_${outcomeId}`,
      progression: thread.progression.map((step) => ({ ...step, resolution: "favorable" as const })),
      resolution: "favorable" as const,
      milestone,
    })),
  };
}

/** A topic switch whose directions name one outcome each, in brackets, as today's planner writes them. */
export function topicSwitch(directions: [string, string][], firstBeatIndex: number, players = ["player1"]): SwitchAnalysis {
  const plan = switchAnalysis(players, firstBeatIndex);
  return {
    ...plan,
    switches: plan.switches.map((sw) => ({ ...sw, topicChoices: directions.map(([text, id]) => `${text} (${id})`) })),
  };
}

/** A flavor switch on one outcome, with its question. */
export function flavorSwitch(outcomeId: string, question: string, firstBeatIndex: number, players = ["player1"]): SwitchAnalysis {
  const plan = switchAnalysis(players, firstBeatIndex);
  return { ...plan, switches: plan.switches.map((sw) => ({ ...sw, type: "flavor" as const, outcomeId, question, topicChoices: [] })) };
}
