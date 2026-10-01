import { describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import type { Story } from "core/models/Story.js";
import { GameModes, type GameMode, type StoryState, type ThreadAnalysis } from "core/types/index.js";
import { beatStep, switchStep, threadStep } from "../../../../src/game/services/storyTextSteps.js";
import { todaysFormWithB6Request } from "../../../../src/game/services/storyTextRounds/turnRound2.js";
import { round0BeatStep } from "../../../../src/game/services/storyTextRound0/round0Steps.js";
import { evalFiles } from "../../../../src/evals/textModelEval/evalFiles.js";
import { caseStory } from "../../../../src/evals/textModelEval/cases.js";
import { endingBeat, firstSwitchBeat, laterSwitchBeat, threadAnalysisAfterSwitch, threadBeat } from "../../../helpers/promptStories.js";
import { endedChapter, outcome, roundStory, topicSwitch } from "../../../helpers/roundStories.js";
import { stat, threadAnalysis, type ThreadKind } from "../../../helpers/textFixtures.js";
import {
  CHAPTER_RULES_HEADING,
  GROWN_UP_PICTURE_PLACES,
  KIDS_BAND_PICTURE_PLACES,
  adoptedTurn,
  kidsAgesAsMeasured,
  withEndingOnlyPlayed,
  withKidsBandImageSlots,
  withKidsImageSlots,
  withKidsImageSlotsSchema,
  withLateClues,
  withOptionsO2c,
  withShortReplies,
} from "../../../helpers/adoptedDeltas.js";
import { ENDING_STATE_TEXT, endingStateRequest, scoreboardEnding } from "../../../../src/game/services/storyTextRounds/endingState.js";
import { ENDING_MILESTONES_PLAYED, ENDING_OUTCOME_KINDS, SCOREBOARD_ENDING_RULE } from "../../../../src/game/services/prompts/BeatPromptService.js";
import { CHOICE_RESULT_TEXT, choiceResultRequest, takesExplorationOrder } from "../../../../src/game/services/storyTextRounds/choiceResult.js";
import { KIDS_TURN_TEXT, kidsTurnRequest } from "../../../../src/game/services/storyTextRounds/kidsTurn.js";
import { KIDS_AGES_TEXT, kidsAgesBand, kidsAgesShortTextCount, kidsAgesTurnRequest } from "../../../../src/game/services/storyTextRounds/kidsAges.js";
import { KIDS_BAND_TURNS, beatCheckOptions, takesKidsRules } from "../../../../src/game/services/kidsTurnRules.js";
import { GROUP_LEVERS_TEXT, groupLeversBase, groupLeversRequest, takesGroupLevers } from "../../../../src/game/services/storyTextRounds/groupLevers.js";
import { GROUP_LEVER_QUESTION, GROUP_SHARED_AND_OWN, REWARD_EXCEPTION, groupLeverSlots, groupSacrificeRewardLines, takesOptionRules } from "../../../../src/game/services/optionRules.js";
import { GROUP_OPTIONS_TEXT, groupOptionsBase, groupOptionsLine, groupOptionsRequest } from "../../../../src/game/services/storyTextRounds/groupOptions.js";
import { o2cLeverLine, optionsO2cBase, optionsO2cRequest } from "../../../../src/game/services/storyTextRounds/optionsO2c.js";
import { OPTIONS_CONTINUITY_TEXT } from "../../../../src/game/services/storyTextRounds/turnOptionsContinuity.js";

/*
 * Production's turns are today's form with the option rules (B6) alone, as
 * the setup-to-play chain ran them (variant turnB6): single-player challenge
 * and contest chapter steps get B6's lines, fields and computed lever line;
 * every other single-player turn, and every group turn (B6 was never built or
 * measured for groups), is today's request (the frozen round0 form), byte
 * for byte, on the stories the tests build and on every frozen beat case,
 * apart from the logged turn delta (adoptedDeltas.ts): since the owner's
 * feedback of 2026-09-28, no chapter rules on a switch turn. Every ending,
 * since the owner's decision of 2026-09-30, is the measured variant
 * endingStateB byte for byte (each outcome told as its milestones leave it,
 * the scoreboard rule with its unfinished half); until then an ending was
 * today's form with the scoreboard rule on a scored contest's ending. Since
 * the choice-result stage of 2026-09-30, a group turn where a player's thread
 * explores is the measured variant choiceResult byte for byte (the
 * exploration-order line after the option types); since the choice-line-sp
 * stage of the same day, a single player's exploration step is too (measured
 * with production's one retry of a short reply in the loop). Since the
 * kids-turns stage of 2026-10-01, a single player's turn in a story read with
 * a child is the measured variant kidsTurn byte for byte, every turn kind,
 * apart from the logged image places where it shows images; since the
 * kids-ages stage of the same day, a read-with-kids turn of every player count
 * is the measured kidsAges, by the children's age band, apart from the logged
 * picture places by band where it shows images. Since the owner's
 * decision of 2026-10-01 every ending carries one logged delta: only what was
 * played gets a milestone, and an unfinished outcome is told as unfinished
 * (withEndingOnlyPlayed). Since the group-levers stage of the same day, a
 * group's chapter step with a player in a challenge or contest thread is the
 * measured fix-and-retest groupLeversB byte for byte (B6's lever parts for
 * each such player, the plan's lever question asked from the player's line),
 * a player exploring beside them included. Since the short-replies stage of the
 * same day every turn, every form, carries that stage's measured lines (the
 * text never ends after its first paragraph: one in the text rules, one in each
 * player's text field), which the forms measured before it never had
 * (withShortReplies). Since the group-options stage of the same day (decision
 * A, that evening), a group's rolled step is the measured groupOptions byte for
 * byte (each rolled player's line by the owner's rules per player and chapter,
 * O2b's stat lines, the plan's lever question from those lines), whose base is
 * groupLeversB as before (expectGroup).
 */

/**
 * The measured request production must send: the ending as endingStateB, a
 * group's rolled chapter step as groupLeversB, an exploration step as
 * choiceResult (every player count), else a single player's turnB6 or a
 * group's today's form.
 */
function measuredTurn(story: Story): { prompt: string; schema: Parameters<typeof toJsonSchema>[0] } {
  if (story.getCurrentBeatType() === "ending") return endingStateRequest(story);
  if (takesGroupLevers(story)) return groupLeversRequest(story, { b: true });
  if (takesExplorationOrder(story)) return choiceResultRequest(story);
  return story.isMultiplayer() ? round0BeatStep.request(story) : todaysFormWithB6Request(story);
}

jest.spyOn(console, "log").mockImplementation(() => undefined);

const json = (schema: Parameters<typeof toJsonSchema>[0]) => JSON.stringify(toJsonSchema(schema));

const CASES_DIR = path.resolve("..", "DOCS", "2026-09-26_gpt6-text-eval");
const frozen = fs.existsSync(path.join(CASES_DIR, "cases", "cases.json")) ? evalFiles(CASES_DIR).readCases() : [];
/** The kids-ages stage's turn cases (kidsAgesCases.ts), where the eval's output folder holds them. */
const KIDS_AGES_CASES = frozen.filter((c) => c.role === "beat" && c.id.startsWith("round-kids-ages-"));

const GUILD = "player1_guild_reform";
const ENCLAVE = "player1_enclave_trust";
const OUTCOMES = { player1: [outcome(GUILD, { milestones: ["Sir Bram listened"] }), outcome(ENCLAVE)] };
const DIRECTIONS: [string, string][] = [
  ["Petition the Guild", GUILD],
  ["Win over the enclave", ENCLAVE],
  ["Print the pamphlet", GUILD],
];

function chapterStep(kind: ThreadKind, done: number, duration = 3): Story {
  const analysis = threadAnalysis(kind, duration, 1);
  const chapter: ThreadAnalysis = {
    ...analysis,
    threads: analysis.threads.map((t) => ({
      ...t,
      outcomeId: GUILD,
      progression: t.progression.map((step, i) => ({ ...step, resolution: i < done ? (kind === "exploration" ? ("resolution1" as const) : ("favorable" as const)) : null })),
    })),
  };
  return roundStory({ turns: 1 + done, maxTurns: 20, playerOutcomes: OUTCOMES, phases: [topicSwitch(DIRECTIONS, 0), chapter] });
}

const SINGLE_PLAYER: [string, () => Story][] = [
  ["the first switch", () => firstSwitchBeat(1)],
  ["a later switch", () => laterSwitchBeat(1)],
  ["a challenge step", () => threadBeat(1)],
  ["a challenge chapter's opening", () => chapterStep("challenge", 0)],
  ["a challenge chapter's middle step", () => chapterStep("challenge", 1)],
  ["a challenge chapter's last step", () => chapterStep("challenge", 2)],
  ["an exploration step", () => chapterStep("exploration", 1)],
  ["the ending", () => endingBeat(1)],
  [
    "a switch after a chapter",
    () => roundStory({ turns: 5, maxTurns: 20, playerOutcomes: OUTCOMES, phases: [topicSwitch(DIRECTIONS, 0), endedChapter(GUILD, 4, 1, "The Guild hears"), topicSwitch(DIRECTIONS, 5)] }),
  ],
];

/** A group's step 2 of a 3-beat thread from history index 2: one exploration thread for everyone, or player1 exploring beside the others' challenge. */
function groupStep(players: number, kind: "exploration" | "mixed"): Story {
  const story = threadBeat(players);
  const state = structuredClone(story.getState());
  const analysis = state.storyPhases[1] as ThreadAnalysis;
  const explore = <T extends ThreadAnalysis["threads"][number]>(t: T): T => ({
    ...t,
    possibleMilestones: { resolution1: "one", resolution2: "two", resolution3: "three" },
    progression: t.progression.map((s, i) => ({ ...s, possibleResolutions: { resolution1: "one", resolution2: "two", resolution3: "three" }, resolution: i === 0 ? ("resolution1" as const) : null })),
  });
  analysis.threads =
    kind === "exploration"
      ? analysis.threads.map(explore)
      : [
          { ...explore(analysis.threads[0]), id: "explore", playersSideA: ["player1"] },
          { ...analysis.threads[0], id: "fight", playersSideA: analysis.threads[0].playersSideA.filter((s) => s !== "player1") },
        ];
  return story.clone({ storyPhases: state.storyPhases });
}

/**
 * A group's chapter step (threadBeat) on player2's own outcome, every player holding an own outcome: only player2's roll
 * decides it (the owner's decision of 2026-10-01), so the others get no lever (withOwnersRollLevers, adoptedDeltas.ts).
 */
function ownOutcomeStep(players: number): Story {
  const story = threadBeat(players);
  const state = structuredClone(story.getState());
  const analysis = state.storyPhases[1] as ThreadAnalysis;
  analysis.threads = analysis.threads.map((t) => ({ ...t, outcomeId: "player2_own" }));
  const withOutcomes = Object.fromEntries(Object.entries(state.players).map(([slot, player]) => [slot, { ...player, outcomes: [outcome(`${slot}_own`)] }]));
  return story.clone({ storyPhases: state.storyPhases, players: withOutcomes });
}

const GROUPS: [string, () => Story][] = [2, 3].flatMap((players): [string, () => Story][] => [
  [`the first switch, ${players} players`, () => firstSwitchBeat(players)],
  [`a later switch, ${players} players`, () => laterSwitchBeat(players)],
  [`a chapter step, ${players} players`, () => threadBeat(players)],
  [`a chapter step on player2's own outcome, ${players} players`, () => ownOutcomeStep(players)],
  [`an exploration step, ${players} players`, () => groupStep(players, "exploration")],
  [`one player exploring beside a challenge, ${players} players`, () => groupStep(players, "mixed")],
  [`the ending, ${players} players`, () => endingBeat(players)],
]);

type Request = { prompt: string; schema: Parameters<typeof toJsonSchema>[0] };
/** What production must send: the prompt and the JSON schema's text. */
type Expected = { prompt: string; json: string };

function expectSame(production: Request, measured: Request | Expected) {
  const want = "json" in measured ? measured : { prompt: measured.prompt, json: json(measured.schema) };
  expect(production.prompt).toBe(want.prompt);
  expect(json(production.schema)).toBe(want.json);
}

/**
 * A single player's read-with-kids turn at 6-8, or with no age: the measured kidsTurn (the kids-turns stage of
 * 2026-10-01; built on production's turn as measured) with, where it shows images, the logged image places
 * (withKidsImageSlots, adoptedDeltas.ts), and at the ending the lines on what was played (withEndingOnlyPlayed).
 */
function kidsAdopted(story: Story): Expected {
  const measured = kidsTurnRequest(story);
  // Since the options-o2c stage, a rolled step carries O2c's lines too (withOptionsO2c, logged: unmeasured for kids)
  // Since the pacing-clues stage, a late turn carries the late part's clue lines too (withLateClues, unmeasured for kids)
  const lined = withShortReplies({ prompt: withLateClues(withOptionsO2c(withEndingOnlyPlayed(withKidsImageSlots(measured.prompt, story), story), story), story), schema: measured.schema });
  return { prompt: lined.prompt, json: withKidsImageSlotsSchema(lined.json, story) };
}

/**
 * A read-with-kids turn of every player count and band (the kids-ages stage of 2026-10-01): the measured kidsAges, the
 * grown-up turn (the same story without its category, which the other tests hold to its measured form) with the
 * band's kids lines, and where the turn shows images the logged picture places by band (withKidsBandImageSlots,
 * adoptedDeltas.ts: no case of the stage showed images, so none of its measured requests carried them). The variant
 * is built on production's live grown-up turn, so it carries the short-replies lines production prints since that
 * stage's adoption, later the same day.
 */
const kidsAgesAdopted = (story: Story): Expected => {
  const variant = kidsAgesTurnRequest(story);
  return withKidsBandImageSlots(kidsAgesAsMeasured({ prompt: variant.prompt, json: json(variant.schema) }, story), story);
};

/**
 * The measured request with the turn deltas applied (adoptedDeltas.ts) and, since the short-replies stage of
 * 2026-10-01, that stage's measured lines in its prompt and every text field (withShortReplies): what production must
 * send for this story.
 */
const asAdopted = (measured: Request, story: Story): Expected =>
  takesKidsRules(story) ? kidsAgesAdopted(story) : withShortReplies({ prompt: withLateClues(adoptedTurn(measured.prompt, story), story), schema: measured.schema });

/**
 * A single player's turn as production must send it. Since the options-o2c stage of 2026-10-01 a rolled chapter step
 * (not read with a child) is the measured turnO2c byte for byte, prompt and JSON schema; its base, production with
 * O2c's lines taken out (optionsO2cBase), is today's form with B6 as before, with the deltas and the short-replies lines
 * (asAdopted), so the measured variant stands on the form measured before it.
 */
function expectSinglePlayer(story: Story) {
  if (!takesKidsRules(story) && takesOptionRules(story)) {
    expectSame(beatStep.request(story), optionsO2cRequest(story));
    expectSame(optionsO2cBase(story), asAdopted(measuredTurn(story), story));
    return;
  }
  expectSame(beatStep.request(story), asAdopted(measuredTurn(story), story));
}

describe("single-player turns: today's form with B6 as measured, a rolled chapter step as turnO2c, an exploration step as choiceResult, the ending as endingStateB", () => {
  it.each(SINGLE_PLAYER)("%s", (_, build) => {
    expectSinglePlayer(build());
  });

  it("gives a rolled chapter step O2c's lines once and its computed lever line in place of B6's rate line (the options-o2c stage, 2026-10-01); no other single-player turn", () => {
    const opening = chapterStep("challenge", 0);
    const prompt = beatStep.request(opening).prompt;
    expect(prompt.split(OPTIONS_CONTINUITY_TEXT.o2Stats)).toHaveLength(2);
    expect(prompt.split(OPTIONS_CONTINUITY_TEXT.riskOnlyWeak)).toHaveLength(2);
    expect(prompt).toContain(`--- ${o2cLeverLine(opening, "player1")}\n`);
    for (const story of [chapterStep("exploration", 1), firstSwitchBeat(1), endingBeat(1)]) expect(beatStep.request(story).prompt).not.toContain(OPTIONS_CONTINUITY_TEXT.o2Stats);
  });

  it("gives a challenge step B6's lines and a single player's other turns none", () => {
    expect(beatStep.request(chapterStep("challenge", 1)).prompt).toContain("- The three options are three different ways to act");
    expect(beatStep.request(chapterStep("exploration", 1)).prompt).not.toContain("three different ways to act");
  });

  (frozen.length ? it : it.skip)("every frozen single-player turn", () => {
    const cases = frozen.filter((c) => c.role === "beat" && !c.tags.multiplayer);
    expect(cases.length).toBeGreaterThan(40);
    for (const c of cases) expectSinglePlayer(caseStory(c));
  });
});

/*
 * A read-with-kids turn by the children's age band (the kids-ages stage of
 * 2026-10-01, the owner's decision of the same day: "this should depend on the
 * age range that should be part of kids stories settings"): the measured
 * kidsAges byte for byte, every turn kind and player count, prompt and JSON
 * schema; the youngest child's band (3-5, 6-8, 9-12), 6-8 where the story
 * recorded no age (a template tagged Kids without one). The 6-8 band is the
 * kids-turns stage's measured turn: a single player's turn there is still
 * kidsTurn as measured, with its logged image places (withKidsImageSlots: the
 * second paragraph, or the third of four, in place of the third or fourth).
 * Until this stage a group's read-with-kids turn kept the grown-up count.
 * The picture places by band (3-5, 9-12, and a group's 6-8) are a logged
 * delta, unmeasured: every turn case of the stage had no images, so no
 * measured request carried them (withKidsBandImageSlots).
 */
describe("read-with-kids turns: kidsAges as measured, every band and player count", () => {
  const AGES: [string, Partial<StoryState>][] = [
    ["a child aged 4", { category: "read-with-kids", kidAges: { min: 4, max: 4 } }],
    ["children aged 5-9", { category: "read-with-kids", kidAges: { min: 5, max: 9 } }],
    ["a child aged 7", { category: "read-with-kids", kidAges: { min: 7, max: 7 } }],
    ["a child aged 10", { category: "read-with-kids", kidAges: { min: 10, max: 10 } }],
    ["no recorded age", { category: "read-with-kids" }],
    ["a premise's age 5, saved before the setting", { category: "read-with-kids", readingAge: "5" }],
  ];
  const IMAGES: [string, Partial<StoryState>][] = [
    ["no images", {}],
    ["generated images", { generateImages: true }],
    ["a template's image library", { templateId: "tpl-kids" }],
  ];

  it.each([...SINGLE_PLAYER, ...GROUPS])("%s, at every age, with and without images", (_, build) => {
    for (const [, ages] of AGES) {
      for (const [, images] of IMAGES) {
        const story = build().clone({ ...ages, ...images });
        expectSame(beatStep.request(story), kidsAgesAdopted(story));
        expect(beatStep.request(story).prompt).not.toContain("5-6 paragraphs");
      }
    }
  });

  it.each(SINGLE_PLAYER)("%s, a single player's at 6-8 or with no age: still kidsTurn as measured, with the logged image places", (_, build) => {
    for (const ages of [{ category: "read-with-kids" as const, kidAges: { min: 7, max: 7 } }, { category: "read-with-kids" as const }]) {
      for (const [, images] of IMAGES) {
        const story = build().clone({ ...ages, ...images });
        if (images.generateImages || images.templateId) expect(kidsTurnRequest(story).prompt).toContain("one for the third or fourth paragraph");
        expectSame(beatStep.request(story), kidsAdopted(story));
      }
    }
    const young = threadBeat(1, { category: "read-with-kids" });
    expect(beatStep.request(young).prompt).toContain(KIDS_TURN_TEXT.rules("a young child"));
  });

  it("prints each band's measured text, and its logged picture places, from production's own constants", () => {
    for (const band of ["3-5", "6-8", "9-12"] as const) {
      const production = KIDS_BAND_TURNS[band];
      const measured = KIDS_AGES_TEXT[band];
      for (const who of ["a child aged 5", "a young child"]) {
        expect(production.rules(who)).toBe(measured.rules(who));
        expect(production.repeat(who)).toBe(measured.repeat(who));
        expect(production.fieldCount(who)).toBe(measured.fieldCount(who));
      }
      expect(production.context).toBe(measured.context);
      expect(production.textCount).toBe(measured.shortTextCount);
      const places = KIDS_BAND_PICTURE_PLACES[band];
      expect(production.image).toEqual({ distribution: places.prompt, fieldDistribution: places.field, fieldLate: places.late });
    }
    // The 6-8 band is the kids-turns stage's measured text
    const who = "a child aged 7";
    expect(KIDS_BAND_TURNS["6-8"].context).toBe(KIDS_TURN_TEXT.context);
    expect(KIDS_BAND_TURNS["6-8"].rules(who)).toBe(KIDS_TURN_TEXT.rules(who));
    expect(KIDS_BAND_TURNS["6-8"].repeat(who)).toBe(KIDS_TURN_TEXT.repeat(who));
    expect(KIDS_BAND_TURNS["6-8"].fieldCount(who)).toBe(KIDS_TURN_TEXT.fieldCount(who));
    expect(KIDS_BAND_TURNS["6-8"].textCount).toBe(KIDS_TURN_TEXT.shortTextCount);
  });

  it("asks a retry for the band's count as the measured variant did, every player count", () => {
    for (const [, ages] of AGES) {
      for (const players of [1, 2, 3]) {
        const story = threadBeat(players, ages);
        expect(beatCheckOptions(story).textCount).toBe(kidsAgesShortTextCount(story));
      }
    }
  });

  it("prints the band's picture places only where the turn shows images, in place of the grown-up lines the measured kidsAges kept (the logged delta)", () => {
    for (const [, ages] of AGES) {
      for (const players of [1, 2, 3]) {
        for (const [, images] of IMAGES.slice(1)) {
          const story = threadBeat(players, { ...ages, ...images });
          const places = KIDS_BAND_PICTURE_PLACES[kidsAgesBand(story)];
          const variant = kidsAgesTurnRequest(story);
          const measured = kidsAgesAsMeasured({ prompt: variant.prompt, json: json(variant.schema) }, story);
          expect(measured.prompt).toContain(GROWN_UP_PICTURE_PLACES.prompt);
          expect(measured.prompt).not.toContain(places.prompt);
          const production = beatStep.request(story);
          expect(production.prompt).toContain(places.prompt);
          expect(production.prompt).not.toContain(GROWN_UP_PICTURE_PLACES.prompt);
          expect(json(production.schema)).toContain(JSON.stringify(places.field).slice(1, -1));
        }
        // No images: no picture places in either, and production is the measured request byte for byte
        const plain = threadBeat(players, ages);
        const variant = kidsAgesTurnRequest(plain);
        const asText = { prompt: variant.prompt, json: json(variant.schema) };
        expect(kidsAgesAsMeasured(asText, plain)).toEqual(asText);
        expect(withKidsBandImageSlots(asText, plain)).toEqual(asText);
        expectSame(beatStep.request(plain), asText);
      }
    }
  });

  (KIDS_AGES_CASES.length ? it : it.skip)("measured them on no case: every turn case of the kids-ages stage shows no images, and production sends its measured request byte for byte", () => {
    expect(KIDS_AGES_CASES).toHaveLength(18);
    for (const c of KIDS_AGES_CASES) {
      const story = caseStory(c);
      expect([c.id, story.hasImages() || story.generatesImages()]).toEqual([c.id, false]);
      expectSame(beatStep.request(story), kidsAgesTurnRequest(story));
    }
  });
});

/*
 * The chapter rules are for the planners only (the owner's feedback of
 * 2026-09-28): the switch turn, the one turn that carried them, drops them;
 * it still reads each stat's "Adjustments after threads", the after-chapter
 * changes it applies. The switch and chapter planners keep them.
 */
describe("the chapter rules: the planners' only", () => {
  const RULE = "When Public Support falls below 30%, the next thread is about winning back the crowd.";
  const withRules = (story: Story) =>
    story.clone({
      guidelines: { ...story.getGuidelines(), typesOfThreads: ["Rally (challenge, 3): win the square"], switchAndThreadInstructions: [RULE] },
      sharedStats: [stat("shared_support", { name: "Public Support", adjustmentsAfterThreads: ["+10% after a favorable rally thread"] })],
      sharedStatValues: [{ statId: "shared_support", value: 40 }],
    });
  const TURNS: [string, () => Story][] = [
    ["a single player's first switch", () => firstSwitchBeat(1)],
    ["a single player's later switch", () => laterSwitchBeat(1)],
    ["a group's later switch", () => laterSwitchBeat(2)],
    ["a chapter step", () => threadBeat(1)],
    ["the ending", () => endingBeat(1)],
  ];

  it.each(TURNS)("%s: no chapter rules in the turn", (_, build) => {
    const story = withRules(build());
    const prompt = beatStep.request(story).prompt;
    expect(prompt).not.toContain(CHAPTER_RULES_HEADING);
    expect(prompt).not.toContain(RULE);
    expect(prompt).not.toContain("Rally (challenge, 3)");
  });

  it("was printed on the measured switch turn only, and the switch turn still reads the after-chapter stat changes", () => {
    const story = withRules(laterSwitchBeat(1));
    expect(round0BeatStep.request(story).prompt).toContain(`${CHAPTER_RULES_HEADING}\n- Types of threads`);
    expect(round0BeatStep.request(withRules(threadBeat(1))).prompt).not.toContain(CHAPTER_RULES_HEADING);
    expect(beatStep.request(story).prompt).toContain("- Adjustments after threads: +10% after a favorable rally thread");
    expect(beatStep.request(story).prompt).toContain("Consider the 'Adjustments after threads' parameter in the stat definitions.");
  });

  it("stays in both planners' prompts", () => {
    for (const story of [withRules(laterSwitchBeat(1)), withRules(laterSwitchBeat(2))]) {
      expect(switchStep.request(story).prompt).toContain(RULE);
    }
    for (const story of [withRules(threadAnalysisAfterSwitch(1)), withRules(threadAnalysisAfterSwitch(2))]) {
      expect(threadStep.request(story).prompt).toContain(RULE);
    }
  });
});

/*
 * The ending (the owner's decision of 2026-09-30, measured as endingStateB):
 * each outcome told as its milestones leave it, the game's standing of every
 * outcome after the ending, and on a scored contest's ending (two players or
 * two camps) the scoreboard rule with its unfinished half, in place of the
 * rule production added to today's form on 2026-09-28 (decision 3).
 */

/** The contest's scoreboard, a shared opposites stat, as a contest setup writes it. */
const SCOREBOARD = stat("shared_voice_score", { name: "Enclave's Voice|Printers' Voice", type: "opposites", initialValue: 50 });

function contestEnding(players: number, mode: GameMode = GameModes.Competitive, scoreboard = true): Story {
  const slots = Array.from({ length: players }, (_, i) => `player${i + 1}`);
  const story = roundStory({
    players,
    turns: 6,
    maxTurns: 6,
    gameMode: mode,
    sharedOutcomes: [
      outcome("shared_voice", {
        possibleResolutions: { sideAWins: "The enclave speaks", mixed: "They share the seat", sideBWins: "The printers speak" },
        resonance: "Who speaks for the goblins. Scored by Enclave's Voice|Printers' Voice.",
      }),
    ],
    playerOutcomes: Object.fromEntries(slots.map((slot) => [slot, [outcome(`${slot}_pride`)]])),
    phases: [
      topicSwitch([["Speak", "shared_voice"]], 0, slots),
      endedChapter("shared_voice", 2, 1, "The council hears the enclave", slots),
      topicSwitch([["Speak", "shared_voice"]], 3, slots),
      endedChapter("shared_voice", 2, 4, "The printers win the vote", slots),
    ],
  });
  return scoreboard ? story.clone({ sharedStats: [SCOREBOARD], sharedStatValues: [{ statId: SCOREBOARD.id, value: 40 }] }) : story;
}

/**
 * A group's turn as production must send it. Since the group-options stage of 2026-10-01 (decision A) a group's rolled
 * chapter step (not read with a child) is the measured groupOptions byte for byte, prompt and JSON schema; its base,
 * production with those lines taken out (groupOptionsBase), is groupLeversB as before, with the deltas and the
 * short-replies lines (asAdopted), so the measured variant stands on the form measured before it.
 */
function expectGroup(story: Story) {
  if (!takesKidsRules(story) && takesGroupLevers(story)) {
    expectSame(beatStep.request(story), groupOptionsRequest(story));
    expectSame(groupOptionsBase(story), asAdopted(measuredTurn(story), story));
    return;
  }
  expectSame(beatStep.request(story), asAdopted(measuredTurn(story), story));
}

describe("group turns: today's form, a rolled chapter step as groupOptions, an exploration step as choiceResult, the ending as endingStateB", () => {
  it.each(GROUPS)("%s", (_, build) => {
    expectGroup(build());
  });

  it("prints the measured lever parts from production's own constants on a group's rolled step, once, for each rolled player; on no other group turn (the group-levers stage, then the group-options stage, 2026-10-01)", () => {
    expect(GROUP_SHARED_AND_OWN).toBe(GROUP_LEVERS_TEXT.sharedAndOwn);
    // The plan's lever question asked from the owner's rules' lines since the group-options stage (groupLeversB's before)
    expect(GROUP_LEVER_QUESTION).toBe(GROUP_OPTIONS_TEXT.leverQuestion);
    expect(GROUP_LEVER_QUESTION).not.toBe(GROUP_LEVERS_TEXT.leverQuestionB);
    for (const story of [threadBeat(2), threadBeat(3), groupStep(3, "mixed")]) {
      const prompt = beatStep.request(story).prompt;
      expect(prompt.split(`${GROUP_LEVERS_TEXT.leverAnchor}${groupSacrificeRewardLines(story)}`)).toHaveLength(2);
      for (const slot of groupLeverSlots(story)) expect(groupSacrificeRewardLines(story)).toContain(`): ${groupOptionsLine(story, slot).replace("Sacrifice or reward: ", "")}\n`);
      expect(prompt.split(`${GROUP_LEVERS_TEXT.derailAnchor} ${REWARD_EXCEPTION}`)).toHaveLength(2);
      expect(prompt.split(`${GROUP_OPTIONS_TEXT.diversionAnchor}${GROUP_OPTIONS_TEXT.variety}`)).toHaveLength(2);
      // Production's group turn before the group-levers adoption, which that stage measured beside its variant
      expect(groupLeversBase(story).prompt).not.toContain(GROUP_SHARED_AND_OWN);
      expect(groupLeversBase(story).prompt).not.toContain(GROUP_OPTIONS_TEXT.variety);
      expect(json(beatStep.request(story).schema)).toContain(JSON.stringify(GROUP_LEVER_QUESTION).slice(1, -1));
    }
    for (const story of [firstSwitchBeat(2), laterSwitchBeat(3), groupStep(2, "exploration"), endingBeat(3), threadBeat(1)]) {
      expect(beatStep.request(story).prompt).not.toContain(GROUP_SHARED_AND_OWN);
      expect(beatStep.request(story).prompt).not.toContain(GROUP_OPTIONS_TEXT.variety);
      expect(json(beatStep.request(story).schema)).not.toContain("this player's sacrifice-or-reward line");
    }
  });

  it("gives no lever to a player whose roll the step discards, on a step on another player's own outcome: measured since the group-options stage (a logged delta on groupLeversB before)", () => {
    for (const players of [2, 3]) {
      const story = ownOutcomeStep(players);
      const prompt = beatStep.request(story).prompt;
      const others = ["player1", "player3"].slice(0, players - 1);
      for (const slot of others) expect(prompt).toContain(`----- ${slot} (Test Player ${slot.slice(-1)}): none this turn.\n`);
      // The owner's own line: step 2 of the chapter, no lever before (no stat here allows a reward)
      expect(prompt).toContain("----- player2 (Test Player 2): a sacrifice fits this turn if a stat allows it. No reward this turn.\n");
      // As groupLeversB measured it, every rolled player had the rate line; production's "none" for the others was a delta
      expect(groupLeversRequest(story, { b: true }).prompt).toContain("----- player1 (Test Player 1): one fits this turn if a stat allows it.\n");
      // Their fields still ask the plan's lever question from the line
      expect(json(beatStep.request(story).schema).split(JSON.stringify(GROUP_LEVER_QUESTION).slice(1, -1)).length - 1).toBeGreaterThan(0);
    }
  });

  it("gives every exploration step the exploration-order line, once, after the option types: a group's (the choice-result stage) and a single player's (the choice-line-sp stage); no challenge step", () => {
    const once = (prompt: string) => {
      expect(prompt.split(CHOICE_RESULT_TEXT.explorationOrder).length - 1).toBe(1);
      expect(prompt).toContain(`${CHOICE_RESULT_TEXT.optionTypes}${CHOICE_RESULT_TEXT.explorationOrder}\n- Define if the option is a sacrifice`);
    };
    for (const players of [2, 3]) {
      for (const kind of ["exploration", "mixed"] as const) once(beatStep.request(groupStep(players, kind)).prompt);
      expect(beatStep.request(threadBeat(players)).prompt).not.toContain(CHOICE_RESULT_TEXT.explorationOrder);
    }
    for (const done of [0, 1, 2]) once(beatStep.request(chapterStep("exploration", done)).prompt);
    for (const build of [() => threadBeat(1), () => chapterStep("challenge", 1), () => firstSwitchBeat(1), () => laterSwitchBeat(1), () => endingBeat(1)]) {
      expect(beatStep.request(build()).prompt).not.toContain(CHOICE_RESULT_TEXT.explorationOrder);
    }
  });

  it.each([
    ["two players, competitive", () => contestEnding(2)],
    ["two players, cooperative-competitive", () => contestEnding(2, GameModes.CooperativeCompetitive)],
    ["three players (two camps)", () => contestEnding(3)],
  ] as const)("the ending of a contest, %s: endingStateB, the scoreboard rule with its unfinished half once", (_, build) => {
    const story = build();
    const production = beatStep.request(story);
    expectSame(production, asAdopted(endingStateRequest(story), story));
    expect(production.prompt.split(SCOREBOARD_ENDING_RULE)).toHaveLength(2);
    expect(SCOREBOARD_ENDING_RULE).toBe(ENDING_STATE_TEXT.contestRule);
    expect(SCOREBOARD_ENDING_RULE).toContain("While it is unfinished, no side has won yet");
    // The rule production sent until the adoption is gone
    expect(production.prompt).not.toContain(ENDING_STATE_TEXT.measuredScoreboardRule);
  });

  it("says on every ending, a group's and a single player's, a kids ending too, that only the threads that just ended get milestones and that an unfinished outcome is told as unfinished; on no other turn (the owner's decision of 2026-10-01)", () => {
    for (const story of [endingBeat(1), endingBeat(2), endingBeat(3), contestEnding(2), endingBeat(1).clone({ category: "read-with-kids", readingAge: "5" })]) {
      const prompt = beatStep.request(story).prompt;
      expect(prompt.split(ENDING_MILESTONES_PLAYED)).toHaveLength(2);
      expect(prompt).toContain(ENDING_OUTCOME_KINDS);
      expect(prompt).toContain("--- An unfinished outcome is told as unfinished, in its current state, even if that state is inconclusive");
      expect(prompt).not.toContain(ENDING_STATE_TEXT.unfinished);
      // Today's current-state rule stays word for word
      expect(prompt).toContain("what its milestones so far have settled, and what is still open. Never resolve it beyond its milestones");
    }
    for (const story of [laterSwitchBeat(1), laterSwitchBeat(2), threadBeat(1), firstSwitchBeat(2)]) {
      expect(beatStep.request(story).prompt).not.toContain(ENDING_MILESTONES_PLAYED);
    }
  });

  it("prints the rule on no other turn of a contest, and on no ending without one", () => {
    const beforeEnding = contestEnding(2).clone({ maxTurns: 20 });
    expect(beforeEnding.getCurrentBeatType()).not.toBe("ending");
    expect(beatStep.request(beforeEnding).prompt).not.toContain(SCOREBOARD_ENDING_RULE);
    expect(beatStep.request(beforeEnding).prompt).not.toContain(ENDING_STATE_TEXT.tellAsLeft);
    expect(beatStep.request(endingBeat(2)).prompt).not.toContain(SCOREBOARD_ENDING_RULE);
    expect(beatStep.request(endingBeat(1)).prompt).not.toContain(SCOREBOARD_ENDING_RULE);
  });

  it.each([
    // A template's author can set a contest in any mode, or leave out its scoreboard; the rule would name a stat or a side B that isn't there
    ["a cooperative story", () => contestEnding(2, GameModes.Cooperative)],
    ["a single player's story", () => contestEnding(1, GameModes.SinglePlayer)],
    ["a contest without a scoreboard (no shared opposites stat)", () => contestEnding(2, GameModes.Competitive, false)],
  ] as const)("prints no contest rule on the ending of %s that holds a contested outcome, the outcome lines still", (_, build) => {
    const story = build();
    expect(story.getCurrentBeatType()).toBe("ending");
    expect(scoreboardEnding(story)).toBe(false);
    expectSame(beatStep.request(story), asAdopted(endingStateRequest(story), story));
    expect(beatStep.request(story).prompt).not.toContain(SCOREBOARD_ENDING_RULE);
    expect(beatStep.request(story).prompt).toContain(ENDING_STATE_TEXT.tellAsLeft);
  });

  (frozen.length ? it : it.skip)("every frozen group turn: today's form, a rolled chapter step as groupOptions, the ending as endingStateB", () => {
    const cases = frozen.filter((c) => c.role === "beat" && c.tags.multiplayer);
    expect(cases.length).toBeGreaterThan(10);
    for (const c of cases) expectGroup(caseStory(c));
  });
});
