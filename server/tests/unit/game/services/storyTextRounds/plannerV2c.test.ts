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
 * Planner v2c (the owner's feedback of 2026-09-28 on a chapter whose question
 * was its outcome's question again): planV2b with a nearer chapter question,
 * one whose three milestones answer it about this chapter's own situation,
 * and a kind of milestone that names the concrete thing it settles, written
 * by the planner (typeOfMilestone) instead of copied from the question; and
 * the chapter title's adopted "without a number", so production builds it
 * byte for byte. Everything else is planV2b's request, and planV2b builds as
 * it ran.
 */

const GUILD = "player1_guild_reform";
const OUTCOMES = { player1: [outcome(GUILD, { intendedNumberOfMilestones: 3 }), outcome("player1_enclave_trust"), outcome("player1_mia", { intendedNumberOfMilestones: 1 })] };
const CONTEST = { possibleResolutions: { sideAWins: "A", mixed: "draw", sideBWins: "B" } };

const occurrences = (text: string, passage: string) => text.split(passage).length - 1;
const schemaText = (schema: Parameters<typeof toJsonSchema>[0]) => JSON.stringify(toJsonSchema(schema));

const onePlayer = () =>
  roundStory({
    turns: 5,
    maxTurns: 20,
    playerOutcomes: OUTCOMES,
    phases: [topicSwitch([["Rally the enclave", GUILD]], 0), endedChapter(GUILD, 3, 1, "The Guild hears"), topicSwitch([["Press the Guild", GUILD], ["Visit Gruk", "player1_enclave_trust"]], 4)],
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

const v2b = (story: ReturnType<typeof onePlayer>) => plannerV2ThreadRequest(story, false, { twoSided: true });
const v2c = (story: ReturnType<typeof onePlayer>) => plannerV2ThreadRequest(story, false, { twoSided: true, nearerQuestion: true });

/** planV2c's prompt with its question item taken out and the list renumbered: planV2b's list. */
function withoutQuestionItem(prompt: string, multiplayer: boolean): string {
  const at = multiplayer ? 4 : 3;
  const start = prompt.indexOf(`\n${at}. ${PLANNER_V2_TEXT.questionItemStart}`);
  const end = prompt.indexOf(`\n${at + 1}. Possible milestones`, start);
  expect([start, end].every((i) => i > 0)).toBe(true);
  return (prompt.slice(0, start) + prompt.slice(end))
    .replace(`\n${at + 1}. Possible milestones`, `\n${at}. Possible milestones`)
    .replace(`\n${at + 2}. A progression of steps`, `\n${at + 1}. A progression of steps`);
}

describe("planner v2c: the nearer chapter question (planV2c)", () => {
  it.each(STORIES)("%s: one question item, stating the nearer question and the concrete kind of milestone", (_name, make, multiplayer) => {
    const prompt = v2c(make()).prompt;
    expect(occurrences(prompt, PLANNER_V2_TEXT.questionItemStart)).toBe(1);
    expect(occurrences(prompt, PLANNER_V2_TEXT.nearerQuestion)).toBe(1);
    expect(prompt).toContain("never ask the outcome's question again in other words");
    expect(prompt).toContain("whether the letters prove the noble's hand in the conspiracy");
    expect(prompt).toContain(multiplayer ? "Will [insert player names] get the noble's letters out of the manor" : "Will Rikkit get the noble's letters out of the manor");
    expect(v2b(make()).prompt).not.toContain(PLANNER_V2_TEXT.questionItemStart);
  });

  it.each(STORIES)("%s: otherwise planV2b's prompt, the list renumbered", (_name, make, multiplayer) => {
    expect(withoutQuestionItem(v2c(make()).prompt, multiplayer)).toBe(v2b(make()).prompt);
  });

  it("asks a contest's question of both sides, in multiplayer only", () => {
    expect(v2c(twoPlayers()).prompt).toContain(PLANNER_V2_TEXT.contestQuestion);
    expect(v2c(onePlayer()).prompt).not.toContain(PLANNER_V2_TEXT.contestQuestion);
  });

  it.each(STORIES)("%s: the reply writes the question as the nearer one, then its kind of milestone, and the title without a number", (_name, make, multiplayer) => {
    const ours = schemaText(v2c(make()).schema);
    const theirs = schemaText(v2b(make()).schema);
    expect(ours).toContain("nearer than its outcome's");
    // A group's reply offers the contest kind, a single player's does not, as in planV2b
    expect([ours.includes("contest"), theirs.includes("contest")]).toEqual([multiplayer, multiplayer]);
    expect(ours).toContain("The thread's title, without a number: its beats show it with their number.");
    expect(theirs).not.toContain("nearer than its outcome's");
    const reply = v2c(make()).schema as unknown as { shape: Record<string, { shape?: Record<string, unknown>; element?: { shape: Record<string, unknown> } }> };
    const fields = Object.keys(reply.shape.thread?.shape ?? reply.shape.threads?.element?.shape ?? {});
    expect(fields.indexOf("typeOfMilestone")).toBe(fields.indexOf("question") + 1);
    expect(fields.indexOf("possibleMilestones")).toBe(fields.indexOf("typeOfMilestone") + 1);
  });

  it("after a topic switch, narrows the chosen direction to the chapter's own situation instead of asking it as it stands", () => {
    // A chosen direction can restate its outcome ("Investigate the Waste Ring to expose corruption"), so asking it as it stands asks the outcome's question again
    for (const [, make] of STORIES) {
      const ours = schemaText(v2c(make()).schema);
      expect(ours).toContain("After a flavor switch: the switch's question, narrowed to this thread.");
      expect(ours).toContain("After a topic switch: the chosen direction, narrowed to a question about this thread's own situation, even where the direction restates its outcome.");
      expect(ours).not.toContain("asked as a question");
      // planV2b as it ran
      expect(schemaText(v2b(make()).schema)).toContain("After a topic switch: the chosen direction, asked as a question.");
    }
  });

  it("stores the written kind of milestone, and the question where the reply wrote none", () => {
    const story = onePlayer();
    const reply = (typeOfMilestone?: string) => ({
      thread: {
        kind: "challenge",
        typeOfThread: "Negotiation",
        title: "The Guild Hall",
        question: "Will Sir Bram sign the petition before the Guild's vote?",
        ...(typeOfMilestone === undefined ? {} : { typeOfMilestone }),
        possibleMilestones: { favorable: "Bram signs", mixed: "Bram stalls", unfavorable: "Bram refuses" },
        steps: [{ title: "Knock", question: "Approach: How does Rikkit ask?", possibleResolutions: { favorable: "a", mixed: "b", unfavorable: "c" } }],
        finalStep: { title: "The vote", question: "How does Rikkit settle it?" },
        plan: "Rikkit stays in the hall.",
      },
    });
    const stored = (parsed: unknown) => (v2c(story).assemble(parsed) as { threads: { typeOfMilestone: string; question: string; outcomeId: string }[] }).threads[0];
    expect(stored(reply("whether Sir Bram's signature carries the Guild"))).toMatchObject({
      typeOfMilestone: "whether Sir Bram's signature carries the Guild",
      question: "Will Sir Bram sign the petition before the Guild's vote?",
      outcomeId: GUILD,
    });
    expect(stored(reply("  ")).typeOfMilestone).toBe("Will Sir Bram sign the petition before the Guild's vote?");
    expect(stored(reply()).typeOfMilestone).toBe("Will Sir Bram sign the petition before the Guild's vote?");
  });

  it("is the eval's planV2c variant: the chapter planner above, the switch planner planV2b's", () => {
    for (const make of [onePlayer, twoPlayers, threePlayers]) {
      const story = make();
      const thread = requestFor("planV2c", { role: "thread", story });
      expect(requestText(thread)).toBe(v2c(story).prompt);
      expect(schemaText(thread.schema)).toBe(schemaText(v2c(story).schema));
      const sw = requestFor("planV2c", { role: "switch", story });
      expect(requestText(sw)).toBe(plannerV2SwitchRequest(story, false).prompt);
      expect(schemaText(sw.schema)).toBe(schemaText(requestFor("planV2b", { role: "switch", story }).schema));
    }
    expect(() => requestFor("planV2c", { role: "beat", story: onePlayer() })).toThrow("does not cover role beat");
  });
});
