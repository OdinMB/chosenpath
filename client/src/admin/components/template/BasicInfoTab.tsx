import React from "react";
import { MIN_PLAYERS, MAX_PLAYERS, MIN_TURNS, MAX_TURNS } from "@core/config";
import { GameModes, GameMode } from "@core/types/story";
import { PlayerCount } from "@core/types/player";
import { Icons } from "@components/ui/Icons";
import { Input } from "@components/ui/Input";
import { TextArea } from "@components/ui/TextArea";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { InfoIcon } from "@components/ui/InfoIcon";

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

      <div>
        <div className="flex items-center mb-2">
          <h3 className="font-semibold">Players</h3>
          <InfoIcon
            tooltipText="Minimum and maximum number of players allowed"
            position="right"
            className="ml-2 mt-1"
          />
        </div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex-1 mr-6">
            <label className="text-sm text-gray-600 block mb-1">
              Minimum: {playerCountMin}
            </label>
            <input
              id="player-count-min"
              name="player-count-min"
              type="range"
              min={MIN_PLAYERS}
              max={playerCountMax}
              value={playerCountMin}
              onChange={(e) =>
                setPlayerCountMin(Number(e.target.value) as PlayerCount)
              }
              className="w-full h-2 bg-secondary-100 rounded-lg appearance-none cursor-pointer touch-pan-x accent-secondary"
            />
          </div>
          <div className="flex-1">
            <label className="text-sm text-gray-600 block mb-1">
              Maximum: {playerCountMax}
            </label>
            <input
              id="player-count-max"
              name="player-count-max"
              type="range"
              min={playerCountMin}
              max={MAX_PLAYERS}
              value={playerCountMax}
              onChange={(e) =>
                setPlayerCountMax(Number(e.target.value) as PlayerCount)
              }
              className="w-full h-2 bg-secondary-100 rounded-lg appearance-none cursor-pointer touch-pan-x accent-secondary"
            />
          </div>
        </div>
      </div>

      <div className={`${playerCountMax === 1 ? "opacity-50" : ""}`}>
        <div className="flex items-center mb-1">
          <h3 className="font-semibold">Game Mode</h3>
          <InfoIcon
            tooltipText="How players interact with each other during gameplay"
            position="right"
            className="ml-2 mt-1"
          />
        </div>
        <input
          id="game-mode"
          name="game-mode"
          type="range"
          min={0}
          max={2}
          value={
            playerCountMax === 1
              ? 0
              : gameMode === GameModes.Cooperative
              ? 0
              : gameMode === GameModes.CooperativeCompetitive
              ? 1
              : 2
          }
          onChange={(e) => handleGameModeChange(Number(e.target.value))}
          className="w-full h-2 bg-secondary-100 rounded-lg appearance-none cursor-pointer touch-pan-x accent-secondary"
          disabled={playerCountMax === 1}
        />
        <div className="flex justify-between text-xs text-primary-600">
          <span>Shared Goals</span>
          <span>Mixed Goals</span>
          <span>Competing Goals</span>
        </div>
      </div>

      <div>
        <div className="flex items-center mb-2">
          <h3 className="font-semibold">Story Length</h3>
          <InfoIcon
            tooltipText="Number of decisions players will make in the game"
            position="right"
            className="ml-2 mt-1"
          />
        </div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex-1 mr-6">
            <label className="text-sm text-gray-600 block mb-1">
              Minimum: {maxTurnsMin}
            </label>
            <input
              id="story-length-min"
              name="story-length-min"
              type="range"
              min={MIN_TURNS}
              max={maxTurnsMax}
              step={5}
              value={maxTurnsMin}
              onChange={(e) => setMaxTurnsMin(Number(e.target.value))}
              className="w-full h-2 bg-secondary-100 rounded-lg appearance-none cursor-pointer touch-pan-x accent-secondary"
            />
          </div>
          <div className="flex-1">
            <label className="text-sm text-gray-600 block mb-1">
              Maximum: {maxTurnsMax}
            </label>
            <input
              id="story-length-max"
              name="story-length-max"
              type="range"
              min={maxTurnsMin}
              max={MAX_TURNS}
              step={5}
              value={maxTurnsMax}
              onChange={(e) => setMaxTurnsMax(Number(e.target.value))}
              className="w-full h-2 bg-secondary-100 rounded-lg appearance-none cursor-pointer touch-pan-x accent-secondary"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
