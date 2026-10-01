import { describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import type { Story } from "core/models/Story.js";
import { GameModes } from "core/types/index.js";
import { checkThreadPlan } from "../../../../src/game/services/planChecks.js";
import { switchStep, threadStep } from "../../../../src/game/services/storyTextSteps.js";
import { PLANNER_V2_TEXT, plannerV2SwitchRequest, plannerV2ThreadRequest } from "../../../../src/game/services/storyTextRounds/turnRound1Planners.js";
import { evalFiles } from "../../../../src/evals/textModelEval/evalFiles.js";
import { caseStory } from "../../../../src/evals/textModelEval/cases.js";
import {
  firstSwitchBeat,
  firstThreadAnalysis,
  laterSwitchBeat,
  switchAnalysisAfterThread,
  threadAnalysisAfterSwitch,
} from "../../../helpers/promptStories.js";
import {
  withContestLastStage,
  withContestSettled,
  withPacedLengths,
  withPacingStepB,
  withResultsAsOutcomes,
  withResultsAsOutcomesSchema,
  withSharedScenes,
  withSharedScenesSchema,
  withThreadsThatFit,
} from "../../../helpers/adoptedDeltas.js";
import { CONTEST_LAST_STAGE_LINE, PRIORITY_STEP } from "../../../../src/game/services/prompts/SwitchPromptService.js";
import { PACED_LENGTHS_TEXT, pacedLengths, threadPacingBlock } from "../../../../src/game/services/pacing.js";
import { LATE_PACING_TEXT, pacingCluesBase, pacingCluesRequest } from "../../../../src/game/services/storyTextRounds/latePacing.js";
import { FLAVOR_APPROACH_LINE, STEP_RESULTS_APPROACH } from "../../../../src/game/services/prompts/ThreadPromptService.js";
import { RESULTS_AS_OUTCOMES_TEXT } from "../../../../src/game/services/storyTextRounds/resultsAsOutcomes.js";
import { PARALLEL_THREADS_TEXT } from "../../../../src/game/services/storyTextRounds/parallelThreads.js";
import { requestFor, requestText } from "../../../../src/evals/textModelEval/variants.js";
import { endedChapter, flavorSwitch, outcome, roundStory, topicSwitch } from "../../../helpers/roundStories.js";

/*
 * Production's planners are planner v2 with two-sided contests as the eval
 * measured it (variant planV2b) for the switch, with, since the
 * parallel-threads stage of 2026-10-01, the measured line that offers a
 * contested outcome's last stage only as a grouped thread (parallelThreads'
 * switch planner, withContestLastStage), and, since 2026-09-30,
 * planner v2e for the chapter: planner v2c (planV2b with the nearer chapter
 * question and the planner's own kind of milestone, the owner's feedback of
 * 2026-09-28, with a topic switch's chosen direction narrowed to the
 * chapter's own situation as a flavor switch's question is, and the adopted
 * "without a number" in the chapter title's field) with the outcome's stages
 * (planner v2d, the owner's feedback of 2026-09-29; the story's last chapter
 * settles only its outcome's next stage, the owner's decision of 2026-09-30)
 * and the last step listed once (the doubled-step fix); and, since the
 * choice-result stage of 2026-09-30, planner v2f: the step results' two
 * rules (a challenge or contest result says how the attempt turns out, never
 * the player's approach or decision; an exploration result is the player's
 * own choice); and, since the challenge-results stage of 2026-10-01, the
 * measured edits of its variant resultsAsOutcomes (the approach chosen at the
 * switch and the one a step's question names are where a thread starts, and
 * no result restates it; the flavor pick's line; the milestone fields'
 * "naming who did what" narrowed to what was won or lost: withResultsAsOutcomes
 * and withResultsAsOutcomesSchema); and, since the scenes stage of that
 * evening, where a group's picks split the players, the measured shared-scenes
 * line and each thread's scene (sharedScenesB: withSharedScenes and
 * withSharedScenesSchema); and, since the contest-settled stage later that
 * evening, where a pick sets a contested outcome at its last stage, PACING's
 * deciding-thread line (contestSettled: withContestSettled). The same prompt and JSON schema, byte for byte, on every story
 * the tests build and on every frozen planning case; and a reply is assembled
 * into today's stored plan the way the eval assembles it.
 */

jest.spyOn(console, "log").mockImplementation(() => undefined);


const json = (schema: Parameters<typeof toJsonSchema>[0]) => JSON.stringify(toJsonSchema(schema));

const CASES_DIR = path.resolve("..", "DOCS", "2026-09-26_gpt6-text-eval");
const frozen = fs.existsSync(path.join(CASES_DIR, "cases", "cases.json")) ? evalFiles(CASES_DIR).readCases() : [];

const GUILD = "player1_guild_reform";
const ENCLAVE = "player1_enclave_trust";
const MIA = "player1_mia_friendship";

function singlePlayerAfterChapters(maxTurns: number, turns: number): Story {
  return roundStory({
    turns,
    maxTurns,
    playerOutcomes: {
      player1: [
        outcome(GUILD, { intendedNumberOfMilestones: 3, milestones: ["The Guild listens"] }),
        outcome(ENCLAVE, { intendedNumberOfMilestones: 2 }),
        outcome(MIA, { intendedNumberOfMilestones: 1 }),
      ],
    },
    phases: [
      topicSwitch([["Rally the enclave", GUILD], ["Visit Gruk", ENCLAVE], ["Walk with Mia", MIA]], 0),
      endedChapter(GUILD, 3, 1, "Sir Bram suspends the bounty"),
      topicSwitch([["Press the Guild", GUILD], ["Visit Gruk", ENCLAVE], ["Walk with Mia", MIA]], turns - 1),
    ],
    lastChoice: 1,
    switchAndThreadInstructions: ["When Public Support falls below 30%, the next thread is about winning back the crowd."],
  });
}

function contestStory(players: number, withFlavor: boolean): Story {
  const slots = Array.from({ length: players }, (_, i) => `player${i + 1}`);
  return roundStory({
    players,
    turns: 5,
    maxTurns: 20,
    gameMode: GameModes.Competitive,
    sharedOutcomes: [
      outcome("shared_voice", { possibleResolutions: { sideAWins: "The enclave speaks", mixed: "Shared", sideBWins: "The printers speak" }, resonance: "Scored by Enclave's Voice|Printers' Voice." }),
    ],
    playerOutcomes: Object.fromEntries(slots.map((slot) => [slot, [outcome(`${slot}_pride`)]])),
    phases: [
      topicSwitch([["Speak up", "shared_voice"], ["Stay home", `player1_pride`], ["Hide", "shared_voice"]], 0, slots),
      endedChapter("shared_voice", 3, 1, "The council hears the enclave", slots),
      withFlavor ? flavorSwitch("shared_voice", "Who wins the council?", 4, slots) : topicSwitch([["Speak up", "shared_voice"], ["Stay home", "player1_pride"], ["Hide", "shared_voice"]], 4, slots),
    ],
  });
}

/**
 * The switch planner after a chapter on a contested outcome: its milestone pending, so with `recorded` of 2 before it the
 * next thread settles the last stage (1 still needed) or the outcome is complete.
 */
function contestSwitchStory(players: number, recorded: number, gameMode: (typeof GameModes)[keyof typeof GameModes] = GameModes.Competitive): Story {
  const slots = Array.from({ length: players }, (_, i) => `player${i + 1}`);
  return roundStory({
    players,
    turns: 4,
    maxTurns: 20,
    gameMode,
    sharedOutcomes: [
      outcome("shared_voice", {
        possibleResolutions: { sideAWins: "The enclave speaks", mixed: "Shared", sideBWins: "The printers speak" },
        resonance: "Scored by Enclave's Voice|Printers' Voice.",
        milestones: Array.from({ length: recorded }, (_, k) => `Voice milestone ${k + 1}`),
      }),
    ],
    playerOutcomes: Object.fromEntries(slots.map((slot) => [slot, [outcome(`${slot}_pride`)]])),
    phases: [topicSwitch([["Speak up", "shared_voice"], ["Stay home", "player1_pride"], ["Hide", "shared_voice"]], 0, slots), endedChapter("shared_voice", 3, 1, "The council hears the enclave", slots)],
  });
}

const SWITCH_STORIES: [string, () => Story][] = [
  ...[1, 2, 3].flatMap((players): [string, () => Story][] => [
    [`the opening switch, ${players} players`, () => firstSwitchBeat(players)],
    [`a switch after a chapter, ${players} players`, () => switchAnalysisAfterThread(players)],
    [`a later switch beat's story, ${players} players`, () => laterSwitchBeat(players)],
  ]),
  ["a late 10-turn story", () => singlePlayerAfterChapters(10, 6)],
  ["the middle of a 25-turn story", () => singlePlayerAfterChapters(25, 8)],
  ...[2, 3].flatMap((players): [string, () => Story][] => [
    [`a ${players}-player contest whose next thread settles its last stage`, () => contestSwitchStory(players, 0)],
    [`a ${players}-player contest complete with the chapter that just ended`, () => contestSwitchStory(players, 1)],
  ]),
];

const THREAD_STORIES: [string, () => Story][] = [
  ...[1, 2, 3].flatMap((players): [string, () => Story][] => [
    [`the first chapter, ${players} players`, () => firstThreadAnalysis(players)],
    [`a chapter after a switch, ${players} players`, () => threadAnalysisAfterSwitch(players)],
  ]),
  ["a single player's pick in a 10-turn story", () => singlePlayerAfterChapters(10, 6)],
  ["a single player's pick in a 25-turn story", () => singlePlayerAfterChapters(25, 8)],
  ...[2, 3].flatMap((players): [string, () => Story][] => [
    [`a ${players}-player contest after a topic switch`, () => contestStory(players, false)],
    [`a ${players}-player contest after a flavor switch`, () => contestStory(players, true)],
  ]),
];

function expectSwitchLikeMeasured(story: Story) {
  const production = switchStep.request(story);
  const measured = plannerV2SwitchRequest(story, false);
  // Since the pacing-clues adoption (2026-10-01): step b as pacingCluesB measured it
  expect(production.prompt).toBe(withPacingStepB(withContestLastStage(withThreadsThatFit(measured.prompt, story), story)));
  expect(json(production.schema)).toBe(json(measured.schema));
}

/**
 * planV2e: planV2b with the nearer chapter question, the planner's own kind of milestone and the adopted title
 * ("without a number") (planV2c), the outcome's stages (planV2d) and the last step listed once.
 */
const planV2e = (story: Story) => plannerV2ThreadRequest(story, false, { twoSided: true, nearerQuestion: true, stages: true, stepsOnce: true });
/** planV2f: planV2e with the step results' two rules (the choice-result stage), production's chapter planner since. */
const planV2f = (story: Story) => plannerV2ThreadRequest(story, false, { twoSided: true, nearerQuestion: true, stages: true, stepsOnce: true, outcomeResults: true });

/** Planner v2f with the challenge-results stage's measured edits (2026-10-01): production's chapter planner since. */
function expectThreadLikeMeasured(story: Story) {
  const production = threadStep.request(story);
  const measured = planV2f(story);
  // Since the pacing-clues adoption (2026-10-01): the paced lengths where they narrow, as pacingCluesB measured them; since
  // the scenes adoption that evening, where a group's picks split the players, the shared-scenes line and each thread's
  // scene, as sharedScenesB measured them
  expect(production.prompt).toBe(withContestSettled(withSharedScenes(withPacedLengths(withResultsAsOutcomes(measured.prompt, story), story), story, "thread"), story));
  expect(json(production.schema)).toBe(withSharedScenesSchema(withResultsAsOutcomesSchema(json(measured.schema), story), story));
}

describe("the switch planner: planner v2 as measured", () => {
  it.each(SWITCH_STORIES)("%s", (_, build) => expectSwitchLikeMeasured(build()));

  it("differs from it only in the threads that fit near the end, where ÷ 4 undercounted them (2026-09-30)", () => {
    // Turn 23 of 25 (3 turns left): measured "about 0 more threads fit" beside "exactly 2 beats"; production counts the last chapter
    const late = singlePlayerAfterChapters(25, 22);
    const measured = plannerV2SwitchRequest(late, false).prompt;
    const production = switchStep.request(late).prompt;
    expect(measured).toContain("so about 0 more threads fit, the one this switch opens included.");
    expect(production).toContain("so about 1 more thread fits, the one this switch opens included.");
    expect(production).toContain("still needed for about 1 thread.");
    expect(production).toContain("it has exactly 2 beats.");
    expect(production).not.toBe(measured);
    // Everywhere the two counts agree, production is the measured request byte for byte (with step b as adopted since)
    const middle = singlePlayerAfterChapters(25, 8);
    expect(switchStep.request(middle).prompt).toBe(withPacingStepB(plannerV2SwitchRequest(middle, false).prompt));
  });

  it("offers a contested outcome's last stage only as a grouped thread, as the parallel-threads stage measured it (2026-10-01)", () => {
    for (const players of [2, 3]) {
      const story = contestSwitchStory(players, 0);
      const production = switchStep.request(story).prompt;
      expect(production.split(CONTEST_LAST_STAGE_LINE).length - 1).toBe(1);
      // The measured variant's switch planner, byte for byte, and planner v2b's around the line (step b as adopted since)
      expect(production).toBe(withPacingStepB(requestText(requestFor("parallelThreads", { role: "switch", story }))));
      expect(production.replace(CONTEST_LAST_STAGE_LINE, "")).toBe(withPacingStepB(withThreadsThatFit(plannerV2SwitchRequest(story, false).prompt, story)));
    }
    // Only where a contested outcome's next thread settles its last stage, in a contest game after the opening
    for (const story of [contestSwitchStory(2, 1), contestSwitchStory(2, 0, GameModes.Cooperative), firstSwitchBeat(2), switchAnalysisAfterThread(2)]) {
      expect(switchStep.request(story).prompt).not.toContain(CONTEST_LAST_STAGE_LINE);
    }
    expect(CONTEST_LAST_STAGE_LINE).toBe(PARALLEL_THREADS_TEXT.lastStageLine);
  });

  (frozen.length ? it : it.skip)("every frozen switch case", () => {
    const cases = frozen.filter((c) => c.role === "switch");
    expect(cases.length).toBeGreaterThan(20);
    for (const c of cases) expectSwitchLikeMeasured(caseStory(c, false));
  });
});

describe("the chapter planner: planner v2f (two-sided contests, the nearer chapter question, the outcome's stages, each step once, the step results' rules)", () => {
  it.each(THREAD_STORIES)("%s", (_, build) => expectThreadLikeMeasured(build()));

  it("is no longer planner v2e: the step results' two rules are what changed (the choice-result stage, 2026-09-30)", () => {
    for (const [, build] of THREAD_STORIES) {
      const story = build();
      const multiplayer = story.isMultiplayer();
      const { before, after } = PLANNER_V2_TEXT.stepResults(multiplayer);
      const measured = planV2f(story).prompt;
      expect(measured).toContain(after);
      expect(measured).not.toContain(before);
      expect(measured.replace(after, before)).toBe(planV2e(story).prompt);
    }
  });

  it("carries the challenge-results stage's measured edits, byte for byte the variant resultsAsOutcomes (2026-10-01)", () => {
    const { rule, approachLine, flavorAnchor, flavorLine } = RESULTS_AS_OUTCOMES_TEXT;
    for (const [, build] of THREAD_STORIES) {
      const story = build();
      const which = story.isMultiplayer() ? "group" : "single";
      const production = threadStep.request(story);
      const variant = requestFor("resultsAsOutcomes", { role: "thread", story });
      expect(production.prompt).toBe(requestText(variant));
      expect(json(production.schema)).toBe(json((variant as { schema: Parameters<typeof toJsonSchema>[0] }).schema));
      expect(production.prompt.split(`${rule[which]}${approachLine[which]}`).length - 1).toBe(1);
      expect(production.prompt).not.toContain(flavorAnchor);
      // The flavor pick's line where a flavor switch set the chapter's outcome, and nowhere else
      if (planV2f(story).prompt.includes(flavorAnchor)) expect(production.prompt).toContain(flavorLine);
    }
    // Production's own constants are the measured text
    expect(STEP_RESULTS_APPROACH).toEqual(approachLine);
    expect(FLAVOR_APPROACH_LINE).toBe(flavorLine);
  });

  it("is no longer planner v2c: the stage item, PACING's stage and the steps line are what changed (2026-09-30)", () => {
    const story = singlePlayerAfterChapters(25, 8);
    const production = threadStep.request(story).prompt;
    const v2c = plannerV2ThreadRequest(story, false, { twoSided: true, nearerQuestion: true }).prompt;
    expect(production).not.toBe(v2c);
    expect(production).toContain("3. The outcome's stages, and the one this thread settles.");
    expect(production).toContain("   - Each step comes once: a thread of n beats has n different steps, and the last one never repeats the step before it.");
    expect(production).toContain(`The outcome this thread pushes: ${ENCLAVE}: 0 of 2 milestones; 2 still needed; this thread settles stage 1 of 2.`);
    expect(json(threadStep.request(story).schema)).toContain('"outcomeStages"');
  });

  it("plans a saved story mid-story: the stage comes from the milestones so far, older chapters without stages read as they are", () => {
    // Turn 9 of 25, the guild outcome at 1 of 3 from a chapter planned before stages existed (no outcomeStages on it)
    const story = singlePlayerAfterChapters(25, 8);
    const before = story.getState().storyPhases.flatMap((p) => ("threads" in p ? p.threads : []));
    expect(before.every((t) => !("outcomeStages" in t))).toBe(true);
    const picked = roundStory({
      turns: 8,
      maxTurns: 25,
      playerOutcomes: {
        player1: [outcome(GUILD, { intendedNumberOfMilestones: 3, milestones: ["The Guild listens"] }), outcome(ENCLAVE, { intendedNumberOfMilestones: 2 }), outcome(MIA, { intendedNumberOfMilestones: 1 })],
      },
      phases: [
        topicSwitch([["Rally the enclave", GUILD], ["Visit Gruk", ENCLAVE], ["Walk with Mia", MIA]], 0),
        endedChapter(GUILD, 3, 1, "Sir Bram suspends the bounty"),
        topicSwitch([["Press the Guild", GUILD], ["Visit Gruk", ENCLAVE], ["Walk with Mia", MIA]], 7),
      ],
      lastChoice: 0,
    });
    const request = threadStep.request(picked);
    expect(request.prompt).toContain(`The outcome this thread pushes: ${GUILD}: 1 of 3 milestones; 2 still needed; this thread settles stage 2 of 3.`);
    const reply = {
      thread: {
        kind: "challenge",
        typeOfThread: "Negotiation",
        title: "The Guild Hall",
        outcomeStages: ["win a hearing", "get Sir Bram's signature", "reform the Guild"],
        question: "Will Sir Bram sign the petition before the Guild's vote?",
        typeOfMilestone: "whether Sir Bram's signature carries the Guild",
        possibleMilestones: { favorable: "Bram signs", mixed: "Bram stalls", unfavorable: "Bram refuses" },
        steps: [
          { title: "Knock", question: "Approach: How does Rikkit ask?", possibleResolutions: { favorable: "a", mixed: "b", unfavorable: "c" } },
          { title: "Push", question: "Leverage: How does Rikkit press?", possibleResolutions: { favorable: "a", mixed: "b", unfavorable: "c" } },
        ],
        finalStep: { title: "The vote", question: "How does Rikkit settle it?" },
        plan: "Rikkit stays in the hall.",
      },
    };
    const plan = request.assemble(reply);
    expect(plan).toEqual(planV2e(picked).assemble(reply));
    expect(plan.threads[0]).toMatchObject({ outcomeId: GUILD, outcomeStages: reply.thread.outcomeStages });
    const checked = checkThreadPlan(picked, plan, { lengths: true });
    expect(checked.problem).toBeUndefined();
    expect(checked.lengthProblem).toBeUndefined();
    // The story takes the plan, and the next planner call reads the story as before
    const next = threadStep.apply(picked, checkThreadPlan(picked, plan).plan);
    expect(() => switchStep.request(next)).not.toThrow();
  });

  (frozen.length ? it : it.skip)("every frozen chapter case", () => {
    const cases = frozen.filter((c) => c.role === "thread");
    expect(cases.length).toBeGreaterThan(15);
    for (const c of cases) expectThreadLikeMeasured(caseStory(c, false));
  });

  it("narrows a topic switch's chosen direction to the chapter's own situation instead of asking it as it stands (2026-09-28)", () => {
    // A deliberate change to planner v2c before it was measured, followed by production: a direction can restate its outcome
    for (const [, build] of THREAD_STORIES) {
      const schema = json(threadStep.request(build()).schema);
      expect(schema).toContain("After a topic switch: the chosen direction, narrowed to a question about this thread's own situation, even where the direction restates its outcome.");
      expect(schema).not.toContain("asked as a question");
    }
  });
});

/*
 * The pacing-clues stage's adoption (2026-10-01, fix 8's retest in whole short
 * playthroughs, its fix-and-retest pacingCluesB): the planners are
 * pacingCluesB's byte for byte, the switch planner's step b keeping a
 * milestone for the story's last thread and ranking a forced situation and the
 * story's instructions below a player's needed milestones, the chapter
 * planner's PACING line with the paced lengths where they narrow; the plan
 * checks read the same (planChecks.test.ts). The variant now builds on
 * production with both taken out (pacingCluesBase), which is production as it
 * stood when the stage measured it.
 */
describe("the planners since the pacing-clues adoption: pacingCluesB's byte for byte", () => {
  it.each(SWITCH_STORIES)("the switch planner, %s", (_, build) => {
    const story = build();
    expect(switchStep.request(story).prompt).toBe(pacingCluesRequest(story, "switch").prompt);
    expect(pacingCluesBase(story, "switch").prompt).toBe(withContestLastStage(withThreadsThatFit(plannerV2SwitchRequest(story, false).prompt, story), story));
  });

  it.each(THREAD_STORIES)("the chapter planner, %s", (_, build) => {
    const story = build();
    expect(threadStep.request(story).prompt).toBe(pacingCluesRequest(story, "thread").prompt);
    expect(pacingCluesBase(story, "thread").prompt).toBe(withResultsAsOutcomes(planV2f(story).prompt, story));
  });

  it("prints step b and the lengths' reasons from production's own constants, the measured text", () => {
    expect(PRIORITY_STEP).toBe(LATE_PACING_TEXT.stepBVariantB);
    expect(PACED_LENGTHS_TEXT).toEqual({ longer: LATE_PACING_TEXT.longer, shorter: LATE_PACING_TEXT.shorter });
    for (const [, build] of SWITCH_STORIES) {
      const prompt = switchStep.request(build()).prompt;
      if (prompt.includes("b) Priority.")) expect(prompt.split(PRIORITY_STEP)).toHaveLength(2);
      expect(prompt).not.toContain(LATE_PACING_TEXT.stepB);
    }
  });

  it("narrows a chapter's lengths where the milestones still needed fit some better: New Avalon's turn 17 (one still needed after it, 9 turns left)", () => {
    const story = roundStory({
      turns: 16,
      maxTurns: 25,
      playerOutcomes: { player1: [outcome(GUILD, { intendedNumberOfMilestones: 3, milestones: ["The Guild listens"] })] },
      phases: [endedChapter(GUILD, 3, 12, "The Guild listens"), topicSwitch([["Press the Guild", GUILD]], 15)],
      lastChoice: 0,
    });
    expect(pacedLengths(story)).toEqual({ lengths: [4], narrowed: "longer" });
    const prompt = threadStep.request(story).prompt;
    expect(prompt).toContain(`Allowed lengths for this thread: 4 beats. ${LATE_PACING_TEXT.longer}`);
    expect(prompt).toContain(threadPacingBlock(story));
    expect(prompt).toBe(withPacedLengths(withResultsAsOutcomes(planV2f(story).prompt, story), story));
    expect(prompt).not.toBe(withResultsAsOutcomes(planV2f(story).prompt, story));
  });

  (frozen.length ? it : it.skip)("every frozen switch and chapter case", () => {
    for (const c of frozen.filter((f) => f.role === "switch" || f.role === "thread")) {
      const story = caseStory(c, false);
      const role = c.role === "switch" ? "switch" : "thread";
      const production = role === "switch" ? switchStep.request(story).prompt : threadStep.request(story).prompt;
      expect([c.id, production === pacingCluesRequest(story, role).prompt]).toEqual([c.id, true]);
    }
  });
});

describe("a reply, assembled into today's stored plan as the eval assembled it", () => {
  it("a single player's topic switch: directions as 'text (id)' with their outcome beside them", () => {
    const story = singlePlayerAfterChapters(25, 8);
    const reply = {
      switch: {
        type: "topic",
        outcomeId: "",
        question: "",
        topicChoices: [
          { direction: "Meet Zelda at the print shop", outcomeId: ENCLAVE },
          { direction: "Bring the petition to Sir Bram", outcomeId: GUILD },
          { direction: "Walk the canal with Mia", outcomeId: MIA },
        ],
        title: "Three Doors",
      },
    };
    expect(switchStep.request(story).assemble(reply)).toEqual(plannerV2SwitchRequest(story, false).assemble(reply));
  });

  it("a single player's chapter: the pick sets its outcome, the last step's results are the milestones", () => {
    const story = singlePlayerAfterChapters(25, 8);
    const reply = {
      thread: {
        kind: "challenge",
        typeOfThread: "Negotiation",
        title: "The Enclave Gate",
        question: "Will Gruk open the gate?",
        typeOfMilestone: "whether Gruk lets the enclave's envoys in",
        possibleMilestones: { favorable: "Gruk opens it", mixed: "Gruk hesitates", unfavorable: "Gruk bars it" },
        steps: [{ title: "Knock", question: "Approach: How does Rikkit ask?", possibleResolutions: { favorable: "a", mixed: "b", unfavorable: "c" } }],
        finalStep: { title: "The ask", question: "How does Rikkit settle it?" },
        plan: "Rikkit stays at the gate.",
      },
    };
    const assembled = threadStep.request(story).assemble(reply);
    expect(assembled).toEqual(planV2e(story).assemble(reply));
    const [stored] = (assembled as unknown as { threads: { outcomeId: string; typeOfMilestone: string; question: string }[] }).threads;
    expect(stored).toMatchObject({ outcomeId: ENCLAVE, typeOfMilestone: "whether Gruk lets the enclave's envoys in", question: "Will Gruk open the gate?" });
  });

  it("a contest chapter: its outcome and sides as written, checked later by the plan check", () => {
    const story = contestStory(2, true);
    const reply = {
      grouping: "Both at the council.",
      duration: 2,
      threads: [
        {
          kind: "contest",
          outcomeId: "shared_voice",
          playersSideA: ["player1"],
          playersSideB: ["player2"],
          typeOfThread: "Debate",
          title: "The Council",
          question: "Who speaks?",
          possibleMilestones: { sideAWins: "A", mixed: "M", sideBWins: "B" },
          steps: [{ title: "Open", question: "How do both argue?", possibleResolutions: { sideAWins: "a", mixed: "m", sideBWins: "b" } }],
          finalStep: { title: "Vote", question: "How do both close?" },
          plan: "One hall.",
        },
      ],
    };
    expect(threadStep.request(story).assemble(reply)).toEqual(planV2e(story).assemble(reply));
  });
});
