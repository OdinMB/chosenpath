import { checksForRecords } from "../../../../src/evals/textModelEval/outputChecks.js";
import { threadAnalysis } from "../../../helpers/textFixtures.js";
import { evalCase, record } from "./fixtures.js";

describe("checksForRecords", () => {
  const thread = threadAnalysis("challenge", 2, 0);
  const cases = [evalCase("t", "thread")];
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
    expect(checks.get("outputs/a.json")?.checks).toEqual({ duration: true, stepPerBeat: true });
  });
});
