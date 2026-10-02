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
import { checkStatValue, statValueFit } from "core/utils/statValueCheck.js";
import { canAddMilestones, isPlayerBeat } from "./storyTextSteps.js";
import { scoreboardsOf, scoreboardWinners } from "./scoreboards.js";
import { dropLeversChargedAgain, leverStatOf, noteLeversChargedOnOffer } from "./leverPayments.js";
import type { Repair } from "./textRepairs.js";

/*
 * A pure pass over a beat reply before the game keeps it: what the reply
 * wrote in a form the game would drop or not resolve (a stat in seat form, a
 * stat bonus in doubled seat form, a fact filed under a stat, a milestone in
 * the wrong group, an option of the wrong type) is put where the game reads
 * it, and what cannot be placed is dropped; so is a lever charged again after
 * its payment (leverPayments.ts), and a milestone on an outcome the chapter
 * that just ended didn't push (only what was played). Every change is recorded
 * as a Repair; ChangeService keeps applying exact ids. Some things are only
 * noted, kept as written: a lever's stat moved in the reply that offers it, and
 * result words in a player's text (since 2026-10-01).
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
    const placed = repairScoreboardMoves(story, repairStatChanges(reply.statChanges, known, repairs), repairs);
    repaired.statChanges = dropLeversChargedAgain(story, placed, repairs);
  }
  if (Array.isArray(reply.newMilestones)) {
    repaired.newMilestones = repairMilestones(story, reply.newMilestones, repairs);
  }
  for (const key of beatKeys) {
    repaired[key] = repairBeat(story, key.toLowerCase(), reply[key], known, repairs);
  }
  repairSharedLevers(story, repaired, beatKeys, known, repairs);
  if (Array.isArray(repaired.statChanges)) noteLeversChargedOnOffer(story, repaired, repaired.statChanges, repairs);
  for (const key of beatKeys) noteResultWords(key.toLowerCase(), repaired[key], repairs);
  return { reply: repaired, repairs };
}

// --- Result words in the text (a note) ---

/**
 * The game's result kinds where a player reads story text: favorable or
 * unfavorable (either spelling), and "mixed" before a word for a result
 * ("The mixed result remains plain in the room", "the mixed reading").
 */
const RESULT_WORDS = /\b(?:un)?favou?rable\b|\bmixed (?:results?|outcomes?|readings?|judge?ments?|findings?|verdicts?)\b/gi;

/** The result words a text holds, lower-cased, each once, in order. */
export function resultWordsIn(text: string): string[] {
  return [...new Set([...text.matchAll(RESULT_WORDS)].map((match) => match[0].toLowerCase()))];
}

/**
 * A player's text, options or interludes that tell the game's result kind as
 * story text (`resultWordsInText`, a note; kept as written), since the review
 * of the third playthroughs (2026-10-01): its group turns wrote "The mixed
 * result remains plain in the room", "The unfavorable outcome hangs between
 * you", as round 2's had ("The mixed result is plain in the readings"). The
 * turn's request names the kinds ("resolved to end in a favorable/mixed/
 * unfavorable result") and bans none of them, so the game notes them for the
 * log and the eval. Since the result-words stage of 2026-10-02 a group turn
 * that narrates a result is told to name no kind (resultLabels.ts); the note
 * stays, to show what still gets through.
 */
function noteResultWords(slot: string, beat: BeatGeneration | undefined, repairs: Repair[]): void {
  const words = resultWordsOfBeat(beat);
  if (words.length > 0) repairs.push({ kind: "resultWordsInText", note: true, detail: `${slot}: ${words.join(", ")}` });
}

/** The result words in what a player reads of a beat: its title, text, options and interludes (the eval's playthrough readings read the same). */
export function resultWordsOfBeat(beat: BeatGeneration | undefined): string[] {
  if (!beat || typeof beat !== "object") return [];
  const texts = [
    typeof beat.title === "string" ? beat.title : "",
    typeof beat.text === "string" ? beat.text : "",
    ...(Array.isArray(beat.options) ? beat.options : []).map((option) => (typeof option?.text === "string" ? option.text : "")),
    ...(Array.isArray(beat.interludes) ? beat.interludes : []).map((interlude) => (typeof interlude?.text === "string" ? interlude.text : "")),
  ];
  return resultWordsIn(texts.join("\n"));
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
export function isOffLadder(change: StatChange, definition: Stat | undefined): boolean {
  if (change.change !== "setString" || definition?.type !== "string") return false;
  const ladder = (definition.possibleValues ?? "").trim().toLowerCase();
  return ladder.length > 0 && !ladder.includes(String(change.value).toLowerCase());
}

const NUMBER_TYPES: Stat["type"][] = ["percentage", "opposites", "number"];

/** A text that starts with a sign, or a number below 0: a delta written as a value. */
const isSigned = (value: unknown): boolean =>
  (typeof value === "string" && /^\s*[+-]/.test(value)) || (typeof value === "number" && value < 0);

/**
 * A number, percentage or opposites stat set with a text that reads as one
 * value (the switch turn after setup round 3's bounty contest wrote the
 * scoreboard's move as setString "35|65", which ChangeService drops, so the
 * score never moved): the setNumber the game applies, read as a background
 * value is ("a|b" summing to 100 is a, "40%" is 40, "12" is 12). The same
 * change as it was otherwise, and always for a signed value ("-10%", "+5", or
 * a number below 0): that is a change by so much, not a value to set, and
 * read as one it would set health to 0 or gold to 5.
 */
function numberWrittenAsText(change: StatChange, definition: Stat | undefined): StatChange {
  if (change.change !== "setString" || !definition || !NUMBER_TYPES.includes(definition.type)) return change;
  if (isSigned(change.value)) return change;
  const fit = statValueFit(definition, change.value);
  if (fit !== "converts" && fit !== "clamps") return change;
  const value = checkStatValue(definition, change.value).value;
  return typeof value === "number" ? { ...change, change: "setNumber", value } : change;
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
    const placed: StatChange = { ...change, group: target.group, stat: target.stat };
    const definition =
      target.group === "shared" ? known.sharedStats.get(target.stat) : known.playerStats.get(target.stat);
    const repaired = numberWrittenAsText(placed, definition);
    if (repaired !== placed) {
      repairs.push({ kind: "statNumberAsText", detail: `${target.group}/${target.stat}: ${String(placed.value)} -> ${String(repaired.value)}` });
    }
    if (isOffLadder(repaired, definition)) {
      repairs.push({ kind: "offLadderValue", note: true, detail: `${target.stat}: ${String(repaired.value)}` });
    }
    kept.push(repaired);
  }
  return kept;
}

// --- The scoreboard's direction ---

const clampScore = (value: number) => Math.max(0, Math.min(100, value));

/** The score a numeric change leaves, before the game clamps it; undefined for a change that sets no number. */
function scoreAfter(change: StatChange, before: number): number | undefined {
  if (typeof change.value !== "number") return undefined;
  if (change.change === "addNumber") return before + change.value;
  if (change.change === "subtractNumber") return before - change.value;
  if (change.change === "setNumber") return change.value;
  return undefined;
}

/** The same move the other way, by the same size: an addition as a subtraction and back, a value set reflected around the score before. */
function turnedAround(change: StatChange, before: number): StatChange {
  if (change.change === "addNumber") return { ...change, change: "subtractNumber" };
  if (change.change === "subtractNumber") return { ...change, change: "addNumber" };
  return { ...change, value: clampScore(2 * before - (change.value as number)) };
}

/**
 * A contest's scoreboard moves only toward the side that won the contest step
 * or chapter this turn follows (scoreboardWinners). A move the other way is
 * turned around by the same size: the model sized the move, the recorded
 * result says which way it goes. The playthroughs' food trucks turn 22, after
 * side B's win: "Luz's Side B victory shifts the race 15 points toward" her,
 * written as addNumber 15, which moved 35|65 to 50|50. Moves are read in
 * order, each from the score the ones before it leave; after a mixed result,
 * on turns that follow no contest result, and where the outcome names no
 * scoreboard or player1 is not on the contest's side A, every move stays as
 * written.
 */
/**
 * A score written twice in one reply: on a contest's scoreboard (scoreboardsOf),
 * a value set after another that is 100 minus it, the other side's share, is
 * dropped (`scoreboardWrittenTwice`, since 2026-10-01), the first kept: an
 * opposites stat's value is its first side's share. The third playthroughs'
 * food trucks ending set the contract score to 30 and then 70, each side's
 * share in turn, and the game kept 70|30 for the side that lost. Read after the
 * number-as-text repair, before the direction repair, which then reads the
 * value kept. Any other second value (another size, the same value) and a
 * meter's values stay as written.
 */
function withoutOtherSidesShare(story: Story, changes: Change[], repairs: Repair[]): Change[] {
  const boards = scoreboardsOf(story);
  if (boards.size === 0) return changes;
  const firstSet = new Map<string, number>();
  return changes.filter((change) => {
    if (change.type !== "statChange" || change.group !== "shared" || change.change !== "setNumber" || typeof change.value !== "number" || !boards.has(change.stat)) return true;
    const first = firstSet.get(change.stat);
    if (first === undefined) {
      firstSet.set(change.stat, change.value);
      return true;
    }
    if (change.value === first || change.value !== 100 - first) return true;
    repairs.push({ kind: "scoreboardWrittenTwice", detail: `${change.stat}: ${change.value} after ${first} in the same reply, the other side's share` });
    return false;
  });
}

function repairScoreboardMoves(story: Story, written: Change[], repairs: Repair[]): Change[] {
  const changes = withoutOtherSidesShare(story, written, repairs);
  const winners = scoreboardWinners(story);
  if (winners.size === 0) return changes;
  const scores = new Map(story.getState().sharedStatValues.map((entry) => [entry.statId, entry.value]));
  return changes.map((change) => {
    if (change.type !== "statChange" || change.group !== "shared") return change;
    const winner = winners.get(change.stat);
    const before = scores.get(change.stat);
    if (!winner || typeof before !== "number") return change;
    const after = scoreAfter(change, before);
    if (after === undefined) return change;
    const wrongWay = winner === "sideA" ? after < before : after > before;
    const kept = wrongWay ? turnedAround(change, before) : change;
    const settled = clampScore(scoreAfter(kept, before) ?? before);
    if (wrongWay) {
      repairs.push({
        kind: "scoreboardDirection",
        detail: `${change.stat}: ${before} -> ${clampScore(after)} after side ${winner === "sideA" ? "A" : "B"} won; ${before} -> ${settled}`,
      });
    }
    scores.set(change.stat, settled);
    return kept;
  });
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

/**
 * Only what was played (the owner's decision of 2026-10-01: "The idea was
 * -not- for the engine to invent missing milestones for open outcomes.
 * Unfinished outcomes should be narrated as unfinished. Only what was
 * played."): each outcome keeps as many of the reply's milestones, the first
 * written, as threads of the chapter that just ended pushed it, and no outcome
 * gets one otherwise, so a turn that ends no chapter keeps none. Until then a
 * milestone on a known outcome no ended chapter pushed was kept (TR-4), and the
 * second playthroughs' estate agents' ending added one to each of four
 * outcomes beside the last chapter's.
 */
function onlyPlayed(ended: Thread[], milestones: Change[], repairs: Repair[]): Change[] {
  const allowed = new Map<string, number>();
  for (const thread of ended) {
    allowed.set(thread.outcomeId, (allowed.get(thread.outcomeId) ?? 0) + 1);
  }
  return milestones.filter((change) => {
    if (change.type !== "newMilestone") return true;
    const left = allowed.get(change.outcome) ?? 0;
    if (left === 0) {
      repairs.push({ kind: "milestoneNotPlayed", detail: `${change.outcomeGroup}/${change.outcome}` });
      return false;
    }
    allowed.set(change.outcome, left - 1);
    return true;
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

  const read: Change[] = placed.flatMap((entry): Change[] => {
    if (!("unknown" in entry)) return [entry];
    const written = entry.unknown;
    if (mapTo === undefined) {
      repairs.push({ kind: "milestoneDropped", detail: `${written.outcomeGroup}/${written.outcome}` });
      return [];
    }
    repairs.push({ kind: "milestoneIdMapped", detail: `${written.outcome} -> ${mapTo}` });
    return [{ ...written, outcome: mapTo, outcomeGroup: groupOf(story, mapTo, repairs) }];
  });
  const kept = onlyPlayed(ended, read, repairs);
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

// --- Facts, introductions, stat bonuses and options in each player's beat ---

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

type BonusTarget = { statId: string } | { note: "bonusStatAmbiguous" | "bonusStatUnknown" };

/**
 * The id a stat bonus on this player's option should name its stat by, when
 * Story.getStatById (the roll breakdown's lookup) doesn't resolve the one
 * written: the stat-change repair's reading of a seat form (doubled,
 * "player1_player_skills_traits" or "player_player_skills_traits", or a seat
 * on a stat whose id has no "player_") under the option's own seat, written as
 * the bonus contract asks ("player1_skills_traits" for "player_skills_traits"),
 * or as the plain id where the stat's id has no "player_" to replace. In
 * multiplayer another player's seat is ambiguous and a seat the story lacks is
 * unknown; in single player every seat is the one player's. Undefined: the
 * lookup resolves the id already.
 */
function bonusTarget(story: Story, slot: string, id: string, known: Known): BonusTarget | undefined {
  if (story.getStatById(id)) return undefined;
  const seatForm = playerStatFromSeatForm(id, known.playerStats);
  if (!seatForm) return { note: "bonusStatUnknown" };
  const { slots } = known;
  if (slots.length > 1 && seatForm.seat !== undefined) {
    if (!slots.includes(seatForm.seat)) return { note: "bonusStatUnknown" };
    if (seatForm.seat !== slot) return { note: "bonusStatAmbiguous" };
  }
  const seat = slots.length === 1 ? slots[0] : slot;
  const seated = seatForm.stat.startsWith("player_") ? `${seat}_${seatForm.stat.slice("player_".length)}` : seatForm.stat;
  return { statId: story.getStatById(seated)?.id === seatForm.stat ? seated : seatForm.stat };
}

/**
 * Every challenge option's bonuses with their stat in a form the roll's
 * breakdown names (the points counted as before either way); what can't be
 * read unambiguously stays as written and is noted.
 */
function repairBonuses(story: Story, slot: string, options: BeatOption[], known: Known, repairs: Repair[]): BeatOption[] {
  return options.map((option): BeatOption => {
    if (option?.optionType !== "challenge" || !Array.isArray(option.modifiersToSuccessRate)) return option;
    let changed = false;
    const modifiersToSuccessRate = option.modifiersToSuccessRate.map((modifier) => {
      const written: unknown = modifier?.statId;
      if (typeof written !== "string") return modifier;
      const target = bonusTarget(story, slot, written, known);
      if (!target) return modifier;
      if ("note" in target) {
        repairs.push({ kind: target.note, note: true, detail: `${slot}: ${written}` });
        return modifier;
      }
      repairs.push({ kind: "bonusStatIdSeatForm", detail: `${slot}: ${written} -> ${target.statId}` });
      changed = true;
      return { ...modifier, statId: target.statId };
    });
    return changed ? { ...option, modifiersToSuccessRate } : option;
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

// --- A shared sacrifice or reward, one player per turn ---

const seatNumber = (key: string) => Number(key.toLowerCase().replace("player", ""));

/**
 * In a group turn, a sacrifice or reward that draws on a shared stat goes to
 * one player: the first seat offered it keeps it, and each later seat's copy
 * of the same lever on the same stat leaves that player's options. The
 * playthroughs' space pirates turn 16 offered "Call in Ivo Senn's dockside
 * favor" to two players in one shared challenge, the crew's one favour, and
 * both took its +30. Only in a challenge set: in an exploration set an
 * option's position is its result, so there the copy stays and is noted. A
 * sacrifice and a reward of one stat are different levers, and a lever on a
 * player's own stat is every player's own.
 */
function repairSharedLevers(
  story: Story,
  reply: SetOfBeatGenerationSchema,
  keys: `player${number}`[],
  known: Known,
  repairs: Repair[]
): void {
  if (known.slots.length < 2) return;
  const holders = new Map<string, string>();
  for (const key of [...keys].sort((a, b) => seatNumber(a) - seatNumber(b))) {
    const slot = key.toLowerCase();
    const beat = reply[key];
    if (!Array.isArray(beat?.options)) continue;
    const options = beat.options.filter((option) => {
      if (option?.resourceType !== "sacrifice" && option?.resourceType !== "reward") return true;
      const lever = leverStatOf(story, slot, option.resourceType, typeof option.text === "string" ? option.text : "", known);
      if (!lever?.shared) return true;
      const held = `${option.resourceType}|${lever.stat.id}`;
      const holder = holders.get(held);
      if (holder === undefined) {
        holders.set(held, slot);
        return true;
      }
      const detail = `${slot}: ${lever.stat.id} (${option.resourceType}) is ${holder}'s this turn`;
      if (option.optionType !== "challenge") {
        repairs.push({ kind: "sharedLeverRepeatedKept", note: true, detail });
        return true;
      }
      repairs.push({ kind: "sharedLeverRepeated", detail });
      return false;
    });
    if (options.length !== beat.options.length) reply[key] = { ...beat, options };
  }
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
    ...(beat.options && {
      options: repairBonuses(story, slot, repairOptions(story, slot, beat.options, repairs), known, repairs),
    }),
  };
}
