import { useCallback, useEffect, useState } from "react";
import {
  SPEND_BUCKETS,
  type ConnectionReport,
  type SpendBucket,
  type SpendBucketTotal,
  type SpendTotals,
  type UnreadableAddressCounts,
} from "core/types/api";
import { LoadingSpinner, PrimaryButton } from "components/ui";
import { adminSystemApi } from "../adminApi";
import {
  clientAddressVerdict,
  describeUnreadableCounts,
  describeVerdict,
  FORGED_ADDRESS,
} from "./clientAddressVerdict";

/*
 * /admin/system: whether the per-address limits see real visitors' addresses
 * (TRUST_PROXY), and what the AI calls cost today and this month.
 */

const BUCKET_LABELS: Record<SpendBucket, string> = {
  anonymous: "Stories without an account",
  account: "Stories of signed-in users",
  other: "Editor and content filter",
};

function usd(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

function totalLine(total: SpendBucketTotal): string {
  return `${usd(total.usd)} · ${total.textCalls} text, ${total.imageCalls} image calls`;
}

/** A bucket's ceiling as the page states it. */
function ceilingLine(
  bucket: SpendBucket,
  ceiling: number | null,
  todayUsd: number
): string {
  if (bucket === "other") return "never limited";
  if (ceiling === null) return "not set (recording only)";
  return `${usd(ceiling)} a day, today: ${todayUsd >= ceiling ? "reached" : "under"}`;
}

function AddressCheckPanel() {
  const [reports, setReports] = useState<{
    plain: ConnectionReport;
    forged: ConnectionReport;
    unreadable: UnreadableAddressCounts;
  } | null>(null);
  const [failed, setFailed] = useState(false);

  const check = useCallback(async () => {
    setFailed(false);
    try {
      const plain = await adminSystemApi.getConnection();
      const forged = await adminSystemApi.getConnection(FORGED_ADDRESS);
      const unreadable = await adminSystemApi.getAddressCounts();
      setReports({ plain, forged, unreadable });
    } catch {
      // The API client has shown what went wrong
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  return (
    <section className="p-4 bg-white rounded-lg border border-primary-100 shadow-sm space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium text-primary">Client address</h2>
        <PrimaryButton type="button" size="sm" variant="outline" onClick={() => void check()}>
          Check again
        </PrimaryButton>
      </div>
      <p className="text-sm text-gray-700">
        Open this page on chosenpath.ai once from home and once from a phone on
        mobile data. It sends a second request with the forged entry{" "}
        <code>{FORGED_ADDRESS}</code> and reads where it lands.
      </p>
      {!reports && !failed && <LoadingSpinner message="Checking" />}
      {failed && (
        <p className="text-sm text-gray-700">The check failed. Try again.</p>
      )}
      {reports && (
        <dl className="grid grid-cols-1 sm:grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="font-medium text-primary">Verdict</dt>
          <dd>{describeVerdict(clientAddressVerdict(reports.forged))}</dd>
          <dt className="font-medium text-primary">Requests without a readable address</dt>
          <dd>{describeUnreadableCounts(reports.unreadable)}</dd>
          <dt className="font-medium text-primary">Your address, as limits see it</dt>
          <dd>{reports.plain.address ?? "unknown (shares one bucket)"}</dd>
          <dt className="font-medium text-primary">TRUST_PROXY</dt>
          <dd>{reports.plain.trustProxy ?? "not set"}</dd>
          <dt className="font-medium text-primary">X-Forwarded-For (forged request)</dt>
          <dd className="break-all">
            {reports.forged.forwardedFor.join(", ") || "none"}
          </dd>
          <dt className="font-medium text-primary">Socket address</dt>
          <dd>{reports.plain.connectionAddress ?? "unknown"}</dd>
          <dt className="font-medium text-primary">Host</dt>
          <dd>
            {reports.plain.host ?? "unknown"} ({reports.plain.protocol})
          </dd>
        </dl>
      )}
    </section>
  );
}

function SpendPanel() {
  const [totals, setTotals] = useState<SpendTotals | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    adminSystemApi
      .getSpend()
      .then((result) => {
        if (!cancelled) setTotals(result);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="p-4 bg-white rounded-lg border border-primary-100 shadow-sm space-y-3">
      <h2 className="text-lg font-medium text-primary">AI spend</h2>
      <p className="text-sm text-gray-700">
        Estimated from each call's reported usage, in UTC days. Compare with the
        OpenAI bill.
      </p>
      {!totals && !failed && <LoadingSpinner message="Loading the totals" />}
      {failed && (
        <p className="text-sm text-gray-700">The totals couldn't be loaded.</p>
      )}
      {totals && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-primary">
                <th className="py-2 pr-4 font-medium">Kind</th>
                <th className="py-2 pr-4 font-medium">Today ({totals.today})</th>
                <th className="py-2 pr-4 font-medium">
                  Since {totals.monthStart}
                </th>
                <th className="py-2 font-medium">Daily ceiling</th>
              </tr>
            </thead>
            <tbody>
              {SPEND_BUCKETS.map((bucket) => {
                const entry = totals.buckets[bucket];
                return (
                  <tr key={bucket} className="border-t border-primary-100 align-top">
                    <th scope="row" className="py-2 pr-4 text-left font-normal">
                      {BUCKET_LABELS[bucket]}
                    </th>
                    <td className="py-2 pr-4">{totalLine(entry.today)}</td>
                    <td className="py-2 pr-4">{totalLine(entry.month)}</td>
                    <td className="py-2">
                      {ceilingLine(bucket, entry.ceilingUsdPerDay, entry.today.usd)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function AdminSystemPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-secondary">System</h1>
      <AddressCheckPanel />
      <SpendPanel />
    </div>
  );
}
