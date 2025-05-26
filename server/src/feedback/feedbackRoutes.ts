import express, { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { saveFeedback } from "server/feedback/FeedbackService.js";
import { sendSuccess, sendError } from "shared/responseUtils.js";
import { SubmitFeedbackRequest } from "core/types/api.js";
import { Logger } from "shared/logger.js";
import { verifyUser } from "users/authMiddleware.js";

const router = express.Router();

const submitFeedbackSchema = z.object({
  type: z.enum(["beat", "general", "issue", "suggestion"]),
  rating: z.enum(["positive", "negative"]).nullable(),
  comment: z.string(),
  storyId: z.string().optional(),
  storyTitle: z.string().optional(),
  contactInfo: z.string().optional(),
  storyText: z.string().optional(),
  requestId: z.string().optional(),
});

// Custom validation middleware
function validateRequest(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedData = schema.parse(req.body);
      req.body = validatedData;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessage = error.errors
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join(", ");
        Logger.Route.error(`Validation error: ${errorMessage}`);
        return sendError(
          res,
          `Invalid request: ${errorMessage}`,
          400,
          req.body?.requestId
        );
      }
      return sendError(res, "Invalid request", 400, req.body?.requestId);
    }
  };
}

// Submit feedback endpoint
router.post(
  "/submit",
  verifyUser({ required: false }),
  validateRequest(submitFeedbackSchema),
  async (req, res) => {
    try {
      const {
        type,
        rating,
        comment,
        storyId,
        storyTitle,
        contactInfo,
        storyText,
        requestId,
      } = req.body as SubmitFeedbackRequest;

      // Get user id if authenticated
      const userId = req.user?.id || null;

      if (userId) {
        Logger.Route.log(`Feedback submitted by authenticated user: ${userId}`);
      }

      const feedbackId = await saveFeedback({
        type,
        rating,
        comment,
        storyId,
        storyTitle,
        contactInfo,
        storyText,
        userId,
      });

      return sendSuccess(res, { feedbackId }, requestId);
    } catch (error) {
      return sendError(
        res,
        "Failed to submit feedback",
        500,
        req.body.requestId,
        error
      );
    }
  }
);

export default router;
