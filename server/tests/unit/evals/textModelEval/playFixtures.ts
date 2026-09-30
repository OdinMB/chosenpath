import { z } from "zod";
import { GameModes, type BeatOption, type PlayerCount } from "core/types/index.js";
import type { PlayCall, PlayCallSpec } from "../../../../src/evals/textModelEval/playthroughs.js";
import { requestText, type SetupInput } from "../../../../src/evals/textModelEval/variants.js";
import { beatSet, explorationOptions, outcome, stat, switchAnalysis, threadAnalysis } from "../../../helpers/textFixtures.js";

/*
 * A fake story for the playthrough tests: a setup reply as the game saves it,
 * flavor switches on the first player's main outcome (or the shared one),
 * chapters as long as PACING allows, and turns that offer a lever set on
 * chapter steps and exploration choices on switches, writing the ended
 * chapter's milestone where the turn may add one.
 */

export const slots = (players: number) => Array.from({ length: players }, (_, i) => `player${i + 1}`);

/** A setup reply as the game saves it (the generation order assembled). */
export function setupReply(players: number) {
  const seat = (slot: string) => ({
    outcomes: [outcome(`${slot}_main`, { intendedNumberOfMilestones: 2 }), outcome(`${slot}_side`, { intendedNumberOfMilestones: 1 })],
    possibleCharacterIdentities: ["Ada", "Bram", "Cato"].map((name) => ({
      name: `${name} ${slot}`,
      pronouns: { personal: "they", object: "them", possessive: "their", reflexive: "themselves" },
      appearance: "tall",
    })),
    possibleCharacterBackgrounds: [1, 2, 3].map((i) => ({ title: `B${i}`, fluffTemplate: "{name} sails.", initialPlayerStatValues: [{ statId: "player_courage", value: 40 + i }] })),
  });
  return {
    guidelines: {
      world: "A harbour.",
      rules: ["The tide rules."],
      tone: ["Salty."],
      conflicts: ["Stay or sail."],
      decisions: ["Who to trust."],
      typesOfThreads: ["Harbour chase (challenge, 2): outrun the tide"],
      switchAndThreadInstructions: ["The first thread is about the missing ferry."],
    },
    difficultyLevel: { modifier: 0, title: "Balanced" },
    storyElements: [{ id: "ferry", name: "The Ferry", role: "A prize.", instructions: "Slow.", appearance: "Old.", facts: ["Leaks.", "Owed money.", "Blue."] }],
    sharedOutcomes: players > 1 ? [outcome("shared_harbour", { intendedNumberOfMilestones: 3 })] : [],
    statGroups: ["Crew"],
    sharedStats: [stat("shared_supplies", { name: "Supplies", initialValue: 60 })],
    playerStats: [stat("player_courage", { name: "Courage", partOfPlayerBackgrounds: true, optionsToSacrifice: "Spend 10 Courage for a bold move" })],
    characterSelectionPlan: { multiplayerCoordination: [], playerStatConversionRates: [], backgroundArchetypes: [] },
    ...Object.fromEntries(slots(players).map((slot) => [slot, seat(slot)])),
    title: "The Harbour",
    characterSelectionIntroduction: { title: "Who sails?", text: "Pick." },
    imageInstructions: { visualStyle: "", atmosphere: "", colorPalette: "", settingDetails: "", characterStyle: "", artInfluences: "", coverPrompt: "" },
  };
}

export const input = (players: PlayerCount, maxTurns = 10): SetupInput => ({
  premise: "Sailors in a harbour town.",
  playerCount: players,
  gameMode: players > 1 ? GameModes.Cooperative : GameModes.SinglePlayer,
  maxTurns,
});

/** A chapter step's options: a stat-backed one, a risky one and a sacrifice. */
export function leverSet(): BeatOption[] {
  return [
    { optionType: "challenge", resourceType: "normal", riskType: "normal", text: "Brace the mast", basePoints: 0, modifiersToSuccessRate: [{ statId: "player_courage", reason: "brave", effect: 10 }] },
    { optionType: "challenge", resourceType: "normal", riskType: "risky", text: "Leap the gap", basePoints: -10, modifiersToSuccessRate: [] },
    { optionType: "challenge", resourceType: "sacrifice", riskType: "normal", text: "Spend 10 Courage to charge", basePoints: 30, modifiersToSuccessRate: [] },
  ];
}

const shapeOf = (spec: PlayCallSpec) => (spec.request.schema as z.AnyZodObject).shape as Record<string, z.ZodTypeAny>;
/** Whether the turn may add milestones: its schema asks for a list, not the empty literal. */
const addsMilestones = (spec: PlayCallSpec) => !(shapeOf(spec).newMilestones instanceof z.ZodLiteral);
const promptOf = (spec: PlayCallSpec) => requestText(spec.request);

/** The chapter length the PACING block allows: the last thread's exact length, else the longest allowed. */
function pacedLength(prompt: string): number {
  const exact = /This is the story's last thread: exactly (\d+) beats/.exec(prompt);
  if (exact) return Number(exact[1]);
  const allowed = /Allowed lengths for this thread: ([^.]+) beats/.exec(prompt);
  const lengths = (allowed?.[1].match(/\d+/g) ?? ["3"]).map(Number);
  return Math.max(...lengths);
}

/** An override's answer for "the fake's own reply" */
export const DEFAULT = Symbol("default");

export type Overrides = {
  /** A reply by role and how many calls of that role came before (0 for the first); undefined: nothing usable came back */
  reply?: (role: PlayCallSpec["role"], nth: number, spec: PlayCallSpec) => unknown;
  /** Chapter plans of this length whatever PACING allows */
  length?: number;
  /** The stat changes every turn writes */
  statChanges?: unknown[];
  /** The options a chapter step offers */
  chapterOptions?: (nth: number) => BeatOption[];
  /** Each call's wait */
  latencyMs?: number;
};

/** Replies by role in the stored shape: flavor switches on the first player's main outcome, chapters as PACING allows, turns with a lever set. */
export function fakeCall(players: number, overrides: Overrides = {}): { call: PlayCall; calls: PlayCallSpec[] } {
  const calls: PlayCallSpec[] = [];
  const seen: Record<string, number> = {};
  let phase: "switch" | "thread" = "switch";
  const outcomeId = players > 1 ? "shared_harbour" : "player1_main";
  const group = players > 1 ? "shared" : "player1";
  const latencyMs = overrides.latencyMs ?? 1_000;
  const call: PlayCall = async (spec) => {
    calls.push(spec);
    const nth = seen[spec.role] ?? 0;
    seen[spec.role] = nth + 1;
    if (spec.role === "switch") phase = "switch";
    if (spec.role === "thread") phase = "thread";
    const override = overrides.reply ? overrides.reply(spec.role, nth, spec) : DEFAULT;
    if (override === undefined) return undefined;
    const done = (parsed: unknown) => ({ parsed, outputFile: `outputs/${spec.caseId}.json`, latencyMs, costUsd: 0.001, sends: [{ outcome: "valid", latencyMs, costUsd: 0.001, outputTokens: 100, reasoningTokens: 50 }] });
    if (override !== DEFAULT) return done(override);
    if (spec.role === "setup") return done(setupReply(players));
    if (spec.role === "switch") {
      const base = switchAnalysis(slots(players));
      return done({ ...base, switches: [{ ...base.switches[0], type: "flavor", outcomeId, question: "Will the harbour hold?", topicChoices: [] }] });
    }
    if (spec.role === "thread") {
      const length = overrides.length ?? pacedLength(promptOf(spec));
      const plan = threadAnalysis("challenge", length, 0, slots(players));
      return done({ ...plan, threads: [{ ...plan.threads[0], outcomeId, title: "The Ferry Chase", typeOfMilestone: "who holds the ferry" }] });
    }
    const options = phase === "switch" ? explorationOptions() : (overrides.chapterOptions?.(nth) ?? leverSet());
    const beats = Object.fromEntries(slots(players).map((slot) => [slot, { ...beatSet(1).player1, options, plan: { ...beatSet(1).player1.plan, forPlayer: slot } }]));
    const milestones = addsMilestones(spec) ? [{ type: "newMilestone", outcomeGroup: group, outcome: outcomeId, newMilestone: "The ferry is ours." }] : "";
    return done(beatSet(players, { ...beats, newMilestones: milestones, ...(overrides.statChanges ? { statChanges: overrides.statChanges } : {}) } as never));
  };
  return { call, calls };
}
