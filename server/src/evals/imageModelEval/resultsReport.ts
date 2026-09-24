import { BEAT_BASELINE, coverPortraitArms } from "./arms.js";
import type { CallSite } from "./cases.js";
import type { ProbeReport } from "./probe.js";
import type { CallRecord } from "./runner.js";
import { callKey } from "./runner.js";

/*
 * Turns call records into the plain-language results.md: per-arm metrics per
 * call site, the automated gates (which only rule arms out), per-story cost,
 * probe results and spend.
 */

export type ArmMetrics = {
  callSite: CallSite;
  armKey: string;
  baseline: boolean;
  calls: number;
  successes: number;
  refusals: number;
  otherErrors: number;
  junk: number;
  p50LatencyMs?: number;
  p95LatencyMs?: number;
  avgInputTextTokens?: number;
  avgInputImageTokens?: number;
  avgOutputTokens?: number;
  usdPerImage?: number;
};

/** An image must arrive before the player reaches the [image] tag. */
const BEAT_LATENCY_FLOOR_MS = 30_000;
/** Upper bound from the partner doc's $0.50/story at gpt-image-1 medium. */
export const BEAT_IMAGES_PER_STORY = 12;
const ASSUMED_STORIES_PER_MONTH = 100;

const CALL_SITES: { site: CallSite; title: string }[] = [
  { site: "beat", title: "Beat illustrations (in-game)" },
  { site: "story-cover", title: "Custom-story cover (in-game)" },
  { site: "story-portrait", title: "Custom-story player portrait (in-game)" },
  { site: "template-cover", title: "Template cover (template editor)" },
  { site: "template-portrait", title: "Template player portrait (template editor)" },
];

export function baselineKeyFor(site: CallSite): string {
  return site === "beat" ? BEAT_BASELINE.key : coverPortraitArms(site)[0].key;
}

function callSiteOf(caseId: string): CallSite {
  return caseId.split(":")[0] as CallSite;
}

/** Nearest-rank percentile; undefined for an empty list. */
export function percentile(values: number[], p: number): number | undefined {
  if (values.length === 0) {
    return undefined;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}

function mean(values: number[]): number | undefined {
  return values.length === 0
    ? undefined
    : values.reduce((sum, v) => sum + v, 0) / values.length;
}

function isRefusal(record: CallRecord): boolean {
  return (
    record.errorCode === "CONTENT_POLICY" ||
    record.errorCode === "COPYRIGHT" ||
    record.errorType === "image_generation_user_error"
  );
}

/** Outcome, latency, token and cost figures per call site and arm. */
export function computeArmMetrics(records: CallRecord[]): ArmMetrics[] {
  // The latest final record per case and arm (records are in time order)
  const finals = new Map<string, CallRecord>();
  for (const r of records) {
    if (r.final) {
      finals.set(callKey(r.caseId, r.armKey), r);
    }
  }

  const groups = new Map<string, CallRecord[]>();
  for (const r of finals.values()) {
    const key = `${callSiteOf(r.caseId)}|${r.armKey}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  return [...groups.entries()].map(([key, group]) => {
    const [site, armKey] = key.split("|") as [CallSite, string];
    const successes = group.filter((r) => r.status === "success");
    const withUsage = successes.filter((r) => r.usage !== undefined);
    const latencies = successes.map((r) => r.latencyMs);
    return {
      callSite: site,
      armKey,
      baseline: armKey === baselineKeyFor(site),
      calls: group.length,
      successes: successes.length,
      refusals: group.filter((r) => r.status === "error" && isRefusal(r)).length,
      otherErrors: group.filter((r) => r.status === "error" && !isRefusal(r)).length,
      junk: group.filter((r) => r.status === "junk").length,
      p50LatencyMs: percentile(latencies, 50),
      p95LatencyMs: percentile(latencies, 95),
      avgInputTextTokens: mean(withUsage.map((r) => r.usage?.inputTextTokens ?? 0)),
      avgInputImageTokens: mean(withUsage.map((r) => r.usage?.inputImageTokens ?? 0)),
      avgOutputTokens: mean(withUsage.map((r) => r.usage?.outputTokens ?? 0)),
      usdPerImage: mean(successes.map((r) => r.costUsd)),
    };
  });
}

function failureCount(m: ArmMetrics): number {
  return m.refusals + m.otherErrors + m.junk;
}

/**
 * Reasons an arm is ruled out on its call site; empty when it passes.
 * Gates never pick a winner; the owner's rating does.
 */
export function gateFailures(arm: ArmMetrics, baseline: ArmMetrics): string[] {
  const reasons: string[] = [];
  if (failureCount(arm) > failureCount(baseline) + 1) {
    reasons.push(
      `${failureCount(arm)} failed calls against the baseline's ${failureCount(baseline)}`
    );
  }
  if (arm.callSite === "beat" && arm.p95LatencyMs !== undefined) {
    const limit = Math.max(BEAT_LATENCY_FLOOR_MS, baseline.p95LatencyMs ?? 0);
    if (arm.p95LatencyMs > limit) {
      reasons.push(
        `p95 latency ${(arm.p95LatencyMs / 1000).toFixed(1)} s is above ${(limit / 1000).toFixed(1)} s`
      );
    }
  }
  return reasons;
}

function usd(value: number | undefined, digits = 4): string {
  return value === undefined ? "n/a" : `$${value.toFixed(digits)}`;
}

function seconds(ms: number | undefined): string {
  return ms === undefined ? "n/a" : `${(ms / 1000).toFixed(1)} s`;
}

function tokens(value: number | undefined): string {
  return value === undefined ? "n/a" : Math.round(value).toLocaleString("en-US");
}

function versus(value: number | undefined, baseline: number | undefined): string {
  if (value === undefined || baseline === undefined || baseline === 0) {
    return "n/a";
  }
  const change = ((value - baseline) / baseline) * 100;
  return `${change >= 0 ? "+" : ""}${change.toFixed(0)}%`;
}

/** `model@quality` without a size suffix, to match arms across call sites. */
function modelQuality(armKey: string): string {
  return armKey.replace(/-\d+x\d+$/, "");
}

function renderSite(site: CallSite, title: string, metrics: ArmMetrics[]): string {
  const siteMetrics = metrics
    .filter((m) => m.callSite === site)
    .sort((a, b) => Number(b.baseline) - Number(a.baseline) || a.armKey.localeCompare(b.armKey));
  const baseline = siteMetrics.find((m) => m.baseline);
  if (siteMetrics.length === 0 || !baseline) {
    return `## ${title}\n\nNo results (not run yet, or the baseline has no calls).`;
  }
  const rows = siteMetrics.map((m) => {
    const gates = m.baseline ? "baseline" : gateFailures(m, baseline);
    const gateText = typeof gates === "string" ? gates : gates.length ? `fails: ${gates.join("; ")}` : "passes";
    return `| ${m.armKey} | ${m.calls} | ${m.successes} | ${m.refusals} | ${m.otherErrors} | ${m.junk} | ${seconds(m.p50LatencyMs)} | ${seconds(m.p95LatencyMs)} | ${tokens(m.avgInputTextTokens)} | ${tokens(m.avgInputImageTokens)} | ${tokens(m.avgOutputTokens)} | ${usd(m.usdPerImage)} | ${m.baseline ? "" : versus(m.usdPerImage, baseline.usdPerImage)} | ${gateText} |`;
  });
  return [
    `## ${title}`,
    "",
    "| Arm | Calls | OK | Refusals | Other errors | Junk | p50 | p95 | Avg text in | Avg image in | Avg out | $ per image | vs baseline | Automated gates |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...rows,
    "",
    "With 9 to 12 calls per arm, p95 is effectively the slowest call.",
  ].join("\n");
}

function renderStoryCost(metrics: ArmMetrics[]): string {
  const beats = metrics.filter((m) => m.callSite === "beat");
  const baseline = beats.find((m) => m.baseline);
  const extraFor = (armKey: string): number | undefined => {
    const match = (site: CallSite) =>
      metrics.find((m) => m.callSite === site && modelQuality(m.armKey) === modelQuality(armKey))
        ?.usdPerImage;
    const cover = match("story-cover");
    const portrait = match("story-portrait");
    return cover === undefined || portrait === undefined ? undefined : cover + portrait;
  };
  const perStory = (m: ArmMetrics) =>
    m.usdPerImage === undefined ? undefined : m.usdPerImage * BEAT_IMAGES_PER_STORY;
  const rows = beats
    .sort((a, b) => Number(b.baseline) - Number(a.baseline) || a.armKey.localeCompare(b.armKey))
    .map((m) => {
      const story = perStory(m);
      const extra = extraFor(m.armKey);
      const custom = story === undefined || extra === undefined ? undefined : story + extra;
      return `| ${m.armKey} | ${usd(story, 3)} | ${usd(custom, 3)} | ${usd(story === undefined ? undefined : story * 1000, 0)} | ${m.baseline ? "" : versus(story, baseline ? perStory(baseline) : undefined)} |`;
    });
  const baselineStory = baseline ? perStory(baseline) : undefined;
  return [
    "## Cost per story and per month",
    "",
    `Per image-enabled single-player story: ${BEAT_IMAGES_PER_STORY} beat images (an upper bound, derived from the partner doc's $0.50 per story at gpt-image-1 medium). A custom story adds one cover and one player portrait, priced with the same model and quality on those call sites. Template flows are manual and happen a few times per template, so they only get a per-image price above.`,
    "",
    "| Beat arm | $ per template story | $ per custom story | $ per 1,000 template stories | vs baseline |",
    "|---|---|---|---|---|",
    ...rows,
    "",
    "A monthly figure cannot be measured: the app has no usage analytics and no monthly story count is known. The formula is: monthly cost = image-enabled stories per month × cost per story.",
    "",
    `Worked example (an assumption, not a measurement): at ${ASSUMED_STORIES_PER_MONTH} image-enabled template stories a month, the baseline costs ${usd(baselineStory === undefined ? undefined : baselineStory * ASSUMED_STORIES_PER_MONTH, 2)} a month.`,
  ].join("\n");
}

function renderProbe(probe: ProbeReport | undefined): string {
  if (!probe) {
    return "## Probe results\n\nThe probe has not been run (`npm run eval:images -- --probe`).";
  }
  const rows = probe.results.map((r) => {
    const detail =
      r.outcome === "accepted"
        ? `returned ${r.returned?.width ?? "?"}x${r.returned?.height ?? "?"} ${r.returned?.format ?? ""}`
        : r.outcome === "rejected"
          ? `${r.error?.httpStatus ?? ""} ${r.error?.apiCode ?? ""} ${r.error?.message ?? ""}`.trim()
          : (r.skippedReason ?? "");
    return `| ${r.id} | ${r.purpose} | ${r.outcome} | ${detail.replace(/\|/g, "/")} | ${usd(r.costUsd)} |`;
  });
  return [
    "## Probe results",
    "",
    `Run ${probe.ranAt}, cap $${probe.maxSpendUsd}, spent ${usd(probe.totalCostUsd)}. Raw details, including the usage objects as returned, are in probe.json.`,
    "",
    "| Check | What it tests | Outcome | Detail | Cost |",
    "|---|---|---|---|---|",
    ...rows,
    "",
    "Template element images are not replayed; they are covered by the edit-at-auto checks above and follow `IMAGE_GENERATION_TEMPLATE_MODEL`.",
  ].join("\n");
}

export type ResultsInput = {
  generatedAt: string;
  metrics: ArmMetrics[];
  probe?: ProbeReport;
  runSpendUsd: number;
  partial: boolean;
  ratedItems: { beats: number; coversPortraits: number };
};

export function renderResults(input: ResultsInput): string {
  const probeSpend = input.probe?.totalCostUsd ?? 0;
  return [
    "# Image model eval: chosenpath",
    "",
    `Generated ${input.generatedAt}. ${input.partial ? "**The run was cut short by the spend cap; re-run the same command to finish it (finished calls are not repeated).**" : "The run completed."}`,
    "",
    `Rating items produced: ${input.ratedItems.beats} beat illustrations and ${input.ratedItems.coversPortraits} covers/portraits (rating-sets.json).`,
    "",
    "## How to read this",
    "",
    "- No machine metric measures agreement with the baseline for images. The owner's blind rating is that measure.",
    "- The automated gates only rule arms out; they never pick a winner, and no image call site is decided by them alone. An arm fails a gate when its failed calls (errors, refusals and junk) exceed the baseline's by more than 1 on that call site, or, for beats only, when its p95 latency is above max(30 s, the baseline's p95), because the image must arrive before the player reaches the [image] tag.",
    "- Phase 2 rule: per call site, pick the cheapest arm that passes the gates and wins or ties the baseline in at least 50% of items on character match and style.",
    "- Costs come from reported usage where the API returned it; cached input tokens, when reported, are billed at the cached rate.",
    "",
    ...CALL_SITES.flatMap(({ site, title }) => [renderSite(site, title, input.metrics), ""]),
    "## Template element images",
    "",
    "Not replayed. Covered by the probe only; they follow `IMAGE_GENERATION_TEMPLATE_MODEL`.",
    "",
    "## Text call sites",
    "",
    "Not evaluated. The owner keeps gpt-4.1 and gpt-4.1-mini.",
    "",
    "## Video",
    "",
    "Removed. Sora was retired on 2026-09-24 and no video generator is implemented.",
    "",
    renderStoryCost(input.metrics),
    "",
    renderProbe(input.probe),
    "",
    "## Limitations",
    "",
    "- Local data has no custom-story beats and no multiplayer stories, so beat items come from two pre-made worlds only.",
    "- The gpt-image-2 fallback was not tested.",
    "- Before this run, reference-image input was measured only on gpt-image-2.5 (1,536 tokens per reference in the probe); the call estimates assumed 1,600 per reference for every model.",
    "",
    "## Spend",
    "",
    `Run: ${usd(input.runSpendUsd, 2)}. Probe: ${usd(probeSpend, 2)}. Total: ${usd(input.runSpendUsd + probeSpend, 2)}.`,
    "",
  ].join("\n");
}
