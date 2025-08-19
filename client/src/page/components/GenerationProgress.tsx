import { useState, useEffect } from "react";
import { ImageCard } from "shared/components/ImageCard";
import { LoadingSpinner } from "shared/components/ui/LoadingSpinner";

interface GenerationStep {
  id: string;
  title: string;
  description: string;
  imagePath: string;
  minDuration: number; // Minimum milliseconds for this step
  maxDuration: number; // Maximum milliseconds for this step
}

interface GenerationProgressProps {
  isVisible: boolean;
  onComplete?: () => void;
  templateMode?: boolean;
}

const GENERATION_STEPS: GenerationStep[] = [
  {
    id: "world-building",
    title: "Creating a foundation",
    description: "Defining the setting, mood, and tonality...",
    imagePath: "/academy/setting.jpeg",
    minDuration: 8000,
    maxDuration: 12000,
  },
  {
    id: "characters",
    title: "Crafting characters",
    description: "Breathing life into the inhabitants of your World...",
    imagePath: "/academy/multiplayer.jpeg",
    minDuration: 9000,
    maxDuration: 12000,
  },
  {
    id: "narrative-structure",
    title: "Weaving narrative structure",
    description: "Creating conflicts, possible outcomes, and pacing...",
    imagePath: "/academy/switches-threads.jpeg",
    minDuration: 9000,
    maxDuration: 13000,
  },
  {
    id: "mechanics",
    title: "Tuning gameplay mechanics",
    description: "Defining stats and player backgrounds...",
    imagePath: "/academy/stats.jpeg",
    minDuration: 7000,
    maxDuration: 13000,
  },
  {
    id: "elements",
    title: "Adding story elements",
    description: "Generating locations, factions, secrets, and more...",
    imagePath: "/academy/images.jpeg",
    minDuration: 9000,
    maxDuration: 13000,
  },
  {
    id: "final-touches",
    title: "Adding final touches",
    description: "Improving consistency and polish of your World...",
    imagePath: "/academy/story-engine.jpeg",
    minDuration: 8000,
    maxDuration: 13000,
  },
];

export const GenerationProgress = ({ isVisible }: GenerationProgressProps) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [stepDurations, setStepDurations] = useState<number[]>([]);
  const [estimatedTime, setEstimatedTime] =
    useState<string>("40-70 seconds left");

  // Initialize random durations for each step
  useEffect(() => {
    if (isVisible && stepDurations.length === 0) {
      const durations = GENERATION_STEPS.map((step) => {
        return (
          step.minDuration +
          Math.random() * (step.maxDuration - step.minDuration)
        );
      });
      setStepDurations(durations);
    }
  }, [isVisible, stepDurations.length]);

  // Reset when becoming visible
  useEffect(() => {
    if (isVisible) {
      setCurrentStepIndex(0);
      setEstimatedTime("40-70 seconds left");
    }
  }, [isVisible]);

  // Progress animation - jump between steps
  useEffect(() => {
    if (!isVisible || stepDurations.length === 0) return;

    // Never complete step 6
    if (currentStepIndex >= GENERATION_STEPS.length - 1) return;

    const duration = stepDurations[currentStepIndex];

    const timeout = setTimeout(() => {
      // Move to next step
      const nextIndex = currentStepIndex + 1;
      setCurrentStepIndex(nextIndex);

      // Update estimated time based on step
      const timeMessages = [
        "40-70 seconds left",
        "35-60 seconds left",
        "30-50 seconds left",
        "20-40 seconds left",
        "10-30 seconds left",
        "any moment now",
      ];
      setEstimatedTime(timeMessages[nextIndex] || "any moment now");
    }, duration);

    return () => clearTimeout(timeout);
  }, [isVisible, currentStepIndex, stepDurations]);

  if (!isVisible) return null;

  const currentStep = GENERATION_STEPS[currentStepIndex];
  const overallProgress = (currentStepIndex / GENERATION_STEPS.length) * 100;

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Current Step Display with ImageCard */}
      <div className="flex justify-center">
        <div className="w-full max-w-md lg:max-w-sm">
          <ImageCard
            publicImagePath={currentStep.imagePath}
            title={currentStep.title}
            size="default"
            className="border-primary-100 shadow-md"
          >
            <div className="space-y-3">
              <div>
                <h3 className="text-lg font-semibold text-primary mb-1">
                  {currentStep.title}
                </h3>
                <p className="text-sm text-primary-600">
                  {currentStep.description}
                </p>
              </div>
              <div className="py-2">
                <LoadingSpinner size="small" />
              </div>
            </div>
          </ImageCard>
        </div>
      </div>

      {/* Overall Progress */}
      <div className="flex justify-center">
        <div className="space-y-2 w-full max-w-md lg:max-w-sm">
          <div className="flex justify-between items-center text-sm text-primary-600">
            {/* Step dots on the left */}
            <div className="flex space-x-2">
              {GENERATION_STEPS.map((step, index) => (
                <div
                  key={step.id}
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    index < currentStepIndex
                      ? "bg-accent"
                      : index === currentStepIndex
                      ? "bg-accent animate-pulse"
                      : "bg-gray-300"
                  }`}
                />
              ))}
            </div>
            {/* Estimated time on the right */}
            <span>{estimatedTime}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div
              className="bg-secondary h-full rounded-full transition-all duration-500 ease-out relative overflow-hidden"
              style={{ width: `${overallProgress}%` }}
            >
              {/* Animated shimmer effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
