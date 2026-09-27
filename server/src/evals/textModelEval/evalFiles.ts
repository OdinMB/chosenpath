import fs from "fs";
import path from "path";
import type { BudgetOverride } from "./budget.js";
import type { BuildReport } from "./caseBuilder.js";
import type { EvalCase } from "./cases.js";
import { withChapterFrames, type ChapterFramesFile } from "./chapterFrames.js";
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
 */

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
    /** The frozen cases, each carrying its chapter's backfilled frame once chapter-frames.json exists */
    readCases: (): EvalCase[] => {
      const index = JSON.parse(fs.readFileSync(at("cases", "cases.json"), "utf-8")) as { id: string }[];
      const cases = index.map((entry) => JSON.parse(fs.readFileSync(at("cases", `${entry.id}.json`), "utf-8")) as EvalCase);
      const frames = at("chapter-frames.json");
      return fs.existsSync(frames) ? withChapterFrames(cases, JSON.parse(fs.readFileSync(frames, "utf-8")) as ChapterFramesFile) : cases;
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
     * build report. An id already frozen is replaced only when `replace` is set.
     */
    addCases: (cases: EvalCase[], report: RoundBuildReport, replace: boolean) => {
      const index = JSON.parse(fs.readFileSync(at("cases", "cases.json"), "utf-8")) as { id: string; role: string; tags: unknown }[];
      const ids = new Set(cases.map((c) => c.id));
      const clash = index.filter((entry) => ids.has(entry.id)).map((entry) => entry.id);
      if (clash.length && !replace) throw new Error(`Already frozen: ${clash.join(", ")}`);
      for (const evalCase of cases) writeJson(at("cases", `${evalCase.id}.json`), evalCase);
      writeJson(at("cases", "cases.json"), [...index.filter((entry) => !ids.has(entry.id)), ...cases.map((c) => ({ id: c.id, role: c.role, tags: c.tags }))]);
      writeJson(at("cases", "round-build-report.json"), report);
    },
    readPrepRecords: (): CallRecord[] => readJsonl<CallRecord>(at("prep-calls.jsonl")),
    appendPrepRecord: (record: CallRecord) => {
      fs.mkdirSync(outDir, { recursive: true });
      fs.appendFileSync(at("prep-calls.jsonl"), `${JSON.stringify(record)}\n`);
    },
    writeChapterFrames: (file: ChapterFramesFile) => writeJson(at("chapter-frames.json"), file),
    writeJudgeCalibration: (markdown: string, json: unknown) => {
      writeJson(at("judge-calibration.json"), json);
      fs.writeFileSync(at("judge-calibration.md"), markdown);
    },
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
    readKey: (pageId: string): RatingKey | undefined => {
      const dir = at("keys");
      const file = fs.existsSync(dir) ? fs.readdirSync(dir).find((f) => f.endsWith(`-${pageId}.json`)) : undefined;
      return file ? (JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8")) as RatingKey) : undefined;
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
