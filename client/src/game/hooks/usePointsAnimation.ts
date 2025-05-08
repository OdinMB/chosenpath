import { useState, useEffect, useRef, useCallback } from "react";

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
  const prevTargetValueRef = useRef(0);

  // Animation timeout
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const transitionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const countAnimationFrameRef = useRef<number | null>(null);

  // Animate counting to target value - memoized with useCallback
  const animateCountToValue = useCallback(
    (
      targetValue: number,
      duration: number = 300,
      isFinalValue: boolean = false
    ) => {
      // Cancel any ongoing count animation
      if (countAnimationFrameRef.current !== null) {
        cancelAnimationFrame(countAnimationFrameRef.current);
      }

      const startValue = currentTotal;
      const startTime = Date.now();
      const endTime = startTime + duration;
      const range = targetValue - startValue;

      // For final value, apply transition effect immediately
      if (isFinalValue) {
        setIsTransitioning(true);
      }

      // Function to update count on each animation frame
      const updateCount = () => {
        const now = Date.now();
        if (now >= endTime) {
          // Animation complete
          setCurrentTotal(targetValue);
          if (isFinalValue) {
            // After the transition, set to complete state but keep the bold styling
            transitionTimeoutRef.current = setTimeout(() => {
              setIsComplete(true);
              // Keep isTransitioning true to maintain bold styling
            }, 800); // Longer duration for final transition
          }
          countAnimationFrameRef.current = null;
          return;
        }

        // Calculate progress from 0 to 1
        const progress = (now - startTime) / duration;
        // Apply slight easing
        const easedProgress = 1 - Math.pow(1 - progress, 3); // Cubic ease-out
        // Calculate current count value
        const currentValue = Math.round(startValue + range * easedProgress);

        setCurrentTotal(currentValue);
        countAnimationFrameRef.current = requestAnimationFrame(updateCount);
      };

      // Start the animation
      countAnimationFrameRef.current = requestAnimationFrame(updateCount);
    },
    [currentTotal, setCurrentTotal, setIsComplete, setIsTransitioning]
  );

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
    prevTargetValueRef.current = 0;
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
      if (countAnimationFrameRef.current !== null) {
        cancelAnimationFrame(countAnimationFrameRef.current);
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

      // Check if this is the final modifier being added
      const isFinalModifier =
        visibleModifiers.length === modifiers.length && modifiers.length > 0;

      // Add a small delay to make the animation more visible
      if (animationTimeoutRef.current) {
        const animationTimeout = animationTimeoutRef.current;
        clearTimeout(animationTimeout);
      }

      // For the final modifier, apply value change and styling simultaneously
      if (isFinalModifier) {
        // Longer delay before final value to ensure it's visible
        animationTimeoutRef.current = setTimeout(() => {
          // Animate to the final value with a faster speed for the final animation
          animateCountToValue(finalTotal, 500, true);
        }, 500);
      } else {
        // Regular animation for non-final modifiers - just update the value with counting
        animationTimeoutRef.current = setTimeout(() => {
          animateCountToValue(currentSum, 300, false);
        }, 400);
      }

      // Update the previous target value
      prevTargetValueRef.current = currentSum;
    }

    // Update prev count ref
    prevVisibleCountRef.current = visibleModifiers.length;
  }, [
    visibleModifiers,
    modifiers,
    isAnimating,
    finalTotal,
    animateCountToValue,
  ]);

  return {
    currentTotal,
    isAnimating: isAnimating && !isComplete,
    isComplete,
    isTransitioning,
  };
};
