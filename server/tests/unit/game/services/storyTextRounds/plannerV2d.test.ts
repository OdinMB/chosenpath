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
 * Planner v2d (the owner's feedback of 2026-09-29 on a first chapter whose
 * last step already turned to exposing the evidence it was gathering): planner
 * v2c with the outcome's stages. An outcome with n intended milestones has n
 * stages from start to finish; the chapter names them consistently with the
 * milestones already recorded, PACING says which one it settles (the one after
 * the milestones the outcome has), and its question, steps and three results
 * stay within that stage. Everything else is planner v2c's request, and planner
 * v2c builds as it ran.
 */

const GUILD = "player1_guild_reform";
const CONTEST = { possibleResolutions: { sideAWins: "A", mixed: "draw", sideBWins: "B" } };

const occurrences = (text: string, passage: string) => text.split(passage).length - 1;
const schemaText = (schema: Parameters<typeof toJsonSchema>[0]) => JSON.stringify(toJsonSchema(schema));

/** A single player's chapter on the guild outcome, with `recorded` of its 3 milestones. */
const onePlayer = (recorded = 1) =>
  roundStory({
    turns: 5,
    maxTurns: 20,
    playerOutcomes: {
      player1: [
        outcome(GUILD, { intendedNumberOfMilestones: 3, milestones: Array.from({ length: recorded }, (_, i) => `The Guild moves ${i + 1}`) }),
        outcome("player1_enclave_trust"),
        outcome("player1_mia", { intendedNumberOfMilestones: 1 }),
      ],
    },
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
  ["one player", () => onePlayer(), false],
  ["two players", twoPlayers, true],
  ["three players", threePlayers, true],
] as const;

type AnyStory = ReturnType<typeof onePlayer>;
const v2c = (story: AnyStory) => plannerV2ThreadRequest(story, false, { twoSided: true, nearerQuestion: true });
const v2d = (story: AnyStory) => plannerV2ThreadRequest(story, false, { twoSided: true, nearerQuestion: true, stages: true });

/** planV2d's prompt with its stage item and PACING's stage sentences taken out, the list renumbered: planV2c's prompt. */
function withoutStages(prompt: string, multiplayer: boolean): string {
  const at = multiplayer ? 4 : 3;
  const start = prompt.indexOf(`\n${at}. ${PLANNER_V2_TEXT.stageItemStart}`);
  const end = prompt.indexOf(`\n${at + 1}. ${PLANNER_V2_TEXT.questionItemStart}`, start);
  expect([start, end].every((i) => i > 0)).toBe(true);
  return (prompt.slice(0, start) + prompt.slice(end))
    .replace(`\n${at + 1}. ${PLANNER_V2_TEXT.questionItemStart}`, `\n${at}. ${PLANNER_V2_TEXT.questionItemStart}`)
    .replace(`\n${at + 2}. Possible milestones`, `\n${at + 1}. Possible milestones`)
    .replace(`\n${at + 3}. A progression of steps`, `\n${at + 2}. A progression of steps`)
    .replace(/; this thread settles stage \d+ of \d+(, the last)?\./g, ".");
}

describe("planner v2d: the outcome's stages (planV2d)", () => {
  it.each(STORIES)("%s: one stage item, before the question item, with its worked example", (_name, make, multiplayer) => {
    const prompt = v2d(make()).prompt;
    expect(occurrences(prompt, PLANNER_V2_TEXT.stageItemStart)).toBe(1);
    expect(occurrences(prompt, PLANNER_V2_TEXT.stagesRule)).toBe(1);
    expect(prompt.indexOf(PLANNER_V2_TEXT.stageItemStart)).toBeLessThan(prompt.indexOf(PLANNER_V2_TEXT.questionItemStart));
    expect(prompt).toContain("1. prove the noble's hand; 2. turn the Guild against him; 3. stop the conspiracy");
    expect(prompt).toContain("Only the last stage settles the outcome itself");
    expect(prompt).toContain(multiplayer ? "How do [insert player names] expose the noble before the Guild?" : "How does Rikkit expose the noble before the Guild?");
    // A contest's three results are its sides, in multiplayer only
    expect(prompt.includes("which side came out ahead")).toBe(multiplayer);
    expect(v2c(make()).prompt).not.toContain(PLANNER_V2_TEXT.stageItemStart);
  });

  it.each(STORIES)("%s: otherwise planV2c's prompt, the list renumbered", (_name, make, multiplayer) => {
    expect(withoutStages(v2d(make()).prompt, multiplayer)).toBe(v2c(make()).prompt);
  });

  it("names the stage this chapter settles in PACING: the one after the milestones the outcome has", () => {
    expect(v2d(onePlayer(0)).prompt).toContain(`The outcome this thread pushes: ${GUILD}: 0 of 3 milestones; 3 still needed; this thread settles stage 1 of 3.`);
    expect(v2d(onePlayer(1)).prompt).toContain(`${GUILD}: 1 of 3 milestones; 2 still needed; this thread settles stage 2 of 3.`);
    expect(v2d(onePlayer(2)).prompt).toContain(`${GUILD}: 2 of 3 milestones; this thread's milestone is its last one; this thread settles stage 3 of 3, the last.`);
    expect(v2d(twoPlayers()).prompt).toContain("- shared_bounty: 0 of 3 milestones; 3 still needed; this thread settles stage 1 of 3. (player1, player2)");
    expect(v2c(onePlayer(1)).prompt).not.toContain("settles stage");
  });

  it.each(STORIES)("%s: the reply names the outcome's stages right before the question; every other field is planV2c's", (_name, make, _multiplayer) => {
    void _multiplayer;
    const reply = v2d(make()).schema as unknown as { shape: Record<string, { shape?: Record<string, unknown>; element?: { shape: Record<string, unknown> } }> };
    const fields = Object.keys(reply.shape.thread?.shape ?? reply.shape.threads?.element?.shape ?? {});
    expect(fields.indexOf("outcomeStages")).toBe(fields.indexOf("title") + 1);
    expect(fields.indexOf("question")).toBe(fields.indexOf("outcomeStages") + 1);
    const ours = schemaText(v2d(make()).schema);
    expect(ours).toContain("one per intended milestone");
    expect(ours).toContain('"maxItems":6');
    // Take the one field out and the rest is planV2c's schema
    const strip = (text: string) => {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const drop = (node: unknown): unknown => {
        if (Array.isArray(node)) return node.map(drop);
        if (!node || typeof node !== "object") return node;
        const out: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
          if (key === "outcomeStages") continue;
          out[key] = key === "required" && Array.isArray(value) ? value.filter((v) => v !== "outcomeStages") : drop(value);
        }
        return out;
      };
      return JSON.stringify(drop(parsed));
    };
    expect(strip(ours)).toBe(strip(schemaText(v2c(make()).schema)));
  });

  it("stores the written stages on the thread; a reply without them assembles as planV2c's", () => {
    const story = onePlayer(1);
    const reply = (outcomeStages?: string[]) => ({
      thread: {
        kind: "challenge",
        typeOfThread: "Negotiation",
        title: "The Guild Hall",
        ...(outcomeStages ? { outcomeStages } : {}),
        question: "Will Sir Bram sign the petition before the Guild's vote?",
        typeOfMilestone: "whether Sir Bram's signature carries the Guild",
        possibleMilestones: { favorable: "Bram signs", mixed: "Bram stalls", unfavorable: "Bram refuses" },
        steps: [{ title: "Knock", question: "Approach: How does Rikkit ask?", possibleResolutions: { favorable: "a", mixed: "b", unfavorable: "c" } }],
        finalStep: { title: "The vote", question: "How does Rikkit settle it?" },
        plan: "Rikkit stays in the hall.",
      },
    });
    const stages = ["win a hearing", "get Sir Bram's signature", "reform the Guild"];
    const stored = (v2d(story).assemble(reply(stages)) as { threads: Record<string, unknown>[] }).threads[0];
    expect(stored.outcomeStages).toEqual(stages);
    expect(stored).toMatchObject({ outcomeId: GUILD, question: "Will Sir Bram sign the petition before the Guild's vote?" });
    // Everything else as planner v2c stores it
    const { outcomeStages, ...rest } = stored;
    void outcomeStages;
    expect(rest).toEqual((v2c(story).assemble(reply()) as { threads: unknown[] }).threads[0]);
    expect(v2d(story).assemble(reply())).toEqual(v2c(story).assemble(reply()));
  });

  describe("the climax clause (planV2dClimax, the owner's open question): only the story's last thread differs", () => {
    const climax = (story: AnyStory) => plannerV2ThreadRequest(story, false, { twoSided: true, nearerQuestion: true, stages: true, climax: true });
    /** A single player's last thread (3 turns left) on the guild outcome with `recorded` of its 3 milestones. */
    const lastThread = (recorded = 1) =>
      roundStory({
        turns: 17,
        maxTurns: 20,
        playerOutcomes: {
          player1: [outcome(GUILD, { intendedNumberOfMilestones: 3, milestones: Array.from({ length: recorded }, (_, i) => `The Guild moves ${i + 1}`) }), outcome("player1_enclave_trust")],
        },
        phases: [topicSwitch([["Rally the enclave", GUILD]], 0), endedChapter(GUILD, 3, 1, "The Guild hears"), topicSwitch([["Press the Guild", GUILD], ["Visit Gruk", "player1_enclave_trust"]], 16)],
      });
    const threeLast = () =>
      roundStory({
        players: 3,
        turns: 17,
        maxTurns: 20,
        gameMode: GameModes.CooperativeCompetitive,
        sharedOutcomes: [outcome("shared_lead", CONTEST), outcome("shared_launch")],
        playerOutcomes: { player1: [outcome("player1_a")], player2: [outcome("player2_b")], player3: [outcome("player3_c")] },
        phases: [
          flavorSwitch("shared_launch", "q", 0, ["player1", "player2", "player3"]),
          endedChapter("shared_launch", 4, 1, "m", ["player1", "player2", "player3"]),
          topicSwitch([["Take the lead", "shared_lead"]], 16, ["player1", "player2", "player3"]),
        ],
      });

    it("is planV2d's request byte for byte before the last thread, and in it where one milestone or none is left", () => {
      for (const story of [onePlayer(0), onePlayer(1), twoPlayers(), threePlayers(), lastThread(2)]) {
        expect(climax(story).prompt).toBe(v2d(story).prompt);
        expect(schemaText(climax(story).schema)).toBe(schemaText(v2d(story).schema));
      }
    });

    it("in the story's last thread, settles every stage left: the stage item says so once, PACING folds the stages", () => {
      for (const [make, multiplayer] of [[() => lastThread(1), false], [threeLast, true]] as const) {
        const ours = climax(make()).prompt;
        const theirs = v2d(make()).prompt;
        expect(ours).not.toBe(theirs);
        expect(occurrences(ours, PLANNER_V2_TEXT.climaxClause(multiplayer))).toBe(1);
        expect(theirs).not.toContain("In the story's last thread, PACING names every stage");
        // Only the clause and PACING's lines differ; the schema is planV2d's
        const back = ours
          .replace(` ${PLANNER_V2_TEXT.climaxClause(multiplayer)}`, "")
          .replace(/(\d+) still needed, but this is the story's last thread, so this thread's milestone is its last one; this thread settles stages (\d+) (?:and|to) (\d+), the last\./g, "$1 still needed; this thread settles stage $2 of $3.");
        expect(back).toBe(theirs);
        expect(schemaText(climax(make()).schema)).toBe(schemaText(v2d(make()).schema));
      }
      expect(climax(lastThread(1)).prompt).toContain(
        `${GUILD}: 1 of 3 milestones; 2 still needed, but this is the story's last thread, so this thread's milestone is its last one; this thread settles stages 2 and 3, the last.`
      );
      expect(v2d(lastThread(1)).prompt).toContain(`${GUILD}: 1 of 3 milestones; 2 still needed; this thread settles stage 2 of 3.`);
    });

    it("is the eval's planV2dClimax variant, its switch planner planV2b's", () => {
      const story = lastThread(1);
      expect(requestText(requestFor("planV2dClimax", { role: "thread", story }))).toBe(climax(story).prompt);
      expect(requestText(requestFor("planV2dClimax", { role: "switch", story }))).toBe(plannerV2SwitchRequest(story, false).prompt);
      expect(() => requestFor("planV2dClimax", { role: "beat", story })).toThrow("does not cover role beat");
    });
  });

  it("is the eval's planV2d variant: the chapter planner above, the switch planner planV2b's", () => {
    for (const make of [() => onePlayer(), twoPlayers, threePlayers]) {
      const story = make();
      const thread = requestFor("planV2d", { role: "thread", story });
      expect(requestText(thread)).toBe(v2d(story).prompt);
      expect(schemaText(thread.schema)).toBe(schemaText(v2d(story).schema));
      const sw = requestFor("planV2d", { role: "switch", story });
      expect(requestText(sw)).toBe(plannerV2SwitchRequest(story, false).prompt);
      expect(schemaText(sw.schema)).toBe(schemaText(requestFor("planV2b", { role: "switch", story }).schema));
    }
    expect(() => requestFor("planV2d", { role: "beat", story: onePlayer() })).toThrow("does not cover role beat");
  });
});
