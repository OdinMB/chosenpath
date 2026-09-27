import type { Story } from "core/models/Story.js";
import type { BeatOption, Change, Outcome, SetOfBeatGenerationSchema, Stat, Switch, SwitchAnalysis, Thread, ThreadAnalysis } from "core/types/index.js";
import { GameModes } from "core/types/index.js";
import { isContestedOutcome } from "core/utils/outcomeReadiness.js";
import { outcomeIdsNamed, resultKind } from "../../game/services/planChecks.js";
import { canAddMilestones } from "../../game/services/storyTextSteps.js";
import { playerParagraphs } from "./playerText.js";
import type { CheckResult } from "./textChecks.js";

/*
 * The turn document's new automatic checks (DOCS/2026-09-27_turn-generation-
 * improvements.md, Appendix A.C), the deterministic ones, on the reply the
 * game keeps (round 0's C7): switch and thread plans after planChecks, beats
 * after beatRepairs. The one exception is milestoneNotCopied, which reads the
 * reply as written, since a milestone the game adds from the plan is a copy
 * by construction. The judged checks (step settled early, progress on the
 * chapter question, paragraph 1 narrates the choice) are a model call each
 * and come later. The rules the game already repairs read as its repair
 * counts (one chapter per player, junk directions, option types, ids).
 *
 * A check that doesn't apply to a reply (no outcomes, no contest, not an
 * ending) is not reported on it, so a rate reads over the replies it applies
 * to. The prose and option counts come in pairs for pooled shares
 * (youParagraphs of paragraphs, sameOddsSets of challengeSets, …).
 */

type Loose = Record<string, unknown>;

const asObject = (value: unknown): Loose => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Loose) : {});
const asArray = <T = unknown>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const asString = (value: unknown): string => (typeof value === "string" ? value : "");

// --- Pacing arithmetic (turn doc A4) ---

/**
 * The lengths a chapter may have when it starts with this many turns left,
 * this one included: 2 to 4, and either exactly the turns left (the story
 * ends with it) or leaving at least 3 (a switch and a two-turn chapter).
 */
export function allowedLengths(turnsLeft: number): number[] {
  return [2, 3, 4].filter((length) => turnsLeft - length === 0 || turnsLeft - length >= 3);
}

/** Turns left in the story, the one being written included (STORY PROGRESS). */
const turnsLeftOf = (story: Story) => story.getMaxTurns() - story.getCurrentTurn();

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

export function checkSwitchDesign(story: Story, plan: SwitchAnalysis): CheckResult {
  const checks: Record<string, boolean> = {};
  const known = knownOutcomeIds(story);
  const switches = asArray<Switch>(asObject(plan).switches).filter((s) => s && typeof s === "object");
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
  const fit = Math.floor(turnsLeftOf(story) / 4);
  let noComplete = true;
  let late: boolean | undefined;
  for (const written of switches) {
    const relevant = outcomesOf(story, asArray<string>(written.players));
    const byId = new Map(relevant.map((o) => [o.id, o]));
    const offered = offeredOutcomes(written, known).flatMap((id) => (byId.has(id) ? [byId.get(id) as Outcome] : []));
    if (!relevant.every(complete) && offered.some(complete)) noComplete = false;
    // Binding late (owner, decision 3 (b)): fewer chapters fit than milestones are still needed
    const needed = relevant.reduce((sum, o) => sum + stillNeeded(story, o), 0);
    if (fit < needed && offered.length > 0) late = (late ?? true) && offered.every((o) => !complete(o));
  }
  checks.noCompleteOutcomeOffered = noComplete;
  if (late !== undefined) checks.lateDirectionsOnNeeded = late;
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

export function checkThreadDesign(story: Story, plan: ThreadAnalysis): CheckResult {
  const checks: Record<string, boolean> = {};
  const counts: Record<string, number> = {};
  const threads = asArray<Thread>(asObject(plan).threads).filter((t) => t && typeof t === "object");
  const known = knownOutcomeIds(story);
  const duration = asObject(plan).duration;
  if (typeof duration === "number") counts.chapterLength = duration;

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

const statNames = (stat: Stat) => [stat.name, ...(stat.type === "opposites" ? stat.name.split("|") : [])].map((n) => n.trim()).filter((n) => n.length >= 4);

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
  counts.pointingAtChoice = lasts.filter((p) => POINTING.test(p)).length;
  const lower = beats.map((b) => prose(b.text).toLowerCase()).join("\n");
  counts.stockPhrases = STOCK.reduce((sum, phrase) => sum + (lower.split(phrase).length - 1), 0);
  counts.pathAhead = lower.split("the path ahead").length - 1;
  counts.anomalyWords = (lower.match(ANOMALY) ?? []).length;

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
