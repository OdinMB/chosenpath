import { Pool } from "pg";
import { getDb } from "../shared/db.js";
import { Logger } from "../shared/logger.js";
import { FeedbackItem } from "core/types/api.js";

export class AdminFeedbackService {
  private db: Pool;

  constructor() {
    this.db = getDb();
  }

  async getFeedbackList(): Promise<FeedbackItem[]> {
    Logger.DB.log("Fetching feedback list for admin");

    try {
      const query = `
        SELECT 
          f.id,
          f.type,
          f.rating,
          f.comment,
          f.story_id as "storyId",
          f.story_title as "storyTitle",
          f.contact_info as "contactInfo",
          f.story_text as "storyText",
          f.user_id as "userId",
          u.username,
          f.created_at as "createdAt"
        FROM feedback f
        LEFT JOIN users u ON f.user_id = u.id
        ORDER BY f.created_at DESC
      `;

      const result = await this.db.query(query);
      Logger.DB.log(
        `Successfully fetched ${result.rows.length} feedback items`
      );

      // Convert createdAt from string to number
      const feedbackItems: FeedbackItem[] = result.rows.map((row) => ({
        ...row,
        createdAt: parseInt(row.createdAt, 10),
      }));

      return feedbackItems;
    } catch (error) {
      Logger.DB.error("Error fetching feedback list:", error);
      throw new Error("Failed to fetch feedback list");
    }
  }

  async deleteFeedback(feedbackId: string): Promise<void> {
    Logger.DB.log(`Deleting feedback: ${feedbackId}`);

    try {
      const query = `DELETE FROM feedback WHERE id = $1`;
      const result = await this.db.query(query, [feedbackId]);

      if (result.rowCount === 0) {
        throw new Error("Feedback not found");
      }

      Logger.DB.log(`Successfully deleted feedback: ${feedbackId}`);
    } catch (error) {
      Logger.DB.error(`Error deleting feedback: ${feedbackId}`, error);
      throw error;
    }
  }
}

export const adminFeedbackService = new AdminFeedbackService();
