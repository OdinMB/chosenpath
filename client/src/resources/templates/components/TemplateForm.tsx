import React from "react";
import {
  BasicInfoTab,
  GuidelinesEditor,
  StatsTab,
  StoryElementsTab,
  OutcomesTab,
  PlayersTab,
  AiIterationForm,
  AiIterationModal,
  MediaTab,
} from "./";
import { StoryInitializer } from "page/components/StoryInitializer";
import {
  StoryTemplate,
  PublicationStatus,
  Outcome,
  StoryElement,
  TemplateIterationSections,
  GameModes,
  PlayerCount,
} from "core/types";
import { PrimaryButton, Icons, Select, Tabs, InfoIcon } from "components/ui";
import { useTemplateForm, TabType } from "../hooks/useTemplateForm";
import { ShareLink } from "components/ShareLink";
import { useAiIteration } from "../hooks/useAiIteration";
import { Logger } from "shared/logger";

interface TemplateFormProps {
  initialTemplate: StoryTemplate;
  onSave: (template: StoryTemplate) => Promise<void>;
  canPublish?: boolean;
  canSetWelcomeScreen?: boolean;
  canManageTags?: boolean;
  canGenerateImages?: boolean;
}

// Custom hook for AI draft form state management
const useAiDraftForm = (
  title?: string,
  teaser?: string,
  playerCountMax?: PlayerCount
) => {
  const [aiDraftPrompt, setAiDraftPrompt] = React.useState<string>("");
  const [hasUserSetAiDraftPrompt, setHasUserSetAiDraftPrompt] =
    React.useState(false);

  const [aiDraftPlayerCount, setAiDraftPlayerCount] = React.useState<
    PlayerCount | undefined
  >(undefined);
  const [lastSetupPlayerCount, setLastSetupPlayerCount] = React.useState<
    PlayerCount | undefined
  >(undefined);

  // Update AI draft prompt based on form data when user hasn't manually set it
  React.useEffect(() => {
    const constructedPrompt =
      title || teaser
        ? `${title || ""}${title && teaser ? " - " : ""}${teaser || ""}`.trim()
        : "";

    if (constructedPrompt && !hasUserSetAiDraftPrompt) {
      setAiDraftPrompt(constructedPrompt);
    }
  }, [title, teaser, hasUserSetAiDraftPrompt]);

  // Handle player count changes from setup
  React.useEffect(() => {
    if (playerCountMax !== undefined) {
      // If setup value changed, always update draft
      if (playerCountMax !== lastSetupPlayerCount) {
        setAiDraftPlayerCount(playerCountMax);
        setLastSetupPlayerCount(playerCountMax);
      }
      // If no draft value set yet, use setup value
      else if (aiDraftPlayerCount === undefined) {
        setAiDraftPlayerCount(playerCountMax);
        setLastSetupPlayerCount(playerCountMax);
      }
    }
  }, [playerCountMax, lastSetupPlayerCount, aiDraftPlayerCount]);

  // Handle AI draft form prompt change callback
  const handleAiDraftPromptChange = (prompt: string) => {
    setAiDraftPrompt(prompt);
    setHasUserSetAiDraftPrompt(true);
  };

  // Handle AI draft player count change callback
  const handleAiDraftPlayerCountChange = (playerCount: PlayerCount) => {
    setAiDraftPlayerCount(playerCount);
    // Don't update lastSetupPlayerCount here - we want to track setup changes separately
  };

  return {
    aiDraftPrompt,
    aiDraftPlayerCount,
    handleAiDraftPromptChange,
    handleAiDraftPlayerCountChange,
  };
};

export const TemplateForm: React.FC<TemplateFormProps> = ({
  initialTemplate,
  onSave,
  canPublish = false,
  canSetWelcomeScreen = false,
  canManageTags = false,
  canGenerateImages = true,
}) => {
  const {
    activeTab,
    setActiveTab,
    formData,
    isLoading,
    tags,
    handleSubmit: handleFormSubmit,
    getPlayerOptionsFromStoryTemplate,
    handleAIDraftSetup,
    setWorld,
    setRules,
    setTone,
    setConflicts,
    setDecisions,
    setTypesOfThreads,
    setSwitchAndThreadInstructions,
    // Field handlers
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
    handleTagsChange,
    handleShowOnWelcomeScreenChange,
    handleContainsImagesChange,
    handleImageInstructionsChange,
    handleDifficultyLevelsChange,
    // New helper functions
    getMinPlayerOptions,
    getMaxPlayerOptions,
    getMinTurnsOptions,
    getMaxTurnsOptions,
    gameModeOptions,
    getGameModeValue,
  } = useTemplateForm({
    initialTemplate,
    onSave,
  });

  // AI draft form hook
  const {
    aiDraftPrompt,
    aiDraftPlayerCount,
    handleAiDraftPromptChange,
    handleAiDraftPlayerCountChange,
  } = useAiDraftForm(formData.title, formData.teaser, formData.playerCountMax);

  // Add these hooks for AI iteration
  const {
    isModalOpen,
    iterationData,
    requestAiIteration,
    handleCloseModal,
    handleAcceptSection,
    isLoading: isAiIterating,
  } = useAiIteration();

  // Define tab navigation items
  const tabItems = [
    { id: "basic" as TabType, label: "Setup" },
    { id: "ai-draft" as TabType, label: "AI Draft" },
    { id: "media" as TabType, label: "Media" },
    { id: "guidelines" as TabType, label: "Guidelines" },
    { id: "elements" as TabType, label: "Elements" },
    { id: "outcomes" as TabType, label: "Outcomes" },
    { id: "stats" as TabType, label: "Stats" },
    { id: "players" as TabType, label: "Players" },
    { id: "ai-iterate" as TabType, label: "AI Iteration" },
  ];

  const handleAcceptSectionUpdate = (
    sectionKey: TemplateIterationSections,
    data: Partial<StoryTemplate>
  ) => {
    Logger.UI.log(`Accepting section update for ${String(sectionKey)}`);

    // Update the form state based on the section
    if (sectionKey === "guidelines" && data.guidelines) {
      const guidelines = data.guidelines;
      setWorld(guidelines.world || "");
      setRules(guidelines.rules || []);
      setTone(guidelines.tone || []);
      setConflicts(guidelines.conflicts || []);
      setDecisions(guidelines.decisions || []);
      setTypesOfThreads(guidelines.typesOfThreads || []);
      setSwitchAndThreadInstructions(
        guidelines.switchAndThreadInstructions || []
      );
    } else if (sectionKey === "storyElements" && data.storyElements) {
      handleStoryElementsChange(data.storyElements as StoryElement[]);
    } else if (sectionKey === "sharedOutcomes" && data.sharedOutcomes) {
      handleOutcomesChange(data.sharedOutcomes as Outcome[]);
    } else if (sectionKey === "stats" && data.statGroups) {
      handleStatsChange({
        statGroups: data.statGroups,
        sharedStats: data.sharedStats,
        playerStats: data.playerStats,
      });
    } else if (sectionKey === "players") {
      if (data.player1) {
        handlePlayerChange(data);
      }

      if (data.characterSelectionIntroduction) {
        handleCharacterSelectionIntroductionChange(
          data.characterSelectionIntroduction
        );
      }
    } else if (sectionKey === "media" && data.imageInstructions) {
      handleImageInstructionsChange(data.imageInstructions);
    } else if (sectionKey === "difficultyLevels" && data.difficultyLevels) {
      handleDifficultyLevelsChange(data.difficultyLevels);
    }

    // Delete the section from the iteration state and modal
    handleAcceptSection(sectionKey, data);
  };

  // Add this handler for submitting AI iteration requests
  const handleAiIterationSubmit = async (
    feedback: string,
    sections: Array<TemplateIterationSections>
  ) => {
    try {
      await requestAiIteration(formData, feedback, sections);
    } catch (error) {
      console.error("Error submitting AI iteration:", error);
    }
  };

  // Use a separate AI iteration section that's not inside the main form
  const renderAiIterationSection = () => {
    if (activeTab !== "ai-iterate" || !formData.id) return null;

    return (
      <div className="p-4 bg-white rounded-lg border border-primary-100 shadow-md">
        <AiIterationForm
          onSubmit={handleAiIterationSubmit}
          isLoading={isAiIterating}
          templateId={formData.id}
        />
      </div>
    );
  };

  // Custom submit handler that calls the provided onSave prop
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await handleFormSubmit(e);
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800 truncate">
            {formData.title ? formData.title : "New Template"}
          </h2>
          <div className="flex gap-2">
            <PrimaryButton
              type="submit"
              disabled={isLoading}
              isLoading={isLoading}
              size="lg"
            >
              Save
            </PrimaryButton>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-4">
          {/* Allow all users to select a publication status, but restrict 'Published' option if !canPublish */}
          <div className="flex items-center">
            <Select
              value={formData.publicationStatus || PublicationStatus.Draft}
              onChange={handlePublicationStatusChange}
              variant="default"
              size="sm"
              className="w-40"
            >
              <option value={PublicationStatus.Draft}>Draft</option>
              <option value={PublicationStatus.Review}>Review</option>
              {canPublish && (
                <option value={PublicationStatus.Published}>Published</option>
              )}
              <option value={PublicationStatus.Private}>Private</option>
            </Select>
            <InfoIcon
              tooltipText={
                <div className="text-sm">
                  <div className="mb-2">
                    <strong>Draft:</strong> nobody can see this World or play
                    stories in it
                  </div>
                  <div className="mb-2">
                    <strong>Private:</strong> you can share a link to your World
                    to allow players to play stories in it.
                  </div>
                  <div className="mb-2">
                    <strong>Review:</strong> flagging the World to be reviewed
                    for public display on chosenpath.ai.
                  </div>
                  <div>
                    <strong>Published:</strong> lists the story on
                    chosenpath.ai. Can only be set by admins.
                  </div>
                </div>
              }
              position="right"
              className="ml-2"
            />
          </div>

          {formData.id &&
            (formData.publicationStatus === PublicationStatus.Published ||
              formData.publicationStatus === PublicationStatus.Private) && (
              <ShareLink templateId={formData.id} showText={false} />
            )}
        </div>

        <Tabs
          items={tabItems}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          variant="bordered"
        />

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
              handleGameModeChange={handleGameModeChange}
              maxTurnsMin={formData.maxTurnsMin || 20}
              maxTurnsMax={formData.maxTurnsMax || 25}
              setMaxTurnsMin={handleMaxTurnsMinChange}
              setMaxTurnsMax={handleMaxTurnsMaxChange}
              tags={tags}
              handleTagsChange={canManageTags ? handleTagsChange : undefined}
              // Helper functions
              getMinPlayerOptions={getMinPlayerOptions}
              getMaxPlayerOptions={getMaxPlayerOptions}
              getMinTurnsOptions={getMinTurnsOptions}
              getMaxTurnsOptions={getMaxTurnsOptions}
              gameModeOptions={gameModeOptions}
              getGameModeValue={getGameModeValue}
              showOnWelcomeScreen={formData.showOnWelcomeScreen || false}
              setShowOnWelcomeScreen={
                canSetWelcomeScreen
                  ? handleShowOnWelcomeScreenChange
                  : undefined
              }
              difficultyLevels={formData.difficultyLevels || []}
              handleDifficultyLevelsChange={handleDifficultyLevelsChange}
            />
          )}

          {activeTab === "media" && (
            <MediaTab
              templateId={formData.id}
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
              containsImages={formData.containsImages || false}
              setContainsImages={handleContainsImagesChange}
              canGenerateImages={canGenerateImages}
            />
          )}

          {activeTab === "guidelines" && (
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
                // Delegate to useTemplateForm's update mechanisms
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
            />
          )}

          {activeTab === "elements" && (
            <StoryElementsTab
              elements={formData.storyElements || []}
              onChange={handleStoryElementsChange}
              templateId={formData.id}
              imageInstructions={formData.imageInstructions}
              canGenerateImages={canGenerateImages}
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
              playerOptions={getPlayerOptionsFromStoryTemplate(formData)}
              onChange={handleStatsChange}
            />
          )}

          {activeTab === "players" && (
            <PlayersTab
              playerOptions={getPlayerOptionsFromStoryTemplate(formData)}
              onChange={handlePlayerChange}
              playerStats={formData.playerStats || []}
              templateId={formData.id}
              imageInstructions={formData.imageInstructions}
              canGenerateImages={canGenerateImages}
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
          )}

          {activeTab === "ai-draft" && (
            <div className="p-4 bg-white rounded-lg border border-primary-100 shadow-md">
              <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-4">
                <div className="flex items-start">
                  <Icons.Info className="h-5 w-5 text-blue-400 mr-2 mt-0.5" />
                  <div>
                    <p className="text-sm text-blue-700 mb-3">
                      Drop your ideas into this form to get a full draft of your
                      World. This can be a premise, loose ideas, or a detailed
                      outline.
                    </p>
                    <p className="text-sm text-blue-700 font-medium">
                      Warning: Generating a draft will override your World.
                    </p>
                  </div>
                </div>
              </div>
              <StoryInitializer
                onSetup={handleAIDraftSetup}
                onBack={() => setActiveTab("basic")}
                initialPlayerCount={
                  aiDraftPlayerCount || formData.playerCountMax
                }
                initialMaxTurns={formData.maxTurnsMin}
                initialGameMode={formData.gameMode || GameModes.Cooperative}
                showBackButton={false}
                isLoading={isLoading}
                templateMode={true}
                showDifficultySlider={false}
                initialPrompt={aiDraftPrompt}
                onPlayerCountChange={handleAiDraftPlayerCountChange}
                onPromptChange={handleAiDraftPromptChange}
              />
            </div>
          )}
        </div>
      </form>

      {/* Render the AI-iterate tab outside the main form */}
      {renderAiIterationSection()}

      {/* Add the AI iteration modal */}
      <AiIterationModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        iterationData={iterationData}
        onAcceptSection={handleAcceptSectionUpdate}
        playerOptions={getPlayerOptionsFromStoryTemplate(iterationData)}
        originalPlayerStats={formData.playerStats || []}
      />
    </>
  );
};
