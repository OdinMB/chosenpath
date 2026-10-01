import type { Story } from "core/models/Story.js";
import type { Beat, BeatGeneration, Change, PaidLever, PlayerSlot, SetOfBeatGenerationSchema, Stat } from "core/types/index.js";
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
 * mouse story's ending, 2 → 1). The third (2026-10-01) showed three more the
 * repair missed: a repeat two turns after the payment, a ladder stat's step,
 * and a charge in the reply that offers the lever, before it was chosen; the
 * first two are dropped since, the third noted. Four more went through on
 * list stats and a plural name (a second contact burned or added, a second
 * item added, "Supply" for "Gilded Comet Supplies"); since decision A of the
 * same day a list's item is a payment and a plural name reads in its singular.
 * Its review narrowed both: a singular form names its stat only as a word of
 * its own where no stat is named by its name, and a list's or a ladder's
 * payment is read later in the chapter only on a stat beats may not change.
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

/** A stat's names, lower-cased: its name, and an opposites stat's sides. */
function statNames(stat: Stat): string[] {
  return [stat.name, ...(stat.type === "opposites" ? stat.name.split("|") : [])].map((name) => name.trim().toLowerCase()).filter((name) => name.length >= MIN_NAMED_LETTERS);
}

/** The words that name a stat in an option's text, read anywhere in it: its names, and a plural name without its "s". */
function statNameWords(stat: Stat): string[] {
  const names = statNames(stat);
  return [...new Set([...names, ...names.flatMap((name) => (name.length > MIN_NAMED_LETTERS && name.endsWith("s") ? [name.slice(0, -1)] : []))])];
}

/**
 * A plural name's other singular forms, since decision A (2026-10-01): "-ies" as "-y", and "-ches", "-shes", "-sses",
 * "-xes", "-zes" without "es" (round 3's "gain 1 Gilded Comet Supply" names the stat "Gilded Comet Supplies", which
 * "Gilded Comet Supplie" didn't match). Read only as words of their own, four letters or more, and only where the text
 * names no stat by statNameWords (leverStatOf): read anywhere, "ability" (a stored setup's list "Abilities") was found
 * inside "City Stability", which the same setup held, and two stats named left the lever unread (the review of decision
 * A's fixes, the same day).
 */
function singularWords(stat: Stat): string[] {
  const named = statNameWords(stat);
  const forms = statNames(stat).flatMap((name) => [
    ...(name.endsWith("ies") ? [`${name.slice(0, -3)}y`] : []),
    ...(/(?:ch|sh|ss|x|z)es$/.test(name) ? [name.slice(0, -2)] : []),
  ]);
  return [...new Set(forms)].filter((form) => form.length >= MIN_NAMED_LETTERS && !named.includes(form));
}

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whether the text holds these words as words of their own ("ability", never inside "stability"). */
const holdsWord = (lower: string, words: string) => new RegExp(String.raw`(?<![a-z])${escaped(words)}(?![a-z])`).test(lower);

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
 * as the eval's lever readings do: the stats it names (statNameWords); else
 * those it names in another singular form, as a word of its own
 * (singularWords: "a new ability" for Abilities); else those whose held value
 * it names ("Ivo Senn", an item of the crew's Dockside Favors); else the one
 * stat that allows this lever at all. Of those, the ones that allow it, when
 * any does; undefined unless exactly one is left.
 */
export function leverStatOf(story: Story, slot: string, kind: Lever, text: string, stats: LeverStats): LeverStat | undefined {
  const lower = text.toLowerCase();
  const all: LeverStat[] = [
    ...[...stats.sharedStats.values()].map((stat) => ({ stat, shared: true })),
    ...[...stats.playerStats.values()].map((stat) => ({ stat, shared: false })),
  ];
  const byName = all.filter(({ stat }) => statNameWords(stat).some((word) => lower.includes(word)));
  const bySingular = byName.length > 0 ? byName : all.filter(({ stat }) => singularWords(stat).some((word) => holdsWord(lower, word)));
  const byValue = bySingular.length > 0 ? bySingular : all.filter(({ stat, shared }) => heldWords(story, stat, slot, shared).some((word) => lower.includes(word)));
  const allowing = all.filter(({ stat }) => allowsLever(stat, kind));
  const candidates = byValue.length > 0 ? byValue : allowing.length === 1 ? allowing : [];
  const allowed = candidates.filter(({ stat }) => allowsLever(stat, kind));
  const pool = allowed.length > 0 ? allowed : candidates;
  return pool.length === 1 ? pool[0] : undefined;
}

/*
 * The words that say which way a lever moves its stat. Those that can tell
 * what happens to the stat itself count on either side of it ("let Suspicion
 * rise", "a 10% increase in Heat", "increasing your Stress"); those that act
 * on it, or compare an amount of it, only before it ("spend 15% Reserve", "10%
 * more Heat"): after it they speak of something else ("10% harmony to gain a
 * boost", "credits toward stipends so more delegates can stay").
 */
const word = (words: string) => new RegExp(String.raw`(?<![a-z])(?:${words})(?![a-z])`, "g");
const DIRECTION_WORDS: { pattern: RegExp; direction: 1 | -1; after: boolean }[] = [
  { pattern: word(String.raw`ris(?:e|es|en|ing)|rose|grow(?:s|n|ing)?|grew|climb(?:s|ed|ing)?|increas(?:e|es|ed|ing)`), direction: 1, after: true },
  { pattern: word(String.raw`decreas(?:e|es|ed|ing)|drop(?:s|ped|ping)?|fall(?:s|en|ing)?|fell|eas(?:e|es|ed|ing)`), direction: -1, after: true },
  { pattern: word(String.raw`rais(?:e|es|ed|ing)|add(?:s|ed|ing)?|gain(?:s|ed|ing)?|regain(?:s|ed|ing)?|more|take on|takes on|taking on`), direction: 1, after: false },
  {
    pattern: word(String.raw`lower(?:s|ed|ing)?|reduc(?:e|es|ed|ing)|spend(?:s|ing)?|spent|los(?:e|es|ing)|lost|give up|gives up|giving up|burn(?:s|ed|t|ing)?|use(?:s|d)?|using|pay(?:s|ing)?|paid|less|fewer`),
    direction: -1,
    after: false,
  },
];
/** A signed amount: "+10%", "-15", "−1". */
const SIGNED_AMOUNTS: { pattern: RegExp; direction: 1 | -1 }[] = [
  { pattern: /\+\s*\d/g, direction: 1 },
  { pattern: /(?<![^\s(])[-−]\s*\d/g, direction: -1 },
];
/** A word at most this many words from the stat's name speaks of the stat: "increasing your Stress Level", "let the guards' Suspicion rise". */
const NAME_REACH = 2;
/** Or at most this many words from an unsigned amount: "spend 15% of your Reserve", "can increase by 10%". */
const AMOUNT_REACH = 1;
/** A signed amount speaks of the stat only right beside its name: "(+10% Suspicion)", "+20% in Family Pressure", "Suspicion +10". */
const SIGN_REACH_BEFORE = 1;

/**
 * The words a stat is named by in a lever's text or rule, once the stat is known: its names and singular forms, and each
 * word of four letters or more in them ("stability" for Timeline Stability).
 */
function mentionWords(stat: Stat): string[] {
  const names = [...statNameWords(stat), ...singularWords(stat)];
  const parts = names.flatMap((name) => name.split(/\s+/)).filter((part) => part.length >= MIN_NAMED_LETTERS);
  return [...new Set([...names, ...parts])];
}

/**
 * The way the words of a lever's text that speak of its stat move it: 1 up,
 * -1 down; undefined when they say neither or both. Such a word sits near the
 * stat's name (NAME_REACH) or an amount (AMOUNT_REACH), before it, or on either
 * side for a word that can tell what happens to the stat itself; a signed
 * amount sits right beside the name. A word inside the stat's own name doesn't
 * count ("Rising Panic").
 */
function saidOfStat(text: string | undefined, stat: Stat): 1 | -1 | undefined {
  if (typeof text !== "string") return undefined;
  const lower = text.toLowerCase();
  const spanOf = (match: RegExpMatchArray) => ({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length });
  const words = [...lower.matchAll(/\S+/g)].map((match) => ({ ...spanOf(match), text: match[0] }));
  const wordAt = (at: number) => words.findIndex((w) => at < w.end);
  const names = mentionWords(stat).flatMap((name) => [...lower.matchAll(new RegExp(String.raw`(?<![a-z])${escaped(name)}(?:e?s)?(?![a-z])`, "g"))].map(spanOf));
  // Where the stat's name and the unsigned amounts sit, in words
  const nameAt = names.map((name) => ({ first: wordAt(name.start), last: wordAt(name.end - 1) }));
  const amountAt = words.flatMap((w, at) => (/\d/.test(w.text) && !/^[([]?[+\-−]/.test(w.text) ? [{ first: at, last: at }] : []));
  /** Whether word `at` is the span's, or sits at most `before` words before it, or, when `after` is given, at most that many after it. */
  const near = (at: number, span: { first: number; last: number }, before: number, after?: number) =>
    at < span.first ? span.first - at - 1 <= before : at <= span.last || (after !== undefined && at - span.last - 1 <= after);

  const said = new Set<1 | -1>();
  for (const { pattern, direction, after } of DIRECTION_WORDS) {
    for (const match of lower.matchAll(pattern)) {
      const { start, end } = spanOf(match);
      if (names.some((name) => start < name.end && end > name.start)) continue;
      const at = wordAt(start);
      const nearName = nameAt.some((span) => near(at, span, NAME_REACH, after ? NAME_REACH : undefined));
      const nearAmount = amountAt.some((span) => near(at, span, AMOUNT_REACH, after ? AMOUNT_REACH : undefined));
      if (nearName || nearAmount) said.add(direction);
    }
  }
  for (const { pattern, direction } of SIGNED_AMOUNTS) {
    for (const match of lower.matchAll(pattern)) {
      if (nameAt.some((span) => near(wordAt(spanOf(match).start), span, SIGN_REACH_BEFORE, 0))) said.add(direction);
    }
  }
  return said.size === 1 ? [...said][0] : undefined;
}

/**
 * Which way a lever moves its stat: as the chosen option's words about the
 * stat say, else as the stat's own lever rule for that kind says, else a
 * sacrifice down and a reward up. Since the lever-direction adoption
 * (2026-10-01) a setup writes the sacrifice of a stat where more is worse as a
 * rise ("Let Suspicion rise 10% to slip past the guards") and its reward as a
 * fall ("Lower Suspicion 10% by lying low"), so a lever's direction can't be
 * read from its kind alone. Only words that speak of the stat count
 * (saidOfStat): an option describes an action, and read whole, "greatly
 * increasing disruption" or a rule's "+30 bonus" turned an ordinary stat's
 * sacrifice into a rise, so its correct payment went unrecorded.
 */
export function leverDirection(stat: Stat, kind: Lever, optionText: string): 1 | -1 {
  const rule = kind === "sacrifice" ? stat.optionsToSacrifice : stat.optionsToGainAsReward;
  return saidOfStat(optionText, stat) ?? saidOfStat(rule, stat) ?? (kind === "sacrifice" ? -1 : 1);
}

type ChosenLever = { kind: Lever; stat: Stat; group: string; direction: 1 | -1 };

/** The sacrifice or reward a player chose on this beat, where its text makes the stat clear: its kind, stat, the stat's group and the way it moves the stat. */
function chosenLever(story: Story, slot: string, beat: Beat | null, stats: LeverStats): ChosenLever | undefined {
  const option = beat && beat.choice >= 0 ? beat.options?.[beat.choice] : undefined;
  const kind = option?.resourceType;
  if (kind !== "sacrifice" && kind !== "reward") return undefined;
  const text = typeof option?.text === "string" ? option.text : "";
  const lever = leverStatOf(story, slot, kind, text, stats);
  return lever ? { kind, stat: lever.stat, group: lever.shared ? "shared" : slot, direction: leverDirection(lever.stat, kind, text) } : undefined;
}

/** A lever of these stat types is read by its size; a ladder's by its rungs (ladderOf) and a list's by its item (readsPayment). */
const PAID_TYPES: Stat["type"][] = ["percentage", "number"];

/**
 * A string stat's steps, lowest first, where its possible values list two or
 * more ("Unproven, Known Hand, Feared Name"; "Novice → Amateur → Professional",
 * the setup examples' form), lower-cased; undefined for any other stat.
 */
export function ladderOf(stat: Stat): string[] | undefined {
  if (stat.type !== "string") return undefined;
  const steps = (stat.possibleValues ?? "")
    .split(/\s*(?:→|->|,|;)\s*/)
    .map((step) => step.trim().toLowerCase())
    .filter((step) => step.length > 0);
  return new Set(steps).size >= 2 ? steps : undefined;
}

/**
 * Whether a lever on this stat has a payment the repair can read: a percentage or number stat's change, a ladder's step
 * (since the review of the third playthroughs, 2026-10-01), or a list's item removed or added (since decision A of the same
 * day: one item a payment).
 */
const readsPayment = (stat: Stat) => PAID_TYPES.includes(stat.type) || stat.type === "string[]" || ladderOf(stat) !== undefined;

const keyOf = (change: StatChange) => `${change.group}|${change.stat}`;
const isStatChange = (change: Change): change is StatChange => change.type === "statChange";

/** The values the stat changes move, each as the changes before it leave it (ChangeService's clamp included). */
class WorkingValues {
  private readonly values = new Map<string, unknown>();
  /** The lists the changes both remove an item from and add one to: a replacement, which moves no count */
  private readonly replaced: Set<string>;

  constructor(
    private readonly story: Story,
    private readonly stats: LeverStats,
    changes: Change[]
  ) {
    const statChanges = changes.filter(isStatChange);
    const removed = new Set(statChanges.filter((c) => c.change === "removeElement").map(keyOf));
    this.replaced = new Set(statChanges.filter((c) => c.change === "addElement" && removed.has(keyOf(c))).map(keyOf));
  }

  private definition(change: StatChange): Stat | undefined {
    return change.group === "shared" ? this.stats.sharedStats.get(change.stat) : this.stats.playerStats.get(change.stat);
  }

  private current(change: StatChange): unknown {
    const key = keyOf(change);
    if (this.values.has(key)) return this.values.get(key);
    const entries = change.group === "shared" ? this.story.getState().sharedStatValues : this.story.getPlayer(change.group)?.statValues ?? [];
    return entries.find((entry) => entry.statId === change.stat)?.value;
  }

  /**
   * A list's change, as one item: +1 for an item added that it doesn't hold, -1 for one removed that it holds (as
   * ChangeService applies them, by the exact text); undefined for anything that changes nothing, and for a list the
   * changes both remove from and add to (a replacement: "apply both a removeElement and addElement change").
   */
  private listStep(change: StatChange): number | undefined {
    if (this.replaced.has(keyOf(change)) || typeof change.value !== "string") return undefined;
    const before = this.current(change);
    const held = Array.isArray(before) ? (before as unknown[]) : [];
    if (change.change === "addElement") return held.includes(change.value) ? undefined : 1;
    if (change.change === "removeElement") return held.includes(change.value) ? -1 : undefined;
    return undefined;
  }

  /**
   * By how much the change moves a percentage or number stat: an addition or subtraction by its value, a value set by the
   * difference; a ladder's value set, by the steps between its values (both on the ladder); a list's, by the item
   * (listStep); undefined for anything else.
   */
  step(change: StatChange): number | undefined {
    const definition = this.definition(change);
    if (definition?.type === "string[]") return this.listStep(change);
    const before = this.current(change);
    const ladder = definition ? ladderOf(definition) : undefined;
    if (ladder) {
      if (change.change !== "setString" || typeof before !== "string" || typeof change.value !== "string") return undefined;
      const [from, to] = [ladder.indexOf(before.trim().toLowerCase()), ladder.indexOf(change.value.trim().toLowerCase())];
      return from < 0 || to < 0 ? undefined : to - from;
    }
    if (!definition || !PAID_TYPES.includes(definition.type) || typeof before !== "number" || typeof change.value !== "number") return undefined;
    if (change.change === "addNumber") return change.value;
    if (change.change === "subtractNumber") return -change.value;
    if (change.change === "setNumber") return change.value - before;
    return undefined;
  }

  /** Applies a change's step: a number by its step (a percentage stays within 0 to 100), a ladder's value as set, a list's item added or removed. */
  apply(change: StatChange, step: number | undefined): void {
    const before = this.current(change);
    const key = keyOf(change);
    if (this.definition(change)?.type === "string[]") {
      const held = Array.isArray(before) ? (before as unknown[]) : [];
      if (change.change === "addElement" && !held.includes(change.value)) this.values.set(key, [...held, change.value]);
      if (change.change === "removeElement") this.values.set(key, held.filter((item) => item !== change.value));
      return;
    }
    if (step === undefined) return;
    if (typeof before === "string") {
      this.values.set(key, change.value);
      return;
    }
    if (typeof before !== "number") return;
    const after = before + step;
    this.values.set(key, this.definition(change)?.type === "percentage" ? Math.max(0, Math.min(100, after)) : after);
  }
}

/**
 * The levers these stat changes pay, by the slot that chose them on the
 * story's current beat: the first change in order that moves the lever's stat
 * the lever's way (leverDirection: a sacrifice down and a reward up unless its
 * words about the stat say otherwise, as on a stat where more is worse), with the step it
 * made. Percentage and number stats, and since the review of the third playthroughs
 * (2026-10-01) a ladder's step (ladderOf: up its possible values for a reward unless its
 * words say otherwise, +1 for Unproven → Known Hand), and since decision A of the same
 * day a list's item (-1 for a contact burned, +1 for an item added; no replacement).
 */
export function paidLevers(story: Story, changes: Change[]): Record<string, PaidLever> {
  const stats = leverStatsOf(story);
  const paid: Record<string, PaidLever> = {};
  for (const slot of story.getPlayerSlots()) {
    const lever = chosenLever(story, slot, story.getCurrentBeat(slot as PlayerSlot), stats);
    if (!lever || !readsPayment(lever.stat)) continue;
    const working = new WorkingValues(story, stats, changes);
    for (const change of changes.filter(isStatChange)) {
      const step = working.step(change);
      working.apply(change, step);
      const pays = step !== undefined && Math.sign(step) === lever.direction;
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

/** A payment a repeat this turn would charge again, and the turn that paid it; `last` where that turn is the one just played. */
type Payment = { paid: PaidLever; turn: number; last: boolean };

/**
 * The payments the players' beats recorded that a repeat this turn would
 * charge again: the last beat's, on any turn, and, where this turn is a later
 * step of a chapter, those of the chapter's earlier steps (its first beat up to
 * the one before last).
 */
function paymentsBefore(story: Story): Payment[] {
  const written = story.getCurrentTurn();
  const chapter = story.getCurrentBeatType() === "thread" ? story.getCurrentThreadAnalysis() : null;
  const from = chapter ? Math.min(chapter.firstBeatIndex, written - 1) : written - 1;
  return story.getPlayerSlots().flatMap((slot) => {
    const beats = story.getPlayer(slot)?.beatHistory ?? [];
    return beats.flatMap((beat, index): Payment[] =>
      index >= Math.max(0, from) && index < written && beat.paidLever ? [{ paid: beat.paidLever, turn: index + 1, last: index === written - 1 }] : []
    );
  });
}

/**
 * A lever charged again after the turn that paid it: where a player's beat
 * recorded that its turn paid a lever (Beat.paidLever), the first change this
 * turn that moves the same stat by the same step is dropped
 * (`leverChargedAgain`), one per payment and turn. The payments read are the
 * last beat's, on any turn (the review of the second playthroughs,
 * 2026-09-30), and since the review of the third (2026-10-01) those of the
 * chapter's earlier steps on a later step of the same chapter: the estate
 * agents' Composure, paid at turn 23, its repeat dropped at 24, was charged
 * once more at 25, 45 → 35 ("your fingers tighten briefly"). A ladder's step
 * counts as a percentage's does (ladderOf: the space pirates' Pirate
 * Reputation, Known Hand → Feared Name a turn after the reward's Unproven →
 * Known Hand), and so does a list's item, with one exception: on a later step
 * of the chapter, a list's or a ladder's payment is read only where the
 * stat's rules keep a beat from changing it (canBeChangedInBeatResolutions
 * false; the review of decision A's fixes, 2026-10-01). Its step is one item
 * or one rung, which every story move on such a stat shares, so a contact the
 * story adds later in the chapter would go as a repeat; the stored repeats on
 * lists and ladders all came on the turn after the payment. Kept: a charge
 * that a lever chosen on the last beat now owes (any player's, of the same
 * kind on the same stat), a change of another size or the other way, a late
 * payment (a last beat that recorded none), a switch turn or ending's change
 * on an earlier step's payment (it applies the stats' adjustments after
 * threads), and every turn after the chapter. A change of the same size the
 * stat's own rules happen to ask for on such a turn is dropped too (on a list
 * or a ladder, any item or rung the turn after the payment); the stored
 * playthroughs show none (`playthroughReplay.test.ts`). Called after the stat
 * changes are placed.
 */
export function dropLeversChargedAgain(story: Story, changes: Change[], repairs: Repair[]): Change[] {
  const stats = leverStatsOf(story);
  const owed = owedLevers(story, stats);
  const records = paymentsBefore(story).filter(({ paid, last }) => !owed.has(leverKey(paid)) && (last || readLaterInChapter(stats, paid)));
  const pending = [...new Map(records.map((payment) => [`${leverKey(payment.paid)}|${payment.paid.step}|${payment.turn}`, payment])).values()];
  if (pending.length === 0) return changes;

  const working = new WorkingValues(story, stats, changes);
  return changes.filter((change) => {
    if (!isStatChange(change)) return true;
    const step = working.step(change);
    const at = step === undefined ? -1 : pending.findIndex(({ paid }) => paid.group === change.group && paid.stat === change.stat && paid.step === step);
    if (at < 0) {
      working.apply(change, step);
      return true;
    }
    const [{ paid, turn, last }] = pending.splice(at, 1);
    const when = last ? "the previous turn paid" : `turn ${turn} paid, earlier in this chapter`;
    repairs.push({ kind: "leverChargedAgain", detail: `${paid.group}/${paid.stat}: ${signed(paid.step)}, the ${paid.kind} ${when}` });
    return false;
  });
}

/**
 * Whether a payment is read on a later step of its chapter: a percentage's or a number's, whose step size tells a repeat
 * from most story moves; a list's or a ladder's only where the stat's rules keep a beat from changing it.
 */
function readLaterInChapter(stats: LeverStats, paid: PaidLever): boolean {
  const stat = paid.group === "shared" ? stats.sharedStats.get(paid.stat) : stats.playerStats.get(paid.stat);
  if (!stat || (stat.type !== "string[]" && ladderOf(stat) === undefined)) return true;
  return stat.canBeChangedInBeatResolutions === false;
}

/** The levers chosen on the last beat, by kind, group and stat: their payment is due this turn. */
function owedLevers(story: Story, stats: LeverStats): Set<string> {
  return new Set(
    story.getPlayerSlots().flatMap((slot) => {
      const lever = chosenLever(story, slot, story.getCurrentBeat(slot as PlayerSlot), stats);
      return lever ? [leverKey({ kind: lever.kind, group: lever.group, stat: lever.stat.id })] : [];
    })
  );
}

/** The amount a lever's text names ("Spend 10% Nerve" is 10), where it names one number. */
function amountNamed(text: string): number | undefined {
  const amounts = [...text.matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
  return amounts.length === 1 ? amounts[0] : undefined;
}

/**
 * A lever's stat moved its way in the very reply that offers that lever
 * (`leverChargedOnOffer`, a note; the change is kept), since the review of
 * the third playthroughs (2026-10-01): the space pirates' Davi lost 10% Nerve
 * (50 → 40) in turn 19's own reply, which offered "Spend 10% Nerve to hold
 * your ground" after an exploration pick with no lever; he took it, and turn
 * 20 charged it (40 → 30), so one sacrifice cost him twice. Such a change
 * can't be told apart from a story event the stat's rules allow, so it is
 * only noted, for the log and the eval. Read on the levers offered (a stat the
 * payment repair reads, its stat as leverStatOf reads it) where the change
 * goes the lever's way (leverDirection), by the amount the option's text names
 * where it names one, and no lever chosen on the last beat owes it. One note
 * per player and stat. Called on the repaired reply, after the repeats are dropped.
 */
export function noteLeversChargedOnOffer(story: Story, reply: SetOfBeatGenerationSchema, changes: Change[], repairs: Repair[]): void {
  const stats = leverStatsOf(story);
  const owed = owedLevers(story, stats);
  const working = new WorkingValues(story, stats, changes);
  const moves = changes.filter(isStatChange).map((change) => {
    const step = working.step(change);
    working.apply(change, step);
    return { change, step };
  });
  for (const slot of story.getPlayerSlots()) {
    const beat = reply[slot as `player${number}`] as BeatGeneration | undefined;
    const noted = new Set<string>();
    for (const option of Array.isArray(beat?.options) ? beat.options : []) {
      const kind = option?.resourceType;
      if (kind !== "sacrifice" && kind !== "reward") continue;
      const text = typeof option.text === "string" ? option.text : "";
      const lever = leverStatOf(story, slot, kind, text, stats);
      if (!lever || !readsPayment(lever.stat)) continue;
      const group = lever.shared ? "shared" : slot;
      if (owed.has(leverKey({ kind, group, stat: lever.stat.id })) || noted.has(lever.stat.id)) continue;
      const direction = leverDirection(lever.stat, kind, text);
      // A ladder's and a list's payment is a step or an item, whatever number the text names
      const amount = ladderOf(lever.stat) || lever.stat.type === "string[]" ? undefined : amountNamed(text);
      const move = moves.find(({ change, step }) => change.group === group && change.stat === lever.stat.id && step !== undefined && Math.sign(step) === direction && (amount === undefined || Math.abs(step) === amount));
      if (!move?.step) continue;
      noted.add(lever.stat.id);
      repairs.push({ kind: "leverChargedOnOffer", note: true, detail: `${group}/${lever.stat.id}: ${signed(move.step)}, in the reply that offers that ${kind}` });
    }
  }
}
