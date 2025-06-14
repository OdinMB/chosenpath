import { adminFeedbackApi } from "../../../admin/adminApi.js";
import { FeedbackItem } from "core/types/api.js";

export const feedbackLoader = async (): Promise<FeedbackItem[]> => {
  return await adminFeedbackApi.getFeedback();
};
