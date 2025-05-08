import { useState, useEffect, useRef } from "react";
import { Resolution, ResolutionDetails } from "core/types";
import { useEmojiAnimation } from "./useEmojiAnimation";
import { useMarkerAnimation } from "./useMarkerAnimation";

interface UsePreviousChoiceVisualizerProps {
  animateRoll: boolean;
  resolution?: Resolution;
  resolutionDetails?: ResolutionDetails;
  isChallenge: boolean;
  forceExpanded: boolean;
}

interface UsePreviousChoiceVisualizerResult {
  // From emoji animation
  isEmojiAnimating: boolean;
  showEmoji: boolean;
  currentEmoji: string;

  // From marker animation
  isMarkerAnimating: boolean;
  currentMarkerPosition: number;

  // New animation for modifiers
  visibleModifiers: Array<[string, number]>;
  isModifierAnimating: boolean;
}

export const usePreviousChoiceVisualizer = ({
  animateRoll,
  resolution,
  resolutionDetails,
  isChallenge,
  forceExpanded,
}: UsePreviousChoiceVisualizerProps): UsePreviousChoiceVisualizerResult => {
  // Re-use existing animation hooks
  const {
    isAnimating: isEmojiAnimating,
    showEmoji,
    currentEmoji,
  } = useEmojiAnimation({
    animateRoll,
    resolution,
    isChallenge,
    forceExpanded,
  });

  const { animatingMarker: isMarkerAnimating, currentMarkerPosition } =
    useMarkerAnimation({
      animateRoll,
      resolutionDetails,
      isChallenge,
    });

  // New state for modifier animations
  const [visibleModifiers, setVisibleModifiers] = useState<
    Array<[string, number]>
  >([]);
  const [isModifierAnimating, setIsModifierAnimating] = useState(false);
  const modifierTimeoutsRef = useRef<NodeJS.Timeout[]>([]);

  // Clear all animation timeouts on unmount
  useEffect(() => {
    return () => {
      modifierTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    };
  }, []);

  // Manage the modifier animation
  useEffect(() => {
    if (
      !animateRoll ||
      !isChallenge ||
      !resolutionDetails?.readablePointModifiers
    ) {
      // Reset the state if not animating
      if (!animateRoll) {
        setVisibleModifiers(resolutionDetails?.readablePointModifiers || []);
      }
      setIsModifierAnimating(false);
      return;
    }

    // Clear any existing timeouts
    modifierTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    modifierTimeoutsRef.current = [];

    // Start with empty modifiers
    setVisibleModifiers([]);
    setIsModifierAnimating(true);

    // Animate modifiers one by one
    const modifiers = resolutionDetails.readablePointModifiers || [];
    const delayBetweenModifiers = 800; // 0.8 seconds between each modifier
    const startDelay = 3000; // Start after the marker/emoji animations have progressed
    const totalDelay = 6000; // Total animation time from start to completed

    // Start the modifiers animation after a delay
    modifiers.forEach((modifier, index) => {
      const timeout = setTimeout(() => {
        setVisibleModifiers((prev) => [...prev, modifier]);

        // If this is the last modifier, end the animation
        if (index === modifiers.length - 1) {
          setTimeout(() => {
            setIsModifierAnimating(false);
          }, 500); // Small delay after adding the last modifier
        }
      }, startDelay + index * delayBetweenModifiers);

      modifierTimeoutsRef.current.push(timeout);
    });

    // If there are no modifiers, end the animation immediately
    if (modifiers.length === 0) {
      setIsModifierAnimating(false);
    }

    // End all animations after the total animation time
    const finalTimeout = setTimeout(() => {
      setVisibleModifiers(modifiers);
      setIsModifierAnimating(false);
    }, totalDelay);

    modifierTimeoutsRef.current.push(finalTimeout);
  }, [animateRoll, isChallenge, resolutionDetails]);

  return {
    // From emoji animation
    isEmojiAnimating,
    showEmoji,
    currentEmoji,

    // From marker animation
    isMarkerAnimating,
    currentMarkerPosition,

    // New animation for modifiers
    visibleModifiers,
    isModifierAnimating,
  };
};
