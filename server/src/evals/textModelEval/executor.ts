import crypto from "crypto";
import fs from "fs";
import path from "path";
import { createChatModel } from "shared/llm/chatModel.js";
import { callMetricsFromCompletion, type CallMetrics } from "shared/llm/usageRecorder.js";
import type { TextRequest } from "../../game/services/storyTextSteps.js";
import { armSettings, productionRole, type Arm, type EvalRole } from "./arms.js";
import { classifyCall, type Capture, type CallCheck } from "./responseCheck.js";

/*
 * One eval call through the production path: the production factory and
 * LangChain's structured output, with retries off (the runner counts every
 * attempt). A wrapped fetch records the raw HTTP response before LangChain
 * parses it, so a reply that fails to parse is still visible.
 *
 * Never calls AIStoryGenerator (it wraps every error into a generic message)
 * and never imports StoryProgressionService (it pulls in the database).
 */

export const EVAL_TIMEOUT_MS = 300_000;

export type FetchFn = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type CallSpec = {
  callId: string;
  role: EvalRole;
  arm: Arm;
  request: TextRequest;
};

export type ExecutedCall = {
  capture: Capture & { retryAfterMs?: number };
  latencyMs: number;
  check: CallCheck;
  metrics: CallMetrics;
  promptHash: string;
  outputFile: string;
};

export type ExecutorDeps = {
  outDir: string;
  now: () => number;
  fetch?: FetchFn;
};

export function sha256(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function retryAfterMs(headers: Headers): number | undefined {
  const value = headers.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

/** A fetch that records the last response's status, ids, timing header and raw body. */
export function capturingFetch(
  inner: FetchFn,
  capture: Capture & { retryAfterMs?: number }
): FetchFn {
  return async (input, init) => {
    const response = await inner(input, init);
    capture.status = response.status;
    capture.requestId = response.headers.get("x-request-id") ?? undefined;
    const processing = Number(response.headers.get("openai-processing-ms"));
    capture.processingMs = Number.isFinite(processing) && processing > 0 ? processing : undefined;
    capture.retryAfterMs = retryAfterMs(response.headers);
    capture.body = await response.clone().text();
    return response;
  };
}

function storePrompt(outDir: string, prompt: string): string {
  const hash = sha256(prompt);
  const dir = path.join(outDir, "prompts");
  const file = path.join(dir, `${hash}.txt`);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, prompt);
  }
  return hash;
}

function parseBody(body: string | undefined): unknown {
  try {
    return body === undefined ? undefined : JSON.parse(body);
  } catch {
    return undefined;
  }
}

export async function executeCall(spec: CallSpec, deps: ExecutorDeps): Promise<ExecutedCall> {
  const capture: Capture & { retryAfterMs?: number } = {};
  const inner: FetchFn = deps.fetch ?? ((input, init) => fetch(input, init));
  const model = createChatModel({
    role: productionRole(spec.role),
    settings: armSettings(spec.arm),
    maxRetries: 0,
    timeoutMs: EVAL_TIMEOUT_MS,
    configuration: { fetch: capturingFetch(inner, capture) },
  });
  const promptHash = storePrompt(deps.outDir, spec.request.prompt);

  const startedAt = deps.now();
  let error: unknown;
  try {
    await model.withStructuredOutput(spec.request.schema).invoke(spec.request.prompt);
  } catch (caught) {
    error = caught;
  }
  const latencyMs = deps.now() - startedAt;

  const check = classifyCall(capture, error, spec.request.schema);
  const metrics = callMetricsFromCompletion(parseBody(capture.body));
  const outputFile = path.join("outputs", `${spec.callId}.json`);
  fs.mkdirSync(path.join(deps.outDir, "outputs"), { recursive: true });
  fs.writeFileSync(
    path.join(deps.outDir, outputFile),
    `${JSON.stringify(
      {
        callId: spec.callId,
        role: spec.role,
        armKey: spec.arm.key,
        promptHash,
        status: capture.status,
        requestId: capture.requestId,
        processingMs: capture.processingMs,
        latencyMs,
        outcome: check.outcome,
        metrics,
        parsed: check.parsed,
        trailingText: check.trailingText,
        errorMessage: check.errorMessage,
        rawBody: capture.body,
      },
      null,
      2
    )}\n`
  );
  return { capture, latencyMs, check, metrics, promptHash, outputFile };
}
