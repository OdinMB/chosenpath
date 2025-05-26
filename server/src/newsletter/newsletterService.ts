import axios from "axios";
import { Logger } from "shared/logger.js";

/**
 * Result of a newsletter subscription operation
 */
export interface SubscriptionResult {
  success: boolean;
  message: string;
  data?: any;
}

/**
 * Mailjet contact response
 */
interface MailjetContactResponse {
  Count: number;
  Data: Array<{
    ID: number;
    Email: string;
    Name: string;
    IsExcludedFromCampaigns: boolean;
    CreatedAt: string;
    ExclusionFromCampaignsUpdatedAt: string;
  }>;
  Total: number;
}

/**
 * Service to handle newsletter subscriptions via Mailjet API
 */
export const subscribeToNewsletter = async (
  email: string
): Promise<SubscriptionResult> => {
  try {
    const apiKey = process.env.MAILJET_API_KEY;
    const secretKey = process.env.MAILJET_SECRET_KEY;

    if (!apiKey || !secretKey) {
      throw new Error("Mailjet API credentials are not configured");
    }

    const response = await axios.post<MailjetContactResponse>(
      "https://api.mailjet.com/v3/REST/contact",
      {
        Email: email,
        IsExcludedFromCampaigns: false,
        Name: email.split("@")[0], // Use part before @ as name
      },
      {
        auth: {
          username: apiKey,
          password: secretKey,
        },
      }
    );

    Logger.Route.log(`User with email ${email} subscribed to newsletter`);

    return {
      success: true,
      message: "Subscription successful",
      data: response.data,
    };
  } catch (error) {
    // Mailjet returns 400 if email already exists, which is not really an error
    if (axios.isAxiosError(error) && error.response?.status === 400) {
      const errorData = error.response?.data;

      // Check if this is the "already exists" error
      if (
        errorData &&
        errorData.ErrorMessage &&
        errorData.ErrorMessage.includes("already exists")
      ) {
        Logger.Route.log(
          `User with email ${email} already subscribed to newsletter`
        );
        return {
          success: true,
          message: "You're already subscribed!",
        };
      }
    }

    const errorMessage = axios.isAxiosError(error)
      ? error.response?.data?.ErrorMessage || error.message
      : error instanceof Error
      ? error.message
      : "Unknown error";

    Logger.Route.error(`Newsletter subscription failed: ${errorMessage}`);

    return {
      success: false,
      message: "Failed to subscribe to newsletter",
    };
  }
};
