import { Story } from "core/models/Story.js";
import type { Beat, GameMode, Outcome, StoryPhase, SwitchAnalysis, ThreadAnalysis } from "core/types/index.js";
import { GameModes } from "core/types/index.js";
import { createMockMultiplayerStory } from "./testHelpers.js";
import { beatGeneration, outcome, thread } from "./textFixtures.js";

/*
 * A group story at the chapter planner, its contested shared outcome (the
 * sale) at a chosen milestone count: the contest-settled variant's and
 * report's tests (decision A's seal fix, 2026-10-01).
 */

export const SALE: Outcome = outcome("shared_sale", {
  question: "Who sells the house?",
  possibleResolutions: { sideAWins: "Rory sells it and earns the commission.", sideBWins: "Nia sells it and earns the commission.", mixed: "The owner splits the sale between them." },
  intendedNumberOfMilestones: 3,
});

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

function flavorSwitch(slots: string[], outcomeId: string): SwitchAnalysis["switches"][number] {
  return { ...topicSwitch(slots[0], []), players: slots, type: "flavor", outcomeId, question: "How do they make their last case?", topicChoices: [], topicDirections: [] } as SwitchAnalysis["switches"][number];
}

function switchPhase(switches: SwitchAnalysis["switches"], firstBeatIndex: number): SwitchAnalysis {
  return { coordinationPatternAnalysis: "", coordinationPatternSummary: "", switches, firstBeatIndex, duration: 1 } as SwitchAnalysis;
}

function resolvedChapter(outcomeId: string, players: string[]): ThreadAnalysis {
  const t = thread("challenge", 2, 1, players);
  return {
    relevantSwitchAndThreadInstructions: "",
    coordinationPatternSummary: "",
    duration: 2,
    firstBeatIndex: 1,
    threads: [{ ...t, id: "done", outcomeId, progression: t.progression.map((step) => ({ ...step, resolution: "favorable" as const })), resolution: "favorable" as const, milestone: "Done" }],
  };
}

export type ContestSetup = { players?: number; mode?: GameMode; saleMilestones?: number; flavor?: boolean };

const slotsOf = (players: number) => Array.from({ length: players }, (_, i) => `player${i + 1}`);

/**
 * The chapter planner after a later switch: each player chose the direction at `picks[i]` of [sale, own] (or, with
 * `flavor`, the grouped flavor switch on the sale); the sale holds `saleMilestones` (2 by default) of its 3.
 */
export function contestPlanning(picks: number[], setup: ContestSetup = {}): Story {
  const players = setup.players ?? 2;
  const slots = slotsOf(players);
  const base = createMockMultiplayerStory(players).getState();
  const withPlayers = Object.fromEntries(
    Object.entries(base.players).map(([slot, player], i) => [
      slot,
      {
        ...player,
        name: ["Rory Vale", "Nia Hart", "Pip Moss"][i],
        outcomes: [outcome(`${slot}_own`)],
        beatHistory: Array.from({ length: 4 }, (_, k) => lastBeat(k === 3 ? (picks[i] ?? 0) : 0)),
      },
    ])
  );
  const sale = { ...SALE, milestones: Array.from({ length: setup.saleMilestones ?? 2 }, (_, k) => `Sale milestone ${k + 1}`) };
  const switches = setup.flavor ? [flavorSwitch(slots, "shared_sale")] : slots.map((slot) => topicSwitch(slot, ["shared_sale", `${slot}_own`]));
  const phases: StoryPhase[] = [switchPhase([{ ...topicSwitch("player1", ["shared_sale"]), players: slots }], 0), resolvedChapter("shared_sale", slots), switchPhase(switches, 3)];
  return Story.create({ ...base, gameMode: setup.mode ?? GameModes.Competitive, sharedOutcomes: [sale], players: withPlayers, storyPhases: phases, maxTurns: 25 });
}
