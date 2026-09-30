import { describe, expect, it } from "@jest/globals";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import type { Story } from "core/models/Story.js";
import { GameModes } from "core/types/index.js";
import { makeArm } from "../../../../src/evals/textModelEval/arms.js";
import {
  ENDING_CHECK,
  ENDING_JUDGE_CALIBRATION,
  ENDING_JUDGE_PROMPT_VERSION,
  endingEvidenceFrom,
  endingJudgeCaseId,
  endingJudgeJobs,
  endingJudgeRequest,
  endingVerdictFrom,
  renderEndingJudge,
  replyVerdict,
  scoreEndingCalibration,
  scoreboardLine,
} from "../../../../src/evals/textModelEval/endingJudge.js";
import { stageReadings } from "../../../../src/evals/textModelEval/stageJudge.js";
import { endedChapter, outcome, roundStory, topicSwitch } from "../../../helpers/roundStories.js";
import { stat } from "../../../helpers/textFixtures.js";

const RING = "player1_expose_ring";
const IDENTITY = "player1_identity";

/** A single player's ending: the ring at 1 of 2 before this beat (the chapter that just ended adds the second), the identity untouched. */
function onePlayerEnding(): Story {
  return roundStory({
    turns: 7,
    maxTurns: 7,
    playerOutcomes: {
      player1: [
        outcome(RING, { question: "Does Arielle expose the ring?", intendedNumberOfMilestones: 2, milestones: ["Arielle finds the ledger"] }),
        outcome(IDENTITY, { question: "Does Arielle find where she belongs?", intendedNumberOfMilestones: 2, possibleResolutions: { resolution1: "Belongs", resolution2: "An outsider with a path", resolution3: "Isolated" } }),
      ],
    },
    phases: [topicSwitch([["Dig", RING]], 0), endedChapter(RING, 2, 1, "The ledger"), topicSwitch([["Dig", RING]], 3), endedChapter(RING, 3, 4, "The exposé")],
  });
}

const SCOREBOARD = stat("shared_voice_score", { name: "Enclave's Voice|Printers' Voice", type: "opposites", initialValue: 50 });

function contestEnding(players: number, score: number, intended = 3): Story {
  const slots = Array.from({ length: players }, (_, i) => `player${i + 1}`);
  return roundStory({
    players,
    turns: 4,
    maxTurns: 4,
    gameMode: players === 3 ? GameModes.CooperativeCompetitive : GameModes.Competitive,
    sharedOutcomes: [
      outcome("shared_voice", {
        question: "Who speaks for the goblins?",
        intendedNumberOfMilestones: intended,
        possibleResolutions: { sideAWins: "The enclave speaks", mixed: "They share the seat", sideBWins: "The printers speak" },
        resonance: "Who speaks for the goblins. Scored by Enclave's Voice|Printers' Voice.",
      }),
    ],
    playerOutcomes: Object.fromEntries(slots.map((slot) => [slot, [outcome(`${slot}_pride`)]])),
    phases: [topicSwitch([["Speak", "shared_voice"]], 0, slots), endedChapter("shared_voice", 3, 1, "The vote", slots)],
  }).clone({ sharedStats: [SCOREBOARD], sharedStatValues: [{ statId: SCOREBOARD.id, value: score }] });
}

const reply = (slots: string[], text = "[image id=x source=story desc=\"X\"] You send the files.\n\nThe ring stays hidden.") => ({
  statChanges: [],
  newMilestones: [{ type: "newMilestone", outcomeGroup: "player1", outcome: RING, newMilestone: "Arielle's exposé names the ring's leaders" }],
  ...Object.fromEntries(slots.map((slot) => [slot, { title: "The End", text, options: [], interludes: [] }])),
});

describe("endingJudgeRequest", () => {
  const request = endingJudgeRequest(onePlayerEnding(), reply(["player1"]), "player1");

  it("shows each outcome of the player as its milestones leave it after the ending: status, milestones so far, the one the ending adds", () => {
    expect(request).toBeDefined();
    const prompt = request!.prompt;
    expect(prompt).toContain(`Outcome ${RING} (the player's own): Does Arielle expose the ring?`);
    expect(prompt).toContain("  Milestones: 2 of 2 intended with the ending's, so this outcome is complete.");
    expect(prompt).toContain("    1. Arielle finds the ledger");
    expect(prompt).toContain("    2. Arielle's exposé names the ring's leaders (added by this ending)");
    expect(prompt).toContain(`Outcome ${IDENTITY} (the player's own): Does Arielle find where she belongs?`);
    expect(prompt).toContain("  Milestones: 0 of 2 intended, so this outcome is unfinished.");
    expect(prompt).toContain("    resolution2: An outsider with a path");
  });

  it("shows the ending as the player reads it, image tags out, and asks the one question", () => {
    const prompt = request!.prompt;
    expect(prompt).toContain("[1] You send the files.");
    expect(prompt).toContain("[2] The ring stays hidden.");
    expect(prompt).not.toContain("[image");
    expect(prompt).toContain(`${ENDING_CHECK}: Does the ending tell every outcome as its milestones leave it?`);
    // Another story's example, so nothing in the hand set leaks in
    expect(prompt).toContain("Mara");
    const schema = JSON.stringify(toJsonSchema(request!.schema as Parameters<typeof toJsonSchema>[0]));
    expect(schema).toContain(ENDING_CHECK);
    expect(schema).toContain("in its current state");
  });

  it("is undefined where the reply holds no ending for the player, or the turn is no ending", () => {
    expect(endingJudgeRequest(onePlayerEnding(), reply([]), "player1")).toBeUndefined();
    expect(endingJudgeRequest(onePlayerEnding().clone({ maxTurns: 20 }), reply(["player1"]), "player1")).toBeUndefined();
  });

  it("gives a scored contest its scoreboard, which side leads, and side A's player or camp", () => {
    expect(scoreboardLine(contestEnding(2, 35), "shared_voice")).toBe(
      "  Scoreboard: Enclave's Voice|Printers' Voice at 35|65, so side B is ahead (45 to 55 would be level). Side A is player1's side (Test Player 1)."
    );
    expect(scoreboardLine(contestEnding(2, 50), "shared_voice")).toContain("at 50|50, so neither side is ahead");
    expect(scoreboardLine(contestEnding(3, 60), "shared_voice")).toContain("so side A is ahead (45 to 55 would be level). Side A is player1's camp (Test Player 1's).");
    const prompt = endingJudgeRequest(contestEnding(2, 35), reply(["player1", "player2"]), "player2")!.prompt;
    expect(prompt).toContain("Outcome shared_voice (shared): Who speaks for the goblins?");
    expect(prompt).toContain("  Milestones: 1 of 3 intended with the ending's, so this outcome is unfinished.");
    expect(prompt).toContain("  Scoreboard: Enclave's Voice|Printers' Voice at 35|65");
    expect(prompt).toContain("Outcome player2_pride (the player's own)");
    expect(prompt).not.toContain("Outcome player1_pride");
    expect(scoreboardLine(onePlayerEnding(), RING)).toBeUndefined();
  });
});

describe("the verdicts", () => {
  it("reads yes, no or neither, and the quoted evidence with the outcomes as the judge read them", () => {
    const parsed = { outcomes: [{ outcomeId: RING, told: "resolved", quote: "the ring falls" }], [ENDING_CHECK]: { evidence: "The ring falls.", answer: "no" } };
    expect(endingVerdictFrom(parsed)).toBe(false);
    expect(endingVerdictFrom({ [ENDING_CHECK]: { answer: "yes" } })).toBe(true);
    expect(endingVerdictFrom({})).toBeUndefined();
    expect(endingEvidenceFrom(parsed)).toEqual({ evidence: "The ring falls.", outcomes: [`${RING}: resolved ("the ring falls")`] });
  });

  it("passes a reply when every player's ending passes, and waits while one is unanswered", () => {
    expect(replyVerdict([true, true])).toBe(true);
    expect(replyVerdict([true, false])).toBe(false);
    expect(replyVerdict([true, undefined])).toBeUndefined();
  });
});

describe("the judge calls", () => {
  it("keys each call by its version, output and player, at the samples asked", () => {
    const arm = makeArm({ model: "gpt-6-luna", reasoningEffort: "low" });
    const request = endingJudgeRequest(onePlayerEnding(), reply(["player1"]), "player1")!;
    const jobs = endingJudgeJobs([{ key: "abc-player1", request, samples: 2 }], arm, "adopted2", "ending-state");
    expect(jobs.map((j) => [j.caseId, j.sample, j.stage, j.armKey, j.group])).toEqual([
      [`judge-ending-v${ENDING_JUDGE_PROMPT_VERSION}-abc-player1`, 1, "ending-state", "judge>gpt-6-luna@low/prod", "prep"],
      [`judge-ending-v${ENDING_JUDGE_PROMPT_VERSION}-abc-player1`, 2, "ending-state", "judge>gpt-6-luna@low/prod", "prep"],
    ]);
    expect(endingJudgeCaseId("x")).toBe(`judge-ending-v${ENDING_JUDGE_PROMPT_VERSION}-x`);
  });
});

describe("the calibration", () => {
  it("holds hand-read endings, each once and well formed", () => {
    const ids = ENDING_JUDGE_CALIBRATION.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of ENDING_JUDGE_CALIBRATION) {
      expect(item.output).toMatch(/^[0-9a-f]{20}$/);
      expect(item.slot).toMatch(/^player[123]$/);
      expect(item.note.length).toBeGreaterThan(20);
    }
  });

  it("scores agreement on each side, the samples' agreement and the partial items, reliable only at the usual bar", () => {
    const items = [
      { id: "a", output: "0".repeat(20), slot: "player1" as const, hand: true as const, writer: "w", note: "n" },
      { id: "b", output: "1".repeat(20), slot: "player1" as const, hand: true as const, writer: "w", note: "n" },
      { id: "c", output: "2".repeat(20), slot: "player1" as const, hand: true as const, writer: "w", note: "n" },
      { id: "d", output: "3".repeat(20), slot: "player1" as const, hand: false as const, writer: "w", note: "n" },
      { id: "e", output: "4".repeat(20), slot: "player1" as const, hand: false as const, writer: "w", note: "n" },
      { id: "f", output: "5".repeat(20), slot: "player1" as const, hand: false as const, writer: "w", note: "n" },
      { id: "g", output: "6".repeat(20), slot: "player1" as const, hand: "partial" as const, writer: "w", note: "n" },
    ];
    const judged = [
      { itemId: "a", samples: [true, true] },
      { itemId: "b", samples: [true, true] },
      { itemId: "c", samples: [true, true] },
      { itemId: "d", samples: [false, false] },
      { itemId: "e", samples: [false, false] },
      { itemId: "f", samples: [false, false] },
      { itemId: "g", samples: [true, true] },
    ];
    expect(scoreEndingCalibration(items, judged)).toMatchObject({ decided: 6, agree: 6, handPasses: 3, handFails: 3, pairs: 7, pairsAgree: 7, partial: { yes: 1, no: 0 }, reliable: true });
    // Two samples that split on one item in seven fall under the 90% bar
    expect(scoreEndingCalibration(items, judged.map((j) => (j.itemId === "g" ? { ...j, samples: [true, false] } : j)))).toMatchObject({ pairsAgree: 6, reliable: false });
    expect(scoreEndingCalibration(items, judged.map((j) => (j.itemId === "d" ? { ...j, samples: [true, true] } : j)))).toMatchObject({ falsePasses: 1, reliable: false });
  });

  it("renders the calibration, the readings and the failing endings", () => {
    const readings = stageReadings(
      [
        { armKey: "ref", caseId: "c", sample: 1, outputId: "o1", passes: false, threads: 1 },
        { armKey: "ref", caseId: "c", sample: 2, outputId: "o2", passes: false, threads: 1 },
        { armKey: "cand", caseId: "c", sample: 1, outputId: "o3", passes: true, threads: 1 },
      ],
      (key) => (key === "cand" ? ["ref"] : [])
    );
    const markdown = renderEndingJudge({
      items: [],
      calibration: scoreEndingCalibration([], []),
      judged: [],
      readings,
      failures: [{ armKey: "ref", caseId: "c", sample: 1, outputId: "o1", slot: "player1", evidence: "It resolves the identity outcome." }],
      spentUsd: 0.01,
      generatedAt: new Date("2026-09-30T12:00:00Z"),
      problems: [],
    });
    expect(markdown).toContain("# Judged check: each outcome told as its milestones leave it");
    expect(markdown).toContain(`| ${ENDING_CHECK} |`);
    expect(markdown).toContain("| cand | 1 of 1 (100%) | ref |");
    expect(markdown).toContain("- ref c s1 player1 (o1): It resolves the identity outcome.");
  });
});
