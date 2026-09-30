import { describe, expect, it } from "@jest/globals";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { GameModes } from "core/types/index.js";
import {
  PLANNER_V2_TEXT,
  plannerV2SwitchRequest,
  plannerV2ThreadRequest,
} from "../../../../../src/game/services/storyTextRounds/turnRound1Planners.js";
import { requestFor, requestText } from "../../../../../src/evals/textModelEval/variants.js";
import { endedChapter, flavorSwitch, outcome, roundStory, topicSwitch } from "../../../../helpers/roundStories.js";

/*
 * Planner v2f (the choice-result stage of 2026-09-30, the playthroughs'
 * "choices that lead somewhere else"): planner v2e with the two rules a step's
 * results need for the choices to lead where they say. A challenge or contest
 * result is rolled against the option the player chose, so it says how the
 * attempt turns out, never which approach the player takes or what they say or
 * decide: New Avalon's hearing chapters wrote "Eli's question folds the
 * possibility into the confirmed evidence", "Eli plainly retracts the claim" /
 * "Eli defends his framing", and the next turn told the rolled action over the
 * one chosen. An exploration result is the option at its position, so it is
 * something the player chooses to do, never how others respond: a food truck
 * chapter wrote "The crew names time off…" for Luz's step. Everything else is
 * planner v2e's request byte for byte.
 */

const GUILD = "player1_guild_reform";
const CONTEST = { possibleResolutions: { sideAWins: "A", mixed: "draw", sideBWins: "B" } };

const occurrences = (text: string, passage: string) => text.split(passage).length - 1;
const schemaText = (schema: Parameters<typeof toJsonSchema>[0]) => JSON.stringify(toJsonSchema(schema));

const onePlayer = () =>
  roundStory({
    turns: 5,
    maxTurns: 20,
    playerOutcomes: { player1: [outcome(GUILD, { intendedNumberOfMilestones: 3, milestones: ["The Guild moves"] }), outcome("player1_enclave_trust")] },
    phases: [topicSwitch([["Rally the enclave", GUILD]], 0), endedChapter(GUILD, 3, 1, "The Guild hears"), topicSwitch([["Press the Guild", GUILD], ["Visit Gruk", "player1_enclave_trust"]], 4)],
  });
const twoPlayers = () =>
  roundStory({
    players: 2,
    turns: 1,
    maxTurns: 20,
    gameMode: GameModes.Competitive,
    sharedOutcomes: [outcome("shared_bounty", { ...CONTEST, intendedNumberOfMilestones: 3 })],
    playerOutcomes: { player1: [outcome("player1_a")], player2: [outcome("player2_b")] },
    phases: [flavorSwitch("shared_bounty", "q", 0, ["player1", "player2"])],
  });
const threePlayers = () =>
  roundStory({
    players: 3,
    turns: 5,
    maxTurns: 20,
    gameMode: GameModes.CooperativeCompetitive,
    sharedOutcomes: [outcome("shared_lead", CONTEST), outcome("shared_launch")],
    playerOutcomes: { player1: [outcome("player1_a")], player2: [outcome("player2_b")], player3: [outcome("player3_c")] },
    phases: [
      flavorSwitch("shared_launch", "q", 0, ["player1", "player2", "player3"]),
      endedChapter("shared_launch", 4, 1, "m", ["player1", "player2", "player3"]),
      topicSwitch([["Take the lead", "shared_lead"]], 4, ["player1", "player2", "player3"]),
    ],
  });

const STORIES = [
  ["one player", onePlayer, false],
  ["two players", twoPlayers, true],
  ["three players", threePlayers, true],
] as const;

type AnyStory = ReturnType<typeof onePlayer>;
const V2E = { twoSided: true, nearerQuestion: true, stages: true, stepsOnce: true } as const;
const v2e = (story: AnyStory) => plannerV2ThreadRequest(story, false, V2E);
const v2f = (story: AnyStory) => plannerV2ThreadRequest(story, false, { ...V2E, outcomeResults: true });

describe("planner v2f: planner v2e with its step results' two rules (planV2f)", () => {
  it.each(STORIES)("%s: the progression item's results sentence says both rules, in place of planner v2e's", (_name, make, multiplayer) => {
    const [ours, theirs] = [v2f(make()).prompt, v2e(make()).prompt];
    const { before, after } = PLANNER_V2_TEXT.stepResults(multiplayer);
    expect(occurrences(theirs, before)).toBe(1);
    expect(occurrences(ours, after)).toBe(1);
    expect(ours).not.toContain(before);
    // Otherwise planner v2e's prompt, byte for byte
    expect(ours.replace(after, before)).toBe(theirs);
  });

  it("words the rules as the playthroughs need them: a challenge result is how the attempt turns out, an exploration result is the player's own choice", () => {
    const single = PLANNER_V2_TEXT.stepResults(false).after;
    expect(single).toMatch(/Each challenge result, the milestones included, says how the player's attempt turns out, whatever they chose to do/);
    expect(single).toMatch(/never which approach the player takes or what they say or decide, since the option they choose decides that/);
    expect(single).toMatch(/weak: "Rikkit bribes the guard instead"; good: "The guard pockets the coin and calls his sergeant anyway"/);
    expect(single).toMatch(/Each exploration result is something the player chooses to do, and the step's three options offer them one each, in order: never how others respond\./);
    const group = PLANNER_V2_TEXT.stepResults(true).after;
    expect(group).toMatch(/Each challenge or contest result, the milestones included, says how the players' attempts turn out/);
    expect(group).toMatch(/never which approach a player takes or what they say or decide/);
    expect(group).toMatch(/weak: "The group bribes the guard instead"/);
    expect(group).toMatch(/Each exploration result is something a player chooses to do/);
    // Planner v2e's sentences stay as the rules' first halves
    expect(single.startsWith(PLANNER_V2_TEXT.stepResults(false).before.split(" In exploration threads")[0])).toBe(true);
  });

  it.each(STORIES)("%s: the reply's schema and its assembly are planner v2e's", (_name, make, multiplayer) => {
    const story = make();
    expect(schemaText(v2f(story).schema)).toBe(schemaText(v2e(story).schema));
    const step = multiplayer ? { sideAWins: "a", mixed: "b", sideBWins: "c" } : { favorable: "a", mixed: "b", unfavorable: "c" };
    const milestones = multiplayer ? { sideAWins: "A wins", mixed: "draw", sideBWins: "B wins" } : { favorable: "Bram signs", mixed: "Bram stalls", unfavorable: "Bram refuses" };
    const thread = {
      kind: multiplayer ? "contest" : "challenge",
      typeOfThread: "Negotiation",
      title: "The Guild Hall",
      outcomeStages: ["win a hearing", "get Sir Bram's signature", "reform the Guild"],
      question: "Will Sir Bram sign the petition before the Guild's vote?",
      typeOfMilestone: "whether Sir Bram's signature carries the Guild",
      possibleMilestones: milestones,
      steps: [{ title: "Knock", question: "Approach: How does Rikkit ask?", possibleResolutions: step }],
      finalStep: { title: "The vote", question: "How does Rikkit settle it?" },
      plan: "Rikkit stays in the hall.",
    };
    const reply = multiplayer
      ? { grouping: "All at the hall.", duration: 2, threads: [{ ...thread, outcomeId: story.getSharedOutcomes()[0].id, playersSideA: ["player1"], playersSideB: ["player2"] }] }
      : { thread };
    expect(v2f(story).assemble(reply)).toEqual(v2e(story).assemble(reply));
  });

  it("is the eval's planV2f variant: the chapter planner above, the switch planner planner v2b's", () => {
    for (const make of [onePlayer, twoPlayers, threePlayers]) {
      const story = make();
      const thread = requestFor("planV2f", { role: "thread", story });
      expect(requestText(thread)).toBe(v2f(story).prompt);
      expect(schemaText(thread.schema)).toBe(schemaText(v2f(story).schema));
      const sw = requestFor("planV2f", { role: "switch", story });
      expect(requestText(sw)).toBe(plannerV2SwitchRequest(story, false).prompt);
    }
    expect(() => requestFor("planV2f", { role: "beat", story: onePlayer() })).toThrow("does not cover role beat");
  });

  it("leaves planner v2e and every earlier planner as they ran", () => {
    for (const make of [onePlayer, twoPlayers, threePlayers]) {
      for (const variant of ["planV2", "planV2b", "planV2c", "planV2d", "planV2e"] as const) {
        const prompt = requestText(requestFor(variant, { role: "thread", story: make() }));
        expect(prompt).not.toContain("Each exploration result is something");
        expect(prompt).not.toContain("the milestones included, says how");
      }
    }
  });
});
