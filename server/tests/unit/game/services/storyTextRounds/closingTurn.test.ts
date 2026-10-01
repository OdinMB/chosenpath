import { describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import type { Story } from "core/models/Story.js";
import type { StoryState } from "core/types/index.js";
import { beatStep } from "../../../../../src/game/services/storyTextSteps.js";
import { ENDING_MILESTONES_PLAYED } from "../../../../../src/game/services/prompts/BeatPromptService.js";
import { beatCheckOptions } from "../../../../../src/game/services/kidsTurnRules.js";
import { CLOSING_TURN_TEXT, closesChapter, noNewMilestonesRequest, noThreadAuditRequest } from "../../../../../src/game/services/storyTextRounds/closingTurn.js";
import { callLimitsOf, requestFor, requestText } from "../../../../../src/evals/textModelEval/variants.js";
import { productionCallLimits } from "../../../../../src/shared/llm/chatModel.js";
import { evalFiles } from "../../../../../src/evals/textModelEval/evalFiles.js";
import { RUNAWAY_2_CASES } from "../../../../../src/evals/textModelEval/arms.js";
import { caseStory } from "../../../../../src/evals/textModelEval/cases.js";
import { sha256 } from "../../../../../src/evals/textModelEval/executor.js";
import { endingBeat, firstSwitchBeat, laterSwitchBeat, threadBeat } from "../../../../helpers/promptStories.js";
import { beforeShortReplies } from "../../../../helpers/adoptedDeltas.js";

/*
 * The runaway turn, second attempt (eval only, 2026-10-01). Every GPT-6 reply
 * the eval ever cut at production's output cap (17 in calls.jsonl since
 * 2026-09-28, 2 in the playthroughs) fell on a turn that closes a chapter: a
 * switch turn after a chapter, or the ending. None of about 1,700 chapter
 * steps, chapter openings and first turns on Luna medium did, nor any of about
 * 290 closing turns on Luna low. Production's closing turn differs from every
 * other turn in two blocks of its stat-changes section: THREAD RESOLUTION (the
 * after-thread stat audit: "all stats can change", each stat's adjustments after
 * threads) and NEW MILESTONES (the model writes the chapter's milestone, the
 * reply's newMilestones list; every other turn sends newMilestones as ""). The
 * two diagnostic variants each take one block out, production's request byte
 * for byte otherwise:
 * - noThreadAudit: the closing turn's stat rules as a chapter step's (only
 *   stats that can be adjusted anytime, besides levers), and the statChanges
 *   field without its after-thread sentence;
 * - noNewMilestones: no NEW MILESTONES block (nor the ending's played-milestones
 *   line), and newMilestones the "" every other turn sends (the engine records
 *   the chapter's planned milestone, its existing fallback).
 */

jest.spyOn(console, "log").mockImplementation(() => undefined);

const json = (schema: Parameters<typeof toJsonSchema>[0]) => JSON.stringify(toJsonSchema(schema));
const occurrences = (text: string, passage: string) => text.split(passage).length - 1;
const properties = (schema: Parameters<typeof toJsonSchema>[0]) => (toJsonSchema(schema) as { properties: Record<string, unknown> }).properties;
const kids = (min: number): Partial<StoryState> => ({ category: "read-with-kids", kidAges: { min, max: min } });

const CASES_DIR = path.resolve("..", "DOCS", "2026-09-26_gpt6-text-eval");
const frozen = fs.existsSync(path.join(CASES_DIR, "cases", "cases.json")) ? evalFiles(CASES_DIR).readCases() : [];

const CLOSING: [string, () => Story][] = [
  ["a switch turn after a chapter", () => laterSwitchBeat(1)],
  ["the ending", () => endingBeat(1)],
  ["a switch turn after a chapter with generated images", () => laterSwitchBeat(1, { generateImages: true })],
  ["a read-with-kids ending at 4", () => endingBeat(1, kids(4))],
];

const OTHER: [string, () => Story][] = [
  ["the first turn", () => firstSwitchBeat(1)],
  ["a chapter step", () => threadBeat(1)],
  ["a read-with-kids chapter step at 10", () => threadBeat(1, kids(10))],
];

describe("production's closing turn: the two blocks no other turn carries", () => {
  it.each(CLOSING)("%s closes a chapter and carries the after-thread audit and the milestone block once each", (_, build) => {
    const story = build();
    const { prompt, schema } = beatStep.request(story);
    expect(closesChapter(story)).toBe(true);
    expect(occurrences(prompt, CLOSING_TURN_TEXT.threadAudit)).toBe(1);
    expect(occurrences(prompt, CLOSING_TURN_TEXT.newMilestones)).toBe(1);
    expect(occurrences(prompt, CLOSING_TURN_TEXT.chapterStatLine)).toBe(0);
    // The audit comes right after the lever rules, and the milestone block right after the audit
    expect(occurrences(prompt, `${CLOSING_TURN_TEXT.threadAudit}${CLOSING_TURN_TEXT.newMilestones}`)).toBe(1);
    expect((properties(schema).newMilestones as { type?: string }).type).toBe("array");
  });

  it.each(OTHER)("%s carries neither block and sends newMilestones as \"\"", (_, build) => {
    const story = build();
    const { prompt, schema } = beatStep.request(story);
    expect(closesChapter(story)).toBe(false);
    expect(prompt).not.toContain("THREAD RESOLUTION");
    expect(prompt).not.toContain("NEW MILESTONES");
    expect(properties(schema).newMilestones).toEqual(properties(beatStep.request(threadBeat(1)).schema).newMilestones);
    expect((properties(schema).newMilestones as { type?: string }).type).not.toBe("array");
  });

  it("the chapter step's stat line is the one noThreadAudit puts in the audit's place", () => {
    expect(occurrences(beatStep.request(threadBeat(1)).prompt, CLOSING_TURN_TEXT.chapterStatLine)).toBe(1);
  });

  it.each([...CLOSING, ...OTHER])("%s: the statChanges field asks for the after-thread check in one sentence, on every turn", (_, build) => {
    expect(occurrences(json(beatStep.request(build()).schema), CLOSING_TURN_TEXT.afterThreadsSentence)).toBe(1);
  });
});

describe("noThreadAuditRequest: a closing turn without the after-thread stat audit", () => {
  it.each(CLOSING)("%s: the audit replaced by a chapter step's stat line, the field's after-thread sentence cut, nothing else", (_, build) => {
    const story = build();
    const [ours, production] = [noThreadAuditRequest(story), beatStep.request(story)];
    expect(ours.prompt).toBe(production.prompt.replace(CLOSING_TURN_TEXT.threadAudit, CLOSING_TURN_TEXT.chapterStatLine));
    expect(ours.prompt).not.toContain("THREAD RESOLUTION");
    expect(ours.prompt).not.toContain("all stats can change");
    expect(occurrences(ours.prompt, CLOSING_TURN_TEXT.newMilestones)).toBe(1);
    expect(json(ours.schema)).toBe(json(production.schema).replace(CLOSING_TURN_TEXT.afterThreadsSentence, ""));
    expect(json(ours.schema)).not.toContain("adjustments after threads");
  });

  it.each(OTHER)("%s: production's request byte for byte", (_, build) => {
    const story = build();
    const [ours, production] = [noThreadAuditRequest(story), beatStep.request(story)];
    expect(ours.prompt).toBe(production.prompt);
    expect(json(ours.schema)).toBe(json(production.schema));
  });
});

describe("noNewMilestonesRequest: a closing turn that writes no milestone", () => {
  it.each(CLOSING)("%s: no milestone block, newMilestones the \"\" every other turn sends, nothing else", (_, build) => {
    const story = build();
    const [ours, production] = [noNewMilestonesRequest(story), beatStep.request(story)];
    const block = CLOSING_TURN_TEXT.newMilestones + (story.getCurrentBeatType() === "ending" ? ENDING_MILESTONES_PLAYED : "");
    expect(occurrences(production.prompt, block)).toBe(1);
    expect(ours.prompt).toBe(production.prompt.replace(block, ""));
    expect(ours.prompt).not.toContain("NEW MILESTONES");
    expect(ours.prompt).not.toContain(ENDING_MILESTONES_PLAYED);
    expect(occurrences(ours.prompt, CLOSING_TURN_TEXT.threadAudit)).toBe(1);
    const [mine, theirs] = [properties(ours.schema), properties(production.schema)];
    expect(mine.newMilestones).toEqual(properties(beatStep.request(threadBeat(1)).schema).newMilestones);
    expect(Object.keys(mine)).toEqual(Object.keys(theirs));
    for (const key of Object.keys(theirs).filter((k) => k !== "newMilestones")) expect(mine[key]).toEqual(theirs[key]);
  });

  it.each(OTHER)("%s: production's request byte for byte", (_, build) => {
    const story = build();
    const [ours, production] = [noNewMilestonesRequest(story), beatStep.request(story)];
    expect(ours.prompt).toBe(production.prompt);
    expect(json(ours.schema)).toBe(json(production.schema));
  });
});

describe("the eval's variants noThreadAudit and noNewMilestones", () => {
  it("are single-player: every runaway was one player's turn", () => {
    for (const story of [laterSwitchBeat(2), endingBeat(3)]) {
      expect(() => noThreadAuditRequest(story)).toThrow(/single-player/);
      expect(() => noNewMilestonesRequest(story)).toThrow(/single-player/);
    }
  });

  it("go out with production's single-player turn limits and retry count", () => {
    for (const [, build] of [...CLOSING, ...OTHER]) {
      const story = build();
      for (const [variant, build2] of [
        ["noThreadAudit", noThreadAuditRequest],
        ["noNewMilestones", noNewMilestonesRequest],
      ] as const) {
        const request = requestFor(variant, { role: "beat", story });
        expect(requestText(request)).toBe(build2(story).prompt);
        expect(callLimitsOf(request)).toEqual(productionCallLimits("beat", 1));
        expect(callLimitsOf(request)).toEqual({ timeoutMs: 90_000, maxCompletionTokens: 12_000 });
        expect("shortTextCount" in request ? request.shortTextCount : undefined).toBe(beatCheckOptions(story).textCount);
      }
    }
  });

  it("cover turns only", () => {
    expect(() => requestFor("noThreadAudit", { role: "switch", story: laterSwitchBeat(1) })).toThrow(/does not cover role switch/);
    expect(() => requestFor("noNewMilestones", { role: "thread", story: laterSwitchBeat(1) })).toThrow(/does not cover role thread/);
  });

  (frozen.length ? it : it.skip)("the stage's case: story 8988006e's switch turn after its first chapter, production's request the one that ran away on 30 September with the short-replies lines, each variant one edit away", () => {
    expect(RUNAWAY_2_CASES).toEqual(["cont-8988006e-t4-o1"]);
    const story = caseStory(frozen.find((c) => c.id === RUNAWAY_2_CASES[0])!);
    expect(story.getCurrentBeatType()).toBe("switch");
    expect(closesChapter(story)).toBe(true);
    const production = beatStep.request(story);
    expect(sha256(beforeShortReplies(production.prompt))).toBe("25faaf999fd9ea330a3175bb9cfcb7452afefd56328d3f01d224c21041c68b43");
    expect(noThreadAuditRequest(story).prompt).toBe(production.prompt.replace(CLOSING_TURN_TEXT.threadAudit, CLOSING_TURN_TEXT.chapterStatLine));
    expect(noNewMilestonesRequest(story).prompt).toBe(production.prompt.replace(CLOSING_TURN_TEXT.newMilestones, ""));
  });
});
