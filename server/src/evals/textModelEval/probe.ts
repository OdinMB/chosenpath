import { ChatOpenAI } from "@langchain/openai";
import type OpenAI from "openai";
import { z } from "zod";
import { createStorySetupSchema, createSwitchAnalysisSchema, threadAnalysisSchema, type PlayerCount } from "core/types/index.js";
import { createSetOfBeatGenerationSchema } from "core/types/beat.js";
import { chatModelFields } from "shared/llm/chatModel.js";
import type { ReasoningEffort } from "shared/llm/textModelSettings.js";
import { callMetricsFromCompletion, type CallMetrics } from "shared/llm/usageRecorder.js";
import { contentFilterSchema } from "../../game/services/ContentFilterService.js";
import { partialTemplateSchema } from "../../game/services/storyTextSteps.js";
import { makeArm } from "./arms.js";
import type { CallSpec, ExecutedCall } from "./executor.js";
import { costFromUsage } from "./pricing.js";

/*
 * Which request parameters and schemas the API accepts for Sol and Luna
 * (test plan A4). Raw SDK requests only for shapes production must never
 * send (temperature with effort, "minimal", verbosity, cache breakpoints);
 * schema checks send the factory's own request body, capped at 64 output
 * tokens (OpenAI validates the schema before generating); one full
 * completion per model goes through the production path. Checks that would
 * pass the spend cap are skipped.
 */

export const PROBE_MODELS = ["gpt-6-sol", "gpt-6-luna"] as const;
type ProbeModel = (typeof PROBE_MODELS)[number];
const ALL_EFFORTS: ReasoningEffort[] = ["none", "low", "medium", "high"];
/**
 * Every production schema at these efforts. Schema validation happens before
 * generation and does not depend on effort, so the dearer Sol checks every
 * variant once; each effort is covered for both models by the small strict check.
 */
const SCHEMA_EFFORTS: Record<ProbeModel, ReasoningEffort[]> = {
  "gpt-6-luna": ALL_EFFORTS,
  "gpt-6-sol": ["low"],
};
/** Full completions through the production path: does a strict reply parse at this effort? */
const FULL_COMPLETIONS: { model: ProbeModel; effort: ReasoningEffort }[] = [
  { model: "gpt-6-sol", effort: "medium" },
  { model: "gpt-6-luna", effort: "medium" },
  { model: "gpt-6-luna", effort: "high" },
];
const CAPPED_OUTPUT_TOKENS = 64;

export type ProbeCheck = {
  id: string;
  model: string;
  description: string;
  /** What the test plan expects */
  expect: "accepted" | "rejected" | "observe";
  body: Record<string, unknown>;
  /** Send the same body twice (cache read on the repeat) */
  repeat?: boolean;
};

export type ProbeResult = {
  id: string;
  model: string;
  description: string;
  expect: ProbeCheck["expect"];
  outcome: "accepted" | "rejected" | "error" | "skipped";
  status?: number;
  code?: string;
  param?: string;
  message?: string;
  metrics?: CallMetrics;
  repeatMetrics?: CallMetrics;
  usageFields?: Record<string, boolean>;
  costUsd: number;
  note?: string;
};

export type ProbeReport = {
  generatedAt: string;
  results: ProbeResult[];
  totalCostUsd: number;
  /** Spend of earlier probe runs this report replaced (still counts against Stage 0) */
  priorSpendUsd?: number;
};

const SMALL_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "probe",
    strict: true,
    schema: {
      type: "object",
      properties: { answer: { type: "string" } },
      required: ["answer"],
      additionalProperties: false,
    },
  },
};

const SHORT_MESSAGES = [{ role: "user", content: "Reply with a JSON object whose answer is the word yes." }];

/**
 * About 1,300 tokens of fixed text: above GPT-6's 1,024-token cache minimum.
 * The first line makes each check's prefix unique, so one check's cache write
 * (or an earlier probe run's, within the cache lifetime) cannot show up as
 * another check's cache read.
 */
export function longText(prefix: string): string {
  const rules = Array.from(
    { length: 60 },
    (_, i) => `Rule ${i + 1}: keep every story consistent with the facts already established, and write in the second person.`
  );
  return [`Probe ${prefix}.`, ...rules].join("\n");
}

function rawChecks(model: string, nonce: string): ProbeCheck[] {
  const base = { model, response_format: SMALL_SCHEMA, messages: SHORT_MESSAGES, max_completion_tokens: CAPPED_OUTPUT_TOKENS };
  const longMessages = (id: string) => [
    { role: "developer", content: longText(`${nonce} ${model} ${id}`) },
    { role: "user", content: "Reply with a JSON object whose answer is the word yes." },
  ];
  return [
    ...ALL_EFFORTS.map(
      (effort): ProbeCheck => ({
        id: `strict-small-${effort}`,
        model,
        description: `small strict json_schema at effort ${effort}`,
        expect: "accepted",
        body: { ...base, reasoning_effort: effort },
      })
    ),
    { id: "none-with-temperature", model, description: "effort none with temperature 0.2", expect: "accepted", body: { ...base, reasoning_effort: "none", temperature: 0.2 } },
    { id: "low-with-temperature", model, description: "effort low with temperature 0.2", expect: "rejected", body: { ...base, reasoning_effort: "low", temperature: 0.2 } },
    { id: "minimal", model, description: 'effort "minimal"', expect: "rejected", body: { ...base, reasoning_effort: "minimal" } },
    { id: "verbosity-low", model, description: 'top-level verbosity "low"', expect: "observe", body: { ...base, reasoning_effort: "low", verbosity: "low" } },
    {
      id: "cache-explicit",
      model,
      description: "prompt_cache_options explicit (expect no cache write)",
      expect: "observe",
      body: { ...base, messages: longMessages("cache-explicit"), reasoning_effort: "none", prompt_cache_options: { mode: "explicit" } },
    },
    {
      id: "cache-implicit",
      model,
      description: "implicit caching default (expect a cache write of about the prompt)",
      expect: "observe",
      body: { ...base, messages: longMessages("cache-implicit"), reasoning_effort: "none" },
    },
    {
      id: "cache-breakpoint",
      model,
      description: "developer text part with prompt_cache_breakpoint, sent twice (expect cached tokens on the repeat)",
      expect: "observe",
      repeat: true,
      body: {
        ...base,
        reasoning_effort: "none",
        prompt_cache_options: { mode: "explicit" },
        messages: [
          {
            role: "developer",
            content: [{ type: "text", text: longText(`${nonce} ${model} cache-breakpoint`), prompt_cache_breakpoint: { mode: "explicit" } }],
          },
          { role: "user", content: "Reply with a JSON object whose answer is the word yes." },
        ],
      },
    },
  ];
}

type NamedSchema = { name: string; schema: z.ZodTypeAny };

function schemaVariants(): NamedSchema[] {
  const variants: NamedSchema[] = [];
  for (const players of [1, 2, 3] as PlayerCount[]) {
    variants.push({ name: `setup-story-${players}p`, schema: createStorySetupSchema(players, "story") });
    variants.push({ name: `setup-template-${players}p`, schema: createStorySetupSchema(players, "template") });
  }
  for (const players of [1, 3] as PlayerCount[]) {
    for (const images of [true, false]) {
      for (const milestones of [true, false]) {
        variants.push({
          name: `beat-${players}p-images-${images ? "on" : "off"}-milestones-${milestones ? "on" : "off"}`,
          schema: createSetOfBeatGenerationSchema(players, milestones, players > 1, images, images),
        });
      }
    }
    variants.push({ name: `switch-${players}p`, schema: createSwitchAnalysisSchema(players) });
  }
  variants.push({ name: "thread", schema: threadAnalysisSchema });
  variants.push({ name: "filter", schema: contentFilterSchema });
  variants.push({ name: "iteration-players-stats-2p", schema: partialTemplateSchema(["players", "stats"], 2) });
  return variants;
}

/** The factory's own Completions body for a schema: exactly what production would send. */
export function factoryBody(model: string, effort: ReasoningEffort, named: NamedSchema): Record<string, unknown> {
  const params = new ChatOpenAI(
    chatModelFields({ role: "beat", settings: { model, reasoningEffort: effort }, maxRetries: 0, timeoutMs: 60_000 })
  ).invocationParams({ response_format: { type: "json_schema", json_schema: { name: "extract", schema: named.schema } } });
  if (!("response_format" in params)) {
    throw new Error("Expected Chat Completions parameters");
  }
  return { ...params, messages: SHORT_MESSAGES, max_completion_tokens: CAPPED_OUTPUT_TOKENS };
}

/**
 * Raw checks first, then schemas from cheapest to dearest (Luna, then Sol), so a cap skips the tail.
 * `nonce` keeps the cache checks' prefixes unique per run.
 */
export function probeChecks(nonce = ""): ProbeCheck[] {
  const checks = PROBE_MODELS.flatMap((model) => rawChecks(model, nonce));
  for (const model of [...PROBE_MODELS].reverse()) {
    for (const effort of SCHEMA_EFFORTS[model]) {
      for (const named of schemaVariants()) {
        checks.push({
          id: `schema-${named.name}-${effort}`,
          model,
          description: `strict schema ${named.name} at effort ${effort}`,
          expect: "accepted",
          body: factoryBody(model, effort, named),
        });
      }
    }
  }
  return checks;
}

/** Input from the body length, output at the cap; sent twice for repeats. */
export function estimateCheckCost(check: ProbeCheck): number {
  const once = costFromUsage(check.model, {
    inputTokens: Math.ceil(JSON.stringify(check.body).length / 4),
    cachedTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: CAPPED_OUTPUT_TOKENS,
  });
  return (check.repeat ? 2 : 1) * once;
}

export type ProbeDeps = {
  maxSpendUsd: number;
  log: (line: string) => void;
  /** One full completion through the production path */
  executeCall: (spec: CallSpec) => Promise<ExecutedCall>;
  /** Makes the cache checks' prefixes unique per run (default: the start time) */
  nonce?: string;
};

function field(value: unknown, key: string): unknown {
  return value && typeof value === "object" && key in value ? (value as Record<string, unknown>)[key] : undefined;
}

function usageFields(body: unknown): Record<string, boolean> {
  const usage = field(body, "usage");
  return {
    cached_tokens: field(field(usage, "prompt_tokens_details"), "cached_tokens") !== undefined,
    cache_write_tokens: field(field(usage, "prompt_tokens_details"), "cache_write_tokens") !== undefined,
    reasoning_tokens: field(field(usage, "completion_tokens_details"), "reasoning_tokens") !== undefined,
    system_fingerprint: field(body, "system_fingerprint") !== undefined,
  };
}

async function send(client: OpenAI, check: ProbeCheck): Promise<Omit<ProbeResult, "id" | "model" | "description" | "expect">> {
  try {
    const body = await client.post<unknown>("/chat/completions", { body: check.body });
    const metrics = callMetricsFromCompletion(body);
    let repeatMetrics: CallMetrics | undefined;
    let cost = costFromUsage(check.model, metrics);
    if (check.repeat) {
      repeatMetrics = callMetricsFromCompletion(await client.post<unknown>("/chat/completions", { body: check.body }));
      cost += costFromUsage(check.model, repeatMetrics);
    }
    return { outcome: "accepted", status: 200, metrics, repeatMetrics, usageFields: usageFields(body), costUsd: cost };
  } catch (error) {
    const status = field(error, "status");
    return {
      outcome: typeof status === "number" && status >= 400 && status < 500 ? "rejected" : "error",
      status: typeof status === "number" ? status : undefined,
      code: typeof field(error, "code") === "string" ? (field(error, "code") as string) : undefined,
      param: typeof field(error, "param") === "string" ? (field(error, "param") as string) : undefined,
      message: error instanceof Error ? error.message : String(error),
      costUsd: 0,
    };
  }
}

/** A full filter completion: short prompt, reasoning plus a small reply (high assumes 12K reasoning). */
function fullCompletionEstimate(model: string, effort: ReasoningEffort): number {
  const outputTokens = effort === "high" ? 13_000 : 7_000;
  return costFromUsage(model, { inputTokens: 400, cachedTokens: 0, cacheWriteTokens: 0, outputTokens });
}

export async function runProbe(client: OpenAI, deps: ProbeDeps): Promise<ProbeReport> {
  const results: ProbeResult[] = [];
  let spent = 0;
  // The full completions run last but are reserved first: they answer questions the checks cannot
  const reserved = FULL_COMPLETIONS.reduce((sum, full) => sum + fullCompletionEstimate(full.model, full.effort), 0);
  for (const check of probeChecks(deps.nonce ?? new Date().toISOString())) {
    const meta = { id: check.id, model: check.model, description: check.description, expect: check.expect };
    const estimate = estimateCheckCost(check);
    if (spent + estimate + reserved > deps.maxSpendUsd) {
      results.push({ ...meta, outcome: "skipped", costUsd: 0, note: `would pass the $${deps.maxSpendUsd} cap` });
      continue;
    }
    const result = { ...meta, ...(await send(client, check)) };
    spent += result.costUsd;
    results.push(result);
    deps.log(`${check.model} ${check.id}: ${result.outcome}${result.status ? ` ${result.status}` : ""}${result.param ? ` param=${result.param}` : ""}`);
  }

  // Full completions through the production path
  for (const { model, effort } of FULL_COMPLETIONS) {
    const arm = makeArm({ model, reasoningEffort: effort });
    const estimate = fullCompletionEstimate(model, effort);
    const meta = {
      id: `full-${effort}-filter`,
      model,
      description: `full filter-schema completion at ${effort} via LangChain`,
      expect: "accepted" as const,
    };
    if (spent + estimate > deps.maxSpendUsd) {
      results.push({ ...meta, outcome: "skipped", costUsd: 0, note: `would pass the $${deps.maxSpendUsd} cap` });
      continue;
    }
    const executed = await deps.executeCall({
      callId: `probe-full-${model}-${effort}`,
      role: "setup",
      arm,
      request: {
        prompt: 'Is this story premise appropriate for a general audience? Premise: "A cozy mystery in a seaside town where a baker finds a map in a loaf of bread."',
        schema: contentFilterSchema,
      },
    });
    const costUsd = costFromUsage(model, executed.metrics);
    spent += costUsd;
    results.push({
      ...meta,
      outcome: executed.check.outcome === "valid" ? "accepted" : executed.check.status && executed.check.status >= 400 ? "rejected" : "error",
      status: executed.check.status,
      code: executed.check.code,
      param: executed.check.param,
      metrics: executed.metrics,
      costUsd,
      note: `outcome ${executed.check.outcome}; LangChain drops message.refusal on 0.6.7, so a refusal shows only in the raw body`,
    });
  }
  return { generatedAt: new Date().toISOString(), results, totalCostUsd: spent };
}
