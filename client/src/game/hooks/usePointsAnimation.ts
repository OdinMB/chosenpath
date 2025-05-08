import { useState, useEffect, useRef } from "react";

interface UsePointsAnimationProps {
  modifiers: Array<[string, number]>;
  visibleModifiers: Array<[string, number]>;
  isAnimating: boolean;
  finalTotal: number;
}

interface UsePointsAnimationResult {
  currentTotal: number;
  isAnimating: boolean;
  isComplete: boolean;
  isTransitioning: boolean;
}

/**
 * Hook for animating the bonus/malus total as modifiers are added
 *
 * @param modifiers All modifiers that will eventually be shown
 * @param visibleModifiers Modifiers currently visible in the UI
 * @param isAnimating Whether the animation is currently in progress
 * @param finalTotal The final total of all modifiers
 * @returns Animation state for the bonus/malus total
 */
export const usePointsAnimation = ({
  modifiers,
  visibleModifiers,
  isAnimating,
  finalTotal,
}: UsePointsAnimationProps): UsePointsAnimationResult => {
  // Current total to display
  const [currentTotal, setCurrentTotal] = useState(0);

  // Track if we're in the final state or transitioning between values
  const [isComplete, setIsComplete] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Ref to track the previous visible modifiers count
  const prevVisibleCountRef = useRef(0);

  // Animation timeout
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const transitionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize and reset state based on animation flag
  useEffect(() => {
    if (!isAnimating) {
      // If not animating, show final state
      setCurrentTotal(finalTotal);
      setIsComplete(true);
      setIsTransitioning(false);
      return;
    }

    // Reset state when animation starts
    setCurrentTotal(0);
    setIsComplete(false);
    setIsTransitioning(false);
    prevVisibleCountRef.current = 0;
  }, [isAnimating, finalTotal]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (animationTimeoutRef.current) {
        const animationTimeout = animationTimeoutRef.current;
        clearTimeout(animationTimeout);
      }
      if (transitionTimeoutRef.current) {
        const transitionTimeout = transitionTimeoutRef.current;
        clearTimeout(transitionTimeout);
      }
    };
  }, []);

  // Update total when visible modifiers change
  useEffect(() => {
    // If not animating or no modifiers, reset to final total
    if (!isAnimating || modifiers.length === 0) {
      setCurrentTotal(finalTotal);
      setIsComplete(true);
      return;
    }

    // If new modifiers were added
    if (visibleModifiers.length > prevVisibleCountRef.current) {
      // Calculate current running total of visible modifiers
      const currentSum = visibleModifiers.reduce(
        (sum, [, value]) => sum + value,
        0
      );

      // Animate the change but without transition effects for intermediate values
      const animateChange = () => {
        // Don't set isTransitioning for intermediate values
        // Only update the current total
        setCurrentTotal(currentSum);
      };

      // Add a small delay to make the animation more visible
      if (animationTimeoutRef.current) {
        const animationTimeout = animationTimeoutRef.current;
        clearTimeout(animationTimeout);
      }

      // Increased delay before updating the points to make the animation more noticeable
      animationTimeoutRef.current = setTimeout(animateChange, 400);
    }

    // Update prev count ref
    prevVisibleCountRef.current = visibleModifiers.length;

    // When we reach the final modifier, mark as complete after a delay
    if (visibleModifiers.length === modifiers.length && modifiers.length > 0) {
      if (animationTimeoutRef.current) {
        const animationTimeout = animationTimeoutRef.current;
        clearTimeout(animationTimeout);
      }

      // Longer delay before final value to ensure it's visible
      animationTimeoutRef.current = setTimeout(() => {
        // For the final value, set isTransitioning to true for the highlight effect
        setIsTransitioning(true);
        setCurrentTotal(finalTotal);

        // After the transition, set to complete state but keep the bold styling
        // by not resetting isTransitioning to false
        transitionTimeoutRef.current = setTimeout(() => {
          setIsComplete(true);
          // Keep isTransitioning true to maintain bold styling
        }, 800); // Longer duration for final transition
      }, 500);
    }
  }, [visibleModifiers, modifiers, isAnimating, finalTotal]);

  return {
    currentTotal,
    isAnimating: isAnimating && !isComplete,
    isComplete,
    isTransitioning,
  };
};
