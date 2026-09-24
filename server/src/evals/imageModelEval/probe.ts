import fs from "fs";
import { toFile } from "openai";
import type {
  ImageEditParamsNonStreaming,
  ImageGenerateParamsNonStreaming,
  ImagesResponse,
} from "openai/resources/images";
import sharp from "sharp";
import { IMAGE_QUALITIES, IMAGE_SIZES } from "core/types/index.js";
import type { ImageQuality, ImageSize } from "core/types/index.js";
import {
  mapImageUsage,
  type ImageApiClient,
} from "../../images/openaiImageClient.js";
import { costFromUsage, estimateCallCost } from "./arms.js";
import { classifyError, type ClassifiedError } from "./runner.js";

/*
 * Checks which request parameters GPT Image 2.5 accepts. Uses raw SDK calls,
 * so none of the app client's own rules or fallbacks run.
 */

export type ProbeCheck = {
  id: string;
  model: string;
  endpoint: "generate" | "edit";
  size: ImageSize;
  outputFormat: "jpeg" | "png";
  compression?: number;
  quality: ImageQuality;
  /** Runs only when this other check was rejected */
  onlyIfRejected?: string;
  purpose: string;
};

export type ProbeResult = ProbeCheck & {
  outcome: "accepted" | "rejected" | "skipped";
  skippedReason?: string;
  error?: ClassifiedError;
  returned?: { width?: number; height?: number; format?: string };
  /** The usage object exactly as the API returned it */
  rawUsage?: unknown;
  costUsd: number;
  latencyMs?: number;
};

export type ProbeReport = {
  ranAt: string;
  maxSpendUsd: number;
  totalCostUsd: number;
  results: ProbeResult[];
};

const PROBE_PROMPT =
  "A small red lighthouse on a rocky shore at dusk, simple storybook illustration.";
const PROBE_EDIT_PROMPT =
  "Show the characters and places from the reference images together in one calm street scene, storybook illustration.";
const COMPRESSION = 75;

export function probeChecks(): ProbeCheck[] {
  const { LOW } = IMAGE_QUALITIES;
  const { AUTO, SQUARE } = IMAGE_SIZES;
  const perModel = (model: string, prefix: string): ProbeCheck[] => [
    {
      id: `${prefix}-generate-auto`,
      model,
      endpoint: "generate",
      size: AUTO,
      outputFormat: "jpeg",
      compression: COMPRESSION,
      quality: LOW,
      purpose: "size auto on plain generation",
    },
    {
      id: `${prefix}-generate-square`,
      model,
      endpoint: "generate",
      size: SQUARE,
      outputFormat: "jpeg",
      compression: COMPRESSION,
      quality: LOW,
      purpose: "jpeg with output_compression at an explicit size",
    },
    {
      id: `${prefix}-edit-auto`,
      model,
      endpoint: "edit",
      size: AUTO,
      outputFormat: "jpeg",
      compression: COMPRESSION,
      quality: LOW,
      purpose: "edit with 2 references at size auto (the template element flow)",
    },
    {
      id: `${prefix}-edit-square`,
      model,
      endpoint: "edit",
      size: SQUARE,
      outputFormat: "jpeg",
      compression: COMPRESSION,
      quality: LOW,
      onlyIfRejected: `${prefix}-edit-auto`,
      purpose: "tells a size rejection from an edit rejection",
    },
    {
      id: `${prefix}-generate-png`,
      model,
      endpoint: "generate",
      size: SQUARE,
      outputFormat: "png",
      quality: LOW,
      onlyIfRejected: `${prefix}-generate-square`,
      purpose: "png without compression, if jpeg or compression was rejected",
    },
  ];
  return [
    ...perModel("gpt-image-2.5-flare", "flare"),
    ...perModel("gpt-image-2.5-sunburst", "sunburst"),
    {
      id: "gpt-image-1.5-xhigh",
      model: "gpt-image-1.5",
      endpoint: "generate",
      size: SQUARE,
      outputFormat: "jpeg",
      compression: COMPRESSION,
      quality: IMAGE_QUALITIES.XHIGH,
      purpose: "confirms that older models reject xhigh (expected 400)",
    },
  ];
}

function estimateFor(check: ProbeCheck, referenceCount: number): number {
  const prompt = check.endpoint === "edit" ? PROBE_EDIT_PROMPT : PROBE_PROMPT;
  return estimateCallCost(
    check,
    prompt.length,
    check.endpoint === "edit" ? referenceCount : 0
  );
}

/** Estimated cost of the checks that always run (follow-ups excluded). */
export function estimateProbeCost(referenceCount: number): number {
  return probeChecks()
    .filter((check) => !check.onlyIfRejected)
    .reduce((sum, check) => sum + estimateFor(check, referenceCount), 0);
}

async function sendCheck(
  client: ImageApiClient,
  check: ProbeCheck,
  referencePaths: string[]
): Promise<ImagesResponse> {
  const params = {
    model: check.model,
    prompt: check.endpoint === "edit" ? PROBE_EDIT_PROMPT : PROBE_PROMPT,
    moderation: "low" as const,
    n: 1,
    quality: check.quality,
    size: check.size,
    output_format: check.outputFormat,
    ...(check.compression !== undefined
      ? { output_compression: check.compression }
      : {}),
  };
  if (check.endpoint === "generate") {
    return client.images.generate(params as ImageGenerateParamsNonStreaming);
  }
  const image = await Promise.all(
    referencePaths.map((p) =>
      toFile(fs.createReadStream(p), null, { type: "image/jpeg" })
    )
  );
  return client.images.edit({ ...params, image } as ImageEditParamsNonStreaming);
}

async function describeImage(response: ImagesResponse): Promise<ProbeResult["returned"]> {
  const b64 = response.data?.[0]?.b64_json;
  if (!b64) {
    return undefined;
  }
  const metadata = await sharp(Buffer.from(b64, "base64")).metadata();
  return { width: metadata.width, height: metadata.height, format: metadata.format };
}

/**
 * Runs the checks in order, skipping any whose estimate would take the
 * probe past maxSpendUsd, and any follow-up whose trigger was accepted.
 */
export async function runProbe(
  client: ImageApiClient,
  referencePaths: string[],
  options: { maxSpendUsd: number; now: () => number; log: (line: string) => void }
): Promise<ProbeReport> {
  const results: ProbeResult[] = [];
  let spent = 0;

  for (const check of probeChecks()) {
    const trigger = check.onlyIfRejected
      ? results.find((r) => r.id === check.onlyIfRejected)
      : undefined;
    if (check.onlyIfRejected && trigger?.outcome !== "rejected") {
      continue;
    }
    const estimate = estimateFor(check, referencePaths.length);
    if (spent + estimate > options.maxSpendUsd) {
      results.push({
        ...check,
        outcome: "skipped",
        skippedReason: `estimate $${estimate.toFixed(3)} would exceed the $${options.maxSpendUsd} probe cap`,
        costUsd: 0,
      });
      options.log(`${check.id}: skipped (spend cap)`);
      continue;
    }

    const started = options.now();
    try {
      const response = await sendCheck(client, check, referencePaths);
      const usage = mapImageUsage(response.usage);
      const costUsd = usage ? costFromUsage(check.model, usage) : estimate;
      spent += costUsd;
      results.push({
        ...check,
        outcome: "accepted",
        returned: await describeImage(response),
        rawUsage: response.usage,
        costUsd,
        latencyMs: options.now() - started,
      });
      options.log(`${check.id}: accepted ($${costUsd.toFixed(4)})`);
    } catch (error) {
      const classified = classifyError(error);
      results.push({
        ...check,
        outcome: "rejected",
        error: classified,
        costUsd: 0,
        latencyMs: options.now() - started,
      });
      options.log(`${check.id}: rejected (${classified.message})`);
    }
  }

  return {
    ranAt: new Date(options.now()).toISOString(),
    maxSpendUsd: options.maxSpendUsd,
    totalCostUsd: spent,
    results,
  };
}
