import { GameModes, type StatValueEntry } from "core/types/index.js";
import { sha256 } from "./executor.js";
import type { HandVerdict } from "./judgedChecks.js";
import { playStory, playthroughSetupInput, type PlayCall, type PlayResult, type PlayRun, type PlayTurn, type PlaythroughSpec } from "./playthroughs.js";
import { rateMove, type RateMove, type Tally } from "./stopRule.js";
import type { SetupInput, VariantId } from "./variants.js";

/*
 * The money-2 stage (decision A's money fix, 2026-10-02): money that moves in
 * a learning story. The third playthroughs' lemonade stand never sold a cup,
 * and its cash never moved: its setup typed Stand Cash as a percentage, so no
 * sum had anywhere to land and the prose named none. The stage measures the
 * setup rule (moneySetup, storyTextRounds/moneySetup.ts) beside production's
 * setup, twice on learning premises, and plays each lemonade setup on as the
 * game plays it, production's planners and turns, through its first chapter:
 * whether the money the story pays and earns then moves the stat that counts it
 * (and so whether fix 7's turn line is still needed).
 *
 * Each run is a short playthrough (playthroughs.ts) whose setup is its arm's
 * (setupVariant) and whose planners and turns are production's, on the story as
 * the game records one from the learn-something form (the setup input's
 * learning flag); each arm's runs have their own ids, so their calls and dice
 * never mix. The readings: each setup's counted stats (money and other counted
 * things, by their names, and every number stat), the figures it would have
 * worked out (a margin, a ratio, an average, a price per item), deterministic
 * flags beside a blind hand reading by code, and each played turn's counted
 * stats before and after, its changes on them and the sentences of its text
 * that name an amount, for the hand reading of whether its money adds up. No
 * call is made here.
 */

export const MONEY_2_SETUP_VARIANTS = ["adopted", "moneySetup"] as const satisfies readonly VariantId[];
export type Money2Variant = (typeof MONEY_2_SETUP_VARIANTS)[number];

/** A premise of the stage: its playthrough spec, the turns each run plays after its setup, and whether its premise is about money or counted things (false: the control). */
export type Money2Spec = { spec: PlaythroughSpec; turns: number; counts: boolean };

const SUGGESTIONS = "(client/src/page/data/suggestionData.ts)";

/**
 * The learning premises: the lemonade stand where the defect happened (its frozen premise, at the playthroughs' 10
 * turns, played for its first chapter: the opening, the chapter's steps and the switch turn after it), three of the
 * site's other learn-something suggestions about money or counted things (a campaign's budget and votes, wolves and
 * deer, a shared business's costs; one and two players), and peer review, a learning premise about neither, the control.
 */
export const MONEY_2_SPECS: Money2Spec[] = [
  {
    spec: { id: "money2-lemonade", premiseId: "setup-learn-lemonade", maxTurns: 10, tests: "the lemonade stand (budget allocation and profit margins, middle school), as the playthroughs played it, through its first chapter" },
    turns: 5,
    counts: true,
  },
  {
    spec: {
      id: "money2-president",
      premise: {
        text: "I'm running for student body president, learning about organizing rallies, voter outreach, and making budget allocation decisions...",
        playerCount: 1,
        gameMode: GameModes.SinglePlayer,
        source: `the site's suggestions, learn-something, singlePlayer #4 ${SUGGESTIONS}`,
        category: "learn-something",
        fields: { learningGoals: "Campaign dynamics", targetAudience: "high school civics students" },
      },
      maxTurns: 25,
      tests: "a campaign's budget and votes (one player)",
    },
    turns: 0,
    counts: true,
  },
  {
    spec: {
      id: "money2-ranger",
      premise: {
        text: "I'm a park ranger tracking wolf and deer populations to understand ecosystem balance and the effects of weather patterns on wildlife...",
        playerCount: 1,
        gameMode: GameModes.SinglePlayer,
        source: `the site's suggestions, learn-something, singlePlayer #3 ${SUGGESTIONS}`,
        category: "learn-something",
        fields: { learningGoals: "Predator-prey relationships", targetAudience: "high school environmental science students" },
      },
      maxTurns: 25,
      tests: "counted animals and no money (one player)",
    },
    turns: 0,
    counts: true,
  },
  {
    spec: {
      id: "money2-eco-business",
      premise: {
        text: "We're starting an eco-friendly business together, collaborating on market research, cost analysis, and ethical sourcing decisions...",
        playerCount: 2,
        gameMode: GameModes.Cooperative,
        source: `the site's suggestions, learn-something, cooperative #1 ${SUGGESTIONS}`,
        category: "learn-something",
        fields: { learningGoals: "Market research and ethical sourcing", targetAudience: "high school business students" },
      },
      maxTurns: 25,
      tests: "a shared business's money (two players, cooperative)",
    },
    turns: 0,
    counts: true,
  },
  {
    spec: { id: "money2-peer-review", premiseId: "setup-learn-peer-review", maxTurns: 25, tests: "the control: a learning premise about neither money nor counted things (two players, cooperative-competitive)" },
    turns: 0,
    counts: false,
  },
];

/** A premise's run on an arm: its own id, so the arms' calls and dice never mix. */
export const money2RunSpec = (spec: PlaythroughSpec, variant: VariantId): PlaythroughSpec => ({ ...spec, id: `${spec.id}-${variant}` });

/** A premise's setup input, as the game sets up a story from the learn-something form. */
export const money2SetupInput = (spec: PlaythroughSpec): SetupInput => ({ ...playthroughSetupInput(spec), learning: true });

/** A run's premise and arm, read back from its id. */
export function runArmOf(run: Pick<PlayRun, "spec">): { premise: string; variant: Money2Variant } {
  const variant = MONEY_2_SETUP_VARIANTS.find((v) => run.spec.id.endsWith(`-${v}`));
  if (!variant) throw new Error(`${run.spec.id} is no run of the money-2 stage`);
  return { premise: run.spec.id.slice(0, -(variant.length + 1)), variant };
}

const specOf = (premise: string) => MONEY_2_SPECS.find((s) => s.spec.id === premise);

/** One run: the arm's setup, then production's planners and turns for the premise's turns (fewer where a smoke asks), the player pressing Try again once as round 3 did. */
export function playMoney2(entry: Money2Spec, variant: Money2Variant, call: PlayCall, sample: number, turnLimit?: number): Promise<PlayResult> {
  const turns = turnLimit === undefined ? entry.turns : Math.min(entry.turns, turnLimit);
  return playStory(money2RunSpec(entry.spec, variant), money2SetupInput(entry.spec), call, { sample, setupVariant: variant, turnLimit: turns, tryAgain: 1 });
}

// ---------------------------------------------------------------- the setup's stats

export type Money2Stat = {
  group: "shared" | "player";
  id: string;
  name: string;
  type: string;
  initial: unknown;
  adjustable: boolean;
  sacrifice: string;
  reward: string;
  adjustments: string[];
  effects: string[];
  implications: string[];
  tooltip: string;
};

/** Money by its name (setupDesignChecks' moneyIsNumber, with revenue and capital). */
const MONEY = /\b(cash(box)?|money|coins?|budget|funds?|dollars?|euros?|pennies|cents|savings|wallet|purse|treasury|credits|gold|profits?|revenue|capital)\b/i;
/** Other counted things by their names. */
const COUNTED = /\b(stock|inventory|supplies|supply|cups?|bottles?|batches|units|crates?|populations?|count|tally|votes?|voters|members|volunteers|signatures|pledges|customers|animals|herd|pack|wolves|deer|ore|tons?)\b/i;
/** A name for how good or how likely, not how many ("Supply Access", "Demand", "Population Health"). */
const QUALITY = /\b(access|reliability|outlook|demand|trust|confidence|morale|mood|health|pressure|level|quality|reputation|standing|balance|stability)\b/i;
/** A share or a figure worked out from others ("Profit Margin", "Price per Cup", "Average Sale"). */
const WORKED_OUT = /\b(margin|ratio|average|per)\b/i;
const SHARE = /\b(margin|rate|ratio|share|percent(age)?|average|per)\b/i;

const text = (value: unknown) => (typeof value === "string" ? value : "");
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);
const objects = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter((v): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v)) : [];

/** A setup reply's stats, shared then a player's. */
export function statsOfSetup(reply: unknown): Money2Stat[] {
  const r = (reply ?? {}) as Record<string, unknown>;
  const row = (group: "shared" | "player") => (s: Record<string, unknown>): Money2Stat => ({
    group,
    id: text(s.id),
    name: text(s.name),
    type: text(s.type),
    initial: s.initialValue,
    adjustable: s.canBeChangedInBeatResolutions === true,
    sacrifice: text(s.optionsToSacrifice),
    reward: text(s.optionsToGainAsReward),
    adjustments: strings(s.adjustmentsAfterThreads),
    effects: strings(s.effectOnPoints),
    implications: strings(s.narrativeImplications),
    tooltip: text(s.tooltip),
  });
  return [...objects(r.sharedStats).map(row("shared")), ...objects(r.playerStats).map(row("player"))];
}

/** A counted stat: money or another counted thing by its name, not a share or a quality, or any number stat; never a scoreboard (opposites). */
export const isCounted = (s: Money2Stat): boolean =>
  s.type !== "opposites" && (s.type === "number" || ((MONEY.test(s.name) || COUNTED.test(s.name)) && !SHARE.test(s.name) && !QUALITY.test(s.name)));
const isMoney = (s: Money2Stat) => s.type !== "opposites" && MONEY.test(s.name) && !SHARE.test(s.name) && !QUALITY.test(s.name);
/** A figure the story would work out from others, kept as a stat of its own. */
export const isWorkedOut = (s: Money2Stat): boolean => s.type !== "opposites" && WORKED_OUT.test(s.name);

const RESULT_WORDS = /\b(favou?rable|unfavou?rable|mixed|wins?|loss|success|failure)\b/i;
const NONE = /^\s*none\b/i;
/** An adjustment after threads that names a fixed amount for how a thread went ("+10% after a favorable thread"). */
const fixedStep = (adjustment: string) => RESULT_WORDS.test(adjustment) && /\d/.test(adjustment);
const lever = (value: string) => (NONE.test(value) ? undefined : value);

/** A payment put off to a thread's end, where the setup says so (a story element's instructions, a rule, a switch or thread instruction). */
const DEFERRAL = /\b(only )?(when|until|once|after|at the end of) (the|a|each|this) (thread|chapter)( (resolves|ends|is resolved|is over))?\b/i;
const MONEY_ACT = /\b(purchas\w*|pay\w*|sales?|sells?|sold|spend\w*|spent|costs?|earn\w*|income|price\w*)\b/i;
const putsOff = (line: string) => DEFERRAL.test(line) && (MONEY_ACT.test(line) || MONEY.test(line) || COUNTED.test(line));

export type Money2Flags = {
  /** Every stat named for money is a number; undefined where none is */
  moneyAsNumber?: boolean;
  /** Every counted stat is a number; undefined where none is */
  countedAsNumber?: boolean;
  /** No counted stat's sacrifice or reward is in percent */
  leversInUnits?: boolean;
  /** No counted stat's adjustment after threads names a fixed amount for how a thread went */
  noFixedSteps?: boolean;
  /** No figure worked out from others kept as a stat */
  noWorkedOut: boolean;
  /** Every counted stat is adjustable anytime */
  adjustable?: boolean;
};

export type Money2SetupReading = {
  run: string;
  premise: string;
  variant: Money2Variant;
  sample: number;
  counts: boolean;
  stats: Money2Stat[];
  counted: Money2Stat[];
  workedOut: Money2Stat[];
  flags: Money2Flags;
  deferrals: string[];
  checksFailed: string[];
  /** The setup calls: a fresh sample asked where production asks once more (an unstartable setup, one name three times) */
  setupCalls: number;
  latencyMs: number;
  costUsd: number;
  reasoningTokens: number;
};

const all = <T>(items: T[], test: (item: T) => boolean): boolean | undefined => (items.length === 0 ? undefined : items.every(test));

/** A run's setup read: its counted and worked-out stats, the deterministic flags, payments put off, the setup checks that failed, and the setup's calls. */
export function readMoney2Setup(run: PlayRun): Money2SetupReading {
  const { premise, variant } = runArmOf(run);
  const reply = run.setup?.output;
  const stats = statsOfSetup(reply);
  const counted = stats.filter(isCounted);
  const workedOut = stats.filter(isWorkedOut);
  const r = (reply ?? {}) as Record<string, unknown>;
  const guidelines = (r.guidelines ?? {}) as Record<string, unknown>;
  const lines = [
    ...objects(r.storyElements).map((e) => `${text(e.name)}: ${text(e.instructions)}`),
    ...strings(guidelines.rules).map((rule) => `Rule: ${rule}`),
    ...strings(guidelines.switchAndThreadInstructions).map((rule) => `Switch/thread instruction: ${rule}`),
  ];
  const calls = run.setup?.calls ?? [];
  const sends = calls.flatMap((c) => c.sends);
  return {
    run: `${run.spec.id}-s${run.sample}`,
    premise,
    variant,
    sample: run.sample,
    counts: specOf(premise)?.counts ?? true,
    stats,
    counted,
    workedOut,
    flags: {
      ...(all(stats.filter(isMoney), (s) => s.type === "number") !== undefined ? { moneyAsNumber: all(stats.filter(isMoney), (s) => s.type === "number") } : {}),
      ...(counted.length ? { countedAsNumber: all(counted, (s) => s.type === "number") } : {}),
      ...(counted.length ? { leversInUnits: all(counted, (s) => [lever(s.sacrifice), lever(s.reward)].every((l) => l === undefined || !l.includes("%"))) } : {}),
      ...(counted.length ? { noFixedSteps: all(counted, (s) => !s.adjustments.some(fixedStep)) } : {}),
      noWorkedOut: workedOut.length === 0,
      ...(counted.length ? { adjustable: all(counted, (s) => s.adjustable) } : {}),
    },
    deferrals: lines.filter(putsOff),
    checksFailed: Object.entries(run.setup?.checks?.checks ?? {})
      .filter(([, ok]) => !ok)
      .map(([name]) => name),
    setupCalls: calls.length,
    latencyMs: calls.reduce((sum, c) => sum + c.latencyMs, 0),
    costUsd: calls.reduce((sum, c) => sum + c.costUsd, 0),
    reasoningTokens: sends.reduce((sum, s) => sum + s.reasoningTokens, 0),
  };
}

// ---------------------------------------------------------------- the played turns

const NUMBER_WORDS = /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|hundred|dozen|half|quarter)\b/i;
/** A sentence that names an amount: a digit, a currency sign or a number word. */
const namesAmount = (sentence: string) => /\d|[$€£¢]/.test(sentence) || NUMBER_WORDS.test(sentence);

/** The sentences of a text that name an amount, in order. */
export function amountSentences(value: string): string[] {
  return value
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && namesAmount(s));
}

export type Money2CountedValue = { group: string; id: string; name: string; before: unknown; after: unknown };

export type Money2TurnReading = {
  run: string;
  premise: string;
  variant: Money2Variant;
  sample: number;
  turn: number;
  kind: string;
  /** What the player chose on the turn before, which this turn narrates */
  chosenBefore: string[];
  counted: Money2CountedValue[];
  /** The turn's changes on counted stats, "group stat change value" */
  changes: string[];
  /** Every player's text */
  text: string;
  amounts: string[];
  interludes: string[];
};

const valueIn = (entries: StatValueEntry[] | undefined, id: string) => entries?.find((e) => e.statId === id)?.value;

/** Each played turn read for its money: the counted stats before and after, its changes on them, the sentences that name an amount. */
export function readMoney2Turns(run: PlayRun): Money2TurnReading[] {
  const { premise, variant } = runArmOf(run);
  const counted = statsOfSetup(run.setup?.output).filter(isCounted);
  const slots = Object.keys(run.start?.players ?? {});
  const startValues: PlayTurn["statValues"] = { shared: run.start?.sharedStatValues ?? [], players: Object.fromEntries(slots.map((slot) => [slot, run.start?.players[slot]?.statValues ?? []])) };
  return run.turns.map((turn, i): Money2TurnReading => {
    const before = i === 0 ? startValues : run.turns[i - 1].statValues;
    const values = counted.flatMap((s): Money2CountedValue[] =>
      s.group === "shared"
        ? [{ group: "shared", id: s.id, name: s.name, before: valueIn(before.shared, s.id), after: valueIn(turn.statValues.shared, s.id) }]
        : slots.map((slot) => ({ group: slot, id: s.id, name: s.name, before: valueIn(before.players[slot], s.id), after: valueIn(turn.statValues.players[slot], s.id) }))
    );
    const ids = new Set(counted.map((s) => s.id));
    const reply = turn.reply as unknown as Record<string, { text?: unknown; interludes?: unknown }> | undefined;
    const texts = slots.map((slot) => text(reply?.[slot]?.text)).filter(Boolean);
    return {
      run: `${run.spec.id}-s${run.sample}`,
      premise,
      variant,
      sample: run.sample,
      turn: turn.turn,
      kind: turn.kind,
      chosenBefore: i === 0 ? [] : run.turns[i - 1].picks.map((p) => `${p.slot}: ${p.text} (${p.resolution ?? "no result"})`),
      counted: values,
      changes: (turn.reply?.statChanges ?? []).flatMap((c) => (c.type === "statChange" && ids.has(c.stat) ? [`${c.group} ${c.stat} ${c.change} ${c.value}`] : [])),
      text: texts.join("\n\n"),
      amounts: amountSentences(texts.join("\n\n")),
      interludes: slots.flatMap((slot) => strings(reply?.[slot]?.interludes)),
    };
  });
}

// ---------------------------------------------------------------- the blind reading

export type Money2BlindKey = { salt: string; runs: Record<string, { id: string; sample: number }> };

/** A run's code: five hex digits of the salted hash of its id and sample, so no code says its arm. */
export const money2Code = (salt: string, run: Pick<PlayRun, "spec" | "sample">) => sha256(`${salt}|${run.spec.id}|${run.sample}`).slice(0, 5).toUpperCase();

export function money2BlindKey(runs: PlayRun[], salt: string): Money2BlindKey {
  const entries = runs.map((r) => [money2Code(salt, r), { id: r.spec.id, sample: r.sample }] as const);
  if (new Set(entries.map(([code]) => code)).size !== entries.length) throw new Error("Two runs share a blind code: write the key again with another salt");
  return { salt, runs: Object.fromEntries(entries) };
}

const quoted = (value: string) => `"${value.replace(/\s+/g, " ").trim()}"`;
const valueText = (value: unknown) => (value === undefined ? "–" : JSON.stringify(value));

/** A stat in full: its type, start, flag, levers, adjustments after threads, effects and thresholds. */
export function statLines(s: Money2Stat): string[] {
  return [
    `- **${s.name}** (${s.group}, ${s.type}, starts ${valueText(s.initial)}, ${s.adjustable ? "adjustable anytime" : "changes when a thread resolves"})`,
    `  - sacrifice ${quoted(s.sacrifice)}; reward ${quoted(s.reward)}`,
    `  - after threads: ${s.adjustments.map(quoted).join(" ") || "none"}`,
    `  - effects: ${s.effects.map(quoted).join(" ") || "none"}; thresholds: ${s.implications.map(quoted).join(" ") || "none"}`,
  ];
}

/**
 * money-2-blind.md: per premise, each run's setup under its code, the codes in order (its counted stats in full, every
 * other stat by name and type, the figures it keeps as stats, the payments it puts off), then each played turn (what the
 * player chose before it, the counted stats before and after, the changes on them, the text and its amounts). No arm,
 * id or sample is named.
 */
export function renderMoney2Blind(runs: PlayRun[], salt: string): string {
  const lines = [
    "# Blind reading: money and counts in learning stories (the money-2 stage)",
    "",
    "Each setup: does every amount the premise is about (money and other counted things) sit in a number stat in its own units, moving by what the story pays and earns in the beat where it happens (no fixed step for how a thread went, no payment put off to a thread's end), with no figure worked out from others kept as a stat? For the control (a premise about neither): is nothing counted forced in? Each played turn: does every amount its text pays, spends, uses up, sells or earns move its stat by that amount in the turn's changes, with no change the text doesn't show (yes, no, or partial), and does it name a sum paid or earned? Record the verdicts by code in money2Hand.ts before the key is opened.",
    "",
  ];
  for (const entry of MONEY_2_SPECS) {
    const mine = runs.filter((r) => runArmOf(r).premise === entry.spec.id);
    if (mine.length === 0) continue;
    lines.push(`## ${entry.spec.id} (${entry.counts ? "about money or counted things" : "the control: about neither"})`, "", entry.spec.tests, "");
    const coded = mine.map((run) => ({ run, code: money2Code(salt, run) })).sort((a, b) => a.code.localeCompare(b.code));
    for (const { run, code } of coded) {
      const setup = readMoney2Setup(run);
      lines.push(`### ${code}`, "");
      if (run.setup?.output === undefined) {
        lines.push("No setup came back.", "");
        continue;
      }
      lines.push("Counted stats:", "", ...(setup.counted.length ? setup.counted.flatMap(statLines) : ["- none"]), "");
      const others = setup.stats.filter((s) => !setup.counted.includes(s));
      lines.push(`Other stats: ${others.map((s) => `${s.name} (${s.type})`).join(", ") || "none"}`, "");
      if (setup.workedOut.length) lines.push("Kept as stats though worked out from others:", "", ...setup.workedOut.flatMap(statLines), "");
      lines.push(`Payments put off: ${setup.deferrals.map(quoted).join(" ") || "none"}`, "");
      for (const turn of readMoney2Turns(run)) {
        lines.push(`#### ${code} turn ${turn.turn} (${turn.kind})`, "");
        if (turn.chosenBefore.length) lines.push(`Chosen before: ${turn.chosenBefore.join("; ")}`, "");
        lines.push(`Counted stats: ${turn.counted.map((c) => `${c.name} (${c.group}) ${valueText(c.before)} -> ${valueText(c.after)}`).join("; ") || "none"}`);
        lines.push(`Changes on them: ${turn.changes.join("; ") || "none"}`);
        lines.push(`Sentences naming an amount: ${turn.amounts.map(quoted).join(" ") || "none"}`, "");
        lines.push(...turn.text.split("\n").map((l) => `> ${l}`), "");
        if (turn.interludes.length) lines.push(`Interludes: ${turn.interludes.map(quoted).join(" ")}`, "");
      }
    }
  }
  return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------- the hand reading against production

export type Money2SetupVerdict = { hand: HandVerdict; note: string };
/** A played turn's verdict: whether its money adds up, and whether its text names a sum paid or earned */
export type Money2TurnVerdict = { addsUp: HandVerdict; sum: boolean; note: string };
/** The hand verdicts by code: a setup by its run's code, a turn by "<code> t<turn>" */
export type Money2Hand = { setups: Record<string, Money2SetupVerdict>; turns: Record<string, Money2TurnVerdict> };

export type Money2Comparison = { production: Tally; variant: Tally; noise?: number; move: RateMove; unread: { production: number; variant: number } };

export type Money2Item = { variant: string; sample: number; read?: boolean };
type Item = Money2Item;

const tallyOf = (items: Item[]): Tally => ({ hits: items.filter((i) => i.read === true).length, n: items.filter((i) => i.read !== undefined).length });
const rateOf = (t: Tally) => (t.n ? t.hits / t.n : undefined);

/** The candidate (the money setup, or the turn line) against production on items read, production's sample 1 against its sample 2 the noise, the stop rule on top. */
export function compareItems(items: Item[], candidate: VariantId = "moneySetup"): Money2Comparison {
  const production = items.filter((i) => i.variant === "adopted");
  const variant = items.filter((i) => i.variant === candidate);
  const [s1, s2] = [rateOf(tallyOf(production.filter((i) => i.sample === 1))), rateOf(tallyOf(production.filter((i) => i.sample === 2)))];
  const noise = s1 !== undefined && s2 !== undefined ? Math.abs(s1 - s2) : undefined;
  const [p, v] = [tallyOf(production), tallyOf(variant)];
  return {
    production: p,
    variant: v,
    ...(noise === undefined ? {} : { noise }),
    move: noise === undefined ? {} : rateMove(p, v, noise),
    unread: { production: production.filter((i) => i.read === undefined).length, variant: variant.filter((i) => i.read === undefined).length },
  };
}

const verdictOf = (hand: HandVerdict | undefined) => (hand === true || hand === false ? hand : undefined);

export const MONEY_2_FLAGS: (keyof Money2Flags)[] = ["moneyAsNumber", "countedAsNumber", "leversInUnits", "noFixedSteps", "noWorkedOut", "adjustable"];

export type Money2Comparisons = {
  /** By hand: each setup of a premise about money or counted things */
  setups: Money2Comparison;
  /** By hand: the control's setups */
  control: Money2Comparison;
  /** The deterministic flags on the setups of premises about money or counted things */
  flags: Record<keyof Money2Flags, Money2Comparison>;
  /** By hand: each played turn's money adds up */
  turnsAddUp: Money2Comparison;
  /** By hand: each played turn names a sum paid or earned */
  turnsWithSum: Money2Comparison;
  /** By hand: runs in which some turn names a sum paid or earned */
  runsWithSum: Money2Comparison;
};

/** The hand verdicts by code, unblinded through the key onto the runs, and the deterministic flags: the variant against production. */
export function money2Comparisons(runs: PlayRun[], key: Money2BlindKey, hand: Money2Hand): Money2Comparisons {
  const coded = runs.map((run) => ({ run, code: money2Code(key.salt, run), ...runArmOf(run) })).filter((r) => key.runs[r.code] !== undefined);
  const counts = (premise: string) => specOf(premise)?.counts ?? true;
  const setupItems = (inControl: boolean) =>
    coded.filter((r) => counts(r.premise) !== inControl).map((r): Item => ({ variant: r.variant, sample: r.run.sample, read: verdictOf(hand.setups[r.code]?.hand) }));
  const flagItems = (flag: keyof Money2Flags) =>
    coded.filter((r) => counts(r.premise) && r.run.setup?.output !== undefined).map((r): Item => ({ variant: r.variant, sample: r.run.sample, read: readMoney2Setup(r.run).flags[flag] }));
  const played = coded.filter((r) => r.run.turns.length > 0);
  const turnItems = (read: (v: Money2TurnVerdict | undefined) => boolean | undefined) =>
    played.flatMap((r) => r.run.turns.map((t): Item => ({ variant: r.variant, sample: r.run.sample, read: read(hand.turns[`${r.code} t${t.turn}`]) })));
  const runItems = played.map((r): Item => {
    const verdicts = r.run.turns.map((t) => hand.turns[`${r.code} t${t.turn}`]).filter((v): v is Money2TurnVerdict => v !== undefined);
    return { variant: r.variant, sample: r.run.sample, ...(verdicts.length ? { read: verdicts.some((v) => v.sum) } : {}) };
  });
  return {
    setups: compareItems(setupItems(false)),
    control: compareItems(setupItems(true)),
    flags: Object.fromEntries(MONEY_2_FLAGS.map((flag) => [flag, compareItems(flagItems(flag))])) as Record<keyof Money2Flags, Money2Comparison>,
    turnsAddUp: compareItems(turnItems((v) => verdictOf(v?.addsUp))),
    turnsWithSum: compareItems(turnItems((v) => v?.sum)),
    runsWithSum: compareItems(runItems),
  };
}
