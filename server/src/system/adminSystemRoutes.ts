import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { verifyAdmin } from "users/authMiddleware.js";
import { describeRequest } from "shared/clientAddress.js";
import { sendError, sendSuccess } from "shared/responseUtils.js";
import { unreadableAddressCounts } from "shared/unreadableAddresses.js";
import { spendTotals } from "server/spend/spendLedger.js";

/*
 * The admin "System" page's read-only routes: how the server sees the admin's
 * own request and how many requests' address it could not read (both for
 * setting TRUST_PROXY, .context/deployment.md), and today's and this month's
 * AI spend per bucket with the ceilings.
 */

const router = Router();

// The caller's own request only, with a fixed set of keys; reads, stores and
// logs nothing of it, and must never be cached
router.get("/admin/system/connection", verifyAdmin(), (req, res) => {
  const requestId = (req.query.requestId as string) || uuidv4();
  res.set("Cache-Control", "private, no-store");
  sendSuccess(res, describeRequest(req), requestId);
});

// Counts only, no addresses
router.get("/admin/system/addresses", verifyAdmin(), (req, res) => {
  const requestId = (req.query.requestId as string) || uuidv4();
  res.set("Cache-Control", "private, no-store");
  sendSuccess(res, unreadableAddressCounts(), requestId);
});

router.get("/admin/system/spend", verifyAdmin(), async (req, res) => {
  const requestId = (req.query.requestId as string) || uuidv4();
  try {
    sendSuccess(res, await spendTotals(), requestId);
  } catch (error) {
    sendError(res, "Failed to load the spend totals", 500, requestId, error);
  }
});

export default router;
