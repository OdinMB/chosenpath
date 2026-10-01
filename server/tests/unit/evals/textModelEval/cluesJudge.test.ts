import { describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { Story } from "core/models/Story.js";
import type { SetOfBeatGenerationSchema } from "core/types/index.js";
import {
  CLUES_CALIBRATION,
  EXPLAINED_CHECK,
  NEW_MYSTERY_CHECK,
  cluesEvidenceFrom,
  cluesJudgeCaseId,
  cluesJudgeJobs,
  cluesJudgeRequests,
  cluesVerdictFrom,
  scoreCluesCalibration,
} from "../../../../src/evals/textModelEval/cluesJudge.js";
import { JUDGE_ARMS } from "../../../../src/evals/textModelEval/judgedChecks.js";
import { withEdits } from "../../../../src/evals/textModelEval/outcomeSettledPrep.js";
import { playthroughRunsFrom } from "../../../../src/evals/textModelEval/playthroughMode.js";
import { replayedTurn } from "../../../../src/evals/textModelEval/playthroughReplay.js";
import type { PlayRun } from "../../../../src/evals/textModelEval/playthroughs.js";
import { endingBeat, firstSwitchBeat, threadBeat } from "../../../helpers/promptStories.js";
import { beatGeneration } from "../../../helpers/textFixtures.js";

/*
 * The late-pacing stage's judged checks on planted details (2026-10-01, fix 8
 * of the second playthroughs' review). In the story's late part (past two
 * thirds of its turns), noNewMystery: does the turn plant no new unexplained
 * detail (a mark, a sound, an odd object, a behavior no one explains) that the
 * story didn't have? At the ending, detailsExplained: does it explain at least
 * one of the unexplained details the story planted, where it has any? The
 * judge reads the facts the story recorded before the turn, the player's
 * earlier interludes, and the turn's text, interludes and recorded facts;
 * never the prompt.
 */

jest.spyOn(console, "log").mockImplementation(() => undefined);

/** A story with a planted detail: a fact and an earlier interlude about a blue pencil mark. */
function planted(build: (players: number, overrides: Parameters<typeof threadBeat>[1]) => Story, players = 1, maxTurns = 5): Story {
  const base = build(players, { title: "The Harbour", maxTurns, worldFacts: ["A blue pencil mark sits under the date on the fair notice; no one knows who drew it."] });
  const state = structuredClone(base.getState());
  for (const player of Object.values(state.players)) {
    const first = player.beatHistory[0];
    if (first) player.beatHistory[0] = { ...first, interludes: [{ imageId: "", imageSource: "none", text: "A paper sailboat waits by the fountain." }] };
  }
  return Story.create(state);
}

function reply(text: string, interlude: string, fact = "The fountain has been dry since spring.", slots = ["player1"]): SetOfBeatGenerationSchema {
  const beats = Object.fromEntries(
    slots.map((slot) => {
      const beat = beatGeneration({ text, interludes: [{ imageId: "", imageSource: "none", text: interlude }] });
      beat.plan.establishedFacts = [{ type: "newFact", storyElementId: "world", fact }];
      return [slot, beat];
    })
  );
  return { statChanges: [], newMilestones: "", ...beats } as unknown as SetOfBeatGenerationSchema;
}

describe("which turns the judge reads", () => {
  it("a turn in the story's late part: noNewMystery, per player", () => {
    const requests = cluesJudgeRequests(planted(threadBeat, 2), reply("You count the coins.", "A bell rings once, though no one is near it.", undefined, ["player1", "player2"]));
    expect(requests.map((r) => [r.slot, r.check])).toEqual([
      ["player1", NEW_MYSTERY_CHECK],
      ["player2", NEW_MYSTERY_CHECK],
    ]);
  });

  it("the ending: detailsExplained, per player", () => {
    const requests = cluesJudgeRequests(planted(endingBeat, 1, 6), reply("The season ends.", "The fair's pennants come down."));
    expect(requests.map((r) => [r.slot, r.check])).toEqual([["player1", EXPLAINED_CHECK]]);
  });

  it("no turn before the late part, and not the first turn", () => {
    expect(cluesJudgeRequests(planted(threadBeat, 1, 25), reply("You count the coins.", "A bell rings."))).toEqual([]);
    expect(cluesJudgeRequests(firstSwitchBeat(1), reply("You arrive.", "A bell rings."))).toEqual([]);
  });
});

describe("the judge's requests", () => {
  it("noNewMystery reads the facts so far, the player's earlier interludes and the turn's text, interludes and facts; never the prompt", () => {
    const [request] = cluesJudgeRequests(planted(threadBeat), reply("You count the coins.\n\nThe pencil mark is still there.", "A bell rings once, though no one is near it."));
    const prompt = request.request.prompt;
    expect(prompt).toContain("The Harbour");
    expect(prompt).toContain("- (world) A blue pencil mark sits under the date on the fair notice; no one knows who drew it.");
    expect(prompt).toContain("- A paper sailboat waits by the fountain.");
    expect(prompt).toContain("[1] You count the coins.");
    expect(prompt).toContain("[2] The pencil mark is still there.");
    expect(prompt).toContain("- A bell rings once, though no one is near it.");
    expect(prompt).toContain("The fountain has been dry since spring.");
    expect(prompt).toContain(`${NEW_MYSTERY_CHECK}:`);
    expect(prompt).not.toContain("World Building Instructions");
  });

  it("detailsExplained reads the same, and asks whether the ending explains one of the story's unexplained details", () => {
    const [request] = cluesJudgeRequests(planted(endingBeat, 1, 6), reply("Mara admits the blue pencil mark was hers.", "The fair's pennants come down."));
    const prompt = request.request.prompt;
    expect(prompt).toContain("- (world) A blue pencil mark sits under the date");
    expect(prompt).toContain("[1] Mara admits the blue pencil mark was hers.");
    expect(prompt).toContain(`${EXPLAINED_CHECK}:`);
  });
});

describe("the judge's answers and calls", () => {
  it("reads yes and no per check, and the details it listed", () => {
    const late = { details: [{ quote: "a bell rings once", detail: "a bell no one rang", already: "new", explained: "no" }], [NEW_MYSTERY_CHECK]: { evidence: "the bell is new", answer: "no" } };
    expect(cluesVerdictFrom(late, NEW_MYSTERY_CHECK)).toBe(false);
    expect(cluesVerdictFrom({ [NEW_MYSTERY_CHECK]: { answer: "yes" } }, NEW_MYSTERY_CHECK)).toBe(true);
    expect(cluesVerdictFrom({}, NEW_MYSTERY_CHECK)).toBeUndefined();
    expect(cluesEvidenceFrom(late, NEW_MYSTERY_CHECK).lines).toEqual(['new: a bell no one rang ("a bell rings once"), explained no']);
    const ending = { details: [{ detail: "the blue pencil mark", source: "facts", explained: "yes", how: "Mara admits it was hers" }], [EXPLAINED_CHECK]: { evidence: "the mark is explained", answer: "yes" } };
    expect(cluesVerdictFrom(ending, EXPLAINED_CHECK)).toBe(true);
    expect(cluesEvidenceFrom(ending, EXPLAINED_CHECK).lines).toEqual(['the blue pencil mark (facts): explained yes ("Mara admits it was hers")']);
  });

  it("keys each call by its check and the prompt version, and books it to the stage", () => {
    const [target] = cluesJudgeRequests(planted(threadBeat), reply("You count.", "A bell."));
    const jobs = cluesJudgeJobs([{ key: "abc", check: NEW_MYSTERY_CHECK, request: target.request, samples: 2 }], JUDGE_ARMS[0], "adopted15", "late-pacing");
    expect(jobs.map((j) => [j.caseId, j.sample, j.stage, j.promptState])).toEqual([
      [cluesJudgeCaseId("abc", NEW_MYSTERY_CHECK), 1, "late-pacing", "adopted15"],
      [cluesJudgeCaseId("abc", NEW_MYSTERY_CHECK), 2, "late-pacing", "adopted15"],
    ]);
    expect(cluesJudgeCaseId("abc", NEW_MYSTERY_CHECK)).toBe("judge-clues-new-v1-abc");
    expect(cluesJudgeCaseId("abc", EXPLAINED_CHECK)).toBe("judge-clues-explained-v1-abc");
  });
});

describe("the calibration", () => {
  it("scores each check apart: reliable only with three hand yes and three hand no, 85% on each and 90% between samples", () => {
    const items = [true, true, true, false, false, false].map((hand, i) => ({ id: `i${i}`, check: NEW_MYSTERY_CHECK, hand }));
    const judged = items.map((item) => ({ itemId: item.id, samples: [item.hand, item.hand] as (boolean | undefined)[] }));
    const [late, ending] = scoreCluesCalibration(items, judged);
    expect([late.check, late.decided, late.agree, late.reliable]).toEqual([NEW_MYSTERY_CHECK, 6, 6, true]);
    expect([ending.check, ending.decided, ending.reliable]).toEqual([EXPLAINED_CHECK, 0, false]);
  });

  it("holds hand-read items, each id once, three yes and three no or more per check, each naming its player", () => {
    const ids = CLUES_CALIBRATION.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const check of [NEW_MYSTERY_CHECK, EXPLAINED_CHECK]) {
      const mine = CLUES_CALIBRATION.filter((i) => i.check === check);
      expect(mine.filter((i) => i.hand === true).length).toBeGreaterThanOrEqual(3);
      expect(mine.filter((i) => i.hand === false).length).toBeGreaterThanOrEqual(3);
    }
    for (const item of CLUES_CALIBRATION) expect(item.slot).toMatch(/^player[1-3]$/);
  });
});

const DIR = path.resolve("..", "DOCS", "2026-09-26_gpt6-text-eval");
const stored2: PlayRun[] = fs.existsSync(path.join(DIR, "playthroughs-2.json")) ? playthroughRunsFrom(JSON.parse(fs.readFileSync(path.join(DIR, "playthroughs-2.json"), "utf-8"))) : [];

describe("the calibration's stored turns (skipped where the output folder is absent)", () => {
  (stored2.length ? it : it.skip)("each replays to a turn the judge reads with its check for its player, a constructed version's edits applied", () => {
    for (const item of CLUES_CALIBRATION) {
      const { before, played } = replayedTurn(stored2, item.story, item.turn);
      const edited = withEdits(played.reply as SetOfBeatGenerationSchema, item.edits ?? []);
      const target = cluesJudgeRequests(before, edited).find((r) => r.slot === item.slot);
      expect([item.id, target?.check]).toEqual([item.id, item.check]);
    }
  });
});
