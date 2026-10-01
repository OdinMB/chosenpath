import { describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { Story } from "core/models/Story.js";
import type { SetOfBeatGenerationSchema } from "core/types/index.js";
import {
  CLUES_CALIBRATION,
  CLUES_JUDGE_PROMPT_VERSION,
  CLUES_V2_TEXT,
  EXPLAINED_CHECK,
  NEW_MYSTERY_CHECK,
  cluesEvidenceFrom,
  cluesJudgeCaseId,
  cluesJudgeJobs,
  cluesJudgeRequests,
  cluesVerdictFrom,
  scoreCluesCalibration,
} from "../../../../src/evals/textModelEval/cluesJudge.js";
import { sha256 } from "../../../../src/evals/textModelEval/executor.js";
import { JUDGE_ARMS } from "../../../../src/evals/textModelEval/judgedChecks.js";
import { LATE_PACING_CLUES_VERSION, cluesCalibrationTargets } from "../../../../src/evals/textModelEval/latePacingPrep.js";
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
    const [target] = cluesJudgeRequests(planted(threadBeat), reply("You count.", "A bell."), 1);
    const jobs = cluesJudgeJobs([{ key: "abc", check: NEW_MYSTERY_CHECK, request: target.request, samples: 2 }], JUDGE_ARMS[0], "adopted15", "late-pacing", 1);
    expect(jobs.map((j) => [j.caseId, j.sample, j.stage, j.promptState])).toEqual([
      [cluesJudgeCaseId("abc", NEW_MYSTERY_CHECK, 1), 1, "late-pacing", "adopted15"],
      [cluesJudgeCaseId("abc", NEW_MYSTERY_CHECK, 1), 2, "late-pacing", "adopted15"],
    ]);
    expect(cluesJudgeCaseId("abc", NEW_MYSTERY_CHECK, 1)).toBe("judge-clues-new-v1-abc");
    expect(cluesJudgeCaseId("abc", EXPLAINED_CHECK, 1)).toBe("judge-clues-explained-v1-abc");
  });
});

/*
 * Prompt v2 (2026-10-01, the pacing-clues stage): the calibration's one fix,
 * written before the late-pacing stage closed and not run there. v1 read a new
 * side of a detail the story held as a new mystery (a hum beneath the familiar
 * chime, the paper lifting with a knock, the taps "maybe a signal"), the food
 * trucks' route map as new though a story element's own description says its
 * district lines shift, and the mouse ending's "sending a signal" as an
 * explanation. v2 says a new side of a detail is no new mystery, reads each
 * story element's own description beside the facts, and says naming what kind
 * of thing a detail is explains nothing. v1's requests stay as they ran.
 */
describe("prompt v2: the calibration's one fix", () => {
  const MAP = { id: "route_map", name: "Route Map", role: "A map.", instructions: "", appearance: "A brass map whose district lines shift slowly.", facts: ["It hangs in the hall."] };
  const withMap = (build: typeof threadBeat, maxTurns = 5) => {
    const story = planted(build, 1, maxTurns);
    return Story.create({ ...story.getState(), storyElements: [...(story.getState().storyElements ?? []), MAP] });
  };

  it("v1 stays as it ran: no element descriptions, no v2 lines", () => {
    const [request] = cluesJudgeRequests(withMap(threadBeat), reply("You count.", "The map's lines shift."), 1);
    expect(request.request.prompt).toContain("- (Route Map) It hangs in the hall.");
    expect(request.request.prompt).not.toContain("A brass map whose district lines shift slowly.");
    expect(request.request.prompt).not.toContain(CLUES_V2_TEXT.newSide);
    expect(cluesJudgeCaseId("abc", NEW_MYSTERY_CHECK, 1)).toBe("judge-clues-new-v1-abc");
  });

  it("v2 reads each story element's own description beside its facts, and says a new side of a held detail is no new mystery", () => {
    expect(CLUES_JUDGE_PROMPT_VERSION).toBe(2);
    const [request] = cluesJudgeRequests(withMap(threadBeat), reply("You count.", "The map's lines shift."));
    const prompt = request.request.prompt;
    expect(prompt).toContain("- (Route Map, as described) A brass map whose district lines shift slowly.");
    expect(prompt).toContain("- (Route Map) It hangs in the hall.");
    expect(prompt).toContain(CLUES_V2_TEXT.newSide);
    expect(prompt).not.toContain(CLUES_V2_TEXT.kindOnly);
  });

  it("v2's ending says naming what kind of thing a detail is explains nothing", () => {
    const [request] = cluesJudgeRequests(withMap(endingBeat, 6), reply("The tapping was a signal.", "The pennants come down."));
    expect(request.request.prompt).toContain(CLUES_V2_TEXT.kindOnly);
    expect(request.request.prompt).toContain(CLUES_V2_TEXT.newSide);
  });

  it("keys v2's calls apart from v1's, and its jobs carry the version", () => {
    expect(cluesJudgeCaseId("abc", NEW_MYSTERY_CHECK)).toBe("judge-clues-new-v2-abc");
    expect(cluesJudgeCaseId("abc", EXPLAINED_CHECK)).toBe("judge-clues-explained-v2-abc");
    const [target] = cluesJudgeRequests(planted(threadBeat), reply("You count.", "A bell."));
    const v1 = cluesJudgeJobs([{ key: "abc", check: NEW_MYSTERY_CHECK, request: target.request, samples: 1 }], JUDGE_ARMS[0], "adopted15", "late-pacing", 1);
    const v2 = cluesJudgeJobs([{ key: "abc", check: NEW_MYSTERY_CHECK, request: target.request, samples: 1 }], JUDGE_ARMS[0], "adopted21", "pacing-clues");
    expect(v1.map((j) => j.caseId)).toEqual(["judge-clues-new-v1-abc"]);
    expect(v2.map((j) => [j.caseId, j.stage, j.promptState])).toEqual([["judge-clues-new-v2-abc", "pacing-clues", "adopted21"]]);
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

  const sentHashes = (() => {
    const file = path.join(DIR, "prep-calls.jsonl");
    if (!fs.existsSync(file)) return new Map<string, string>();
    const records = fs
      .readFileSync(file, "utf-8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as { caseId?: string; sample?: number; promptHash?: string });
    return new Map(records.flatMap((r) => (r.caseId?.startsWith("judge-clues-") && r.sample === 1 && r.promptHash ? [[r.caseId, r.promptHash] as [string, string]] : [])));
  })();

  (stored2.length && sentHashes.size ? it : it.skip)("v1's requests rebuild byte for byte as the late-pacing stage sent them; v2's differ", () => {
    const { targets, problems } = cluesCalibrationTargets(stored2, CLUES_CALIBRATION, LATE_PACING_CLUES_VERSION);
    expect(problems).toEqual([]);
    expect(LATE_PACING_CLUES_VERSION).toBe(1);
    for (const target of targets) {
      const sent = sentHashes.get(cluesJudgeCaseId(target.key, target.check, 1));
      expect([target.itemId, sha256(target.request.prompt)]).toEqual([target.itemId, sent]);
    }
    const v2 = cluesCalibrationTargets(stored2, CLUES_CALIBRATION, 2).targets;
    expect(v2.every((t, i) => t.request.prompt !== targets[i].request.prompt)).toBe(true);
  });
});
