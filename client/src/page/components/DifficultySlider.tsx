import React from "react";
import { DifficultyLevel } from "core/types";
import { getDifficultyDescription } from "core/utils/difficultyUtils";

interface DifficultySliderProps {
  selectedDifficultyLevel: DifficultyLevel;
  availableDifficultyLevels: DifficultyLevel[];
  onChange: (selectedLevel: DifficultyLevel) => void;
  disabled?: boolean;
  showDescription?: boolean; // Added to control description visibility
  sliderLabelMin?: string;
  sliderLabelMax?: string;
}

export const DifficultySlider: React.FC<DifficultySliderProps> = ({
  selectedDifficultyLevel,
  availableDifficultyLevels,
  onChange,
  disabled = false,
  showDescription = true, // Default to true
  sliderLabelMin,
  sliderLabelMax,
}) => {
  if (!availableDifficultyLevels || availableDifficultyLevels.length === 0) {
    return null; // Or some fallback UI
  }

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const index = Number(e.target.value);
    if (availableDifficultyLevels[index]) {
      onChange(availableDifficultyLevels[index]);
    }
  };

  const selectedIndex = availableDifficultyLevels.findIndex(
    (level) => level.modifier === selectedDifficultyLevel.modifier
  );

  // Ensure selectedIndex is valid, otherwise default to 0
  const currentSliderValue = selectedIndex !== -1 ? selectedIndex : 0;

  return (
    <div>
      <label
        htmlFor="difficulty-level-title"
        className="text-sm md:text-base font-medium text-primary flex items-center mb-2"
      >
        Difficulty: {selectedDifficultyLevel.title}
      </label>
      {showDescription && (
        <p className="text-xs md:text-sm text-primary-500 -mt-1 mb-2">
          {getDifficultyDescription(selectedDifficultyLevel.modifier)}
        </p>
      )}
      <input
        id="difficulty-level-slider"
        type="range"
        min={0}
        max={availableDifficultyLevels.length - 1}
        step={1}
        value={currentSliderValue}
        onChange={handleSliderChange}
        className="w-full h-2 bg-secondary-100 rounded-lg appearance-none cursor-pointer touch-pan-x accent-secondary focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent"
        disabled={disabled}
      />
      <div className="flex justify-between text-xs md:text-sm text-primary-600 mt-2">
        <span>
          {sliderLabelMin ||
            (availableDifficultyLevels.length > 0
              ? availableDifficultyLevels[0].title
              : "")}
        </span>
        <span>
          {sliderLabelMax ||
            (availableDifficultyLevels.length > 0
              ? availableDifficultyLevels[availableDifficultyLevels.length - 1]
                  .title
              : "")}
        </span>
      </div>
    </div>
  );
};
