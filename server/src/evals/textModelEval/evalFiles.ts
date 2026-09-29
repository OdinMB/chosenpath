import fs from "fs";
import path from "path";
import type { BudgetOverride } from "./budget.js";
import type { BuildReport } from "./caseBuilder.js";
import type { EvalCase } from "./cases.js";
import { withChapterFrames, withNearerFrames, type ChapterFramesFile, type FrameSet } from "./chapterFrames.js";
import type { RoundBuildReport } from "./roundCases.js";
import type { FilterRecord } from "./filterCheck.js";
import type { ProbeReport } from "./probe.js";
import type { RatingKey } from "./ratingSets.js";
import { replyContent } from "./responseCheck.js";
import type { CallRecord } from "./runner.js";

/*
 * The output folder's layout (DOCS/2026-09-26_gpt6-text-eval/, gitignored):
 *   calls.jsonl            one record per attempt
 *   budget-overrides.jsonl every cap raised above the owner's target, with its reason
 *   probe.json             the capability probe
 *   cases/cases.json       the frozen case index (tags), cases/<id>.json the states
 *   outputs/<callId>.json  raw reply, parsed output, metrics
 *   prompts/<sha256>.txt   each prompt once
 *   rating/<set>-<page>.html, rating/preview/…  blind rating pages
 *   keys/<set>-<page>.json answer keys (never next to the pages)
 *   scores/<set>-<page>.md|json
 *   results.md
 *   filter-check.jsonl     one record per filter-check case and arm (--filter-check)
 *   filter-check.md        its report, rewritten after each run
 *   check-baselines.md|json  the new checks' baselines over the stored outputs (--check-baselines)
 *   cases/round-build-report.json  what --build-round-cases built and any problem
 *   prep-calls.jsonl       the rounds' own calls: chapter backfill and judged checks (prepCalls.ts)
 *   chapter-frames.json    the backfilled chapter questions and plans (--backfill-chapters)
 *   judge-calibration.md|json  the judged checks against the hand verdicts (--judge-calibration)
 *   judged-turns.md|json   the judged checks on a round's turns, reference against candidate (--judge-records)
 *   judged-groups.md|json  the group round's judged consistency check and its calibration (--judge-groups)
 *   judged-stages.md|json  the stage scoping's judged check, "the chapter stays within its stage", and its calibration (--judge-stages)
 *   setup-chain.md|json    setup round 3's setup-to-play chain (--setup-chain)
 */

/** Each frame set's file: the first backfill's, and the nearer backfill's (the owner's feedback of 2026-09-28). */
export const FRAME_FILES: Record<FrameSet, string> = { backfilled: "chapter-frames.json", nearer: "chapter-frames-nearer.json" };

/** judged-turns.md and .json per frame set: the reruns judge on the nearer frames beside the rounds' file. */
export const JUDGED_FILES: Record<FrameSet, string> = { backfilled: "judged-turns", nearer: "judged-turns-nearer" };

function readJsonl<T>(file: string): T[] {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf-8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function evalFiles(outDir: string) {
  const at = (...parts: string[]) => path.join(outDir, ...parts);
  return {
    outDir,
    at,
    readRecords: (): CallRecord[] => readJsonl<CallRecord>(at("calls.jsonl")),
    appendRecord: (record: CallRecord) => {
      fs.mkdirSync(outDir, { recursive: true });
      fs.appendFileSync(at("calls.jsonl"), `${JSON.stringify(record)}\n`);
    },
    appendOverride: (override: BudgetOverride) => {
      fs.mkdirSync(outDir, { recursive: true });
      fs.appendFileSync(at("budget-overrides.jsonl"), `${JSON.stringify(override)}\n`);
    },
    casesExist: () => fs.existsSync(at("cases", "cases.json")),
    /**
     * The frozen cases, each carrying its chapter's backfilled frame once
     * chapter-frames.json exists, and its nearer frame once
     * chapter-frames-nearer.json does
     */
    readCases: (): EvalCase[] => {
      const index = JSON.parse(fs.readFileSync(at("cases", "cases.json"), "utf-8")) as { id: string }[];
      const cases = index.map((entry) => JSON.parse(fs.readFileSync(at("cases", `${entry.id}.json`), "utf-8")) as EvalCase);
      const read = (file: string) => (fs.existsSync(at(file)) ? (JSON.parse(fs.readFileSync(at(file), "utf-8")) as ChapterFramesFile) : undefined);
      const first = read(FRAME_FILES.backfilled);
      const nearer = read(FRAME_FILES.nearer);
      const framed = first ? withChapterFrames(cases, first) : cases;
      return nearer ? withNearerFrames(framed, nearer) : framed;
    },
    writeCases: (cases: EvalCase[], report: BuildReport) => {
      for (const evalCase of cases) writeJson(at("cases", `${evalCase.id}.json`), evalCase);
      writeJson(
        at("cases", "cases.json"),
        cases.map((c) => ({ id: c.id, role: c.role, tags: c.tags }))
      );
      writeJson(at("cases", "build-report.json"), report);
    },
    /**
     * Freezes the round cases beside the others: their files, their index
     * entries after the existing ones (which stay as they are), and the round
     * build report, which a build without one (the stage scoping's case,
     * stageCases.ts) leaves as it was. An id already frozen is replaced only
     * when `replace` is set.
     */
    addCases: (cases: EvalCase[], report: RoundBuildReport | undefined, replace: boolean) => {
      const index = JSON.parse(fs.readFileSync(at("cases", "cases.json"), "utf-8")) as { id: string; role: string; tags: unknown }[];
      const ids = new Set(cases.map((c) => c.id));
      const clash = index.filter((entry) => ids.has(entry.id)).map((entry) => entry.id);
      if (clash.length && !replace) throw new Error(`Already frozen: ${clash.join(", ")}`);
      for (const evalCase of cases) writeJson(at("cases", `${evalCase.id}.json`), evalCase);
      writeJson(at("cases", "cases.json"), [...index.filter((entry) => !ids.has(entry.id)), ...cases.map((c) => ({ id: c.id, role: c.role, tags: c.tags }))]);
      if (report) writeJson(at("cases", "round-build-report.json"), report);
    },
    readPrepRecords: (): CallRecord[] => readJsonl<CallRecord>(at("prep-calls.jsonl")),
    appendPrepRecord: (record: CallRecord) => {
      fs.mkdirSync(outDir, { recursive: true });
      fs.appendFileSync(at("prep-calls.jsonl"), `${JSON.stringify(record)}\n`);
    },
    writeChapterFrames: (file: ChapterFramesFile, set: FrameSet = "backfilled") => writeJson(at(FRAME_FILES[set]), file),
    writeJudgeCalibration: (markdown: string, json: unknown) => {
      writeJson(at("judge-calibration.json"), json);
      fs.writeFileSync(at("judge-calibration.md"), markdown);
    },
    /** The judged checks on a round's turns (--judge-records), on the first frames or (the reruns) the nearer ones */
    writeJudgedTurns: (markdown: string, json: unknown, set: FrameSet = "backfilled") => {
      writeJson(at(`${JUDGED_FILES[set]}.json`), json);
      fs.writeFileSync(at(`${JUDGED_FILES[set]}.md`), markdown);
    },
    /** The group round's judged check (--judge-groups, groupJudge.ts) */
    writeJudgedGroups: (markdown: string, json: unknown) => {
      writeJson(at("judged-groups.json"), json);
      fs.writeFileSync(at("judged-groups.md"), markdown);
    },
    /** The stage scoping's judged check (--judge-stages, stageJudge.ts) */
    writeJudgedStages: (markdown: string, json: unknown) => {
      writeJson(at("judged-stages.json"), json);
      fs.writeFileSync(at("judged-stages.md"), markdown);
    },
    /** Setup round 3's setup-to-play chain (--setup-chain) */
    writeSetupChain: (markdown: string, json: unknown) => {
      writeJson(at("setup-chain.json"), json);
      fs.writeFileSync(at("setup-chain.md"), markdown);
    },
    /** The chain file, or another one to merge (a path), when it exists */
    readSetupChain: (file?: string): unknown => {
      const chain = file ?? at("setup-chain.json");
      return fs.existsSync(chain) ? JSON.parse(fs.readFileSync(chain, "utf-8")) : undefined;
    },
    /** The parsed reply an output file holds (outputs/<callId>.json, as a record names it) */
    loadOutputFile: (outputFile: string): unknown => (JSON.parse(fs.readFileSync(at(outputFile), "utf-8")) as { parsed?: unknown }).parsed,
    readProbe: (): ProbeReport | undefined =>
      fs.existsSync(at("probe.json")) ? (JSON.parse(fs.readFileSync(at("probe.json"), "utf-8")) as ProbeReport) : undefined,
    writeProbe: (report: ProbeReport) => writeJson(at("probe.json"), report),
    /** The parsed output of a usable call */
    loadOutput: (record: CallRecord): unknown =>
      record.outputFile ? (JSON.parse(fs.readFileSync(at(record.outputFile), "utf-8")) as { parsed?: unknown }).parsed : undefined,
    /** The call's reply text as the API sent it, whitespace between tokens included */
    loadReplyContent: (record: CallRecord): string | undefined =>
      record.outputFile
        ? replyContent((JSON.parse(fs.readFileSync(at(record.outputFile), "utf-8")) as { rawBody?: string }).rawBody)
        : undefined,
    /** The text the call was sent (prompts/<promptHash>.txt), when stored */
    loadPrompt: (record: CallRecord): string | undefined => {
      const file = record.promptHash ? at("prompts", `${record.promptHash}.txt`) : undefined;
      return file && fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : undefined;
    },
    writeRatingPage: (fileName: string, html: string, preview: boolean) => {
      const dir = preview ? at("rating", "preview") : at("rating");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, fileName), html);
      return path.join(dir, fileName);
    },
    writeKey: (key: RatingKey) => writeJson(at("keys", key.keyFile), key),
    /**
     * A page's answer key: in keys/, else in keys/superseded/, where a
     * replaced page's key goes, so an export from a superseded page still
     * scores (turns-r1.html, replaced by turns-r1b.html on 2026-09-28)
     */
    readKey: (pageId: string): RatingKey | undefined => {
      for (const dir of [at("keys"), at("keys", "superseded")]) {
        const file = fs.existsSync(dir) ? fs.readdirSync(dir).find((f) => f.endsWith(`-${pageId}.json`)) : undefined;
        if (file) return JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8")) as RatingKey;
      }
      return undefined;
    },
    writeScores: (name: string, markdown: string, json: unknown) => {
      writeJson(at("scores", `${name}.json`), json);
      fs.writeFileSync(at("scores", `${name}.md`), markdown);
    },
    writeResults: (markdown: string) => {
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(at("results.md"), markdown);
    },
    /** The new checks' baselines over the stored outputs (--check-baselines) */
    writeCheckBaselines: (markdown: string, json: unknown) => {
      writeJson(at("check-baselines.json"), json);
      fs.writeFileSync(at("check-baselines.md"), markdown);
    },
    readFilterRecords: (): FilterRecord[] => readJsonl<FilterRecord>(at("filter-check.jsonl")),
    appendFilterRecord: (record: FilterRecord) => {
      fs.mkdirSync(outDir, { recursive: true });
      fs.appendFileSync(at("filter-check.jsonl"), `${JSON.stringify(record)}\n`);
    },
    writeFilterReport: (markdown: string) => {
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(at("filter-check.md"), markdown);
    },
  };
}

export type EvalFiles = ReturnType<typeof evalFiles>;
