import { useState, useEffect, useRef } from "react";
import { Resolution, ResolutionDetails } from "core/types";
import { ProbabilityDistribution } from "core/types/beat";
import { useEmojiAnimation } from "./useEmojiAnimation";
import { useMarkerAnimation } from "./useMarkerAnimation";
import { usePointsAnimation } from "./usePointsAnimation";
import { useDistributionAnimation } from "./useDistributionAnimation";

// Animation timing constants
const MODIFIER_PHASE_DURATION = 4000; // 4 seconds for modifiers (increased from 2.5s)
const ROLL_PHASE_DURATION = 3500; // 3.5 seconds for roll animations
const TOTAL_ANIMATION_DURATION = MODIFIER_PHASE_DURATION + ROLL_PHASE_DURATION; // 7.5 seconds total

interface UsePreviousChoiceVisualizerProps {
  animateRoll: boolean;
  resolution?: Resolution;
  resolutionDetails?: ResolutionDetails;
  isChallenge: boolean;
  choice: {
    text: string;
    optionType: string;
    resourceType?: string;
    riskType?: string;
  };
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

  // Points animation
  currentPoints: number;
  isPointsAnimating: boolean;
  isPointsComplete: boolean;
  isPointsTransitioning: boolean;

  // Distribution animation
  currentDistribution: ProbabilityDistribution;
  isDistributionAnimating: boolean;

  // Overall animation state
  animationPhase: "modifiers" | "roll" | "complete";
}

export const usePreviousChoiceVisualizer = ({
  animateRoll,
  resolution,
  resolutionDetails,
  isChallenge,
  choice,
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

  // Get points animation state from its hook
  const allModifiers = resolutionDetails?.readablePointModifiers || [];
  const finalTotal = resolutionDetails?.points || 0;

  const {
    currentTotal: currentPoints,
    isAnimating: isPointsAnimating,
    isComplete: isPointsComplete,
    isTransitioning: isPointsTransitioning,
  } = usePointsAnimation({
    modifiers: allModifiers,
    visibleModifiers,
    isAnimating: isModifierAnimating,
    finalTotal,
  });

  // Get distribution animation state from its hook
  const { currentDistribution, isDistributionAnimating } =
    useDistributionAnimation({
      riskType: choice.riskType || "normal",
      currentPoints,
      animationPhase,
      finalDistribution: resolutionDetails?.distribution || {
        favorable: 33,
        mixed: 34,
        unfavorable: 33,
      },
    });

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

    // Longer delay between modifiers - at least 800ms, or distribute evenly
    const delayBetweenModifiers = Math.max(
      800,
      Math.floor((MODIFIER_PHASE_DURATION * 0.7) / modifiers.length)
    );

    // Longer initial delay to give the user time to see the starting state
    const startDelay = 600; // 600ms initial delay (increased from 200ms)

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

    // Points animation
    currentPoints,
    isPointsAnimating,
    isPointsComplete,
    isPointsTransitioning,

    // Distribution animation
    currentDistribution,
    isDistributionAnimating,

    // Overall animation state
    animationPhase,
  };
};
