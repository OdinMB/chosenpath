import type { ImageApiUsage } from "../images/openaiImageClient.js";
import { Logger } from "shared/logger.js";

/*
 * What an AI call costs, in US$: the one price table for text and image
 * models. The evals read it too (textModelEval/pricing.ts and
 * imageModelEval/arms.ts re-export it under their old names), so there is no
 * second table to drift. The *CostFromUsage functions throw on an unknown
 * model, as the evals want; the app records spend with textCallCostUsd and
 * imageCallCostUsd, which never throw.
 */

const log = Logger.forService("Spend");

/*
 * Text models
 */

export type TextUsage = {
  inputTokens: number;
  cachedTokens: number;
  cacheWriteTokens: number;
  /** Includes reasoning tokens */
  outputTokens: number;
  reasoningTokens?: number;
};

type TextPrice = { input: number; cached: number; cacheWrite: number; output: number };

/**
 * US$ per 1M tokens (text eval test plan §2.1). Longest matching prefix wins.
 * gpt-6.1-sol from OpenAI's model and pricing pages of 2026-09-30
 * (DOCS/2026-09-30_sol-6-1-assessment.md): today's Sol's but for cached input.
 */
const TEXT_PRICES: [string, TextPrice][] = [
  ["gpt-4.1-mini", { input: 0.4, cached: 0.1, cacheWrite: 0, output: 1.6 }],
  ["gpt-4.1", { input: 2.0, cached: 0.5, cacheWrite: 0, output: 8.0 }],
  ["gpt-6-sol", { input: 2.0, cached: 0.2, cacheWrite: 2.5, output: 10.0 }],
  ["gpt-6.1-sol", { input: 2.0, cached: 0.1, cacheWrite: 2.5, output: 10.0 }],
  ["gpt-6-luna", { input: 0.1, cached: 0.01, cacheWrite: 0.125, output: 0.5 }],
];

/** Every rate at the highest any known model charges: what an unknown model is booked at. */
const HIGHEST_TEXT_PRICE: TextPrice = {
  input: Math.max(...TEXT_PRICES.map(([, price]) => price.input)),
  cached: Math.max(...TEXT_PRICES.map(([, price]) => price.cached)),
  cacheWrite: Math.max(...TEXT_PRICES.map(([, price]) => price.cacheWrite)),
  output: Math.max(...TEXT_PRICES.map(([, price]) => price.output)),
};

function textPriceFor(model: string): TextPrice | undefined {
  return TEXT_PRICES.filter(([prefix]) => model.startsWith(prefix)).sort(
    (a, b) => b[0].length - a[0].length
  )[0]?.[1];
}

/** (I − C − W)·p_in + C·p_cached + W·p_write + O·p_out; O already includes reasoning. */
function textCostAt(price: TextPrice, usage: TextUsage): number {
  const uncached = Math.max(0, usage.inputTokens - usage.cachedTokens - usage.cacheWriteTokens);
  return (
    (uncached * price.input +
      usage.cachedTokens * price.cached +
      usage.cacheWriteTokens * price.cacheWrite +
      usage.outputTokens * price.output) /
    1_000_000
  );
}

/** The cost of measured usage. Throws for a model without a price (the evals). */
export function textCostFromUsage(model: string, usage: TextUsage): number {
  const price = textPriceFor(model);
  if (!price) {
    throw new Error(`No price for model ${model}`);
  }
  return textCostAt(price, usage);
}

/*
 * Image models
 */

/** US$ per 1M tokens */
export type ImagePrices = {
  textIn: number;
  textCached: number;
  imageIn: number;
  imageCached: number;
  imageOut: number;
};

// From the 2026-09-24 image model brief (OpenAI pricing page)
const GPT_IMAGE_1_5_PRICES: ImagePrices = {
  textIn: 5,
  textCached: 1.25,
  imageIn: 8,
  imageCached: 2,
  imageOut: 32,
};

// gpt-image-2, gpt-image-2.5-flare and gpt-image-2.5-sunburst share these rates
const GPT_IMAGE_2_PRICES: ImagePrices = {
  textIn: 5,
  textCached: 1.25,
  imageIn: 8,
  imageCached: 2,
  imageOut: 30,
};

function knownImagePrices(model: string): ImagePrices | undefined {
  if (model.startsWith("gpt-image-1.5")) return GPT_IMAGE_1_5_PRICES;
  if (model.startsWith("gpt-image-2")) return GPT_IMAGE_2_PRICES;
  return undefined;
}

/** The model's image rates. Throws for a model without them (the evals). */
export function imagePricesFor(model: string): ImagePrices {
  const prices = knownImagePrices(model);
  if (!prices) {
    throw new Error(`No image prices known for model ${model}`);
  }
  return prices;
}

/** The highest rates of the known image models: what an unknown one is booked at. */
const HIGHEST_IMAGE_PRICES: ImagePrices = {
  textIn: Math.max(GPT_IMAGE_1_5_PRICES.textIn, GPT_IMAGE_2_PRICES.textIn),
  textCached: Math.max(GPT_IMAGE_1_5_PRICES.textCached, GPT_IMAGE_2_PRICES.textCached),
  imageIn: Math.max(GPT_IMAGE_1_5_PRICES.imageIn, GPT_IMAGE_2_PRICES.imageIn),
  imageCached: Math.max(GPT_IMAGE_1_5_PRICES.imageCached, GPT_IMAGE_2_PRICES.imageCached),
  imageOut: Math.max(GPT_IMAGE_1_5_PRICES.imageOut, GPT_IMAGE_2_PRICES.imageOut),
};

/**
 * Cached input tokens, when the API reports them, are billed at the cached
 * rate; they are counted against text tokens first because the API does not
 * say which kind they are and the text discount is the smaller one
 * (conservative).
 */
function imageCostAt(prices: ImagePrices, usage: ImageApiUsage): number {
  const cached = usage.cachedInputTokens ?? 0;
  const cachedText = Math.min(cached, usage.inputTextTokens);
  const cachedImage = Math.min(cached - cachedText, usage.inputImageTokens);
  return (
    ((usage.inputTextTokens - cachedText) * prices.textIn +
      cachedText * prices.textCached +
      (usage.inputImageTokens - cachedImage) * prices.imageIn +
      cachedImage * prices.imageCached +
      usage.outputTokens * prices.imageOut) /
    1_000_000
  );
}

/** The cost of reported image usage. Throws for a model without rates (the evals). */
export function imageCostFromUsage(model: string, usage: ImageApiUsage): number {
  return imageCostAt(imagePricesFor(model), usage);
}

/*
 * Production: never throws
 */

/** Booked for an image whose usage the API did not report: more than any image the app makes costs. */
export const IMAGE_CALL_FALLBACK_USD = 0.25;

/**
 * Booked for an image the Images API's moderation refused. Whether such a
 * request is billed is not verified, so it is booked as the costliest image.
 */
export const REFUSED_IMAGE_ESTIMATE_USD = IMAGE_CALL_FALLBACK_USD;

// Fewer characters per token than English prompts have (about 4), so the
// estimate errs high
const ESTIMATE_CHARACTERS_PER_TOKEN = 3;
// The largest production output cap (chatModel.ts, productionCallLimits), for
// a call whose own cap wasn't seen
const ESTIMATE_OUTPUT_CAP_TOKENS = 20_000;

/**
 * The usage to book for a text call the API billed but that failed before it
 * reported usage: a reply cut off at its output cap, or stopped by the content
 * filter. The whole cap, and the prompt at a generous token count.
 */
export function unreportedTextUsage(
  promptCharacters: number | undefined,
  maxOutputTokens: number | undefined
): TextUsage {
  return {
    inputTokens: Math.ceil((promptCharacters ?? 0) / ESTIMATE_CHARACTERS_PER_TOKEN),
    cachedTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: maxOutputTokens ?? ESTIMATE_OUTPUT_CAP_TOKENS,
  };
}

const warned = new Set<string>();

function warnOnce(topic: string, message: string): void {
  if (!warned.has(topic)) {
    warned.add(topic);
    log.warn(message);
  }
}

/** A finished text call's cost; a model missing from the table is booked at the highest known rates. */
export function textCallCostUsd(model: string | undefined, usage: TextUsage): number {
  const price = model ? textPriceFor(model) : undefined;
  if (price) {
    return textCostAt(price, usage);
  }
  const name = model ?? "(not reported)";
  warnOnce(
    `text:${name}`,
    `No price for text model ${name}; booking its calls at the highest known rates (server/src/spend/prices.ts)`
  );
  return textCostAt(HIGHEST_TEXT_PRICE, usage);
}

/** A written image's cost from its reported usage; the flat estimate when none was reported. */
export function imageCallCostUsd(model: string, usage: ImageApiUsage | undefined): number {
  if (!usage) {
    warnOnce(
      "image:no-usage",
      `The Images API reported no usage; booking such images at $${IMAGE_CALL_FALLBACK_USD} each`
    );
    return IMAGE_CALL_FALLBACK_USD;
  }
  const prices = knownImagePrices(model);
  if (!prices) {
    warnOnce(
      `image:${model}`,
      `No image prices for model ${model}; booking its images at the highest known rates (server/src/spend/prices.ts)`
    );
  }
  return imageCostAt(prices ?? HIGHEST_IMAGE_PRICES, usage);
}
