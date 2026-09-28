import { describe, expect, it } from "@jest/globals";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { Story } from "core/models/Story.js";
import type { Beat, BeatOption, StoryState, ThreadAnalysis } from "core/types/index.js";
import { productionCallLimits } from "../../../../../src/shared/llm/chatModel.js";
import { beatStep } from "../../../../../src/game/services/storyTextSteps.js";
import { STATE_MARKER } from "../../../../../src/game/services/storyTextRounds/roundEdits.js";
import { productionFormRequest } from "../../../../../src/game/services/storyTextRounds/requestFormB9.js";
import { THIS_BEAT_HEADING } from "../../../../../src/game/services/storyTextRounds/turnRound3.js";
import { endedChapter, outcome, roundStory, topicSwitch } from "../../../../helpers/roundStories.js";
import { beatGeneration, challengeOptions, threadAnalysis, type ThreadKind } from "../../../../helpers/textFixtures.js";

/*
 * B9, the request form's gate (the owner's feedback workflow, 2026-09-28):
 * production's own single-player turn form (today's form with the option
 * rules on rolled chapter steps, no chapter rules on a switch turn) sent as
 * GPT-6 caches best: the fixed rules first, byte-identical within a class of
 * turn, then THIS BEAT (the lines that differ per turn, moved word for word)
 * and the story state, with production's timeout and output cap.
 */

const GUILD = "player1_guild_reform";
const ENCLAVE = "player1_enclave_trust";
const OUTCOMES = { player1: [outcome(GUILD, { milestones: ["Sir Bram listened"] }), outcome(ENCLAVE)] };
const DIRECTIONS: [string, string][] = [
  ["Petition the Guild", GUILD],
  ["Win over the enclave", ENCLAVE],
  ["Print the pamphlet", GUILD],
];

const occurrences = (text: string, passage: string) => text.split(passage).length - 1;
const schemaJson = (schema: Parameters<typeof toJsonSchema>[0]) => JSON.stringify(toJsonSchema(schema));
const withState = (story: Story, patch: Partial<StoryState>) => Story.create({ ...story.getState(), ...patch });

const firstTurn = () => roundStory({ turns: 0, maxTurns: 20, playerOutcomes: OUTCOMES, phases: [topicSwitch(DIRECTIONS, 0)] });
const switchAfterChapter = () =>
  roundStory({ turns: 5, maxTurns: 20, playerOutcomes: OUTCOMES, phases: [topicSwitch(DIRECTIONS, 0), endedChapter(GUILD, 4, 1, "The Guild hears the petition"), topicSwitch(DIRECTIONS, 5)] });
const ending = () =>
  roundStory({
    turns: 6,
    maxTurns: 6,
    playerOutcomes: OUTCOMES,
    phases: [topicSwitch(DIRECTIONS, 0), endedChapter(GUILD, 2, 1, "The Guild hears the petition"), topicSwitch(DIRECTIONS, 3), endedChapter(ENCLAVE, 2, 4, "The enclave sends Gruk")],
  });

function chapterStep(kind: ThreadKind, done: number, duration = 3, history?: Beat[]): Story {
  const analysis = threadAnalysis(kind, duration, 1);
  const chapter: ThreadAnalysis = {
    ...analysis,
    threads: analysis.threads.map((t) => ({
      ...t,
      outcomeId: GUILD,
      progression: t.progression.map((step, i) => ({ ...step, resolution: i < done ? (kind === "exploration" ? ("resolution1" as const) : ("favorable" as const)) : null })),
    })),
  };
  const story = roundStory({ turns: 1 + done, maxTurns: 20, playerOutcomes: OUTCOMES, phases: [topicSwitch(DIRECTIONS, 0), chapter] });
  if (!history) return story;
  const state = story.getState();
  return Story.create({ ...state, players: { player1: { ...state.players.player1, beatHistory: history } } });
}

function challengeBeat(lever: BeatOption["resourceType"] = "normal"): Beat {
  const options = challengeOptions().map((o, i) => ({ ...o, resourceType: i === 0 ? lever : ("normal" as const) }));
  return { ...beatGeneration({ options }), choice: 0, resolution: "favorable" };
}

const STORIES: [string, () => Story][] = [
  ["first turn", firstTurn],
  ["switch after a chapter", switchAfterChapter],
  ["challenge step", () => chapterStep("challenge", 1)],
  ["challenge opening", () => chapterStep("challenge", 0)],
  ["challenge last step", () => chapterStep("challenge", 2)],
  ["exploration step", () => chapterStep("exploration", 1)],
  ["ending", ending],
  ["template story, challenge step", () => withState(chapterStep("challenge", 1), { templateId: "tpl-1" })],
  ["story that generates images, switch after a chapter", () => withState(switchAfterChapter(), { generateImages: true })],
];

/** A line without its list markers, so a moved line reads the same under THIS BEAT's "- " as in its old place. */
const bare = (line: string) => line.replace(/^[\s-]+/, "").trim();
const barLines = (text: string) => new Set(text.split("\n").map(bare).filter(Boolean));

describe("productionFormRequest (B9 on production's single-player turn form)", () => {
  it.each(STORIES)("%s: fixed rules without the state, the per-call part ending in production's state, production's reply format and limits", (_name, make) => {
    const story = make();
    const oneMessage = beatStep.request(story);
    const request = productionFormRequest(story);
    expect(request.fixed).not.toContain(STATE_MARKER);
    expect(occurrences(request.perCall, STATE_MARKER)).toBe(1);
    expect(request.perCall.endsWith(oneMessage.prompt.slice(oneMessage.prompt.indexOf(STATE_MARKER)))).toBe(true);
    expect(schemaJson(request.schema)).toBe(schemaJson(oneMessage.schema));
    expect(request.limits).toEqual(productionCallLimits("beat", 1));
  });

  it.each(STORIES)("%s: loses nothing, every line of production's rules is in the fixed rules or under THIS BEAT", (_name, make) => {
    const story = make();
    const oneMessage = beatStep.request(story).prompt;
    const request = productionFormRequest(story);
    const kept = new Set([...barLines(request.fixed), ...barLines(request.perCall)]);
    const missing = [...barLines(oneMessage.slice(0, oneMessage.indexOf(STATE_MARKER)))].filter((line) => !kept.has(line));
    expect(missing).toEqual([]);
  });

  it("is single-player only (groups keep one message)", () => {
    const group = roundStory({ players: 2, turns: 0, maxTurns: 20, phases: [topicSwitch(DIRECTIONS, 0, ["player1", "player2"])] });
    expect(() => productionFormRequest(group)).toThrow(/single-player/);
  });
});

describe("the fixed rules cache: byte-identical within a class of turn", () => {
  it("is one text for every step of a challenge chapter, first or later, last or not, whatever the lever line says", () => {
    const steps = [
      chapterStep("challenge", 0),
      chapterStep("challenge", 1),
      chapterStep("challenge", 2),
      chapterStep("challenge", 1, 4),
      chapterStep("challenge", 1, 3, [challengeBeat("sacrifice"), challengeBeat()]),
      chapterStep("challenge", 1, 3, [challengeBeat(), challengeBeat()]),
    ];
    // The lever line differs between the last two, so the rule really is per call
    expect(productionFormRequest(steps[4]).perCall).not.toBe(productionFormRequest(steps[5]).perCall);
    expect(new Set(steps.map((s) => productionFormRequest(s).fixed)).size).toBe(1);
  });

  it("is one text for every step of an exploration chapter", () => {
    expect(productionFormRequest(chapterStep("exploration", 0)).fixed).toBe(productionFormRequest(chapterStep("exploration", 2)).fixed);
  });
});

describe("THIS BEAT: the per-call lines, moved out of the fixed rules word for word", () => {
  it("names a chapter step's position, its title number, the results and tone lines after the first step, and the lever line", () => {
    const request = productionFormRequest(chapterStep("challenge", 1));
    expect(request.perCall.startsWith(`${THIS_BEAT_HEADING}\n`)).toBe(true);
    for (const line of [
      "Remember that this is beat 2/3 of the current thread (or set of threads).",
      "This is not yet the last beat of the thread.",
      "Add '(2/3)' after the title to indicate the beat number of the current thread.",
      "Results of the player's actions depend on the resolution of the previous beat.",
      "adjust the tone of this beat accordingly.",
      "Sacrifice or reward:",
    ]) {
      expect(request.perCall).toContain(line);
      expect(request.fixed).not.toContain(line);
    }
    expect(request.fixed).toContain("THIS BEAT says which beat of the thread this is, and whether it is the last.");
    expect(request.fixed).toContain("THIS BEAT says whether a sacrifice or reward fits this turn.");
  });

  it("says a chapter's last step is its last, and gives an opening step no results or tone line", () => {
    expect(productionFormRequest(chapterStep("challenge", 2)).perCall).toContain("- This is the last beat of the thread.");
    const opening = productionFormRequest(chapterStep("challenge", 0));
    for (const part of [opening.fixed, opening.perCall]) {
      expect(part).not.toContain("Results of the player's actions depend on");
      expect(part).not.toContain("adjust the tone of this beat accordingly");
    }
  });

  it("keeps a switch turn's results line in the fixed rules (every switch turn has it), and a first turn has nothing per call", () => {
    const after = productionFormRequest(switchAfterChapter());
    expect(after.fixed).toContain("Results of the player's actions depend on the resolution of the previous beat.");
    expect(after.perCall.startsWith(STATE_MARKER)).toBe(true);
    expect(productionFormRequest(firstTurn()).perCall.startsWith(STATE_MARKER)).toBe(true);
  });

  it("names the player portraits' source there: a template's, or the story's own", () => {
    const template = productionFormRequest(withState(chapterStep("challenge", 1), { templateId: "tpl-1" }));
    expect(template.perCall).toContain("- For player characters, use ids player1, player2, etc. and source template.");
    expect(template.fixed).toContain("with the source THIS BEAT names");
    expect(productionFormRequest(withState(switchAfterChapter(), { generateImages: true })).perCall).toContain("and source story.");
  });
});
