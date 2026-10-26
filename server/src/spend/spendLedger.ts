import type {
  SpendBucket,
  SpendBucketTotal,
  SpendTotals,
} from "core/types/api.js";
import type { ImageApiUsage } from "server/images/openaiImageClient.js";
import { storyDbService } from "server/stories/StoryDbService.js";
import { LlmCallLogger, type LlmCallRecord } from "shared/llm/usageRecorder.js";
import { Logger } from "shared/logger.js";
import { imageCallCostUsd, textCallCostUsd } from "./prices.js";
import {
  addSpend,
  bucketTotalOn,
  totalsSince,
  utcDay,
  type DailySpend,
} from "./spendStore.js";

/*
 * Books every AI call's cost to a bucket and enforces the daily ceilings. A
 * story's calls go to its origin ("anonymous" or "account"); calls tied to no
 * story (the template editor's AI and images, the content filter) go to
 * "other", which is recorded so the totals can be compared with the OpenAI
 * bill but never ceilinged. A bucket over its ceiling refuses new stories
 * (storyRoutes.ts) and new images (StoryImageJobs.ts); stories already
 * running keep their text. Recording never throws into a model call, and a
 * store that can't be read lets requests through.
 */

const log = Logger.forService("Spend");

/** Who an image is charged to: its story, or "other" for the template editor. */
export type SpendCharge = { storyId: string } | { bucket: "other" };

/** US$ a day per ceilinged bucket; null records only. */
export type SpendCeilings = { anonymous: number | null; account: number | null };

const CEILING_SETTINGS: Record<keyof SpendCeilings, string> = {
  anonymous: "SPEND_CEILING_ANONYMOUS_USD_PER_DAY",
  account: "SPEND_CEILING_ACCOUNT_USD_PER_DAY",
};

function parseCeiling(name: string, raw: string | undefined): number | null {
  const value = raw?.trim() ?? "";
  if (value === "") return null;
  const usd = Number(value);
  if (!Number.isFinite(usd) || usd < 0) {
    throw new Error(`${name} must be a number of US$ of 0 or more, or unset`);
  }
  return usd;
}

/** The ceilings in the environment. Unset records only; 0 refuses everything in its bucket. */
export function resolveSpendCeilings(env: NodeJS.ProcessEnv): SpendCeilings {
  return {
    anonymous: parseCeiling(CEILING_SETTINGS.anonymous, env[CEILING_SETTINGS.anonymous]),
    account: parseCeiling(CEILING_SETTINGS.account, env[CEILING_SETTINGS.account]),
  };
}

let configuredCeilings: SpendCeilings | undefined;

/** The configured ceilings, read once. index.ts calls it before listening, so a bad value refuses startup. */
export function spendCeilings(): SpendCeilings {
  if (!configuredCeilings) {
    configuredCeilings = resolveSpendCeilings(process.env);
    log.log(`daily spend ceilings (US$, null records only) ${JSON.stringify(configuredCeilings)}`);
  }
  return configuredCeilings;
}

function storyBucket(storyId: string): Promise<SpendBucket> {
  return storyDbService.getStoryOrigin(storyId);
}

/** Books a finished text call. A failed call reports no usage, so it is skipped. */
export async function recordTextCall(record: LlmCallRecord): Promise<void> {
  if (!record.metrics) return;
  try {
    const bucket = record.storyId ? await storyBucket(record.storyId) : "other";
    const usd = textCallCostUsd(record.metrics.model ?? record.model, record.metrics);
    await addSpend(utcDay(new Date()), bucket, usd, "text");
  } catch (error) {
    log.error("Could not record a text call's spend", error);
  }
}

/** The LangChain callback that books each text call, beside the call log (usageRecorder.ts). */
export const textSpendCallback = new LlmCallLogger((record) => {
  void recordTextCall(record);
});

/** Books a written image by the usage the Images API reported. */
export async function recordImageCall(
  charge: SpendCharge,
  model: string,
  usage: ImageApiUsage | undefined
): Promise<void> {
  try {
    const bucket = "storyId" in charge ? await storyBucket(charge.storyId) : charge.bucket;
    await addSpend(utcDay(new Date()), bucket, imageCallCostUsd(model, usage), "image");
  } catch (error) {
    log.error("Could not record an image's spend", error);
  }
}

/** Whether today's spend in the bucket has reached its ceiling. Unset, "other" or an unreadable store: false. */
export async function isOverCeiling(
  bucket: SpendBucket,
  ceilings: SpendCeilings = spendCeilings(),
  now: Date = new Date()
): Promise<boolean> {
  if (bucket === "other") return false;
  const ceiling = ceilings[bucket];
  if (ceiling === null) return false;
  try {
    return (await bucketTotalOn(utcDay(now), bucket)) >= ceiling;
  } catch (error) {
    // A database outage blocks starts anyway; a ledger hiccup must not
    log.error("Could not read today's spend; letting the request through", error);
    return false;
  }
}

/** Whether a running story may still get new images today (StoryImageJobDeps.mayGenerate). */
export async function imagesAllowedFor(
  storyId: string,
  ceilings: SpendCeilings = spendCeilings(),
  now: Date = new Date()
): Promise<boolean> {
  try {
    return !(await isOverCeiling(await storyBucket(storyId), ceilings, now));
  } catch (error) {
    log.error("Could not read the story's origin; allowing its images", error);
    return true;
  }
}

function noSpend(): SpendBucketTotal {
  return { usd: 0, textCalls: 0, imageCalls: 0 };
}

function addTo(total: SpendBucketTotal, row: DailySpend): void {
  total.usd += row.usd;
  total.textCalls += row.textCalls;
  total.imageCalls += row.imageCalls;
}

/** Today's and this month's totals per bucket (UTC), with the ceilings, for /admin/system. */
export async function spendTotals(
  ceilings: SpendCeilings = spendCeilings(),
  now: Date = new Date()
): Promise<SpendTotals> {
  const today = utcDay(now);
  const monthStart = `${today.slice(0, 8)}01`;
  const bucket = (ceilingUsdPerDay: number | null) => ({
    today: noSpend(),
    month: noSpend(),
    ceilingUsdPerDay,
  });
  const buckets: SpendTotals["buckets"] = {
    anonymous: bucket(ceilings.anonymous),
    account: bucket(ceilings.account),
    other: bucket(null),
  };
  for (const row of await totalsSince(monthStart)) {
    addTo(buckets[row.bucket].month, row);
    if (row.day === today) addTo(buckets[row.bucket].today, row);
  }
  return { today, monthStart, buckets };
}
