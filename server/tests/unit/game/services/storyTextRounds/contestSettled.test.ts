import { describe, expect, it, jest } from "@jest/globals";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { GameModes } from "core/types/index.js";
import {
  CONTEST_SETTLED_TEXT,
  contestSettledBase,
  contestSettledLine,
  contestSettledRequest,
  contestsDecidedHere,
  withContestSettledLines,
  withoutContestSettledLines,
} from "../../../../../src/game/services/storyTextRounds/contestSettled.js";
import { CONTEST_DECIDED, threadPacingBlock } from "../../../../../src/game/services/pacing.js";
import { threadStep } from "../../../../../src/game/services/storyTextSteps.js";
import { callLimitsOf, requestFor } from "../../../../../src/evals/textModelEval/variants.js";
import { productionCallLimits } from "../../../../../src/shared/llm/chatModel.js";
import { contestPlanning as chapterPlanning } from "../../../../helpers/contestStories.js";

/*
 * A contest's deciding chapter decides it (eval only; decision A's seal fix,
 * the evening of 2026-10-01). Round 3's space pirates completed the command
 * seal by count, but the chapter that settled its last stage asked "which camp
 * will earn the crew's confidence to frame the next custody discussion", its
 * stages renamed "without assigning custody", so its three milestones each put
 * the decision off and two endings told the seal as unassigned. The variant is
 * production's chapter planner with, in PACING, where a pick sets a contested
 * outcome whose thread settles its last stage, a line that this thread decides
 * the contest and its milestones are the outcome's three resolutions;
 * production's request byte for byte everywhere else.
 */

jest.spyOn(console, "log").mockImplementation(() => undefined);

const json = (schema: Parameters<typeof toJsonSchema>[0]) => JSON.stringify(toJsonSchema(schema));
const occurrences = (text: string, passage: string) => text.split(passage).length - 1;

describe("contestsDecidedHere: a contested outcome a pick sets, whose thread settles its last stage", () => {
  it("finds it where one milestone is still needed, in a game that plays contests, whoever picked it", () => {
    expect(contestsDecidedHere(chapterPlanning([0, 0]))).toEqual(["shared_sale"]); // 2 of 3 recorded
    expect(contestsDecidedHere(chapterPlanning([0, 1]))).toEqual(["shared_sale"]); // one side alone
    expect(contestsDecidedHere(chapterPlanning([1, 0]))).toEqual(["shared_sale"]);
    expect(contestsDecidedHere(chapterPlanning([0, 0], { flavor: true }))).toEqual(["shared_sale"]);
    expect(contestsDecidedHere(chapterPlanning([0, 0, 0], { players: 3, mode: GameModes.CooperativeCompetitive }))).toEqual(["shared_sale"]);
  });

  it("finds none before the last stage, once complete, where no pick sets it, or in a game without contests", () => {
    expect(contestsDecidedHere(chapterPlanning([0, 0], { saleMilestones: 1 }))).toEqual([]); // two still needed
    expect(contestsDecidedHere(chapterPlanning([0, 0], { saleMilestones: 3 }))).toEqual([]); // an aftermath
    expect(contestsDecidedHere(chapterPlanning([1, 1]))).toEqual([]);
    expect(contestsDecidedHere(chapterPlanning([0, 0], { mode: GameModes.Cooperative }))).toEqual([]);
  });
});

describe("the line", () => {
  it("names the contest and its question, says this thread decides it, and lists its three resolutions in the milestones' order", () => {
    const line = contestSettledLine(chapterPlanning([0, 0]), "shared_sale");
    expect(line).toContain('shared_sale ("Who sells the house?")');
    expect(line).toContain(CONTEST_SETTLED_TEXT.decides);
    const [a, m, b] = ['Side A wins: "Rory sells it and earns the commission."', 'Mixed: "The owner splits the sale between them."', 'Side B wins: "Nia sells it and earns the commission."'].map((s) => line.indexOf(s));
    expect(a).toBeGreaterThan(0);
    expect(m).toBeGreaterThan(a);
    expect(b).toBeGreaterThan(m);
    expect(line).toContain(CONTEST_SETTLED_TEXT.noDeferral);
    expect(CONTEST_SETTLED_TEXT.noDeferral).toContain("puts the decision off to a later discussion, vote, review or agreement");
    expect(CONTEST_SETTLED_TEXT.noDeferral).toContain("settles only who may shape it");
    expect(line).toContain(CONTEST_SETTLED_TEXT.writtenBefore);
    expect(CONTEST_SETTLED_TEXT.writtenBefore).toContain("the switch's question, an earlier milestone or a fact");
  });

  it("adds the one-sided clause only where some players chose something else", () => {
    expect(contestSettledLine(chapterPlanning([0, 1]), "shared_sale")).toContain(CONTEST_SETTLED_TEXT.oneSided);
    expect(contestSettledLine(chapterPlanning([1, 0]), "shared_sale")).toContain(CONTEST_SETTLED_TEXT.oneSided);
    expect(contestSettledLine(chapterPlanning([0, 0]), "shared_sale")).not.toContain(CONTEST_SETTLED_TEXT.oneSided);
    expect(contestSettledLine(chapterPlanning([0, 0], { flavor: true }), "shared_sale")).not.toContain(CONTEST_SETTLED_TEXT.oneSided);
    expect(CONTEST_SETTLED_TEXT.oneSided).toContain("its favorable milestone is that side's resolution, its unfavorable the other side's");
  });
});

describe("the variant's chapter planner", () => {
  it("is production's request as it stood before the adoption with the line once in PACING, right before its recent threads, where a contest is decided here", () => {
    for (const picks of [[0, 0], [0, 1]]) {
      const story = chapterPlanning(picks);
      const [variant, base] = [contestSettledRequest(story), contestSettledBase(story)];
      const line = contestSettledLine(story, "shared_sale");
      expect(occurrences(variant.prompt, line)).toBe(1);
      expect(occurrences(base.prompt, line)).toBe(0);
      expect(variant.prompt).toContain(`${line}${CONTEST_SETTLED_TEXT.anchor}`);
      expect(variant.prompt.indexOf(line)).toBeGreaterThan(variant.prompt.lastIndexOf("======= PACING ======="));
      expect(variant.prompt).toBe(withContestSettledLines(base.prompt, story));
      expect(withoutContestSettledLines(variant.prompt, story)).toBe(base.prompt);
      expect(json(variant.schema)).toBe(json(base.schema));
    }
  });

  it("adopted as measured (the contest-settled stage, 2026-10-01): production's chapter planner is the variant byte for byte, prompt and schema, its PACING block printing the line", () => {
    for (const story of [chapterPlanning([0, 0]), chapterPlanning([0, 1]), chapterPlanning([1, 1]), chapterPlanning([0, 0], { flavor: true })]) {
      const [variant, production] = [contestSettledRequest(story), threadStep.request(story)];
      expect(production.prompt).toBe(variant.prompt);
      expect(json(production.schema)).toBe(json(variant.schema));
      expect(threadPacingBlock(story).includes(CONTEST_SETTLED_TEXT.decides)).toBe(contestsDecidedHere(story).length > 0);
    }
    // The production text is the variant's: one copy, pinned here
    expect(CONTEST_DECIDED).toBe(CONTEST_SETTLED_TEXT);
  });

  it("is production's request as it stood before byte for byte where no contest is decided", () => {
    for (const story of [chapterPlanning([1, 1]), chapterPlanning([0, 0], { saleMilestones: 1 }), chapterPlanning([0, 0], { mode: GameModes.Cooperative })]) {
      const [variant, base] = [contestSettledRequest(story), contestSettledBase(story)];
      expect(variant.prompt).toBe(base.prompt);
      expect(json(variant.schema)).toBe(json(base.schema));
    }
  });

  it("assembles the reply as production does", () => {
    const story = chapterPlanning([0, 0]);
    const reply = { grouping: "together", duration: 3, threads: [] };
    expect(contestSettledRequest(story).assemble(reply)).toEqual(threadStep.request(story).assemble(reply));
  });

  it("is the eval's contestSettled variant on the chapter planner, with production's limits", () => {
    const story = chapterPlanning([0, 0]);
    const request = requestFor("contestSettled", { role: "thread", story });
    expect("prompt" in request ? request.prompt : "").toBe(contestSettledRequest(story).prompt);
    expect(callLimitsOf(request)).toEqual(productionCallLimits("threadAnalysis", 2));
    expect(() => requestFor("contestSettled", { role: "beat", story })).toThrow("does not cover role beat");
  });
});
