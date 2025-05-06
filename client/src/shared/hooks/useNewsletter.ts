import { useState } from "react";
import { API_BASE_URL } from "shared/config";

export function useNewsletter() {
  const [isNewsletterModalOpen, setIsNewsletterModalOpen] = useState(false);

  const handleSubscribe = async (email: string) => {
    const response = await fetch(`${API_BASE_URL}/newsletter/subscribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.errorMessage || "Failed to subscribe");
    }

    const data = await response.json();
    if (data.status !== "success") {
      throw new Error(data.errorMessage || "Failed to subscribe");
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
