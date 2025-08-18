import { useState, useEffect, useRef } from "react";
import { ResolutionDetails } from "core/types";

interface UseMarkerAnimationProps {
  animateRoll: boolean;
  resolutionDetails?: ResolutionDetails;
  isChallenge: boolean;
}

interface UseMarkerAnimationResult {
  animatingMarker: boolean;
  currentMarkerPosition: number;
}

export const useMarkerAnimation = ({
  animateRoll,
  resolutionDetails,
  isChallenge,
}: UseMarkerAnimationProps): UseMarkerAnimationResult => {
  const [animatingMarker, setAnimatingMarker] = useState(animateRoll);
  const [currentMarkerPosition, setCurrentMarkerPosition] = useState(50);
  const animationRef = useRef<number | null>(null);
  const animationStartTime = useRef<number | null>(null);
  const animationCompletedRef = useRef(false);
  const animationDuration = 6000; // 6 seconds total

  useEffect(() => {
    if (animateRoll && isChallenge && resolutionDetails?.roll !== undefined) {
      // Reset animation state
      setAnimatingMarker(true);
      setCurrentMarkerPosition(50);
      animationStartTime.current = null;
      animationCompletedRef.current = false;

      // Clear any existing animations
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }

      // Define the marker animation function
      const animateMarker = (timestamp: number) => {
        if (animationCompletedRef.current || !resolutionDetails?.roll) {
          return;
        }

        if (!animationStartTime.current) {
          animationStartTime.current = timestamp;
        }

        const elapsed = timestamp - animationStartTime.current;
        const progress = Math.min(elapsed / animationDuration, 1);
        // Invert the target roll for the reversed distribution bar
        const targetRoll = 100 - resolutionDetails.roll;

        // Handle normal animation progress
        if (progress < 0.95) {
          // Phase 1 (0-50%): Go back and forth between ends twice
          if (progress < 0.5) {
            // Creates 4 full sweeps (2 complete cycles) in the first 50% of animation time
            const fullSweepPosition =
              50 + 50 * Math.sin((4 * Math.PI * progress) / 0.5);
            setCurrentMarkerPosition(fullSweepPosition);
          }
          // Phase 2 (50-80%): Oscillate around the final position with decreasing amplitude
          else if (progress < 0.8) {
            const phaseProgress = (progress - 0.5) / 0.3; // Normalized progress for this phase

            // Start with large oscillations that gradually decrease
            const frequency = 6 + 3 * phaseProgress; // Gentler frequency increase
            const amplitude = 40 * (1 - phaseProgress); // Decrease amplitude over time

            const oscillation =
              amplitude * Math.sin(frequency * Math.PI * phaseProgress);
            const convergence =
              50 + (targetRoll - 50) * (0.4 + 0.6 * phaseProgress);

            setCurrentMarkerPosition(convergence + oscillation);
          }
          // Phase 3 (80-95%): Settle gently on final position
          else if (progress < 0.95) {
            const phaseProgress = (progress - 0.8) / 0.15;

            // Gentler final oscillations with lower frequency
            const smallAmplitude = 5 * (1 - phaseProgress);
            const gentleOscillation =
              smallAmplitude * Math.sin(3 * Math.PI * phaseProgress);

            setCurrentMarkerPosition(targetRoll + gentleOscillation);
          }

          // Request next animation frame
          animationRef.current = requestAnimationFrame(animateMarker);
        } else {
          // Animation complete
          setCurrentMarkerPosition(targetRoll);
          setAnimatingMarker(false);
          animationCompletedRef.current = true;

          if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
            animationRef.current = null;
          }
        }
      };

      // Start marker animation
      animationRef.current = requestAnimationFrame(animateMarker);
    } else {
      setAnimatingMarker(false);
      if (resolutionDetails?.roll !== undefined) {
        // Invert the position for the reversed distribution bar
        setCurrentMarkerPosition(100 - resolutionDetails.roll);
      }
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [animateRoll, isChallenge, resolutionDetails]);

  return {
    animatingMarker,
    currentMarkerPosition,
  };
};
