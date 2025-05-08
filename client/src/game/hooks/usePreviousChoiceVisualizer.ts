import { useState, useEffect, useRef } from "react";
import { Resolution, ResolutionDetails } from "core/types";
import { useEmojiAnimation } from "./useEmojiAnimation";
import { useMarkerAnimation } from "./useMarkerAnimation";

// Animation timing constants
const MODIFIER_PHASE_DURATION = 2500; // 2.5 seconds for modifiers
const ROLL_PHASE_DURATION = 3500; // 3.5 seconds for roll animations
const TOTAL_ANIMATION_DURATION = MODIFIER_PHASE_DURATION + ROLL_PHASE_DURATION; // 6 seconds total

interface UsePreviousChoiceVisualizerProps {
  animateRoll: boolean;
  resolution?: Resolution;
  resolutionDetails?: ResolutionDetails;
  isChallenge: boolean;
}

interface UsePreviousChoiceVisualizerResult {
  // Emoji animation
  isEmojiAnimating: boolean;
  showEmoji: boolean;
  currentEmoji: string;

  // Marker animation
  isMarkerAnimating: boolean;
  currentMarkerPosition: number;

  // Modifier animation
  visibleModifiers: Array<[string, number]>;
  isModifierAnimating: boolean;

  // Overall animation state
  animationPhase: "modifiers" | "roll" | "complete";
}

export const usePreviousChoiceVisualizer = ({
  animateRoll,
  resolution,
  resolutionDetails,
  isChallenge,
}: UsePreviousChoiceVisualizerProps): UsePreviousChoiceVisualizerResult => {
  // Animation phases:
  // 1. modifiers - showing modifiers one by one
  // 2. roll - showing emoji and marker animations
  // 3. complete - all animations complete
  const [animationPhase, setAnimationPhase] = useState<
    "modifiers" | "roll" | "complete"
  >(animateRoll ? "modifiers" : "complete");

  // Control signals for delegate hooks
  const [startEmojiAnimation, setStartEmojiAnimation] = useState(false);
  const [startMarkerAnimation, setStartMarkerAnimation] = useState(false);

  // Get emoji animation state from its hook
  const {
    isAnimating: isEmojiAnimating,
    showEmoji,
    currentEmoji,
  } = useEmojiAnimation({
    animateRoll: startEmojiAnimation && animateRoll,
    resolution,
    isChallenge,
    forceExpanded: false,
  });

  // Get marker animation state from its hook
  const { animatingMarker: isMarkerAnimating, currentMarkerPosition } =
    useMarkerAnimation({
      animateRoll: startMarkerAnimation && animateRoll,
      resolutionDetails,
      isChallenge,
    });

  // Modifier animation state
  const [visibleModifiers, setVisibleModifiers] = useState<
    Array<[string, number]>
  >([]);
  const [isModifierAnimating, setIsModifierAnimating] = useState(false);
  const modifierTimeoutsRef = useRef<NodeJS.Timeout[]>([]);

  // Reset animation states when animateRoll changes
  useEffect(() => {
    if (!animateRoll) {
      // If not animating, show the final state
      setAnimationPhase("complete");
      setStartEmojiAnimation(false);
      setStartMarkerAnimation(false);
      setVisibleModifiers(resolutionDetails?.readablePointModifiers || []);
      setIsModifierAnimating(false);
    } else if (isChallenge) {
      // Start with modifiers phase
      setAnimationPhase("modifiers");
      setStartEmojiAnimation(false);
      setStartMarkerAnimation(false);
      setVisibleModifiers([]);
      setIsModifierAnimating(true);
    }
  }, [animateRoll, isChallenge, resolutionDetails]);

  // Handle phase transitions
  useEffect(() => {
    if (animationPhase === "roll") {
      // Start roll animations when entering roll phase
      setStartEmojiAnimation(true);
      setStartMarkerAnimation(true);
    } else {
      // Stop roll animations in other phases
      setStartEmojiAnimation(false);
      setStartMarkerAnimation(false);
    }
  }, [animationPhase]);

  // Modifier animation
  useEffect(() => {
    // Only run in the modifiers phase
    if (
      animationPhase !== "modifiers" ||
      !animateRoll ||
      !isChallenge ||
      !resolutionDetails?.readablePointModifiers
    ) {
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
    const delayBetweenModifiers = Math.min(
      500,
      MODIFIER_PHASE_DURATION / (modifiers.length + 1)
    ); // Dynamic timing based on number of modifiers
    const startDelay = 200; // Start after a small initial delay

    // Start the modifiers animation after a delay
    modifiers.forEach((modifier, index) => {
      const timeout = setTimeout(() => {
        setVisibleModifiers((prev) => [...prev, modifier]);
      }, startDelay + index * delayBetweenModifiers);

      modifierTimeoutsRef.current.push(timeout);
    });

    // After modifiers are shown, move to roll phase
    const moveToRollPhase = setTimeout(() => {
      setAnimationPhase("roll");
      setIsModifierAnimating(false);
    }, MODIFIER_PHASE_DURATION);

    modifierTimeoutsRef.current.push(moveToRollPhase);

    // End all animations after the total animation time
    const finalTimeout = setTimeout(() => {
      setAnimationPhase("complete");
      setVisibleModifiers(modifiers);
      setIsModifierAnimating(false);
    }, TOTAL_ANIMATION_DURATION);

    modifierTimeoutsRef.current.push(finalTimeout);

    return () => {
      modifierTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
      modifierTimeoutsRef.current = [];
    };
  }, [animationPhase, animateRoll, isChallenge, resolutionDetails]);

  return {
    // Emoji animation
    isEmojiAnimating,
    showEmoji,
    currentEmoji,

    // Marker animation
    isMarkerAnimating,
    currentMarkerPosition,

    // Modifier animation
    visibleModifiers,
    isModifierAnimating,

    // Overall animation state
    animationPhase,
  };
};
