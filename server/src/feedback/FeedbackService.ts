import { v4 as uuidv4 } from "uuid";
import { Pool } from "pg";
import { getDb } from "../shared/db.js";
import { Logger } from "../shared/logger.js";
import { FeedbackType, FeedbackRating } from "core/types/api.js";

interface SaveFeedbackOptions {
  type: FeedbackType;
  rating: FeedbackRating;
  comment: string;
  storyId?: string;
  storyTitle?: string;
  contactInfo?: string;
  storyText?: string;
  userId?: string | null;
}

export async function saveFeedback({
  type,
  rating,
  comment,
  storyId,
  storyTitle,
  contactInfo,
  storyText,
  userId,
}: SaveFeedbackOptions): Promise<string> {
  const db: Pool = getDb();
  const feedbackId = `feedback_${uuidv4()}`;
  const timestamp = Date.now();

  try {
    // Log user ID for debugging
    if (userId) {
      Logger.DB.log(`Saving feedback with user ID: ${userId}`);
    } else {
      Logger.DB.log(`Saving feedback without user ID (anonymous feedback)`);
    }

    // Log story information for debugging
    if (storyId) {
      Logger.DB.log(
        `Feedback for story ID: ${storyId}, title: ${storyTitle || "unknown"}`
      );
    }

    const query = `
      INSERT INTO feedback (
        id,
        type,
        rating,
        comment,
        story_id,
        story_title,
        contact_info,
        story_text,
        user_id,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `;

    const values = [
      feedbackId,
      type,
      rating,
      comment,
      storyId || null,
      storyTitle || null,
      contactInfo,
      storyText,
      userId,
      timestamp,
    ];

    const result = await db.query(query, values);
    Logger.DB.log(`Feedback saved with ID: ${feedbackId}`);
    return feedbackId;
  } catch (error) {
    Logger.DB.error("Error saving feedback:", error);
    throw new Error("Failed to save feedback");
  }
}
