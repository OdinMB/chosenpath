import type { Story } from "core/models/Story.js";
import type {
  BeatGeneration,
  BeatOption,
  SetOfBeatGenerationSchema,
  SwitchAnalysis,
  ThreadAnalysis,
} from "core/types/index.js";
import { getThreadType } from "core/types/thread.js";
import { POINTS_FOR_REWARD, POINTS_FOR_SACRIFICE } from "core/config.js";
import type { SetupInput } from "./variants.js";

/*
 * The rule and state checks of test plan §4.4 on parsed outputs. Each check
 * is a named pass/fail; the report compares rates against the baseline's.
 * These only rule arms out, they never pick a winner.
 */

export type CheckResult = {
  /** check name -> passed */
  checks: Record<string, boolean>;
  counts: Record<string, number>;
  /** Ids the output references that do not exist */
  unknownIds: string[];
};

const IMAGE_TAG = /\[image\s+([^\]]*)\]/g;

export function stripImageTags(text: string): string {
  return text.replace(IMAGE_TAG, "").replace(/[ \t]+/g, " ");
}

export function paragraphsOf(text: string): string[] {
  return stripImageTags(text)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export function sentenceCount(paragraph: string): number {
  return paragraph.split(/(?<=[.!?…])["'”’)\]]*\s+/).filter((s) => /\p{L}/u.test(s)).length;
}

type ImageTag = { raw: string; id?: string; source?: string; desc?: string; paragraph: number };

function imageTags(text: string): ImageTag[] {
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  return paragraphs.flatMap((paragraph, index) =>
    [...paragraph.matchAll(IMAGE_TAG)].map((match) => {
      const attrs = match[1];
      return {
        raw: match[0],
        id: /\bid=([^\s\]]+)/.exec(attrs)?.[1],
        source: /\bsource=([^\s\]]+)/.exec(attrs)?.[1],
        desc: /\bdesc="([^"]*)"/.exec(attrs)?.[1],
        paragraph: index,
      };
    })
  );
}

const META_WORDS =
  /\b(stats?|milestones?|this beat|beat \d|player ?\d|resolution ?\d|favorable|unfavorable|base ?points|success rate|game mechanics?|the player)\b/i;

const PAST_MARKERS = /\b(was|were|had|did)\b/gi;
const PRESENT_MARKERS = /\b(is|are|has|does)\b/gi;

/** The prompt's rule: normal +5 to -15; sacrifice and reward exactly the game's fixed bonus and malus. */
function basePointsInRange(option: BeatOption): boolean {
  if (option.optionType !== "challenge") return true;
  const { basePoints, resourceType } = option;
  if (resourceType === "sacrifice") return basePoints === POINTS_FOR_SACRIFICE;
  if (resourceType === "reward") return basePoints === POINTS_FOR_REWARD;
  return basePoints >= -15 && basePoints <= 5;
}

/** Which option type the story's current phase calls for, if it constrains one. */
function expectedOptionType(story: Story, slot: string): BeatOption["optionType"] | undefined {
  const beatType = story.getCurrentBeatType();
  if (beatType === "switch") return "exploration";
  if (beatType !== "thread") return undefined;
  const thread = story
    .getCurrentThreadAnalysis()
    ?.threads.find((t) => t.playersSideA.includes(slot) || t.playersSideB.includes(slot));
  if (!thread) return undefined;
  return getThreadType(thread) === "exploration" ? "exploration" : "challenge";
}

function knownIds(story: Story) {
  const state = story.getState();
  return {
    elements: new Set(["world", ...state.storyElements.map((e) => e.id)]),
    images: new Set([...state.images.map((i) => i.id), ...Object.keys(state.players), "cover"]),
    stats: new Set([...state.sharedStats.map((s) => s.id), ...state.playerStats.map((s) => s.id)]),
    outcomes: new Set([
      ...state.sharedOutcomes.map((o) => o.id),
      ...Object.values(state.players).flatMap((p) => p.outcomes.map((o) => o.id)),
    ]),
  };
}

/** A modifier's stat id: shared, a player stat, or a player stat with its slot ("player1_charisma"). */
function statIdExists(id: string, stats: Set<string>): boolean {
  if (stats.has(id)) return true;
  const slotted = /^player\d+_(.+)$/.exec(id);
  return slotted !== null && (stats.has(`player_${slotted[1]}`) || stats.has(slotted[1]));
}

function unchosenNames(story: Story): string[] {
  const state = story.getState();
  const chosen = new Set(Object.values(state.players).map((p) => p.name));
  return Object.values(state.characterSelectionOptions ?? {})
    .flatMap((o) => o.possibleCharacterIdentities.map((i) => i.name))
    .filter((name) => name && !chosen.has(name));
}

function checkBeat(beat: BeatGeneration, slot: string, story: Story, ids: ReturnType<typeof knownIds>) {
  const paragraphs = paragraphsOf(beat.text);
  const tags = imageTags(beat.text);
  const request: unknown = beat.imageRequest;
  const requested =
    request && typeof request === "object" && "id" in request && typeof request.id === "string"
      ? request.id
      : undefined;
  const expected = expectedOptionType(story, slot);
  const visible = [beat.title, beat.text, ...beat.options.map((o) => o.text), ...beat.interludes.map((i) => i.text)].join("\n");
  const prose = stripImageTags(beat.text);
  const newElementIds = new Set(beat.plan.newGameElements.map((c) => c.element.id));
  const unknown = [
    ...tags.filter((t) => t.id && !ids.images.has(t.id) && t.id !== requested).map((t) => `image:${t.id}`),
    ...beat.plan.establishedFacts
      .filter((f) => !ids.elements.has(f.storyElementId) && !newElementIds.has(f.storyElementId))
      .map((f) => `fact:${f.storyElementId}`),
    ...beat.plan.newIntroductionsOfStoryElements
      .filter((i) => !ids.elements.has(i.storyElementId) && !newElementIds.has(i.storyElementId))
      .map((i) => `intro:${i.storyElementId}`),
    ...beat.options.flatMap((o) =>
      o.optionType === "challenge"
        ? o.modifiersToSuccessRate.filter((m) => !statIdExists(m.statId, ids.stats)).map((m) => `modifier:${m.statId}`)
        : []
    ),
  ];
  const past = (prose.match(PAST_MARKERS) ?? []).length;
  const present = (prose.match(PRESENT_MARKERS) ?? []).length;
  const checks: Record<string, boolean> = {
    paragraphs: paragraphs.length >= 5 && paragraphs.length <= 6,
    sentences: paragraphs.every((p) => sentenceCount(p) >= 3 && sentenceCount(p) <= 5),
    // The ending prompt carries no option instructions (its title is "The End"), so any count passes there
    threeOptions: story.getCurrentBeatType() === "ending" || beat.options.length === 3,
    atMostOneSacrificeOrReward: beat.options.filter((o) => o.resourceType !== "normal").length <= 1,
    optionType: expected === undefined || beat.options.every((o) => o.optionType === expected),
    imageTagsWellFormed: tags.every((t) => t.id !== undefined && t.source !== undefined && t.desc !== undefined),
    noImageInLastParagraph: tags.every((t) => t.paragraph < paragraphs.length - 1),
    requestedImageUsed: !requested || tags.some((t) => t.id === requested),
    threeInterludes: beat.interludes.length === 3,
    basePoints: beat.options.every(basePointsInRange),
    modifierRange: beat.options.every(
      (o) => o.optionType !== "challenge" || o.modifiersToSuccessRate.every((m) => m.effect >= -15 && m.effect <= 15)
    ),
    knownIds: unknown.length === 0,
    secondPerson: /\byou(r|rs|rself)?\b/i.test(prose),
    presentTense: past <= present,
    noMetaWords: !META_WORDS.test(visible),
    characterNames: !unchosenNames(story).some((name) => new RegExp(`\\b${escapeRegExp(name)}\\b`).test(visible)),
  };
  const counts = {
    facts: beat.plan.establishedFacts.length,
    newElements: beat.plan.newGameElements.length,
    introductions: beat.plan.newIntroductionsOfStoryElements.length,
    paragraphs: paragraphs.length,
  };
  return { checks, counts, unknown };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function merge(results: CheckResult[]): CheckResult {
  const checks: Record<string, boolean> = {};
  const counts: Record<string, number> = {};
  for (const result of results) {
    for (const [name, ok] of Object.entries(result.checks)) checks[name] = (checks[name] ?? true) && ok;
    for (const [name, n] of Object.entries(result.counts)) counts[name] = (counts[name] ?? 0) + n;
  }
  return { checks, counts, unknownIds: results.flatMap((r) => r.unknownIds) };
}

/** Every player's beat in one reply, plus the reply's stat changes and milestones. */
export function checkBeatSet(output: SetOfBeatGenerationSchema, story: Story): CheckResult {
  const ids = knownIds(story);
  const perPlayer = story.getPlayerSlots().map((slot) => {
    const beat = Object.entries(output).find(([key]) => key === slot)?.[1] as BeatGeneration | undefined;
    if (!beat || typeof beat !== "object") {
      return { checks: { playerBeatPresent: false }, counts: {}, unknownIds: [] };
    }
    const { checks, counts, unknown } = checkBeat(beat, slot, story, ids);
    return { checks: { playerBeatPresent: true, ...checks }, counts, unknownIds: unknown };
  });
  const milestones = Array.isArray(output.newMilestones) ? output.newMilestones : [];
  const unknown: string[] = [];
  for (const change of [...output.statChanges, ...milestones]) {
    if (change.type === "statChange" && !ids.stats.has(change.stat)) unknown.push(`stat:${change.stat}`);
    if (change.type === "newMilestone" && !ids.outcomes.has(change.outcome)) unknown.push(`outcome:${change.outcome}`);
  }
  const set: CheckResult = { checks: { knownChangeIds: unknown.length === 0 }, counts: { statChanges: output.statChanges.length }, unknownIds: unknown };
  return merge([...perPlayer, set]);
}

export const ALLOWED_DIFFICULTY_MODIFIERS = [-20, -10, 0, 10, 20];

/** The setup fields the checks read (StorySetupGeneration has them all). */
export type SetupShape = {
  difficultyLevel?: { modifier: number };
  sharedStats: { isVisible?: boolean }[];
  playerStats: { isVisible?: boolean }[];
  storyElements: unknown[];
  guidelines: { typesOfThreads: unknown[] };
  [slot: `player${number}`]: unknown;
};

/** The prompt asks for 3-4 visible stats per list, plus any invisible ones. */
function visibleCount(stats: { isVisible?: boolean }[]): number {
  return stats.filter((stat) => stat.isVisible !== false).length;
}

export function checkSetup(output: SetupShape, input: SetupInput): CheckResult {
  const slots = Object.keys(output).filter((key) => /^player\d+$/.test(key));
  const expected = Array.from({ length: input.playerCount }, (_, i) => `player${i + 1}`);
  const between = (n: number, min: number, max: number) => n >= min && n <= max;
  return {
    checks: {
      difficultyModifier:
        output.difficultyLevel !== undefined &&
        ALLOWED_DIFFICULTY_MODIFIERS.includes(output.difficultyLevel.modifier),
      playerSlots: slots.length === expected.length && expected.every((s) => slots.includes(s)),
      sharedStats: between(visibleCount(output.sharedStats), 3, 4),
      playerStats: between(visibleCount(output.playerStats), 3, 4),
      threadTypes: between(output.guidelines.typesOfThreads.length, 6, 8),
    },
    counts: {
      sharedStats: output.sharedStats.length,
      playerStats: output.playerStats.length,
      storyElements: output.storyElements.length,
    },
    unknownIds: [],
  };
}

export function checkSwitch(output: SwitchAnalysis, story: Story): CheckResult {
  const slots = story.getPlayerSlots();
  const ids = knownIds(story);
  const assigned = output.switches.flatMap((s) => s.players);
  const unknown = output.switches
    .filter((s) => s.type === "flavor" && !ids.outcomes.has(s.outcomeId))
    .map((s) => `outcome:${s.outcomeId}`);
  return {
    checks: {
      everyPlayerOnce: slots.every((slot) => assigned.filter((p) => p === slot).length === 1),
      topicChoices: output.switches.every((s) => s.type !== "topic" || s.topicChoices.length === 3),
      knownIds: unknown.length === 0,
    },
    counts: { switches: output.switches.length },
    unknownIds: unknown,
  };
}

export function checkThread(output: ThreadAnalysis): CheckResult {
  return {
    checks: {
      duration: output.duration >= 2 && output.duration <= 4,
      stepPerBeat: output.threads.every((t) => t.progression.length === output.duration),
    },
    counts: { threads: output.threads.length },
    unknownIds: [],
  };
}

const STOCK_PHRASES = [
  "a testament to",
  "tapestry",
  "the air is thick",
  "the air hums",
  "a mix of",
  "can't help but",
  "sends a shiver",
  "palpable",
  "heart pounds",
  "a sense of",
  "hangs in the air",
  "it's not just",
  "little did",
  "in the distance",
];

/** Opening-word variety and stock-phrase frequency across a set of beat texts. */
export function aggregateProse(texts: string[]): {
  beats: number;
  distinctOpenings: number;
  youOpenings: number;
  stockPhrasesPer1000Words: number;
  topStockPhrases: [string, number][];
} {
  const openings = texts.map((t) => stripImageTags(t).trim().split(/\s+/).slice(0, 2).join(" ").toLowerCase());
  const words = texts.reduce((sum, t) => sum + stripImageTags(t).split(/\s+/).filter(Boolean).length, 0);
  const counts = STOCK_PHRASES.map((phrase): [string, number] => [
    phrase,
    texts.reduce((sum, t) => sum + (t.toLowerCase().split(phrase).length - 1), 0),
  ]).filter(([, n]) => n > 0);
  const total = counts.reduce((sum, [, n]) => sum + n, 0);
  return {
    beats: texts.length,
    distinctOpenings: new Set(openings).size,
    youOpenings: openings.filter((o) => o.startsWith("you ")).length,
    stockPhrasesPer1000Words: words > 0 ? (total / words) * 1000 : 0,
    topStockPhrases: counts.sort((a, b) => b[1] - a[1]).slice(0, 5),
  };
}
