import React from "react";
import { MIN_PLAYERS, MAX_PLAYERS, MIN_TURNS, MAX_TURNS } from "@core/config";
import { GameModes, GameMode } from "@core/types/story";
import { PlayerCount } from "@core/types/player";
import { Icons } from "@components/ui/Icons";
import { Input } from "@components/ui/Input";
import { PrimaryButton } from "@components/ui/PrimaryButton";

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
      <div>
        <h3 className="font-semibold mb-1">Title</h3>
        <Input
          id="story-title"
          name="story-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Story Title"
        />
      </div>

      <div>
        <h3 className="font-semibold mb-1">Teaser</h3>
        <textarea
          id="story-teaser"
          name="story-teaser"
          value={teaser}
          onChange={(e) => setTeaser(e.target.value)}
          placeholder="A short teaser to attract players to your story"
          rows={3}
          className="w-full px-3 py-2 placeholder-gray-400 text-primary-900 bg-white rounded-md border border-gray-300 shadow-sm focus:outline-none focus:ring-2 focus:ring-secondary focus:border-transparent"
        />
      </div>

      {/* Tags section */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <h3 className="font-semibold">Tags</h3>
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
        <h3 className="font-semibold mb-2">Player Count Range</h3>
        <div className="flex items-center justify-between mb-2">
          <div className="flex-1 mr-6">
            <label className="text-sm text-gray-600 block mb-1">
              Minimum Players: {playerCountMin}
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
              Maximum Players: {playerCountMax}
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
        <h3 className="font-semibold mb-1">Game Mode</h3>
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
        <h3 className="font-semibold mb-2">
          Story Length (number of decisions)
        </h3>
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
