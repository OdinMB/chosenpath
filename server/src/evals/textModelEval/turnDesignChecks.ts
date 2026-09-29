import type { Story } from "core/models/Story.js";
import type { BeatOption, Change, Outcome, SetOfBeatGenerationSchema, Stat, Switch, SwitchAnalysis, Thread, ThreadAnalysis } from "core/types/index.js";
import { GameModes } from "core/types/index.js";
import { isContestedOutcome } from "core/utils/outcomeReadiness.js";
import { expectedOptionType } from "../../game/services/beatRepairs.js";
import { outcomeIdsNamed, resultKind } from "../../game/services/planChecks.js";
import { allowedLengths, chaptersThatFit, outcomeNeeds, turnsLeft } from "../../game/services/storyTextRounds/pacing.js";
import { sacrificeRewardLine } from "../../game/services/storyTextRounds/turnRound2.js";
import { canAddMilestones } from "../../game/services/storyTextSteps.js";
import { playerParagraphs } from "./playerText.js";
import type { CheckResult } from "./textChecks.js";
import type { TriggerExpectation } from "./triggerCases.js";

export { allowedLengths };

/*
 * The turn document's new automatic checks (DOCS/2026-09-27_turn-generation-
 * improvements.md, Appendix A.C), the deterministic ones, on the reply the
 * game keeps (round 0's C7): switch and thread plans after planChecks, beats
 * after beatRepairs. The exceptions read the reply as written:
 * milestoneNotCopied, since a milestone the game adds from the plan is a copy
 * by construction, and milestoneKindConcrete where the reply text is stored,
 * since a blank kind of milestone is stored as the question. The judged
 * checks (step settled early, progress on the chapter question, paragraph 1
 * narrates the choice) are a model call each
 * and come later. The rules the game already repairs read as its repair
 * counts (one chapter per player, junk directions, option types, ids).
 *
 * A check that doesn't apply to a reply (no outcomes, no contest, not an
 * ending) is not reported on it, so a rate reads over the replies it applies
 * to. The owner's two chapter checks of 2026-09-28 (questionNearerThanOutcome,
 * milestoneKindConcrete) also read the stored chapters' backfilled frames
 * (chapterFrames.ts, chapterFrameChecks). The prose and option counts come in pairs for pooled shares
 * (youParagraphs of paragraphs, sameOddsSets of challengeSets, …).
 */

type Loose = Record<string, unknown>;

const asObject = (value: unknown): Loose => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Loose) : {});
const asArray = <T = unknown>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const asString = (value: unknown): string => (typeof value === "string" ? value : "");

// --- Pacing arithmetic (turn doc A4; the one helper is storyTextRounds/pacing.ts) ---

/** Turns left in the story, the one being written included (STORY PROGRESS). */
const turnsLeftOf = turnsLeft;

/** An id-like word ("player1_trust"), as the rating page reads directions, or a story outcome id anywhere in the text. */
const ID_LIKE = /(^|[^A-Za-z0-9_])[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]+(?![A-Za-z0-9_])/;
const holdsIds = (text: string, known: string[]) => ID_LIKE.test(text) || known.some((id) => text.includes(id));

/** The outcomes a player's chapters can push: the shared ones and the player's own. */
function outcomesOf(story: Story, slots: string[]): Outcome[] {
  const own = slots.flatMap((slot) => story.getPlayer(slot)?.outcomes ?? []);
  return [...story.getSharedOutcomes(), ...own];
}

/** Every outcome id the story holds. */
function knownOutcomeIds(story: Story): string[] {
  return [...new Set(outcomesOf(story, story.getPlayerSlots()).map((o) => o.id))];
}

/**
 * Milestones an outcome still needs before this switch: intended minus
 * recorded minus the one the chapter that just ended will add (the switch
 * planner runs before the turn that records it).
 */
function stillNeeded(story: Story, outcome: Outcome): number {
  const ended = story.getCurrentThreadAnalysis();
  const pending = (ended?.threads ?? []).filter((t) => t?.resolution && t.outcomeId === outcome.id).length;
  return Math.max(0, outcome.intendedNumberOfMilestones - (outcome.milestones?.length ?? 0) - pending);
}

// --- Switch plans ---

/** The outcomes a switch offers: the flavor switch's, or every known outcome its directions name. */
function offeredOutcomes(written: Switch, known: string[]): string[] {
  if (written.type === "flavor") return written.outcomeId ? [written.outcomeId] : [];
  return [...new Set(asArray<string>(written.topicChoices).flatMap((direction) => outcomeIdsNamed(asString(direction), known).known))];
}

/** A round switch plan keeps each direction as written beside today's "text (id)" string (turnRound1Planners.ts). */
const writtenDirections = (sw: Switch): string[] | undefined => {
  const held = (sw as Switch & { topicDirections?: unknown }).topicDirections;
  return Array.isArray(held) ? held.map((d) => asString(asObject(d).direction)) : undefined;
};

/**
 * The switch checks of turn doc A.C. `expectation` is a built trigger case's
 * rule (triggerCases.ts): the plan follows it when it is a flavor switch on
 * the outcome the rule bears on.
 */
export function checkSwitchDesign(story: Story, plan: SwitchAnalysis, expectation?: TriggerExpectation): CheckResult {
  const checks: Record<string, boolean> = {};
  const known = knownOutcomeIds(story);
  const switches = asArray<Switch>(asObject(plan).switches).filter((s) => s && typeof s === "object");
  if (expectation?.kind === "flavor") {
    checks.triggerFollowed = switches.some((s) => asArray<string>(s.players).includes("player1") && s.type === "flavor" && s.outcomeId === expectation.outcomeId);
  }
  // A2: a round direction as the player reads it carries no ids
  const written = switches.flatMap((s) => writtenDirections(s) ?? []);
  if (switches.some((s) => writtenDirections(s) !== undefined && s.type === "topic")) checks.directionsNoIds = written.every((d) => !holdsIds(d, known));
  if (known.length === 0) return { checks, counts: {}, unknownIds: [] };

  const topics = switches.filter((s) => s.type === "topic" && asArray(s.topicChoices).length > 0);
  if (topics.length > 0) {
    const named = topics.map((s) => asArray<string>(s.topicChoices).map((d) => outcomeIdsNamed(asString(d), known).known));
    checks.directionsOneOutcome = named.every((directions) => directions.every((ids) => ids.length === 1));
    checks.directionsDistinctOutcomes = named.every((directions) => {
      const all = directions.flat();
      return new Set(all).size === all.length;
    });
  }

  const complete = (outcome: Outcome) => stillNeeded(story, outcome) === 0;
  const fit = chaptersThatFit(turnsLeftOf(story));
  let noComplete = true;
  let late: boolean | undefined;
  let untouched: boolean | undefined;
  for (const written of switches) {
    const relevant = outcomesOf(story, asArray<string>(written.players));
    const byId = new Map(relevant.map((o) => [o.id, o]));
    const offeredIds = offeredOutcomes(written, known);
    const offered = offeredIds.flatMap((id) => (byId.has(id) ? [byId.get(id) as Outcome] : []));
    if (!relevant.every(complete) && offered.some(complete)) noComplete = false;
    // Binding late (owner, decision 3 (b)): fewer chapters fit than milestones are still needed
    const needed = relevant.reduce((sum, o) => sum + stillNeeded(story, o), 0);
    if (fit < needed && offered.length > 0) late = (late ?? true) && offered.every((o) => !complete(o));
    // ... and those no chapter has pushed yet go first: one of them is offered while any still needs milestones
    const [slot] = asArray<string>(written.players);
    const fresh = slot ? outcomeNeeds(story, slot, true).filter((n) => n.stillNeeded > 0 && n.noChapterYet).map((n) => n.id) : [];
    if (fit < needed && offered.length > 0 && fresh.length > 0) untouched = (untouched ?? true) && offeredIds.some((id) => fresh.includes(id));
  }
  checks.noCompleteOutcomeOffered = noComplete;
  if (late !== undefined) checks.lateDirectionsOnNeeded = late;
  if (untouched !== undefined) checks.lateOffersUntouched = untouched;
  return { checks, counts: {}, unknownIds: [] };
}

// --- Thread plans ---

const GROUP_WORDS = /\bthe (group|players|party)\b/i;

/** A character's names a step question can use: the full name and its words of three letters or more. */
function characterNames(story: Story, slot: string): string[] {
  const name = story.getPlayer(slot)?.name ?? "";
  return [name, ...name.split(/\s+/)].filter((n) => n.length >= 3);
}

const mentions = (text: string, names: string[]) => names.some((name) => text.toLowerCase().includes(name.toLowerCase()));

/** The outcomes the players' picks set for this thread: the flavor switch's, or the chosen directions'. */
function pickedOutcomes(story: Story, thread: Thread, known: string[]): string[] | undefined {
  const plan = story.getCurrentSwitchAnalysis();
  if (!plan) return undefined;
  const players = [...asArray<string>(thread.playersSideA), ...asArray<string>(thread.playersSideB)];
  const picked = players.flatMap((slot) => {
    const written = asArray<Switch>(plan.switches).find((s) => asArray<string>(s.players).includes(slot));
    if (!written) return [];
    if (written.type === "flavor") return written.outcomeId ? [written.outcomeId] : [];
    const choice = story.getCurrentBeat(slot)?.choice ?? -1;
    const direction = asArray<string>(written.topicChoices)[choice];
    return direction === undefined ? [] : outcomeIdsNamed(asString(direction), known).known;
  });
  return picked.length > 0 ? picked : undefined;
}

/** Names a chapter question can use: the story elements' names and their longer words, and the player characters'. */
function storyNames(story: Story): string[] {
  const elements = story.getStoryElements().flatMap((e) => [e.name, ...e.name.split(/\s+/).filter((w) => w.length >= 4)]);
  return [...elements, ...story.getPlayerSlots().flatMap((slot) => characterNames(story, slot))].filter((n) => n.trim().length >= 3);
}

/** A round thread's own fields (turnRound1Planners.ts): its written kind, question and plan. */
type FramedThread = Thread & { kind?: unknown; question?: unknown; plan?: unknown };

// --- The nearer chapter question (the owner's feedback of 2026-09-28) ---

/** Words that carry no goal of their own in a question. */
const QUESTION_STOP_WORDS = new Set(
  (
    "will does did can could would should is are was were be been being has have had the a an and or but nor to of in on at for with by from into onto " +
    "over under than that this these those their his her its our your they them he she it who whom whose which what when where why how whether as so " +
    "not no any all some enough successfully finally ultimately truly really player players character characters story outcome get gets manage manages able"
  ).split(" ")
);

/** A word's crude stem: diacritics and a possessive off, then one common suffix, keeping at least four letters. */
function stemOf(word: string): string {
  const base = word
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’]s$/, "");
  for (const suffix of ["ings", "ing", "ure", "ed", "es", "s", "e"]) {
    if (base.endsWith(suffix) && base.length - suffix.length >= 4) return base.slice(0, -suffix.length);
  }
  return base;
}

/** A question's content words as stems, the story's own names left out. */
function goalWords(text: string, names: Set<string>): Set<string> {
  const words = text
    .split(/[^\p{L}\p{N}'’]+/u)
    .map((w) => w.replace(/^['’]+|['’]+$/g, ""))
    .filter((w) => w.length >= 3 && !QUESTION_STOP_WORDS.has(w.toLowerCase()));
  return new Set(words.map(stemOf).filter((stem) => !names.has(stem)));
}

const normalised = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * Whether a chapter question asks its outcome's question again: the same
 * question, or one that holds at least two of the outcome's goal words (its
 * content words, the story's names of people and things left out) and at
 * least half of them. A heuristic; read it as a rate.
 */
export function nearDuplicateOfOutcome(question: string, outcomeQuestion: string, names: string[]): boolean {
  if (normalised(question) !== "" && normalised(question) === normalised(outcomeQuestion)) return true;
  const nameStems = new Set(names.flatMap((name) => name.split(/[^\p{L}\p{N}'’]+/u)).filter((w) => w.length >= 3).map(stemOf));
  const goal = goalWords(outcomeQuestion, nameStems);
  const asked = goalWords(question, nameStems);
  const shared = [...goal].filter((word) => asked.has(word)).length;
  return shared >= 2 && shared >= goal.size / 2;
}

/** A kind of milestone that names progress, a step or a milestone instead of the concrete thing a chapter settles. */
const GENERIC_MILESTONE = /\bmilestones?\b|\bprogress\w*|\badvanc(?:e|es|ed|ing|ement|ements)\b|\bheadway\b|\bsteps? (?:toward|towards|forward|closer)\b|\bmov(?:e|es|ing) (?:closer|forward|toward|towards)\b/i;

/** Whether a kind of milestone is empty or generic ("Milestone marking progress in exposing the Waste Ring"). */
export function genericMilestoneKind(text: string): boolean {
  return text.trim() === "" || GENERIC_MILESTONE.test(text);
}

/**
 * The owner's two chapter checks on one thread: its question (its own, or a
 * backfilled frame's) against its outcome's, where both are there, and its
 * kind of milestone, where the plan writes one. A stored kind of milestone
 * that is the thread's own question is a copy, not a kind: planner v2 and v2b
 * write none, and planner v2c's blank one falls back to the question, so it
 * is not read here (checkThreadDesign reads the reply as written for that).
 */
export function chapterQuestionChecks(
  story: Story,
  thread: { outcomeId?: unknown; typeOfMilestone?: unknown; question?: unknown },
  question?: string
): Record<string, boolean> {
  const checks: Record<string, boolean> = {};
  const outcome = typeof thread.outcomeId === "string" ? story.getOutcomeById(thread.outcomeId) : undefined;
  if (question !== undefined && question.trim() !== "" && outcome) {
    checks.questionNearerThanOutcome = !nearDuplicateOfOutcome(question, outcome.question, storyNames(story));
  }
  const kind = thread.typeOfMilestone;
  const copied = typeof kind === "string" && typeof thread.question === "string" && kind.trim() === thread.question.trim();
  if (typeof kind === "string" && !copied) checks.milestoneKindConcrete = !genericMilestoneKind(kind);
  return checks;
}

/** A chapter reply's threads as the planner wrote them: a single player's one thread, or a group's (and today's form's) list. */
function writtenThreads(written: unknown): Loose[] {
  const reply = asObject(written);
  if (reply.thread !== undefined) return [asObject(reply.thread)];
  return asArray(reply.threads).map(asObject);
}

/**
 * The kind of milestone as the reply wrote it, before the stored plan's
 * fallback to the question: every written kind concrete, a blank one failing;
 * undefined where the reply wrote none (planner v2 and v2b).
 */
function writtenKindConcrete(written: unknown): boolean | undefined {
  const kinds = writtenThreads(written).flatMap((t) => (typeof t.typeOfMilestone === "string" ? [t.typeOfMilestone] : []));
  return kinds.length > 0 ? kinds.every((kind) => !genericMilestoneKind(kind)) : undefined;
}

/**
 * The thread checks of turn doc A.C. `expectation` is a built trigger case's
 * recipe (triggerCases.ts): the plan follows it when it has the recipe's length.
 * `asWritten` is the reply as the planner wrote it, where its text is stored:
 * the kind of milestone is read there, before the plan's fallback to the question.
 */
export function checkThreadDesign(story: Story, plan: ThreadAnalysis, expectation?: TriggerExpectation, asWritten?: unknown): CheckResult {
  const checks: Record<string, boolean> = {};
  const counts: Record<string, number> = {};
  const threads = asArray<FramedThread>(asObject(plan).threads).filter((t) => t && typeof t === "object");
  const known = knownOutcomeIds(story);
  const duration = asObject(plan).duration;
  if (typeof duration === "number") counts.chapterLength = duration;
  if (expectation?.kind === "length") checks.triggerFollowed = duration === expectation.length;

  // A3: the chapter's question names something from the story; its plan carries no ids (planner v2's fields)
  const questioned = threads.filter((t) => typeof t.question === "string");
  if (questioned.length > 0) {
    const names = storyNames(story);
    checks.questionPresent = questioned.every((t) => asString(t.question).trim() !== "" && mentions(asString(t.question), names));
  }
  const planned = threads.filter((t) => typeof t.plan === "string");
  if (planned.length > 0) checks.planWithoutIds = planned.every((t) => asString(t.plan).trim() !== "" && !holdsIds(asString(t.plan), known));

  // The owner's feedback of 2026-09-28: a question nearer than the outcome's, and a concrete kind of milestone
  const perThread = threads.map((t) => chapterQuestionChecks(story, t, typeof t.question === "string" ? t.question : undefined));
  for (const name of ["questionNearerThanOutcome", "milestoneKindConcrete"]) {
    const read = perThread.filter((c) => name in c);
    if (read.length > 0) checks[name] = read.every((c) => c[name]);
  }
  if (asWritten !== undefined) {
    const concrete = writtenKindConcrete(asWritten);
    if (concrete === undefined) delete checks.milestoneKindConcrete;
    else checks.milestoneKindConcrete = concrete;
  }

  // A6: the kind follows the outcome's (a three-player race runs as contests), and the written kind matches the results
  const kinded = threads.flatMap((t) => {
    const outcome = story.getOutcomeById(t.outcomeId);
    const expected = outcome ? resultKind(outcome.possibleResolutions) : undefined;
    return expected ? [{ thread: t, expected }] : [];
  });
  if (kinded.length > 0) {
    const race = story.getNumberOfPlayers() === 3;
    checks.kindFollowsOutcome = kinded.every(({ thread, expected }) => {
      const kind = resultKind(thread.possibleMilestones);
      return kind === expected || (race && expected === "exploration" && kind === "contest");
    });
  }
  const written = threads.filter((t) => typeof t.kind === "string");
  if (written.length > 0) checks.kindFieldMatches = written.every((t) => t.kind === resultKind(t.possibleMilestones));

  if (known.length > 0 && threads.length > 0) {
    checks.threadOutcomeKnown = threads.every((t) => known.includes(t.outcomeId));
    const expectations = threads.map((t) => ({ thread: t, picked: pickedOutcomes(story, t, known) })).filter((e) => e.picked);
    if (expectations.length > 0) checks.chapterFollowsPick = expectations.every((e) => (e.picked as string[]).includes(e.thread.outcomeId));
  }
  if (threads.length > 0) {
    checks.oneKindPerChapter = threads.every((t) => {
      const kinds = [resultKind(t.possibleMilestones), ...asArray<Thread["progression"][number]>(t.progression).map((step) => resultKind(step?.possibleResolutions))];
      const kind = kinds.every((k) => k !== undefined && k === kinds[0]) ? kinds[0] : undefined;
      return kind !== undefined && (kind === "contest") === (asArray(t.playersSideB).length > 0);
    });
  }
  if (typeof duration === "number") {
    const allowed = allowedLengths(turnsLeftOf(story));
    checks.lengthAllowed = allowed.length === 0 || allowed.includes(duration);
  }

  if (story.isMultiplayer() && !story.hasThreadAnalysis()) {
    const [only] = threads;
    const everyone = only !== undefined && story.getPlayerSlots().every((slot) => [...asArray(only.playersSideA), ...asArray(only.playersSideB)].includes(slot));
    const shared = story.getSharedOutcomes();
    const contested = story.getGameMode() === GameModes.Competitive ? shared.filter(isContestedOutcome) : [];
    const required = (contested.length > 0 ? contested : shared).map((o) => o.id);
    checks.firstChapterGroupsAll = threads.length === 1 && everyone && (required.length === 0 || required.includes(only.outcomeId));
  }

  const contests = threads.filter((t) => asArray(t.playersSideB).length > 0);
  if (contests.length > 0) {
    checks.contestStepsNameBothSides = contests.every((t) => {
      const sideA = asArray<string>(t.playersSideA).flatMap((slot) => characterNames(story, slot));
      const sideB = asArray<string>(t.playersSideB).flatMap((slot) => characterNames(story, slot));
      return asArray<Thread["progression"][number]>(t.progression).every((step) => mentions(asString(step?.question), sideA) && mentions(asString(step?.question), sideB));
    });
  }
  if (!story.isMultiplayer() && threads.length > 0) {
    checks.noGroupInSinglePlayer = threads.every((t) => Object.values(asObject(t.possibleMilestones)).every((m) => !GROUP_WORDS.test(asString(m))));
  }
  return { checks, counts, unknownIds: [] };
}

// --- Beats ---

type StatChange = Extract<Change, { type: "statChange" }>;
type NewMilestone = Extract<Change, { type: "newMilestone" }>;
type Beat = { text: string; options: BeatOption[]; interludes: { text: string }[] };

const IMAGE_TAG = /\[image\s+[^\]]*\]/g;
const prose = (text: string) => text.replace(IMAGE_TAG, " ");
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function beatsOf(reply: SetOfBeatGenerationSchema, story: Story): Beat[] {
  return story.getPlayerSlots().flatMap((slot) => {
    const beat = asObject((reply as unknown as Loose)[slot]);
    if (Object.keys(beat).length === 0) return [];
    return [
      {
        text: asString(beat.text),
        options: asArray<BeatOption>(beat.options).filter((o) => o && typeof o === "object"),
        interludes: asArray<{ text: string }>(beat.interludes).filter((i) => i && typeof i === "object"),
      },
    ];
  });
}

const statChangesOf = (reply: SetOfBeatGenerationSchema) =>
  asArray<StatChange>(asObject(reply).statChanges).filter((c) => c && c.type === "statChange");
const milestonesOf = (reply: SetOfBeatGenerationSchema) =>
  asArray<NewMilestone>(asObject(reply).newMilestones).filter((m) => m && m.type === "newMilestone");

/** A stat's name and, for opposites, each side: the words a turn names it by (four letters or more). */
export const statNames = (stat: Stat) => [stat.name, ...(stat.type === "opposites" ? stat.name.split("|") : [])].map((n) => n.trim()).filter((n) => n.length >= 4);

/**
 * A stat's name beside a number, "%" or "points" in what the player reads
 * (prose without image tags, normal options, interludes): the readout the
 * fourth-wall rule forbids (turn doc B3 items 5, 6 and 17). Sacrifice and
 * reward options may name the stat and the amount, so they are left out.
 */
export function statReadouts(story: Story, reply: SetOfBeatGenerationSchema): string[] {
  const state = story.getState();
  const names = [...state.sharedStats, ...state.playerStats].flatMap(statNames);
  const texts = beatsOf(reply, story).flatMap((beat) => [
    prose(beat.text),
    ...beat.options.filter((o) => o.resourceType === "normal").map((o) => asString(o.text)),
    ...beat.interludes.map((i) => asString(i.text)),
  ]);
  return texts.flatMap((text) =>
    names
      .flatMap((name) => {
        const after = new RegExp(`\\b${escapeRegExp(name)}\\b[^.!?\\n]{0,40}?\\d+(?:\\s*%|\\s*points?\\b)?`, "gi");
        const before = new RegExp(`\\d+\\s*(?:%|points?\\b)[^.!?\\n]{0,20}?\\b${escapeRegExp(name)}\\b`, "gi");
        return [...text.matchAll(after), ...text.matchAll(before)].map((m) => ({ at: m.index ?? 0, hit: m[0] }));
      })
      .sort((a, b) => a.at - b.at)
      .map((h) => h.hit)
  );
}

/** Its last choice, when it was a challenge sacrifice or reward, and the stats its text names. */
function chosenSacrifice(story: Story, slot: string): { statIds: string[] } | undefined {
  const beat = story.getCurrentBeat(slot);
  const option = beat && beat.choice >= 0 ? asArray<BeatOption>(beat.options)[beat.choice] : undefined;
  if (!option || option.optionType !== "challenge" || option.resourceType === "normal") return undefined;
  const state = story.getState();
  const text = asString(option.text).toLowerCase();
  const named = [...state.sharedStats, ...state.playerStats].filter((s) => statNames(s).some((n) => text.includes(n.toLowerCase())));
  return { statIds: named.map((s) => s.id) };
}

const normalized = (text: string) => text.toLowerCase().replace(/[^\p{L} ]+/gu, "").replace(/\s+/g, " ").trim();
/** A planned milestone copied: the written one starts with the plan's first 30 characters, as the research notes counted it. */
const isCopy = (written: string, planned: string) => normalized(planned) !== "" && normalized(written).startsWith(normalized(planned).slice(0, 30));

const SEQUEL = /\b(only|just) the beginning\b|\bto be continued\b|\bfar from over\b|\bhas only just begun\b|\ba new (chapter|adventure) (awaits|begins)\b|\bthe (real )?(journey|adventure) (is just beginning|has just begun|continues)\b/i;
const STOCK = [
  "the weight of",
  "hangs in the balance",
  "take a deep breath",
  "as you prepare to",
  "just the beginning",
  "a mix of",
  "the air is thick",
  "a sense of",
  "palpable",
  "tapestry",
  "at the edge of",
];
const POINTING = /\b(choose|choice|decide|decision|next move|next step|path ahead|the path|options|possibilit)/i;
const WAIT = /\bwait(s|ing|ed)?\b|\bawait(s|ing)?\b/i;
const ANOMALY = /\b(flicker(s|ing|ed)?|glint(s|ing|ed)?|shimmer(s|ing|ed)?|hum(s|ming|med)?|whisper(s|ing|ed)?|strange(ly)?|odd(ly)?|unexplained|faint(ly)?)\b/gi;

const lastSentence = (paragraph: string) => {
  const sentences = paragraph.split(/(?<=[.!?…]["'”’)]*)\s+/).filter((s) => /\p{L}/u.test(s));
  return sentences[sentences.length - 1] ?? "";
};

const firstWordOf = (text: string) => text.toLowerCase().replace(/^[^\p{L}]+/u, "").split(/\s+/)[0] ?? "";
const totalPoints = (o: BeatOption) =>
  o.optionType === "challenge" ? (o.basePoints ?? 0) + asArray<{ effect: number }>(o.modifiersToSuccessRate).reduce((sum, m) => sum + (m?.effect ?? 0), 0) : 0;

// --- Turn round 2's beat checks (B6, B7, B8) ---

const STOP_WORDS = new Set(["with", "that", "this", "from", "into", "your", "their", "about", "them", "they", "have", "will", "what", "when", "where", "which", "while", "before", "after", "over", "under", "more", "most", "some", "than", "then", "there", "these", "those", "yourself"]);
/** A text's content words: four letters or more, no stop words, bracketed ids left out. */
const contentWords = (text: string) =>
  new Set(
    text
      .replace(/\([^)]*\)/g, " ")
      .toLowerCase()
      .split(/[^\p{L}]+/u)
      .filter((w) => w.length >= 4 && !STOP_WORDS.has(w))
  );
const overlap = (a: Set<string>, b: Set<string>) => [...a].filter((w) => b.has(w)).length;

/** Direct speech: a double quote, or a single-quoted run of words. */
const SPEECH = /["“”]|(^|\s)['‘][^'’\n]{3,}['’](?=\s|[,.!?;:]|$)/;

/** The resolution names an outcome's possible resolutions use (favorable/mixed/unfavorable, sideAWins/mixed/sideBWins, resolution1-3). */
const resolutionKeys = (outcome: Outcome) => Object.keys(asObject(outcome.possibleResolutions));

/**
 * Round 2's checks on what a turn's reply keeps: a topic switch's options in
 * its directions' order and free of ids (B7, A2); speech in a first turn's
 * first paragraph (B7); the ending's per-outcome answers (B8, the round-2
 * form's own field: not reported on a reply without it); and no lever where
 * B6's computed rate line gives none (reported only on those turns, so the
 * reference, which never saw the line, reads against the same turns).
 */
function roundTwoChecks(story: Story, reply: SetOfBeatGenerationSchema): Record<string, boolean> {
  const checks: Record<string, boolean> = {};
  const beatType = story.getCurrentBeatType();
  const known = knownOutcomeIds(story);
  for (const slot of story.getPlayerSlots()) {
    const beat = asObject((reply as unknown as Loose)[slot]);
    if (Object.keys(beat).length === 0) continue;
    const options = asArray<BeatOption>(beat.options).filter((o) => o && typeof o === "object");
    if (beatType === "switch") {
      const written = asArray<Switch>(story.getCurrentSwitchAnalysis()?.switches).find((s) => asArray<string>(s?.players).includes(slot));
      const directions = asArray<string>(written?.topicChoices).map(asString);
      if (written?.type === "topic" && directions.length === 3 && options.length === 3) {
        const words = directions.map(contentWords);
        const follows = options.every((o, i) => {
          const own = contentWords(asString(o.text));
          const scores = words.map((w) => overlap(own, w));
          return scores[i] > 0 && scores.every((s) => s <= scores[i]);
        });
        checks.switchOptionsFollowDirections = (checks.switchOptionsFollowDirections ?? true) && follows;
        checks.switchOptionsNoIds = (checks.switchOptionsNoIds ?? true) && options.every((o) => !holdsIds(asString(o.text), known));
      }
      if (story.isFirstBeat()) {
        const [first] = playerParagraphs(prose(asString(beat.text))).map((p) => p.trim()).filter((p) => /\p{L}/u.test(p));
        checks.firstParagraphSpeech = (checks.firstParagraphSpeech ?? true) && SPEECH.test(first ?? "");
      }
    }
    if (beatType === "ending" && Array.isArray(beat.outcomeEndings)) {
      const answers = beat.outcomeEndings.map(asObject);
      const outcomes = [...new Map(outcomesOf(story, [slot]).map((o) => [o.id, o])).values()];
      const ids = answers.map((a) => asString(a.outcomeId));
      checks.endingAnswersEveryOutcome =
        (checks.endingAnswersEveryOutcome ?? true) &&
        ids.length === outcomes.length &&
        outcomes.every((o) => {
          const own = answers.filter((a) => a.outcomeId === o.id);
          return own.length === 1 && resolutionKeys(o).includes(asString(own[0].resolution));
        });
      // The setup document's ending rule: an outcome without milestones, the one this ending adds included, ends mixed
      const ended = new Set((story.getResolvedThreadAnalysis()?.threads ?? []).map((t) => t?.outcomeId));
      const bare = outcomes.filter((o) => (o.milestones?.length ?? 0) === 0 && !ended.has(o.id) && resolutionKeys(o).includes("mixed"));
      if (bare.length > 0) {
        checks.endingNoMilestoneMixed = (checks.endingNoMilestoneMixed ?? true) && bare.every((o) => answers.find((a) => a.outcomeId === o.id)?.resolution === "mixed");
      }
    }
    if (beatType === "thread" && expectedOptionType(story, slot) === "challenge" && sacrificeRewardLine(story, slot).endsWith("none this turn.")) {
      checks.leverFollowsRateLine = (checks.leverFollowsRateLine ?? true) && options.every((o) => o.resourceType === "normal");
    }
  }
  return checks;
}

/**
 * The beat checks of turn doc A.C on one reply. `reply` is what the game
 * keeps (beatRepairs), `written` the reply as the model wrote it.
 */
export function checkBeatDesign(story: Story, reply: SetOfBeatGenerationSchema, written: SetOfBeatGenerationSchema): CheckResult {
  const checks: Record<string, boolean> = {};
  const counts: Record<string, number> = {};
  const beatType = story.getCurrentBeatType();
  const beats = beatsOf(reply, story);
  const state = story.getState();
  const statIds = new Set([...state.sharedStats, ...state.playerStats].map((s) => s.id));

  // A sacrifice or reward chosen last turn is paid now (B1)
  const sacrifices = story.getPlayerSlots().flatMap((slot) => {
    const chosen = chosenSacrifice(story, slot);
    return chosen ? [{ slot, ...chosen }] : [];
  });
  if (sacrifices.length > 0) {
    const changes = statChangesOf(reply).filter((c) => statIds.has(c.stat));
    checks.sacrificeApplied = sacrifices.every(({ slot, statIds: named }) =>
      changes.some((c) => (c.group === slot || c.group === "shared") && (named.length === 0 || named.includes(c.stat)))
    );
  }

  // One milestone per chapter that ended, on its outcome, not the plan's words (B1)
  const ended = canAddMilestones(story) ? (story.getResolvedThreadAnalysis()?.threads ?? []).filter((t) => t && t.outcomeId) : [];
  if (ended.length > 0) {
    const kept = milestonesOf(reply);
    const endedOutcomes = new Set(ended.map((t) => t.outcomeId));
    checks.oneMilestonePerEndedChapter = [...endedOutcomes].every(
      (id) => kept.filter((m) => m.outcome === id).length === ended.filter((t) => t.outcomeId === id).length
    );
    if (kept.length > 0) checks.noUnearnedMilestones = kept.every((m) => endedOutcomes.has(m.outcome));
    const own = milestonesOf(written).filter((m) => endedOutcomes.has(m.outcome));
    if (own.length > 0) {
      checks.milestoneNotCopied = own.every((m) =>
        ended.filter((t) => t.outcomeId === m.outcome).every((t) => !isCopy(asString(m.newMilestone), asString(t.milestone)))
      );
    }
  }

  // Switch turns and endings (B3, B8)
  if (beatType === "switch") checks.noSacrificeInSwitch = beats.every((b) => b.options.every((o) => o.resourceType === "normal"));
  if (beatType === "ending") {
    checks.noOptionsOnEnding = beats.every((b) => b.options.length === 0);
    checks.noSequelHook = beats.every((b) => !SEQUEL.test(prose(b.text)));
  }

  // The fourth wall: stat readouts (B3)
  const readouts = statReadouts(story, reply);
  checks.noStatReadouts = readouts.length === 0;
  counts.statReadouts = readouts.length;

  // Prose habits (B5), pooled over the reply's beats
  const paragraphs = beats.flatMap((b) => playerParagraphs(prose(b.text)).map((p) => p.trim()).filter((p) => /\p{L}/u.test(p)));
  // The whole reply's paragraphs (checkBeatSet's own "paragraphs" count sums the players' too)
  counts.proseParagraphs = paragraphs.length;
  counts.youParagraphs = paragraphs.filter((p) => /^you\b/i.test(p)).length;
  const lasts = beats.map((b) => playerParagraphs(prose(b.text)).map((p) => p.trim()).filter((p) => /\p{L}/u.test(p)).pop() ?? "");
  counts.beatTexts = lasts.length;
  counts.waitingClose = lasts.filter((p) => WAIT.test(lastSentence(p))).length;
  // Pointing at the choice needs a choice after the text: an ending has none, and its closing may well say "you choose"
  const choiceTexts = beatType === "ending" ? [] : lasts;
  counts.choiceTexts = choiceTexts.length;
  counts.pointingAtChoice = choiceTexts.filter((p) => POINTING.test(p)).length;
  const lower = beats.map((b) => prose(b.text).toLowerCase()).join("\n");
  counts.stockPhrases = STOCK.reduce((sum, phrase) => sum + (lower.split(phrase).length - 1), 0);
  counts.pathAhead = lower.split("the path ahead").length - 1;
  counts.anomalyWords = (lower.match(ANOMALY) ?? []).length;

  Object.assign(checks, roundTwoChecks(story, reply));

  // Option sets (B6)
  const sets = beats.filter((b) => b.options.length === 3);
  counts.optionSets = sets.length;
  counts.sameFirstWordSets = sets.filter((b) => new Set(b.options.map((o) => firstWordOf(asString(o.text)))).size < 3).length;
  const challenge = sets.filter((b) => b.options.every((o) => o.optionType === "challenge"));
  const spread = (b: Beat) => Math.max(...b.options.map(totalPoints)) - Math.min(...b.options.map(totalPoints));
  counts.challengeSets = challenge.length;
  counts.sameOddsSets = challenge.filter((b) => spread(b) === 0).length;
  counts.oddsWithin5Sets = challenge.filter((b) => spread(b) <= 5).length;
  counts.leverSets = challenge.filter((b) => b.options.some((o) => o.resourceType !== "normal")).length;
  counts.rewardSets = challenge.filter((b) => b.options.some((o) => o.resourceType === "reward")).length;
  const bonus = challenge.flatMap((b) => b.options).filter(
    (o) => o.optionType === "challenge" && o.resourceType === "normal" && asArray<{ effect: number }>(o.modifiersToSuccessRate).reduce((sum, m) => sum + (m?.effect ?? 0), 0) > 0
  );
  counts.bonusOptions = bonus.length;
  counts.bonusOptionsNegativeBase = bonus.filter((o) => o.optionType === "challenge" && o.basePoints < 0).length;

  return { checks, counts, unknownIds: [] };
}
