import React, { useState, useEffect } from "react";
import { BasicInfoTab } from "./BasicInfoTab";
import { GuidelinesTab } from "./GuidelinesTab";
import { StatsTab } from "./StatsTab";
import { StoryElementsTab } from "./StoryElementsTab";
import { OutcomesTab } from "./OutcomesTab";
import { PlayersTab } from "./PlayersTab";
import {
  StoryTemplate,
  GameMode,
  GameModes,
  PlayerOptionsGeneration,
} from "@core/types/story";
import { Stat, StatValueEntry } from "@core/types/stat";
import { StoryElement } from "@core/types/storyElement";
import { Outcome } from "@core/types/outcome";
import { PlayerCount, PLAYER_SLOTS } from "@core/types/player";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { Logger } from "@common/logger";
import { config } from "@/config";
import { MAX_PLAYERS } from "@core/config";

interface TemplateFormProps {
  template: StoryTemplate;
  onSubmit: (template: StoryTemplate) => void;
  isLoading: boolean;
  token: string;
  setIsLoading: (isLoading: boolean) => void;
}

type TabType =
  | "basic"
  | "guidelines"
  | "elements"
  | "outcomes"
  | "stats"
  | "players";

export const TemplateForm: React.FC<TemplateFormProps> = ({
  template,
  onSubmit,
  isLoading,
  token,
  setIsLoading,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>("basic");
  const [formData, setFormData] = useState<StoryTemplate>(template);

  // Update form data when template prop changes
  useEffect(() => {
    Logger.UI.log("Template form received updated template data:", template.id);
    setFormData(template);
    setWorld(template.guidelines?.world || "");
    setRules(template.guidelines?.rules || []);
    setTone(template.guidelines?.tone || []);
    setConflicts(template.guidelines?.conflicts || []);
    setDecisions(template.guidelines?.decisions || []);
    setTags(template.tags || []);
  }, [template]);

  // Define state for array fields that GuidelinesTab needs
  const [world, setWorld] = useState<string>(template.guidelines?.world || "");
  const [rules, setRules] = useState<string[]>(
    template.guidelines?.rules || []
  );
  const [tone, setTone] = useState<string[]>(template.guidelines?.tone || []);
  const [conflicts, setConflicts] = useState<string[]>(
    template.guidelines?.conflicts || []
  );
  const [decisions, setDecisions] = useState<string[]>(
    template.guidelines?.decisions || []
  );

  // State for tags
  const [tags, setTags] = useState<string[]>(template.tags || []);

  // Helper functions for array field manipulation
  const handleArrayFieldChange = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    index: number,
    value: string
  ) => {
    setter((prev: string[]) => {
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });
  };

  const handleAddArrayItem = (
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    setter((prev: string[]) => [...prev, ""]);
  };

  const handleRemoveArrayItem = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    index: number
  ) => {
    setter((prev: string[]) => prev.filter((_, i) => i !== index));
  };

  // Convert numeric game mode value to actual GameMode enum
  const handleGameModeChange = (value: number) => {
    let newGameMode: GameMode;
    if (formData.playerCountMax === 1) {
      newGameMode = GameModes.SinglePlayer;
    } else {
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
    }
    handleChange("gameMode", newGameMode);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    Logger.UI.log("Form submission started");

    // Construct the final template, merging all state
    const updatedTemplate: StoryTemplate = {
      ...formData,
      tags,
      guidelines: {
        ...formData.guidelines,
        world,
        rules,
        tone,
        conflicts,
        decisions,
      },
    };

    Logger.UI.log("Submitting updated template:", updatedTemplate);

    try {
      setIsLoading(true);
      Logger.Admin.log("Saving template", updatedTemplate);

      const url = updatedTemplate.id
        ? `${config.apiUrl}/admin/library/templates/${updatedTemplate.id}`
        : `${config.apiUrl}/admin/library/templates`;

      const method = updatedTemplate.id ? "PUT" : "POST";

      Logger.Admin.log(`Making ${method} request to ${url}`);

      // Create a base request body with common fields
      const baseRequestBody = {
        playerCountMin: updatedTemplate.playerCountMin,
        playerCountMax: updatedTemplate.playerCountMax,
        gameMode: updatedTemplate.gameMode,
        maxTurnsMin: updatedTemplate.maxTurnsMin,
        maxTurnsMax: updatedTemplate.maxTurnsMax,
        teaser: updatedTemplate.teaser,
        tags: updatedTemplate.tags,
        title: updatedTemplate.title,
        guidelines: updatedTemplate.guidelines,
        storyElements: updatedTemplate.storyElements,
        sharedOutcomes: updatedTemplate.sharedOutcomes,
        statGroups: updatedTemplate.statGroups,
        sharedStats: updatedTemplate.sharedStats,
        initialSharedStatValues: updatedTemplate.initialSharedStatValues,
        playerStats: updatedTemplate.playerStats,
        characterSelectionIntroduction:
          updatedTemplate.characterSelectionIntroduction,
      };

      // Add player options dynamically using PLAYER_SLOTS
      const playerOptions: Record<string, unknown> = {};
      // Only include player slots up to MAX_PLAYERS
      const relevantPlayerSlots = PLAYER_SLOTS.slice(0, MAX_PLAYERS);

      for (const playerSlot of relevantPlayerSlots) {
        if (playerSlot in updatedTemplate) {
          playerOptions[playerSlot] =
            updatedTemplate[playerSlot as keyof StoryTemplate];
        }
      }

      // Combine base request body with player options
      const requestBody = {
        ...baseRequestBody,
        ...playerOptions,
      };

      Logger.Admin.log("Request payload:", requestBody);

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        Logger.Admin.error(`API error (${response.status}): ${errorText}`);
        throw new Error(
          `Failed to ${updatedTemplate.id ? "update" : "create"} template`
        );
      }

      const data = await response.json();
      Logger.Admin.log("Template saved successfully", data);

      // Pass the updated template back to the parent component
      onSubmit(data.template);
    } catch (error) {
      Logger.Admin.error("Error saving template:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = <K extends keyof StoryTemplate>(
    key: K,
    value: StoryTemplate[K]
  ) => {
    setFormData((prev: StoryTemplate) => ({ ...prev, [key]: value }));
  };

  // Set title
  const handleTitleChange = (title: string) => {
    setFormData((prev: StoryTemplate) => ({
      ...prev,
      title,
    }));
  };

  // Set teaser
  const handleTeaserChange = (teaser: string) => {
    setFormData((prev: StoryTemplate) => ({
      ...prev,
      teaser,
    }));
  };

  // Update when playerCountMin changes
  const handlePlayerCountMinChange = (value: PlayerCount) => {
    handleChange("playerCountMin", value);
  };

  // Update when playerCountMax changes
  const handlePlayerCountMaxChange = (value: PlayerCount) => {
    handleChange("playerCountMax", value);
  };

  // Update when maxTurnsMin changes
  const handleMaxTurnsMinChange = (value: number) => {
    handleChange("maxTurnsMin", value);
  };

  // Update when maxTurnsMax changes
  const handleMaxTurnsMaxChange = (value: number) => {
    handleChange("maxTurnsMax", value);
  };

  // Handle stats changes
  const handleStatsChange = (updates: {
    statGroups?: string[];
    sharedStats?: Stat[];
    playerStats?: Stat[];
    initialSharedStatValues?: StatValueEntry[];
  }) => {
    setFormData((prev: StoryTemplate) => ({
      ...prev,
      statGroups: updates.statGroups ?? prev.statGroups,
      sharedStats: updates.sharedStats ?? prev.sharedStats,
      playerStats: updates.playerStats ?? prev.playerStats,
      initialSharedStatValues:
        updates.initialSharedStatValues ?? prev.initialSharedStatValues,
    }));
  };

  // Add handleStoryElementsChange function
  const handleStoryElementsChange = (elements: StoryElement[]) => {
    setFormData((prev: StoryTemplate) => ({
      ...prev,
      storyElements: elements,
    }));
  };

  // Add handleOutcomesChange function
  const handleOutcomesChange = (outcomes: Outcome[]) => {
    setFormData((prev: StoryTemplate) => ({
      ...prev,
      sharedOutcomes: outcomes,
    }));
  };

  // Add handlePlayerOptionsChange function
  const handlePlayerOptionsChange = (
    updates: Record<string, PlayerOptionsGeneration>
  ) => {
    setFormData((prev: StoryTemplate) => ({
      ...prev,
      ...updates,
    }));
  };

  // Create player options dynamically using PLAYER_SLOTS
  const getPlayerOptions = () => {
    const playerOptions: Record<string, PlayerOptionsGeneration> = {};
    // Only include player slots up to MAX_PLAYERS
    const relevantPlayerSlots = PLAYER_SLOTS.slice(0, MAX_PLAYERS);

    for (const playerSlot of relevantPlayerSlots) {
      const defaultOptions = {
        outcomes: [],
        possibleCharacterIdentities: [],
        possibleCharacterBackgrounds: [],
      };

      // Use type assertion to access the player properties
      const playerOption = formData[playerSlot as keyof StoryTemplate] as
        | PlayerOptionsGeneration
        | undefined;
      playerOptions[playerSlot] = playerOption || defaultOptions;
    }

    return playerOptions;
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: "basic", label: "Basic Info" },
            { id: "guidelines", label: "Guidelines" },
            { id: "elements", label: "Elements" },
            { id: "outcomes", label: "Outcomes" },
            { id: "stats", label: "Stats" },
            { id: "players", label: "Players" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? "border-indigo-500 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
              onClick={() => setActiveTab(tab.id as TabType)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-6">
        {activeTab === "basic" && (
          <BasicInfoTab
            title={formData.title || ""}
            setTitle={handleTitleChange}
            teaser={formData.teaser || ""}
            setTeaser={handleTeaserChange}
            playerCountMin={formData.playerCountMin}
            playerCountMax={formData.playerCountMax}
            setPlayerCountMin={handlePlayerCountMinChange}
            setPlayerCountMax={handlePlayerCountMaxChange}
            gameMode={formData.gameMode}
            handleGameModeChange={handleGameModeChange}
            maxTurnsMin={formData.maxTurnsMin || 10}
            maxTurnsMax={formData.maxTurnsMax || 15}
            setMaxTurnsMin={handleMaxTurnsMinChange}
            setMaxTurnsMax={handleMaxTurnsMaxChange}
            tags={tags}
            handleTagsChange={setTags}
            handleAddTag={() => handleAddArrayItem(setTags)}
            handleRemoveTag={(index) => handleRemoveArrayItem(setTags, index)}
          />
        )}

        {activeTab === "guidelines" && (
          <GuidelinesTab
            world={world}
            setWorld={setWorld}
            rules={rules}
            tone={tone}
            conflicts={conflicts}
            decisions={decisions}
            handleArrayFieldChange={handleArrayFieldChange}
            handleAddArrayItem={handleAddArrayItem}
            handleRemoveArrayItem={handleRemoveArrayItem}
            setRules={setRules}
            setTone={setTone}
            setConflicts={setConflicts}
            setDecisions={setDecisions}
          />
        )}

        {activeTab === "elements" && (
          <StoryElementsTab
            elements={formData.storyElements || []}
            onChange={handleStoryElementsChange}
          />
        )}

        {activeTab === "outcomes" && (
          <OutcomesTab
            outcomes={formData.sharedOutcomes || []}
            onChange={handleOutcomesChange}
          />
        )}

        {activeTab === "stats" && (
          <StatsTab
            statGroups={formData.statGroups || []}
            sharedStats={formData.sharedStats || []}
            playerStats={formData.playerStats || []}
            initialSharedStatValues={formData.initialSharedStatValues || []}
            onChange={handleStatsChange}
          />
        )}

        {activeTab === "players" && (
          <PlayersTab
            playerOptions={getPlayerOptions()}
            onChange={handlePlayerOptionsChange}
            playerStats={formData.playerStats || []}
          />
        )}
      </div>

      <div className="flex justify-end">
        <PrimaryButton
          type="submit"
          disabled={isLoading}
          isLoading={isLoading}
          size="lg"
        >
          Save Template
        </PrimaryButton>
      </div>
    </form>
  );
};
