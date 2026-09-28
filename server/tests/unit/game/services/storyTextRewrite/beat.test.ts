import { jest } from "@jest/globals";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { POINTS_FOR_REWARD, POINTS_FOR_SACRIFICE } from "core/config.js";
import type { Story } from "core/models/Story.js";
import type { Change, SetOfBeatGenerationSchema } from "core/types/index.js";
import { beatStep } from "../../../../../src/game/services/storyTextSteps.js";
// The rewrite is built on production's request as it stood at the round0 prompt state; how a reply changes the story stays production's
import { round0BeatStep } from "../../../../../src/game/services/storyTextRound0/round0Steps.js";
import { trimmedBeatRequest } from "../../../../../src/game/services/storyTextTrims.js";
import { rewriteBeatRequest, type RewriteScaffold } from "../../../../../src/game/services/storyTextRewrite/beat.js";
import { NO_EMPTY_ITEMS, type RewriteCounts } from "../../../../../src/game/services/storyTextRewrite/common.js";
import { endingBeat, firstSwitchBeat, laterSwitchBeat, threadBeat } from "../../../../helpers/promptStories.js";
import { beatGeneration, beatSet, switchAnalysis, threadAnalysis } from "../../../../helpers/textFixtures.js";
import { createMockMultiplayerStory } from "../../../../helpers/testHelpers.js";
import { allCapsWords, countKeywords, countOf, descriptionsOf, find, repeatedSentences, withoutCounts } from "./rewriteChecks.js";

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const STATE_MARKER = "======= CURRENT GAME STATE =======";
const SCAFFOLDS: RewriteScaffold[] = ["full", "slim"];

/** A thread step: `completed` steps of a `duration`-beat thread already resolved. */
function threadStepStory(kind: "challenge" | "exploration", duration: number, completed: number): Story {
  const thread = threadAnalysis(kind, duration, 2);
  for (let i = 0; i < completed; i++) thread.threads[0].progression[i].resolution = kind === "challenge" ? "favorable" : "resolution1";
  return threadBeat(1, { storyPhases: [switchAnalysis(["player1"], 1), thread] });
}

/** [case, story, text that proves production took the branch the case names] */
type Branch = [string, () => Story, string];

const BRANCHES: Branch[] = [
  ["first beat with images (template)", () => firstSwitchBeat(1, { templateId: "tpl-1" }), "In this first beat of the story, include an image"],
  ["first beat without images", () => firstSwitchBeat(1), "This story does not support images."],
  ["later switch after a resolved thread", () => laterSwitchBeat(1), "Since a thread was just resolved"],
  ["thread step 1 of 3", () => threadStepStory("challenge", 3, 0), "Remember that this is beat 1/3"],
  ["thread step 2 of 3 after a favorable beat", () => threadStepStory("challenge", 3, 1), "If the previous beat for this player was favorable"],
  ["the last thread step", () => threadStepStory("challenge", 2, 1), "This is the last beat of the thread"],
  ["an exploration-thread step", () => threadStepStory("exploration", 3, 1), "Remember that this is beat 2/3"],
  ["the ending", () => endingBeat(1), "transition to an overall ending"],
  ["a custom story that generates images, with an empty library", () => threadBeat(1, { generateImages: true }), "does not yet have any non-player images"],
];

const CASES = SCAFFOLDS.flatMap((scaffold) => BRANCHES.map(([name, build, marker]) => [scaffold, name, build, marker] as const));

/** exact: the Stage 4 form as it ran (its records stay reproducible); worded: the count fix. */
const FORMS: RewriteCounts[] = ["exact", "worded"];
const FORM_CASES = FORMS.flatMap((counts) => CASES.map(([scaffold, name, build]) => [counts, scaffold, name, build] as const));

/** The per-call instructions: the per-call message before production's story state. */
const instructionsOf = (perCall: string) => perCall.slice(0, perCall.indexOf(STATE_MARKER));

describe("rewriteBeatRequest", () => {
  it.each(CASES)("%s, %s: builds, and production takes the branch", (scaffold, _, build, marker) => {
    const story = build();
    expect(round0BeatStep.request(story).prompt).toContain(marker);
    expect(() => rewriteBeatRequest(story, scaffold)).not.toThrow();
    expect(() => rewriteBeatRequest(story, scaffold, "worded")).not.toThrow();
  });

  it("throws on a multiplayer story", () => {
    expect(() => rewriteBeatRequest(createMockMultiplayerStory(2), "slim")).toThrow("Stage 4 rewrite covers single-player beats");
  });

  it.each(FORMS)("%s counts: keeps the fixed rules byte-identical across every branch and both scaffolds, so they cache", (counts) => {
    const fixed = new Set(CASES.map(([scaffold, , build]) => rewriteBeatRequest(build(), scaffold, counts).fixed));
    expect(fixed.size).toBe(1);
  });

  it("builds the Stage 4 form by default", () => {
    const story = threadStepStory("challenge", 3, 1);
    const sent = (request: ReturnType<typeof rewriteBeatRequest>) => ({ ...request, schema: JSON.stringify(toJsonSchema(request.schema)) });
    expect(sent(rewriteBeatRequest(story, "slim"))).toEqual(sent(rewriteBeatRequest(story, "slim", "exact")));
  });

  it("words the count fix's fixed rules as the Stage 4 form's plus the line that no list item is empty", () => {
    const story = threadStepStory("challenge", 3, 1);
    const exact = rewriteBeatRequest(story, "slim", "exact").fixed;
    const worded = rewriteBeatRequest(story, "slim", "worded").fixed;
    expect(exact).not.toContain(NO_EMPTY_ITEMS);
    expect(worded.split(NO_EMPTY_ITEMS)).toHaveLength(2);
    expect(worded.replace(`${NO_EMPTY_ITEMS}\n`, "")).toBe(exact);
  });

  it.each(FORM_CASES)("%s counts, %s, %s: the per-call message ends with production's story state, byte for byte", (counts, scaffold, _, build) => {
    const story = build();
    const production = round0BeatStep.request(story).prompt;
    const state = production.slice(production.indexOf(STATE_MARKER));
    const { perCall } = rewriteBeatRequest(story, scaffold, counts);
    expect(perCall.endsWith(state)).toBe(true);
    expect(perCall.indexOf(STATE_MARKER)).toBe(perCall.length - state.length);
  });
});

describe("the rewrite's schema", () => {
  it.each(FORM_CASES)("%s counts, %s, %s: the field set, types, key order and shared references of its base", (counts, scaffold, _, build) => {
    const story = build();
    const base = scaffold === "full" ? round0BeatStep.request(story).schema : trimmedBeatRequest(story, "slim").schema;
    const rewrite = rewriteBeatRequest(story, scaffold, counts).schema;
    expect(JSON.stringify(withoutCounts(toJsonSchema(rewrite)))).toBe(JSON.stringify(withoutCounts(toJsonSchema(base))));
  });

  it.each(CASES)("exact counts, %s, %s: counts", (scaffold, _, build) => {
    const story = build();
    const json = toJsonSchema(rewriteBeatRequest(story, scaffold).schema);
    const player = find(json, ["properties", "player1"]);
    const options = find(player, ["properties", "options"]);
    if (story.getCurrentBeatType() === "ending") {
      expect(countOf(options)).toEqual({});
    } else {
      expect(countOf(options)).toEqual({ minItems: 3, maxItems: 3 });
    }
    expect(countOf(find(player, ["properties", "interludes"]))).toEqual({ minItems: 3, maxItems: 3 });
    expect(countOf(find(player, ["properties", "plan", "properties", "showDontTell"]))).toEqual({ minItems: 3, maxItems: 3 });
    expect(countOf(find(options, ["items", "anyOf", "1", "properties", "modifiersToSuccessRate"]))).toEqual({ maxItems: 2 });
  });

  it.each(CASES)("worded counts, %s, %s: caps only, no minItems anywhere", (scaffold, _, build) => {
    const story = build();
    const json = toJsonSchema(rewriteBeatRequest(story, scaffold, "worded").schema);
    expect(countKeywords(json).filter((keyword) => keyword.startsWith("minItems"))).toEqual([]);
    const player = find(json, ["properties", "player1"]);
    const options = find(player, ["properties", "options"]);
    expect(countOf(options)).toEqual(story.getCurrentBeatType() === "ending" ? {} : { maxItems: 3 });
    expect(countOf(find(player, ["properties", "interludes"]))).toEqual({ maxItems: 4 });
    expect(countOf(find(player, ["properties", "plan", "properties", "showDontTell"]))).toEqual({ maxItems: 3 });
    expect(countOf(find(options, ["items", "anyOf", "1", "properties", "modifiersToSuccessRate"]))).toEqual({ maxItems: 2 });
  });

  it.each(CASES)("worded counts, %s, %s: every count in words in its field's description", (scaffold, _, build) => {
    const story = build();
    const json = toJsonSchema(rewriteBeatRequest(story, scaffold, "worded").schema);
    const player = find(json, ["properties", "player1"]);
    const description = (...path: string[]) => String(find(player, [...path, "description"]));
    if (story.getCurrentBeatType() === "ending") {
      expect(description("properties", "options")).toMatch(/^The story ends with this beat, so this list stays empty\./);
    } else {
      expect(description("properties", "options")).toMatch(/^Exactly three choices for the player/);
    }
    expect(description("properties", "interludes")).toMatch(/^Two to four snippets/);
    expect(description("properties", "plan", "properties", "showDontTell")).toMatch(/^One to three of the most important/);
    expect(description("properties", "options", "items", "anyOf", "1", "properties", "modifiersToSuccessRate")).toMatch(/^Up to two of the most relevant stats/);
  });
});

describe("a rewrite reply works in production code", () => {
  const SLIM_DROPS = ["forPlayer", "developmentsToNarrate", "beatTypeConsiderations", "otherBeats", "worldBuilding", "showDontTellPreviousDecision"];
  const FORM_SCAFFOLDS = FORMS.flatMap((counts) => SCAFFOLDS.map((scaffold) => [counts, scaffold] as const));

  it.each(FORM_SCAFFOLDS)("%s counts, %s: the same changes and stored beat as production's parse (slim drops only its fields)", (counts, scaffold) => {
    const story = laterSwitchBeat(1);
    const statChange: Change = { type: "statChange", group: "shared", stat: "gold", change: "addNumber", value: 5 };
    const milestone: Change = { type: "newMilestone", outcomeGroup: "player1", outcome: "o1", newMilestone: "m" };
    const fact: Change = { type: "newFact", storyElementId: "world", fact: "The river runs uphill at dusk." };
    const beat = beatGeneration({ summary: "The ferryman hands the player a silver key." });
    beat.plan.showDontTell = ["The player pays the ferryman.", "The key glints.", "The river turns."];
    beat.plan.establishedFacts = [fact];
    const reply = { ...beatSet(1, { statChanges: [statChange], newMilestones: [milestone], player1: beat }), multiplayerCoordination: "" };

    const fromProduction: SetOfBeatGenerationSchema = round0BeatStep.request(story).schema.parse(reply);
    const fromRewrite: SetOfBeatGenerationSchema = rewriteBeatRequest(story, scaffold, counts).schema.parse(reply);
    const [productionStory, productionChanges] = beatStep.apply(story, fromProduction);
    const [rewriteStory, rewriteChanges] = beatStep.apply(story, fromRewrite);
    expect(rewriteChanges).toEqual(productionChanges);

    const stored = (s: Story) => s.getCurrentBeat("player1");
    const expectedPlan = Object.fromEntries(
      Object.entries(fromProduction.player1.plan).filter(([key]) => scaffold === "full" || !SLIM_DROPS.includes(key))
    );
    expect(stored(rewriteStory)).toEqual({ ...stored(productionStory), plan: expectedPlan });
  });
});

type Part = "fixed" | "perCall" | "schema";
type Rule = { id: string; part: Part; applies: (story: Story) => boolean; pattern: string };

const always = () => true;
const type = (story: Story) => story.getCurrentBeatType();
const showsImages = (story: Story) => story.hasImages() || story.generatesImages();
const laterSwitch = (story: Story) => type(story) === "switch" && !story.isFirstBeat();
const threadStep = (story: Story) => story.getCurrentThreadBeatsCompleted() + 1;
const lastStep = (story: Story) => type(story) === "thread" && threadStep(story) === story.getCurrentThreadDuration();
const challengeStepAfterAnother = (story: Story) =>
  type(story) === "thread" && threadStep(story) > 1 && story.getCurrentThreadType() !== "exploration";

/** One entry per row of plan table B (a row with two branch variants has two entries). */
const BEAT_RULES: Rule[] = [
  { id: "B1 persona", part: "fixed", applies: always, pattern: "You are the narrator of an interactive story game" },
  { id: "B2 person and tense", part: "fixed", applies: always, pattern: "Write in the second person and the present tense" },
  { id: "B3 length", part: "fixed", applies: always, pattern: "Write 5 to 6 paragraphs of 3 to 5 sentences each" },
  { id: "B4 show, don't tell", part: "fixed", applies: always, pattern: "When the sun sets, the moon will rise." },
  { id: "B5 continuity", part: "fixed", applies: always, pattern: "picks up exactly where this player's previous beat ended" },
  { id: "B6 openings and names", part: "fixed", applies: always, pattern: "avoid openings such as" },
  { id: "B7 game words", part: "fixed", applies: always, pattern: "Game words stay out of everything the player sees" },
  { id: "B8 phrases to avoid", part: "fixed", applies: always, pattern: "Leave out contrastive" },
  { id: "B9 last paragraph", part: "fixed", applies: always, pattern: "The last paragraph never mentions or hints" },
  { id: "B10 inconsistent state", part: "fixed", applies: always, pattern: "use the most plausible reading and continue" },
  { id: "B11 how the game works", part: "fixed", applies: always, pattern: "It takes 50 points to turn a 33/34/33 distribution" },
  { id: "B12 stat changes", part: "fixed", applies: always, pattern: 'only stats marked "Can be adjusted anytime" change' },
  { id: "B13 thread resolved", part: "perCall", applies: (s) => laterSwitch(s) || type(s) === "ending", pattern: "any stat may change now" },
  { id: "B14 story elements", part: "fixed", applies: always, pattern: "only when it is likely to come back in later beats" },
  { id: "B15 facts", part: "fixed", applies: always, pattern: "3 or more per switch and per thread step" },
  { id: "B16 stats shape options", part: "fixed", applies: always, pattern: "the stats shape which options exist" },
  { id: "B17 option type", part: "perCall", applies: (s) => type(s) !== "ending", pattern: "The options of this beat are" },
  { id: "B18 step question", part: "perCall", applies: (s) => type(s) === "thread", pattern: "answer the question of this step" },
  { id: "B19 switch options", part: "perCall", applies: (s) => type(s) === "switch", pattern: "the directions that the switch configuration lists" },
  { id: "B20 progression", part: "perCall", applies: (s) => type(s) === "thread", pattern: "Follow the thread's progression plan" },
  { id: "B21 last step", part: "perCall", applies: lastStep, pattern: "This is the thread's last step" },
  { id: "B21 not the last step", part: "perCall", applies: (s) => type(s) === "thread" && !lastStep(s), pattern: "The thread goes on after this beat" },
  { id: "B22 tone", part: "perCall", applies: (s) => laterSwitch(s) || challengeStepAfterAnother(s), pattern: "sets the tone of this one" },
  { id: "B23 milestone paragraph", part: "perCall", applies: laterSwitch, pattern: "spend at least one full paragraph on its new milestone" },
  { id: "B24 first beat", part: "perCall", applies: (s) => s.isFirstBeat(), pattern: "hint at the outcomes that will decide their ending" },
  { id: "B25 ending", part: "perCall", applies: (s) => type(s) === "ending", pattern: "Close the previous thread first" },
  { id: "B26 title", part: "perCall", applies: always, pattern: "The beat's title is" },
  { id: "B27 image tags", part: "schema", applies: showsImages, pattern: "Image tags show pictures from the story's image library" },
  { id: "B28 no image tags", part: "schema", applies: (s) => !showsImages(s), pattern: "carries no image tags" },
  { id: "B29 portrait source", part: "perCall", applies: showsImages, pattern: "The source of player portraits is" },
  { id: "B29 empty library", part: "perCall", applies: (s) => showsImages(s) && !s.hasImages(), pattern: "no pictures besides the player portraits yet" },
  { id: "B30 first-beat portrait", part: "perCall", applies: (s) => s.isFirstBeat() && showsImages(s), pattern: "plus a picture of another story element" },
  { id: "B31 image requests", part: "schema", applies: (s) => s.generatesImages(), pattern: "analysing magic glyphs" },
  { id: "B32 interludes", part: "schema", applies: always, pattern: "stream of consciousness of the player character" },
  { id: "B33 options as a set", part: "schema", applies: (s) => type(s) !== "ending", pattern: "At most one option in the set is a sacrifice or reward option" },
  { id: "B34 no options at the end", part: "schema", applies: (s) => type(s) === "ending", pattern: "so this list stays empty" },
  { id: "B35 modifier cap", part: "schema", applies: always, pattern: "When the stat's definition names a larger effect, use 15" },
  { id: "B36 show-don't-tell points", part: "schema", applies: always, pattern: "each with a short pointer on how to show it" },
  { id: "B37 descriptions are instructions", part: "fixed", applies: always, pattern: "The field descriptions in the reply format are part of these instructions." },
];

/** The count fix's rule: in the fixed text of the worded form only. */
const noEmptyItems = (counts: RewriteCounts): Rule => ({
  id: "no empty list items",
  part: "fixed",
  applies: () => counts === "worded",
  pattern: "a list never holds an empty or blank item",
});

function partsOf(story: Story, scaffold: RewriteScaffold, counts: RewriteCounts = "exact"): Record<Part, string> {
  const request = rewriteBeatRequest(story, scaffold, counts);
  return { fixed: request.fixed, perCall: request.perCall, schema: descriptionsOf(toJsonSchema(request.schema)).join("\n") };
}

const occurrences = (text: string, pattern: string) => text.split(pattern).length - 1;

describe("every rule of table B, once, where the table puts it", () => {
  it.each(FORM_CASES)("%s counts, %s, %s", (counts, scaffold, _, build) => {
    const story = build();
    const parts = partsOf(story, scaffold, counts);
    for (const rule of [...BEAT_RULES, noEmptyItems(counts)]) {
      const found = Object.fromEntries((Object.keys(parts) as Part[]).map((part) => [part, occurrences(parts[part], rule.pattern)]));
      const expected = { fixed: 0, perCall: 0, schema: 0, ...(rule.applies(story) ? { [rule.part]: 1 } : {}) };
      expect({ rule: rule.id, found }).toEqual({ rule: rule.id, found: expected });
    }
  });

  it("states the sacrifice and reward points with their signs", () => {
    const schema = partsOf(threadStepStory("challenge", 3, 1), "slim").schema;
    expect(schema).toContain(`+${POINTS_FOR_SACRIFICE}`);
    expect(schema).toContain(`${POINTS_FOR_REWARD}`);
    expect(POINTS_FOR_REWARD).toBeLessThan(0);
  });
});

describe("stated once, without shouting", () => {
  it.each(FORM_CASES)("%s counts, %s, %s", (counts, scaffold, _, build) => {
    const parts = partsOf(build(), scaffold, counts);
    const texts = [parts.fixed, instructionsOf(parts.perCall), parts.schema];
    expect(repeatedSentences(texts)).toEqual([]);
    expect(texts.flatMap(allCapsWords)).toEqual([]);
  });

  it("asks for facts only from the second beat on, since the first beat adds none", () => {
    const first = rewriteBeatRequest(firstSwitchBeat(1), "slim");
    expect(first.perCall).toContain("Add no new story elements and no new facts");
    expect(first.fixed).toMatch(/from the second beat on, 3 or more per switch and per thread step/);
  });
});

/**
 * Clauses of production's field descriptions that restate a rule the
 * rewrite's prompt carries. The exact-sentence check cannot see a
 * paraphrase, so they are pinned by name: the rewrite's descriptions leave
 * them out.
 */
const RESTATED_BY_PRODUCTION_DESCRIPTIONS = [
  "If a switch: [title of the switch]",
  "Create one item for each outcome of each thread that has been concluded",
  "Include stat sacrifices and rewards",
  "'adjustments after threads' parameters",
  "that is likely to be used in later beats",
  "that are likely to be used in later beats",
  "Plan a detail that makes the player curious",
  "Use 'world' as the story element",
];

describe("no rule in the prompt is restated in a field description", () => {
  const productionDescriptions = (story: Story) => descriptionsOf(toJsonSchema(round0BeatStep.request(story).schema)).join("\n");

  it("every pinned clause is production's (a later switch on the full scaffold carries them all)", () => {
    const production = productionDescriptions(laterSwitchBeat(1));
    for (const clause of RESTATED_BY_PRODUCTION_DESCRIPTIONS) {
      expect({ clause, inProduction: production.includes(clause) }).toEqual({ clause, inProduction: true });
    }
  });

  it.each(FORM_CASES)("%s counts, %s, %s", (counts, scaffold, _, build) => {
    const schema = partsOf(build(), scaffold, counts).schema;
    for (const clause of RESTATED_BY_PRODUCTION_DESCRIPTIONS) {
      expect({ clause, inRewrite: schema.includes(clause) }).toEqual({ clause, inRewrite: false });
    }
  });
});
