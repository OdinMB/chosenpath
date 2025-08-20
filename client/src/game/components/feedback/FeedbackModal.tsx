import React, { useState, useEffect } from "react";
import { useGameSession } from "game/useGameSession";
import { PrimaryButton, Icons, Modal } from "components/ui";
import { feedbackApi } from "shared/apiClient";
import { FeedbackType, FeedbackRating } from "core/types/api";

interface FeedbackData {
  type: FeedbackType;
  rating: FeedbackRating;
  comment: string;
  storyId?: string;
  storyTitle?: string;
  contactInfo?: string;
  storyText?: string;
}

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "story-beat" | "general";
  initialRating?: FeedbackRating;
  storyText?: string;
}

export function FeedbackModal({
  isOpen,
  onClose,
  mode,
  initialRating = null,
  storyText,
}: FeedbackModalProps) {
  const { storyState } = useGameSession();

  // State for feedback form
  const [type, setType] = useState<FeedbackType>(
    mode === "story-beat" ? "beat" : "general"
  );
  const [rating, setRating] = useState<FeedbackRating>(initialRating);
  const [comment, setComment] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Update rating when initialRating changes
  useEffect(() => {
    if (initialRating) {
      setRating(initialRating);
    }
  }, [initialRating]);

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

    // Add story data if available, regardless of mode
    if (storyState) {
      feedbackData.storyId = storyState.id;
      feedbackData.storyTitle = storyState.title;
    }

    if (storyText) {
      // Store the full story text
      feedbackData.storyText = storyText;
    }

    try {
      // Submit feedback using our new API
      await feedbackApi.submitFeedback({
        type: feedbackData.type,
        rating: feedbackData.rating,
        comment: feedbackData.comment,
        storyId: feedbackData.storyId,
        storyTitle: feedbackData.storyTitle,
        contactInfo: feedbackData.contactInfo,
        storyText: feedbackData.storyText,
      });

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
      <Modal
        isOpen={true}
        onClose={onClose}
        width="md"
        className="font-lora"
        showCloseButton={false}
      >
        <div className="p-4">
          <h2 className="text-2xl font-bold mb-4 text-primary">Thank You!</h2>
          <p className="mb-4 text-primary-800">
            Your feedback has been submitted successfully.
          </p>
        </div>
      </Modal>
    );
  }

  const modalTitle =
    mode === "story-beat" ? "Story Beat Feedback" : "Share Feedback";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle}
      width="md"
      className="font-lora"
    >
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
                { id: "suggestion", label: "Suggestion" },
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
            <div className="flex gap-4 justify-center">
              <button
                type="button"
                className={`w-12 h-12 flex items-center justify-center rounded-md shadow-sm border transition-all
                  ${
                    rating === "positive"
                      ? "bg-white border-green-400 text-green-600 shadow"
                      : "bg-white border-gray-200 text-gray-400 hover:border-green-400 hover:text-green-600 hover:shadow"
                  }`}
                onClick={() => setRating("positive")}
              >
                <Icons.ThumbsUp />
              </button>
              <button
                type="button"
                className={`w-12 h-12 flex items-center justify-center rounded-md shadow-sm border transition-all
                  ${
                    rating === "negative"
                      ? "bg-white border-red-400 text-red-600 shadow"
                      : "bg-white border-gray-200 text-gray-400 hover:border-red-400 hover:text-red-600 hover:shadow"
                  }`}
                onClick={() => setRating("negative")}
              >
                <Icons.ThumbsDown />
              </button>
            </div>
          </div>
        )}

        {/* Comment field */}
        <div className="mb-4">
          <label className="block font-medium mb-2 text-primary">
            {mode === "story-beat" ? "Comments (optional)" : "Your feedback"}
          </label>
          <textarea
            className="w-full border rounded-lg p-2 h-24 border-primary-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent focus:border-accent"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="The good, the bad, ..."
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
              className="w-full border rounded-lg p-2 border-primary-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent focus:border-accent"
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
    </Modal>
  );
}
