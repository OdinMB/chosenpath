import { describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import type { Story } from "core/models/Story.js";
import { GameModes } from "core/types/index.js";
import {
  OUTCOME_SETTLED_TEXT,
  completionLines,
  outcomeSettledRequest,
  outcomesCompletedThisBeat,
  takesSettledEnding,
} from "../../../../../src/game/services/storyTextRounds/outcomeSettled.js";
import { productionTurnToday } from "../../../../../src/game/services/storyTextRounds/choiceResult.js";
import { evalFiles } from "../../../../../src/evals/textModelEval/evalFiles.js";
import { caseStory } from "../../../../../src/evals/textModelEval/cases.js";
import { callLimitsOf, requestFor, requestText } from "../../../../../src/evals/textModelEval/variants.js";
import { productionCallLimits } from "../../../../../src/shared/llm/chatModel.js";
import { endingBeat, firstSwitchBeat, threadBeat } from "../../../../helpers/promptStories.js";
import { endedChapter, outcome, roundStory, topicSwitch } from "../../../../helpers/roundStories.js";

/*
 * The turn that completes an outcome, and the ending (eval only; the second
 * playthroughs' review of 2026-09-30). The space pirates' switch turn 14 wrote
 * the treasure claim's completing milestone, but its text told the claim as
 * "open and unsettled" and it stored a fact that the record "does not settle"
 * it, beside older facts calling it provisional; the three endings followed
 * the facts. New Avalon's switch turn 16 wrote the parting milestone of Jun and
 * Orin and, in the same reply, set their relationship to its closest level,
 * which the ending read as renewed trust. Production's switch turn is never
 * told that a milestone completes its outcome (the state shows "1 / 2"), and
 * nothing says a stat change must agree with the milestone beside it. The
 * variant is production's turn with, on a switch turn after a chapter and at
 * the ending, a stat line (no stat change contradicts a milestone this beat
 * adds); on a switch turn whose milestones complete an outcome, the outcomes
 * it completes and that they are told and recorded as settled; and at an
 * ending with a complete outcome, that earlier milestones, facts, summaries
 * and stat levels calling it open give way to its milestones. Everywhere else
 * production's request byte for byte.
 */

jest.spyOn(console, "log").mockImplementation(() => undefined);

const json = (schema: Parameters<typeof toJsonSchema>[0]) => JSON.stringify(toJsonSchema(schema));
const occurrences = (text: string, passage: string) => text.split(passage).length - 1;

const CASES_DIR = path.resolve("..", "DOCS", "2026-09-26_gpt6-text-eval");
const frozen = fs.existsSync(path.join(CASES_DIR, "cases", "cases.json")) ? evalFiles(CASES_DIR).readCases() : [];

const GUILD = "player1_guild_reform";
const ENCLAVE = "player1_enclave_trust";
const DIRECTIONS: [string, string][] = [
  ["Petition the Guild", GUILD],
  ["Win over the enclave", ENCLAVE],
];

/** A single player's switch after a chapter on the guild outcome, which held `recorded` of `intended` milestones before it. */
function switchAfterChapter(recorded: number, intended: number): Story {
  const milestones = Array.from({ length: recorded }, (_, i) => `Guild milestone ${i + 1}`);
  return roundStory({
    turns: 5,
    maxTurns: 20,
    playerOutcomes: { player1: [outcome(GUILD, { intendedNumberOfMilestones: intended, milestones }), outcome(ENCLAVE)] },
    phases: [topicSwitch(DIRECTIONS, 0), endedChapter(GUILD, 4, 1, "The Guild hears"), topicSwitch(DIRECTIONS, 5)],
  });
}

/** A group's switch after a chapter: every player on the shared vote (1 of 2 before), completing it. */
function groupSwitchAfterChapter(players: number): Story {
  const slots = Array.from({ length: players }, (_, i) => `player${i + 1}`);
  return roundStory({
    players,
    turns: 5,
    maxTurns: 20,
    gameMode: GameModes.Cooperative,
    sharedOutcomes: [outcome("shared_vote", { milestones: ["The hall listens"] })],
    playerOutcomes: Object.fromEntries(slots.map((slot) => [slot, [outcome(`${slot}_pride`)]])),
    phases: [topicSwitch([["Vote", "shared_vote"]], 0, slots), endedChapter("shared_vote", 4, 1, "The vote passes", slots), topicSwitch([["Vote", "shared_vote"]], 5, slots)],
  });
}

/** A single player's ending, the chapter just ended on the guild outcome at `recorded` of `intended` before it. */
function endingAfterChapter(recorded: number, intended: number): Story {
  const milestones = Array.from({ length: recorded }, (_, i) => `Guild milestone ${i + 1}`);
  return roundStory({
    turns: 7,
    maxTurns: 7,
    playerOutcomes: { player1: [outcome(GUILD, { intendedNumberOfMilestones: intended, milestones }), outcome(ENCLAVE)] },
    phases: [topicSwitch(DIRECTIONS, 0), endedChapter(GUILD, 2, 1, "The ledger"), topicSwitch(DIRECTIONS, 3), endedChapter(GUILD, 3, 4, "The Guild hears")],
  });
}

/** The prompt with the variant's insertions taken out again. */
function withoutInsertions(prompt: string, story: Story): string {
  const completion = completionLines(story);
  return [OUTCOME_SETTLED_TEXT.statLine, completion, OUTCOME_SETTLED_TEXT.endingLine].filter(Boolean).reduce((text, passage) => text.split(passage).join(""), prompt);
}

function expectBaseAround(story: Story) {
  const [variant, base] = [outcomeSettledRequest(story), productionTurnToday(story)];
  expect(withoutInsertions(variant.prompt, story)).toBe(base.prompt);
  expect(json(variant.schema)).toBe(json(base.schema));
}

describe("which outcomes a switch turn completes", () => {
  it("reads an outcome the ended chapter completes, with its count", () => {
    expect(outcomesCompletedThisBeat(switchAfterChapter(1, 2))).toEqual([{ id: GUILD, owner: "player1", milestones: 2, intended: 2, complete: true }]);
    expect(outcomesCompletedThisBeat(switchAfterChapter(0, 1))).toEqual([{ id: GUILD, owner: "player1", milestones: 1, intended: 1, complete: true }]);
  });

  it("leaves out an outcome that still needs milestones, and one that was complete before (an aftermath)", () => {
    expect(outcomesCompletedThisBeat(switchAfterChapter(0, 2))).toEqual([]);
    expect(outcomesCompletedThisBeat(switchAfterChapter(2, 2))).toEqual([]);
  });

  it("reads nothing on a turn that follows no chapter", () => {
    expect(outcomesCompletedThisBeat(firstSwitchBeat(1))).toEqual([]);
    expect(outcomesCompletedThisBeat(threadBeat(1))).toEqual([]);
  });

  it("marks a shared outcome shared in a group", () => {
    expect(outcomesCompletedThisBeat(groupSwitchAfterChapter(2))).toEqual([{ id: "shared_vote", owner: "shared", milestones: 2, intended: 2, complete: true }]);
  });
});

describe("the completion lines", () => {
  it("name each outcome the beat completes, its count, and that it is told and recorded as settled", () => {
    const lines = completionLines(switchAfterChapter(1, 2));
    expect(lines).toBe(`- This beat's milestones complete these outcomes: ${GUILD} (2 of 2 milestones).\n${OUTCOME_SETTLED_TEXT.settled}${OUTCOME_SETTLED_TEXT.earlierOpen}`);
    expect(OUTCOME_SETTLED_TEXT.settled).toContain("never as open, provisional, undecided or still to be settled");
    expect(OUTCOME_SETTLED_TEXT.earlierOpen).toContain("were written before");
  });

  it("carry the owner in a group", () => {
    expect(completionLines(groupSwitchAfterChapter(3))).toContain("shared_vote (shared, 2 of 2 milestones)");
  });

  it("are empty where the beat completes nothing", () => {
    expect(completionLines(switchAfterChapter(0, 2))).toBe("");
    expect(completionLines(endingAfterChapter(1, 2))).toBe("");
  });
});

describe("the variant on a switch turn after a chapter", () => {
  it("adds the stat line after the thread-resolution lines and the completion lines after the milestone lines, once each", () => {
    const story = switchAfterChapter(1, 2);
    const prompt = outcomeSettledRequest(story).prompt;
    expect(occurrences(prompt, OUTCOME_SETTLED_TEXT.statLine)).toBe(1);
    expect(prompt).toContain(`${OUTCOME_SETTLED_TEXT.statAnchor}${OUTCOME_SETTLED_TEXT.statLine}`);
    expect(occurrences(prompt, completionLines(story))).toBe(1);
    expect(prompt).toContain(`${OUTCOME_SETTLED_TEXT.milestoneAnchor}${completionLines(story)}`);
    expect(prompt).not.toContain(OUTCOME_SETTLED_TEXT.endingLine);
    expectBaseAround(story);
  });

  it("adds only the stat line where the chapter completes no outcome", () => {
    const story = switchAfterChapter(0, 2);
    const prompt = outcomeSettledRequest(story).prompt;
    expect(occurrences(prompt, OUTCOME_SETTLED_TEXT.statLine)).toBe(1);
    expect(prompt).not.toContain("This beat's milestones complete");
    expectBaseAround(story);
  });

  it.each([2, 3])("works the same for %s players", (players) => {
    const story = groupSwitchAfterChapter(players);
    const prompt = outcomeSettledRequest(story).prompt;
    expect(occurrences(prompt, OUTCOME_SETTLED_TEXT.statLine)).toBe(1);
    expect(prompt).toContain("shared_vote (shared, 2 of 2 milestones)");
    expectBaseAround(story);
  });

  it("says the stat line with its reason and an example from no played story", () => {
    expect(OUTCOME_SETTLED_TEXT.statLine).toContain("No stat change contradicts a milestone this beat adds");
    expect(OUTCOME_SETTLED_TEXT.statLine).toContain("adjustments after threads");
  });
});

describe("the variant at the ending", () => {
  it("adds the stat line and, with a complete outcome, the line that the milestones hold over what calls it open", () => {
    const story = endingAfterChapter(1, 2);
    expect(takesSettledEnding(story)).toBe(true);
    const prompt = outcomeSettledRequest(story).prompt;
    expect(occurrences(prompt, OUTCOME_SETTLED_TEXT.statLine)).toBe(1);
    expect(occurrences(prompt, OUTCOME_SETTLED_TEXT.endingLine)).toBe(1);
    expect(prompt).toContain(`${OUTCOME_SETTLED_TEXT.endingAnchor}${OUTCOME_SETTLED_TEXT.endingLine}`);
    expect(prompt).not.toContain("This beat's milestones complete");
    expectBaseAround(story);
  });

  it("adds only the stat line where no outcome is complete", () => {
    const story = endingAfterChapter(0, 3);
    expect(takesSettledEnding(story)).toBe(false);
    const prompt = outcomeSettledRequest(story).prompt;
    expect(occurrences(prompt, OUTCOME_SETTLED_TEXT.statLine)).toBe(1);
    expect(prompt).not.toContain(OUTCOME_SETTLED_TEXT.endingLine);
    expectBaseAround(story);
  });

  it("works on production's group ending too", () => {
    const story = endingBeat(2);
    const prompt = outcomeSettledRequest(story).prompt;
    expect(occurrences(prompt, OUTCOME_SETTLED_TEXT.statLine)).toBe(1);
    expectBaseAround(story);
  });
});

describe("production's request byte for byte everywhere else", () => {
  it.each([
    ["a first turn", () => firstSwitchBeat(1)],
    ["a chapter step", () => threadBeat(1)],
    ["a group's first turn", () => firstSwitchBeat(3)],
    ["a group's chapter step", () => threadBeat(2)],
  ] as const)("%s", (_, build) => {
    const story = build();
    const [variant, base] = [outcomeSettledRequest(story), productionTurnToday(story)];
    expect(variant.prompt).toBe(base.prompt);
    expect(json(variant.schema)).toBe(json(base.schema));
  });

  (frozen.length ? it : it.skip)("every frozen turn case: the base around the insertions, which only a switch after a chapter or an ending carries", () => {
    const turns = frozen.filter((c) => c.role === "beat" && c.state);
    expect(turns.length).toBeGreaterThan(50);
    for (const c of turns) {
      const story = caseStory(c);
      const variant = outcomeSettledRequest(story).prompt;
      const base = productionTurnToday(story).prompt;
      const afterChapter = !story.isFirstBeat() && (story.getCurrentBeatType() === "switch" || story.getCurrentBeatType() === "ending");
      expect([c.id, withoutInsertions(variant, story) === base, variant === base]).toEqual([c.id, true, !afterChapter]);
    }
  });
});

describe("the one fix-and-retest (outcomeSettledB): the completing milestone kept specific", () => {
  it("rewords the completion's settled line and the ending line, in the same places, nothing else changed", () => {
    const { settled, settledSpecific, endingLine, endingLineSpecific } = OUTCOME_SETTLED_TEXT;
    expect(settledSpecific).toContain("made specific from the thread's text");
    expect(settledSpecific).not.toContain("Write its milestone as the thread's resolution settles it");
    expect(endingLineSpecific).not.toContain("follow the milestones");
    for (const story of [switchAfterChapter(1, 2), groupSwitchAfterChapter(3), endingAfterChapter(1, 2), switchAfterChapter(0, 2), endingAfterChapter(0, 3), threadBeat(1)]) {
      const [first, retest] = [outcomeSettledRequest(story), outcomeSettledRequest(story, { specificMilestone: true })];
      expect(retest.prompt).toBe(first.prompt.split(settled).join(settledSpecific).split(endingLine).join(endingLineSpecific));
      expect(json(retest.schema)).toBe(json(first.schema));
    }
    expect(outcomeSettledRequest(switchAfterChapter(1, 2), { specificMilestone: true }).prompt).toContain(settledSpecific);
    expect(outcomeSettledRequest(endingAfterChapter(1, 2), { specificMilestone: true }).prompt).toContain(endingLineSpecific);
  });

  it("is the eval's outcomeSettledB, with production's turn limits", () => {
    const story = switchAfterChapter(1, 2);
    const request = requestFor("outcomeSettledB", { role: "beat", story });
    expect(requestText(request)).toBe(outcomeSettledRequest(story, { specificMilestone: true }).prompt);
    expect(callLimitsOf(request)).toEqual(productionCallLimits("beat", 1));
  });
});

describe("the eval variant", () => {
  it("sends the request with production's turn limits for the player count", () => {
    for (const [players, story] of [
      [1, switchAfterChapter(1, 2)],
      [3, groupSwitchAfterChapter(3)],
    ] as const) {
      const request = requestFor("outcomeSettled", { role: "beat", story });
      expect(requestText(request)).toBe(outcomeSettledRequest(story).prompt);
      expect(callLimitsOf(request)).toEqual(productionCallLimits("beat", players));
    }
  });

  it("covers turns only", () => {
    expect(() => requestFor("outcomeSettled", { role: "switch", story: switchAfterChapter(1, 2) })).toThrow(/does not cover role switch/);
  });
});
