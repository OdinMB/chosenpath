import React, { useMemo } from "react";
import { PlayerCount } from "@core/types";
import { Input, TextArea, InfoIcon, Select, Checkbox } from "@components/ui";
import { ArrayField, TagSelector } from "@components";
import { TAG_CATEGORIES } from "@common/tagCategories";

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
  handleTagsChange: (tags: string[]) => void;
  showOnWelcomeScreen: boolean;
  setShowOnWelcomeScreen: (show: boolean) => void;
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

  // Get all available predefined tags from all categories
  const allPredefinedTags = useMemo(() => {
    const tags = TAG_CATEGORIES.flatMap((category) => category.tags);
    console.log("Available predefined tags:", tags);
    return tags;
  }, []);

  // Custom tags are those not in the predefined list
  const customTags = useMemo(() => {
    const customTags = tags.filter((tag) => !allPredefinedTags.includes(tag));
    console.log("Custom tags:", customTags);
    console.log("All selected tags:", tags);
    return customTags;
  }, [tags, allPredefinedTags]);

  // Toggle a tag (add if not present, remove if present)
  const handleTagToggle = (tag: string) => {
    if (tags.includes(tag)) {
      handleTagsChange(tags.filter((t) => t !== tag));
    } else {
      handleTagsChange([...tags, tag]);
    }
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
              value={playerCountMin.toString()}
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
              value={playerCountMax.toString()}
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
              value={getGameModeValue().toString()}
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
              value={maxTurnsMin.toString()}
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
              value={maxTurnsMax.toString()}
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
      {/* Show on welcome screen checkbox */}
      <div className="flex items-center gap-2 mt-2">
        <Checkbox
          id="show-on-welcome"
          checked={showOnWelcomeScreen}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setShowOnWelcomeScreen(e.target.checked)
          }
        />
        <label
          htmlFor="show-on-welcome"
          className="font-semibold text-gray-700 flex items-center"
        >
          Show on welcome screen
        </label>
        <InfoIcon
          tooltipText="Featured templates will appear on the welcome screen carousel"
          position="right"
          className="ml-1 mt-1"
        />
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

        {/* Custom tags input */}
        <div className="mb-4">
          <ArrayField
            items={customTags}
            onChange={(newCustomTags: string[]) => {
              // Keep all predefined tags and replace custom tags
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

        {/* Predefined tags */}
        <div>
          <h4 className="font-semibold text-gray-600 mb-2">Suggested Tags</h4>
          <TagSelector
            selectedTags={tags}
            onTagToggle={handleTagToggle}
            expandedByDefault={true}
          />
        </div>
      </div>
    </div>
  );
};
