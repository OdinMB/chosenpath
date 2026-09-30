import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Story } from "core/models/Story.js";
import type { StoryPhase, ThreadAnalysis } from "core/types/index.js";
import { CHOICE_RESULT_BUILT_CASES, CHOICE_RESULT_PLANNER_PROMPT_STATE, CHOICE_RESULT_PROMPT_STATE } from "../../../../src/evals/textModelEval/arms.js";
import { OPTIONS_CHECK, RESULTS_CHECK, type OptionsCalibrationItem, type ResultsCalibrationItem } from "../../../../src/evals/textModelEval/choiceResultJudge.js";
import {
  CHOICE_TURN_ARMS,
  CHOICE_PLAN_ARMS,
  calibrationTargets,
  plansToJudgeResults,
  proxyAgreement,
  replyVerdict,
  turnsToJudgeOptions,
} from "../../../../src/evals/textModelEval/choiceResultPrep.js";
import { PLAYTHROUGHS, playStory, type PlayRun } from "../../../../src/evals/textModelEval/playthroughs.js";
import { requestText } from "../../../../src/evals/textModelEval/variants.js";
import { slotsOf } from "../../../helpers/promptStories.js";
import { createMockMultiplayerStory, createMockStory } from "../../../helpers/testHelpers.js";
import { beatGeneration, beatSet, explorationOptions, switchAnalysis, thread, threadAnalysis } from "../../../helpers/textFixtures.js";
import { evalCase, record, tags } from "./fixtures.js";
import { DEFAULT, fakeCall, input } from "./playFixtures.js";

/*
 * The choice-result stage's judge mode (--judge-choice-results): the
 * calibration items' requests from the playthroughs' stored runs (replayed),
 * and the stage's own replies and plans as the game keeps them, one judge call
 * per exploring player's options and per plan; a reply passes when every
 * judged player's set passes.
 */

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** A fake single-player story whose chapter is an exploration thread: its plan's steps have three paths. */
async function exploringRun(): Promise<PlayRun> {
  const exploring = (length: number) => {
    const plan = threadAnalysis("exploration", length, 0, ["player1"]);
    return { ...plan, threads: [{ ...plan.threads[0], outcomeId: "player1_main", title: "The Ferry Talk", typeOfMilestone: "who talks" }] };
  };
  const { call } = fakeCall(1, {
    reply: (role, _nth, spec) => {
      if (role !== "thread") return DEFAULT;
      const allowed = /Allowed lengths for this thread: ([^.]+) beats/.exec(requestText(spec.request))?.[1].match(/\d+/g) ?? ["3"];
      return exploring(Math.max(...allowed.map(Number)));
    },
    chapterOptions: () => explorationOptions(),
  });
  const { run } = await playStory(PLAYTHROUGHS[0], input(1), call, { sample: 1 });
  return run;
}

describe("calibrationTargets: the hand-read items' judge requests from the stored runs", () => {
  it("builds each options item at an exploration step for its player, each results item on its chapter plan, at two samples; and says what it can't build", async () => {
    const run = await exploringRun();
    const options: OptionsCalibrationItem[] = [
      { id: "ok", story: "play-lemonade", turn: 3, slot: "player1", hand: true, note: "" },
      { id: "not-exploring", story: "play-lemonade", turn: 1, slot: "player1", hand: true, note: "" },
    ];
    const results: ResultsCalibrationItem[] = [
      { id: "plan", story: "play-lemonade", turn: 2, hand: false, note: "" },
      { id: "no-plan", story: "play-lemonade", turn: 3, hand: false, note: "" },
    ];
    const { targets, problems } = calibrationTargets([run], options, results);
    expect(targets.map((t) => [t.itemId, t.check, t.key, t.samples])).toEqual([
      ["ok", OPTIONS_CHECK, "cal-ok", 2],
      ["plan", RESULTS_CHECK, "cal-plan", 2],
    ]);
    expect(problems).toEqual([expect.stringMatching(/^not-exploring: /), expect.stringMatching(/^no-plan: /)]);
  });
});

function storyWith(players: number, phases: StoryPhase[]): Story {
  const base = (players > 1 ? createMockMultiplayerStory(players) : createMockStory()).getState();
  const history = Array.from({ length: 3 }, (_, i) => ({ ...beatGeneration({ text: `beat ${i}` }), choice: 0, resolution: "resolution1" as const }));
  return Story.create({ ...base, players: Object.fromEntries(Object.entries(base.players).map(([slot, p]) => [slot, { ...p, beatHistory: history }])), storyPhases: phases });
}

/** Two players: player1 explores, player2 takes a challenge, step 2 of 3. */
function mixedStep(): Story {
  const slots = slotsOf(2);
  const explore = { ...thread("exploration", 3, 2, ["player1"]), id: "explore" };
  explore.progression = explore.progression.map((s, i) => ({ ...s, resolution: i === 0 ? ("resolution1" as const) : null }));
  const fight = { ...thread("challenge", 3, 2, ["player2"]), id: "fight" };
  fight.progression = fight.progression.map((s, i) => ({ ...s, resolution: i === 0 ? ("favorable" as const) : null }));
  return storyWith(2, [switchAnalysis(slots, 1), { ...threadAnalysis("exploration", 3, 2, slots), threads: [explore, fight] }]);
}

describe("the stage's own replies and plans to judge", () => {
  const turnKey = CHOICE_TURN_ARMS[2];
  const planKey = CHOICE_PLAN_ARMS[1];

  it("judges every final usable turn of the turn arms under the stage's tag on its cases, one call per exploring player, read after the beat repairs", () => {
    const [id] = CHOICE_RESULT_BUILT_CASES.groups;
    const cases = [
      evalCase(id, "beat", { state: mixedStep().getState(), tags: tags({ players: 2, multiplayer: true, source: "round" }) }),
      evalCase("another-case", "beat", { state: mixedStep().getState(), tags: tags({ players: 2, multiplayer: true }) }),
    ];
    const reply = { ...beatSet(2), player1: beatGeneration({ options: explorationOptions() }), player2: beatGeneration({ options: explorationOptions() }) };
    const records = [
      record({ caseId: id, armKey: turnKey, promptState: CHOICE_RESULT_PROMPT_STATE, outputFile: "outputs/r1.json", baseline: false }),
      // Not final, another tag, another arm, another case: none judged
      record({ caseId: id, armKey: turnKey, promptState: CHOICE_RESULT_PROMPT_STATE, outputFile: "outputs/r2.json", final: false, baseline: false }),
      record({ caseId: id, armKey: turnKey, promptState: "adopted4", outputFile: "outputs/r3.json", baseline: false }),
      record({ caseId: id, armKey: "gpt-6-luna@medium/turnO", promptState: CHOICE_RESULT_PROMPT_STATE, outputFile: "outputs/r4.json", baseline: false }),
      record({ caseId: "another-case", armKey: turnKey, promptState: CHOICE_RESULT_PROMPT_STATE, outputFile: "outputs/r5.json", baseline: false }),
    ];
    const replies = turnsToJudgeOptions({ records, cases, load: () => reply });
    expect(replies.map((r) => [r.armKey, r.outputId, r.targets.map((t) => t.key)])).toEqual([[turnKey, "r1", ["r1-player1"]]]);
    expect(replies[0].targets[0].check).toBe(OPTIONS_CHECK);
  });

  it("judges every final usable plan of the planner arms under the planners' tag on the stage's plan cases, as the plan check keeps it", () => {
    const [id] = CHOICE_RESULT_BUILT_CASES.plans;
    const story = storyWith(1, [switchAnalysis(["player1"], 0)]);
    const cases = [evalCase(id, "thread", { state: story.getState(), tags: tags({ source: "round" }) })];
    const plan: ThreadAnalysis = { ...threadAnalysis("challenge", 3, 0), threads: [{ ...thread("challenge", 3, 0), outcomeId: "outcome_1" }] };
    const records = [
      record({ caseId: id, role: "thread", group: "thread", armKey: planKey, promptState: CHOICE_RESULT_PLANNER_PROMPT_STATE, outputFile: "outputs/p1.json", baseline: false }),
      record({ caseId: id, role: "thread", group: "thread", armKey: planKey, promptState: CHOICE_RESULT_PROMPT_STATE, outputFile: "outputs/p2.json", baseline: false }),
    ];
    const plans = plansToJudgeResults({ records, cases, load: () => plan });
    expect(plans.map((p) => [p.armKey, p.outputId, p.targets.map((t) => [t.check, t.key])])).toEqual([[planKey, "p1", [[RESULTS_CHECK, "p1"]]]]);
  });

  it("passes a reply only when every judged player's set passes; undecided while any is unanswered", () => {
    const reply = { armKey: "a", caseId: "c", sample: 1, outputId: "o", targets: [{ key: "o-player1" }, { key: "o-player2" }] } as never;
    expect(replyVerdict(reply, () => true)?.passes).toBe(true);
    expect(replyVerdict(reply, (key) => key !== "o-player2")?.passes).toBe(false);
    expect(replyVerdict(reply, (key) => (key === "o-player2" ? undefined : true))).toBeUndefined();
  });

  it("names the stage's arms: production's turn and the variant per player count, planner v2e and v2f", () => {
    expect(CHOICE_TURN_ARMS).toEqual(["gpt-6-luna@medium/adopted", "gpt-6-luna@medium/choiceResult", "gpt-6-luna@low/adopted", "gpt-6-luna@low/choiceResult"]);
    expect(CHOICE_PLAN_ARMS).toEqual(["gpt-6-luna@low/planV2e", "gpt-6-luna@low/planV2f"]);
  });
});

describe("proxyAgreement: the deterministic word check against the hand, on the options items", () => {
  it("reads each item's player alone and counts agreement per hand side, partial items apart", async () => {
    const run = await exploringRun();
    const items: OptionsCalibrationItem[] = [
      { id: "a", story: "play-lemonade", turn: 3, slot: "player1", hand: true, note: "" },
      { id: "b", story: "play-lemonade", turn: 3, slot: "player1", hand: false, note: "" },
      { id: "c", story: "play-lemonade", turn: 3, slot: "player1", hand: "partial", note: "" },
    ];
    const agreement = proxyAgreement([run], items);
    // The fake options share no words with the fake results, so the proxy reads no on every item
    expect(agreement).toMatchObject({ handYes: 1, yesAgree: 0, handNo: 1, noAgree: 1, partial: 1 });
  });
});
