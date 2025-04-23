import { useState } from "react";
import {
  StoryTemplate,
  GameMode,
  GameModes,
  PlayerCount,
  PublicationStatusType,
} from "core/types";
import { MIN_PLAYERS, MAX_PLAYERS, MIN_TURNS, MAX_TURNS } from "core/config";

interface UseBasicInfoTabProps {
  template: StoryTemplate;
  onChange: (updates: Partial<StoryTemplate>) => void;
}

interface GameModeOption {
  value: number;
  label: string;
}

export function useBasicInfoTab({ template, onChange }: UseBasicInfoTabProps) {
  const [tags, setTags] = useState<string[]>(template.tags || []);

  const handleChange = <K extends keyof StoryTemplate>(
    key: K,
    value: StoryTemplate[K]
  ) => {
    onChange({ [key]: value });
  };

  const handleTagsChange = (newTags: string[]) => {
    setTags(newTags);
    onChange({ tags: newTags });
  };

  const handleAddTag = () => {
    const updatedTags = [...tags, ""];
    setTags(updatedTags);
    onChange({ tags: updatedTags });
  };

  const handleRemoveTag = (index: number) => {
    const updatedTags = tags.filter((_, i) => i !== index);
    setTags(updatedTags);
    onChange({ tags: updatedTags });
  };

  const handleGameModeChange = (value: number) => {
    let newGameMode: GameMode;
    switch (value) {
      case 0:
        newGameMode = GameModes.Cooperative;
        break;
      case 1:
        newGameMode = GameModes.CooperativeCompetitive;
        break;
      case 2:
        newGameMode = GameModes.Competitive;
        break;
      default:
        newGameMode = GameModes.Cooperative;
    }
    handleChange("gameMode", newGameMode);
  };

  const handlePublicationStatusChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const value = e.target.value as PublicationStatusType;
    handleChange("publicationStatus", value);
  };

  // Helper functions for UI options
  const getStoryLengthOptions = (min: number, max: number, step: number) => {
    const options = [];
    for (let i = min; i <= max; i += step) {
      options.push(i);
    }
    return options;
  };

  const getPlayerCountOptions = (min: number, max: number) => {
    const options = [];
    for (let i = min; i <= max; i++) {
      options.push(i);
    }
    return options;
  };

  const getMinPlayerOptions = () =>
    getPlayerCountOptions(MIN_PLAYERS, template.playerCountMax);

  const getMaxPlayerOptions = () =>
    getPlayerCountOptions(template.playerCountMin, MAX_PLAYERS);

  const getMinTurnsOptions = () =>
    getStoryLengthOptions(MIN_TURNS, template.maxTurnsMax, 5);

  const getMaxTurnsOptions = () =>
    getStoryLengthOptions(template.maxTurnsMin, MAX_TURNS, 5);

  // Game mode options
  const gameModeOptions: GameModeOption[] = [
    { value: 0, label: "Shared Goals" },
    { value: 1, label: "Mixed Goals" },
    { value: 2, label: "Competing Goals" },
  ];

  const getGameModeValue = () => {
    if (template.playerCountMax === 1) return 0;

    switch (template.gameMode) {
      case GameModes.Cooperative:
        return 0;
      case GameModes.CooperativeCompetitive:
        return 1;
      case GameModes.Competitive:
        return 2;
      default:
        return 0;
    }
  };

  return {
    tags,
    handleTitleChange: (title: string) => handleChange("title", title),
    handleTeaserChange: (teaser: string) => handleChange("teaser", teaser),
    handlePlayerCountMinChange: (value: PlayerCount) =>
      handleChange("playerCountMin", value),
    handlePlayerCountMaxChange: (value: PlayerCount) =>
      handleChange("playerCountMax", value),
    handleMaxTurnsMinChange: (value: number) =>
      handleChange("maxTurnsMin", value),
    handleMaxTurnsMaxChange: (value: number) =>
      handleChange("maxTurnsMax", value),
    handleGameModeChange,
    handleTagsChange,
    handleAddTag,
    handleRemoveTag,
    handlePublicationStatusChange,
    handleShowOnWelcomeScreenChange: (value: boolean) =>
      handleChange("showOnWelcomeScreen", value),
    // Export UI helper functions
    getStoryLengthOptions,
    getPlayerCountOptions,
    getMinPlayerOptions,
    getMaxPlayerOptions,
    getMinTurnsOptions,
    getMaxTurnsOptions,
    gameModeOptions,
    getGameModeValue,
  };
}
