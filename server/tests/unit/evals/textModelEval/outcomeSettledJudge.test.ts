import { describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import type { SetOfBeatGenerationSchema } from "core/types/index.js";
import type { Story } from "core/models/Story.js";
import { GameModes } from "core/types/index.js";
import {
  SETTLED_CALIBRATION,
  SETTLED_CHECK,
  SETTLED_DECISION_RULE,
  scoreSettledCalibration,
  settledEvidenceFrom,
  settledJudgeCaseId,
  settledJudgeJobs,
  settledJudgeRequest,
  settledVerdictFrom,
} from "../../../../src/evals/textModelEval/outcomeSettledJudge.js";
import { JUDGE_ARMS } from "../../../../src/evals/textModelEval/judgedChecks.js";
import { withEdits } from "../../../../src/evals/textModelEval/outcomeSettledPrep.js";
import { playthroughRunsFrom } from "../../../../src/evals/textModelEval/playthroughMode.js";
import { replayedTurn } from "../../../../src/evals/textModelEval/playthroughReplay.js";
import type { PlayRun } from "../../../../src/evals/textModelEval/playthroughs.js";
import { outcomesCompletedThisBeat } from "../../../../src/game/services/storyTextRounds/outcomeSettled.js";
import { endedChapter, outcome, roundStory, topicSwitch } from "../../../helpers/roundStories.js";
import { beatGeneration, stat } from "../../../helpers/textFixtures.js";

/*
 * The outcome-settled stage's judged check (2026-09-30): one cheap GPT-6 call
 * per switch turn that completes an outcome asks completedToldSettled: every
 * player's text and every fact the turn records tell each outcome it
 * completes as settled, as its milestones leave it, and no stat change
 * contradicts a milestone the turn adds. The judge reads the completed
 * outcomes (question, resolutions, milestones with the turn's own), the other
 * milestones the turn adds, its stat changes with each stat's levels and value
 * before, its facts and every player's text; never the prompt.
 */

jest.spyOn(console, "log").mockImplementation(() => undefined);

const GUILD = "player1_guild_reform";

/** A single player's switch after a chapter completing the guild outcome (1 of 2 before), with a bond stat. */
function completingSwitch(): Story {
  const story = roundStory({
    turns: 5,
    maxTurns: 20,
    playerOutcomes: { player1: [outcome(GUILD, { milestones: ["The Guild listens"], question: "Will the Guild reform its charter?" }), outcome("player1_enclave")] },
    phases: [topicSwitch([["Petition", GUILD]], 0), endedChapter(GUILD, 4, 1, "The Guild adopts the charter"), topicSwitch([["Petition", GUILD]], 5)],
  });
  const bond = stat("player_bram_bond", { name: "Bond with Sir Bram", type: "string", possibleValues: "Estranged, Wary, Warm, Deeply Trusted", narrativeImplications: ["At Deeply Trusted: Bram shares his letters."] });
  const state = story.getState();
  return story.clone({
    playerStats: [bond],
    players: { ...state.players, player1: { ...state.players.player1, statValues: [{ statId: bond.id, value: "Warm" }] } },
  });
}

function reply(overrides: { text?: string; facts?: string[] } = {}): SetOfBeatGenerationSchema {
  const beat = beatGeneration({ text: overrides.text ?? "[image id=hall source=story desc=\"Hall\"] The Guild votes.\n\nThe charter stands." });
  beat.plan.establishedFacts = (overrides.facts ?? ["The charter vote is recorded in the Guild ledger."]).map((fact) => ({ type: "newFact", storyElementId: "world", fact }));
  return {
    statChanges: [{ type: "statChange", group: "player1", stat: "player_bram_bond", change: "setString", value: "Deeply Trusted" }],
    newMilestones: [{ type: "newMilestone", outcomeGroup: "player1", outcome: GUILD, newMilestone: "The Guild adopts the reformed charter." }],
    player1: beat,
  } as unknown as SetOfBeatGenerationSchema;
}

describe("the judge's request", () => {
  it("reads the completed outcome with its milestones, the stat changes with their levels, the facts and the text; never the prompt", () => {
    const story = completingSwitch();
    expect(outcomesCompletedThisBeat(story).map((s) => s.id)).toEqual([GUILD]);
    const request = settledJudgeRequest(story, reply());
    expect(request).toBeDefined();
    const prompt = request?.prompt ?? "";
    expect(prompt).toContain("Will the Guild reform its charter?");
    expect(prompt).toContain("1. The Guild listens");
    expect(prompt).toContain("2. The Guild adopts the reformed charter. (added by this turn)");
    expect(prompt).toContain("complete after this turn (2 of 2 milestones)");
    expect(prompt).toContain("Bond with Sir Bram");
    expect(prompt).toContain("Estranged, Wary, Warm, Deeply Trusted");
    expect(prompt).toContain("At Deeply Trusted: Bram shares his letters.");
    expect(prompt).toContain("before: Warm");
    expect(prompt).toContain("Deeply Trusted");
    expect(prompt).toContain("The charter vote is recorded in the Guild ledger.");
    expect(prompt).toContain("[1] The Guild votes.");
    expect(prompt).not.toContain("[image");
    expect(prompt).toContain(SETTLED_CHECK);
    expect(prompt).not.toContain("NEW MILESTONES");
  });

  it("does not apply where the turn completes no outcome", () => {
    expect(settledJudgeRequest(roundStory({ turns: 5, maxTurns: 20, playerOutcomes: { player1: [outcome(GUILD, { intendedNumberOfMilestones: 3 })] }, phases: [topicSwitch([["Petition", GUILD]], 0), endedChapter(GUILD, 4, 1, "x"), topicSwitch([["Petition", GUILD]], 5)] }), reply())).toBeUndefined();
  });

  it("names every player's text in a group, and the side a scoreboard's first half is", () => {
    const slots = ["player1", "player2"];
    const story = roundStory({
      players: 2,
      turns: 5,
      maxTurns: 20,
      gameMode: GameModes.Competitive,
      sharedOutcomes: [outcome("shared_vote", { milestones: ["The hall listens"], possibleResolutions: { sideAWins: "A", mixed: "M", sideBWins: "B" }, resonance: "x. Scored by Vote: A|B." })],
      playerOutcomes: { player1: [outcome("player1_pride")], player2: [outcome("player2_pride")] },
      phases: [topicSwitch([["Vote", "shared_vote"]], 0, slots), endedChapter("shared_vote", 4, 1, "Side A wins the vote", slots), topicSwitch([["Vote", "shared_vote"]], 5, slots)],
    });
    const board = stat("shared_vote_score", { name: "Vote: A|B", type: "opposites" });
    const withBoard = story.clone({ sharedStats: [board], sharedStatValues: [{ statId: board.id, value: 50 }] });
    const group = {
      statChanges: [{ type: "statChange", group: "shared", stat: board.id, change: "addNumber", value: 15 }],
      newMilestones: [],
      player1: beatGeneration({ text: "One wins." }),
      player2: beatGeneration({ text: "Two loses." }),
    } as unknown as SetOfBeatGenerationSchema;
    const prompt = settledJudgeRequest(withBoard, group)?.prompt ?? "";
    expect(prompt).toContain("shared_vote (shared)");
    expect(prompt).toContain("One wins.");
    expect(prompt).toContain("Two loses.");
    expect(prompt).toContain("Its first side (side A) is player1's");
  });
});

describe("the judge's answers and calls", () => {
  it("reads yes and no, and the judge's readings", () => {
    const parsed = {
      outcomes: [{ outcomeId: GUILD, told: "open or provisional", quote: "the vote is not final" }],
      facts: [{ fact: "the vote is provisional", callsOpen: true }],
      stats: [{ stat: "Bond with Sir Bram", fits: "contradicts a milestone", why: "closest level beside a parting" }],
      [SETTLED_CHECK]: { evidence: "told open", answer: "no" },
    };
    expect(settledVerdictFrom(parsed)).toBe(false);
    expect(settledVerdictFrom({ [SETTLED_CHECK]: { answer: "yes" } })).toBe(true);
    expect(settledVerdictFrom({})).toBeUndefined();
    const said = settledEvidenceFrom(parsed);
    expect(said.evidence).toBe("told open");
    expect(said.lines.join(" | ")).toContain("open or provisional");
    expect(said.lines.join(" | ")).toContain("contradicts a milestone");
  });

  it("keys each call by the prompt version and books it to the stage", () => {
    const request = settledJudgeRequest(completingSwitch(), reply());
    if (!request) throw new Error("no request");
    const jobs = settledJudgeJobs([{ key: "abc", request, samples: 2 }], JUDGE_ARMS[0], "adopted8", "outcome-settled");
    expect(jobs.map((j) => [j.caseId, j.sample, j.stage, j.promptState])).toEqual([
      [settledJudgeCaseId("abc"), 1, "outcome-settled", "adopted8"],
      [settledJudgeCaseId("abc"), 2, "outcome-settled", "adopted8"],
    ]);
    expect(settledJudgeCaseId("abc")).toBe("judge-settled-v2-abc");
    expect(settledJudgeCaseId("abc", 1)).toBe("judge-settled-v1-abc");
  });

  it("carries the calibration's one fix (v2): what counts as open, and when a stat without levels contradicts a milestone", () => {
    const prompt = settledJudgeRequest(completingSwitch(), reply())?.prompt ?? "";
    expect(prompt).toContain(SETTLED_DECISION_RULE);
    expect(SETTLED_DECISION_RULE).toContain("a rival's proposal or a compromise that one of its resolutions names");
    expect(SETTLED_DECISION_RULE).toContain("whether they tell the decision being made, announced or recorded");
    expect(SETTLED_DECISION_RULE).toContain("falling steeply beside a milestone that keeps or earns them");
  });
});

describe("the calibration", () => {
  it("is reliable only with three hand yes and three hand no, 85% agreement on each and 90% between samples", () => {
    const items = [true, true, true, false, false, false, "partial" as const].map((hand, i) => ({ id: `i${i}`, output: `o${i}`, hand, note: "" }));
    const agreeing = items.map((item) => ({ itemId: item.id, samples: [item.hand === "partial" ? true : item.hand, item.hand === "partial" ? true : item.hand] as (boolean | undefined)[] }));
    const all = scoreSettledCalibration(items, agreeing);
    expect([all.decided, all.agree, all.handPasses, all.handFails, all.pairs, all.pairsAgree, all.partial.yes, all.reliable]).toEqual([6, 6, 3, 3, 7, 7, 1, true]);
    const oneWrong = agreeing.map((j) => (j.itemId === "i3" ? { ...j, samples: [true, true] } : j));
    expect(scoreSettledCalibration(items, oneWrong).reliable).toBe(false);
  });

  it("holds hand-read items, each id once, yes and no on both sides", () => {
    const ids = SETTLED_CALIBRATION.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(SETTLED_CALIBRATION.filter((i) => i.hand === true).length).toBeGreaterThanOrEqual(3);
    expect(SETTLED_CALIBRATION.filter((i) => i.hand === false).length).toBeGreaterThanOrEqual(3);
  });
});

const DIR = path.resolve("..", "DOCS", "2026-09-26_gpt6-text-eval");
const stored2: PlayRun[] = fs.existsSync(path.join(DIR, "playthroughs-2.json")) ? playthroughRunsFrom(JSON.parse(fs.readFileSync(path.join(DIR, "playthroughs-2.json"), "utf-8"))) : [];

describe("the calibration's stored turns (skipped where the output folder is absent)", () => {
  (stored2.length ? it : it.skip)("each replays to a switch turn that completes an outcome, and the judge can read it, a constructed version's edits applied", () => {
    for (const item of SETTLED_CALIBRATION) {
      if (!("story" in item)) continue;
      const { before, played } = replayedTurn(stored2, item.story, item.turn);
      expect([item.id, outcomesCompletedThisBeat(before).length > 0]).toEqual([item.id, true]);
      const reply = withEdits(played.reply as SetOfBeatGenerationSchema, item.edits ?? []);
      const prompt = settledJudgeRequest(before, reply)?.prompt ?? "";
      expect([item.id, prompt.length > 0]).toEqual([item.id, true]);
      for (const [, to] of item.edits ?? []) if (!to.startsWith('"')) expect([item.id, prompt.includes(to)]).toEqual([item.id, true]);
    }
    const cut = SETTLED_CALIBRATION.find((i) => i.id === "constructed-estate-agents-t19-stat");
    if (!cut || !("story" in cut)) throw new Error("no constructed stat item");
    const { before, played } = replayedTurn(stored2, cut.story, cut.turn);
    expect(settledJudgeRequest(before, withEdits(played.reply as SetOfBeatGenerationSchema, cut.edits ?? []))?.prompt).toContain("subtractNumber 30");
  });
});
