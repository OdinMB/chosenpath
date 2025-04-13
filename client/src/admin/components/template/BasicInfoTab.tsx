import React from "react";
import { MIN_PLAYERS, MAX_PLAYERS, MIN_TURNS, MAX_TURNS } from "@core/config";
import { GameModes, GameMode, PlayerCount } from "@core/types";
import {
  Icons,
  Input,
  TextArea,
  PrimaryButton,
  InfoIcon,
  Select,
} from "@components/ui/index";

interface BasicInfoTabProps {
  title: string;
  setTitle: (value: string) => void;
  teaser: string;
  setTeaser: (value: string) => void;
  playerCountMin: PlayerCount;
  playerCountMax: PlayerCount;
  setPlayerCountMin: (value: PlayerCount) => void;
  setPlayerCountMax: (value: PlayerCount) => void;
  gameMode: GameMode;
  handleGameModeChange: (value: number) => void;
  maxTurnsMin: number;
  maxTurnsMax: number;
  setMaxTurnsMin: (value: number) => void;
  setMaxTurnsMax: (value: number) => void;
  tags: string[];
  handleTagsChange: (updatedTags: string[]) => void;
  handleAddTag: () => void;
  handleRemoveTag: (index: number) => void;
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
  gameMode,
  handleGameModeChange,
  maxTurnsMin,
  maxTurnsMax,
  setMaxTurnsMin,
  setMaxTurnsMax,
  tags,
  handleTagsChange,
  handleAddTag,
  handleRemoveTag,
}) => {
  // For story length select options
  const getStoryLengthOptions = (min: number, max: number, step: number) => {
    const options = [];
    for (let i = min; i <= max; i += step) {
      options.push(i);
    }
    return options;
  };

  // For player count options
  const getPlayerCountOptions = (min: number, max: number) => {
    const options = [];
    for (let i = min; i <= max; i++) {
      options.push(i);
    }
    return options;
  };

  // Game mode options
  const gameModeOptions = [
    { value: 0, label: "Shared Goals" },
    { value: 1, label: "Mixed Goals" },
    { value: 2, label: "Competing Goals" },
  ];

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

      {/* Tags section */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <div className="flex items-center">
            <h3 className="font-semibold">Tags</h3>
            <InfoIcon
              tooltipText="Categories to help players find your story"
              position="right"
              className="ml-2 mt-1"
            />
          </div>
          <PrimaryButton
            variant="outline"
            size="sm"
            onClick={handleAddTag}
            leftIcon={<Icons.Plus className="h-4 w-4" />}
          >
            Add
          </PrimaryButton>
        </div>
        {tags.map((tag, index) => (
          <div key={index} className="flex gap-2 mb-2">
            <Input
              id={`tag-${index}`}
              name={`tag-${index}`}
              value={tag}
              onChange={(e) => {
                const updatedTags = [...tags];
                updatedTags[index] = e.target.value;
                handleTagsChange(updatedTags);
              }}
              placeholder="Add a tag"
            />
            <button
              type="button"
              onClick={() => handleRemoveTag(index)}
              className="text-tertiary hover:text-tertiary-700"
              aria-label={`Remove tag ${tag || index + 1}`}
            >
              <Icons.Trash className="h-4 w-4" />
            </button>
          </div>
        ))}
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
              {getPlayerCountOptions(MIN_PLAYERS, playerCountMax).map(
                (count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                )
              )}
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
              {getPlayerCountOptions(playerCountMin, MAX_PLAYERS).map(
                (count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                )
              )}
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
                playerCountMax === 1
                  ? "0"
                  : gameMode === GameModes.Cooperative
                  ? "0"
                  : gameMode === GameModes.CooperativeCompetitive
                  ? "1"
                  : "2"
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
              value={maxTurnsMin.toString()}
              onChange={(e) => setMaxTurnsMin(Number(e.target.value))}
            >
              {getStoryLengthOptions(MIN_TURNS, maxTurnsMax, 5).map((turns) => (
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
              {getStoryLengthOptions(maxTurnsMin, MAX_TURNS, 5).map((turns) => (
                <option key={turns} value={turns}>
                  {turns}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
};
