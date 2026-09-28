import { describe, expect, it } from "@jest/globals";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { GameModes } from "core/types/index.js";
import {
  PLANNER_V2_TEXT,
  plannerV2SwitchRequest,
  plannerV2ThreadRequest,
} from "../../../../../src/game/services/storyTextRounds/turnRound1Planners.js";
import { endedChapter, flavorSwitch, outcome, roundStory, topicSwitch } from "../../../../helpers/roundStories.js";

/*
 * Planner v2 with two-sided contests only (owner, 2026-09-28: no contests of
 * three or more parties, an accepted engine limit): the chapter planner's
 * three-player race rule and the "three paths name which player wins" line
 * go; with three players, a contest's sides are the setup's two camps.
 */

const GUILD = "player1_guild_reform";
const OUTCOMES = { player1: [outcome(GUILD, { intendedNumberOfMilestones: 3 }), outcome("player1_enclave_trust"), outcome("player1_mia", { intendedNumberOfMilestones: 1 })] };
const CONTEST = { possibleResolutions: { sideAWins: "A", mixed: "draw", sideBWins: "B" } };

const occurrences = (text: string, passage: string) => text.split(passage).length - 1;
const schemaText = (schema: Parameters<typeof toJsonSchema>[0]) => JSON.stringify(toJsonSchema(schema));

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
const twoPlayers = () =>
  roundStory({
    players: 2,
    turns: 1,
    maxTurns: 20,
    gameMode: GameModes.Competitive,
    sharedOutcomes: [outcome("shared_bounty", CONTEST)],
    playerOutcomes: { player1: [outcome("player1_a")], player2: [outcome("player2_b")] },
    phases: [flavorSwitch("shared_bounty", "q", 0, ["player1", "player2"])],
  });
const onePlayer = () => roundStory({ turns: 1, maxTurns: 10, playerOutcomes: OUTCOMES, phases: [flavorSwitch(GUILD, "How does Rikkit answer the Guild?", 0)] });

describe("planner v2 with two-sided contests (planV2b)", () => {
  it.each([
    ["three players", threePlayers],
    ["two players", twoPlayers],
  ] as const)("%s: no race rule and no three-path contest line", (_name, make) => {
    const prompt = plannerV2ThreadRequest(make(), false, { twoSided: true }).prompt;
    expect(prompt).not.toContain(PLANNER_V2_TEXT.raceRuleStart);
    expect(prompt).not.toContain("three paths name which player wins");
    expect(occurrences(prompt, PLANNER_V2_TEXT.kindRuleStart)).toBe(1);
    expect(occurrences(prompt, PLANNER_V2_TEXT.twoSides)).toBe(1);
  });

  it("names the camps as the sides only where three players plan", () => {
    expect(occurrences(plannerV2ThreadRequest(threePlayers(), false, { twoSided: true }).prompt, PLANNER_V2_TEXT.campsSides)).toBe(1);
    expect(plannerV2ThreadRequest(twoPlayers(), false, { twoSided: true }).prompt).not.toContain(PLANNER_V2_TEXT.campsSides);
    // The two-player sides stay as planner v2 wrote them
    expect(plannerV2ThreadRequest(twoPlayers(), false, { twoSided: true }).prompt).toContain("in a two-player game, player1 is always Side A and player2 Side B");
  });

  it("keeps planner v2 as it ran: the race rule is still there without the option", () => {
    expect(plannerV2ThreadRequest(threePlayers(), false).prompt).toContain(PLANNER_V2_TEXT.raceRuleStart);
  });

  it("changes nothing for one player, nor the switch planner, nor the reply", () => {
    const [ours, theirs] = [plannerV2ThreadRequest(onePlayer(), false, { twoSided: true }), plannerV2ThreadRequest(onePlayer(), false)];
    expect(ours.prompt).toBe(theirs.prompt);
    expect(schemaText(ours.schema)).toBe(schemaText(theirs.schema));
    const [three, threeAsRan] = [plannerV2ThreadRequest(threePlayers(), false, { twoSided: true }), plannerV2ThreadRequest(threePlayers(), false)];
    expect(schemaText(three.schema)).toBe(schemaText(threeAsRan.schema));
    for (const make of [threePlayers, twoPlayers, onePlayer]) {
      expect(plannerV2SwitchRequest(make(), false).prompt).toBe(plannerV2SwitchRequest(make(), false).prompt);
    }
  });
});
