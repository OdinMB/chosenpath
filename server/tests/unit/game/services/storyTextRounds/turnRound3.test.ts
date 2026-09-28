import { describe, expect, it } from "@jest/globals";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { Story } from "core/models/Story.js";
import type { Beat, BeatOption, StoryState, ThreadAnalysis } from "core/types/index.js";
import { productionCallLimits } from "../../../../../src/shared/llm/chatModel.js";
import { STATE_MARKER } from "../../../../../src/game/services/storyTextRounds/roundEdits.js";
import { TURN_ROUND2_TEXT, turnRound2Request } from "../../../../../src/game/services/storyTextRounds/turnRound2.js";
import { THIS_BEAT_HEADING, turnRound3FormRequest } from "../../../../../src/game/services/storyTextRounds/turnRound3.js";
import { endedChapter, flavorSwitch, outcome, roundStory, topicSwitch } from "../../../../helpers/roundStories.js";
import { beatGeneration, challengeOptions, threadAnalysis, type ThreadKind } from "../../../../helpers/textFixtures.js";
import { descriptionsOf } from "../storyTextRewrite/rewriteChecks.js";

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
const descriptions = (schema: Parameters<typeof toJsonSchema>[0]) => descriptionsOf(toJsonSchema(schema)).join("\n");

function withState(story: Story, patch: Partial<StoryState>): Story {
  return Story.create({ ...story.getState(), ...patch });
}

function firstTurn(kind: "topic" | "flavor" = "topic"): Story {
  const phase = kind === "topic" ? topicSwitch(DIRECTIONS, 0) : flavorSwitch(GUILD, "How does Rikkit answer the Guild?", 0);
  return roundStory({ turns: 0, maxTurns: 20, playerOutcomes: OUTCOMES, phases: [phase] });
}

function switchAfterChapter(): Story {
  return roundStory({
    turns: 5,
    maxTurns: 20,
    playerOutcomes: OUTCOMES,
    phases: [topicSwitch(DIRECTIONS, 0), endedChapter(GUILD, 4, 1, "The Guild hears the petition"), topicSwitch(DIRECTIONS, 5)],
  });
}

/** Step `done + 1` of a `duration`-beat chapter of this kind on the guild outcome, after the opening switch */
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

function ending(): Story {
  return roundStory({
    turns: 6,
    maxTurns: 6,
    playerOutcomes: OUTCOMES,
    phases: [topicSwitch(DIRECTIONS, 0), endedChapter(GUILD, 2, 1, "The Guild hears the petition"), topicSwitch(DIRECTIONS, 3), endedChapter(ENCLAVE, 2, 4, "The enclave sends Gruk")],
  });
}

function challengeBeat(lever: BeatOption["resourceType"] = "normal"): Beat {
  const options = challengeOptions().map((o, i) => ({ ...o, resourceType: i === 0 ? lever : ("normal" as const) }));
  return { ...beatGeneration({ options }), choice: 0, resolution: "favorable" };
}

const STORIES: [string, () => Story][] = [
  ["first turn (topic)", () => firstTurn()],
  ["first turn (flavor)", () => firstTurn("flavor")],
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

describe("turnRound3FormRequest (B9: the GPT-6 request form)", () => {
  it.each(STORIES)("%s: fixed rules without the state, the per-call part ending in the one-message form's state, its reply format, production's limits", (_name, make) => {
    const story = make();
    const oneMessage = turnRound2Request(story, "paragraphsLast");
    const request = turnRound3FormRequest(story);
    expect(request.fixed).not.toContain(STATE_MARKER);
    expect(occurrences(request.perCall, STATE_MARKER)).toBe(1);
    expect(request.perCall.endsWith(oneMessage.prompt.slice(oneMessage.prompt.indexOf(STATE_MARKER)))).toBe(true);
    expect(schemaJson(request.schema)).toBe(schemaJson(oneMessage.schema));
    // The limits production's beats have since the migration: 90 s and 12,000 output tokens for one player
    expect(request.limits).toEqual(productionCallLimits("beat", 1));
    expect(request.limits).toEqual({ timeoutMs: 90_000, maxCompletionTokens: 12_000 });
  });

  it.each(STORIES)("%s: loses nothing, every line of the one-message form's rules is in the fixed rules or under THIS BEAT", (_name, make) => {
    const story = make();
    const oneMessage = turnRound2Request(story, "paragraphsLast").prompt;
    const request = turnRound3FormRequest(story);
    const kept = new Set([...barLines(request.fixed), ...barLines(request.perCall)]);
    const missing = [...barLines(oneMessage.slice(0, oneMessage.indexOf(STATE_MARKER)))].filter((line) => !kept.has(line));
    expect(missing).toEqual([]);
  });

  it("keeps the reply's assembly: the first turn, the switch after a chapter and the ending are stored in today's shape", () => {
    for (const story of [firstTurn(), switchAfterChapter(), ending()]) expect(turnRound3FormRequest(story).assemble).toBeDefined();
    expect(turnRound3FormRequest(chapterStep("challenge", 1)).assemble).toBeUndefined();
    const assembled = turnRound3FormRequest(firstTurn()).assemble?.({ newMilestones: "", multiplayerCoordination: "", player1: { text: "x" } }) as Record<string, unknown>;
    expect(assembled.statChanges).toEqual([]);
  });

  it("is single-player only, like the round-2 form it carries (groups are B10)", () => {
    const group = roundStory({ players: 2, turns: 0, maxTurns: 20, phases: [topicSwitch(DIRECTIONS, 0, ["player1", "player2"])] });
    expect(() => turnRound3FormRequest(group)).toThrow(/single-player/);
  });
});

describe("the fixed rules cache: byte-identical within a class of turn", () => {
  it("is one text for every step of a challenge chapter, first or later, last or not, whatever the lever line says", () => {
    const fixedOf = (story: Story) => turnRound3FormRequest(story).fixed;
    const steps = [
      chapterStep("challenge", 0),
      chapterStep("challenge", 1),
      chapterStep("challenge", 2),
      chapterStep("challenge", 1, 4),
      chapterStep("challenge", 1, 3, [challengeBeat("sacrifice"), challengeBeat()]),
      chapterStep("challenge", 1, 3, [challengeBeat(), challengeBeat()]),
    ];
    // The lever line differs between the last two, so the rule really is per call
    expect(turnRound3FormRequest(steps[4]).perCall).not.toBe(turnRound3FormRequest(steps[5]).perCall);
    expect(new Set(steps.map(fixedOf)).size).toBe(1);
  });

  it("is one text for a topic and a flavor first turn", () => {
    expect(turnRound3FormRequest(firstTurn("flavor")).fixed).toBe(turnRound3FormRequest(firstTurn()).fixed);
  });

  it("is one text for every step of an exploration chapter", () => {
    expect(turnRound3FormRequest(chapterStep("exploration", 0)).fixed).toBe(turnRound3FormRequest(chapterStep("exploration", 2)).fixed);
  });
});

describe("THIS BEAT: the per-call lines, moved out of the fixed rules word for word", () => {
  it("names a chapter step's position, its title number, the results and tone lines after the first step, and the lever line", () => {
    const request = turnRound3FormRequest(chapterStep("challenge", 1));
    expect(request.perCall.startsWith(`${THIS_BEAT_HEADING}\n`)).toBe(true);
    for (const line of [
      "Remember that this is beat 2/3 of the current thread (or set of threads).",
      "This is not yet the last beat of the thread.",
      "the player will not gain or permanently lose the chance to gain the artifact in steps 1 and 2.",
      "Add '(2/3)' after the title to indicate the beat number of the current thread.",
      "Results of the player's actions depend on the resolution of the previous beat.",
      "If the previous beat for this player was favorable / mixed / unfavorable, adjust the tone of this beat accordingly.",
      "- Sacrifice or reward:",
    ]) {
      expect(request.perCall).toContain(line);
      expect(request.fixed).not.toContain(line);
    }
    expect(request.fixed).not.toContain("2/3");
    // Each moved rule leaves a pointer where it stood
    expect(request.fixed).toContain("THIS BEAT says which beat of the thread this is");
    expect(request.fixed).toContain("as THIS BEAT gives it");
    expect(request.fixed).toContain("THIS BEAT says whether a sacrifice or reward fits this turn");
  });

  it("says a chapter's last step is its last, and gives an opening step no results or tone line", () => {
    expect(turnRound3FormRequest(chapterStep("challenge", 2)).perCall).toContain("- This is the last beat of the thread.");
    const opening = turnRound3FormRequest(chapterStep("challenge", 0));
    expect(opening.perCall).toContain("Remember that this is beat 1/3");
    for (const part of [opening.fixed, opening.perCall]) {
      expect(part).not.toContain("Results of the player's actions depend on");
      expect(part).not.toContain("adjust the tone of this beat accordingly");
    }
  });

  it("stages a flavor first switch there, and a topic first turn has nothing per call", () => {
    const flavor = turnRound3FormRequest(firstTurn("flavor"));
    expect(flavor.perCall).toContain(TURN_ROUND2_TEXT.flavorOpening);
    expect(flavor.fixed).not.toContain(TURN_ROUND2_TEXT.flavorOpening);
    const topic = turnRound3FormRequest(firstTurn());
    expect(topic.perCall.startsWith(STATE_MARKER)).toBe(true);
  });

  it("names the player portraits' source there: a template's, or the story's own", () => {
    const template = turnRound3FormRequest(withState(chapterStep("challenge", 1), { templateId: "tpl-1" }));
    expect(template.perCall).toContain("- For player characters, use ids player1, player2, etc. and source template.");
    expect(template.fixed).not.toContain("and source template");
    expect(template.fixed).toContain("with the source THIS BEAT names");
    const custom = turnRound3FormRequest(withState(switchAfterChapter(), { generateImages: true }));
    expect(custom.perCall).toContain("and source story.");
    // A story without images has no source to name, and no THIS BEAT at a switch
    expect(turnRound3FormRequest(switchAfterChapter()).perCall.startsWith(STATE_MARKER)).toBe(true);
  });

  it("gives the ending nothing per call", () => {
    expect(turnRound3FormRequest(ending()).perCall.startsWith(STATE_MARKER)).toBe(true);
  });
});

describe("the paragraph rule (B9 item 2 with the paragraph arm's one fix)", () => {
  it.each(STORIES)("%s: the count at the text field and once in the context, the shouted copies gone", (_name, make) => {
    const request = turnRound3FormRequest(make());
    const all = `${request.fixed}\n${request.perCall}\n${descriptions(request.schema)}`;
    expect(all).not.toContain("These are a lot of instructions");
    expect(occurrences(descriptions(request.schema), TURN_ROUND2_TEXT.paragraphCount)).toBe(1);
    expect(occurrences(all, "5-6 paragraphs")).toBe(1);
  });

  it("gives the last paragraph the others' length wherever a last-paragraph rule exists", () => {
    expect(turnRound3FormRequest(chapterStep("challenge", 1)).fixed).toContain(`- The last paragraph, ${TURN_ROUND2_TEXT.lastParagraphLength}, brings`);
    expect(turnRound3FormRequest(ending()).fixed).not.toContain("- The last paragraph");
  });
});
