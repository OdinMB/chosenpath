import express from "express";
import { subscribeToNewsletter } from "users/newsletterService.js";
import { Logger } from "shared/logger.js";
import {
  sendError,
  sendSuccess,
  sendBadRequest,
} from "shared/responseUtils.js";
import {
  NewsletterSubscriptionRequest,
  NewsletterSubscriptionResponse,
} from "core/types/api.js";

const router = express.Router();

/**
 * Subscribe user to newsletter
 * POST /newsletter/subscribe
 * Body: { email: string }
 */
router.post("/newsletter/subscribe", async (req, res) => {
  const requestId =
    (req.query.requestId as string) ||
    (req.body && req.body.requestId) ||
    "unknown";

  const request = req.body as NewsletterSubscriptionRequest;
  const { email } = request;

  if (!email || typeof email !== "string") {
    Logger.Route.error("Newsletter subscription failed: Email is required");
    return sendBadRequest(res, "Email is required", requestId);
  }

  try {
    const result = await subscribeToNewsletter(email);

    if (result.success) {
      const response: NewsletterSubscriptionResponse = {
        message: result.message,
      };
      return sendSuccess(res, response, requestId);
    } else {
      return sendBadRequest(res, result.message, requestId);
    }
  } catch (error) {
    Logger.Route.error("Newsletter subscription failed", error);
    return sendError(
      res,
      error instanceof Error ? error.message : "Subscription failed",
      500,
      requestId
    );
  }
});

export default router;
