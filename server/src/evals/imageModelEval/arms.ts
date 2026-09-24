import { IMAGE_QUALITIES, IMAGE_SIZES } from "core/types/index.js";
import type { ImageQuality, ImageSize } from "core/types/index.js";
import {
  effectiveImageQuality,
  type ImageApiUsage,
} from "../../images/openaiImageClient.js";
import type { CallSite } from "./cases.js";

/*
 * Defines the eval arms (model, quality, size per call site) and what each
 * call should cost. Prices and output-token counts come from the 2026-09-24
 * model brief (OpenAI pricing page and the image-generation guide's calculator).
 */

export type Arm = {
  /** `<model>@<quality>`, plus `-<size>` when the size differs from the call site's default */
  key: string;
  model: string;
  quality: ImageQuality;
  size: ImageSize;
  baseline: boolean;
};

const BASELINE_MODEL = "gpt-image-1.5";
const FLARE = "gpt-image-2.5-flare";
const SUNBURST = "gpt-image-2.5-sunburst";

const { LOW, MEDIUM, HIGH, XHIGH, MAX } = IMAGE_QUALITIES;
const { SQUARE, LANDSCAPE, PORTRAIT, AUTO } = IMAGE_SIZES;

function makeArm(
  model: string,
  quality: ImageQuality,
  size: ImageSize,
  defaultSize: ImageSize,
  baseline = false
): Arm {
  const suffix = size === defaultSize ? "" : `-${size}`;
  return { key: `${model}@${quality}${suffix}`, model, quality, size, baseline };
}

export const BEAT_BASELINE = makeArm(BASELINE_MODEL, MEDIUM, SQUARE, SQUARE, true);

const BEAT_CANDIDATES: Arm[] = [
  makeArm(FLARE, MEDIUM, SQUARE, SQUARE),
  makeArm(FLARE, HIGH, SQUARE, SQUARE),
  makeArm(SUNBURST, HIGH, SQUARE, SQUARE),
  makeArm(FLARE, HIGH, LANDSCAPE, SQUARE),
];

/**
 * Baseline plus three of the four beat candidates: item i (0-based) omits
 * candidate i mod 4, so over 12 items each candidate appears in 9.
 */
export function beatArmsForItem(index: number): Arm[] {
  const omitted = index % BEAT_CANDIDATES.length;
  return [BEAT_BASELINE, ...BEAT_CANDIDATES.filter((_, i) => i !== omitted)];
}

const COVER_PORTRAIT_ARMS: Record<Exclude<CallSite, "beat">, Arm[]> = {
  // Same arms as today's in-game flow
  "story-cover": [
    makeArm(BASELINE_MODEL, MEDIUM, PORTRAIT, PORTRAIT, true),
    makeArm(FLARE, MEDIUM, PORTRAIT, PORTRAIT),
    makeArm(FLARE, HIGH, PORTRAIT, PORTRAIT),
    makeArm(SUNBURST, HIGH, PORTRAIT, PORTRAIT),
  ],
  "story-portrait": [
    makeArm(BASELINE_MODEL, MEDIUM, PORTRAIT, PORTRAIT, true),
    makeArm(FLARE, MEDIUM, PORTRAIT, PORTRAIT),
    makeArm(FLARE, HIGH, PORTRAIT, PORTRAIT),
    makeArm(SUNBURST, HIGH, PORTRAIT, PORTRAIT),
  ],
  // Template editor: quality-first, today's cover quality is high
  "template-cover": [
    makeArm(BASELINE_MODEL, HIGH, PORTRAIT, PORTRAIT, true),
    makeArm(SUNBURST, HIGH, PORTRAIT, PORTRAIT),
    makeArm(SUNBURST, XHIGH, PORTRAIT, PORTRAIT),
    makeArm(FLARE, HIGH, PORTRAIT, PORTRAIT),
  ],
  "template-portrait": [
    makeArm(BASELINE_MODEL, MEDIUM, PORTRAIT, PORTRAIT, true),
    makeArm(SUNBURST, MEDIUM, PORTRAIT, PORTRAIT),
    makeArm(SUNBURST, HIGH, PORTRAIT, PORTRAIT),
    makeArm(FLARE, HIGH, PORTRAIT, PORTRAIT),
  ],
};

export function coverPortraitArms(callSite: Exclude<CallSite, "beat">): Arm[] {
  return COVER_PORTRAIT_ARMS[callSite];
}

/** USD per 1M tokens */
type Prices = {
  textIn: number;
  textCached: number;
  imageIn: number;
  imageCached: number;
  imageOut: number;
};

const GPT_IMAGE_1_5_PRICES: Prices = {
  textIn: 5,
  textCached: 1.25,
  imageIn: 8,
  imageCached: 2,
  imageOut: 32,
};

// gpt-image-2, gpt-image-2.5-flare and gpt-image-2.5-sunburst share these rates
const GPT_IMAGE_2_PRICES: Prices = {
  textIn: 5,
  textCached: 1.25,
  imageIn: 8,
  imageCached: 2,
  imageOut: 30,
};

function pricesFor(model: string): Prices {
  if (model.startsWith("gpt-image-1.5")) {
    return GPT_IMAGE_1_5_PRICES;
  }
  if (model.startsWith("gpt-image-2")) {
    return GPT_IMAGE_2_PRICES;
  }
  throw new Error(`No image prices known for model ${model}`);
}

type TokenTable = Partial<Record<ImageQuality, number>>;

// Output tokens per image. gpt-image-1.5 uses gpt-image-1's counts, which
// reproduce its official per-image prices; 2.5 counts come from the guide's
// calculator (quality factors low 16, medium 24, high 48, xhigh 64, max 96).
const OUTPUT_TOKENS: Record<"1.5" | "2.5", { square: TokenTable; nonSquare: TokenTable }> = {
  "1.5": {
    square: { [LOW]: 272, [MEDIUM]: 1056, [HIGH]: 4160 },
    nonSquare: { [LOW]: 408, [MEDIUM]: 1584, [HIGH]: 6240 },
  },
  "2.5": {
    square: { [LOW]: 196, [MEDIUM]: 439, [HIGH]: 1756, [XHIGH]: 3122, [MAX]: 7024 },
    nonSquare: { [LOW]: 158, [MEDIUM]: 343, [HIGH]: 1372, [XHIGH]: 2459, [MAX]: 5488 },
  },
};

/**
 * Input-token estimate for one stored reference image. The 2026-09-24 probe
 * measured 1,536 per reference on gpt-image-2.5 (two references = 3,072 image
 * tokens); rounded up because gpt-image-1.5 was not measured.
 */
export const ESTIMATED_TOKENS_PER_REFERENCE = 1600;

function estimateOutputTokens(model: string, quality: ImageQuality, size: ImageSize): number {
  const family = model.startsWith("gpt-image-2.5")
    ? "2.5"
    : model.startsWith("gpt-image-1.5")
      ? "1.5"
      : undefined;
  if (!family) {
    throw new Error(`No output-token table for model ${model}`);
  }
  const effective = effectiveImageQuality(model, quality);
  const tables = OUTPUT_TOKENS[family];
  const square = tables.square[effective];
  const nonSquare = tables.nonSquare[effective];
  if (square === undefined || nonSquare === undefined) {
    throw new Error(`No output-token count for ${model} at ${effective}`);
  }
  if (size === AUTO) {
    // Unknown until the model picks: assume the more expensive shape
    return Math.max(square, nonSquare);
  }
  return size === SQUARE ? square : nonSquare;
}

/**
 * Estimated cost of one call: prompt text at ~4 characters per token,
 * ESTIMATED_TOKENS_PER_REFERENCE per reference image, and the output tokens
 * for the model, quality and size.
 */
export function estimateCallCost(
  arm: Pick<Arm, "model" | "quality" | "size">,
  promptChars: number,
  refCount: number
): number {
  const prices = pricesFor(arm.model);
  const textTokens = Math.ceil(promptChars / 4);
  const imageTokens = refCount * ESTIMATED_TOKENS_PER_REFERENCE;
  const outputTokens = estimateOutputTokens(arm.model, arm.quality, arm.size);
  return (
    (textTokens * prices.textIn +
      imageTokens * prices.imageIn +
      outputTokens * prices.imageOut) /
    1_000_000
  );
}

/**
 * Actual cost from reported usage. Cached input tokens, when the API reports
 * them, are billed at the cached rate; they are counted against text tokens
 * first because the API does not say which kind they are and the text
 * discount is the smaller one (conservative).
 */
export function costFromUsage(model: string, usage: ImageApiUsage): number {
  const prices = pricesFor(model);
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
