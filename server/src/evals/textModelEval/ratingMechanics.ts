import type { Story } from "core/models/Story.js";
import type { BeatOption, Change, SetOfBeatGenerationSchema, Stat, StatValue, StoryState } from "core/types/index.js";
import { MAX_STAT_MODIFIER_POINTS, MAX_STAT_MODIFIERS_PER_OPTION } from "core/config.js";
import { ChangeService } from "../../game/services/ChangeService.js";
import { isOffLadder, repairBeatReply } from "../../game/services/beatRepairs.js";
import { canAddMilestones, isPlayerBeat } from "../../game/services/storyTextSteps.js";
import type { EvalCase } from "./cases.js";
import { beatInput } from "./outputChecks.js";
import type { TurnContent } from "./ratingContent.js";
import { CONTEXT_LABELS, type ContextLine } from "./ratingContext.js";
import type { ArmRef } from "./ratingSets.js";
import { usable, type CallRecord } from "./runner.js";
import { statNames } from "./turnDesignChecks.js";

/*
 * What a turn option does beyond its words, for the rating pages (the
 * owner's feedback of 2026-09-29: "options should also display the stat
 * changes that come along with it"). Per player beat, each choice's
 * mechanics as the game plays it: its type; for a challenge its risk, base
 * points and stat bonuses as BeatResolutionService counts them (the first two,
 * each within ±15), with the reasons players see; a sacrifice or reward with
 * its stat and the amount its text names; for an exploration choice the
 * result or direction it leads to by position. Per turn, what the reply
 * changes after the game's repairs (beatRepairs), applied to the state the
 * call saw with the game's own ChangeService: each stat change as before →
 * after, flagged where it doesn't fit its stat; milestones, new story
 * elements, introductions, facts, and what the repairs drop. When the
 * previous choice was a sacrifice or reward, a line says whether this turn
 * paid it and by how much.
 *
 * The lever's stat is not a field of the option: it is the stat its text
 * names (the design check's sacrificeApplied reads it the same way), else the
 * stat whose held value it names (an item, a trait), else the one stat that
 * allows that lever at all. Where the text names several, the one it pays
 * (leverStat): of those allowing the lever, the one named beside the amount,
 * else the first named. Every fixed string is in MECHANICS_LABELS, which
 * joins the page's field labels, so the blinding word check reads it; stat
 * names, reasons and story text go in a line's text.
 */

export const MECHANICS_LABELS = {
  choice: "Choice",
  challenge: "challenge",
  exploration: "exploration",
  risk: "risk",
  basePoints: "base points",
  statBonus: "Stat bonus",
  writtenAs: "written as",
  notCounted: "not counted: only two bonuses count",
  notAStat: "no stat has this id: the game counts it and shows the id",
  sacrifice: "Sacrifice",
  reward: "Reward",
  noStatNamed: "no stat named in its text",
  amountInText: "amount in its text",
  noAmount: "no amount in its text",
  statAllows: "The stat allows",
  leadsTo: "Leads to",
  direction: "Direction",
  previousSacrificed: "Previous choice sacrificed",
  previousGained: "Previous choice gained",
  applied: "applied",
  notApplied: "not applied",
  otherWay: "changed the other way",
  noChange: "written, but nothing changed",
  statChanges: "Stat changes",
  doesntFit: "Doesn't fit its stat",
  offLadder: "not among its possible values",
  outOfRange: "out of range",
  keptAt: "kept at",
  belowZero: "below 0",
  onlyAfterChapter: "changes only after a chapter ends",
  cantApply: "a change the game can't apply to this stat",
  numberAsText: "a number written as text",
  notHeld: "not held",
  alreadyHeld: "already held",
  noValue: "no value to change",
  milestones: "Milestones",
  forOutcome: "For outcome",
  newElements: "New story elements",
  introduced: "Introduced",
  facts: "Facts",
  world: "World",
  dropped: "Dropped by the game",
  droppedStat: "a stat change on a stat the story lacks",
  droppedAmbiguous: "a stat change it can't place on a player",
  droppedIntroduction: "an introduction of an element the story lacks",
  droppedMilestone: "a milestone on an outcome the story lacks",
  shared: "Shared",
  forPlayer: "For",
  noChanges: "No changes",
  empty: "(empty)",
} as const;

const L = MECHANICS_LABELS;

export type UnfitKind = "offLadder" | "outOfRange" | "belowZero" | "onlyAfterChapter" | "cantApply" | "numberAsText" | "notHeld" | "alreadyHeld" | "noValue";

/** One stat change as the game applies it, in order: the value before and after, and why it doesn't fit its stat. */
export type StatChangeReading = {
  /** "shared" or a player slot, after the repairs */
  group: string;
  statId: string;
  name: string;
  stat?: Stat;
  before?: StatValue;
  after?: StatValue;
  unfit: { kind: UnfitKind; detail?: string }[];
};

export type LeverStatus = "applied" | "notApplied" | "otherWay" | "noChange" | "unnamed";

/** A player's previous choice that was a sacrifice or reward (its text), and what this turn did with its stat. */
export type LeverReading = { slot: string; kind: "sacrifice" | "reward"; text: string; stat?: Stat; status: LeverStatus; before?: StatValue; after?: StatValue };

/** What a turn's reply changes, after the game's repairs, on the state the call saw. */
export type TurnReading = {
  slots: string[];
  /** The reply as the game keeps it */
  reply: SetOfBeatGenerationSchema;
  statChanges: StatChangeReading[];
  levers: LeverReading[];
  milestones: { group: string; text: string; question: string }[];
  newElements: { slot: string; name: string; role: string }[];
  introductions: { slot: string; name: string }[];
  facts: { slot: string; element: string; fact: string }[];
  /** What the repairs dropped, as a line each */
  dropped: string[];
};

type StatChange = Extract<Change, { type: "statChange" }>;
type Lever = "sacrifice" | "reward";

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const asString = (value: unknown): string => (typeof value === "string" ? value : typeof value === "number" ? String(value) : "");
const signed = (value: number) => (value > 0 ? `+${value}` : `${value}`);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function present<T>(items: (T | undefined)[]): T[] {
  return items.filter((item): item is T => item !== undefined);
}

const isShared = (state: StoryState, stat: Stat) => state.sharedStats.some((s) => s.id === stat.id);
/** Where a stat's value lives for this player: "shared", or the player's slot. */
const groupOf = (state: StoryState, stat: Stat, slot: string) => (isShared(state, stat) ? "shared" : slot);

function valuesOf(state: StoryState, group: string) {
  return group === "shared" ? state.sharedStatValues ?? [] : state.players[group]?.statValues ?? [];
}

const valueOf = (state: StoryState, group: string, statId: string): StatValue | undefined => valuesOf(state, group).find((v) => v.statId === statId)?.value;

/** A value as the stat shows it: 40% for a percentage, 60|40 for opposites, a list's items. */
function shown(stat: Stat | undefined, value: StatValue | undefined): string {
  if (value === undefined) return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : L.empty;
  if (typeof value === "number" && stat?.type === "percentage") return `${value}%`;
  if (typeof value === "number" && stat?.type === "opposites") return `${value}|${100 - value}`;
  return String(value);
}

/** A stat's lever rule: its text, unless it says the stat has none. */
const allows = (rule: unknown): rule is string => typeof rule === "string" && rule.trim() !== "" && !/^none\b/i.test(rule.trim());
const leverRule = (stat: Stat, kind: Lever) => (kind === "sacrifice" ? stat.optionsToSacrifice : stat.optionsToGainAsReward);

const AMOUNT = /[+\-−–]?\d+(?:[.,]\d+)?(?:\s?%)?/g;

/** The amounts an option's text names: "10", "10%", "-5". */
const amountsIn = (text: string) => (text.match(AMOUNT) ?? []).map((a) => a.replace(/\s/g, ""));

type Span = [start: number, end: number];
/** A stat a lever's text names, and where it does (no place for the one stat allowing the lever). */
type Named = { stat: Stat; spans: Span[] };

function spansOf(lower: string, word: string): Span[] {
  const needle = word.toLowerCase();
  const spans: Span[] = [];
  for (let at = needle ? lower.indexOf(needle) : -1; at >= 0; at = lower.indexOf(needle, at + 1)) spans.push([at, at + needle.length]);
  return spans;
}

/** The stats whose words the text holds, in the order the text first names them. */
function namedIn(lower: string, stats: Stat[], words: (stat: Stat) => string[]): Named[] {
  const first = (n: Named) => Math.min(...n.spans.map(([start]) => start));
  return stats
    .map((stat) => ({ stat, spans: words(stat).flatMap((word) => spansOf(lower, word)) }))
    .filter((n) => n.spans.length > 0)
    .sort((a, b) => first(a) - first(b));
}

/**
 * The stats a sacrifice or reward option works on: those its text names;
 * else those whose held value it names (an item, a trait); else the one stat
 * that allows that lever, when only one does. In the order the text names them.
 */
function leverCandidates(story: Story, slot: string, text: string, kind: Lever): Named[] {
  const state = story.getState();
  const stats = [...state.sharedStats, ...state.playerStats];
  const lower = text.toLowerCase();
  const byName = namedIn(lower, stats, statNames);
  if (byName.length) return byName;
  const held = (s: Stat) => {
    const value = valueOf(state, groupOf(state, s, slot), s.id);
    return (Array.isArray(value) ? value : typeof value === "string" ? [value] : []).map((v) => v.trim()).filter((v) => v.length >= 4);
  };
  const byValue = namedIn(lower, stats, held);
  if (byValue.length) return byValue;
  const allowing = stats.filter((s) => allows(leverRule(s, kind)));
  return allowing.length === 1 ? [{ stat: allowing[0], spans: [] }] : [];
}

/**
 * The one stat a lever pays, when its text names several ("Burn 10 Supplies
 * to steady your Nerve"): of those that allow this lever, or all when none
 * does, the one named nearest an amount the text names, else the one it names
 * first. The page reads this stat alone, so another named stat moving never
 * reads as the lever paid.
 */
function leverStat(candidates: Named[], text: string, kind: Lever): Stat | undefined {
  const allowing = candidates.filter((c) => allows(leverRule(c.stat, kind)));
  const pool = allowing.length ? allowing : candidates;
  const amounts = [...text.toLowerCase().matchAll(AMOUNT)].map((m): Span => [m.index ?? 0, (m.index ?? 0) + m[0].length]);
  if (pool.length < 2 || amounts.length === 0) return pool[0]?.stat;
  const gap = (n: Named) => Math.min(...n.spans.flatMap(([start, end]) => amounts.map(([from, to]) => Math.max(0, from - end, start - to))));
  return pool.reduce((best, n) => (gap(n) < gap(best) ? n : best)).stat;
}

/** The player's previous choice when it was a sacrifice or reward (any option type: the schema allows both). */
function previousLever(story: Story, slot: string): { kind: Lever; text: string } | undefined {
  const beat = story.getCurrentBeat(slot);
  if (!beat || typeof beat.choice !== "number" || beat.choice < 0) return undefined;
  const option = asArray<BeatOption>(beat.options)[beat.choice];
  if (!option || (option.resourceType !== "sacrifice" && option.resourceType !== "reward")) return undefined;
  return { kind: option.resourceType, text: asString(option.text) };
}

const NUMBER_TYPES: Stat["type"][] = ["number", "percentage", "opposites"];
const NUMBER_CHANGES = ["addNumber", "subtractNumber", "setNumber"];

/** Whether ChangeService applies this kind of change to a stat of this type. */
function applies(stat: Stat, kind: string): boolean {
  if (kind === "setString") return stat.type === "string";
  if (NUMBER_CHANGES.includes(kind)) return NUMBER_TYPES.includes(stat.type);
  if (kind === "addElement" || kind === "removeElement") return stat.type === "string[]";
  return false;
}

/** The number a change asks for before the game clamps it, when both sides are numbers. */
function rawNumber(change: StatChange, before: StatValue | undefined): number | undefined {
  if (typeof before !== "number" || typeof change.value !== "number") return undefined;
  if (change.change === "addNumber") return before + change.value;
  if (change.change === "subtractNumber") return before - change.value;
  if (change.change === "setNumber") return change.value;
  return undefined;
}

/**
 * Each stat change applied in order with the game's ChangeService, from the
 * state the call saw. `exempt` holds the previous choices' lever stats
 * ("group|statId"), which a turn may change whatever their flag says.
 */
function readStatChanges(story: Story, reply: SetOfBeatGenerationSchema, exempt: Set<string>): StatChangeReading[] {
  const service = new ChangeService();
  const afterChapter = canAddMilestones(story);
  let working = story;
  const changes = asArray<Change>(asObject(reply).statChanges).filter((c): c is StatChange => Boolean(c) && c.type === "statChange");
  return changes.map((change) => {
    const state = working.getState();
    const stat = (change.group === "shared" ? state.sharedStats : state.playerStats).find((s) => s.id === change.stat);
    const reading: StatChangeReading = { group: change.group, statId: change.stat, name: stat?.name || change.stat, stat, unfit: [] };
    if (!stat) return { ...reading, unfit: [{ kind: "cantApply", detail: change.change }] };
    const flag = (kind: UnfitKind, detail?: string) => reading.unfit.push({ kind, ...(detail !== undefined ? { detail } : {}) });
    const held = valuesOf(state, change.group).some((v) => v.statId === change.stat);
    if (!held) {
      flag("noValue");
      return reading;
    }
    const before = valueOf(state, change.group, change.stat);
    reading.before = before;
    reading.after = before;
    if (!applies(stat, change.change)) {
      flag("cantApply", change.change);
    } else {
      if (NUMBER_CHANGES.includes(change.change) && typeof change.value !== "number") flag("numberAsText", JSON.stringify(change.value));
      if (change.change === "setString" && isOffLadder(change, stat)) flag("offLadder", stat.possibleValues);
      const item = asString(change.value);
      if (change.change === "removeElement" && !(Array.isArray(before) && before.includes(item))) flag("notHeld", item);
      if (change.change === "addElement" && Array.isArray(before) && before.includes(item)) flag("alreadyHeld", item);
      // A removal from a value that is no list would throw in ChangeService; the game keeps it as it is
      if (!(change.change === "removeElement" && !Array.isArray(before))) {
        working = service.applyChanges(working, [change]);
        reading.after = valueOf(working.getState(), change.group, change.stat);
      }
      const raw = rawNumber(change, before);
      if (raw !== undefined && stat.type !== "number" && (raw < 0 || raw > 100)) flag("outOfRange", `${raw}, ${L.keptAt} ${String(reading.after)}`);
      if (raw !== undefined && stat.type === "number" && raw < 0) flag("belowZero", `${raw}`);
    }
    if (stat.canBeChangedInBeatResolutions === false && !afterChapter && !exempt.has(`${change.group}|${stat.id}`)) flag("onlyAfterChapter");
    return reading;
  });
}

/** Paid, paid the other way, written without effect, or left out: a sacrifice lowers or removes, a reward raises or adds. */
function leverStatus(kind: Lever, stat: Stat, before: StatValue | undefined, after: StatValue | undefined): LeverStatus {
  if (same(before, after)) return "noChange";
  if (typeof before === "number" && typeof after === "number" && stat.type !== "opposites") {
    return (kind === "sacrifice") === after < before ? "applied" : "otherWay";
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    const removed = before.some((v) => !after.includes(v));
    const added = after.some((v) => !before.includes(v));
    return (kind === "sacrifice" ? removed : added) ? "applied" : "otherWay";
  }
  return "applied";
}

/** What the turn did with the lever's own stat: its changes in order, or none, "not applied". */
function leverReading(state: StoryState, slot: string, kind: Lever, text: string, stat: Stat | undefined, changes: StatChangeReading[]): LeverReading {
  if (!stat) return { slot, kind, text, status: "unnamed" };
  const own = changes.filter((c) => c.statId === stat.id && c.group === groupOf(state, stat, slot));
  if (own.length === 0) return { slot, kind, text, stat, status: "notApplied" };
  const before = own[0].before;
  const after = own[own.length - 1].after;
  return { slot, kind, text, stat, status: leverStatus(kind, stat, before, after), before, after };
}

const DROPPED: Record<string, string> = {
  statChangeUnknown: L.droppedStat,
  statChangeAmbiguous: L.droppedAmbiguous,
  introductionDropped: L.droppedIntroduction,
  milestoneDropped: L.droppedMilestone,
};

/** A reply the repairs can read: a player's beat that is no object, or has no plan, reads as one with an empty plan. */
function withPlans(written: SetOfBeatGenerationSchema): SetOfBeatGenerationSchema {
  const entries = Object.entries(written as unknown as Record<string, unknown>).map(([key, value]) => {
    if (!isPlayerBeat(key)) return [key, value];
    const beat = asObject(value);
    return [key, beat.plan && typeof beat.plan === "object" ? value : { ...beat, plan: {} }];
  });
  return Object.fromEntries(entries) as SetOfBeatGenerationSchema;
}

/** What a turn's reply changes, after the game's repairs, on the state the call saw. */
export function readTurn(story: Story, written: SetOfBeatGenerationSchema): TurnReading {
  const { reply, repairs } = repairBeatReply(story, withPlans(written));
  const state = story.getState();
  const slots = story.getPlayerSlots();
  const levers = slots.flatMap((slot) => {
    const previous = previousLever(story, slot);
    if (!previous) return [];
    const candidates = leverCandidates(story, slot, previous.text, previous.kind);
    return [{ slot, ...previous, candidates, stat: leverStat(candidates, previous.text, previous.kind) }];
  });
  // Any stat the lever's text names may change whatever its flag says, not only the one it pays
  const exempt = new Set(levers.flatMap((l) => l.candidates.map(({ stat }) => `${groupOf(state, stat, l.slot)}|${stat.id}`)));
  const statChanges = readStatChanges(story, reply, exempt);

  const beats = slots.map((slot) => ({ slot, plan: asObject(asObject((reply as unknown as Record<string, unknown>)[slot]).plan) }));
  const created = beats.flatMap(({ slot, plan }) =>
    asArray<unknown>(plan.newGameElements).map((c) => ({ slot, element: asObject(asObject(c).element) }))
  );
  const elementName = (id: string) =>
    id === "world"
      ? L.world
      : state.storyElements.find((e) => e.id === id)?.name || asString(created.find((c) => c.element.id === id)?.element.name) || id;

  return {
    slots,
    reply,
    statChanges,
    levers: levers.map((l) => leverReading(state, l.slot, l.kind, l.text, l.stat, statChanges)),
    milestones: asArray<Change>(asObject(reply).newMilestones)
      .filter((m): m is Extract<Change, { type: "newMilestone" }> => Boolean(m) && m.type === "newMilestone")
      .map((m) => ({ group: m.outcomeGroup, text: m.newMilestone, question: story.getOutcomeById(m.outcome)?.question || m.outcome })),
    newElements: created.map(({ slot, element }) => ({ slot, name: asString(element.name) || asString(element.id), role: asString(element.role) })),
    introductions: beats.flatMap(({ slot, plan }) =>
      asArray<unknown>(plan.newIntroductionsOfStoryElements).map((i) => ({ slot: asString(asObject(i).player) || slot, name: elementName(asString(asObject(i).storyElementId)) }))
    ),
    facts: beats.flatMap(({ slot, plan }) =>
      asArray<unknown>(plan.establishedFacts).map((f) => ({ slot, element: elementName(asString(asObject(f).storyElementId)), fact: asString(asObject(f).fact) }))
    ),
    dropped: repairs.filter((r) => DROPPED[r.kind] !== undefined).map((r) => `${DROPPED[r.kind]}: ${r.detail ?? ""}`),
  };
}

const RESULT_WORDS: Record<string, string> = {
  resolution1: CONTEXT_LABELS.resolution1,
  resolution2: CONTEXT_LABELS.resolution2,
  resolution3: CONTEXT_LABELS.resolution3,
};

/** Where an exploration choice leads by position: the step's result (BeatResolutionService), or a topic switch's direction. */
function leadsTo(story: Story, slot: string, index: number, count: number): ContextLine | undefined {
  const beatType = story.getCurrentBeatType();
  if (beatType === "thread") {
    const thread = story.getCurrentThreadAnalysis()?.threads.find((t) => asArray<string>(t.playersSideA).includes(slot) || asArray<string>(t.playersSideB).includes(slot));
    const steps = asArray<Record<string, unknown>>(thread?.progression);
    const step = steps[steps.filter((s) => s?.resolution !== null).length];
    const key = `resolution${(index % count) + 1}`;
    const result = asString(asObject(step?.possibleResolutions)[key]);
    return result ? { label: L.leadsTo, text: `${RESULT_WORDS[key]}: ${result}` } : undefined;
  }
  if (beatType === "switch") {
    const written = story.getCurrentSwitchAnalysis()?.switches.find((s) => asArray<string>(s.players).includes(slot));
    const direction = written?.type === "topic" ? asString(asArray<unknown>(written.topicChoices)[index]) : "";
    return direction ? { label: L.leadsTo, text: `${L.direction} ${index + 1}: ${direction}` } : undefined;
  }
  return undefined;
}

/** A stat bonus as the game counts it: the first two, each within ±15, named as the game names it. */
function bonusLine(story: Story, modifier: Record<string, unknown>, index: number): ContextLine {
  const effect = typeof modifier.effect === "number" ? modifier.effect : Number(modifier.effect) || 0;
  const id = asString(modifier.statId);
  const found = story.getStatById(id);
  const name = found ? found.name || id : `${id} (${L.notAStat})`;
  const counted = Math.max(-MAX_STAT_MODIFIER_POINTS, Math.min(MAX_STAT_MODIFIER_POINTS, effect));
  const reason = asString(modifier.reason);
  const note = index >= MAX_STAT_MODIFIERS_PER_OPTION ? ` (${L.notCounted})` : counted !== effect ? ` (${L.writtenAs} ${signed(effect)})` : "";
  const value = index >= MAX_STAT_MODIFIERS_PER_OPTION ? effect : counted;
  return { label: L.statBonus, text: `${signed(value)} ${name}${note}${reason ? `: ${reason}` : ""}` };
}

/** A sacrifice or reward option: the stat it pays, the amount its text names, and what the stat allows. */
function leverLine(story: Story, slot: string, option: BeatOption): ContextLine | undefined {
  const kind = option.resourceType;
  if (kind !== "sacrifice" && kind !== "reward") return undefined;
  const text = asString(option.text);
  const stat = leverStat(leverCandidates(story, slot, text, kind), text, kind);
  const amounts = amountsIn(text);
  const rule = stat ? leverRule(stat, kind) : undefined;
  return {
    label: kind === "sacrifice" ? L.sacrifice : L.reward,
    text: `${stat ? stat.name : L.noStatNamed} · ${amounts.length ? `${L.amountInText}: ${amounts.join(", ")}` : L.noAmount}`,
    ...(allows(rule) ? { sub: [{ label: L.statAllows, text: rule }] } : {}),
  };
}

/** Each of a player's choices as the game plays it (pass the reply the game keeps: readTurn's). */
export function choiceLines(story: Story, reply: SetOfBeatGenerationSchema, slot: string): ContextLine[] {
  const options = asArray<BeatOption>(asObject((reply as unknown as Record<string, unknown>)[slot]).options).filter((o) => o && typeof o === "object");
  return options.map((option, index) => {
    const challenge = option.optionType === "challenge";
    const text = challenge
      ? `${L.challenge} · ${L.risk} ${asString(option.riskType)} · ${L.basePoints} ${typeof option.basePoints === "number" ? signed(option.basePoints) : asString(option.basePoints)}`
      : L.exploration;
    const sub = present([
      ...(challenge ? asArray<Record<string, unknown>>(option.modifiersToSuccessRate).map((m, i) => bonusLine(story, asObject(m), i)) : [leadsTo(story, slot, index, options.length)]),
      leverLine(story, slot, option),
    ]);
    return { label: `${L.choice} ${index + 1}`, text, ...(sub.length ? { sub } : {}) };
  });
}

function unfitLine(unfit: StatChangeReading["unfit"][number]): ContextLine {
  return { label: L.doesntFit, text: unfit.detail !== undefined && unfit.detail !== "" ? `${L[unfit.kind]}: ${unfit.detail}` : L[unfit.kind] };
}

function statChangeLine(change: StatChangeReading): ContextLine {
  const text = change.before === undefined && change.after === undefined ? change.name : `${change.name}: ${shown(change.stat, change.before)} → ${shown(change.stat, change.after)}`;
  return { text, ...(change.unfit.length ? { sub: change.unfit.map(unfitLine) } : {}) };
}

function previousLine(lever: LeverReading): ContextLine {
  const label = lever.kind === "sacrifice" ? L.previousSacrificed : L.previousGained;
  if (lever.status === "unnamed" || !lever.stat) return { label, text: L.noStatNamed };
  const word = { applied: L.applied, notApplied: L.notApplied, otherWay: L.otherWay, noChange: L.noChange }[lever.status];
  const values = lever.status === "notApplied" ? "" : `, ${shown(lever.stat, lever.before)} → ${shown(lever.stat, lever.after)}`;
  return { label, text: `${lever.stat.name}: ${word}${values}` };
}

type Owned = Pick<TurnReading, "levers" | "statChanges" | "milestones" | "newElements" | "introductions" | "facts">;

function ownedLines(owned: Owned): ContextLine[] {
  return present<ContextLine>([
    ...owned.levers.map(previousLine),
    owned.statChanges.length ? { label: L.statChanges, sub: owned.statChanges.map(statChangeLine) } : undefined,
    owned.milestones.length ? { label: L.milestones, sub: owned.milestones.map((m) => ({ text: m.text, sub: [{ label: L.forOutcome, text: m.question }] })) } : undefined,
    owned.newElements.length ? { label: L.newElements, sub: owned.newElements.map((e) => ({ text: e.role ? `${e.name}: ${e.role}` : e.name })) } : undefined,
    owned.introductions.length ? { label: L.introduced, sub: owned.introductions.map((i) => ({ text: i.name })) } : undefined,
    owned.facts.length ? { label: L.facts, sub: owned.facts.map((f) => ({ text: `${f.element}: ${f.fact}` })) } : undefined,
  ]);
}

/** A turn's changes: in one list for one player; for a group, the shared ones, then each player's with that player's previous choice. */
function changeLines(story: Story, reading: TurnReading): ContextLine[] {
  const dropped: ContextLine[] = reading.dropped.length ? [{ label: L.dropped, sub: reading.dropped.map((text) => ({ text })) }] : [];
  const whose = (owner: string): Owned => ({
    levers: reading.levers.filter((l) => l.slot === owner),
    statChanges: reading.statChanges.filter((c) => c.group === owner),
    milestones: reading.milestones.filter((m) => m.group === owner),
    newElements: reading.newElements.filter((e) => e.slot === owner),
    introductions: reading.introductions.filter((i) => i.slot === owner),
    facts: reading.facts.filter((f) => f.slot === owner),
  });
  const lines =
    reading.slots.length === 1
      ? [...ownedLines(reading), ...dropped]
      : present<ContextLine>([
          ...[ownedLines(whose("shared"))].filter((own) => own.length).map((own) => ({ label: L.shared, sub: own })),
          ...reading.slots.map((slot) => {
            const own = ownedLines(whose(slot));
            return own.length ? { label: L.forPlayer, text: story.getPlayer(slot)?.name || slot, sub: own } : undefined;
          }),
          ...dropped,
        ]);
  return lines.length ? lines : [{ label: L.noChanges }];
}

/** Each player's choice lines and the turn's change lines, for a reply; nothing for one that isn't an object. */
export function turnMechanics(story: Story, written: unknown): { choices: Record<string, ContextLine[]>; changes: ContextLine[]; reading: TurnReading } | undefined {
  if (!written || typeof written !== "object" || Array.isArray(written)) return undefined;
  const reading = readTurn(story, written as SetOfBeatGenerationSchema);
  const choices = Object.fromEntries(reading.slots.map((slot) => [slot, choiceLines(story, reading.reply, slot)]));
  return { choices, changes: changeLines(story, reading), reading };
}

/** A turn option with its mechanics: the choices under each beat that shows options (an ending shows none), the changes under the turn. */
export function withMechanics(content: TurnContent, story: Story, output: unknown): TurnContent {
  const mechanics = turnMechanics(story, output);
  if (!mechanics) return content;
  return {
    ...content,
    beats: content.beats.map((beat) => (beat.options.length ? { ...beat, mechanics: mechanics.choices[beat.slot] ?? [] } : beat)),
    changes: mechanics.changes,
  };
}

export type MechanicsTally = {
  turns: number;
  /** Turns' players whose previous choice was a sacrifice or reward */
  levers: number;
  leverStatus: Record<LeverStatus, number>;
  statChanges: number;
  /** Stat changes with at least one reason they don't fit their stat */
  unfitChanges: number;
  unfitByKind: Partial<Record<UnfitKind, number>>;
  turnsWithUnfit: number;
};

/** Previous levers by what the turn did with them, and stat changes that don't fit, over turns read. */
export function tallyTurns(readings: TurnReading[]): MechanicsTally {
  const leverStatus: Record<LeverStatus, number> = { applied: 0, notApplied: 0, otherWay: 0, noChange: 0, unnamed: 0 };
  const unfitByKind: Partial<Record<UnfitKind, number>> = {};
  let levers = 0;
  let statChanges = 0;
  let unfitChanges = 0;
  let turnsWithUnfit = 0;
  for (const reading of readings) {
    for (const lever of reading.levers) {
      levers++;
      leverStatus[lever.status]++;
    }
    statChanges += reading.statChanges.length;
    const unfit = reading.statChanges.filter((c) => c.unfit.length > 0);
    unfitChanges += unfit.length;
    if (unfit.length > 0) turnsWithUnfit++;
    for (const change of unfit) for (const { kind } of change.unfit) unfitByKind[kind] = (unfitByKind[kind] ?? 0) + 1;
  }
  return { turns: readings.length, levers, leverStatus, statChanges, unfitChanges, unfitByKind, turnsWithUnfit };
}

/** An arm's final usable single-player turns, each read on the story its call saw (a chain's turn on its own plan). */
export function turnReadingsFor(records: CallRecord[], cases: EvalCase[], load: (record: CallRecord) => unknown, arm: ArmRef): TurnReading[] {
  const byId = new Map(cases.map((c) => [c.id, c]));
  return records.flatMap((record) => {
    const evalCase = byId.get(record.caseId);
    const turn = record.role === "beat" && (record.group === "beat" || (record.group === "pipeline" && record.step === 2));
    if (!turn || record.promptState !== arm.promptState || record.armKey !== arm.armKey || record.players !== 1 || !record.jobFinal || !usable(record) || !evalCase?.state) return [];
    const output = load(record);
    if (!output || typeof output !== "object") return [];
    return [readTurn(beatInput(record, evalCase, records, load), output as SetOfBeatGenerationSchema)];
  });
}
