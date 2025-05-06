import { useState } from "react";
import { API_CONFIG } from "core/config";
import { ResponseStatus } from "core/types/api";

export function useNewsletter() {
  const [isNewsletterModalOpen, setIsNewsletterModalOpen] = useState(false);

  const handleSubscribe = async (email: string) => {
    try {
      // In development, use the proxy; in production, use the full API URL
      const apiUrl = `${API_CONFIG.DEFAULT_API_URL}/newsletter/subscribe`;

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      // Check if there's a content type and content
      const contentType = response.headers.get("content-type");

      // If response has no content or empty body
      if (!contentType) {
        if (response.ok) {
          // If status is OK but no content, consider it a success
          return;
        } else {
          // Non-OK status with no content is an error
          throw new Error(`Failed to subscribe: ${response.status}`);
        }
      }

      // Only try to parse as JSON if content type is application/json
      if (contentType && contentType.includes("application/json")) {
        const data = await response.json();

        // Check for error response
        if (
          data.status === ResponseStatus.ERROR ||
          data.status === ResponseStatus.INVALID
        ) {
          throw new Error(data.errorMessage || `Error: ${response.status}`);
        }

        // If not success status in the JSON, also treat as error
        if (data.status !== ResponseStatus.SUCCESS && !response.ok) {
          throw new Error(
            data.errorMessage || `Failed to subscribe: ${response.status}`
          );
        }

        // Otherwise, if we have JSON and response.ok, this is a success
        return;
      }

      // If we get here, content type is not JSON but response may still be ok
      if (!response.ok) {
        throw new Error(`Failed to subscribe: ${response.status}`);
      }
    } catch (error) {
      // Rethrow any error that might occur during JSON parsing or networking
      if (error instanceof Error) {
        throw error;
      } else {
        throw new Error("An unknown error occurred");
      }
    }
  };

  const openNewsletterModal = () => {
    setIsNewsletterModalOpen(true);
  };

  const closeNewsletterModal = () => {
    setIsNewsletterModalOpen(false);
  };

  return {
    isNewsletterModalOpen,
    openNewsletterModal,
    closeNewsletterModal,
    handleSubscribe,
  };
}
