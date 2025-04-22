import React, { useState, useEffect } from "react";
import { useSession } from "shared/useSession";
import { PrimaryButton, Icons } from "components/ui";
// Types for feedback
type FeedbackType = "story" | "general" | "issue" | "idea";
type FeedbackRating = "positive" | "negative" | null;

interface FeedbackData {
  type: FeedbackType;
  rating: FeedbackRating;
  comment: string;
  storyId?: string;
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

    // Add story-specific data if in story beat mode
    if (mode === "story-beat") {
      if (storyState) {
        feedbackData.storyId = storyState.title;
      }
      if (storyText) {
        // Truncate very long story text to avoid URL length issues
        // For Google Apps Script, we need to keep this shorter than for regular APIs
        // We need to make sure this text is properly formatted for transmission
        const truncatedText = storyText.substring(0, 200); // Shorter is more reliable
        feedbackData.storyText = truncatedText
          .replace(/\r?\n/g, " ") // Replace newlines with spaces
          .replace(/"/g, "'") // Replace double quotes with single quotes to avoid JSON issues
          .trim();
        console.log(
          "Story text to be submitted (truncated):",
          feedbackData.storyText
        );
      } else {
        console.log("No story text available to submit");
      }
    }

    try {
      // Your deployed Google Apps Script web app URL
      const scriptUrl =
        "https://script.google.com/macros/s/AKfycbzFmU6A6xWduf3jyzTwMwN3x1mvE5T5YABKJVMOG9p60KJs-zCOE7NKz1m6NJaV1oyK/exec";

      // Instead of relying on the helper function, let's directly create a URLSearchParams object
      // and make a direct GET request which tends to be more reliable with Google Apps Script
      const params = new URLSearchParams();
      params.append("feedbackType", feedbackData.type);
      if (feedbackData.rating) {
        params.append("rating", feedbackData.rating);
      }
      params.append("comments", feedbackData.comment);
      if (feedbackData.storyId) {
        params.append("storyId", feedbackData.storyId);
      }
      if (feedbackData.storyText) {
        // Add the storyText as a URL parameter
        params.append("storyText", feedbackData.storyText);
      }
      if (feedbackData.contactInfo) {
        params.append("contactInfo", feedbackData.contactInfo);
      }

      // Create a direct GET request with parameters in the URL
      const getUrl = `${scriptUrl}?${params.toString()}`;
      console.log(`Submitting GET request with length: ${getUrl.length}`);

      // Use an image to make the request - this is a common way to make GET requests
      // without triggering CORS issues
      const img = new Image();
      img.style.display = "none";
      img.onload = () => console.log("Request succeeded");
      img.onerror = () =>
        console.log("Request completed with expected error (normal)");
      document.body.appendChild(img);
      img.src = getUrl;

      console.log("Feedback submitted successfully");

      // Log the data being submitted
      console.log("All submitted data:", {
        feedbackType: feedbackData.type,
        rating: feedbackData.rating,
        comments: feedbackData.comment,
        storyId: feedbackData.storyId,
        storyText: feedbackData.storyText
          ? feedbackData.storyText.substring(0, 50) + "..."
          : undefined,
        contactInfo: feedbackData.contactInfo,
      });

      setIsSubmitted(true);
      setTimeout(() => {
        // Clean up the image element
        if (document.body.contains(img)) {
          document.body.removeChild(img);
        }

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
            <Icons.Close />
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
              className="w-full border rounded-lg p-2 h-24 border-primary-100 focus:ring-2 focus:ring-accent focus:border-accent"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="The good, the bad, ..."
            ></textarea>
            {/* Leave comment section. We'll figure it out at some point.
            {mode === "story-beat" && (
              <p className="text-xs text-gray-500 mt-1">
                The beat text will be included with your feedback
              </p>
            )} */}
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
