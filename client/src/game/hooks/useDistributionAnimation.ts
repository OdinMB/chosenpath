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
  visibleModifiers: Array<[string, number]>; // Add visible modifiers to track changes
  isPointsTransitioning: boolean; // Track when the points are transitioning
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
  visibleModifiers,
  isPointsTransitioning,
}: UseDistributionAnimationProps): UseDistributionAnimationResult => {
  // Store the current animation state of the distribution
  const [currentDistribution, setCurrentDistribution] =
    useState<ProbabilityDistribution>({
      favorable: 0,
      mixed: 0,
      unfavorable: 0,
    });
  const [isDistributionAnimating, setIsDistributionAnimating] = useState(false);

  // Track previous state to detect changes
  const prevVisibleModifiersCountRef = useRef(0);
  const prevPointsRef = useRef(0);
  const prevAnimationPhaseRef = useRef(animationPhase);

  // Animation frame reference
  const animationFrameRef = useRef<number | null>(null);
  // Reference to the current distribution to avoid dependency cycle
  const currentDistributionRef =
    useRef<ProbabilityDistribution>(currentDistribution);

  // Helper function to check if modifiers have changed
  const haveModifiersChanged = useCallback(() => {
    // Check if the number of visible modifiers has changed
    return visibleModifiers.length !== prevVisibleModifiersCountRef.current;
  }, [visibleModifiers]);

  // Update ref when state changes
  useEffect(() => {
    currentDistributionRef.current = currentDistribution;
  }, [currentDistribution]);

  // Memoize the getInitialDistribution function
  const getInitialDistribution = useCallback(() => {
    return getBaseDistributionByOptionRiskType(riskType as OptionRiskType);
  }, [riskType]);

  // Memoize the initial distribution
  const initialDistribution = useMemo(
    () => getInitialDistribution(),
    [getInitialDistribution]
  );

  // Helper function to animate to a target distribution - memoized with useCallback
  // Use ref instead of state as dependency to avoid infinite loop
  const animateToDistribution = useCallback(
    (targetDist: ProbabilityDistribution, duration: number) => {
      // Start animation to transition to the new distribution
      setIsDistributionAnimating(true);

      // Cancel any ongoing animation
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      // Get current values from the ref to avoid dependency cycle
      const startDistribution = { ...currentDistributionRef.current };
      const startTime = Date.now();

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
              (targetDist.favorable - startDistribution.favorable) *
                easedProgress
          ),
          mixed: Math.round(
            startDistribution.mixed +
              (targetDist.mixed - startDistribution.mixed) * easedProgress
          ),
          unfavorable: Math.round(
            startDistribution.unfavorable +
              (targetDist.unfavorable - startDistribution.unfavorable) *
                easedProgress
          ),
        };

        // Update state
        setCurrentDistribution(interpolated);

        // Continue animation if not complete
        if (progress < 1) {
          animationFrameRef.current =
            requestAnimationFrame(animateDistribution);
        } else {
          // Animation complete
          setCurrentDistribution(targetDist);
          setIsDistributionAnimating(false);
          animationFrameRef.current = null;
        }
      };

      // Start animation
      animationFrameRef.current = requestAnimationFrame(animateDistribution);
    },
    []
  ); // No dependencies that change to avoid infinite loop

  // Initialize with the base distribution
  useEffect(() => {
    // Set initial distribution when component mounts or risk type changes
    setCurrentDistribution(initialDistribution);
  }, [initialDistribution]);

  // Animate the distribution based on points transition
  useEffect(() => {
    // Check for actual changes that need processing
    const pointsChanged = currentPoints !== prevPointsRef.current;
    const phaseChanged = animationPhase !== prevAnimationPhaseRef.current;

    // Update refs
    prevPointsRef.current = currentPoints;
    prevAnimationPhaseRef.current = animationPhase;

    // Skip if nothing changed
    if (!pointsChanged && !phaseChanged && !isPointsTransitioning) {
      return;
    }

    // Don't animate if in complete phase - use final distribution
    if (animationPhase === "complete") {
      setCurrentDistribution(finalDistribution);
      return;
    }

    // When points are transitioning or points changed, animate the distribution
    if (isPointsTransitioning || pointsChanged) {
      // Calculate target distribution based on current points
      const targetDistribution = calculateDistribution(
        currentPoints,
        riskType as OptionRiskType
      );

      // Start animation
      animateToDistribution(targetDistribution, 400);
    }
  }, [
    currentPoints,
    isPointsTransitioning,
    animationPhase,
    riskType,
    finalDistribution,
    animateToDistribution,
  ]);

  // Update distribution when visible modifiers change (progressive animation)
  useEffect(() => {
    const modifiersChanged = haveModifiersChanged();

    prevAnimationPhaseRef.current = animationPhase;

    // Skip if we're in complete phase and should show final distribution
    if (animationPhase === "complete") {
      setCurrentDistribution(finalDistribution);
      setIsDistributionAnimating(false);
      return;
    }

    // Skip if we're in modifiers phase but no modifiers are shown yet - show base distribution
    if (animationPhase === "modifiers" && visibleModifiers.length === 0) {
      setCurrentDistribution(initialDistribution);
      setIsDistributionAnimating(false);
      return;
    }

    // Check if new modifiers were added
    if (modifiersChanged) {
      prevVisibleModifiersCountRef.current = visibleModifiers.length;

      // For the final modifier, we'll animate as part of the points transition in the other effect
      if (!isPointsTransitioning) {
        // Calculate target distribution based on current points
        const targetDistribution = calculateDistribution(
          currentPoints,
          riskType as OptionRiskType
        );

        // Animate to the new distribution
        animateToDistribution(targetDistribution, 400);
      }
    }
  }, [
    visibleModifiers,
    currentPoints,
    animationPhase,
    riskType,
    finalDistribution,
    initialDistribution,
    isPointsTransitioning,
    animateToDistribution,
    haveModifiersChanged,
  ]);

  // Special handling for roll phase and complete phase
  useEffect(() => {
    const phaseChanged = animationPhase !== prevAnimationPhaseRef.current;

    if (!phaseChanged) {
      return;
    }

    prevAnimationPhaseRef.current = animationPhase;

    if (animationPhase === "roll") {
      // When entering roll phase, animate to final distribution for the roll
      const targetDistribution = calculateDistribution(
        currentPoints,
        riskType as OptionRiskType
      );

      // Animate to the target distribution with a slightly longer duration
      animateToDistribution(targetDistribution, 600);
    } else if (animationPhase === "complete") {
      // Animate to the final distribution
      animateToDistribution(finalDistribution, 400);
    }
  }, [
    animationPhase,
    currentPoints,
    riskType,
    finalDistribution,
    animateToDistribution,
  ]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return {
    currentDistribution,
    isDistributionAnimating,
  };
};
