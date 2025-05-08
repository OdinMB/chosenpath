import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { ProbabilityDistribution, OptionRiskType } from "core/types/beat";
import {
  calculateDistribution,
  getBaseDistributionByOptionRiskType,
} from "core/utils/beatResolutionUtils";

interface UseDistributionAnimationProps {
  riskType?: string;
  currentPoints: number;
  animationPhase: "modifiers" | "roll" | "complete";
  finalDistribution: ProbabilityDistribution;
}

interface UseDistributionAnimationResult {
  currentDistribution: ProbabilityDistribution;
  isDistributionAnimating: boolean;
}

/**
 * Hook for animating probability distribution changes based on points
 */
export const useDistributionAnimation = ({
  riskType = "normal",
  currentPoints,
  animationPhase,
  finalDistribution,
}: UseDistributionAnimationProps): UseDistributionAnimationResult => {
  // Store the current animation state of the distribution
  const [currentDistribution, setCurrentDistribution] =
    useState<ProbabilityDistribution>({
      favorable: 0,
      mixed: 0,
      unfavorable: 0,
    });
  const [isDistributionAnimating, setIsDistributionAnimating] = useState(false);

  // Memoize the getInitialDistribution function
  const getInitialDistribution = useCallback(() => {
    return getBaseDistributionByOptionRiskType(riskType as OptionRiskType);
  }, [riskType]);

  // Memoize the initial distribution
  const initialDistribution = useMemo(
    () => getInitialDistribution(),
    [getInitialDistribution]
  );

  // Animation frame reference
  const animationFrameRef = useRef<number | null>(null);

  // Initialize with the base distribution
  useEffect(() => {
    // Set initial distribution when component mounts or risk type changes
    setCurrentDistribution(initialDistribution);
  }, [initialDistribution]);

  // Update distribution when current points change
  useEffect(() => {
    // Skip animation if we're in complete phase and should show final distribution
    if (animationPhase === "complete") {
      setCurrentDistribution(finalDistribution);
      setIsDistributionAnimating(false);
      return;
    }

    // Skip if we're in the modifiers phase and should just show base distribution
    if (animationPhase === "modifiers" && currentPoints === 0) {
      setCurrentDistribution(initialDistribution);
      setIsDistributionAnimating(false);
      return;
    }

    // Calculate target distribution based on current points
    const targetDistribution = calculateDistribution(
      currentPoints,
      riskType as OptionRiskType
    );

    // Start animation to transition to the new distribution
    setIsDistributionAnimating(true);

    // Cancel any ongoing animation
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    // Get current values
    const startDistribution = { ...currentDistribution };
    const startTime = Date.now();
    const duration = 400; // Animation duration in ms

    // Animate the transition
    const animateDistribution = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out
      const easedProgress = 1 - Math.pow(1 - progress, 2);

      // Calculate interpolated values
      const interpolated: ProbabilityDistribution = {
        favorable: Math.round(
          startDistribution.favorable +
            (targetDistribution.favorable - startDistribution.favorable) *
              easedProgress
        ),
        mixed: Math.round(
          startDistribution.mixed +
            (targetDistribution.mixed - startDistribution.mixed) * easedProgress
        ),
        unfavorable: Math.round(
          startDistribution.unfavorable +
            (targetDistribution.unfavorable - startDistribution.unfavorable) *
              easedProgress
        ),
      };

      // Update state
      setCurrentDistribution(interpolated);

      // Continue animation if not complete
      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animateDistribution);
      } else {
        // Animation complete
        setCurrentDistribution(targetDistribution);
        setIsDistributionAnimating(false);
        animationFrameRef.current = null;
      }
    };

    // Start animation
    animationFrameRef.current = requestAnimationFrame(animateDistribution);

    // Clean up on unmount
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [
    currentPoints,
    animationPhase,
    riskType,
    finalDistribution,
    initialDistribution,
    currentDistribution,
  ]);

  return {
    currentDistribution,
    isDistributionAnimating,
  };
};
