import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import type { SetOfBeatGenerationSchema } from "core/types/index.js";
import { repairBeatReply } from "../../../../src/game/services/beatRepairs.js";
import { scoreboardWinners } from "../../../../src/game/services/scoreboards.js";
import { PLAYTHROUGHS, playStory, type PlayCallSpec, type PlayRun } from "../../../../src/evals/textModelEval/playthroughs.js";
import { playthroughRunsFrom } from "../../../../src/evals/textModelEval/playthroughMode.js";
import { replayRun, replayedTurn } from "../../../../src/evals/textModelEval/playthroughReplay.js";
import { outputIdOf } from "../../../../src/evals/textModelEval/judgedChecks.js";
import { sha256 } from "../../../../src/evals/textModelEval/executor.js";
import { requestFor, requestText } from "../../../../src/evals/textModelEval/variants.js";
import { playthroughsSent } from "../../../../src/evals/textModelEval/choiceResultCases.js";
import { playthroughs2Sent } from "../../../../src/evals/textModelEval/parallelThreadsCases.js";
import { takesKidsRules } from "../../../../src/game/services/kidsTurnRules.js";
import { switchAnalysis, threadAnalysis } from "../../../helpers/textFixtures.js";
import { beforeEndingOnlyPlayed, beforeGroupLevers, beforeLateClues, beforeOptionsO2c, beforeShortReplies } from "../../../helpers/adoptedDeltas.js";
import { takesGroupLevers } from "../../../../src/game/services/storyTextRounds/groupLevers.js";
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
    const { run } = await playStory(PLAYTHROUGHS[2], input(2), call, { sample: 1, repickStuckSwitches: true });
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

const stored2: PlayRun[] = fs.existsSync(path.join(DIR, "playthroughs-2.json")) ? playthroughRunsFrom(JSON.parse(fs.readFileSync(path.join(DIR, "playthroughs-2.json"), "utf-8"))) : [];

/** The turns where production's beat repairs now drop a lever charged again (leverChargedAgain), replaying each stored reply on the state its turn saw. */
function chargedAgain(runs: PlayRun[], before: (run: PlayRun) => number = () => Number.POSITIVE_INFINITY) {
  return runs.flatMap((run) =>
    replayRun(run)
      .filter((r) => r.turn < before(run) && r.played.reply)
      .flatMap((r) => repairBeatReply(r.before, r.played.reply as SetOfBeatGenerationSchema).repairs.filter((k) => k.kind === "leverChargedAgain").map((k) => [run.spec.id, r.turn, k.detail]))
  );
}

/** The milestones production's beat repairs now drop as not played (milestoneNotPlayed), replaying each stored reply on the state its turn saw. */
function notPlayed(runs: PlayRun[], before: (run: PlayRun) => number = () => Number.POSITIVE_INFINITY) {
  return runs.flatMap((run) =>
    replayRun(run)
      .filter((r) => r.turn < before(run) && r.played.reply)
      .flatMap((r) => repairBeatReply(r.before, r.played.reply as SetOfBeatGenerationSchema).repairs.filter((k) => k.kind === "milestoneNotPlayed").map((k) => [run.spec.id, r.turn, k.detail]))
  );
}

describe("replayRun on the stored round 2 (skipped where the output folder is absent)", () => {
  /*
   * The estate agents' chapter 6 (turns 20-21) was a group challenge on Nia's own protégé outcome: at turn 21 her roll
   * was unfavorable and Rory's favorable, pooled into a mixed step. Production reads the owner's roll alone since
   * 2026-10-01 (the owner's decision), so from turn 22 the replayed story is production's, not the one played.
   */
  const firstChanged2: Record<string, number> = { "play-estate-agents": 22 };

  (stored2.length ? it : it.skip)("rebuilds every turn's request byte for byte, as production sent it on 30 September, up to the estate agents' step the owner's roll now decides", () => {
    let turns = 0;
    let kids = 0;
    let endings = 0;
    let rolledGroupSteps = 0;
    for (const run of stored2) {
      for (const r of replayRun(run).filter((t) => t.turn < (firstChanged2[run.spec.id] ?? Number.POSITIVE_INFINITY))) {
        const sentHash = promptHashes.get(outputIdOf(r.played.calls[0]?.outputFile ?? ""));
        // The turn as production sent it then (playthroughs2Sent): today's but for the kids rules, which a single player's
        // read-with-kids turn takes since 2026-10-01 (the mouse story recorded its category), every ending's lines on
        // what was played (the owner's decision of 2026-10-01), and a group's rolled step's lever lines (the group-levers
        // adoption of the same day), and every turn's short-replies lines (that stage's adoption, later that day), and a
        // single player's rolled step's O2c lines (the options-o2c adoption, later still), and a late turn's clue lines (the
        // pacing-clues adoption, later again)
        expect([run.spec.id, r.turn, sha256(playthroughs2Sent({ role: "beat", story: r.before }))]).toEqual([run.spec.id, r.turn, sentHash]);
        const withLines = requestText(requestFor("adopted", { role: "beat", story: r.before }));
        expect([run.spec.id, r.turn, sha256(withLines) === sentHash]).toEqual([run.spec.id, r.turn, false]);
        const today = beforeShortReplies(beforeOptionsO2c(beforeLateClues(withLines, r.before), r.before));
        const ending = r.before.getCurrentBeatType() === "ending";
        const levers = takesGroupLevers(r.before);
        expect([run.spec.id, r.turn, sha256(today) === sentHash]).toEqual([run.spec.id, r.turn, !takesKidsRules(r.before) && !ending && !levers]);
        if ((ending || levers) && !takesKidsRules(r.before)) {
          expect([run.spec.id, r.turn, sha256(beforeGroupLevers(beforeEndingOnlyPlayed(today, r.before), r.before))]).toEqual([run.spec.id, r.turn, sentHash]);
        }
        if (takesKidsRules(r.before)) kids++;
        if (ending) endings++;
        if (levers) rolledGroupSteps++;
        turns++;
      }
    }
    // Six stories: 11 + 26 + 26 + 26 + 21 + 11 turns (the estate agents' up to turn 21), the mouse story's 11 read with a
    // child, one ending each but the estate agents'; the group stories' chapter steps with a player in a challenge or
    // contest thread (food trucks 18, space pirates 16, the estate agents 15 up to turn 21)
    expect(turns).toBe(121);
    expect(kids).toBe(11);
    expect(endings).toBe(5);
    expect(rolledGroupSteps).toBe(49);
  });

  (stored2.length ? it : it.skip)("reads Nia's roll alone at the estate agents' turn 21, a group challenge on her own outcome: unfavorable where the pooled rolls gave mixed", () => {
    const run = stored2.find((r) => r.spec.id === "play-estate-agents");
    const atSwitch = run && replayRun(run).find((r) => r.turn === 22)?.before;
    const chapter = atSwitch?.getResolvedThreadAnalysis()?.threads ?? [];
    expect(chapter.map((t) => [t.outcomeId, t.playersSideA])).toEqual([["player2_protege", ["player1", "player2"]]]);
    const rolls = ["player1", "player2"].map((slot) => atSwitch?.getPlayer(slot)?.beatHistory[20]?.resolution);
    expect(rolls).toEqual(["favorable", "unfavorable"]);
    expect(chapter[0].progression[1].resolution).toBe("unfavorable");
    expect(chapter[0].milestone).toBe((chapter[0].possibleMilestones as Record<string, string>).unfavorable);
  });

  (stored2.length ? it : it.skip)("production now drops the estate agents' ending's milestones on outcomes the last chapter didn't push, and nothing else in either round (only what was played, 2026-10-01)", () => {
    expect(notPlayed(stored2)).toEqual([
      // The estate agents' ending: beside the last chapter's milestone, one on each of four outcomes already complete
      // that no chapter which just ended pushed (the report's 6.3; the harness's noUnearnedMilestones at turn 26)
      ["play-estate-agents", 26, "player1/player1_reputation"],
      ["play-estate-agents", 26, "player1/player1_principle"],
      ["play-estate-agents", 26, "player2/player2_protege"],
      ["play-estate-agents", 26, "player2/player2_principle"],
    ]);
    const firstChanged: Record<string, number> = { "play-food-trucks": 24, "play-space-pirates": 19 };
    expect(notPlayed(stored, (run) => firstChanged[run.spec.id] ?? Number.POSITIVE_INFINITY)).toEqual([]);
  });

  (stored2.length ? it : it.skip)("production now drops the two levers round 2 charged twice, and nothing else in either round (the chapter's earlier steps and ladders read since 2026-10-01)", () => {
    expect(chargedAgain(stored2)).toEqual([
      // New Avalon: the bracing (-15%) turn 2 took, turn 3 paid (60 → 45); turn 4 charged it again (45 → 30)
      ["play-avalon", 4, "player1/player_personal_reserve: -15, the sacrifice the previous turn paid"],
      // The mouse story: the Pantry Crumb turn 9 spent as a wedge, turn 10 paid (3 → 2); the ending spent it again (2 → 1)
      ["play-kids-mouse", 11, "shared/shared_pantry_crumbs: -1, the sacrifice the previous turn paid"],
    ]);
    // Round 1: the group stories up to the step the owner rule now decides differently
    const firstChanged: Record<string, number> = { "play-food-trucks": 24, "play-space-pirates": 19 };
    expect(chargedAgain(stored, (run) => firstChanged[run.spec.id] ?? Number.POSITIVE_INFINITY)).toEqual([]);
  });
});

const stored3: PlayRun[] = fs.existsSync(path.join(DIR, "playthroughs-3.json")) ? playthroughRunsFrom(JSON.parse(fs.readFileSync(path.join(DIR, "playthroughs-3.json"), "utf-8"))) : [];

/** The notes production's beat repairs now write on a lever's stat moved in the reply that offers that lever (leverChargedOnOffer). */
function chargedOnOffer(runs: PlayRun[], before: (run: PlayRun) => number = () => Number.POSITIVE_INFINITY) {
  return runs.flatMap((run) =>
    replayRun(run)
      .filter((r) => r.turn < before(run) && r.played.reply)
      .flatMap((r) => repairBeatReply(r.before, r.played.reply as SetOfBeatGenerationSchema).repairs.filter((k) => k.kind === "leverChargedOnOffer").map((k) => [run.spec.id, r.turn, k.detail]))
  );
}

/** The side each scoreboard's contest was won by on a stored turn, as production reads it now (scoreboardWinners). */
function winnersAt(runs: PlayRun[], storyId: string, turn: number) {
  const run = runs.find((r) => r.spec.id === storyId);
  const at = run && replayRun(run).find((r) => r.turn === turn);
  return at ? [...scoreboardWinners(at.before)] : undefined;
}

/** The scoreboard repairs production's beat repairs make now (scoreboardDirection, scoreboardWrittenTwice), replaying each stored reply on the state its turn saw. */
function scoreboardRepairs(runs: PlayRun[], before: (run: PlayRun) => number = () => Number.POSITIVE_INFINITY) {
  return runs.flatMap((run) =>
    replayRun(run)
      .filter((r) => r.turn < before(run) && r.played.reply)
      .flatMap((r) => repairBeatReply(r.before, r.played.reply as SetOfBeatGenerationSchema).repairs.filter((k) => k.kind.startsWith("scoreboard")).map((k) => [run.spec.id, r.turn, k.kind, k.detail]))
  );
}

/*
 * The review of the third round (2026-10-01): three double charges the repair, reading the last beat's percentage and
 * number payments only, let through (the stored pages, stories/round3/). Played with the repair, the kept replies lack the
 * seven it dropped then; production now drops two more and notes the third.
 */
describe("replayRun on the stored round 3 (skipped where the output folder is absent)", () => {
  (stored3.length ? it : it.skip)("production now drops round 3's repeat two turns after its payment and its ladder step taken twice, and nothing else", () => {
    expect(chargedAgain(stored3)).toEqual([
      // The space pirates: Oren's Pirate Reputation reward taken at turn 15, paid at 16 (Unproven → Known Hand), stepped
      // again at 17 (Known Hand → Feared Name: "Your reputation now precedes you")
      ["play-space-pirates", 17, "player3/player_reputation: +1, the reward the previous turn paid"],
      // The estate agents: Tamsin's Composure sacrifice taken at turn 22, paid at 23 (55 → 45), its repeat dropped at 24,
      // charged once more at 25 (45 → 35, "your fingers tighten briefly")
      ["play-estate-agents", 25, "player2/player_composure: -10, the sacrifice turn 23 paid, earlier in this chapter"],
    ]);
  });

  (stored3.length ? it : it.skip)("production now notes a lever's stat moved in the reply that offers it: Davi's Nerve at the space pirates' turn 19", () => {
    expect(chargedOnOffer(stored3)).toEqual([["play-space-pirates", 19, "player2/player_nerve: -10, in the reply that offers that sacrifice"]]);
  });

  (stored3.length ? it : it.skip)("production's scoreboard repairs on every stored round, now that a board named by its id's words is read and a score written twice is dropped", () => {
    const firstChanged: Record<string, number> = { "play-food-trucks": 24, "play-space-pirates": 19 };
    // Round 1: the food trucks' turn 22, the move that gave the repair its start (2026-09-30), as before
    expect(scoreboardRepairs(stored, (run) => firstChanged[run.spec.id] ?? Number.POSITIVE_INFINITY)).toEqual([
      ["play-food-trucks", 22, "scoreboardDirection", "shared_license_race: 35 -> 50 after side B won; 35 -> 20"],
    ]);
    // The space pirates' round-1 board ("Scored by Black Star Lead" for shared_black_star_lead) is read now; its one move,
    // the switch at turn 9 to 65|35 after the captain's camp (side A) won, went the winner's way, so nothing changes there
    expect(winnersAt(stored, "play-space-pirates", 9)).toEqual([["shared_black_star_lead", "sideA"]]);
    // Round 2 named every board by its name; nothing new
    expect(scoreboardRepairs(stored2, (run) => (run.spec.id === "play-estate-agents" ? 22 : Number.POSITIVE_INFINITY))).toEqual([]);
    // Round 3: the food trucks' ending keeps 30 (30|70, Omar's side, the winner's) where the game kept 70 (70|30 for Amara)
    expect(scoreboardRepairs(stored3)).toEqual([["play-food-trucks", 26, "scoreboardWrittenTwice", "shared_contract_race: 70 after 30 in the same reply, the other side's share"]]);
  });

  (stored3.length ? it : it.skip)("the earlier rounds hold no other charge in the reply that offers the lever", () => {
    const firstChanged: Record<string, number> = { "play-food-trucks": 24, "play-space-pirates": 19 };
    expect(chargedOnOffer(stored, (run) => firstChanged[run.spec.id] ?? Number.POSITIVE_INFINITY)).toEqual([]);
    expect(chargedOnOffer(stored2, (run) => (run.spec.id === "play-estate-agents" ? 22 : Number.POSITIVE_INFINITY))).toEqual([]);
  });
});
