import { useCallback } from "react";
import {
  DEFAULT_DISTRIBUTION,
  SAFE_DISTRIBUTION,
  RISKY_DISTRIBUTION,
} from "core/types";

interface UseChoiceFormattingResult {
  formatRiskDistribution: (riskType?: string) => string;
  getResourceTypeInfo: (resourceType?: string) => string;
  getColor: (outcome: string) => string;
  getRiskDisplayText: (riskType?: string) => string;
}

export const useChoiceFormatting = (): UseChoiceFormattingResult => {
  // Format risk distribution for tooltip text (reversed order: unfavorable-mixed-favorable)
  const formatRiskDistribution = useCallback((riskType?: string): string => {
    switch (riskType) {
      case "normal":
        return `🙁 ${DEFAULT_DISTRIBUTION.unfavorable}% | 😐 ${DEFAULT_DISTRIBUTION.mixed}% | 😀 ${DEFAULT_DISTRIBUTION.favorable}%`;
      case "safe":
        return `🙁 ${SAFE_DISTRIBUTION.unfavorable}% | 😐 ${SAFE_DISTRIBUTION.mixed}% | 😀 ${SAFE_DISTRIBUTION.favorable}%`;
      case "risky":
        return `🙁 ${RISKY_DISTRIBUTION.unfavorable}% | 😐 ${RISKY_DISTRIBUTION.mixed}% | 😀 ${RISKY_DISTRIBUTION.favorable}%`;
      default:
        return "Unknown risk type";
    }
  }, []);

  // Get resource type info as string
  const getResourceTypeInfo = useCallback((resourceType?: string): string => {
    switch (resourceType) {
      case "sacrifice":
        return "You paid a price to gain an edge.";
      case "reward":
        return "You chased a reward, which made things harder.";
      default:
        return "Standard option with no special effects.";
    }
  }, []);

  // Get color for an outcome type
  const getColor = useCallback((outcome: string): string => {
    switch (outcome) {
      case "favorable":
        return "bg-tertiary-800";
      case "mixed":
        return "bg-tertiary-600";
      case "unfavorable":
        return "bg-tertiary-400";
      default:
        return "bg-primary-200";
    }
  }, []);

  // Convert risk type to display text
  const getRiskDisplayText = useCallback((riskType?: string): string => {
    switch (riskType) {
      case "risky":
        return "High";
      case "normal":
        return "Balanced";
      case "safe":
        return "Low";
      default:
        return "Unknown";
    }
  }, []);

  return {
    formatRiskDistribution,
    getResourceTypeInfo,
    getColor,
    getRiskDisplayText,
  };
};
