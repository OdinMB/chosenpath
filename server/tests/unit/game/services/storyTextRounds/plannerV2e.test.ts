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
 * Planner v2e (the coordinator's brief of 2026-09-30, after the owner decided
 * that the story's last chapter settles only its outcome's next stage, planner
 * v2d's clause): planner v2d with its last step listed once. Planner v2d wrote
 * its last step twice, in `steps` and again as `finalStep`, in 4 of 46 plans
 * (v2c 1 of 46); in a last chapter that makes the chapter a beat longer than
 * the turns left, and elsewhere it plays the decisive moment twice. The fix:
 * one line in the progression item (each step comes once; a thread of n beats
 * has n different steps) and the reply's steps, last step and (in multiplayer)
 * duration saying the same of their own field. Everything else is planner
 * v2d's request, byte for byte.
 */

const GUILD = "player1_guild_reform";
const CONTEST = { possibleResolutions: { sideAWins: "A", mixed: "draw", sideBWins: "B" } };
const DECISIVE = "   - The last step is the decisive moment: its question brings the thread's question to a head.";

const occurrences = (text: string, passage: string) => text.split(passage).length - 1;
const schemaText = (schema: Parameters<typeof toJsonSchema>[0]) => JSON.stringify(toJsonSchema(schema));

/** A single player's chapter on the guild outcome, with `recorded` of its 3 milestones, `turns` turns into a 20-turn story. */
const onePlayer = (recorded = 1, turns = 5) =>
  roundStory({
    turns,
    maxTurns: 20,
    playerOutcomes: {
      player1: [
        outcome(GUILD, { intendedNumberOfMilestones: 3, milestones: Array.from({ length: recorded }, (_, i) => `The Guild moves ${i + 1}`) }),
        outcome("player1_enclave_trust"),
      ],
    },
    phases: [topicSwitch([["Rally the enclave", GUILD]], 0), endedChapter(GUILD, 3, 1, "The Guild hears"), topicSwitch([["Press the Guild", GUILD], ["Visit Gruk", "player1_enclave_trust"]], turns - 1)],
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
const v2d = (story: AnyStory) => plannerV2ThreadRequest(story, false, { twoSided: true, nearerQuestion: true, stages: true });
const v2e = (story: AnyStory) => plannerV2ThreadRequest(story, false, { twoSided: true, nearerQuestion: true, stages: true, stepsOnce: true });

describe("planner v2e: planner v2d with its last step listed once (planV2e)", () => {
  it.each(STORIES)("%s: one line in the progression item, right after the decisive last step", (_name, make, _multiplayer) => {
    void _multiplayer;
    const prompt = v2e(make()).prompt;
    expect(occurrences(prompt, PLANNER_V2_TEXT.stepsOnce)).toBe(1);
    expect(prompt).toContain(`${DECISIVE}\n   - ${PLANNER_V2_TEXT.stepsOnce}\n`);
    expect(PLANNER_V2_TEXT.stepsOnce).toBe("Each step comes once: a thread of n beats has n different steps, and the last one never repeats the step before it.");
    expect(v2d(make()).prompt).not.toContain(PLANNER_V2_TEXT.stepsOnce);
  });

  it.each(STORIES)("%s: otherwise planner v2d's prompt, byte for byte", (_name, make, _multiplayer) => {
    void _multiplayer;
    expect(v2e(make()).prompt.replace(`\n   - ${PLANNER_V2_TEXT.stepsOnce}`, "")).toBe(v2d(make()).prompt);
  });

  it.each(STORIES)("%s: the steps, the last step and a group's duration say it of their own field; every other field is planner v2d's", (_name, make, multiplayer) => {
    const ours = schemaText(v2e(make()).schema);
    const theirs = schemaText(v2d(make()).schema);
    const fields = PLANNER_V2_TEXT.stepsOnceFields;
    expect(ours).toContain(fields.steps.once);
    expect(ours).toContain(fields.finalStep.once);
    expect(ours.includes(fields.duration.once)).toBe(multiplayer);
    expect(theirs).toContain(fields.steps.before);
    expect(theirs).toContain(fields.finalStep.before);
    // Put the three descriptions back and the rest is planner v2d's schema
    const back = [fields.steps, fields.finalStep, fields.duration].reduce((text, { once, before }) => text.split(once).join(before), ours);
    expect(back).toBe(theirs);
  });

  it("words each field as the brief asks: each step once, the last step not repeated, the step count the duration", () => {
    const { steps, finalStep, duration } = PLANNER_V2_TEXT.stepsOnceFields;
    expect(steps.once).toBe(`${steps.before.replace(/ Every item in a list.*$/, "")} The last step is not among them: it is finalStep, and it comes only there. Every item in a list carries real content; a list never holds an empty or blank item.`);
    expect(finalStep.once).toBe("The last step, written only here and never one of the steps above again. Its three results are the milestones above.");
    expect(duration.once).toBe("Two, three or four beats, the same for every thread in this batch: each thread's steps plus its final step make exactly this many.");
  });

  it.each(STORIES)("%s: a reply assembles as planner v2d's", (_name, make, multiplayer) => {
    const story = make();
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
    expect(v2e(story).assemble(reply)).toEqual(v2d(story).assemble(reply));
  });

  it("keeps planner v2d's next-stage clause in the story's last thread: the next stage, never the climax clause", () => {
    // Turn 17 of 20: 3 turns left, the story's last thread, the guild outcome at 1 of 3
    const last = v2e(onePlayer(1, 17)).prompt;
    expect(last).toContain("This is the story's last thread: exactly 3 beats. It is the story's climax.");
    expect(last).toContain(`${GUILD}: 1 of 3 milestones; 2 still needed; this thread settles stage 2 of 3.`);
    expect(last).not.toContain(PLANNER_V2_TEXT.climaxClause(false));
    expect(last).not.toContain("settles stages");
  });

  it("is the eval's planV2e variant: the chapter planner above, the switch planner planner v2b's", () => {
    for (const make of [() => onePlayer(), twoPlayers, threePlayers]) {
      const story = make();
      const thread = requestFor("planV2e", { role: "thread", story });
      expect(requestText(thread)).toBe(v2e(story).prompt);
      expect(schemaText(thread.schema)).toBe(schemaText(v2e(story).schema));
      const sw = requestFor("planV2e", { role: "switch", story });
      expect(requestText(sw)).toBe(plannerV2SwitchRequest(story, false).prompt);
      expect(schemaText(sw.schema)).toBe(schemaText(requestFor("planV2b", { role: "switch", story }).schema));
    }
    expect(() => requestFor("planV2e", { role: "beat", story: onePlayer() })).toThrow("does not cover role beat");
  });

  it("leaves planner v2d and every earlier planner as they ran", () => {
    for (const make of [() => onePlayer(), twoPlayers, threePlayers]) {
      for (const variant of ["planV2", "planV2b", "planV2c", "planV2d"] as const) {
        expect(requestText(requestFor(variant, { role: "thread", story: make() }))).not.toContain(PLANNER_V2_TEXT.stepsOnce);
      }
    }
  });
});
