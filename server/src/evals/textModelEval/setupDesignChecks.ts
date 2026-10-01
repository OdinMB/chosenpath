import { GameModes, kidsBandOf } from "core/types/index.js";
import type { CheckResult } from "./textChecks.js";
import type { SetupInput } from "./variants.js";

/*
 * The setup document's new automatic checks (DOCS/2026-09-27_setup-generation-
 * improvements.md, Appendix B13), the deterministic ones: the outcome slate
 * and milestone budget, mirrored outcomes and question forms, scoreboards and
 * seat names, the stat rules, the steering fields, facts and copies of the
 * prompt's example. They read the setup reply as production keeps it (setup
 * has no repair pass). Heuristic checks (the word lists below) read as rates
 * against two-sample noise, never as pass or fail on one reply.
 *
 * A check a setup's mode or player count doesn't call for is not reported on
 * it, so a rate reads over the setups it applies to. Counts that make a
 * pooled share come in pairs (outcomesNamingElement of outcomes,
 * spendablePlayerStats of visiblePlayerStats, effectNumbersInRange of
 * effectNumbers, threadTypesShaped of threadTypes, steeringImplications of
 * implications).
 */

type Loose = Record<string, unknown>;

type Outcome = { id: string; question: string; resolutions: Loose; milestones: number; texts: string[] };
type Stat = {
  name: string;
  type: string;
  possibleValues: string;
  tooltip: string;
  effects: string[];
  sacrifice: string;
  reward: string;
  implications: string[];
  adjustments: string[];
  visible: boolean;
  shared: boolean;
};

const asObject = (value: unknown): Loose => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Loose) : {});
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const asString = (value: unknown): string => (typeof value === "string" ? value : "");
const strings = (value: unknown): string[] => asArray(value).map(asString).filter(Boolean);
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/** The milestones each player earns over a story of this length (setup doc A10): 6 at 25 turns, 4 at 15, 3 at 10 or fewer. */
export function milestoneBudget(maxTurns: number): number {
  return Math.max(3, Math.min(6, Math.round(maxTurns / 4)));
}

function outcomeOf(value: unknown): Outcome {
  const o = asObject(value);
  const resolutions = asObject(o.possibleResolutions);
  const question = asString(o.question);
  const milestones = typeof o.intendedNumberOfMilestones === "number" ? o.intendedNumberOfMilestones : Number.NaN;
  return { id: asString(o.id), question, resolutions, milestones, texts: [question, ...Object.values(resolutions).map(asString), asString(o.resonance)] };
}

function statOf(value: unknown, shared: boolean): Stat {
  const s = asObject(value);
  return {
    name: asString(s.name),
    type: asString(s.type),
    possibleValues: asString(s.possibleValues),
    tooltip: asString(s.tooltip),
    effects: strings(s.effectOnPoints),
    sacrifice: asString(s.optionsToSacrifice),
    reward: asString(s.optionsToGainAsReward),
    implications: strings(s.narrativeImplications),
    adjustments: strings(s.adjustmentsAfterThreads),
    visible: s.isVisible !== false,
    shared,
  };
}

type Kind = "challenge" | "contest" | "paths" | "unknown";

function kindOf(outcome: Outcome): Kind {
  if ("sideAWins" in outcome.resolutions) return "contest";
  if ("favorable" in outcome.resolutions) return "challenge";
  if ("resolution1" in outcome.resolutions) return "paths";
  return "unknown";
}

const firstWord = (question: string) => question.trim().replace(/^["'“‘(]+/, "").split(/\s+/)[0]?.toLowerCase() ?? "";
const CHALLENGE_FORMS = ["will", "does", "do", "can", "could", "is", "are", "has", "have", "did", "should", "would", "shall"];
const CONTEST_FORMS = ["who", "which", "whose"];
const PATH_FORMS = ["what", "how", "which", "who", "whom", "whose", "where"];

/** A contested shared outcome: side A against side B, or a three-player race written as three paths under Who or Which. */
function isContest(outcome: Outcome, players: number): boolean {
  const kind = kindOf(outcome);
  return kind === "contest" || (players >= 3 && kind === "paths" && CONTEST_FORMS.includes(firstWord(outcome.question)));
}

/** Setup doc A6: Will / Does / Can for success and failure, Who / Which for a contest, What / How / Which path for three paths. */
function questionFormMatches(outcome: Outcome): boolean {
  const word = firstWord(outcome.question);
  switch (kindOf(outcome)) {
    case "challenge":
      return CHALLENGE_FORMS.includes(word);
    case "contest":
      return CONTEST_FORMS.includes(word);
    case "paths":
      return PATH_FORMS.includes(word);
    default:
      return false;
  }
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const containsWord = (text: string, word: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(word)}(?![\\p{L}\\p{N}])`, "iu").test(text);

/** Name words that are also ordinary words (and every question word), so they never count as a name alone. */
const NAME_STOPWORDS = new Set([
  ...["the", "and", "von", "van", "der", "del", "de", "la", "le", "of", "mr", "mrs", "ms", "dr", "sir", "lady", "lord"],
  ...["will", "may", "can", "hope", "grace", "faith", "joy", "mark", "bill", "rose", "sky", "river", "dawn", "june", "april", "summer"],
  ...["autumn", "winter", "spring", "ray", "art", "max", "star", "storm", "frost", "ash", "park", "west", "north", "south", "east"],
  ...["young", "king", "queen", "doctor", "captain", "what", "who", "how", "which", "does", "did", "is", "are"],
]);

type IdentityNames = { full: string[]; words: string[] };

/**
 * The player-identity names a text must not carry: each identity's full name
 * (any case) and its name words (three letters or more, as written, ordinary
 * words left out). A name the premise itself carries passes (smaller
 * decision S8: premise-named players may be named).
 */
function identityNames(players: Loose[], premise: string): IdentityNames {
  const full = [...new Set(players.flatMap((p) => asArray(p.possibleCharacterIdentities).map((i) => asString(asObject(i).name).trim())).filter(Boolean))];
  const words = [...new Set(full.flatMap((name) => name.split(/\s+/)))].filter((w) => w.length >= 3 && !NAME_STOPWORDS.has(w.toLowerCase()));
  return { full: full.filter((name) => !containsWord(premise, name)), words: words.filter((word) => !containsWord(premise, word)) };
}

const containsWordAsWritten = (text: string, word: string) =>
  new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(word)}(?![\\p{L}\\p{N}])`, "u").test(text);

function mentionsIdentity(text: string, names: IdentityNames): boolean {
  return names.full.some((name) => containsWord(text, name)) || names.words.some((word) => containsWordAsWritten(text, word));
}

const SEAT = /\bplayer\s?\d\b/i;

/** A question with seat numbers, identity names and punctuation taken out, for comparing players' outcomes. */
function normalizedQuestion(question: string, names: IdentityNames): string {
  let text = question.toLowerCase();
  for (const name of [...names.full, ...names.words].sort((a, b) => b.length - a.length)) {
    text = text.replace(new RegExp(`(^|[^\\p{L}])${escapeRegExp(name.toLowerCase())}(?![\\p{L}])`, "gu"), "$1<name>");
  }
  return text
    .replace(/\bplayer\s?\d\b/g, "player")
    .replace(/[^\p{L}\p{N}<> ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Signed numbers in stat effects ("+10", "-15 points"), percentages left out. */
function signedNumbers(text: string): number[] {
  return [...text.matchAll(/(?:^|[^\w])([+\-−–±])\s?(\d+(?:\.\d+)?)(?![\d.]*\s?%)/g)].map((m) => Number(m[2]));
}

const NONE = /^\s*(none|n\/a|no|-)?\s*\.?\s*$/i;
const isNone = (text: string) => NONE.test(text);
/**
 * B13's "a bonus, a risk, or 'might'", and the hedges that say the same. Not
 * "points" (a stat's own unit), "risky" (it describes what is spent: A5's
 * "a risky favor") or "may" (mostly permissive: "may take a beat to…").
 */
const BONUS_OR_RISK = /\b(bonus(es)?|risk(s|ed|ing)?|might|potentially|possibly|chances?)\b|[+±]\s?\d+/i;
const FORMULA = /\b(per|for (every|each)|times|multiplied|divided)\b|[×÷*]|\beach \d+|\(\s*[\p{L} ]+\s[-+]\s\d+\s*\)/iu;
const ENGINE_FACTS = [
  /\b2\s*(?:-|–|to)\s*4 beats?\b/i,
  /\b(last|final) beat (decides|determines|resolves|settles)\b/i,
  /\bthreads? (last|lasts|are|run|runs|take|takes) \d\s*(?:-|–|to)\s*\d\b/i,
  /\bswitch(es)?,? (then|and|followed by) (a |one )?threads?\b/i,
  /\bmilestones? (is|are) (added|awarded|recorded) (at|after)\b/i,
  /\beach thread (adds|ends with|earns) (one|a) milestone\b/i,
  /\bfavorable, mixed,? (or|and) unfavorable\b/i,
];
const PROGRESS = /\bprogress\b|\bcompletion\b|\bhow close\b|\bcloser to\b|\btoward(s)? (the |their |your )?(goal|resolution|victory|success|reform)\b|\b(fragments?|pieces?|shards?|clues?) (collected|found|gathered)\b|→.*→/i;
const SCORE = /\b(score(s|board)?|tally|leaderboard|in the lead|who (leads|is ahead|is leading)|ahead of|momentum)\b/i;
const DISCLAIMER = /\b(does not|doesn['’]t|do not|don['’]t|never|is not|isn['’]t|not a|no effect)\b/i;
const HOOK = /\b(secret(ly|s)?|debts?|owes?|owed|rival(s|ry)?|hid(e|es|den|ing)|blackmail(s|ed)?|betray(s|ed|al)?|lie[sd]?|lying|feud|grudge|conceal(s|ed)?|smuggl\w*)\b/i;
const PRONOUN_ONLY = /^\s*(pronouns?\s*[:\-–]?\s*)?(she|he|they|it|xe|ze|fae)\s*\/\s*(her|him|them|its?|xem|zir|faer)(\s*\/\s*\w+)*\s*\.?\s*$/i;
const OPENING = /\b(first|opening)\s+(thread|switch|chapter|scene)\b|\bthe story (opens|starts|begins)\b|\b(opens|starts|begins) with\b/i;
const FINALE = /\b(final|last|closing)\s+(thread|switch|chapter|scene|turns?)\b|\bthe (finale|climax|ending)\b/i;
const TIMING = /\bturns?\s+\d+|\b(middle|midpoint|half ?way) of the story\b|\baround the middle\b|\bmidway\b/i;
/** "When <Capitalized Name> falls below 30": a numeric threshold on something named, which must be a stat (case-sensitive, so the name reads as one) */
const THRESHOLD_PHRASE =
  /\b(?:[Ww]hen|[Ii]f|[Oo]nce|[Ww]henever|[Ww]hile)\s+(?:[Tt]he\s+|[Aa]\s+|[Yy]our\s+|[Tt]heir\s+)?((?:[\p{Lu}][\p{L}'’|-]*)(?:\s+[\p{Lu}][\p{L}'’|-]*){0,3})\s+(?:falls|drops|goes|rises|reaches|hits|exceeds|climbs|dips|sinks|is)\s+(?:below|above|under|over|to|at|past|beyond)?\s*\d/gu;
const IMPLICATION_VALUE = /\d|\b(at|reaches|below|above|under|over)\b/i;
const IMPLICATION_THREAD = /\b(thread|switch|chapter)s?\b/i;
const IMPLICATION_STEER = /\b(force[sd]?|offers?|offered|must|next|triggers?|opens?|unlocks?)\b/i;
const THREAD_TYPE_SHAPE = /\((challenge|exploration|contest),\s*[234]\)/i;

/** The name part of a thread type ("Harbour chase (challenge, 3): ..." -> "harbour chase"). */
const threadTypeName = (type: string) => type.split(/[(:]/)[0].trim().toLowerCase();

/** Names that a stat's name offers for matching: the whole name, and each side of an opposites name. */
const statNames = (stat: Stat) => [stat.name, ...stat.name.split("|")].map((n) => n.trim().toLowerCase()).filter((n) => n.length >= 3);

/** Words of the story's element names that identify an element in an outcome's text (the research notes' rule). */
function elementTerms(elements: Loose[]): { full: string[]; words: string[] } {
  const full = elements.map((e) => asString(e.name).toLowerCase()).filter(Boolean);
  const words = [...new Set(full.flatMap((name) => name.split(/\s+/)).filter((w) => w.length >= 5 && !["house", "city"].includes(w)))];
  return { full, words };
}

/** Lower-case word runs of eight, for finding copies of the prompt's example. */
function shingles(text: string, size = 8): Set<string> {
  const words = text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
  const runs = new Set<string>();
  for (let i = 0; i + size <= words.length; i++) runs.add(words.slice(i, i + size).join(" "));
  return runs;
}

/** Every string a reply holds. */
function allStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(allStrings);
  return [];
}

/**
 * B13's goblinLeak: the names of setup round 1's worked example (A5) and of
 * its schema examples, which an 8-word run never catches. The example's stat
 * names count as a stat's name only; its world's names count anywhere. A
 * name the premise carries is no leak. "Energy" is a common stat name and
 * production's examples use it too, so the count reads against the
 * reference's own rate, never alone.
 */
const EXAMPLE_NAMES: { pattern: RegExp; where: "statNames" | "anywhere" }[] = [
  { pattern: /\bpublic support\b/i, where: "statNames" },
  { pattern: /\bcommunity standing\b/i, where: "statNames" },
  { pattern: /\benergy\b/i, where: "statNames" },
  // Round 1b's name for the example's player stat, which round 1 called Energy
  { pattern: /\bfervou?r\b/i, where: "statNames" },
  { pattern: /\b(enclave|printers)['’]s? voice\b/i, where: "statNames" },
  { pattern: /\bgoblins?\b/i, where: "anywhere" },
  { pattern: /\bgruk\b/i, where: "anywhere" },
  { pattern: /\bmia\b/i, where: "anywhere" },
  { pattern: /\bhero guilds?\b/i, where: "anywhere" },
];

/** How many of the example's names a setup carries that its premise doesn't. */
function exampleNameLeaks(output: unknown, stats: Stat[], premise: string): number {
  const texts = allStrings(output);
  const names = stats.map((s) => s.name);
  return EXAMPLE_NAMES.filter(({ pattern, where }) => !pattern.test(premise) && (where === "statNames" ? names : texts).some((text) => pattern.test(text))).length;
}

const EXAMPLE_STARTS = ["EXAMPLE STAT SETUPS", "WORKED EXAMPLE"];
const EXAMPLE_END = "Character Selection Instructions";

/** A setup prompt's example block (production's example stat setups, or a candidate's worked example); undefined without one. */
export function exampleBlock(prompt: string): string | undefined {
  const starts = EXAMPLE_STARTS.map((marker) => prompt.indexOf(marker)).filter((i) => i >= 0);
  if (starts.length === 0) return undefined;
  const start = Math.min(...starts);
  const end = prompt.indexOf(EXAMPLE_END, start);
  return prompt.slice(start, end < 0 ? undefined : end);
}

/** Titles and articles an identity's name may open with; a name that opens with an article is a role. */
const NAME_TITLES = /^(dr|mr|mrs|ms|mx|miss|sir|lady|lord|dame|captain|capt|professor|prof|doctor|detective|officer|agent|the|a|an)\.?$/i;
const ARTICLE = /^(the|a|an)\s/i;

/** The name an identity is called by: its first word after any title ("Dr. Alex Chen" -> "alex"). */
function calledBy(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const rest = words.filter((w) => !NAME_TITLES.test(w));
  return (rest[0] ?? words[words.length - 1] ?? "").toLowerCase().replace(/[^\p{L}\p{N}'’-]/gu, "");
}

/**
 * The identity-name clause (setup round 3; the fix run's defect): a seat's
 * three identities have three different names, unless the premise gives the
 * character a name, which every identity may keep (decision S8). Identities
 * that share the name they are called by clash; a name that opens with an
 * article ("The Detective") is a role and never the premise's name.
 */
function distinctIdentities(players: Loose[], premise: string): boolean {
  return players.every((p) => {
    const names = asArray(p.possibleCharacterIdentities).map((i) => asString(asObject(i).name).trim()).filter(Boolean);
    const called = names.map(calledBy);
    return names.every((name, i) => {
      if (called.indexOf(called[i]) === i && called.lastIndexOf(called[i]) === i) return true;
      return !ARTICLE.test(name) && containsWordAsWritten(premise, name.split(/\s+/).find((w) => calledBy(w) === called[i]) ?? name);
    });
  });
}

/** An NPC's pronouns beside its name in the role, as S2 asks: "Mira Holt (she/her), …". */
const ROLE_PRONOUNS = /\((she|he|they|xe|ze|fae|it)\s*\/\s*(her|him|them|xem|zir|faer|its?)(\s*\/\s*\w+)*\)/i;

/** A stat name's words per side (an opposites name reads per side). */
const longestSideWords = (name: string) => Math.max(0, ...name.split("|").map((side) => side.trim().split(/\s+/).filter(Boolean).length));

/** Two or more shared stats whose names differ only by a seat or a player's name ("Player 1 Points", "Player 2 Points"). */
function perSeatCounters(stats: Stat[], names: IdentityNames): boolean {
  const seated = stats.filter((s) => SEAT.test(s.name) || mentionsIdentity(s.name, names));
  const groups = new Map<string, number>();
  for (const stat of seated) {
    const key = normalizedQuestion(stat.name, names);
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  return [...groups.values()].some((n) => n >= 2);
}

/**
 * The deterministic checks of setup doc B13 on one setup reply. `exampleText`
 * is the example block of the prompt that produced it (exampleBlock), when
 * known; without it noExampleCopy is not reported.
 */
export function checkSetupDesign(output: unknown, input: SetupInput, exampleText?: string): CheckResult {
  const reply = asObject(output);
  const players = Array.from({ length: input.playerCount }, (_, i) => asObject(reply[`player${i + 1}`]));
  const multiplayer = input.playerCount > 1;
  const M = milestoneBudget(input.maxTurns);
  const shared = asArray(reply.sharedOutcomes).map(outcomeOf);
  const own = players.map((p) => asArray(p.outcomes).map(outcomeOf));
  const allOutcomes = [...shared, ...own.flat()];
  const guidelines = asObject(reply.guidelines);
  const instructions = strings(guidelines.switchAndThreadInstructions);
  const threadTypes = strings(guidelines.typesOfThreads);
  const stats = [...asArray(reply.sharedStats).map((s) => statOf(s, true)), ...asArray(reply.playerStats).map((s) => statOf(s, false))];
  const elements = asArray(reply.storyElements).map(asObject);
  const facts = elements.flatMap((e) => strings(e.facts));
  const names = identityNames(players, input.premise);
  // Mirrors and per-seat counters compare players whatever their names, premise-named ones included
  const everyName = identityNames(players, "");
  const mode = input.gameMode;
  const contestMode = mode === GameModes.Competitive || mode === GameModes.CooperativeCompetitive;

  const checks: Record<string, boolean> = {};
  const counts: Record<string, number> = {};
  const milestonesOf = (outcomes: Outcome[]) => sum(outcomes.map((o) => (Number.isFinite(o.milestones) ? o.milestones : 0)));

  // --- Outcomes (proposals 1, 6, 10) ---
  if (!multiplayer) {
    checks.singlePlayerOutcomes = shared.length === 0 && own[0].length === 3 && milestonesOf(own[0]) === M;
  } else {
    const contested = shared.filter((o) => isContest(o, input.playerCount)).length;
    const goals = shared.length - contested;
    const bySharedCount = shared.length >= 1 && shared.length <= 2;
    const byMode =
      mode === GameModes.Cooperative ? goals >= 1 && contested === 0 : mode === GameModes.Competitive ? contested >= 1 : goals >= 1 && contested >= 1;
    checks.modeSlate = bySharedCount && byMode;
    const questions = own.map((list) => new Set(list.map((o) => normalizedQuestion(o.question, everyName)).filter(Boolean)));
    checks.noMirroredOutcomes = questions.every((set, i) => questions.slice(i + 1).every((other) => [...set].every((q) => !other.has(q))));
  }
  const floor = M <= 3 ? 1 : 2;
  checks.personalFloor = own.every((list) => list.length >= 1 && milestonesOf(list) >= floor);
  checks.milestoneBudget =
    allOutcomes.every((o) => Number.isInteger(o.milestones) && o.milestones >= 1 && o.milestones <= 3) &&
    own.every((list) => milestonesOf(list) + milestonesOf(shared) === M);
  if (allOutcomes.length > 0) {
    const mismatches = allOutcomes.filter((o) => !questionFormMatches(o)).length;
    checks.questionFormMatches = mismatches === 0;
    counts.questionFormMismatches = mismatches;
  }
  counts.compoundQuestions = allOutcomes.filter((o) => /\s(and|without)\s/i.test(o.question)).length;
  checks.noIdentityNamesInOutcomes = allOutcomes.every((o) => o.texts.every((text) => !mentionsIdentity(text, names)));
  // Setup round 3's identity-name clause: three names per seat unless the premise names the character
  checks.distinctIdentities = distinctIdentities(players, input.premise);
  const terms = elementTerms(elements);
  counts.outcomes = allOutcomes.length;
  counts.outcomesNamingElement = allOutcomes.filter((o) => {
    const text = [o.question, ...Object.values(o.resolutions).map(asString)].join(" ").toLowerCase();
    return terms.full.some((name) => text.includes(name)) || terms.words.some((word) => text.includes(word));
  }).length;

  // --- Scoreboards and names (proposal 2) ---
  const sharedStats = stats.filter((s) => s.shared);
  if (input.playerCount === 2 && contestMode) {
    // A contest mode keeps at least one scoreboard, even where the slate forgot its contest (modeSlate reads that)
    const contests = shared.filter((o) => kindOf(o) === "contest").length;
    const scoreboards = sharedStats.filter((s) => s.type === "opposites").length;
    checks.scoreStatPerContest = scoreboards >= Math.max(1, contests) && !perSeatCounters(sharedStats, everyName);
  }
  if (mode === GameModes.Cooperative) {
    checks.noCoopScore = stats.every((s) => !SCORE.test(s.name) && !SCORE.test(s.tooltip)) && !perSeatCounters(sharedStats, everyName);
  }
  checks.noSlotNames = stats.every((s) => [s.name, s.possibleValues, s.tooltip].every((text) => !SEAT.test(text) && !mentionsIdentity(text, names)));
  // The setup retests (2026-09-28): no player stat named after a player character, premise-named ones included (round 3's
  // identity clause, "use those names in outcomes and stats", gave Casablanca one set of player stats per named player)
  checks.noPlayerNamedStats = stats.filter((s) => !s.shared).every((s) => !SEAT.test(s.name) && !mentionsIdentity(s.name, everyName));
  // Setup round 3 (owner, 2026-09-28): contests have two sides in every player count, so three players form two camps,
  // each contest with an opposites scoreboard; no race written as three paths, no lead string
  if (input.playerCount === 3 && contestMode) {
    const contests = shared.filter((o) => kindOf(o) === "contest").length;
    const races = shared.filter((o) => kindOf(o) === "paths" && CONTEST_FORMS.includes(firstWord(o.question))).length;
    const boards = sharedStats.filter((s) => s.type === "opposites").length;
    const leadStrings = sharedStats.filter((s) => s.type !== "opposites" && (SCORE.test(s.name) || SCORE.test(s.tooltip) || /\bnobody yet\b/i.test(s.possibleValues))).length;
    checks.twoCampContests = contests >= 1 && races === 0 && boards >= contests && leadStrings === 0 && !perSeatCounters(sharedStats, everyName);
  }

  // --- Stats (proposals 3 and 4) ---
  // The scoreboard of a contested outcome is the one stat that may track progress
  const scoreboard = (s: Stat) => contestMode && multiplayer && s.shared && (s.type === "opposites" || SCORE.test(s.name) || SCORE.test(s.tooltip));
  const numbers = stats.flatMap((s) => s.effects.flatMap(signedNumbers));
  counts.effectNumbers = numbers.length;
  counts.effectNumbersInRange = numbers.filter((n) => n <= 15).length;
  if (numbers.length > 0) checks.effectsInRange = counts.effectNumbersInRange === numbers.length;
  // A two-player contest's scoreboard may carry its catch-up alone (A2.1's "one way to catch up"; round 1b's one or two),
  // and since contests have two sides in every player count, a three-player contest's opposites scoreboard (two camps) too
  const campBoard = (s: Stat) => input.playerCount === 3 && s.type === "opposites";
  const fewestEffects = (s: Stat) => ((input.playerCount === 2 || campBoard(s)) && scoreboard(s) ? 1 : 2);
  checks.effectsTwoOrThree = stats.every((s) => s.effects.length >= fewestEffects(s) && s.effects.length <= 3);
  checks.noFormula = stats.every((s) => s.effects.every((effect) => !FORMULA.test(effect)));
  const withBonus = stats.filter((s) => [s.sacrifice, s.reward].some((text) => !isNone(text) && BONUS_OR_RISK.test(text))).length;
  checks.sacrificeNoBonus = withBonus === 0;
  counts.sacrificeTextsWithBonus = withBonus;
  const visiblePlayer = stats.filter((s) => !s.shared && s.visible);
  counts.visiblePlayerStats = visiblePlayer.length;
  // Setup round 3: a story read with a child keeps two visible stats of each kind, no hidden ones, and plain names; the
  // kids-ages stage (2026-10-01): a third visible player stat where the youngest child is 9 or older
  if (input.kids) {
    const visibleShared = stats.filter((s) => s.shared && s.visible).length;
    const playerBudget = input.kidAges && kidsBandOf(input.kidAges) === "9-12" ? 3 : 2;
    checks.kidsStatBudget = visibleShared <= 2 && visiblePlayer.length <= playerBudget && stats.every((s) => s.visible);
    counts.kidsLongStatNames = stats.filter((s) => longestSideWords(s.name) > 2).length;
    checks.kidsPlainStatNames = counts.kidsLongStatNames === 0;
  }
  counts.spendablePlayerStats = visiblePlayer.filter((s) => !isNone(s.sacrifice) || !isNone(s.reward)).length;
  const progressLike = stats.filter((s) => !scoreboard(s) && [s.name, s.tooltip, ...s.implications].some((text) => PROGRESS.test(text))).length;
  checks.noProgressMeter = progressLike === 0;
  counts.progressLikeStats = progressLike;
  counts.tooltipDisclaimers = stats.filter((s) => DISCLAIMER.test(s.tooltip)).length;
  const mean = (values: number[]) => (values.length ? sum(values) / values.length : 0);
  counts.effectsPerStatMean = mean(stats.map((s) => s.effects.length));
  counts.implicationsPerStatMean = mean(stats.map((s) => s.implications.length));
  counts.adjustmentsPerStatMean = mean(stats.map((s) => s.adjustments.length));
  checks.noEngineEcho = instructions.every((rule) => ENGINE_FACTS.every((fact) => !fact.test(rule)));

  // --- Steering (proposal 7) ---
  const outcomeIds = allOutcomes.map((o) => o.id.toLowerCase()).filter(Boolean);
  const namesStat = (rule: string) => stats.some((s) => statNames(s).some((n) => rule.toLowerCase().includes(n)));
  const namesOutcome = (rule: string) => outcomeIds.some((id) => rule.toLowerCase().includes(id));
  const triggers = instructions.filter((rule) => namesStat(rule) || namesOutcome(rule) || OPENING.test(rule) || FINALE.test(rule) || TIMING.test(rule)).length;
  counts.triggerInstructions = triggers;
  checks.triggerRules = triggers >= 2;
  // Proposal 9's problem: "only 7 of 56 setups have an instruction that names one of their own stats"
  counts.rulesNamingStat = instructions.filter(namesStat).length;
  checks.ruleNamesStat = counts.rulesNamingStat > 0;
  const thresholds = instructions.flatMap((rule) => [...rule.matchAll(THRESHOLD_PHRASE)].map((m) => m[1].toLowerCase()));
  if (thresholds.length > 0) {
    checks.triggerStatsExist = thresholds.every((phrase) => stats.some((s) => statNames(s).some((n) => phrase.includes(n) || n.includes(phrase))));
  }
  const typeNames = threadTypes.map(threadTypeName).filter((name) => name.length >= 4);
  checks.noGenericAlternation = instructions
    .filter((rule) => /alternat/i.test(rule))
    .every((rule) => typeNames.some((name) => rule.toLowerCase().includes(name)));
  counts.threadTypes = threadTypes.length;
  counts.threadTypesShaped = threadTypes.filter((type) => THREAD_TYPE_SHAPE.test(type)).length;
  const steers = (text: string) => IMPLICATION_VALUE.test(text) && IMPLICATION_THREAD.test(text) && IMPLICATION_STEER.test(text);
  checks.triggerImplications = stats.some((s) => s.implications.some(steers));
  counts.implications = stats.reduce((n, s) => n + s.implications.length, 0);
  counts.steeringImplications = stats.reduce((n, s) => n + s.implications.filter(steers).length, 0);

  // --- Facts (proposal 11) and example copies (proposal 5) ---
  counts.hookFacts = facts.filter((fact) => HOOK.test(fact)).length;
  counts.pronounOnlyFacts = facts.filter((fact) => PRONOUN_ONLY.test(fact)).length;
  // S2: pronouns beside the name in the role, instead of a fact of their own
  counts.rolePronouns = elements.filter((e) => ROLE_PRONOUNS.test(asString(e.role))).length;
  checks.noPronounOnlyFacts = counts.pronounOnlyFacts === 0;
  counts.exampleNameLeaks = exampleNameLeaks(output, stats, input.premise);
  checks.noExampleNameLeak = counts.exampleNameLeaks === 0;
  if (exampleText !== undefined) {
    const example = shingles(exampleText);
    const runs = new Set(allStrings(output).flatMap((text) => [...shingles(text)]));
    const copied = [...runs].filter((run) => example.has(run)).length;
    checks.noExampleCopy = copied === 0;
    counts.exampleCopyRuns = copied;
  }

  return { checks, counts, unknownIds: [] };
}
