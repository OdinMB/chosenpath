import type { SetOfBeatGenerationSchema, SwitchAnalysis, ThreadAnalysis } from "core/types/index.js";
import { repairBeatReply } from "../../game/services/beatRepairs.js";
import { checkSwitchPlan, checkThreadPlan } from "../../game/services/planChecks.js";
import { caseStory, type EvalCase } from "./cases.js";
import { setupInputOf, storyAfterAnalysis } from "./jobPlan.js";
import { usable, type CallRecord } from "./runner.js";
import { checkSetupDesign, exampleBlock } from "./setupDesignChecks.js";
import {
  aggregateProse,
  checkBeatSet,
  checkSetup,
  checkSwitch,
  checkThread,
  isRepairCount,
  merge,
  withPadding,
  withRepairs,
  type CheckResult,
  type SetupShape,
} from "./textChecks.js";
import { triggerExpectation } from "./triggerCases.js";
import { checkBeatDesign, checkSwitchDesign, checkThreadDesign } from "./turnDesignChecks.js";

/*
 * Applies the automatic checks to stored outputs: each usable call's parsed
 * output against the input it was written for (for a pipeline beat, the case
 * with that chain's own analysis applied as the game keeps it), plus the
 * whitespace padding in its reply text. Beat, switch and thread replies are
 * checked as the game keeps them: after the beat repairs (beatRepairs.ts) or
 * the plan check (planChecks.ts), whose repairs are counted beside the checks
 * (withRepairs). The design checks of the two improvement documents
 * (setupDesignChecks.ts, turnDesignChecks.ts) run beside the rule checks; a
 * setup's example copies read the example block of the prompt it was sent,
 * when the prompt is stored. Also collects beat prose per arm.
 */

/** The story a beat record was written for: its case, or for a chain's beat the case with that chain's own analysis applied as the game keeps it. */
export function beatInput(record: CallRecord, evalCase: EvalCase, records: CallRecord[], load: (r: CallRecord) => unknown) {
  if (record.group !== "pipeline") return caseStory(evalCase);
  const analysis = records.find((r) => r.jobKey === record.jobKey && r.step === 1 && r.final && usable(r));
  const parsed = analysis ? load(analysis) : undefined;
  const base = caseStory(evalCase, false);
  if (parsed === undefined) return base;
  return storyAfterAnalysis(base, evalCase.role === "thread" ? "thread" : "switch", parsed as SwitchAnalysis | ThreadAnalysis);
}

/** A reply's text as JSON, or undefined where it is not stored or does not parse. */
function replyObject(content: string | undefined): unknown {
  if (content === undefined) return undefined;
  try {
    return JSON.parse(content) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Every repair and note kind a role's replies show, counted on each of that
 * role's replies (0 where absent). The report averages a count over the
 * replies that carry it, so without the zeros a kind would read per repaired
 * reply instead of per reply.
 */
function withEveryRepairKind(checks: Map<string, CheckResult>, roleOf: Map<string, string>): void {
  const kinds = new Map<string, Set<string>>();
  for (const [file, result] of checks) {
    const role = roleOf.get(file) ?? "";
    const seen = kinds.get(role) ?? new Set<string>();
    Object.keys(result.counts).filter(isRepairCount).forEach((name) => seen.add(name));
    kinds.set(role, seen);
  }
  for (const [file, result] of checks) {
    const zeros = Object.fromEntries([...(kinds.get(roleOf.get(file) ?? "") ?? [])].map((name) => [name, 0]));
    checks.set(file, { ...result, counts: { ...zeros, ...result.counts } });
  }
}

/**
 * `loadContent` gives a call's reply text, for the whitespace padding reading
 * (withPadding) on every role; `loadPrompt` the text it was sent, for a
 * setup's copies of its prompt's example (noExampleCopy), when stored.
 */
export function checksForRecords(
  records: CallRecord[],
  cases: EvalCase[],
  load: (record: CallRecord) => unknown,
  loadContent: (record: CallRecord) => string | undefined,
  loadPrompt: (record: CallRecord) => string | undefined = () => undefined
): {
  checks: Map<string, CheckResult>;
  /** The design checks alone (setupDesignChecks.ts, turnDesignChecks.ts), for their baselines */
  design: Map<string, CheckResult>;
  prose: Record<string, ReturnType<typeof aggregateProse>>;
} {
  const byId = new Map(cases.map((c) => [c.id, c]));
  const checks = new Map<string, CheckResult>();
  const design = new Map<string, CheckResult>();
  const roleOf = new Map<string, string>();
  const texts = new Map<string, string[]>();
  for (const record of records) {
    const evalCase = byId.get(record.caseId);
    if (!record.final || !usable(record) || !record.outputFile || !evalCase) continue;
    const output = load(record);
    if (output === undefined) continue;
    const content = loadContent(record);
    // The rule checks and, beside them, the design checks of the two improvement documents
    let rules: CheckResult | undefined;
    let designed: CheckResult | undefined;
    const setup = setupInputOf(evalCase);
    if (record.role === "setup" && setup) {
      const prompt = loadPrompt(record);
      // The case's kids tag rides along, for setup round 3's kids checks
      rules = checkSetup(output as SetupShape, setup);
      designed = checkSetupDesign(output, setup, prompt === undefined ? undefined : exampleBlock(prompt));
    } else if (record.role === "beat") {
      const story = beatInput(record, evalCase, records, load);
      const written = output as SetOfBeatGenerationSchema;
      const { reply, repairs } = repairBeatReply(story, written);
      rules = withRepairs(checkBeatSet(reply, story), repairs);
      designed = checkBeatDesign(story, reply, written);
      const key = `${record.promptState}:${record.armKey}`;
      const own = Object.entries(reply)
        .filter(([slot]) => /^player\d+$/.test(slot))
        .map(([, beat]) => (beat && typeof beat === "object" && "text" in beat ? String(beat.text) : ""));
      texts.set(key, [...(texts.get(key) ?? []), ...own]);
    } else if (record.role === "switch") {
      const story = caseStory(evalCase, false);
      const checked = checkSwitchPlan(story, output as SwitchAnalysis);
      rules = withRepairs(checkSwitch(checked.plan, story), checked.repairs, checked);
      designed = checkSwitchDesign(story, checked.plan, triggerExpectation(evalCase.id));
    } else if (record.role === "thread") {
      const story = caseStory(evalCase, false);
      const checked = checkThreadPlan(story, output as ThreadAnalysis);
      rules = withRepairs(checkThread(checked.plan), checked.repairs, checked);
      // The kind of milestone reads the reply as written, before the plan's fallback to the question
      designed = checkThreadDesign(story, checked.plan, triggerExpectation(evalCase.id), replyObject(content));
    }
    if (!rules || !designed) continue;
    const result = merge([rules, designed]);
    checks.set(record.outputFile, content === undefined ? result : withPadding(result, content));
    design.set(record.outputFile, designed);
    roleOf.set(record.outputFile, record.role);
  }
  withEveryRepairKind(checks, roleOf);
  const prose = Object.fromEntries([...texts.entries()].map(([arm, list]) => [arm, aggregateProse(list)]));
  return { checks, design, prose };
}
