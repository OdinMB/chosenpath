import { jest } from "@jest/globals";
import type { SetOfBeatGenerationSchema, SwitchAnalysis } from "core/types/index.js";
import { checksForRecords } from "../../../../src/evals/textModelEval/outputChecks.js";
import type { CallRecord } from "../../../../src/evals/textModelEval/runner.js";
import { switchAnalysisAfterThread, threadAnalysisAfterSwitch } from "../../../helpers/promptStories.js";
import { createMockStoryState } from "../../../helpers/testHelpers.js";
import { beatSet, outcome, stat, switchAnalysis, threadAnalysis } from "../../../helpers/textFixtures.js";
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
    expect(checks.get("outputs/a.json")?.checks).toEqual({ duration: true, stepPerBeat: true, noRepairs: true, planUsable: true });
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
