import { jest } from "@jest/globals";
import { planJobs, type PlanOptions } from "../../../../src/evals/textModelEval/jobPlan.js";
import { createMockMultiplayerStory, createMockStoryState } from "../../../helpers/testHelpers.js";
import { evalCase, tags } from "./fixtures.js";

beforeEach(() => {
  // Beat prompts log that the mock stories have no story elements
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("planJobs: --no-mp-continuations", () => {
  const multiplayerState = createMockMultiplayerStory(2).getState();
  const multiplayer = { multiplayer: true, players: 2 };
  const cases = [
    evalCase("sp-continuation", "beat", { state: createMockStoryState() }),
    evalCase("mp-first", "beat", { state: multiplayerState, tags: tags({ ...multiplayer, firstBeat: true }) }),
    evalCase("mp-ending", "beat", { state: multiplayerState, tags: tags({ ...multiplayer, ending: true }) }),
    evalCase("mp-continuation", "beat", { state: multiplayerState, tags: tags(multiplayer) }),
  ];
  const options = (skip: boolean): PlanOptions => ({
    stage: "0",
    promptState: "postfix",
    roles: ["beat"],
    mode: "isolated",
    samples: 1,
    subset15: false,
    skipMultiplayerContinuations: skip,
    records: [],
    env: {},
  });

  it("drops multiplayer continuation beats and keeps first beats, endings and single-player beats", () => {
    expect(planJobs(cases, options(true)).map((j) => j.caseId)).toEqual(["sp-continuation", "mp-first", "mp-ending"]);
  });

  it("keeps every beat case without the flag", () => {
    expect(planJobs(cases, options(false)).map((j) => j.caseId)).toEqual(cases.map((c) => c.id));
  });
});
