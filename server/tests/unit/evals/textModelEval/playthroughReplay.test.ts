import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { PLAYTHROUGHS, playStory, type PlayCallSpec, type PlayRun } from "../../../../src/evals/textModelEval/playthroughs.js";
import { playthroughRunsFrom } from "../../../../src/evals/textModelEval/playthroughMode.js";
import { replayRun, replayedTurn } from "../../../../src/evals/textModelEval/playthroughReplay.js";
import { outputIdOf } from "../../../../src/evals/textModelEval/judgedChecks.js";
import { sha256 } from "../../../../src/evals/textModelEval/executor.js";
import { requestFor, requestText } from "../../../../src/evals/textModelEval/variants.js";
import { playthroughsSent } from "../../../../src/evals/textModelEval/choiceResultCases.js";
import { switchAnalysis, threadAnalysis } from "../../../helpers/textFixtures.js";
import { DEFAULT, fakeCall, input } from "./playFixtures.js";

/*
 * The playthroughs' stories replayed from their stored run: every turn's input
 * (before the planner, and with the plan applied) rebuilt from the story the
 * run started from, the plans and turns as the run stored them, and each
 * choice resolved again on the run's own seeded dice. The choice-result
 * stage's cases and its judge's calibration items are these states, so each
 * must be the one the played turn saw: its requests rebuild byte for byte.
 */

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const promptOf = (spec: PlayCallSpec | undefined) => (spec ? requestText(spec.request) : undefined);

/** The request each turn's first call and first planner call sent, by case id. */
function sentBy(calls: PlayCallSpec[]) {
  const byId = new Map(calls.map((c) => [c.caseId, c]));
  return (caseId: string | undefined) => (caseId ? byId.get(caseId) : undefined);
}

describe("replayRun: the states a stored playthrough's turns saw", () => {
  it("rebuilds every turn's planner and turn input of a single-player story, byte for byte, as the run sent them", async () => {
    const { call, calls } = fakeCall(1);
    const { run } = await playStory(PLAYTHROUGHS[0], input(1), call, { sample: 1 });
    expect(run.complete).toBe(true);
    const sent = sentBy(calls);
    const replayed = replayRun(run);
    expect(replayed.map((r) => r.turn)).toEqual(run.turns.map((t) => t.turn));
    for (const r of replayed) {
      expect(requestText(requestFor("adopted", { role: "beat", story: r.before }))).toBe(promptOf(sent(r.played.calls[0]?.caseId)));
      if (r.played.plan) {
        const role = r.played.plan.kind === "switch plan" ? "switch" : "thread";
        expect(requestText(requestFor("adopted", { role, story: r.beforePlan }))).toBe(promptOf(sent(r.played.plan.calls[0]?.caseId)));
      } else {
        expect(r.beforePlan).toBe(r.before);
      }
    }
  });

  it("rebuilds a group story's turns too, and a turn whose chapter the harness planned after the stuck players re-picked", async () => {
    // The group scenario of the playthroughs' own test: the second switch splits the players, and a chapter can be
    // planned only once player1 takes the shared direction player2 took
    const direction = (text: string, outcomeId: string) => ({ direction: text, outcomeId });
    const topic = (slot: string, directions: { direction: string; outcomeId: string }[]) => ({
      ...switchAnalysis([slot]).switches[0],
      id: `sw_${slot}`,
      players: [slot],
      type: "topic",
      topicChoices: directions.map((d) => `${d.direction} (${d.outcomeId})`),
      topicDirections: directions,
    });
    const splitSwitch = {
      ...switchAnalysis(["player1", "player2"]),
      switches: [
        topic("player1", [direction("Tavi", "shared_harbour"), direction("Own", "player1_main"), direction("Side", "player1_side")]),
        topic("player2", [direction("Own", "player2_main"), direction("Side", "player2_side"), direction("Tavi", "shared_harbour")]),
      ],
    };
    const both = threadAnalysis("challenge", 4, 0, ["player1", "player2"]);
    const unusable = { ...both, threads: [{ ...both.threads[0], outcomeId: "no_such_outcome" }] };
    const { call, calls } = fakeCall(2, {
      reply: (role, nth, s) => {
        if (role === "switch" && nth === 1) return splitSwitch;
        if (role === "thread" && nth >= 1 && requestText(s.request).includes("player1 chose direction 2 of 3")) return unusable;
        return DEFAULT;
      },
    });
    const { run } = await playStory(PLAYTHROUGHS[2], input(2), call, { sample: 1, retryFailedTurns: 1, repickStuckSwitches: true });
    expect(run.turns.some((t) => t.repicks?.length)).toBe(true);
    const sent = sentBy(calls);
    for (const r of replayRun(run)) {
      expect(requestText(requestFor("adopted", { role: "beat", story: r.before }))).toBe(promptOf(sent(r.played.calls[0]?.caseId)));
      if (r.played.plan) {
        const role = r.played.plan.kind === "switch plan" ? "switch" : "thread";
        // The chapter after the re-pick is planned from the re-picked story (the after-repick round's call)
        expect(requestText(requestFor("adopted", { role, story: r.beforePlan }))).toBe(promptOf(sent(r.played.plan.calls[0]?.caseId)));
      }
    }
  });

  it("stops at a turn the run could not get past, and holds each turn's played record", async () => {
    const unusable = () => {
      const plan = threadAnalysis("challenge", 4, 0, ["player1"]);
      return { ...plan, threads: [{ ...plan.threads[0], outcomeId: "no_such_outcome" }] };
    };
    const { call } = fakeCall(1, { reply: (role) => (role === "thread" ? unusable() : DEFAULT) });
    const { run } = await playStory(PLAYTHROUGHS[0], input(1), call, { sample: 1 });
    expect(run.complete).toBe(false);
    const replayed = replayRun(run);
    // The first turn played; the second stopped at its chapter plan and has no turn input
    expect(replayed.map((r) => r.turn)).toEqual([1]);
    expect(replayed[0].played).toBe(run.turns[0]);
  });

  it("finds one turn of one stored story, and refuses a turn the story never played", async () => {
    const { call } = fakeCall(1);
    const { run } = await playStory(PLAYTHROUGHS[0], input(1), call, { sample: 1 });
    expect(replayedTurn([run], "play-lemonade", 3).played.turn).toBe(3);
    expect(() => replayedTurn([run], "play-lemonade", 40)).toThrow(/turn 40/);
    expect(() => replayedTurn([run], "play-avalon", 3)).toThrow(/play-avalon/);
  });
});

const DIR = path.resolve("..", "DOCS", "2026-09-26_gpt6-text-eval");
const stored: PlayRun[] = fs.existsSync(path.join(DIR, "playthroughs.json")) ? playthroughRunsFrom(JSON.parse(fs.readFileSync(path.join(DIR, "playthroughs.json"), "utf-8"))) : [];
const promptHashes = (() => {
  const file = path.join(DIR, "prep-calls.jsonl");
  if (!fs.existsSync(file)) return new Map<string, string>();
  const lines = fs.readFileSync(file, "utf-8").split("\n").filter(Boolean);
  const records = lines.map((l) => JSON.parse(l) as { outputFile?: string; promptHash?: string });
  return new Map(records.flatMap((r) => (r.outputFile && r.promptHash ? [[outputIdOf(r.outputFile), r.promptHash] as [string, string]] : [])));
})();

describe("replayRun on the stored playthroughs (skipped where the output folder is absent)", () => {
  (stored.length ? it : it.skip)("rebuilds every single-player turn's request byte for byte, as production sent it on 30 September", () => {
    let turns = 0;
    for (const run of stored.filter((r) => r.input.playerCount === 1)) {
      for (const r of replayRun(run)) {
        const sentHash = promptHashes.get(outputIdOf(r.played.calls[0]?.outputFile ?? ""));
        expect([run.spec.id, r.turn, sha256(playthroughsSent({ role: "beat", story: r.before }))]).toEqual([run.spec.id, r.turn, sentHash]);
        turns++;
      }
    }
    // Lemonade's 11 turns and New Avalon's 26
    expect(turns).toBe(37);
  });

  (stored.length ? it : it.skip)("rebuilds the group stories' turns byte for byte up to the first group exploration step the owner now decides", () => {
    // Food trucks: chapter 7 (turns 23-25, Luz's crew promise with Jo in it) went Jo's way; space pirates: chapter 5
    // (turns 18-19, Mika's outcome, all three in it) went Ari's way. From the step after, production's resolution differs
    const firstChanged: Record<string, number> = { "play-food-trucks": 24, "play-space-pirates": 19 };
    for (const run of stored.filter((r) => r.input.playerCount > 1)) {
      const replayed = replayRun(run).filter((r) => r.turn < firstChanged[run.spec.id]);
      expect(replayed.length).toBe(firstChanged[run.spec.id] - 1);
      for (const r of replayed) {
        const sentHash = promptHashes.get(outputIdOf(r.played.calls[0]?.outputFile ?? ""));
        // Production's request as it was on 30 September, before the stage's exploration-order line for groups
        expect([run.spec.id, r.turn, sha256(playthroughsSent({ role: "beat", story: r.before }))]).toEqual([run.spec.id, r.turn, sentHash]);
      }
    }
  });
});
