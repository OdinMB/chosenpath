import type { Story } from "core/models/Story.js";
import type { Beat, Change, PaidLever, PlayerSlot, Stat } from "core/types/index.js";
import type { Repair } from "./textRepairs.js";

/*
 * Sacrifices and rewards (levers): the stat a lever option draws on, which
 * lever a turn paid, and a lever charged twice. A lever is paid only through
 * the model's next reply (its stat changes), so the game keeps a record on
 * the beat whose turn paid it (Beat.paidLever, beatStep.apply) and the beat
 * repairs of the turn after read it. The playthroughs of 2026-09-30 (round 2)
 * charged 2 of 7 levers taken again on that turn: the paying turn narrates
 * the cost, and the next reply read it as still owed ("Jun spent 15% of his
 * reserve bracing the control ring", New Avalon turn 4, 45 → 30, a turn after
 * 60 → 45; "Bran used a Pantry Crumb as a wedge in the previous beat", the
 * mouse story's ending, 2 → 1).
 */

export type Lever = "sacrifice" | "reward";

type StatChange = Extract<Change, { type: "statChange" }>;

/** The story's stats by id, shared and per player. */
export type LeverStats = { sharedStats: Map<string, Stat>; playerStats: Map<string, Stat> };

export function leverStatsOf(story: Story): LeverStats {
  const state = story.getState();
  return {
    sharedStats: new Map(state.sharedStats.map((stat) => [stat.id, stat])),
    playerStats: new Map(state.playerStats.map((stat) => [stat.id, stat])),
  };
}

/** Whether a stat's lever rule allows this lever: its text, unless it says the stat has none. */
export function allowsLever(stat: Stat, kind: Lever): boolean {
  const rule = kind === "sacrifice" ? stat.optionsToSacrifice : stat.optionsToGainAsReward;
  return typeof rule === "string" && rule.trim() !== "" && !/^none\b/i.test(rule.trim());
}

/** Words shorter than this are too common to read as a stat's name or value in an option's text. */
const MIN_NAMED_LETTERS = 4;

/** The words that name a stat in an option's text: its name (an opposites stat's sides too), and a plural name without its "s". */
function statNameWords(stat: Stat): string[] {
  const names = [stat.name, ...(stat.type === "opposites" ? stat.name.split("|") : [])]
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name.length >= MIN_NAMED_LETTERS);
  return [...new Set(names.flatMap((name) => (name.length > MIN_NAMED_LETTERS && name.endsWith("s") ? [name, name.slice(0, -1)] : [name])))];
}

/** What a stat holds for this player (a shared stat's own value), as words an option's text can name: an item, a contact. */
function heldWords(story: Story, stat: Stat, slot: string, shared: boolean): string[] {
  const entries = shared ? story.getState().sharedStatValues : story.getPlayer(slot)?.statValues ?? [];
  const value = entries.find((entry) => entry.statId === stat.id)?.value;
  const values = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return values.map((held) => held.trim().toLowerCase()).filter((held) => held.length >= MIN_NAMED_LETTERS);
}

export type LeverStat = { stat: Stat; shared: boolean };

/**
 * The stat a sacrifice or reward option draws on. The option names none in
 * a field, only in its text (the schema asks it to), so this reads the text
 * as the eval's lever readings do: the stats it names; else those whose held
 * value it names ("Ivo Senn", an item of the crew's Dockside Favors); else
 * the one stat that allows this lever at all. Of those, the ones that allow
 * it, when any does; undefined unless exactly one is left.
 */
export function leverStatOf(story: Story, slot: string, kind: Lever, text: string, stats: LeverStats): LeverStat | undefined {
  const lower = text.toLowerCase();
  const all: LeverStat[] = [
    ...[...stats.sharedStats.values()].map((stat) => ({ stat, shared: true })),
    ...[...stats.playerStats.values()].map((stat) => ({ stat, shared: false })),
  ];
  const byName = all.filter(({ stat }) => statNameWords(stat).some((word) => lower.includes(word)));
  const byValue = byName.length > 0 ? byName : all.filter(({ stat, shared }) => heldWords(story, stat, slot, shared).some((word) => lower.includes(word)));
  const allowing = all.filter(({ stat }) => allowsLever(stat, kind));
  const candidates = byValue.length > 0 ? byValue : allowing.length === 1 ? allowing : [];
  const allowed = candidates.filter(({ stat }) => allowsLever(stat, kind));
  const pool = allowed.length > 0 ? allowed : candidates;
  return pool.length === 1 ? pool[0] : undefined;
}

type ChosenLever = { kind: Lever; stat: Stat; group: string };

/** The sacrifice or reward a player chose on this beat, where its text makes the stat clear: its kind, stat and the stat's group. */
function chosenLever(story: Story, slot: string, beat: Beat | null, stats: LeverStats): ChosenLever | undefined {
  const option = beat && beat.choice >= 0 ? beat.options?.[beat.choice] : undefined;
  const kind = option?.resourceType;
  if (kind !== "sacrifice" && kind !== "reward") return undefined;
  const lever = leverStatOf(story, slot, kind, typeof option?.text === "string" ? option.text : "", stats);
  return lever ? { kind, stat: lever.stat, group: lever.shared ? "shared" : slot } : undefined;
}

/** A lever of these stat types is read; a list's or a ladder's payment isn't a size a second charge could repeat. */
const PAID_TYPES: Stat["type"][] = ["percentage", "number"];

/** The values the stat changes move, each as the changes before it leave it (ChangeService's clamp included). */
class WorkingValues {
  private readonly values = new Map<string, unknown>();

  constructor(private readonly story: Story, private readonly stats: LeverStats) {}

  private definition(change: StatChange): Stat | undefined {
    return change.group === "shared" ? this.stats.sharedStats.get(change.stat) : this.stats.playerStats.get(change.stat);
  }

  private current(change: StatChange): unknown {
    const key = `${change.group}|${change.stat}`;
    if (this.values.has(key)) return this.values.get(key);
    const entries = change.group === "shared" ? this.story.getState().sharedStatValues : this.story.getPlayer(change.group)?.statValues ?? [];
    return entries.find((entry) => entry.statId === change.stat)?.value;
  }

  /** By how much the change moves a percentage or number stat: an addition or subtraction by its value, a value set by the difference; undefined for anything else. */
  step(change: StatChange): number | undefined {
    const type = this.definition(change)?.type;
    const before = this.current(change);
    if (!type || !PAID_TYPES.includes(type) || typeof before !== "number" || typeof change.value !== "number") return undefined;
    if (change.change === "addNumber") return change.value;
    if (change.change === "subtractNumber") return -change.value;
    if (change.change === "setNumber") return change.value - before;
    return undefined;
  }

  /** Applies a numeric change's step; a percentage stays within 0 to 100. */
  apply(change: StatChange, step: number | undefined): void {
    const before = this.current(change);
    if (step === undefined || typeof before !== "number") return;
    const after = before + step;
    this.values.set(`${change.group}|${change.stat}`, this.definition(change)?.type === "percentage" ? Math.max(0, Math.min(100, after)) : after);
  }
}

const isStatChange = (change: Change): change is StatChange => change.type === "statChange";

/**
 * The levers these stat changes pay, by the slot that chose them on the
 * story's current beat: a sacrifice paid by a change that lowers its stat, a
 * reward by one that raises it, the first such change in order, with the
 * step it made. Percentage and number stats only.
 */
export function paidLevers(story: Story, changes: Change[]): Record<string, PaidLever> {
  const stats = leverStatsOf(story);
  const paid: Record<string, PaidLever> = {};
  for (const slot of story.getPlayerSlots()) {
    const lever = chosenLever(story, slot, story.getCurrentBeat(slot as PlayerSlot), stats);
    if (!lever || !PAID_TYPES.includes(lever.stat.type)) continue;
    const working = new WorkingValues(story, stats);
    for (const change of changes.filter(isStatChange)) {
      const step = working.step(change);
      working.apply(change, step);
      const pays = step !== undefined && (lever.kind === "sacrifice" ? step < 0 : step > 0);
      if (pays && change.group === lever.group && change.stat === lever.stat.id) {
        paid[slot] = { kind: lever.kind, group: lever.group, stat: lever.stat.id, step };
        break;
      }
    }
  }
  return paid;
}

const leverKey = (lever: { kind: Lever; group: string; stat: string }) => `${lever.kind}|${lever.group}|${lever.stat}`;
const signed = (value: number) => (value > 0 ? `+${value}` : String(value));

/**
 * A lever charged again on the turn after the one that paid it: where a
 * player's last beat recorded that its turn paid a lever (Beat.paidLever),
 * the first change this turn that moves the same stat by the same step is
 * dropped (`leverChargedAgain`), one per payment. Kept: a charge that a
 * lever chosen on the last beat now owes (any player's, of the same kind on
 * the same stat), a change of another size or the other way, a late payment
 * (a last beat that recorded none), and every turn after. A change of the
 * same size the stat's own rules happen to ask for on that turn is dropped
 * too; the playthroughs saw none. Called after the stat changes are placed.
 */
export function dropLeversChargedAgain(story: Story, changes: Change[], repairs: Repair[]): Change[] {
  const stats = leverStatsOf(story);
  const beats = story.getPlayerSlots().map((slot) => ({ slot, beat: story.getCurrentBeat(slot as PlayerSlot) }));
  const owed = new Set(beats.flatMap(({ slot, beat }) => {
    const lever = chosenLever(story, slot, beat, stats);
    return lever ? [leverKey({ kind: lever.kind, group: lever.group, stat: lever.stat.id })] : [];
  }));
  const records = beats.flatMap(({ beat }) => (beat?.paidLever ? [beat.paidLever] : []));
  const pending = [...new Map(records.map((paid) => [`${leverKey(paid)}|${paid.step}`, paid])).values()].filter((paid) => !owed.has(leverKey(paid)));
  if (pending.length === 0) return changes;

  const working = new WorkingValues(story, stats);
  return changes.filter((change) => {
    if (!isStatChange(change)) return true;
    const step = working.step(change);
    const at = step === undefined ? -1 : pending.findIndex((paid) => paid.group === change.group && paid.stat === change.stat && paid.step === step);
    if (at < 0) {
      working.apply(change, step);
      return true;
    }
    const [paid] = pending.splice(at, 1);
    repairs.push({ kind: "leverChargedAgain", detail: `${paid.group}/${paid.stat}: ${signed(paid.step)}, the ${paid.kind} the previous turn paid` });
    return false;
  });
}
