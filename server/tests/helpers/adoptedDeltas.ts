/*
 * The deliberate differences between production and the eval variants it
 * adopted on 2026-09-28 (setupR3, planV2b for the switch, planV2c for the
 * chapter, turnB6; since 2026-09-30 planV2e for the chapter and endingStateB
 * for every ending), the one place the adoption tests read them from. Each is
 * a logged adoption item, a settled decision that no round measured, or (the
 * kids stat examples) a retested passage measured in another variant;
 * everything else production sends is the variant's request byte for byte
 * (.plans/2026-09-26_build-followup.md, "Adoption into production" and "The
 * owner's feedback of 2026-09-28"). The chapter planner has none: planV2c
 * carries the adopted "without a number" in the chapter title's field; since
 * 2026-10-01 it carries measured wording planner v2f never had (challenge and
 * contest results that never restate the approach: withResultsAsOutcomes and
 * withResultsAsOutcomesSchema, the challenge-results stage's variant, not a
 * delta). The switch planner has one since 2026-09-30: the threads that fit
 * near the end; since 2026-10-01 it also carries a measured line planner v2b
 * never had (a contest's last stage offered only as a grouped thread:
 * withContestLastStage, the parallel-threads stage's variant, not a delta).
 * A single player's read-with-kids turn was kidsTurn (2026-10-01) with one
 * delta where it shows images: the image places (withKidsImageSlots); since
 * the kids-ages stage of the same day every read-with-kids turn is the
 * measured kidsAges, by age band, with one delta where it shows images: the
 * picture places by band, which no measured case carried
 * (withKidsBandImageSlots; productionBeforeKidsAges gives production as it
 * stood before, for the variants measured earlier). Every
 * ending, a kids ending too, carries one delta since the owner's decision of
 * 2026-10-01: only what was played gets a milestone (withEndingOnlyPlayed).
 * A group's chapter step with a player in a challenge or contest thread is the
 * measured groupLeversB since the group-levers stage of the same day (not a
 * delta; beforeGroupLevers and productionThen give production as it stood
 * before, for the variants measured earlier).
 */

import { toJsonSchema } from "@langchain/core/utils/json_schema";
import type { Story } from "core/models/Story.js";
import type { GameMode, KidsBand } from "core/types/index.js";
import { GameModes } from "core/types/index.js";
import { beatStep } from "../../src/game/services/storyTextSteps.js";
import { KIDS_BAND_TURNS, kidsListener, kidsTurnText, takesKidsRules } from "../../src/game/services/kidsTurnRules.js";
import { chaptersThatFit, turnsLeft } from "../../src/game/services/pacing.js";
import { StoryStatePromptService } from "../../src/game/services/prompts/StoryStatePromptService.js";
import { chaptersThatFit as measuredChaptersThatFit } from "../../src/game/services/storyTextRounds/pacing.js";
import { KIDS_STATS, KIDS_STATS_VARIED } from "../../src/game/services/storyTextRounds/setupRound3Text.js";
import { PARALLEL_THREADS_TEXT, takesLastStageLine } from "../../src/game/services/storyTextRounds/parallelThreads.js";
import { RESULTS_AS_OUTCOMES_TEXT } from "../../src/game/services/storyTextRounds/resultsAsOutcomes.js";
import { ENDING_STATE_TEXT } from "../../src/game/services/storyTextRounds/endingState.js";
import { LEVER_DIRECTION_TEXT } from "../../src/game/services/storyTextRounds/leverDirection.js";
import { KIDS_AGES_TEXT, kidsAgesBand } from "../../src/game/services/storyTextRounds/kidsAges.js";
import { GROUP_LEVERS_TEXT, groupLeversBase, takesGroupLevers } from "../../src/game/services/storyTextRounds/groupLevers.js";
import { REWARD_EXCEPTION } from "../../src/game/services/optionRules.js";

/** Contests keep score (competitive and cooperative-competitive multiplayer). */
export const isContestSetup = (players: number, mode: GameMode): boolean =>
  players > 1 && (mode === GameModes.Competitive || mode === GameModes.CooperativeCompetitive);

/**
 * Setup (step 5): with the scoreboard ending rule, the three sentences that
 * were true only while no stat decided an outcome, in contest setups.
 */
export const SCOREBOARD_SENTENCES: [string, string][] = [
  [
    "At the end, one beat per player writes that player's ending from the outcomes' milestones.",
    "At the end, one beat per player writes that player's ending from the outcomes' milestones and, for a contested outcome, from its scoreboard: the side ahead wins unless the milestones clearly say otherwise.",
  ],
  [
    "they are the story's only progress bar.",
    "they are the story's progress bar, and a contested outcome's scoreboard decides it at the ending unless its milestones clearly say otherwise.",
  ],
  [
    "nothing in the game reads a stat to decide an outcome or to end the story.",
    "no stat decides an outcome or ends the story, apart from a contested outcome's scoreboard at the ending.",
  ],
];

/**
 * Setup (the setup retests of 2026-09-28, measured as setupR3b): the kids
 * stat examples from other kinds of story, in place of round 3's "Courage"
 * first, which named a stat in all four kids setups (4 of 4 copied an
 * example; 1 of 4 on the retest). The retest's other clause, the identity
 * clause's names in outcomes only, did not pass and stays as measured.
 */
export const KIDS_EXAMPLES: [string, string] = [KIDS_STATS, KIDS_STATS_VARIED];

/*
 * Setup (2026-10-01, fix 3 of the second playthroughs' review, adopted on the
 * coordinator's call): a sacrifice always costs the player and a reward always
 * helps, also on a stat where more is worse; one line after the stat rule on
 * what can be spent or earned, and the two lever fields' first sentences
 * worded by what the lever does to the player. Not a delta: measured (the
 * variant leverDirection on custom-story setups: every lever the right way in
 * 12 of 12 setups by hand against production's 11 of 12, the judge 9 -> 11 of
 * 12 within the noise, nothing moved the wrong way) and adopted as measured,
 * though the stop rule never read its target as moved; setup round 3, the
 * measured base the other setup tests read, never carried it. The template
 * and AI Iteration forms print the same stat rules and fields (unmeasured
 * there).
 */
const inJsonText = (text: string) => JSON.stringify(text).slice(1, -1);

/** The measured setup prompt with the lever-direction line after the spend-or-earn rule, wherever the prompt carries that rule. */
export function withLeverDirection(measured: string): string {
  const { anchor, line } = LEVER_DIRECTION_TEXT;
  const count = measured.split(anchor).length - 1;
  if (count > 1) throw new Error("The measured setup carries the spend-or-earn rule more than once");
  return count === 0 ? measured : measured.replace(anchor, () => `${anchor}\n${line}`);
}

/** The measured setup schema's JSON text with the two lever fields' first sentences reworded, wherever the schema has them. */
export function withLeverDirectionSchema(measuredJson: string): string {
  const { sacrifice, reward } = LEVER_DIRECTION_TEXT;
  return [sacrifice, reward].reduce((text, edit) => text.split(inJsonText(edit.from)).join(inJsonText(edit.to)), measuredJson);
}

/** The measured setup prompt as production sends it. */
export function adoptedSetupPrompt(measured: string, players: number, mode: GameMode): string {
  const kids = withLeverDirection(measured).split(KIDS_EXAMPLES[0]).join(KIDS_EXAMPLES[1]);
  return isContestSetup(players, mode) ? SCOREBOARD_SENTENCES.reduce((text, [from, to]) => text.split(from).join(to), kids) : kids;
}

/*
 * Turns (step 5, until 2026-09-30): the scoreboard ending rule, one line on
 * the ending of a story with a contested outcome, was a logged delta on
 * today's form. Since the ending told as its milestones leave it was adopted
 * (the owner's decision of 2026-09-30), production's every ending is the
 * measured variant endingStateB byte for byte, which carries the rule with its
 * unfinished half, so no ending delta is left.
 */

/*
 * The switch planner (2026-09-30, the playthroughs' review): PACING's threads
 * that fit are never fewer than the length rule makes come
 * (`chaptersThatFit` in production's pacing.ts), where planner v2b counted
 * turns left ÷ 4 alone. The two differ only near a story's end (3, 6, 7 and 11
 * turns left), where ÷ 4 had the planner read "about 0 more threads fit, the
 * one this switch opens included" beside "it has exactly 2 beats". A
 * correction of a contradiction in the measured request, unmeasured.
 */
const fitLine = (n: number) => `so about ${n} more ${n === 1 ? "thread fits" : "threads fit"}, the one this switch opens included.`;
const neededLine = (n: number) => `still needed for about ${n} ${n === 1 ? "thread" : "threads"}.`;

/** The measured switch planner's prompt with production's count of the threads that fit. */
export function withThreadsThatFit(measured: string, story: Story): string {
  const left = turnsLeft(story);
  const was = measuredChaptersThatFit(left);
  const now = chaptersThatFit(left);
  if (was === now) return measured;
  for (const line of [fitLine(was), neededLine(was)]) {
    if (!measured.includes(line)) throw new Error(`The measured switch planner no longer says "${line}"`);
  }
  return measured.split(fitLine(was)).join(fitLine(now)).split(neededLine(was)).join(neededLine(now));
}

/*
 * The switch planner (2026-10-01, the parallel-threads stage, fix 4 of the
 * second playthroughs' review): where a contested shared outcome's next thread
 * settles its last stage, in a contest game after the opening switch, the line
 * that offers it only as a grouped thread, after the coordination examples.
 * Not a delta: measured (the variant parallelThreads' switch planner, its
 * offer reading 1 of 6 → 5 of 6, moved) and adopted as measured; planner v2b,
 * the measured base the other switch tests read, never carried it.
 */
export function withContestLastStage(measured: string, story: Story): string {
  if (!takesLastStageLine(story)) return measured;
  const { lastStageAnchor, lastStageLine } = PARALLEL_THREADS_TEXT;
  if (measured.split(lastStageAnchor).length !== 2) throw new Error("The measured switch planner no longer carries the coordination examples' last line once");
  return measured.replace(lastStageAnchor, `${lastStageAnchor}${lastStageLine}`);
}

/*
 * The chapter planner (2026-10-01, the challenge-results stage, fix 5 of the
 * second playthroughs' review): after the results rule's challenge sentence,
 * the sentence that the approach chosen at the switch and the one a step's
 * question names are where a thread starts and no result restates them; the
 * flavor pick's line in PLAYER DECISIONS worded the same way; and the
 * challenge and contest milestone fields' "naming who did what" narrowed to
 * what was won or lost. Not a delta: measured (the variant resultsAsOutcomes,
 * resultsFitKind 8 of 30 -> 22 of 30, moved) and adopted as measured; planner
 * v2f, the measured base the other chapter tests read, never carried it.
 */
const countOf = (story: Story) => (story.isMultiplayer() ? "group" : "single");

/** The measured chapter planner's prompt with the results-as-outcomes edits. */
export function withResultsAsOutcomes(measured: string, story: Story): string {
  const { rule, approachLine, flavorAnchor, flavorLine } = RESULTS_AS_OUTCOMES_TEXT;
  const which = countOf(story);
  if (measured.split(rule[which]).length !== 2) throw new Error("The measured chapter planner no longer carries the results rule's challenge sentence once");
  return measured.replace(rule[which], `${rule[which]}${approachLine[which]}`).split(flavorAnchor).join(flavorLine);
}

/** The measured chapter planner's JSON schema text with the milestone fields reworded. */
export function withResultsAsOutcomesSchema(measuredJson: string, story: Story): string {
  const inJson = (text: string) => JSON.stringify(text).slice(1, -1);
  return RESULTS_AS_OUTCOMES_TEXT.milestones[countOf(story)].reduce((text, edit) => {
    if (!text.includes(inJson(edit.from))) throw new Error(`The measured chapter planner's schema no longer says "${edit.from}"`);
    return text.split(inJson(edit.from)).join(inJson(edit.to));
  }, measuredJson);
}

/** The chapter rules as the measured switch turn printed them: the story's thread types and switch/thread instructions. */
export const CHAPTER_RULES_HEADING = "SPECIAL SWITCH/THREAD INSTRUCTIONS:";

/**
 * Turns (the owner's feedback of 2026-09-28): the chapter rules are for the
 * planners only. The switch turn was the one turn that carried them, as its
 * prompt's last section; production's switch turn ends before it. The
 * after-chapter stat changes it applies are each stat's own "Adjustments
 * after threads", which the switch turn still reads. Unmeasured, as decided.
 */
export function withoutChapterRules(measured: string, story: Story): string {
  if (story.getCurrentBeatType() !== "switch") return measured;
  const tail = `\n${StoryStatePromptService.createStoryStatePrompt(story, { switchAndThreadInstructions: true })}`;
  if (!measured.endsWith(tail)) throw new Error("The measured switch turn no longer ends with its chapter rules");
  return measured.slice(0, -tail.length);
}

/*
 * The ending (2026-10-01, the owner's decision on ending milestones: "The idea
 * was -not- for the engine to invent missing milestones for open outcomes.
 * Unfinished outcomes should be narrated as unfinished. Only what was
 * played."): after the milestone lines, that only the threads that just ended
 * get milestones and no other outcome does; and endingStateB's unfinished line
 * told as unfinished, the story ending with it still open (its current-state
 * rule kept word for word). The game drops a milestone a reply writes anywhere
 * else (milestoneNotPlayed in beatRepairs.ts). A settled decision, unmeasured.
 */
const ENDING_ONLY_PLAYED = {
  milestonesAnchor:
    "the new milestone could be 'Threatened by the Furious Four, the council has no choice but to approve the new railroad.'\n",
  milestonesLine:
    "- Only the threads that just ended get milestones: one for each thread, on that thread's outcome. Add none to any other outcome, unfinished or complete: every other outcome ends with the milestones play gave it.\n",
  unfinished: [
    ENDING_STATE_TEXT.unfinished,
    "--- An unfinished outcome is told as unfinished, in its current state, even if that state is inconclusive: what its milestones so far have settled, and what is still open. Never resolve it beyond its milestones: none of its possible resolutions has been reached yet, and the story ends with it still open.\n",
  ],
} as const;

/** The measured ending's prompt with production's lines on what was played (an ending; any other turn as it was). */
export function withEndingOnlyPlayed(measured: string, story: Story): string {
  if (story.getCurrentBeatType() !== "ending") return measured;
  const { milestonesAnchor, milestonesLine, unfinished } = ENDING_ONLY_PLAYED;
  if (measured.split(milestonesAnchor).length !== 2) throw new Error("The measured ending no longer carries the milestone example once");
  if (measured.split(unfinished[0]).length !== 2) throw new Error("The measured ending no longer carries the unfinished outcome's line once");
  return measured.replace(milestonesAnchor, () => `${milestonesAnchor}${milestonesLine}`).replace(unfinished[0], () => unfinished[1]);
}

/**
 * Production's ending as it stood before the owner's decision of 2026-10-01, which the variants measured before it
 * compare with: production's prompt without the line on what was played, the unfinished line as measured. Any other
 * turn as it is.
 */
export function beforeEndingOnlyPlayed(production: string, story: Story): string {
  if (story.getCurrentBeatType() !== "ending") return production;
  const { milestonesLine, unfinished } = ENDING_ONLY_PLAYED;
  if (production.split(milestonesLine).length !== 2) throw new Error("Production's ending no longer carries the line on what was played once");
  if (production.split(unfinished[1]).length !== 2) throw new Error("Production's ending no longer carries its unfinished outcome's line once");
  return production.replace(milestonesLine, "").replace(unfinished[1], () => unfinished[0]);
}

/**
 * Production's prompt as it stood before the group-levers adoption (2026-10-01): a group's rolled chapter step without
 * the reward exception and the players' lever lines (groupLeversB's, which production prints since); any other turn as
 * it is.
 */
export function beforeGroupLevers(production: string, story: Story): string {
  if (!takesGroupLevers(story)) return production;
  const { derailAnchor, leverAnchor, block } = GROUP_LEVERS_TEXT;
  const [exception, lines] = [`${derailAnchor} ${REWARD_EXCEPTION}`, `${leverAnchor}${block(story)}`];
  if (production.split(exception).length !== 2 || production.split(lines).length !== 2) throw new Error("Production's group step no longer carries its lever lines once");
  return production.replace(exception, () => derailAnchor).replace(lines, () => leverAnchor);
}

/**
 * A request of production's as it stood before the owner's decision of 2026-10-01 on ending milestones
 * (beforeEndingOnlyPlayed) and before the group-levers adoption of the same day (beforeGroupLevers; a group's rolled
 * step's schema as it was built then, groupLeversBase). The variants measured before compare with it.
 */
export function productionThen<R extends { prompt: string }>(request: R, story: Story): R {
  const prompt = beforeGroupLevers(beforeEndingOnlyPlayed(request.prompt, story), story);
  const schema = "schema" in request && takesGroupLevers(story) ? { schema: groupLeversBase(story).schema } : {};
  return { ...request, prompt, ...schema };
}

/** Every turn delta: no chapter rules on a switch turn, and the ending's lines on what was played. */
export function adoptedTurn(measured: string, story: Story): string {
  return withEndingOnlyPlayed(withoutChapterRules(measured, story), story);
}

/*
 * A single player's read-with-kids turn with images (2026-10-01, the review of
 * fix 6): kidsTurn, as measured, kept production's image lines, which put a
 * second image on "the third or fourth paragraph" and none on the last. In the
 * 3-4 paragraphs it asks for, a 3-paragraph turn had no allowed place for that
 * image (its third paragraph is its last). Production names the second
 * paragraph, or the third of four, instead. A correction of a contradiction in
 * the measured request, unmeasured: the stage's one case with images wrote 4
 * paragraphs both times. A turn without images is kidsTurn byte for byte.
 */
const KIDS_IMAGE_SLOTS = {
  prompt: [
    "--- A good distribution is an image tag for the first paragraph and one for the third or fourth paragraph.\n",
    "--- A good distribution is an image tag for the first paragraph and one for the second paragraph (or the third, if there are four).\n",
  ],
  field: [
    "--- A good distribution is to have one image tag right before the first paragraph and one on the third or fourth paragraph. Avoid using image tags in or right in front of the last paragraph.\n",
    "--- A good distribution is to have one image tag right before the first paragraph and one on the second paragraph (or the third, if there are four). Never put an image tag on the last paragraph.\n",
  ],
  late: [
    "Use it relatively late in the beat text (third or fourth paragraph).",
    "Use it relatively late in the beat text (the second paragraph, or the third if there are four).",
  ],
} as const;

const showsImages = (story: Story) => story.hasImages() || story.generatesImages();

function swapOnce(text: string, [from, to]: readonly [string, string], what: string): string {
  if (text.split(from).length !== 2) throw new Error(`The measured kids turn no longer carries ${what} once`);
  return text.replace(from, () => to);
}

/** The measured kids turn's prompt with production's image places (a turn that shows images). */
export function withKidsImageSlots(measured: string, story: Story): string {
  return showsImages(story) ? swapOnce(measured, KIDS_IMAGE_SLOTS.prompt, "the image distribution line") : measured;
}

/** The measured kids turn's JSON schema text with production's image places in the text field. */
export function withKidsImageSlotsSchema(measuredJson: string, story: Story): string {
  const inJson = (pair: readonly [string, string]) => [JSON.stringify(pair[0]).slice(1, -1), JSON.stringify(pair[1]).slice(1, -1)] as const;
  if (!showsImages(story)) return measuredJson;
  const placed = swapOnce(measuredJson, inJson(KIDS_IMAGE_SLOTS.field), "the text field's image distribution");
  return story.generatesImages() ? swapOnce(placed, inJson(KIDS_IMAGE_SLOTS.late), "the generated image's place") : placed;
}

/*
 * The picture places by band (2026-10-01, the review of the kids-ages
 * adoption). The kidsAges variant names each band's places for a turn's image
 * tags where the turn shows images (3-5 the first paragraph, and the second
 * only of three; 6-8 the second, or the third of four; 9-12 the first and the
 * third; never the last) in place of the grown-up turn's "third or fourth
 * paragraph" lines it is built on. None of the stage's 18 turn cases showed
 * images (every one generateImages false, no image library, no template), so
 * no measured request carried them: not the 3-5 or 9-12 lines, and not a
 * group's, which until then sent the grown-up lines. Production prints them
 * on every read-with-kids turn that shows images, most kids stories (the Read
 * with Kids link opens the form with images on, and a template's story counts
 * as showing them): a correction of where the pictures go, unmeasured, logged
 * as withKidsImageSlots was, whose 6-8 lines these are (a single player's 6-8
 * or ageless turn reads them through kidsTurn and that delta). A turn without
 * images is kidsAges byte for byte as measured.
 */
type PicturePlaces = { prompt: string; field: string; late: string };
type RequestText = { prompt: string; json: string };

const placesOf = (side: 0 | 1): PicturePlaces => ({ prompt: KIDS_IMAGE_SLOTS.prompt[side], field: KIDS_IMAGE_SLOTS.field[side], late: KIDS_IMAGE_SLOTS.late[side] });

/** The grown-up turn's picture places, which every measured kids turn with images carried. */
export const GROWN_UP_PICTURE_PLACES: PicturePlaces = placesOf(0);

/** Production's picture places by band on a read-with-kids turn that shows images: the logged delta. */
export const KIDS_BAND_PICTURE_PLACES: Record<KidsBand, PicturePlaces> = {
  "3-5": {
    prompt: "--- A good distribution is an image tag for the first paragraph, and one for the second paragraph only if there are three.\n",
    field:
      "--- A good distribution is to have one image tag right before the first paragraph, and one on the second paragraph only if there are three. Never put an image tag on the last paragraph.\n",
    late: "Use it on the second paragraph if there are three, else on the first.",
  },
  "6-8": placesOf(1),
  "9-12": {
    prompt: "--- A good distribution is an image tag for the first paragraph and one for the third paragraph.\n",
    field: "--- A good distribution is to have one image tag right before the first paragraph and one on the third paragraph. Never put an image tag on the last paragraph.\n",
    late: "Use it relatively late in the beat text (the third paragraph).",
  },
};

/** One passage swapped wherever it stands (a group's players each have a text field), and at least once. */
function swapEvery(text: string, from: string, to: string, what: string): string {
  if (!text.includes(from)) throw new Error(`The kids-ages turn no longer carries ${what}`);
  return text.split(from).join(to);
}

/** A kids turn's picture places swapped, prompt and text fields (the generated image's place where it generates them); a turn without images as it is. */
function swapPicturePlaces(request: RequestText, story: Story, from: PicturePlaces, to: PicturePlaces): RequestText {
  if (!showsImages(story)) return request;
  const inJson = (text: string) => JSON.stringify(text).slice(1, -1);
  const prompt = swapOnce(request.prompt, [from.prompt, to.prompt], "its picture places");
  const placed = swapEvery(request.json, inJson(from.field), inJson(to.field), "its text field's picture places");
  return { prompt, json: story.generatesImages() ? swapEvery(placed, inJson(from.late), inJson(to.late), "its generated picture's place") : placed };
}

/**
 * The kidsAges request as the stage measured it: its band's lines on production's grown-up turn and, where the turn
 * shows images, that turn's own picture places, the variant's by band (which no measured request carried) taken out.
 */
export function kidsAgesAsMeasured(variant: RequestText, story: Story): RequestText {
  return swapPicturePlaces(variant, story, KIDS_AGES_TEXT[kidsAgesBand(story)].image, GROWN_UP_PICTURE_PLACES);
}

/** The measured kidsAges request with production's picture places by band (a turn that shows images). */
export function withKidsBandImageSlots(measured: RequestText, story: Story): RequestText {
  return swapPicturePlaces(measured, story, GROWN_UP_PICTURE_PLACES, KIDS_BAND_PICTURE_PLACES[kidsAgesBand(story)]);
}

/*
 * The kids-ages stage's adoption (2026-10-01): a read-with-kids turn of every
 * player count takes the band of its youngest child (the measured kidsAges;
 * adoptedTurns.test.ts). Variants measured before it, built on production as
 * it stood, compare with production before it: a single player's kids turn
 * with the 6-8 band's text (the kids-turns stage's, the only one there was) for
 * the same listener, and a group's kids turn as a grown-up story's (a group's
 * turn read no category then).
 */
/** Production's turn as it stood before the kids-ages adoption: its prompt and its JSON schema's text. */
export function productionBeforeKidsAges(story: Story): { prompt: string; json: string } {
  const asText = (request: { prompt: string; schema: Parameters<typeof toJsonSchema>[0] }) => ({ prompt: request.prompt, json: JSON.stringify(toJsonSchema(request.schema)) });
  // A group's rolled step as it stood before the group-levers adoption too (groupLeversBase), which came later that day
  if (!takesKidsRules(story)) return asText(groupLeversBase(story));
  if (story.isMultiplayer()) return asText(groupLeversBase(story.clone({ category: undefined })));
  const now = asText(beatStep.request(story));
  const [band, then] = [kidsTurnText(story), KIDS_BAND_TURNS["6-8"]];
  const who = kidsListener(story);
  const inJson = (text: string) => JSON.stringify(text).slice(1, -1);
  const swap = (text: string, pairs: [string, string][]) => pairs.reduce((out, [from, to]) => out.split(from).join(to), text);
  return {
    prompt: swap(now.prompt, [
      [band.context, then.context],
      [band.rules(who), then.rules(who)],
      [band.repeat(who), then.repeat(who)],
      [band.image.distribution, then.image.distribution],
    ]),
    json: swap(now.json, [
      [inJson(band.fieldCount(who)), inJson(then.fieldCount(who))],
      [inJson(band.repeat(who)), inJson(then.repeat(who))],
      [inJson(band.image.fieldDistribution), inJson(then.image.fieldDistribution)],
      [inJson(band.image.fieldLate), inJson(then.image.fieldLate)],
    ]),
  };
}
