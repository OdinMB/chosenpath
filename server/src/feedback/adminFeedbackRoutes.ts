import { Router } from "express";
import { Logger } from "shared/logger.js";
import { sendSuccess, sendError, sendNotFound } from "shared/responseUtils.js";
import { adminFeedbackService } from "server/feedback/AdminFeedbackService.js";
import { DeleteFeedbackRequest } from "core/types/api.js";
import { GetAdminFeedbackResponse } from "core/types/api.js";
import {
  verifyAdmin,
  canViewFeedback,
  canDeleteFeedback,
} from "users/authMiddleware.js";
import { v4 as uuidv4 } from "uuid";

const router = Router();

// Get list of feedback submissions
router.get(
  "/admin/feedback",
  verifyAdmin(),
  canViewFeedback(),
  async (req, res) => {
    const requestId = (req.query.requestId as string) || uuidv4();
    Logger.Route.log(`[${requestId}] Starting GET /admin/feedback request`);

    try {
      Logger.Route.log(`[${requestId}] Fetching list of feedback submissions`);
      const feedback = await adminFeedbackService.getFeedbackList();
      Logger.Route.log(
        `[${requestId}] Successfully fetched ${feedback.length} feedback submissions`
      );

      Logger.Route.log(`[${requestId}] Sending response`);
      sendSuccess(res, { feedback }, requestId);
      Logger.Route.log(`[${requestId}] Response sent successfully`);
    } catch (error) {
      Logger.Route.error(`[${requestId}] Failed to load feedback`, error);
      sendError(res, "Failed to load feedback", 500, requestId, error);
    }
  }
);

// Delete feedback submission
router.delete(
  "/admin/feedback/:id",
  verifyAdmin(),
  canDeleteFeedback(),
  async (req, res) => {
    const requestId = (req.query.requestId as string) || uuidv4();
    const feedbackId = req.params.id;

    // Validate the request matches DeleteFeedbackRequest type
    const deleteRequest: DeleteFeedbackRequest = {
      feedbackId,
      requestId,
    };

    try {
      Logger.Route.log(`[${requestId}] Deleting feedback: ${feedbackId}`);
      await adminFeedbackService.deleteFeedback(feedbackId);
      Logger.Route.log(
        `[${requestId}] Successfully deleted feedback: ${feedbackId}`
      );
      sendSuccess(res, { success: true }, requestId);
    } catch (error) {
      if ((error as Error).message === "Feedback not found") {
        Logger.Route.error(`[${requestId}] Feedback not found: ${feedbackId}`);
        return sendNotFound(res, "Feedback not found", requestId);
      }
      Logger.Route.error(
        `[${requestId}] Failed to delete feedback: ${feedbackId}`,
        error
      );
      sendError(res, "Failed to delete feedback", 500, requestId, error);
    }
  }
);

export default router;
