import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { withPlanProblem } from "../../../../src/game/services/planChecks.js";
import { pacedLengths } from "../../../../src/game/services/storyTextRounds/latePacing.js";
import { PLAYTHROUGHS, playStory, playthroughArm, type PlayCallSpec, type PlayRun } from "../../../../src/evals/textModelEval/playthroughs.js";
import { replayRun } from "../../../../src/evals/textModelEval/playthroughReplay.js";
import {
  continuationStart,
  latePacingComparisons,
  planLengthsOf,
  playOn,
  policiesAfter,
  readLatePacing,
  type LatePacingReading,
} from "../../../../src/evals/textModelEval/latePacingPlay.js";
import { requestFor, requestText } from "../../../../src/evals/textModelEval/variants.js";
import { fakeCall, input } from "./playFixtures.js";

/*
 * The late-pacing stage's short playthroughs (2026-10-01, fix 8 of the second
 * playthroughs' review): a stored story replayed to a chapter plan, then
 * played on with production's code or the variant's requests and length rule
 * to the story's last chapter plan, the player's policy where the stored run
 * left it; and the readings on them: each chapter's length against the
 * lengths that fit, whether the last chapter keeps a milestone to settle, the
 * aftermath chapters before it, what is left unfinished.
 */

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const promptOf = (spec: PlayCallSpec | undefined) => (spec ? requestText(spec.request) : undefined);

/** A stored single-player story of 13 turns played on the fakes: chapters as long as PACING allows. */
async function storedRun(maxTurns = 13): Promise<PlayRun> {
  const { call } = fakeCall(1);
  const { run } = await playStory(PLAYTHROUGHS[0], input(1, maxTurns), call, { sample: 1 });
  expect(run.complete).toBe(true);
  return run;
}

describe("policiesAfter: each seat's place in the player's rotation after the stored turns", () => {
  it("counts exploration picks, challenge picks and a lever taken last", async () => {
    const run = await storedRun();
    const before = run.turns.filter((t) => t.turn < 6);
    const picks = before.flatMap((t) => t.picks);
    const policy = policiesAfter(before).player1;
    expect(policy.explorationPicks).toBe(picks.filter((p) => p.rule === "exploration").length);
    expect(policy.challengePicks + picks.filter((p) => p.rule === "lever").length).toBe(picks.filter((p) => p.rule !== "exploration").length);
  });
});

describe("continuationStart and playOn", () => {
  it("continues a stored story from a chapter plan with production's requests, the state the stored turn saw", async () => {
    const run = await storedRun();
    const at = run.turns.find((t) => t.turn > 2 && t.plan?.kind === "chapter plan");
    expect(at).toBeDefined();
    const start = continuationStart(run, at!.turn);
    expect(start.story.getCurrentTurn()).toBe(at!.turn - 1);
    const { call, calls } = fakeCall(1);
    const { run: played } = await playOn(run, at!.turn, "adopted", call, 1);
    // Its first call is the stored turn's chapter plan request, byte for byte
    expect(promptOf(calls[0])).toBe(requestText(requestFor("adopted", { role: "thread", story: replayRun(run).find((r) => r.turn === at!.turn)!.beforePlan })));
    expect(calls[0].arm.key).toBe(playthroughArm("thread", 1).key);
    expect(played.turns[0].turn).toBe(at!.turn);
    expect(played.from).toEqual({ story: run.spec.id, turn: at!.turn, sample: run.sample, variant: "adopted", seedId: `${run.spec.id}-from${at!.turn}-s1` });
    // The same pick as the stored run on the same options
    expect(played.turns[0].picks.map((p) => p.option)).toEqual(at!.picks.map((p) => p.option));
    // It stops once the story's last chapter is planned, writing no beat for it
    expect(played.stopped).toBe("the last chapter's plan");
    const last = played.turns.at(-1)!;
    expect(last.plan?.kind).toBe("chapter plan");
    expect(last.plan?.pacing.lastChapter).toBe(true);
    expect(last.reply).toBeUndefined();
    expect(played.complete).toBe(false);
  });

  it("sends the variant's requests on the variant's arm, and holds its chapter plans to the variant's lengths", async () => {
    const run = await storedRun();
    const at = run.turns.find((t) => t.turn > 2 && t.plan?.kind === "chapter plan")!;
    // A planner that always writes 2 beats: the variant's rule asks again where it allows only longer chapters
    const { call, calls } = fakeCall(1, { length: 2 });
    const { run: played } = await playOn(run, at.turn, "latePacing", call, 1);
    const first = replayRun(run).find((r) => r.turn === at.turn)!.beforePlan;
    expect(promptOf(calls[0])).toBe(requestText(requestFor("latePacing", { role: "thread", story: first })));
    expect(calls.every((c) => c.arm.key.endsWith("/latePacing"))).toBe(true);
    const paced = pacedLengths(first);
    expect(played.turns[0].plan?.pacing.pacedLengths).toEqual(paced.lengths);
    if (!paced.lengths.includes(2)) {
      expect(promptOf(calls[1])).toBe(withPlanProblem(promptOf(calls[0])!, `the thread is 2 beats long, and with ${run.input.maxTurns - at.turn + 1} turns left, this one included, PACING allows ${paced.lengths.join(" or ")} beats`));
    }
  });

  it("replays a continuation turn by turn from where it started, its requests the ones it sent", async () => {
    const run = await storedRun();
    const at = run.turns.find((t) => t.turn > 2 && t.plan?.kind === "chapter plan")!;
    const { call, calls } = fakeCall(1);
    const { run: played } = await playOn(run, at.turn, "adopted", call, 1);
    const byId = new Map(calls.map((c) => [c.caseId, c]));
    const replayed = replayRun(played);
    expect(replayed.map((r) => r.turn)).toEqual(played.turns.filter((t) => t.reply).map((t) => t.turn));
    for (const r of replayed) {
      expect(requestText(requestFor("adopted", { role: "beat", story: r.before }))).toBe(promptOf(byId.get(r.played.calls[0]?.caseId)));
    }
  });
});

/** A reading with only what the comparisons read. */
const reading = (story: string, variant: "adopted" | "latePacing" | "latePacingB", sample: number, settles: boolean, unfinished = 0): LatePacingReading => ({
  story,
  sample,
  variant,
  from: 17,
  stopped: "the last chapter's plan",
  chapters: [],
  lastChapterSettles: settles,
  aftermathsBeforeLast: 0,
  leftUnfinished: unfinished,
  switches: [],
  waits: { chapterPlans: [], switchPlans: [], turns: [] },
  costUsd: 0,
});

describe("the fix-and-retest's runs", () => {
  it("hold their chapter plans to the variant's lengths", () => {
    expect(planLengthsOf("latePacingB")).toBeDefined();
    expect(planLengthsOf("latePacing")).toBeDefined();
    expect(planLengthsOf("adopted")).toBeUndefined();
  });

  it("read against production on the stories the retest played only", () => {
    const readings = [
      reading("play-avalon", "adopted", 1, false),
      reading("play-avalon", "adopted", 2, false),
      reading("play-food-trucks", "adopted", 1, false),
      reading("play-food-trucks", "adopted", 2, true),
      reading("play-food-trucks", "latePacingB", 1, true),
      reading("play-food-trucks", "latePacingB", 2, true, 1),
    ];
    const c = latePacingComparisons(readings, "latePacingB");
    const settles = c.rates.find((r) => r.reading === "the last chapter keeps a milestone to settle");
    expect([settles?.production, settles?.variant, settles?.noise]).toEqual([{ hits: 1, n: 2 }, { hits: 2, n: 2 }, 1]);
    expect([c.unfinished.production, c.unfinished.variant]).toEqual([0, 0.5]);
    // The variant's own reading is unchanged by the retest's runs
    expect(latePacingComparisons(readings).rates[0].variant).toEqual({ hits: 0, n: 0 });
  });
});

describe("readLatePacing: the readings on a short playthrough", () => {
  it("reads each chapter's length, the stage it settles, the last chapter's milestone, the aftermaths before it and what is left", async () => {
    const run = await storedRun();
    const at = run.turns.find((t) => t.turn > 2 && t.plan?.kind === "chapter plan")!;
    const { call } = fakeCall(1);
    const { run: played } = await playOn(run, at.turn, "adopted", call, 1);
    const reading = readLatePacing(played);
    expect(reading.chapters.map((c) => c.turn)).toEqual(played.turns.filter((t) => t.plan?.kind === "chapter plan").map((t) => t.turn));
    const last = reading.chapters.at(-1)!;
    expect(last.last).toBe(true);
    expect(reading.lastChapterSettles).toBe(last.threads.some((t) => t.stage !== undefined));
    expect(reading.aftermathsBeforeLast).toBe(reading.chapters.filter((c) => !c.last && c.threads.every((t) => t.stage === undefined)).length);
    expect(reading.leftUnfinished).toBeGreaterThanOrEqual(0);
    expect(reading.waits.chapterPlans.length).toBe(reading.chapters.length);
  });
});
