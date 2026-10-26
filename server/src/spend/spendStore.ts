import type { SpendBucket } from "core/types/api.js";
import { getDb } from "shared/db.js";

/*
 * The spend_daily table (shared/db.ts creates it): one row per UTC day and
 * bucket with its AI cost and call counts. Totals only: no user, address,
 * story or text. Each call writes straight to the database, so the totals
 * survive restarts and add up across instances.
 */

export type SpendKind = "text" | "image";

export type DailySpend = {
  day: string;
  bucket: SpendBucket;
  usd: number;
  textCalls: number;
  imageCalls: number;
};

/** The UTC day as YYYY-MM-DD. */
export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Adds one call's cost to its day and bucket. */
export async function addSpend(
  day: string,
  bucket: SpendBucket,
  usd: number,
  kind: SpendKind
): Promise<void> {
  await getDb().query(
    `INSERT INTO spend_daily (day, bucket, usd, text_calls, image_calls, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (day, bucket) DO UPDATE SET
       usd = spend_daily.usd + EXCLUDED.usd,
       text_calls = spend_daily.text_calls + EXCLUDED.text_calls,
       image_calls = spend_daily.image_calls + EXCLUDED.image_calls,
       updated_at = EXCLUDED.updated_at`,
    [day, bucket, usd, kind === "text" ? 1 : 0, kind === "image" ? 1 : 0, Date.now()]
  );
}

/** A bucket's cost on a day, 0 when nothing was spent. */
export async function bucketTotalOn(
  day: string,
  bucket: SpendBucket
): Promise<number> {
  const result = await getDb().query<{ usd: string }>(
    "SELECT usd FROM spend_daily WHERE day = $1 AND bucket = $2",
    [day, bucket]
  );
  const row = result.rows[0];
  return row ? Number(row.usd) : 0;
}

/** Every day's rows from a day on (NUMERIC arrives as text, DATE as text here). */
export async function totalsSince(firstDay: string): Promise<DailySpend[]> {
  const result = await getDb().query<{
    day: string;
    bucket: SpendBucket;
    usd: string;
    text_calls: number;
    image_calls: number;
  }>(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day, bucket, usd, text_calls, image_calls
     FROM spend_daily WHERE day >= $1 ORDER BY day, bucket`,
    [firstDay]
  );
  return result.rows.map((row) => ({
    day: row.day,
    bucket: row.bucket,
    usd: Number(row.usd),
    textCalls: row.text_calls,
    imageCalls: row.image_calls,
  }));
}
