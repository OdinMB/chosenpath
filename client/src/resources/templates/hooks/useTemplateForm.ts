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
  StoryElement,
  Outcome,
  ImageInstructions,
  PlayerCount,
  DifficultyLevel,
} from "core/types";
import { Logger } from "shared/logger";
import { MAX_PLAYERS } from "core/config";
import { useBasicInfoTab } from "./useBasicInfoTab";
import { useGuidelinesEditor } from "./useGuidelinesEditor";
import { templateApi } from "../templateApi"; // Import templateApi instead
import { useTabs } from "components/ui/useTabs";
import { GenerateTemplateRequest } from "core/types/admin";
import { useNavigate } from "react-router-dom";
import { notificationService } from "shared/notifications/notificationService";

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
  onSave?: (template: StoryTemplate) => Promise<void>;
}

export function useTemplateForm({
  initialTemplate,
  onSave,
}: UseTemplateFormProps) {
  // Core state
  const { activeTab, setActiveTab } = useTabs<TabType>("basic");
  const [formData, setFormData] = useState<StoryTemplate>(initialTemplate);
  const [isLoading, setIsLoading] = useState(false); // Manage isLoading internally
  const navigate = useNavigate();

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
    getMinPlayerOptions,
    getMaxPlayerOptions,
    getMinTurnsOptions,
    getMaxTurnsOptions,
    gameModeOptions,
    getGameModeValue,
    handleDifficultyLevelsChange,
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
    switchAndThreadInstructions,
    setWorld,
    setRules,
    setTone,
    setConflicts,
    setDecisions,
    setTypesOfThreads,
    setSwitchAndThreadInstructions,
    updateGuidelines,
    handleArrayFieldChange,
    handleAddArrayItem,
    handleRemoveArrayItem,
  } = useGuidelinesEditor({
    guidelines: formData.guidelines,
    onChange: (updates) => {
      setFormData((prev) => ({
        ...prev,
        guidelines: { ...prev.guidelines, ...updates.guidelines },
      }));
    },
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
    setIsLoading(true);

    try {
      updateGuidelines();

      const templateToSubmit: StoryTemplate = {
        ...formData,
        tags,
      };

      if (onSave) {
        // Use the provided onSave handler
        await onSave(templateToSubmit);
      } else {
        // Use the default implementation
        if (!templateToSubmit.id) {
          // Create new template
          Logger.Admin.log("Creating new template in form", templateToSubmit);
          const response = await templateApi.createTemplate(templateToSubmit);
          Logger.Admin.log("Template created successfully", response.template);
          navigate(`/admin/templates/${response.template.id}`); // Navigate to the new template's edit page
        } else {
          // Update existing template
          Logger.Admin.log(
            `Updating template: ${templateToSubmit.id}`,
            templateToSubmit
          );
          const response = await templateApi.updateTemplate(
            templateToSubmit.id,
            templateToSubmit
          );
          Logger.Admin.log("Template saved successfully", response.template);
          // Optionally, show a success notification
          // Revalidation of data for a library view would typically happen there, or if this form closes.
        }
      }
    } catch (err) {
      Logger.Admin.error("Error submitting template form:", err);
      const message =
        err instanceof Error ? err.message : "Failed to save template";
      notificationService.addErrorNotification(message);
      throw err; // Re-throw to allow the component to handle it
    } finally {
      setIsLoading(false);
    }
  };

  // AI-assisted drafting of template content
  // IMPORTANT: This function updates the existing template with AI-generated content while keeping the same ID.
  // It generates content via the AI API, extracts the content, updates the existing template, and cleans up
  // the temporary generated template to prevent duplicates.
  const handleAIDraftSetup = async (options: {
    prompt: string;
    playerCount: PlayerCount;
    maxTurns: number;
    gameMode: GameMode;
    generateImages: boolean;
    difficultyLevel?: DifficultyLevel; // Made optional
  }) => {
    setIsLoading(true);
    Logger.UI.log("AI draft setup initiated with options:", options);

    // If difficultyLevel is not provided by StoryInitializer (because it was commented out),
    // we might need to ensure a default is used if the API expects one, or if our logic here needs it.
    // For now, we'll assume the API or downstream logic can handle an undefined difficultyLevel
    // or that the AI will choose one.
    const difficultyToUse = options.difficultyLevel; // This will be undefined if not sent

    const requestData: GenerateTemplateRequest = {
      prompt: options.prompt,
      playerCount: options.playerCount,
      maxTurns: options.maxTurns,
      gameMode: options.gameMode,
      generateImages: options.generateImages,
      difficultyLevel: difficultyToUse, // Directly assign, it can be undefined
    };

    try {
      // Generate AI content first (this creates a temporary template that we'll extract content from)
      const result = await templateApi.generateTemplate(requestData);
      const generatedTemplateData = result.template;

      Logger.UI.log("AI Draft generated data:", generatedTemplateData);

      // Extract the generated content to update our existing template
      // Prepare player-specific updates separately for better type handling
      const playerSpecificUpdates: {
        [K in (typeof PLAYER_SLOTS)[number]]?: PlayerOptionsGeneration;
      } = {};
      PLAYER_SLOTS.forEach((slot) => {
        const key = slot as keyof StoryTemplate;
        if (Object.prototype.hasOwnProperty.call(generatedTemplateData, key)) {
          playerSpecificUpdates[slot] = generatedTemplateData[
            key
          ] as PlayerOptionsGeneration;
        }
      });

      // Update our existing template with the generated content (keeping the same ID)
      const updatedTemplateData: StoryTemplate = {
        ...formData, // Keep existing ID, createdAt, publicationStatus, etc.
        // Override with generated content
        title: generatedTemplateData.title || formData.title,
        teaser: generatedTemplateData.teaser || formData.teaser,
        imageInstructions:
          generatedTemplateData.imageInstructions || formData.imageInstructions,
        guidelines: generatedTemplateData.guidelines || formData.guidelines,
        storyElements:
          generatedTemplateData.storyElements || formData.storyElements,
        sharedOutcomes:
          generatedTemplateData.sharedOutcomes || formData.sharedOutcomes,
        statGroups: generatedTemplateData.statGroups || formData.statGroups,
        sharedStats: generatedTemplateData.sharedStats || formData.sharedStats,
        playerStats: generatedTemplateData.playerStats || formData.playerStats,
        characterSelectionIntroduction:
          generatedTemplateData.characterSelectionIntroduction ||
          formData.characterSelectionIntroduction,
        ...playerSpecificUpdates,
        // Update gameMode, playerCount, maxTurns from the generation options
        gameMode: options.gameMode,
        playerCountMin: options.playerCount,
        playerCountMax: options.playerCount,
        maxTurnsMin: options.maxTurns,
        maxTurnsMax: options.maxTurns,
        difficultyLevels: difficultyToUse
          ? [difficultyToUse]
          : formData.difficultyLevels,
        updatedAt: new Date().toISOString(),
      };

      // Update the existing template on the server
      if (formData.id) {
        await templateApi.updateTemplate(formData.id, updatedTemplateData);
        Logger.UI.log(
          `Updated existing template ${formData.id} with AI-generated content`
        );
      }

      // Delete the temporary generated template since we only needed its content
      if (generatedTemplateData.id !== formData.id) {
        try {
          await templateApi.deleteTemplate(generatedTemplateData.id);
          Logger.UI.log(
            `Deleted temporary AI-generated template ${generatedTemplateData.id}`
          );
        } catch (deleteError) {
          Logger.UI.warn(
            `Failed to delete temporary template ${generatedTemplateData.id}:`,
            deleteError
          );
        }
      }

      // Update the form data with our merged template
      setFormData(updatedTemplateData);

      // Switch to a relevant tab after drafting
      setActiveTab("basic");

      // No need to navigate since we're keeping the same template ID

      // Optionally, show a success notification
    } catch (err) {
      Logger.Admin.error("Error during AI draft generation:", err);
      const message =
        err instanceof Error ? err.message : "Failed to generate draft content";
      notificationService.addErrorNotification(message);
    } finally {
      setIsLoading(false);
    }
  };

  // Handlers for specific form sections
  const handleStatsChange = (updates: {
    statGroups?: string[];
    sharedStats?: Stat[];
    playerStats?: Stat[];
    playerOptions?: Record<PlayerSlot, PlayerOptionsGeneration>;
  }) => {
    setFormData((prev: StoryTemplate) => ({
      ...prev,
      statGroups: updates.statGroups || prev.statGroups,
      sharedStats: updates.sharedStats || prev.sharedStats,
      playerStats: updates.playerStats || prev.playerStats,
      ...(updates.playerOptions || {}),
    }));
  };

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
          coverPrompt: "",
        }),
        ...updates,
      },
    }));
  };

  // Handle contains images
  const handleContainsImagesChange = (containsImages: boolean) => {
    setFormData((prev) => ({
      ...prev,
      containsImages,
    }));
  };

  // Return all the handlers and state needed by the UI component
  return {
    // Core state
    activeTab,
    setActiveTab,
    formData,
    isLoading,
    // Expose data from other hooks
    world,
    rules,
    tone,
    conflicts,
    decisions,
    typesOfThreads,
    switchAndThreadInstructions,
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
    setSwitchAndThreadInstructions,
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
    handleStoryElementsChange,
    handleOutcomesChange,
    handlePlayerChange,
    handleCharacterSelectionIntroductionChange,
    handlePublicationStatusChange,
    handleShowOnWelcomeScreenChange,
    handleImageInstructionsChange,
    handleDifficultyLevelsChange,
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
    handleContainsImagesChange,
  };
}
