import fs from "fs";
import path from "path";
import type { BudgetOverride } from "./budget.js";
import type { BuildReport } from "./caseBuilder.js";
import type { EvalCase } from "./cases.js";
import type { ProbeReport } from "./probe.js";
import type { RatingKey } from "./ratingSets.js";
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
    readCases: (): EvalCase[] => {
      const index = JSON.parse(fs.readFileSync(at("cases", "cases.json"), "utf-8")) as { id: string }[];
      return index.map((entry) => JSON.parse(fs.readFileSync(at("cases", `${entry.id}.json`), "utf-8")) as EvalCase);
    },
    writeCases: (cases: EvalCase[], report: BuildReport) => {
      for (const evalCase of cases) writeJson(at("cases", `${evalCase.id}.json`), evalCase);
      writeJson(
        at("cases", "cases.json"),
        cases.map((c) => ({ id: c.id, role: c.role, tags: c.tags }))
      );
      writeJson(at("cases", "build-report.json"), report);
    },
    readProbe: (): ProbeReport | undefined =>
      fs.existsSync(at("probe.json")) ? (JSON.parse(fs.readFileSync(at("probe.json"), "utf-8")) as ProbeReport) : undefined,
    writeProbe: (report: ProbeReport) => writeJson(at("probe.json"), report),
    /** The parsed output of a usable call */
    loadOutput: (record: CallRecord): unknown =>
      record.outputFile ? (JSON.parse(fs.readFileSync(at(record.outputFile), "utf-8")) as { parsed?: unknown }).parsed : undefined,
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
  };
}

export type EvalFiles = ReturnType<typeof evalFiles>;
