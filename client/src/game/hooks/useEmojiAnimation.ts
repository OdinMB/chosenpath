import { useState, useEffect, useRef, useCallback } from "react";
import { Resolution } from "core/types";

interface UseEmojiAnimationProps {
  animateRoll: boolean;
  resolution?: Resolution;
  isChallenge: boolean;
  forceExpanded: boolean;
}

interface UseEmojiAnimationResult {
  isAnimating: boolean;
  showEmoji: boolean;
  currentEmoji: string;
  getFinalEmoji: () => string;
}

export const useEmojiAnimation = ({
  animateRoll,
  resolution,
  isChallenge,
  forceExpanded,
}: UseEmojiAnimationProps): UseEmojiAnimationResult => {
  const [isAnimating, setIsAnimating] = useState(animateRoll);
  const [showEmoji, setShowEmoji] = useState(!animateRoll);
  const [currentEmoji, setCurrentEmoji] = useState<string>("😐");
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const emojiIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate the final emoji based on resolution
  const getFinalEmoji = useCallback(() => {
    if (!resolution) return "😐";
    return resolution === "favorable"
      ? "😀"
      : resolution === "mixed"
      ? "😐"
      : "🙁";
  }, [resolution]);

  useEffect(() => {
    if (animateRoll && isChallenge && resolution) {
      // Reset animation state
      setIsAnimating(true);
      setShowEmoji(false);

      // Clear any existing timeouts
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }

      if (emojiIntervalRef.current) {
        clearInterval(emojiIntervalRef.current);
      }

      // Get the final emoji once to ensure consistent value
      const finalEmoji = getFinalEmoji();

      // Start a very simple emoji cycling animation
      const emojis = ["😀", "😐", "🙁"];
      let emojiIndex = 0;

      // Simple cycling with faster speed at start, slower at end
      const initialSpeed = 60; // Very fast cycling
      const endSpeed = 800; // Slow at the end
      const speedIncrement = 30; // Smaller increment for smoother transition
      let currentSpeed = initialSpeed;
      const animationEndTime = Date.now() + 6000; // Total animation time (6s)

      // Function to update emoji
      const updateEmoji = () => {
        const timeRemaining = animationEndTime - Date.now();

        // If we're getting close to the end (remaining time < 2000ms, about 3 emoji cycles)
        // and we're currently showing the final emoji, stop and keep this emoji
        if (timeRemaining < 2000 && emojis[emojiIndex] === finalEmoji) {
          setCurrentEmoji(finalEmoji);
          return; // Exit early to stop the cycle and keep the final emoji
        }

        // If we're very close to the end (remaining time < 800ms, about 1 cycle)
        // ensure we show the final emoji next
        if (timeRemaining < 800) {
          // Find index of final emoji
          const finalIndex = emojis.indexOf(finalEmoji);
          if (finalIndex !== -1) {
            emojiIndex = finalIndex;
          }
        }

        // Update the emoji
        setCurrentEmoji(emojis[emojiIndex]);

        // Move to next emoji
        emojiIndex = (emojiIndex + 1) % emojis.length;

        // Gradually slow down
        currentSpeed = Math.min(currentSpeed + speedIncrement, endSpeed);

        // Schedule next update with increasing delay
        emojiIntervalRef.current = setTimeout(updateEmoji, currentSpeed);
      };

      // Start cycling
      updateEmoji();

      // Set a timeout to show the final emoji after animation
      animationTimeoutRef.current = setTimeout(() => {
        // Clean up the interval
        if (emojiIntervalRef.current) {
          clearTimeout(emojiIntervalRef.current);
          emojiIntervalRef.current = null;
        }

        setIsAnimating(false);
        setShowEmoji(true);
        setCurrentEmoji(finalEmoji);
      }, 6000); // Match animation duration
    } else {
      setIsAnimating(false);
      setShowEmoji(true);
      setCurrentEmoji(getFinalEmoji());
    }

    return () => {
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
      if (emojiIntervalRef.current) {
        clearTimeout(emojiIntervalRef.current);
        emojiIntervalRef.current = null;
      }
    };
  }, [animateRoll, isChallenge, resolution, getFinalEmoji, forceExpanded]);

  return {
    isAnimating,
    showEmoji,
    currentEmoji,
    getFinalEmoji,
  };
};
