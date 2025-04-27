// hooks/useTemplateForm.ts
import { useState, useEffect } from "react";
import {
  StoryTemplate,
  GameMode,
  PLAYER_SLOTS,
  PlayerSlot,
  CharacterSelectionIntroduction,
  PlayerOptionsGeneration,
  Stat,
  StatValueEntry,
  StoryElement,
  Outcome,
  ImageInstructions,
} from "core/types";
import { Logger } from "shared/logger";
import { MAX_PLAYERS } from "core/config";
import { useBasicInfoTab } from "./useBasicInfoTab";
import { useGuidelinesEditor } from "./useGuidelinesEditor";
import { useTemplateApi } from "./useTemplateApi";
import { useTabs } from "components/ui/useTabs";

// Define the TabType type
export type TabType =
  | "basic"
  | "media"
  | "guidelines"
  | "elements"
  | "outcomes"
  | "stats"
  | "players"
  | "ai-draft"
  | "ai-iterate";

interface UseTemplateFormProps {
  initialTemplate: StoryTemplate;
  onSubmit: (template: StoryTemplate) => void;
  token: string;
  setIsLoading: (isLoading: boolean) => void;
}

export function useTemplateForm({
  initialTemplate,
  onSubmit,
  token,
  setIsLoading,
}: UseTemplateFormProps) {
  // Core state
  const { activeTab, setActiveTab } = useTabs<TabType>("basic");
  const [formData, setFormData] = useState<StoryTemplate>(initialTemplate);

  // Use specialized hooks
  const {
    tags,
    handleTitleChange,
    handleTeaserChange,
    handlePlayerCountMinChange,
    handlePlayerCountMaxChange,
    handleMaxTurnsMinChange,
    handleMaxTurnsMaxChange,
    handleGameModeChange,
    handleAddTag,
    handleRemoveTag,
    handlePublicationStatusChange,
    handleTagsChange,
    handleShowOnWelcomeScreenChange,
    // New helper functions
    getMinPlayerOptions,
    getMaxPlayerOptions,
    getMinTurnsOptions,
    getMaxTurnsOptions,
    gameModeOptions,
    getGameModeValue,
  } = useBasicInfoTab({
    template: formData,
    onChange: (updates) => setFormData((prev) => ({ ...prev, ...updates })),
  });

  const {
    world,
    rules,
    tone,
    conflicts,
    decisions,
    typesOfThreads,
    setWorld,
    setRules,
    setTone,
    setConflicts,
    setDecisions,
    setTypesOfThreads,
    handleArrayFieldChange,
    handleAddArrayItem,
    handleRemoveArrayItem,
    updateGuidelines,
  } = useGuidelinesEditor({
    guidelines: formData.guidelines,
    onChange: (updates) => setFormData((prev) => ({ ...prev, ...updates })),
  });

  const { saveTemplate, generateTemplate } = useTemplateApi({
    token,
    onSuccess: onSubmit,
    setIsLoading,
  });

  // Update form data when initialTemplate prop changes
  useEffect(() => {
    Logger.UI.log(
      "Template form received updated template data:",
      initialTemplate.id
    );
    setFormData(initialTemplate);

    // Ensure player stats have assigned initial values
    updatePlayerBackgroundStats(initialTemplate);
  }, [initialTemplate]);

  // Extracted function to update player background stats
  const updatePlayerBackgroundStats = (template: StoryTemplate) => {
    const relevantPlayerSlots = PLAYER_SLOTS.slice(0, MAX_PLAYERS);
    const updatedPlayerOptions: Record<string, PlayerOptionsGeneration> = {};
    let needsUpdate = false;

    relevantPlayerSlots.forEach((slot) => {
      const playerOption = template[
        slot as keyof StoryTemplate
      ] as PlayerOptionsGeneration;

      if (playerOption && playerOption.possibleCharacterBackgrounds) {
        const updatedBackgrounds =
          playerOption.possibleCharacterBackgrounds.map((background) => {
            // Check if background has all the current playerStats
            const existingStatIds = background.initialPlayerStatValues.map(
              (sv) => sv.statId
            );
            const missingStats = template.playerStats.filter(
              (stat) => !existingStatIds.includes(stat.id)
            );

            if (missingStats.length > 0) {
              needsUpdate = true;
              // Add missing stats with default values
              const newStatValues = [...background.initialPlayerStatValues];

              missingStats.forEach((stat) => {
                let defaultValue: number | string | string[];
                if (stat.type === "string") {
                  defaultValue = "";
                } else if (stat.type === "string[]") {
                  defaultValue = [];
                } else {
                  defaultValue = 50; // Default for number/percentage/opposites
                }

                newStatValues.push({
                  statId: stat.id,
                  value: defaultValue,
                });
              });

              return {
                ...background,
                initialPlayerStatValues: newStatValues,
              };
            }

            return background;
          });

        if (needsUpdate) {
          updatedPlayerOptions[slot] = {
            ...playerOption,
            possibleCharacterBackgrounds: updatedBackgrounds,
          };
        }
      }
    });

    // If any player options needed updates, apply them to the form data
    if (Object.keys(updatedPlayerOptions).length > 0) {
      setFormData((prev) => ({
        ...prev,
        ...updatedPlayerOptions,
      }));
    }
  };

  // Get player options for use in UI components
  const getPlayerOptionsFromStoryTemplate = (
    template: Partial<StoryTemplate>
  ) => {
    const playerOptions: Record<string, PlayerOptionsGeneration> = {};
    const relevantPlayerSlots = PLAYER_SLOTS.slice(0, MAX_PLAYERS);

    for (const playerSlot of relevantPlayerSlots) {
      const defaultOptions = {
        outcomes: [],
        possibleCharacterIdentities: [],
        possibleCharacterBackgrounds: [],
      };

      const playerOption = template[playerSlot as keyof StoryTemplate] as
        | PlayerOptionsGeneration
        | undefined;
      playerOptions[playerSlot] = playerOption || defaultOptions;
    }

    return playerOptions;
  };

  // Form submission handler
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    Logger.UI.log("Form submission started");

    // Ensure guidelines are up to date
    updateGuidelines();

    // Construct the final template, merging all state
    const updatedTemplate: StoryTemplate = {
      ...formData,
      tags,
    };

    // Save the template
    await saveTemplate(updatedTemplate);
  };

  // Handle AI draft setup
  const handleAIDraftSetup = async (options: {
    prompt: string;
    playerCount: number;
    maxTurns: number;
    gameMode: GameMode;
  }) => {
    await generateTemplate({
      ...options,
      currentTemplate: formData,
      onUpdate: (tab: string) => setActiveTab(tab as TabType),
    });
  };

  // Handlers for specific form sections
  const handleStatsChange = (updates: {
    statGroups?: string[];
    sharedStats?: Stat[];
    playerStats?: Stat[];
    initialSharedStatValues?: StatValueEntry[];
    playerOptions?: Record<PlayerSlot, PlayerOptionsGeneration>;
  }) => {
    setFormData((prev: StoryTemplate) => ({
      ...prev,
      statGroups: updates.statGroups || prev.statGroups,
      sharedStats: updates.sharedStats || prev.sharedStats,
      playerStats: updates.playerStats || prev.playerStats,
      initialSharedStatValues:
        updates.initialSharedStatValues || prev.initialSharedStatValues,
      ...(updates.playerOptions || {}),
    }));
  };

  const handleImageFileChange = (imageFile: string) =>
    setFormData((prev) => ({ ...prev, imageFile }));

  const handleStoryElementsChange = (elements: StoryElement[]) =>
    setFormData((prev) => ({ ...prev, storyElements: elements }));

  const handleOutcomesChange = (outcomes: Outcome[]) =>
    setFormData((prev) => ({ ...prev, sharedOutcomes: outcomes }));

  const handlePlayerChange = (update: Partial<StoryTemplate>): void => {
    // go through playerX attributes
    const playerKeys = Object.keys(update).filter((key) =>
      key.startsWith("player")
    );
    // apply each player key to the setFormData function
    playerKeys.forEach((key) => {
      setFormData((prev: StoryTemplate) => ({
        ...prev,
        [key]: update[key as keyof Partial<StoryTemplate>],
      }));
    });
  };

  const handleCharacterSelectionIntroductionChange = (
    updatedIntro: CharacterSelectionIntroduction
  ) =>
    setFormData((prev) => ({
      ...prev,
      characterSelectionIntroduction: updatedIntro,
    }));

  // Handle image instructions
  const handleImageInstructionsChange = (
    updates: Partial<ImageInstructions>
  ) => {
    setFormData((prev) => ({
      ...prev,
      imageInstructions: {
        ...(prev.imageInstructions || {
          visualStyle: "",
          atmosphere: "",
          colorPalette: "",
          settingDetails: "",
          characterStyle: "",
          artInfluences: "",
        }),
        ...updates,
      },
    }));
  };

  // Return all the handlers and state needed by the UI component
  return {
    // Core state
    activeTab,
    setActiveTab,
    formData,
    // Expose data from other hooks
    world,
    rules,
    tone,
    conflicts,
    decisions,
    typesOfThreads,
    tags,
    // Handlers for guidelines tab
    handleArrayFieldChange,
    handleAddArrayItem,
    handleRemoveArrayItem,
    setWorld,
    setRules,
    setTone,
    setConflicts,
    setDecisions,
    setTypesOfThreads,
    setTags: handleTagsChange,
    // Handlers for BasicInfoTab
    handleAddTag,
    handleRemoveTag,
    handleTagsChange,
    // Handlers for specific fields
    handleTitleChange,
    handleTeaserChange,
    handlePlayerCountMinChange,
    handlePlayerCountMaxChange,
    handleGameModeChange,
    handleMaxTurnsMinChange,
    handleMaxTurnsMaxChange,
    handleStatsChange,
    handleImageFileChange,
    handleStoryElementsChange,
    handleOutcomesChange,
    handlePlayerChange,
    handleCharacterSelectionIntroductionChange,
    handlePublicationStatusChange,
    handleShowOnWelcomeScreenChange,
    handleImageInstructionsChange,
    // Helper functions
    getMinPlayerOptions,
    getMaxPlayerOptions,
    getMinTurnsOptions,
    getMaxTurnsOptions,
    gameModeOptions,
    getGameModeValue,
    // Misc utils
    handleSubmit,
    getPlayerOptionsFromStoryTemplate,
    handleAIDraftSetup,
  };
}
