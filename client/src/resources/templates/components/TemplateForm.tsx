import React, { useState } from "react";
import {
  AiIterationForm,
  AiIterationModal,
  TemplateTabRenderer,
} from "./";
import {
  StoryTemplate,
  PublicationStatus,
  Outcome,
  StoryElement,
  TemplateIterationSections,
} from "core/types";
import { PrimaryButton, Icons, Select, Tabs, InfoIcon } from "components/ui";
import { useTemplateForm, TabType } from "../hooks/useTemplateForm";
import { ValidationIssue } from "../utils/templateValidation";
import { ShareLink } from "components/ShareLink";
import { useAiIteration } from "../hooks/useAiIteration";
import { Logger } from "shared/logger";
import { RevertHistoryModal } from "./RevertHistoryModal";
import { TemplateWarningModals } from "./TemplateWarningModals";
import { TemplateValidationCard } from "./TemplateValidationCard";
import { useTemplateWarnings } from "../hooks/useTemplateWarnings";
import { useAiDraftForm } from "../hooks/useAiDraftForm";

interface TemplateFormProps {
  initialTemplate: StoryTemplate;
  onSave: (template: StoryTemplate) => Promise<void>;
  canPublish?: boolean;
  canSetWelcomeScreen?: boolean;
  canManageTags?: boolean;
  canGenerateImages?: boolean;
}

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
    // expose sparsity for downstream components
    isSparse,
    hasUnsavedChanges,
    saveHistory,
    discardChanges,
    revertToSave,
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
    // Validation
    validationResult,
    autoFixSingleIssue,
    // Original handlers for bypassing the warnings
    handleGameModeChangeOriginal,
    handlePlayerCountMinChangeOriginal,
    handlePlayerCountMaxChangeOriginal,
  } = useTemplateForm({
    initialTemplate,
    onSave,
    onGameModeChange: (newGameMode, oldGameMode, isSparse) => {
      if (!isSparse) {
        warningHandlers.triggerGameModeWarning(newGameMode, oldGameMode);
      }
    },
    onPlayerCountChange: (
      newMin,
      newMax,
      oldMin,
      oldMax,
      isMinChange,
      isSparse
    ) => {
      if (!isSparse) {
        warningHandlers.triggerPlayerCountWarning(newMin, newMax, oldMin, oldMax, isMinChange);
      }
    },
    onCompetitiveSingleCheck: (
      _gameMode,
      newMin,
      newMax,
      isMinChange,
      isSparse
    ) => {
      if (!isSparse) {
        warningHandlers.triggerCompetitiveSingleWarning(newMin, newMax, isMinChange);
      }
    },
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

  // Define tab navigation items with categories and desired order
  const tabItems = [
    {
      id: "ai-draft" as TabType,
      label: "AI Draft",
      category: "primary" as const,
    },
    {
      id: "ai-iterate" as TabType,
      label: "AI Iteration",
      category: "primary" as const,
    },
    { id: "basic" as TabType, label: "Meta", category: "secondary" as const },
    { id: "media" as TabType, label: "Media", category: "tertiary" as const },
    {
      id: "guidelines" as TabType,
      label: "Guidelines",
      category: "tertiary" as const,
    },
    {
      id: "elements" as TabType,
      label: "Elements",
      category: "tertiary" as const,
    },
    { id: "stats" as TabType, label: "Stats", category: "tertiary" as const },
    {
      id: "outcomes" as TabType,
      label: "Outcomes",
      category: "tertiary" as const,
    },
    {
      id: "players" as TabType,
      label: "Players",
      category: "tertiary" as const,
    },
  ];

  // Listen for tab change events (e.g., from AiIterationSuggestDraft)
  React.useEffect(() => {
    const handler = (e: Event) => {
      const custom = e as CustomEvent<{ tab?: TabType | string }>;
      const tab = custom.detail?.tab as TabType | undefined;
      if (tab) setActiveTab(tab);
    };
    window.addEventListener("cp:set-active-tab", handler as EventListener);
    return () =>
      window.removeEventListener("cp:set-active-tab", handler as EventListener);
  }, [setActiveTab]);

  // State for revert history modal
  const [showRevertModal, setShowRevertModal] = useState(false);

  // Use the warning modals hook
  const warningHandlers = useTemplateWarnings({
    handleGameModeChangeOriginal,
    handlePlayerCountMinChangeOriginal,
    handlePlayerCountMaxChangeOriginal,
  });

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

  // Special handler for triggering guideline-only iteration from cards is now in TemplateTabRenderer

  // Handle navigation from validation issues
  const handleNavigateFromIssue = (issue: ValidationIssue) => {
    if (issue.category === "images") {
      if (issue.message.includes("Cover image")) {
        setActiveTab("media");
      } else if (issue.message.includes("story elements")) {
        setActiveTab("elements");
      } else if (issue.message.includes("Player")) {
        setActiveTab("players");
      }
    }
  };

  // Warning modal handlers are now in the warningHandlers object from useTemplateWarnings

  // Use a separate AI iteration section that's not inside the main form
  const renderAiIterationSection = () => {
    if (activeTab !== "ai-iterate" || !formData.id) return null;

    return (
      <AiIterationForm
        onSubmit={handleAiIterationSubmit}
        isLoading={isAiIterating}
        templateId={formData.id}
      />
    );
  };

  // Custom submit handler that calls the provided onSave prop
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await handleFormSubmit(e);
  };

  // Initial active tab is decided in useTemplateForm via isSparse

  return (
    <>
      <form onSubmit={handleSubmit}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800 truncate">
            {formData.title ? formData.title : "New Template"}
          </h2>
          {/* Desktop save button (kept next to title) */}
          <div className="hidden lg:flex gap-2">
            {hasUnsavedChanges && (
              <PrimaryButton
                type="button"
                variant="outline"
                leftBorder={false}
                size="sm"
                onClick={discardChanges}
                title="Discard unsaved changes"
                leftIcon={<Icons.Close className="h-4 w-4" />}
              />
            )}
            {saveHistory.length > 0 && (
              <PrimaryButton
                type="button"
                variant="outline"
                leftBorder={false}
                size="sm"
                onClick={() => setShowRevertModal(true)}
                title="Revert to previous save"
                leftIcon={<Icons.Undo className="h-4 w-4" />}
              />
            )}
            <PrimaryButton
              type="submit"
              disabled={isLoading}
              isLoading={isLoading}
              size="lg"
              className={
                hasUnsavedChanges ? "ring-2 ring-secondary ring-offset-2" : ""
              }
            >
              {hasUnsavedChanges && (
                <span className="inline-block w-2 h-2 bg-white rounded-full mr-2" />
              )}
              Save
            </PrimaryButton>
          </div>
        </div>

        {/* Validation Status */}
        <TemplateValidationCard
          validationResult={validationResult}
          onNavigateFromIssue={handleNavigateFromIssue}
          onAutoFixIssue={autoFixSingleIssue}
        />

        <div className="flex items-center gap-3 mb-2">
          {/* Allow all users to select a publication status, but restrict 'Published' option if !canPublish */}
          <div className="hidden">
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
                    <strong>Draft:</strong> nobody can see this World
                  </div>
                  <div className="mb-2">
                    <strong>Private:</strong> players need a code to play
                    stories in this World.
                  </div>
                  <div className="mb-2">
                    <strong>Review:</strong> suggest the World to be published
                    on chosenpath.ai.
                  </div>
                  <div>
                    <strong>Published:</strong> World is listed on
                    chosenpath.ai.
                  </div>
                </div>
              }
              position="bottom"
              className="ml-2 mb-1"
            />
            {formData.id &&
              (formData.publicationStatus === PublicationStatus.Published ||
                formData.publicationStatus === PublicationStatus.Private) && (
                <div className="ml-2 mt-1">
                  <ShareLink templateId={formData.id} showText={false} />
                </div>
              )}
          </div>

          {/* ShareLink moved inside the status block above for consistent grouping */}
        </div>

        {/* Tabs with mobile save button aligned on the right */}
        <div className="lg:hidden flex items-center gap-2 mb-2">
          <div className="flex-1">
            <Tabs
              items={tabItems}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              variant="bordered"
              collapseToSelectOnMobile={true}
              collapseBelow="lg"
              collapsedSelectSpacingClass="mt-0"
            />
          </div>
          <div className="flex gap-1">
            {hasUnsavedChanges && (
              <PrimaryButton
                type="button"
                variant="outline"
                leftBorder={false}
                size="sm"
                onClick={discardChanges}
                title="Discard unsaved changes"
                leftIcon={<Icons.Close className="h-4 w-4" />}
              />
            )}
            {saveHistory.length > 0 && (
              <PrimaryButton
                type="button"
                variant="outline"
                leftBorder={false}
                size="sm"
                onClick={() => setShowRevertModal(true)}
                title="Revert to previous save"
                leftIcon={<Icons.Undo className="h-4 w-4" />}
              />
            )}
            <PrimaryButton
              type="submit"
              disabled={isLoading}
              isLoading={isLoading}
              size="sm"
              className={`h-10 px-4 ${
                hasUnsavedChanges ? "ring-2 ring-secondary ring-offset-1" : ""
              }`}
            >
              {hasUnsavedChanges && (
                <span className="inline-block w-1.5 h-1.5 bg-white rounded-full mr-1.5" />
              )}
              Save
            </PrimaryButton>
          </div>
        </div>
        {/* Short centered divider shown only when dropdown is visible (below lg) */}
        {/* <div className="lg:hidden mt-4 mb-8 flex justify-center">
          <div className="h-px w-40 bg-gray-200 rounded-full"></div>
        </div> */}
        {/* Desktop/large tabs */}
        <div className="hidden lg:block">
          <Tabs
            items={tabItems}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            variant="bordered"
            collapseToSelectOnMobile={true}
            collapseBelow="lg"
            collapsedSelectSpacingClass="mt-0 mb-4"
          />
        </div>

        <div className="mt-12">
          <TemplateTabRenderer
            activeTab={activeTab}
            formData={formData}
            isLoading={isLoading}
            isSparse={isSparse}
            isAiIterating={isAiIterating}
            tags={tags}
            canPublish={canPublish}
            canSetWelcomeScreen={canSetWelcomeScreen}
            canManageTags={canManageTags}
            canGenerateImages={canGenerateImages}
            handleTitleChange={handleTitleChange}
            handleTeaserChange={handleTeaserChange}
            handlePlayerCountMinChange={handlePlayerCountMinChange}
            handlePlayerCountMaxChange={handlePlayerCountMaxChange}
            handleGameModeChange={handleGameModeChange}
            handleMaxTurnsMinChange={handleMaxTurnsMinChange}
            handleMaxTurnsMaxChange={handleMaxTurnsMaxChange}
            handleTagsChange={handleTagsChange}
            handleShowOnWelcomeScreenChange={handleShowOnWelcomeScreenChange}
            handleDifficultyLevelsChange={handleDifficultyLevelsChange}
            handlePublicationStatusChange={handlePublicationStatusChange}
            setWorld={setWorld}
            setRules={setRules}
            setTone={setTone}
            setConflicts={setConflicts}
            setDecisions={setDecisions}
            setTypesOfThreads={setTypesOfThreads}
            setSwitchAndThreadInstructions={setSwitchAndThreadInstructions}
            handleStatsChange={handleStatsChange}
            handleStoryElementsChange={handleStoryElementsChange}
            handleOutcomesChange={handleOutcomesChange}
            handlePlayerChange={handlePlayerChange}
            handleCharacterSelectionIntroductionChange={handleCharacterSelectionIntroductionChange}
            handleImageInstructionsChange={handleImageInstructionsChange}
            handleContainsImagesChange={handleContainsImagesChange}
            handleAiIterationSubmit={handleAiIterationSubmit}
            handleAIDraftSetup={handleAIDraftSetup}
            aiDraftPrompt={aiDraftPrompt}
            aiDraftPlayerCount={aiDraftPlayerCount}
            handleAiDraftPromptChange={handleAiDraftPromptChange}
            handleAiDraftPlayerCountChange={handleAiDraftPlayerCountChange}
            getMinPlayerOptions={getMinPlayerOptions}
            getMaxPlayerOptions={getMaxPlayerOptions}
            getMinTurnsOptions={getMinTurnsOptions}
            getMaxTurnsOptions={getMaxTurnsOptions}
            gameModeOptions={gameModeOptions}
            getGameModeValue={getGameModeValue}
            getPlayerOptionsFromStoryTemplate={getPlayerOptionsFromStoryTemplate}
            setActiveTab={setActiveTab}
          />
        </div>
        {/* Mobile bottom Save button (hide on AI tabs) */}
        {activeTab !== "ai-draft" && activeTab !== "ai-iterate" && (
          <div className="md:hidden mt-8">
            <div className="flex gap-2">
              {hasUnsavedChanges && (
                <PrimaryButton
                  type="button"
                  variant="outline"
                  leftBorder={false}
                  size="md"
                  onClick={discardChanges}
                  title="Discard unsaved changes"
                  leftIcon={<Icons.Close className="h-4 w-4" />}
                />
              )}
              <PrimaryButton
                type="submit"
                disabled={isLoading}
                isLoading={isLoading}
                size="md"
                className={`flex-1 ${
                  hasUnsavedChanges ? "ring-2 ring-secondary ring-offset-2" : ""
                }`}
              >
                {hasUnsavedChanges && (
                  <span className="inline-block w-2 h-2 bg-white rounded-full mr-2" />
                )}
                Save
              </PrimaryButton>
            </div>
          </div>
        )}
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

      {/* Add the revert history modal */}
      <RevertHistoryModal
        isOpen={showRevertModal}
        onClose={() => setShowRevertModal(false)}
        saveHistory={saveHistory}
        onRevert={revertToSave}
      />

      {/* All warning modals */}
      <TemplateWarningModals
        showMultiplayerWarning={warningHandlers.showMultiplayerWarning}
        pendingGameModeChange={warningHandlers.pendingGameModeChange}
        handleMultiplayerWarningCancel={warningHandlers.handleMultiplayerWarningCancel}
        handleMultiplayerWarningProceed={warningHandlers.handleMultiplayerWarningProceed}
        showPlayerCountWarning={warningHandlers.showPlayerCountWarning}
        pendingPlayerCountChange={warningHandlers.pendingPlayerCountChange}
        handlePlayerCountWarningCancel={warningHandlers.handlePlayerCountWarningCancel}
        handlePlayerCountWarningProceed={warningHandlers.handlePlayerCountWarningProceed}
        showCompetitiveSingleWarning={warningHandlers.showCompetitiveSingleWarning}
        handleCompetitiveSingleWarningCancel={warningHandlers.handleCompetitiveSingleWarningCancel}
        handleCompetitiveSingleWarningProceed={warningHandlers.handleCompetitiveSingleWarningProceed}
      />
    </>
  );
};
