import { jest } from "@jest/globals";
import { GameModes, type SetOfBeatGenerationSchema, type SwitchAnalysis } from "core/types/index.js";
import { checksForRecords } from "../../../../src/evals/textModelEval/outputChecks.js";
import type { CallRecord } from "../../../../src/evals/textModelEval/runner.js";
import { switchAnalysisAfterThread, threadAnalysisAfterSwitch, threadBeat } from "../../../helpers/promptStories.js";
import { createMockStoryState } from "../../../helpers/testHelpers.js";
import { beatGeneration, beatSet, challengeOptions, outcome, stat, switchAnalysis, threadAnalysis } from "../../../helpers/textFixtures.js";
import { evalCase, record } from "./fixtures.js";

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("checksForRecords", () => {
  const thread = threadAnalysis("challenge", 2, 0);
  const cases = [evalCase("t", "thread", { state: createMockStoryState() })];
  const records = [record({ role: "thread", group: "thread", caseId: "t", outputFile: "outputs/a.json" })];
  const padded = `{"duration":2,${" ".repeat(30_000)}"threads":[]}`;

  it("reads whitespace padding from each reply's text beside the role's own checks", () => {
    const { checks } = checksForRecords(records, cases, () => thread, () => padded);
    expect(checks.get("outputs/a.json")).toMatchObject({
      checks: { duration: true, stepPerBeat: true, noWhitespacePadding: false },
      counts: { threads: 1, longestWhitespaceRun: 30_000 },
    });
  });

  it("leaves the padding reading out when the reply text is not stored", () => {
    const { checks } = checksForRecords(records, cases, () => thread, () => undefined);
    expect(checks.get("outputs/a.json")?.checks).toMatchObject({ duration: true, stepPerBeat: true, noRepairs: true, planUsable: true });
    expect(checks.get("outputs/a.json")?.checks).not.toHaveProperty("noWhitespacePadding");
  });

  it("runs the design checks beside the rule checks on every role", () => {
    const { checks } = checksForRecords(records, cases, () => thread, () => undefined);
    // The plan's own length and kind (turn doc A.C); the story holds no outcomes, so no outcome check
    expect(checks.get("outputs/a.json")).toMatchObject({ checks: { oneKindPerChapter: true, lengthAllowed: true, noGroupInSinglePlayer: true }, counts: { chapterLength: 2 } });
    expect(checks.get("outputs/a.json")?.checks).not.toHaveProperty("threadOutcomeKnown");
  });

  it("reads a chapter plan's kind of milestone from the reply as written, where its text is stored", () => {
    const question = "Will Rikkit get the letters out of the manor?";
    const [first] = thread.threads;
    const stored = { ...thread, threads: [{ ...first, question, typeOfMilestone: question }] };
    const read = (content: string | undefined) => checksForRecords(records, cases, () => stored, () => content).checks.get("outputs/a.json")?.checks;
    // Planner v2c left the kind blank: the stored plan holds the question, the reply the blank
    expect(read(JSON.stringify({ thread: { question, typeOfMilestone: "" } }))?.milestoneKindConcrete).toBe(false);
    expect(read(JSON.stringify({ thread: { question, typeOfMilestone: "whether the letters prove the noble's hand" } }))?.milestoneKindConcrete).toBe(true);
    // Planner v2 writes none, and without the reply text the stored copy of the question is not read either
    expect(read(JSON.stringify({ thread: { question } }))).not.toHaveProperty("milestoneKindConcrete");
    expect(read(undefined)).not.toHaveProperty("milestoneKindConcrete");
    expect(read("not json")).not.toHaveProperty("milestoneKindConcrete");
  });

  it("reads a setup's example copies from the prompt it was sent, when stored", () => {
    const setupCase = evalCase("s", "setup", { setup: { premise: "A harbour.", playerCount: 1, gameMode: GameModes.SinglePlayer, maxTurns: 25 } });
    const setupRecord = record({ role: "setup", group: "setup", caseId: "s", outputFile: "outputs/s.json" });
    const copy = "the spirit appears faded and translucent to all the mortal NPCs nearby";
    const output = { guidelines: { typesOfThreads: [] }, sharedStats: [], playerStats: [], storyElements: [{ facts: [copy] }], player1: { outcomes: [] } };
    const prompt = `Intro.\nEXAMPLE STAT SETUPS\n- Below 30% causes ${copy}.\nCharacter Selection Instructions\n`;
    const read = (loadPrompt?: (r: CallRecord) => string | undefined) =>
      checksForRecords([setupRecord], [setupCase], () => output, () => undefined, loadPrompt).checks.get("outputs/s.json");
    expect(read(() => prompt)?.checks.noExampleCopy).toBe(false);
    expect(read()?.checks).not.toHaveProperty("noExampleCopy");
    expect(read()?.checks).toMatchObject({ singlePlayerOutcomes: false, startable: false });
  });

  it("reads a kids premise's stat budget from the case's kids tag, and only there", () => {
    const setup = { premise: "Forest friends in a storm.", playerCount: 1 as const, gameMode: GameModes.SinglePlayer, maxTurns: 25 };
    const output = { guidelines: { typesOfThreads: [] }, sharedStats: [], playerStats: [], storyElements: [], player1: { outcomes: [] } };
    const setupRecord = record({ role: "setup", group: "setup", caseId: "k", outputFile: "outputs/k.json" });
    const read = (kids: boolean) =>
      checksForRecords([setupRecord], [evalCase("k", "setup", { setup, tags: { ...evalCase("k", "setup").tags, kids } })], () => output, () => undefined).checks.get("outputs/k.json");
    expect(read(true)?.checks).toMatchObject({ kidsStatBudget: true, kidsPlainStatNames: true });
    expect(read(false)?.checks).not.toHaveProperty("kidsStatBudget");
  });
});

describe("checksForRecords: checks read what the game keeps", () => {
  const check = (role: CallRecord["role"], state: ReturnType<typeof createMockStoryState>, outputs: unknown[]) => {
    const records = outputs.map((_, i) => record({ role, group: role, caseId: "c", jobKey: `c|${i}`, outputFile: `outputs/${i}.json` }));
    const byFile = new Map(records.map((r, i) => [r.outputFile, outputs[i]]));
    const { checks } = checksForRecords(records, [evalCase("c", role, { state })], (r) => byFile.get(r.outputFile), () => undefined);
    return records.map((r) => checks.get(r.outputFile as string));
  };

  describe("beats", () => {
    const state = createMockStoryState({ playerStats: [stat("player_energy")] });
    const seatForm: SetOfBeatGenerationSchema = beatSet(1, {
      statChanges: [{ type: "statChange", group: "player1", stat: "player1_energy", change: "subtractNumber", value: 10 }],
    });

    it("passes knownChangeIds on a seat-form stat change the game keeps, and counts the repair", () => {
      const [result] = check("beat", state, [seatForm]);
      expect(result?.checks).toMatchObject({ knownChangeIds: true, noRepairs: false });
      expect(result?.counts["repair:statIdSeatForm"]).toBe(1);
    });

    it("reads a stat bonus in the doubled seat form as the game keeps it, and counts the repair", () => {
      const inThread = threadBeat(1).clone({ playerStats: [stat("player_energy")] }).getState();
      const [first, ...rest] = challengeOptions();
      const doubled = beatSet(1, {
        player1: beatGeneration({ options: [{ ...first, modifiersToSuccessRate: [{ statId: "player1_player_energy", reason: "fit", effect: 5 }] }, ...rest] }),
      });
      const [result] = check("beat", inThread, [doubled]);
      expect(result?.checks).toMatchObject({ knownIds: true, noRepairs: false });
      expect(result?.counts["repair:bonusStatIdSeatForm"]).toBe(1);
    });

    it("counts every kind a role's replies show on each of them, 0 where absent, so a mean reads per reply", () => {
      const [, clean] = check("beat", state, [seatForm, beatSet(1)]);
      expect(clean?.checks.noRepairs).toBe(true);
      expect(clean?.counts["repair:statIdSeatForm"]).toBe(0);
    });
  });

  describe("plans", () => {
    const ESCAPE = outcome("shared_escape");
    const directions = [
      "Search the flooded archive for the missing ledger (shared_escape)",
      "Follow the smugglers to their hidden cove at dusk (shared_escape)",
      "Bribe the lighthouse keeper for the tide tables (shared_escape)",
    ];

    it("checks a switch's directions after the game cuts the junk", () => {
      const state = switchAnalysisAfterThread(1, { sharedOutcomes: [ESCAPE] }).getState();
      const reply: SwitchAnalysis = switchAnalysis(["player1"]);
      reply.switches[0].topicChoices = [...directions, "relationshipToOtherSwitches״: "];
      const [result] = check("switch", state, [reply]);
      expect(result?.checks).toMatchObject({ topicChoices: true, planUsable: true, noRepairs: false });
      expect(result?.counts["repair:directionJunk"]).toBe(1);
    });

    it("fails planUsable on a plan the game would ask for again", () => {
      // The fixture's thread pushes outcome_1, which this story does not hold
      const state = threadAnalysisAfterSwitch(1, { sharedOutcomes: [ESCAPE] }).getState();
      const [result] = check("thread", state, [threadAnalysis("challenge", 2, 0)]);
      expect(result?.checks).toMatchObject({ planUsable: false, noRepairs: true });
    });
  });
});
