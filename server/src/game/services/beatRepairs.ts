import type { Story } from "core/models/Story.js";
import type {
  BeatGeneration,
  BeatOption,
  BeatPlan,
  Change,
  SetOfBeatGenerationSchema,
  Stat,
  Thread,
} from "core/types/index.js";
import { getThreadType } from "core/types/thread.js";
import { POINTS_FOR_REWARD, POINTS_FOR_SACRIFICE } from "core/config.js";
import { canAddMilestones, isPlayerBeat } from "./storyTextSteps.js";
import type { Repair } from "./textRepairs.js";

/*
 * A pure pass over a beat reply before the game keeps it: what the reply
 * wrote in a form the game would drop (a stat in seat form, a fact filed
 * under a stat, a milestone in the wrong group, an option of the wrong type)
 * is put where the game reads it, and what cannot be placed is dropped. Every
 * change is recorded as a Repair; ChangeService keeps applying exact ids.
 */

type StatChange = Extract<Change, { type: "statChange" }>;
type NewMilestone = Extract<Change, { type: "newMilestone" }>;
type NewFact = BeatPlan["establishedFacts"][number];
type Introduction = BeatPlan["newIntroductionsOfStoryElements"][number];

export type BeatRepairResult = {
  reply: SetOfBeatGenerationSchema;
  repairs: Repair[];
};

/** The story's ids that a reply may reference, and the elements the reply itself creates. */
type Known = {
  sharedStats: Map<string, Stat>;
  playerStats: Map<string, Stat>;
  elements: Set<string>;
  newElements: Set<string>;
  slots: string[];
};

export function repairBeatReply(
  story: Story,
  reply: SetOfBeatGenerationSchema
): BeatRepairResult {
  const repairs: Repair[] = [];
  const beatKeys = Object.keys(reply).filter(isPlayerBeat) as `player${number}`[];
  const state = story.getState();
  const known: Known = {
    sharedStats: new Map(state.sharedStats.map((stat) => [stat.id, stat])),
    playerStats: new Map(state.playerStats.map((stat) => [stat.id, stat])),
    elements: new Set(state.storyElements.map((element) => element.id)),
    newElements: new Set(
      beatKeys.flatMap((key) =>
        (reply[key].plan?.newGameElements ?? []).map((created) => created.element.id)
      )
    ),
    slots: story.getPlayerSlots(),
  };

  const repaired: SetOfBeatGenerationSchema = { ...reply };
  if (Array.isArray(reply.statChanges)) {
    repaired.statChanges = repairStatChanges(reply.statChanges, known, repairs);
  }
  if (Array.isArray(reply.newMilestones)) {
    repaired.newMilestones = repairMilestones(story, reply.newMilestones, repairs);
  }
  for (const key of beatKeys) {
    repaired[key] = repairBeat(story, key.toLowerCase(), reply[key], known, repairs);
  }
  return { reply: repaired, repairs };
}

/** Which option type the story's current phase calls for, if it constrains one. */
export function expectedOptionType(
  story: Story,
  slot: string
): BeatOption["optionType"] | undefined {
  const beatType = story.getCurrentBeatType();
  if (beatType === "switch") return "exploration";
  if (beatType !== "thread") return undefined;
  const thread = story
    .getCurrentThreadAnalysis()
    ?.threads.find((t) => t.playersSideA.includes(slot) || t.playersSideB.includes(slot));
  if (!thread) return undefined;
  return getThreadType(thread) === "exploration" ? "exploration" : "challenge";
}

// --- Stat changes ---

/**
 * A player stat id the reply wrote in seat form ("player1_energy"), doubled
 * ("player_player_energy") or seat plus plain ("player1_player_energy"): the
 * plain id and the seat it names, if any.
 */
function playerStatFromSeatForm(
  id: string,
  playerStats: Map<string, Stat>
): { stat: string; seat?: string } | undefined {
  const match = /^player(\d*)_(.+)$/.exec(id);
  if (!match) return undefined;
  const [, seatNumber, rest] = match;
  const stat = [`player_${rest}`, rest].find(
    (candidate) => candidate !== id && playerStats.has(candidate)
  );
  if (!stat) return undefined;
  return { stat, seat: seatNumber ? `player${seatNumber}` : undefined };
}

type StatTarget =
  | { group: string; stat: string; kinds: string[] }
  | { dropped: "statChangeAmbiguous" | "statChangeUnknown" };

function statTarget(change: StatChange, known: Known): StatTarget {
  const { group, stat } = change;
  const { sharedStats, playerStats, slots } = known;

  // A shared stat: kept under shared, moved there from a player's group
  if (sharedStats.has(stat) && (group === "shared" || !playerStats.has(stat))) {
    return group === "shared"
      ? { group, stat, kinds: [] }
      : { group: "shared", stat, kinds: ["statGroupMoved"] };
  }

  let playerStat: string | undefined;
  let seat: string | undefined;
  const kinds: string[] = [];
  if (playerStats.has(stat)) {
    playerStat = stat;
  } else {
    const seatForm = playerStatFromSeatForm(stat, playerStats);
    if (seatForm) {
      playerStat = seatForm.stat;
      seat = seatForm.seat;
      kinds.push("statIdSeatForm");
    }
  }
  if (!playerStat) return { dropped: "statChangeUnknown" };

  // Single player: every player-stat change is the one player's
  if (slots.length === 1) {
    const only = slots[0];
    return { group: only, stat: playerStat, kinds: group === only ? kinds : [...kinds, "statGroupMoved"] };
  }
  if (seat !== undefined) {
    if (!slots.includes(seat)) return { dropped: "statChangeUnknown" };
    if (group === seat) return { group, stat: playerStat, kinds };
    if (group === "shared") return { group: seat, stat: playerStat, kinds: [...kinds, "statGroupMoved"] };
    return { dropped: "statChangeAmbiguous" };
  }
  if (group === "shared") return { dropped: "statChangeAmbiguous" };
  if (!slots.includes(group)) return { dropped: "statChangeUnknown" };
  return { group, stat: playerStat, kinds };
}

/** A string value its stat's possible values don't mention (case-insensitive), when it lists any. */
function isOffLadder(change: StatChange, definition: Stat | undefined): boolean {
  if (change.change !== "setString" || definition?.type !== "string") return false;
  const ladder = (definition.possibleValues ?? "").trim().toLowerCase();
  return ladder.length > 0 && !ladder.includes(String(change.value).toLowerCase());
}

function repairStatChanges(changes: Change[], known: Known, repairs: Repair[]): Change[] {
  const kept: Change[] = [];
  for (const change of changes) {
    if (change.type !== "statChange") {
      kept.push(change);
      continue;
    }
    const written = `${change.group}/${change.stat}`;
    const target = statTarget(change, known);
    if ("dropped" in target) {
      repairs.push({ kind: target.dropped, detail: written });
      continue;
    }
    for (const kind of target.kinds) {
      repairs.push({ kind, detail: `${written} -> ${target.group}/${target.stat}` });
    }
    const repaired: StatChange = { ...change, group: target.group, stat: target.stat };
    const definition =
      target.group === "shared" ? known.sharedStats.get(target.stat) : known.playerStats.get(target.stat);
    if (isOffLadder(repaired, definition)) {
      repairs.push({ kind: "offLadderValue", note: true, detail: `${target.stat}: ${String(repaired.value)}` });
    }
    kept.push(repaired);
  }
  return kept;
}

// --- Milestones ---

/** The groups whose outcome lists hold this id: shared first, as Story.getOutcomeById looks it up. */
function outcomeGroups(story: Story, outcomeId: string): string[] {
  const groups = story.getSharedOutcomes().some((o) => o.id === outcomeId) ? ["shared"] : [];
  for (const [slot, player] of Object.entries(story.getPlayers())) {
    if ((player.outcomes ?? []).some((o) => o.id === outcomeId)) groups.push(slot);
  }
  return groups;
}

/** The group a milestone on this known outcome goes to; an id held in two lists is noted. */
function groupOf(story: Story, outcomeId: string, repairs: Repair[]): string {
  const groups = outcomeGroups(story, outcomeId);
  if (groups.length > 1) {
    repairs.push({ kind: "milestoneAmbiguousId", note: true, detail: `${outcomeId}: ${groups.join(", ")}` });
  }
  return groups[0];
}

/**
 * The ended threads (on known outcomes) that the milestones leave without
 * one: per outcome, the threads beyond the number of milestones on it.
 */
function uncoveredThreads(story: Story, ended: Thread[], milestones: NewMilestone[]): Thread[] {
  const covered = new Map<string, number>();
  for (const milestone of milestones) {
    covered.set(milestone.outcome, (covered.get(milestone.outcome) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  return ended.filter((thread) => {
    if (outcomeGroups(story, thread.outcomeId).length === 0) return false;
    const index = seen.get(thread.outcomeId) ?? 0;
    seen.set(thread.outcomeId, index + 1);
    return index >= (covered.get(thread.outcomeId) ?? 0);
  });
}

function repairMilestones(story: Story, milestones: Change[], repairs: Repair[]): Change[] {
  const mayAdd = canAddMilestones(story);
  const ended = mayAdd ? story.getResolvedThreadAnalysis()?.threads ?? [] : [];

  // The group comes from the outcome; unknown ids wait for the mapping below
  const placed: Array<Change | { unknown: NewMilestone }> = milestones.map((change) => {
    if (change.type !== "newMilestone") return change;
    if (outcomeGroups(story, change.outcome).length === 0) return { unknown: change };
    const group = groupOf(story, change.outcome, repairs);
    if (group !== change.outcomeGroup) {
      repairs.push({ kind: "milestoneGroup", detail: `${change.outcome}: ${change.outcomeGroup} -> ${group}` });
    }
    return { ...change, outcomeGroup: group };
  });

  const knownMilestones = placed.filter(
    (entry): entry is NewMilestone => !("unknown" in entry) && entry.type === "newMilestone"
  );
  const unknown = placed.filter((entry): entry is { unknown: NewMilestone } => "unknown" in entry);
  const uncovered = uncoveredThreads(story, ended, knownMilestones);
  const mapTo = unknown.length === 1 && uncovered.length === 1 ? uncovered[0].outcomeId : undefined;

  const kept: Change[] = placed.flatMap((entry): Change[] => {
    if (!("unknown" in entry)) return [entry];
    const written = entry.unknown;
    if (mapTo === undefined) {
      repairs.push({ kind: "milestoneDropped", detail: `${written.outcomeGroup}/${written.outcome}` });
      return [];
    }
    repairs.push({ kind: "milestoneIdMapped", detail: `${written.outcome} -> ${mapTo}` });
    return [{ ...written, outcome: mapTo, outcomeGroup: groupOf(story, mapTo, repairs) }];
  });
  if (!mayAdd) return kept;

  // Safety net: an ended thread the reply wrote no milestone for gets its planned one
  for (const thread of ended) {
    if (outcomeGroups(story, thread.outcomeId).length === 0) {
      repairs.push({ kind: "milestoneFromPlanSkipped", note: true, detail: `${thread.id}: unknown outcome ${thread.outcomeId}` });
    }
  }
  const keptMilestones = kept.filter((change): change is NewMilestone => change.type === "newMilestone");
  for (const thread of uncoveredThreads(story, ended, keptMilestones)) {
    if (!thread.milestone) {
      repairs.push({ kind: "milestoneFromPlanSkipped", note: true, detail: `${thread.id}: no milestone` });
      continue;
    }
    repairs.push({ kind: "milestoneFromPlan", detail: `${thread.id} -> ${thread.outcomeId}` });
    kept.push({
      type: "newMilestone",
      outcomeGroup: groupOf(story, thread.outcomeId, repairs),
      outcome: thread.outcomeId,
      newMilestone: thread.milestone,
    });
  }
  return kept;
}

// --- Facts, introductions and options in each player's beat ---

/** What a re-filed fact is prefixed with: the stat's name, the outcome's question or the character's name. */
function factPrefix(story: Story, id: string, known: Known): string | undefined {
  const seatForm = playerStatFromSeatForm(id, known.playerStats);
  const stat =
    known.sharedStats.get(id) ??
    known.playerStats.get(id) ??
    (seatForm ? known.playerStats.get(seatForm.stat) : undefined);
  if (stat) return stat.name || undefined;
  const outcome = story.getOutcomeById(id);
  if (outcome) return outcome.question || undefined;
  if (known.slots.includes(id)) return story.getPlayer(id)?.name || undefined;
  return undefined;
}

function repairFacts(story: Story, facts: NewFact[], known: Known, repairs: Repair[]): NewFact[] {
  return facts.map((fact) => {
    const id = fact.storyElementId;
    if (id === "world" || known.elements.has(id) || known.newElements.has(id)) return fact;
    const prefix = factPrefix(story, id, known);
    repairs.push({ kind: "factRefiled", detail: `${id} -> world` });
    return { ...fact, storyElementId: "world", fact: prefix ? `${prefix}: ${fact.fact}` : fact.fact };
  });
}

function repairIntroductions(introductions: Introduction[], known: Known, repairs: Repair[]): Introduction[] {
  return introductions.filter((introduction) => {
    const id = introduction.storyElementId;
    if (known.elements.has(id) || known.newElements.has(id)) return true;
    repairs.push({ kind: "introductionDropped", detail: id });
    return false;
  });
}

function repairOptions(story: Story, slot: string, options: BeatOption[], repairs: Repair[]): BeatOption[] {
  const expected = expectedOptionType(story, slot);
  if (!expected) return options;
  return options.map((option): BeatOption => {
    if (option.optionType === expected) return option;
    repairs.push({ kind: "optionType", detail: `${slot}: ${option.optionType} -> ${expected}` });
    const { resourceType, text } = option;
    if (expected === "exploration") {
      return { optionType: "exploration", resourceType, text };
    }
    return {
      optionType: "challenge",
      resourceType,
      text,
      riskType: "normal",
      basePoints:
        resourceType === "sacrifice" ? POINTS_FOR_SACRIFICE : resourceType === "reward" ? POINTS_FOR_REWARD : 0,
      modifiersToSuccessRate: [],
    };
  });
}

function repairBeat(
  story: Story,
  slot: string,
  beat: BeatGeneration,
  known: Known,
  repairs: Repair[]
): BeatGeneration {
  const { plan } = beat;
  return {
    ...beat,
    plan: {
      ...plan,
      ...(plan.establishedFacts && {
        establishedFacts: repairFacts(story, plan.establishedFacts, known, repairs),
      }),
      ...(plan.newIntroductionsOfStoryElements && {
        newIntroductionsOfStoryElements: repairIntroductions(plan.newIntroductionsOfStoryElements, known, repairs),
      }),
    },
    ...(beat.options && { options: repairOptions(story, slot, beat.options, repairs) }),
  };
}
