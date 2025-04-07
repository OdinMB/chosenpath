import { useState } from "react";
import { FeedbackModal } from "./FeedbackModal";
import { Icons } from "@components/ui/Icons";

interface BeatFeedbackProps {
  storyText?: string;
}

export function BeatFeedback({ storyText }: BeatFeedbackProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [initialRating, setInitialRating] = useState<
    "positive" | "negative" | null
  >(null);

  const openWithRating = (rating: "positive" | "negative") => {
    setInitialRating(rating);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    // Reset rating after the modal is fully closed
    setTimeout(() => setInitialRating(null), 300);
  };

  return (
    <>
      <div className="flex items-center justify-end gap-3 py-2 px-4 mb-2 mt-0 bg-white rounded-lg shadow-sm border border-primary-100 w-fit ml-auto">
        <h3 className="text-sm text-primary font-semibold">Like this beat?</h3>

        <div className="flex items-center gap-2">
          <button
            className="w-8 h-8 flex items-center justify-center bg-white rounded-md shadow-sm border border-green-200 hover:border-green-400 hover:shadow transition-all"
            onClick={() => openWithRating("positive")}
            aria-label="Positive feedback"
          >
            <Icons.ThumbsUp className="w-5 h-5 text-gray-500 hover:text-green-600 transition-colors" />
          </button>

          <button
            className="w-8 h-8 flex items-center justify-center bg-white rounded-md shadow-sm border border-red-200 hover:border-red-400 hover:shadow transition-all"
            onClick={() => openWithRating("negative")}
            aria-label="Negative feedback"
          >
            <Icons.ThumbsDown className="w-5 h-5 text-gray-500 hover:text-red-600 transition-colors" />
          </button>
        </div>
      </div>

      <FeedbackModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        mode="story-beat"
        initialRating={initialRating}
        storyText={storyText}
      />
    </>
  );
}
