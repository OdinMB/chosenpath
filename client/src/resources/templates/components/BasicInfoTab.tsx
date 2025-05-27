import React, { useMemo } from "react";
import { PlayerCount, DifficultyLevel } from "core/types";
import {
  Input,
  TextArea,
  InfoIcon,
  Select,
  Checkbox,
  // Tooltip, // No longer directly used here for sliders
} from "components/ui";
import { ArrayField, TagSelector } from "components";
import { TAG_CATEGORIES } from "client/resources/templates/tagCategories";
import {
  DEFAULT_DIFFICULTY_LEVELS,
  getDifficultyDescription,
  // getDefaultDifficultyLevel, // Not needed after refactor
} from "core/utils/difficultyUtils.ts";
// import { DEFAULT_SELECTED_DIFFICULTY_MODIFIER } from "core/config.js"; // Not needed after refactor

interface BasicInfoTabProps {
  title: string;
  setTitle: (title: string) => void;
  teaser: string;
  setTeaser: (teaser: string) => void;
  playerCountMin: PlayerCount;
  playerCountMax: PlayerCount;
  setPlayerCountMin: (count: PlayerCount) => void;
  setPlayerCountMax: (count: PlayerCount) => void;
  handleGameModeChange: (value: number) => void;
  maxTurnsMin: number;
  maxTurnsMax: number;
  setMaxTurnsMin: (turns: number) => void;
  setMaxTurnsMax: (turns: number) => void;
  tags: string[];
  handleTagsChange?: (tags: string[]) => void;
  showOnWelcomeScreen: boolean;
  setShowOnWelcomeScreen?: (show: boolean) => void;
  difficultyLevels: DifficultyLevel[]; // This is the array of currently selected/configured levels for the template
  handleDifficultyLevelsChange: (levels: DifficultyLevel[]) => void;
  // Helper functions
  getMinPlayerOptions: () => number[];
  getMaxPlayerOptions: () => number[];
  getMinTurnsOptions: () => number[];
  getMaxTurnsOptions: () => number[];
  gameModeOptions: Array<{ value: number; label: string }>;
  getGameModeValue: () => number;
}

export const BasicInfoTab: React.FC<BasicInfoTabProps> = ({
  title,
  setTitle,
  teaser,
  setTeaser,
  playerCountMin,
  playerCountMax,
  setPlayerCountMin,
  setPlayerCountMax,
  handleGameModeChange,
  maxTurnsMin,
  maxTurnsMax,
  setMaxTurnsMin,
  setMaxTurnsMax,
  tags,
  handleTagsChange,
  showOnWelcomeScreen,
  setShowOnWelcomeScreen,
  difficultyLevels, // Currently selected levels for this template
  handleDifficultyLevelsChange,
  // Helper functions
  getMinPlayerOptions,
  getMaxPlayerOptions,
  getMinTurnsOptions,
  getMaxTurnsOptions,
  gameModeOptions,
  getGameModeValue,
}) => {
  // Debugging TAG_CATEGORIES
  console.log("TAG_CATEGORIES:", TAG_CATEGORIES);

  const allPredefinedTags = useMemo(() => {
    const tags = TAG_CATEGORIES.flatMap((category) => category.tags);
    console.log("Available predefined tags:", tags);
    return tags;
  }, []);

  const customTags = useMemo(() => {
    const customTags = tags.filter((tag) => !allPredefinedTags.includes(tag));
    console.log("Custom tags:", customTags);
    console.log("All selected tags:", tags);
    return customTags;
  }, [tags, allPredefinedTags]);

  const handleTagToggle = (tag: string) => {
    if (!handleTagsChange) return; // Skip if no handler provided

    if (tags.includes(tag)) {
      handleTagsChange(tags.filter((t) => t !== tag));
    } else {
      handleTagsChange([...tags, tag]);
    }
  };

  const handleDifficultyCheckChange = (
    defaultLevel: DifficultyLevel,
    isChecked: boolean
  ) => {
    let newLevels: DifficultyLevel[];
    if (isChecked) {
      // Add or ensure the level exists (use default title if not already customized)
      const existingLevel = difficultyLevels.find(
        (l) => l.modifier === defaultLevel.modifier
      );
      if (existingLevel) {
        newLevels = [...difficultyLevels]; // Already exists, no change needed unless title was different
      } else {
        newLevels = [...difficultyLevels, { ...defaultLevel }]; // Add with default title
      }
    } else {
      // Remove the level
      newLevels = difficultyLevels.filter(
        (l) => l.modifier !== defaultLevel.modifier
      );
    }
    // Ensure levels are sorted by modifier (asc for consistency, though backend might re-sort)
    newLevels.sort((a, b) => b.modifier - a.modifier); // Higher modifier = easier = comes first
    handleDifficultyLevelsChange(newLevels);
  };

  const handleDifficultyTitleChange = (modifier: number, newTitle: string) => {
    const newLevels = difficultyLevels.map((level) =>
      level.modifier === modifier ? { ...level, title: newTitle } : level
    );
    // It's possible this level wasn't "checked" yet, but user is editing title.
    // Ensure it's in the list if they edit the title.
    const levelExists = newLevels.some((l) => l.modifier === modifier);
    if (!levelExists) {
      const defaultLevel = DEFAULT_DIFFICULTY_LEVELS.find(
        (dl) => dl.modifier === modifier
      );
      if (defaultLevel) {
        newLevels.push({ ...defaultLevel, title: newTitle });
        newLevels.sort((a, b) => b.modifier - a.modifier);
      }
    }
    handleDifficultyLevelsChange(newLevels);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <span className="font-semibold w-24">Title</span>
        <Input
          id="story-title"
          name="story-title"
          className="flex-1"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Story Title"
        />
      </div>

      <div className="flex items-start gap-2">
        <span className="font-semibold w-24 pt-2">Teaser</span>
        <TextArea
          id="story-teaser"
          name="story-teaser"
          className="flex-1"
          value={teaser}
          onChange={(e) => setTeaser(e.target.value)}
          placeholder="A short teaser to attract players to your story"
          rows={3}
        />
      </div>

      {/* Players and Game Mode section */}
      <div className="flex items-center gap-4 mb-2">
        <h3 className="font-semibold whitespace-nowrap">Players</h3>
        <InfoIcon
          tooltipText="Minimum and maximum number of players allowed"
          position="right"
          className="mr-2 mt-1 -ml-1"
        />
        <div className="flex flex-1 flex-wrap gap-4">
          <div className="flex items-center min-w-[150px]">
            <label className="text-sm text-gray-600 whitespace-nowrap mr-2">
              Min:
            </label>
            <Select
              id="player-count-min"
              name="player-count-min"
              value={
                playerCountMin !== undefined ? playerCountMin.toString() : "1"
              }
              onChange={(e) =>
                setPlayerCountMin(Number(e.target.value) as PlayerCount)
              }
            >
              {getMinPlayerOptions().map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-center min-w-[150px]">
            <label className="text-sm text-gray-600 whitespace-nowrap mr-2">
              Max:
            </label>
            <Select
              id="player-count-max"
              name="player-count-max"
              value={
                playerCountMax !== undefined ? playerCountMax.toString() : "1"
              }
              onChange={(e) =>
                setPlayerCountMax(Number(e.target.value) as PlayerCount)
              }
            >
              {getMaxPlayerOptions().map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </Select>
          </div>

          <div
            className={`flex items-center min-w-[180px] ${
              playerCountMax === 1 ? "opacity-50" : ""
            }`}
          >
            <label className="text-sm text-gray-600 whitespace-nowrap mr-2">
              Mode:
            </label>
            <Select
              id="game-mode"
              name="game-mode"
              value={
                getGameModeValue() !== undefined
                  ? getGameModeValue().toString()
                  : "0"
              }
              onChange={(e) => handleGameModeChange(Number(e.target.value))}
              disabled={playerCountMax === 1}
            >
              {gameModeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {/* Story Length section */}
      <div className="flex items-center gap-4 mb-2">
        <h3 className="font-semibold whitespace-nowrap">Length</h3>
        <InfoIcon
          tooltipText="Number of decisions players will make in the game"
          position="right"
          className="mr-2 mt-1 -ml-1"
        />
        <div className="flex flex-1 flex-wrap gap-4">
          <div className="flex items-center min-w-[150px]">
            <label className="text-sm text-gray-600 whitespace-nowrap mr-2">
              Min:
            </label>
            <Select
              id="story-length-min"
              name="story-length-min"
              value={maxTurnsMin !== undefined ? maxTurnsMin.toString() : "5"}
              onChange={(e) => setMaxTurnsMin(Number(e.target.value))}
            >
              {getMinTurnsOptions().map((turns) => (
                <option key={turns} value={turns}>
                  {turns}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-center min-w-[150px]">
            <label className="text-sm text-gray-600 whitespace-nowrap mr-2">
              Max:
            </label>
            <Select
              id="story-length-max"
              name="story-length-max"
              value={maxTurnsMax !== undefined ? maxTurnsMax.toString() : "10"}
              onChange={(e) => setMaxTurnsMax(Number(e.target.value))}
            >
              {getMaxTurnsOptions().map((turns) => (
                <option key={turns} value={turns}>
                  {turns}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {/* Difficulty Levels Section Refactored */}
      <div className="space-y-3 pt-4 border-t border-primary-100">
        <div className="flex items-center mb-2">
          <h3 className="text-md font-semibold text-primary-700">
            Available Difficulty Levels
          </h3>
          <InfoIcon
            tooltipText="Select which difficulty levels are available for this template and customize their titles. The descriptions are based on the modifier and are fixed."
            position="right"
            className="ml-2 mt-0.5"
          />
        </div>
        <div className="space-y-4">
          {DEFAULT_DIFFICULTY_LEVELS.map((defaultLevel) => {
            const templateLevel = difficultyLevels.find(
              (tl) => tl.modifier === defaultLevel.modifier
            );
            const isChecked = !!templateLevel;
            const currentTitle = templateLevel
              ? templateLevel.title
              : defaultLevel.title;

            return (
              <div
                key={defaultLevel.modifier}
                className="p-3 bg-primary-50 rounded-md border border-primary-100"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Checkbox
                      id={`difficulty-check-${defaultLevel.modifier}`}
                      checked={isChecked}
                      onChange={(e) =>
                        handleDifficultyCheckChange(
                          defaultLevel,
                          e.target.checked
                        )
                      }
                    />
                    <label
                      htmlFor={`difficulty-check-${defaultLevel.modifier}`}
                      className="ml-3 text-sm font-medium text-primary-700 cursor-pointer"
                    >
                      Enable: "{defaultLevel.title}" (Modifier:{" "}
                      {defaultLevel.modifier > 0 ? "+" : ""}
                      {defaultLevel.modifier})
                    </label>
                  </div>
                </div>
                {isChecked && (
                  <div className="mt-2 pl-8">
                    <label
                      htmlFor={`difficulty-title-${defaultLevel.modifier}`}
                      className="block text-xs font-medium text-primary-600 mb-1"
                    >
                      Custom Title for Template:
                    </label>
                    <Input
                      id={`difficulty-title-${defaultLevel.modifier}`}
                      value={currentTitle}
                      onChange={(e) =>
                        handleDifficultyTitleChange(
                          defaultLevel.modifier,
                          e.target.value
                        )
                      }
                      placeholder={defaultLevel.title}
                      className="text-sm"
                    />
                    <p className="mt-1 text-xs text-primary-500">
                      Description:{" "}
                      {getDifficultyDescription(defaultLevel.modifier)}
                    </p>
                  </div>
                )}
                {!isChecked && (
                  <p className="mt-1 pl-8 text-xs text-primary-400 italic">
                    This level is currently disabled for this template. Check to
                    enable and customize.
                  </p>
                )}
              </div>
            );
          })}
        </div>
        {difficultyLevels.length === 0 && (
          <p className="text-sm text-yellow-600 bg-yellow-50 border border-yellow-200 p-3 rounded-md">
            Warning: No difficulty levels are selected. At least one difficulty
            level should be enabled for players to start a story from this
            template. The system will default to "Standard Experience" if none
            are explicitly chosen here and saved.
          </p>
        )}
      </div>

      {/* Tags section */}
      <div className="space-y-2">
        <div className="flex items-center mb-2">
          <h3 className="font-semibold">Tags</h3>
          <InfoIcon
            tooltipText="Categories to help players find your story"
            position="right"
            className="ml-2 mt-1"
          />
        </div>

        <div className="mb-4">
          <ArrayField
            items={customTags}
            onChange={(newCustomTags: string[]) => {
              if (!handleTagsChange) return;
              const predefinedSelected = tags.filter((tag) =>
                allPredefinedTags.includes(tag)
              );
              handleTagsChange([...predefinedSelected, ...newCustomTags]);
            }}
            placeholder="Add a custom tag"
            emptyPlaceholder="Click + to add custom tags"
            label="Custom Tags"
            showLabel={true}
          />
        </div>

        <div>
          <h4 className="font-semibold text-gray-600 mb-2">Suggested Tags</h4>
          <TagSelector
            selectedTags={tags}
            onTagToggle={handleTagToggle}
            expandedByDefault={true}
          />
        </div>
      </div>

      {/* Show on welcome screen */}
      {setShowOnWelcomeScreen && (
        <div className="flex items-center mt-4">
          <Checkbox
            id="welcome-screen"
            checked={showOnWelcomeScreen}
            onChange={(e) => setShowOnWelcomeScreen(e.target.checked)}
          />
          <label htmlFor="welcome-screen" className="ml-2 text-sm">
            Show on welcome screen
          </label>
          <InfoIcon
            tooltipText="When selected, this template will be shown on the welcome screen"
            position="right"
            className="ml-2"
          />
        </div>
      )}
    </div>
  );
};
