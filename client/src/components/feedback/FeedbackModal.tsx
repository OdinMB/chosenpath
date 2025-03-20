import React, { useState } from "react";
import { useSession } from "../../hooks/useSession.js";
import { PrimaryButton } from "../ui/PrimaryButton.js";

// Types for feedback
type FeedbackType = "story" | "general" | "issue" | "idea";
type FeedbackRating = "positive" | "negative" | null;

interface FeedbackData {
  type: FeedbackType;
  rating: FeedbackRating;
  comment: string;
  storyId?: string;
  beatIndex?: number;
  contactInfo?: string;
}

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "story-beat" | "general";
  initialRating?: FeedbackRating;
}

// Helper function to submit form in a CORS-compatible way
function submitFormToGoogleScript(
  url: string,
  params: URLSearchParams
): Promise<void> {
  return new Promise<void>((resolve) => {
    // Create a hidden iframe to avoid page redirect
    const iframe = document.createElement("iframe");
    iframe.name = "hidden_iframe";
    iframe.style.display = "none";
    document.body.appendChild(iframe);

    // Create a form element
    const form = document.createElement("form");
    form.method = "POST";
    form.action = url;
    form.target = "hidden_iframe";

    // Add form fields from URLSearchParams
    for (const [key, value] of params.entries()) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      input.value = value.toString();
      form.appendChild(input);
    }

    // Setup the iframe onload to resolve the promise
    iframe.onload = () => {
      // Clean up after a short delay to ensure the form submission completes
      setTimeout(() => {
        try {
          document.body.removeChild(form);
          document.body.removeChild(iframe);
        } catch (e) {
          console.warn("Failed to remove form elements:", e);
        }
        resolve();
      }, 500);
    };

    // Add the form to the document and submit it
    document.body.appendChild(form);
    form.submit();
  });
}

export function FeedbackModal({
  isOpen,
  onClose,
  mode,
  initialRating = null,
}: FeedbackModalProps) {
  const { storyState } = useSession();

  // State for feedback form
  const [type, setType] = useState<FeedbackType>(
    mode === "story-beat" ? "story" : "general"
  );
  const [rating, setRating] = useState<FeedbackRating>(initialRating);
  const [comment, setComment] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Compute current beat index
  const playerSlotId = storyState?.players
    ? Object.keys(storyState.players)[0]
    : undefined;
  const playerState = playerSlotId
    ? storyState?.players[playerSlotId]
    : undefined;
  const beatHistory = playerState?.beatHistory || [];
  const currentBeatIndex = beatHistory.length - 1;

  // Handle submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);

    const feedbackData: FeedbackData = {
      type,
      rating,
      comment,
      contactInfo: contactInfo || undefined,
    };

    // Add story-specific data if in story beat mode
    if (mode === "story-beat" && storyState) {
      feedbackData.storyId = storyState.title;
      feedbackData.beatIndex = currentBeatIndex;
    }

    try {
      // Your deployed Google Apps Script web app URL
      const scriptUrl =
        "https://script.google.com/macros/s/AKfycbzFmU6A6xWduf3jyzTwMwN3x1mvE5T5YABKJVMOG9p60KJs-zCOE7NKz1m6NJaV1oyK/exec";

      // Create URLSearchParams for the request
      const params = new URLSearchParams();
      params.append("feedbackType", feedbackData.type);
      if (feedbackData.rating) {
        params.append("rating", feedbackData.rating);
      }
      params.append("comments", feedbackData.comment);

      if (feedbackData.storyId) {
        params.append("storyId", feedbackData.storyId);
      }

      if (feedbackData.beatIndex !== undefined) {
        params.append("beatIndex", feedbackData.beatIndex.toString());
      }

      if (feedbackData.contactInfo) {
        params.append("contactInfo", feedbackData.contactInfo);
      }

      // Use the form submission approach directly since it works reliably
      await submitFormToGoogleScript(scriptUrl, params);
      console.log("Feedback submitted successfully");

      setIsSubmitted(true);
      setTimeout(() => {
        onClose();
        setIsSubmitted(false);
        setRating(initialRating);
        setComment("");
        setContactInfo("");
      }, 1500);
    } catch (error) {
      console.error("Error submitting feedback:", error);
      setSubmitError("Failed to submit feedback. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  // If feedback is submitted, show a thank you message
  if (isSubmitted) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 font-lora">
        <div className="bg-white rounded-lg p-8 max-w-md w-full shadow-xl border border-primary-100">
          <h2 className="text-2xl font-bold mb-4 text-primary">Thank You!</h2>
          <p className="mb-4 text-primary-800">
            Your feedback has been submitted successfully.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 font-lora">
      <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl border border-primary-100">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-primary">
            {mode === "story-beat" ? "Story Beat Feedback" : "Share Feedback"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {submitError && (
          <div className="mb-4 p-3 bg-red-100 text-red-800 rounded-md">
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Feedback Type Selection (only in general mode) */}
          {mode === "general" && (
            <div className="mb-4">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "general", label: "Feedback" },
                  { id: "issue", label: "Issue" },
                  { id: "idea", label: "Suggestion" },
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`
                      border-l-4 border rounded-lg p-2 cursor-pointer transition-all duration-200 text-sm bg-white
                      ${
                        type === option.id
                          ? "border-secondary shadow-md text-primary"
                          : "border-primary-100 shadow-sm hover:border-secondary hover:shadow-md text-primary"
                      }
                    `}
                    onClick={() => setType(option.id as FeedbackType)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Thumbs up/down in story-beat mode */}
          {mode === "story-beat" && (
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2 text-primary">
                How do you feel about this story beat?
              </label>
              <div className="flex gap-4 justify-center">
                <button
                  type="button"
                  className={`p-3 rounded-full transition-colors
                    ${
                      rating === "positive"
                        ? "bg-secondary/20 text-secondary"
                        : "text-gray-400 hover:text-secondary"
                    }`}
                  onClick={() => setRating("positive")}
                >
                  <svg
                    className="w-8 h-8"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M2 20h2c.55 0 1-.45 1-1v-9c0-.55-.45-1-1-1H2v11zm19.83-7.12c.11-.25.17-.52.17-.8V11c0-1.1-.9-2-2-2h-5.5l.92-4.65c.05-.22.02-.46-.08-.66-.23-.45-.52-.86-.88-1.22L14 2 7.59 8.41C7.21 8.79 7 9.3 7 9.83v7.84C7 18.95 8.05 20 9.34 20h8.11c.7 0 1.36-.37 1.72-.97l2.66-6.15z" />
                  </svg>
                </button>
                <button
                  type="button"
                  className={`p-3 rounded-full transition-colors
                    ${
                      rating === "negative"
                        ? "bg-red-100 text-red-600"
                        : "text-gray-400 hover:text-red-600"
                    }`}
                  onClick={() => setRating("negative")}
                >
                  <svg
                    className="w-8 h-8"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M22 4h-2c-.55 0-1 .45-1 1v9c0 .55.45 1 1 1h2V4zM2.17 11.12c-.11.25-.17.52-.17.8V13c0 1.1.9 2 2 2h5.5l-.92 4.65c-.05.22-.02.46.08.66.23.45.52.86.88 1.22L10 22l6.41-6.41c.38-.38.59-.89.59-1.42V6.34C17 5.05 15.95 4 14.66 4h-8.1c-.71 0-1.36.37-1.72.97l-2.67 6.15z" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Comment field */}
          <div className="mb-4">
            <label className="block font-medium mb-2 text-primary">
              {mode === "story-beat"
                ? "Additional comments (optional)"
                : "Your feedback"}
            </label>
            <textarea
              className="w-full border rounded-lg p-2 h-24 border-primary-100 focus:ring-2 focus:ring-accent focus:border-accent"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="The good and the bad"
            ></textarea>
          </div>

          {/* Contact info (only in general mode) */}
          {mode === "general" && (
            <div className="mb-4">
              <label className="block font-medium mb-2 text-primary">
                Contact (optional)
              </label>
              <input
                type="text"
                className="w-full border rounded-lg p-2 border-primary-100 focus:ring-2 focus:ring-accent focus:border-accent"
                value={contactInfo}
                onChange={(e) => setContactInfo(e.target.value)}
              />
            </div>
          )}

          {/* Submit button */}
          <PrimaryButton
            type="submit"
            disabled={isSubmitting || (mode === "story-beat" && !rating)}
            isLoading={isSubmitting}
            fullWidth
          >
            {isSubmitting ? "Submitting..." : "Submit Feedback"}
          </PrimaryButton>
        </form>
      </div>
    </div>
  );
}
