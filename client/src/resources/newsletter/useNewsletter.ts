import { useState } from "react";
import { apiClient } from "shared/apiClient";

export function useNewsletter() {
  const [isNewsletterModalOpen, setIsNewsletterModalOpen] = useState(false);

  const handleSubscribe = async (email: string) => {
    try {
      await apiClient.post("/newsletter/subscribe", { email });
    } catch (error) {
      // Re-throw the error - apiClient already handles error responses
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
