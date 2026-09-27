import { isResultRecord, percentile } from "./armStats.js";
import type { EvalRole } from "./arms.js";
import type { CaseTags, EvalCase } from "./cases.js";
import type { RatingKey } from "./ratingSets.js";
import { readRanks, type ExportedRatings } from "./ratingScore.js";
import { usable, type CallRecord } from "./runner.js";
import type { CheckResult } from "./textChecks.js";

/*
 * The baselines of the improvement documents' new automatic checks over the
 * stored outputs (--check-baselines, no API calls): per role and arm each
 * check's pass rate, each count's mean and each pooled share, with the
 * two-sample noise (the arm's sample 1 against its sample 2 on the cases
 * where it has both); what separates the owner's rank-1 picks on a rated
 * page; the waits per turn kind (turn doc A.C: a switch turn is the switch
 * planner plus the switch turn, a chapter opening the chapter planner plus
 * its first step, the rest the turn alone); and how many stored
 * production-form requests today's code still builds byte for byte, so the
 * stored references can stand in for today's form. Readings only.
 */

export type Reading = { rate: number; n: number; noise?: number };
export type CountReading = { mean: number; n: number; noise?: number };

export type ArmBaseline = {
  /** promptState:armKey, with "(chain)" for a pipeline chain's call */
  arm: string;
  replies: number;
  checks: Record<string, Reading>;
  counts: Record<string, CountReading>;
  ratios: Record<string, Reading>;
};

export type Separation = {
  name: string;
  /** Rank-1 options that pass, of those the check applies to */
  rank1: { pass: number; n: number };
  others: { pass: number; n: number };
  /** Items where a rank-1 option passes and a lower one fails */
  agree: number;
  /** Items where a rank-1 option fails and a lower one passes */
  disagree: number;
  /** Items whose options differ on the check */
  split: number;
};

export type CountSeparation = { name: string; rank1Mean: number; othersMean: number; higher: number; lower: number };

export type PageSeparation = { pageId: string; items: number; checks: Separation[]; counts: CountSeparation[] };

export type TurnKindWait = { arm: string; kind: string; n: number; p95: number };

export type ReferenceCurrency = { role: EvalRole; promptState: string; cases: number; identical: number };

export type BaselineReport = {
  generatedAt: string;
  replies: number;
  roles: { role: EvalRole; arms: ArmBaseline[] }[];
  separation: PageSeparation[];
  turnKinds: { beats: TurnKindWait[]; planners: TurnKindWait[]; chains: TurnKindWait[] };
  references: ReferenceCurrency[];
  readouts: { arm: string; outputFile: string; hit: string }[];
};

export type BaselineInput = {
  records: CallRecord[];
  cases: EvalCase[];
  /** The design checks per output file (checksForRecords' design map) */
  design: Map<string, CheckResult>;
  /** Every check per output file, the rule checks included (the separation reading reads both) */
  all: Map<string, CheckResult>;
  /** Rated pages: an answer key and its export */
  rated?: { key: RatingKey; exported: ExportedRatings }[];
  /** Today's production-form request hash for a case (sha256 of its text), for the reference reading */
  todaysPromptHash?: (evalCase: EvalCase) => string | undefined;
  /** Stat readouts found on stored beats, for hand-reading the check's false alarms */
  readouts?: BaselineReport["readouts"];
  generatedAt: Date;
};

/** Pooled shares: numerator count over denominator count, summed over the replies. */
export const RATIOS: { name: string; numerator: string; denominator: string }[] = [
  { name: "outcomeNamesElementShare", numerator: "outcomesNamingElement", denominator: "outcomes" },
  { name: "spendableShare", numerator: "spendablePlayerStats", denominator: "visiblePlayerStats" },
  { name: "effectNumbersInRangeShare", numerator: "effectNumbersInRange", denominator: "effectNumbers" },
  { name: "threadTypeShapeShare", numerator: "threadTypesShaped", denominator: "threadTypes" },
  { name: "youParagraphShare", numerator: "youParagraphs", denominator: "proseParagraphs" },
  { name: "waitingCloseShare", numerator: "waitingClose", denominator: "beatTexts" },
  { name: "pointingAtChoiceShare", numerator: "pointingAtChoice", denominator: "beatTexts" },
  { name: "sameFirstWordShare", numerator: "sameFirstWordSets", denominator: "optionSets" },
  { name: "sameOddsShare", numerator: "sameOddsSets", denominator: "challengeSets" },
  { name: "oddsWithin5Share", numerator: "oddsWithin5Sets", denominator: "challengeSets" },
  { name: "leverShare", numerator: "leverSets", denominator: "challengeSets" },
  { name: "rewardShareOfLevers", numerator: "rewardSets", denominator: "leverSets" },
  { name: "negativeBaseOnBonusShare", numerator: "bonusOptionsNegativeBase", denominator: "bonusOptions" },
];

const ROLES: EvalRole[] = ["setup", "beat", "switch", "thread"];

const armLabel = (r: CallRecord) => `${r.promptState}:${r.group === "pipeline" ? `${r.callArmKey} (chain)` : r.armKey}`;

function checkReadings(records: CallRecord[], results: Map<string, CheckResult>): Record<string, { pass: number; n: number }> {
  const out: Record<string, { pass: number; n: number }> = {};
  for (const r of records) {
    for (const [name, ok] of Object.entries(results.get(r.outputFile as string)?.checks ?? {})) {
      out[name] ??= { pass: 0, n: 0 };
      out[name].n++;
      if (ok) out[name].pass++;
    }
  }
  return out;
}

function countReadings(records: CallRecord[], results: Map<string, CheckResult>): Record<string, { total: number; n: number }> {
  const out: Record<string, { total: number; n: number }> = {};
  for (const r of records) {
    for (const [name, value] of Object.entries(results.get(r.outputFile as string)?.counts ?? {})) {
      out[name] ??= { total: 0, n: 0 };
      out[name].n++;
      out[name].total += value;
    }
  }
  return out;
}

function ratioReadings(counts: Record<string, { total: number; n: number }>): Record<string, { rate: number; n: number }> {
  const out: Record<string, { rate: number; n: number }> = {};
  for (const { name, numerator, denominator } of RATIOS) {
    const [num, den] = [counts[numerator], counts[denominator]];
    if (num && den && den.total > 0) out[name] = { rate: num.total / den.total, n: den.n };
  }
  return out;
}

/** One arm's readings, with the noise from its samples 1 and 2 on the cases where it has both. */
function armBaseline(arm: string, records: CallRecord[], results: Map<string, CheckResult>): ArmBaseline {
  const casesWith = (sample: number) => new Set(records.filter((r) => r.sample === sample).map((r) => r.caseId));
  const [one, two] = [casesWith(1), casesWith(2)];
  const matched = (sample: number) => records.filter((r) => r.sample === sample && one.has(r.caseId) && two.has(r.caseId));
  const [s1, s2] = [matched(1), matched(2)];
  const hasNoise = s1.length > 0 && s2.length > 0;

  const checks = checkReadings(records, results);
  const [c1, c2] = [checkReadings(s1, results), checkReadings(s2, results)];
  const counts = countReadings(records, results);
  const [n1, n2] = [countReadings(s1, results), countReadings(s2, results)];
  const ratios = ratioReadings(counts);
  const [r1, r2] = [ratioReadings(n1), ratioReadings(n2)];
  const rate = (p: { pass: number; n: number }) => p.pass / p.n;
  const noisy = <T extends object>(value: T, a: number | undefined, b: number | undefined): T & { noise?: number } =>
    hasNoise && a !== undefined && b !== undefined ? { ...value, noise: Math.abs(a - b) } : value;

  return {
    arm,
    replies: records.length,
    checks: Object.fromEntries(
      Object.entries(checks).map(([name, p]) => [name, noisy({ rate: rate(p), n: p.n }, c1[name] && rate(c1[name]), c2[name] && rate(c2[name]))])
    ),
    counts: Object.fromEntries(
      Object.entries(counts).map(([name, c]) => [
        name,
        noisy({ mean: c.total / c.n, n: c.n }, n1[name] && n1[name].total / n1[name].n, n2[name] && n2[name].total / n2[name].n),
      ])
    ),
    ratios: Object.fromEntries(Object.entries(ratios).map(([name, value]) => [name, noisy(value, r1[name]?.rate, r2[name]?.rate)])),
  };
}

function roleBaselines(records: CallRecord[], results: Map<string, CheckResult>): BaselineReport["roles"] {
  return ROLES.map((role) => {
    const byArm = new Map<string, CallRecord[]>();
    for (const r of records.filter((each) => each.role === role)) byArm.set(armLabel(r), [...(byArm.get(armLabel(r)) ?? []), r]);
    const arms = [...byArm.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([arm, list]) => armBaseline(arm, list, results));
    return { role, arms };
  }).filter((entry) => entry.arms.length > 0);
}

/** The record behind a rated option: its case, arm, prompt state and sample. */
function recordFor(records: CallRecord[], group: "setup" | "beat", ref: { caseId: string; armKey: string; promptState: string; sample: number }) {
  return records.find(
    (r) => r.caseId === ref.caseId && r.armKey === ref.armKey && r.promptState === ref.promptState && r.sample === ref.sample && r.group === group && r.jobFinal && usable(r)
  );
}

/** Per check and count: rank-1 options against the rest, and the items whose options it splits. */
function pageSeparation(key: RatingKey, exported: ExportedRatings, records: CallRecord[], all: Map<string, CheckResult>): PageSeparation {
  const group = key.setId === "text-setup" ? "setup" : "beat";
  const items = Object.entries(key.items)
    .filter(([, item]) => !item.control && !item.repeatOf)
    .map(([itemId, item]) =>
      readRanks(item, exported.ratings[itemId]).flatMap((option) => {
        const found = recordFor(records, group, option.ref);
        const result = found?.outputFile ? all.get(found.outputFile) : undefined;
        return option.rank === undefined || !result ? [] : [{ first: option.rank === 1, result }];
      })
    )
    .filter((options) => options.some((o) => o.first) && options.some((o) => !o.first));

  const names = [...new Set(items.flat().flatMap((o) => Object.keys(o.result.checks)))].sort();
  const checks = names.map((name): Separation => {
    const reading: Separation = { name, rank1: { pass: 0, n: 0 }, others: { pass: 0, n: 0 }, agree: 0, disagree: 0, split: 0 };
    for (const options of items) {
      const firsts = options.filter((o) => o.first && name in o.result.checks).map((o) => o.result.checks[name]);
      const rest = options.filter((o) => !o.first && name in o.result.checks).map((o) => o.result.checks[name]);
      reading.rank1.n += firsts.length;
      reading.rank1.pass += firsts.filter(Boolean).length;
      reading.others.n += rest.length;
      reading.others.pass += rest.filter(Boolean).length;
      if (new Set([...firsts, ...rest]).size > 1) reading.split++;
      if (firsts.some(Boolean) && rest.some((ok) => !ok)) reading.agree++;
      if (firsts.some((ok) => !ok) && rest.some(Boolean)) reading.disagree++;
    }
    return reading;
  });

  const countNames = [...new Set(items.flat().flatMap((o) => Object.keys(o.result.counts)))].filter((name) => !name.includes(":")).sort();
  const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
  const counts = countNames.map((name): CountSeparation => {
    const valueOf = (o: { result: CheckResult }) => o.result.counts[name];
    const firsts = items.flatMap((options) => options.filter((o) => o.first && name in o.result.counts).map(valueOf));
    const rest = items.flatMap((options) => options.filter((o) => !o.first && name in o.result.counts).map(valueOf));
    let higher = 0;
    let lower = 0;
    for (const options of items) {
      const [a, b] = [options.filter((o) => o.first && name in o.result.counts), options.filter((o) => !o.first && name in o.result.counts)];
      if (!a.length || !b.length) continue;
      const diff = mean(a.map(valueOf)) - mean(b.map(valueOf));
      if (diff > 0) higher++;
      if (diff < 0) lower++;
    }
    return { name, rank1Mean: mean(firsts), othersMean: mean(rest), higher, lower };
  });
  return { pageId: key.pageId, items: items.length, checks, counts };
}

/** The turn kind a beat case is (turn doc A.C). */
function beatKind(evalCase: EvalCase): string {
  if (evalCase.tags.firstBeat) return "first turn";
  if (evalCase.tags.ending) return "ending";
  if (evalCase.fixedAnalysis?.kind === "switch") return "switch turn after a chapter";
  if (evalCase.fixedAnalysis?.kind === "thread") return "chapter opening";
  return "chapter step";
}

function turnKindWaits(records: CallRecord[], caseById: Map<string, EvalCase>): BaselineReport["turnKinds"] {
  const bucket = (list: { arm: string; kind: string; seconds: number }[]): TurnKindWait[] => {
    const groups = new Map<string, number[]>();
    for (const each of list) groups.set(`${each.arm}\u0000${each.kind}`, [...(groups.get(`${each.arm}\u0000${each.kind}`) ?? []), each.seconds]);
    return [...groups.entries()]
      .map(([k, values]) => {
        const [arm, kind] = k.split("\u0000");
        return { arm, kind, n: values.length, p95: percentile(values, 95) ?? 0 };
      })
      .sort((a, b) => a.arm.localeCompare(b.arm) || a.kind.localeCompare(b.kind));
  };
  const singlePlayer = records.filter((r) => r.players === 1);
  const beats = singlePlayer
    .filter((r) => r.role === "beat" && r.group === "beat")
    .flatMap((r) => {
      const evalCase = caseById.get(r.caseId);
      return evalCase ? [{ arm: `${r.promptState}:${r.armKey}`, kind: beatKind(evalCase), seconds: r.latencyMs / 1000 }] : [];
    });
  const planners = singlePlayer
    .filter((r) => (r.role === "switch" || r.role === "thread") && r.group === r.role)
    .map((r) => ({ arm: `${r.promptState}:${r.armKey}`, kind: `${r.role} plan`, seconds: r.latencyMs / 1000 }));
  const chains = singlePlayer
    .filter((r) => r.group === "pipeline" && r.step === 2 && r.turnLatencyMs !== undefined)
    .flatMap((r) => {
      const evalCase = caseById.get(r.caseId);
      if (!evalCase) return [];
      const kind = evalCase.role === "thread" ? "chapter opening (planner + first step)" : "switch turn (planner + turn)";
      return [{ arm: `${r.promptState}:${r.armKey}`, kind, seconds: (r.turnLatencyMs as number) / 1000 }];
    });
  return { beats: bucket(beats), planners: bucket(planners), chains: bucket(chains) };
}

/** Per role and prompt state: the cases whose stored production-form requests today's code builds identically. */
function referenceCurrency(records: CallRecord[], caseById: Map<string, EvalCase>, hash: (evalCase: EvalCase) => string | undefined): ReferenceCurrency[] {
  const stored = records.filter((r) => r.step === 1 && r.group === r.role && r.armKey.endsWith("/prod") && r.promptHash && ROLES.includes(r.role));
  const keys = [...new Set(stored.map((r) => `${r.role}|${r.promptState}`))].sort();
  return keys.map((k) => {
    const [role, promptState] = k.split("|") as [EvalRole, string];
    const byCase = new Map<string, Set<string>>();
    for (const r of stored.filter((each) => each.role === role && each.promptState === promptState)) {
      byCase.set(r.caseId, (byCase.get(r.caseId) ?? new Set()).add(r.promptHash as string));
    }
    const identical = [...byCase.entries()].filter(([caseId, hashes]) => {
      const evalCase = caseById.get(caseId);
      const today = evalCase ? hash(evalCase) : undefined;
      return today !== undefined && hashes.size === 1 && hashes.has(today);
    }).length;
    return { role, promptState, cases: byCase.size, identical };
  });
}

export function checkBaselines(input: BaselineInput): BaselineReport {
  const tags = new Map<string, CaseTags>(input.cases.map((c) => [c.id, c.tags]));
  const caseById = new Map(input.cases.map((c) => [c.id, c]));
  const replies = input.records.filter(
    (r) => r.final && usable(r) && r.outputFile && input.design.has(r.outputFile) && (isResultRecord(r, tags) || (r.group === "pipeline" && tags.has(r.caseId)))
  );
  return {
    generatedAt: input.generatedAt.toISOString(),
    replies: replies.length,
    roles: roleBaselines(replies, input.design),
    separation: (input.rated ?? []).map(({ key, exported }) => pageSeparation(key, exported, input.records, input.all)),
    turnKinds: turnKindWaits(replies, caseById),
    references: input.todaysPromptHash ? referenceCurrency(input.records, caseById, input.todaysPromptHash) : [],
    readouts: input.readouts ?? [],
  };
}

// --- Rendering ---

const pct = (x: number) => `${Math.round(x * 100)}%`;
const points = (x: number) => `${Math.round(x * 100)}`;
const num = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(2));

function rateCell(reading: Reading | undefined, replies: number): string {
  if (!reading) return "–";
  const noise = reading.noise === undefined ? "" : ` ±${points(reading.noise)}`;
  return `${pct(reading.rate)}${noise}${reading.n === replies ? "" : ` (${reading.n})`}`;
}

function countCell(reading: CountReading | undefined, replies: number): string {
  if (!reading) return "–";
  const noise = reading.noise === undefined ? "" : ` ±${num(reading.noise)}`;
  return `${num(reading.mean)}${noise}${reading.n === replies ? "" : ` (${reading.n})`}`;
}

/** Tables of at most `width` columns, one row per arm. */
function armTables(arms: ArmBaseline[], names: string[], cell: (arm: ArmBaseline, name: string) => string, width = 6): string[] {
  const lines: string[] = [];
  for (let i = 0; i < names.length; i += width) {
    const slice = names.slice(i, i + width);
    lines.push(`| Arm | Replies | ${slice.join(" | ")} |`, `|---|---|${slice.map(() => "---").join("|")}|`);
    for (const arm of arms) lines.push(`| ${arm.arm} | ${arm.replies} | ${slice.map((name) => cell(arm, name)).join(" | ")} |`);
    lines.push("");
  }
  return lines;
}

export function renderCheckBaselines(report: BaselineReport): string {
  const lines = [
    "# Check baselines: the improvement documents' new automatic checks over the stored outputs",
    "",
    `Generated ${report.generatedAt} by \`npm run eval:text -- --check-baselines\` (no API calls) over ${report.replies} stored replies: every usable final reply on a frozen case, checked as the game keeps it (round 0's C7).`,
    "",
    "- A check's cell is its pass rate over the replies it applies to, then ±the two-sample noise in percentage points (the arm's sample 1 against its sample 2 on the cases where it has both; absent for one-sample arms), then the replies it applies to when fewer than the arm's.",
    "- A count's cell is its mean per reply, with the noise as the difference of the two samples' means.",
    "- A share pools a count over its denominator count across the replies (for example outcomes naming an element over all outcomes).",
    "- Heuristic checks (word lists) are rates to read against the noise, never pass or fail on one reply.",
    "",
  ];
  for (const { role, arms } of report.roles) {
    const checks = [...new Set(arms.flatMap((a) => Object.keys(a.checks)))].sort();
    const counts = [...new Set(arms.flatMap((a) => Object.keys(a.counts)))].sort();
    const ratios = RATIOS.map((r) => r.name).filter((name) => arms.some((a) => name in a.ratios));
    lines.push(`## ${role}`, "");
    if (checks.length) lines.push("### Checks", "", ...armTables(arms, checks, (arm, name) => rateCell(arm.checks[name], arm.replies)));
    if (ratios.length) lines.push("### Shares", "", ...armTables(arms, ratios, (arm, name) => rateCell(arm.ratios[name], arm.replies)));
    if (counts.length) lines.push("### Counts", "", ...armTables(arms, counts, (arm, name) => countCell(arm.counts[name], arm.replies)));
  }

  lines.push("## What separates the owner's rank-1 picks", "");
  if (report.separation.length === 0) lines.push("No rated page was given (--ratings <export.json>).", "");
  for (const page of report.separation) {
    lines.push(
      `Page ${page.pageId}: ${page.items} rated items with a rank-1 pick and a lower option. "Agree" counts items where a rank-1 option passes and a lower one fails, "against" the reverse. A check separates the picks when agree exceeds against by 2 or more; with one rater and this few items, that is a lead, not a finding.`,
      "",
      "| Check | Rank 1 passes | Others pass | Items split | Agree | Against | Reading |",
      "|---|---|---|---|---|---|---|"
    );
    for (const c of page.checks) {
      const reading = c.agree - c.disagree >= 2 ? "separates" : c.disagree - c.agree >= 2 ? "against the picks" : "";
      const share = (p: { pass: number; n: number }) => (p.n ? `${p.pass} of ${p.n}` : "–");
      lines.push(`| ${c.name} | ${share(c.rank1)} | ${share(c.others)} | ${c.split} | ${c.agree} | ${c.disagree} | ${reading} |`);
    }
    lines.push("", "| Count | Rank 1 mean | Others mean | Items where rank 1 is higher | lower |", "|---|---|---|---|---|");
    for (const c of page.counts) lines.push(`| ${c.name} | ${num(c.rank1Mean)} | ${num(c.othersMean)} | ${c.higher} | ${c.lower} |`);
    lines.push("");
  }

  const waits = (title: string, list: TurnKindWait[]) =>
    list.length ? [`### ${title}`, "", "| Arm | Kind | Replies | p95 (s) |", "|---|---|---|---|", ...list.map((w) => `| ${w.arm} | ${w.kind} | ${w.n} | ${w.p95.toFixed(1)} |`), ""] : [];
  lines.push(
    "## Waits per turn kind (single player)",
    "",
    "A switch turn waits for the switch planner and the switch turn, a chapter opening for the chapter planner and the chapter's first step, every other turn for itself (turn doc A.C). The chains measured the first two as one wait; the isolated rows give each call alone.",
    "",
    ...waits("Chains (planner and turn as one wait)", report.turnKinds.chains),
    ...waits("Turns alone, by kind", report.turnKinds.beats),
    ...waits("Planners alone", report.turnKinds.planners)
  );

  lines.push("## Stored references against today's prompts", "");
  if (report.references.length === 0) lines.push("Not computed.", "");
  else {
    lines.push(
      "Cases whose stored production-form (/prod) request today's code builds byte for byte: where all match, the stored outputs are today's form and can be the round pages' references without a new run.",
      "",
      "| Role | Prompt state | Cases | Identical today |",
      "|---|---|---|---|",
      ...report.references.map((r) => `| ${r.role} | ${r.promptState} | ${r.cases} | ${r.identical} |`),
      ""
    );
  }

  lines.push("## Stat readouts found (for reading the check's false alarms by hand)", "");
  if (report.readouts.length === 0) lines.push("None listed.", "");
  else lines.push("| Arm | Output | Hit |", "|---|---|---|", ...report.readouts.map((r) => `| ${r.arm} | ${r.outputFile} | ${r.hit.replace(/\|/g, "\\|")} |`), "");
  return `${lines.join("\n")}\n`;
}
