import { useCallback, useEffect, useState } from "react";
import { storyApi } from "shared/apiClient";
import { Logger } from "shared/logger";
import {
  startsLeftAt,
  startsLeftFrom,
  type StartsLeft,
} from "page/utils/startsLeft";

// Renew just after the allowance does, not on the second it does
const RENEWAL_MARGIN_MS = 1000;

/**
 * The signed-in account's story starts left, for "Start several stories at
 * once": read whenever `enabled` turns on, on refresh() (after a start
 * that started nothing), and for each new sign-in (`account`, the signed-in
 * user), such as after the sign-in lapsed. When the allowance renews, the
 * whole of it is shown without asking the server again, so no read can fail
 * while nobody acts. Null until the first read, and when a read fails: the
 * panel then shows no count, and the start meets its limit as before.
 */
export function useStartsLeft(
  enabled: boolean,
  account?: object | null
): {
  startsLeft: StartsLeft | null;
  refresh: () => void;
} {
  const [startsLeft, setStartsLeft] = useState<StartsLeft | null>(null);
  const [reads, setReads] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let current = true;
    storyApi
      .getStartsLeft()
      .then((info) => {
        if (current) setStartsLeft(startsLeftFrom(info, Date.now()));
      })
      .catch((error: unknown) => {
        Logger.App.warn("Couldn't read the starts left", error);
        if (current) setStartsLeft(null);
      });
    return () => {
      current = false;
    };
  }, [enabled, reads, account]);

  const renewsAt = startsLeft?.renewsAt ?? null;
  useEffect(() => {
    if (!enabled || renewsAt === null) return;
    const timer = setTimeout(
      () => setStartsLeft((current) => current && startsLeftAt(current, Date.now())),
      Math.max(0, renewsAt - Date.now()) + RENEWAL_MARGIN_MS
    );
    return () => clearTimeout(timer);
  }, [enabled, renewsAt]);

  const refresh = useCallback(() => setReads((count) => count + 1), []);

  return {
    startsLeft: startsLeft && startsLeftAt(startsLeft, Date.now()),
    refresh,
  };
}
