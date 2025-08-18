import React from "react";
import {
  BasicInfoTab,
  GuidelinesEditor,
  StatsTab,
  StoryElementsTab,
  OutcomesTab,
  PlayersTab,
  MediaTab,
  AiDraftTab,
} from "./";
import {
  StoryTemplate,
  Outcome,
  StoryElement,
  Stat,
  PlayerSlot,
  PlayerOptionsGeneration,
  TemplateIterationSections,
  CharacterSelectionIntroduction,
  ImageInstructions,
  DifficultyLevel,
  PlayerCount,
  GameMode,
} from "core/types";
import { TabType } from "../hooks/useTemplateForm";

interface TabRendererProps {
  activeTab: TabType;
  formData: StoryTemplate;
  isLoading: boolean;
  isSparse: boolean;
  isAiIterating: boolean;
  tags: string[];

  // Permissions
  canPublish: boolean;
  canSetWelcomeScreen: boolean;
  canManageTags: boolean;
  canGenerateImages: boolean;

  // Basic info handlers
  handleTitleChange: (title: string) => void;
  handleTeaserChange: (teaser: string) => void;
  handlePlayerCountMinChange: (value: PlayerCount) => void;
  handlePlayerCountMaxChange: (value: PlayerCount) => void;
  handleGameModeChange: (value: number) => void;
  handleMaxTurnsMinChange: (value: number) => void;
  handleMaxTurnsMaxChange: (value: number) => void;
  handleTagsChange?: (tags: string[]) => void;
  handleShowOnWelcomeScreenChange?: (value: boolean) => void;
  handleDifficultyLevelsChange: (levels: DifficultyLevel[]) => void;
  handlePublicationStatusChange: (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => void;

  // Guidelines handlers
  setWorld: (world: string) => void;
  setRules: (rules: string[]) => void;
  setTone: (tone: string[]) => void;
  setConflicts: (conflicts: string[]) => void;
  setDecisions: (decisions: string[]) => void;
  setTypesOfThreads: (types: string[]) => void;
  setSwitchAndThreadInstructions: (instructions: string[]) => void;

  // Other section handlers
  handleStatsChange: (updates: {
    statGroups?: string[];
    sharedStats?: Stat[];
    playerStats?: Stat[];
    playerOptions?: Record<PlayerSlot, PlayerOptionsGeneration>;
  }) => void;
  handleStoryElementsChange: (elements: StoryElement[]) => void;
  handleOutcomesChange: (outcomes: Outcome[]) => void;
  handlePlayerChange: (update: Partial<StoryTemplate>) => void;
  handleCharacterSelectionIntroductionChange: (
    intro: CharacterSelectionIntroduction
  ) => void;
  handleImageInstructionsChange: (
    instructions: Partial<ImageInstructions>
  ) => void;
  handleCoverReferenceImagesChange: (ids: string[]) => void;
  handleContainsImagesChange: (contains: boolean) => void;

  // AI iteration handlers
  handleAiIterationSubmit: (
    feedback: string,
    sections: Array<TemplateIterationSections>
  ) => Promise<void>;

  // AI draft handlers
  handleAIDraftSetup: (options: {
    prompt: string;
    playerCount: PlayerCount;
    maxTurns: number;
    gameMode: GameMode;
    generateImages: boolean;
    difficultyLevel?: DifficultyLevel;
  }) => Promise<void>;
  aiDraftPrompt: string;
  aiDraftPlayerCount: PlayerCount | undefined;
  handleAiDraftPromptChange: (prompt: string) => void;
  handleAiDraftPlayerCountChange: (playerCount: PlayerCount) => void;

  // Helper functions
  getMinPlayerOptions: () => number[];
  getMaxPlayerOptions: () => number[];
  getMinTurnsOptions: () => number[];
  getMaxTurnsOptions: () => number[];
  gameModeOptions: Array<{ value: number; label: string }>;
  getGameModeValue: () => number;
  getPlayerOptionsFromStoryTemplate: (
    template: Partial<StoryTemplate>
  ) => Record<string, PlayerOptionsGeneration>;

  // Navigation
  setActiveTab: (tab: TabType) => void;
}

export const TemplateTabRenderer: React.FC<TabRendererProps> = (props) => {
  const {
    activeTab,
    formData,
    isLoading,
    isSparse,
    isAiIterating,
    tags,
    canPublish,
    canSetWelcomeScreen,
    canManageTags,
    canGenerateImages,
    handleTitleChange,
    handleTeaserChange,
    handlePlayerCountMinChange,
    handlePlayerCountMaxChange,
    handleGameModeChange,
    handleMaxTurnsMinChange,
    handleMaxTurnsMaxChange,
    handleTagsChange,
    handleShowOnWelcomeScreenChange,
    handleDifficultyLevelsChange,
    handlePublicationStatusChange,
    setWorld,
    setRules,
    setTone,
    setConflicts,
    setDecisions,
    setTypesOfThreads,
    setSwitchAndThreadInstructions,
    handleStatsChange,
    handleStoryElementsChange,
    handleOutcomesChange,
    handlePlayerChange,
    handleCharacterSelectionIntroductionChange,
    handleImageInstructionsChange,
    handleContainsImagesChange,
    handleCoverReferenceImagesChange,
    handleAiIterationSubmit,
    handleAIDraftSetup,
    aiDraftPrompt,
    aiDraftPlayerCount,
    handleAiDraftPromptChange,
    handleAiDraftPlayerCountChange,
    getMinPlayerOptions,
    getMaxPlayerOptions,
    getMinTurnsOptions,
    getMaxTurnsOptions,
    gameModeOptions,
    getGameModeValue,
    getPlayerOptionsFromStoryTemplate,
    setActiveTab,
  } = props;

  // Helper for AI iteration handlers
  const handleGuidelinesIterationRequest = async (
    feedback: string,
    sections: Array<TemplateIterationSections>
  ) => {
    const uniqueSections = Array.from(new Set(["guidelines", ...sections]));
    await handleAiIterationSubmit(feedback, uniqueSections);
  };

  const handleElementsIterationRequest = async (
    feedback: string,
    sections: Array<TemplateIterationSections>
  ) => {
    const uniqueSections = Array.from(new Set(["storyElements", ...sections]));
    await handleAiIterationSubmit(feedback, uniqueSections);
  };

  switch (activeTab) {
    case "basic":
      return (
        <BasicInfoTab
          title={formData.title || ""}
          setTitle={handleTitleChange}
          teaser={formData.teaser || ""}
          setTeaser={handleTeaserChange}
          playerCountMin={formData.playerCountMin}
          playerCountMax={formData.playerCountMax}
          setPlayerCountMin={handlePlayerCountMinChange}
          setPlayerCountMax={handlePlayerCountMaxChange}
          handleGameModeChange={handleGameModeChange}
          maxTurnsMin={formData.maxTurnsMin || 20}
          maxTurnsMax={formData.maxTurnsMax || 25}
          setMaxTurnsMin={handleMaxTurnsMinChange}
          setMaxTurnsMax={handleMaxTurnsMaxChange}
          tags={tags}
          handleTagsChange={canManageTags ? handleTagsChange : undefined}
          getMinPlayerOptions={getMinPlayerOptions}
          getMaxPlayerOptions={getMaxPlayerOptions}
          getMinTurnsOptions={getMinTurnsOptions}
          getMaxTurnsOptions={getMaxTurnsOptions}
          gameModeOptions={gameModeOptions}
          getGameModeValue={getGameModeValue}
          showOnWelcomeScreen={formData.showOnWelcomeScreen || false}
          setShowOnWelcomeScreen={
            canSetWelcomeScreen ? handleShowOnWelcomeScreenChange : undefined
          }
          difficultyLevels={formData.difficultyLevels || []}
          handleDifficultyLevelsChange={handleDifficultyLevelsChange}
          publicationStatus={formData.publicationStatus}
          onPublicationStatusChange={handlePublicationStatusChange}
          canPublish={canPublish}
          templateId={formData.id}
        />
      );

    case "media":
      return (
        <MediaTab
          templateId={formData.id}
          elements={formData.storyElements || []}
          imageInstructions={
            formData.imageInstructions || {
              visualStyle: "",
              atmosphere: "",
              colorPalette: "",
              settingDetails: "",
              characterStyle: "",
              artInfluences: "",
              coverPrompt: "",
            }
          }
          setImageInstructions={handleImageInstructionsChange}
          coverRefs={formData.coverImageReferenceIds || []}
          onCoverRefsChange={handleCoverReferenceImagesChange}
          // wire cover reference images to template state via useTemplateForm
          containsImages={formData.containsImages || false}
          setContainsImages={handleContainsImagesChange}
          canGenerateImages={canGenerateImages}
          showContextCards={true}
          isAiIterating={isAiIterating}
          isSparse={isSparse}
          onRequestMediaIteration={async (
            feedback: string,
            sections: Array<TemplateIterationSections>
          ) => {
            await handleAiIterationSubmit(feedback, sections);
          }}
        />
      );

    case "guidelines":
      return (
        <GuidelinesEditor
          guidelines={
            formData.guidelines || {
              world: "",
              rules: [],
              tone: [],
              conflicts: [],
              decisions: [],
              typesOfThreads: [],
              switchAndThreadInstructions: [],
            }
          }
          onChange={(updates) => {
            if (updates.guidelines) {
              const {
                world,
                rules,
                tone,
                conflicts,
                decisions,
                typesOfThreads,
                switchAndThreadInstructions,
              } = updates.guidelines;
              if (world !== undefined) setWorld(world);
              if (rules !== undefined) setRules(rules);
              if (tone !== undefined) setTone(tone);
              if (conflicts !== undefined) setConflicts(conflicts);
              if (decisions !== undefined) setDecisions(decisions);
              if (typesOfThreads !== undefined)
                setTypesOfThreads(typesOfThreads);
              if (switchAndThreadInstructions !== undefined)
                setSwitchAndThreadInstructions(switchAndThreadInstructions);
            }
          }}
          onRequestGuidelinesIteration={handleGuidelinesIterationRequest}
          templateId={formData.id}
          isAiIterating={isAiIterating}
          isSparse={isSparse}
        />
      );

    case "elements":
      return (
        <StoryElementsTab
          elements={formData.storyElements || []}
          onChange={handleStoryElementsChange}
          templateId={formData.id}
          imageInstructions={formData.imageInstructions}
          canGenerateImages={canGenerateImages}
          showContextCards={true}
          isAiIterating={isAiIterating}
          isSparse={isSparse}
          onRequestElementsIteration={handleElementsIterationRequest}
        />
      );

    case "outcomes":
      return (
        <OutcomesTab
          outcomes={formData.sharedOutcomes || []}
          onChange={handleOutcomesChange}
          playerOptions={getPlayerOptionsFromStoryTemplate(formData)}
          onPlayerOptionsChange={handlePlayerChange}
          playerStats={formData.playerStats || []}
          showContextCards={true}
          isAiIterating={isAiIterating}
          isSparse={isSparse}
          templateId={formData.id}
          onRequestOutcomesIteration={async (
            feedback: string,
            sections: Array<TemplateIterationSections>
          ) => {
            await handleAiIterationSubmit(feedback, sections);
          }}
        />
      );

    case "stats":
      return (
        <StatsTab
          statGroups={formData.statGroups || []}
          sharedStats={formData.sharedStats || []}
          playerStats={formData.playerStats || []}
          playerOptions={getPlayerOptionsFromStoryTemplate(formData)}
          onChange={handleStatsChange}
          showContextCards={true}
          isAiIterating={isAiIterating}
          isSparse={isSparse}
          templateId={formData.id}
          onRequestStatsIteration={async (
            feedback: string,
            sections: Array<TemplateIterationSections>
          ) => {
            await handleAiIterationSubmit(feedback, sections);
          }}
        />
      );

    case "players":
      return (
        <PlayersTab
          playerOptions={getPlayerOptionsFromStoryTemplate(formData)}
          onChange={handlePlayerChange}
          playerStats={formData.playerStats || []}
          templateId={formData.id}
          imageInstructions={formData.imageInstructions}
          canGenerateImages={canGenerateImages}
          showContextCards={true}
          isAiIterating={isAiIterating}
          isSparse={isSparse}
          onRequestPlayersIteration={async (
            feedback: string,
            sections: Array<TemplateIterationSections>
          ) => {
            await handleAiIterationSubmit(feedback, sections);
          }}
          characterSelectionIntroduction={
            formData.characterSelectionIntroduction || {
              title: "",
              text: "",
            }
          }
          onCharacterSelectionIntroductionChange={
            handleCharacterSelectionIntroductionChange
          }
        />
      );

    case "ai-draft":
      return (
        <AiDraftTab
          isSparse={isSparse}
          isLoading={isLoading}
          formData={{
            playerCountMax: formData.playerCountMax,
            maxTurnsMin: formData.maxTurnsMin || 20,
            gameMode: formData.gameMode,
          }}
          aiDraftPrompt={aiDraftPrompt}
          aiDraftPlayerCount={aiDraftPlayerCount}
          handleAIDraftSetup={handleAIDraftSetup}
          handleAiDraftPromptChange={handleAiDraftPromptChange}
          handleAiDraftPlayerCountChange={handleAiDraftPlayerCountChange}
          onBack={() => setActiveTab("basic")}
        />
      );

    default:
      return null;
  }
};
