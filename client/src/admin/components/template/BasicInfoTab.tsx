import React from "react";
import { MIN_PLAYERS, MAX_PLAYERS, MIN_TURNS, MAX_TURNS } from "shared/config";
import { GameModes, GameMode } from "shared/types/story";
import { PlayerCount } from "shared/types/player";
import { Icons } from "../../../components/ui/Icons";

interface BasicInfoTabProps {
  title: string;
  setTitle: (value: string) => void;
  playerCount: PlayerCount;
  setPlayerCount: (value: PlayerCount) => void;
  gameMode: GameMode;
  handleGameModeChange: (value: number) => void;
  maxTurns: number;
  setMaxTurns: (value: number) => void;
  tags: string[];
  handleTagsChange: (updatedTags: string[]) => void;
  handleAddTag: () => void;
  handleRemoveTag: (index: number) => void;
}

export const BasicInfoTab: React.FC<BasicInfoTabProps> = ({
  title,
  setTitle,
  playerCount,
  setPlayerCount,
  gameMode,
  handleGameModeChange,
  maxTurns,
  setMaxTurns,
  tags,
  handleTagsChange,
  handleAddTag,
  handleRemoveTag,
}) => {
  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-primary mb-1">
          Title
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full p-2 border border-gray-300 rounded-md"
          placeholder="Story Title"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-primary mb-1">
          Number of Players: {playerCount}
        </label>
        <input
          type="range"
          min={MIN_PLAYERS}
          max={MAX_PLAYERS}
          value={playerCount}
          onChange={(e) =>
            setPlayerCount(Number(e.target.value) as PlayerCount)
          }
          className="w-full h-2 bg-secondary-100 rounded-lg appearance-none cursor-pointer touch-pan-x accent-secondary"
        />
        <div className="flex justify-between text-xs text-primary-600">
          <span>{MIN_PLAYERS} Player</span>
          <span>{MAX_PLAYERS} Players</span>
        </div>
      </div>

      <div className={`${playerCount === 1 ? "opacity-50" : ""}`}>
        <label className="block text-sm font-medium text-primary mb-1">
          Game Mode
        </label>
        <input
          type="range"
          min={0}
          max={2}
          value={
            playerCount === 1
              ? 0
              : gameMode === GameModes.Cooperative
              ? 0
              : gameMode === GameModes.CooperativeCompetitive
              ? 1
              : 2
          }
          onChange={(e) => handleGameModeChange(Number(e.target.value))}
          className="w-full h-2 bg-secondary-100 rounded-lg appearance-none cursor-pointer touch-pan-x accent-secondary"
          disabled={playerCount === 1}
        />
        <div className="flex justify-between text-xs text-primary-600">
          <span>Shared Goals</span>
          <span>Mixed Goals</span>
          <span>Competing Goals</span>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-primary mb-1">
          Story Length: {maxTurns} decisions
        </label>
        <input
          type="range"
          min={MIN_TURNS}
          max={MAX_TURNS}
          step={5}
          value={maxTurns}
          onChange={(e) => setMaxTurns(Number(e.target.value))}
          className="w-full h-2 bg-secondary-100 rounded-lg appearance-none cursor-pointer touch-pan-x accent-secondary"
        />
        <div className="flex justify-between text-xs text-primary-600">
          <span>{MIN_TURNS} decisions</span>
          <span>{MAX_TURNS} decisions</span>
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center mb-1">
          <label className="block text-sm font-medium text-primary">Tags</label>
          <button
            type="button"
            onClick={handleAddTag}
            className="text-secondary hover:text-secondary-700"
          >
            <Icons.Plus className="h-4 w-4" />
          </button>
        </div>
        {tags.map((tag, index) => (
          <div key={index} className="flex gap-2 mb-2">
            <input
              type="text"
              className="flex-grow p-2 border border-gray-300 rounded-md"
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
            >
              <Icons.Trash className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
