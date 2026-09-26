import type { SetOfBeatGenerationSchema, SwitchAnalysis, ThreadAnalysis } from "core/types/index.js";
import { switchStep, threadStep } from "../../game/services/storyTextSteps.js";
import { caseStory, type EvalCase } from "./cases.js";
import { usable, type CallRecord } from "./runner.js";
import {
  aggregateProse,
  checkBeatSet,
  checkSetup,
  checkSwitch,
  checkThread,
  type CheckResult,
  type SetupShape,
} from "./textChecks.js";

/*
 * Applies the automatic checks to stored outputs: each usable call's parsed
 * output against the input it was written for (for a pipeline beat, the case
 * with that chain's own analysis applied). Also collects beat prose per arm.
 */

function beatInput(record: CallRecord, evalCase: EvalCase, records: CallRecord[], load: (r: CallRecord) => unknown) {
  if (record.group !== "pipeline") return caseStory(evalCase);
  const analysis = records.find((r) => r.jobKey === record.jobKey && r.step === 1 && r.final && usable(r));
  const parsed = analysis ? load(analysis) : undefined;
  const base = caseStory(evalCase, false);
  if (parsed === undefined) return base;
  return evalCase.role === "thread"
    ? threadStep.apply(base, parsed as ThreadAnalysis)
    : switchStep.apply(base, parsed as SwitchAnalysis);
}

export function checksForRecords(
  records: CallRecord[],
  cases: EvalCase[],
  load: (record: CallRecord) => unknown
): { checks: Map<string, CheckResult>; prose: Record<string, ReturnType<typeof aggregateProse>> } {
  const byId = new Map(cases.map((c) => [c.id, c]));
  const checks = new Map<string, CheckResult>();
  const texts = new Map<string, string[]>();
  for (const record of records) {
    const evalCase = byId.get(record.caseId);
    if (!record.final || !usable(record) || !record.outputFile || !evalCase) continue;
    const output = load(record);
    if (output === undefined) continue;
    let result: CheckResult | undefined;
    if (record.role === "setup" && evalCase.setup) {
      result = checkSetup(output as SetupShape, evalCase.setup);
    } else if (record.role === "beat") {
      const beats = output as SetOfBeatGenerationSchema;
      result = checkBeatSet(beats, beatInput(record, evalCase, records, load));
      const key = `${record.promptState}:${record.armKey}`;
      const own = Object.entries(beats)
        .filter(([slot]) => /^player\d+$/.test(slot))
        .map(([, beat]) => (beat && typeof beat === "object" && "text" in beat ? String(beat.text) : ""));
      texts.set(key, [...(texts.get(key) ?? []), ...own]);
    } else if (record.role === "switch") {
      result = checkSwitch(output as SwitchAnalysis, caseStory(evalCase, false));
    } else if (record.role === "thread") {
      result = checkThread(output as ThreadAnalysis);
    }
    if (result) checks.set(record.outputFile, result);
  }
  const prose = Object.fromEntries([...texts.entries()].map(([arm, list]) => [arm, aggregateProse(list)]));
  return { checks, prose };
}
