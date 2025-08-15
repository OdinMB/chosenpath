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
import { ImageCard } from "shared/components/ImageCard";
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
    // expose sparsity for downstream components
    isSparse,
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
    autoFixIssues,
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

  // Control visibility of AI Draft initializer when template is not sparse
  const [showAIDraftContent, setShowAIDraftContent] =
    React.useState<boolean>(isSparse);

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

  // Special handler for triggering guideline-only iteration from cards
  const handleGuidelinesIterationRequest = async (
    feedback: string,
    sections: Array<TemplateIterationSections>
  ) => {
    const uniqueSections = Array.from(new Set(["guidelines", ...sections]));
    await handleAiIterationSubmit(feedback, uniqueSections);
  };

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

        {/* Validation Status */}
        {validationResult && validationResult.stats.totalIssues > 0 && (
          <div
            className={`p-3 rounded-lg border ${
              validationResult.stats.errors > 0
                ? "bg-red-50 border-red-200"
                : "bg-yellow-50 border-yellow-200"
            } mb-4`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icons.AlertCircle
                  className={`h-5 w-5 ${
                    validationResult.stats.errors > 0
                      ? "text-red-600"
                      : "text-yellow-600"
                  }`}
                />
                <span
                  className={`font-medium ${
                    validationResult.stats.errors > 0
                      ? "text-red-800"
                      : "text-yellow-800"
                  }`}
                >
                  {validationResult.stats.errors > 0
                    ? `${validationResult.stats.errors} Error${
                        validationResult.stats.errors > 1 ? "s" : ""
                      } Found`
                    : `${validationResult.stats.warnings} Warning${
                        validationResult.stats.warnings > 1 ? "s" : ""
                      } Found`}
                </span>
              </div>
              <PrimaryButton
                onClick={autoFixIssues}
                variant="outline"
                size="sm"
              >
                Auto-Fix Issues
              </PrimaryButton>
            </div>
            {validationResult.issues.slice(0, 3).map((issue, index) => (
              <div key={index} className="mt-2 text-sm text-gray-700">
                • {issue.message}
              </div>
            ))}
            {validationResult.issues.length > 3 && (
              <div className="mt-2 text-sm text-gray-500">
                +{validationResult.issues.length - 3} more issues
              </div>
            )}
          </div>
        )}

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
          <PrimaryButton
            type="submit"
            disabled={isLoading}
            isLoading={isLoading}
            size="sm"
            className="h-10 px-4"
          >
            Save
          </PrimaryButton>
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
              // Mobile/mid publication status controls
              publicationStatus={formData.publicationStatus}
              onPublicationStatusChange={handlePublicationStatusChange}
              canPublish={canPublish}
              templateId={formData.id}
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
              onRequestGuidelinesIteration={handleGuidelinesIterationRequest}
              templateId={formData.id}
              isAiIterating={isAiIterating}
              isSparse={isSparse}
            />
          )}

          {activeTab === "elements" && (
            <StoryElementsTab
              elements={formData.storyElements || []}
              onChange={handleStoryElementsChange}
              templateId={formData.id}
              imageInstructions={formData.imageInstructions}
              canGenerateImages={canGenerateImages}
              showContextCards={true}
              isAiIterating={isAiIterating}
              isSparse={isSparse}
              // Forward AI iteration requests from the Elements card to the
              // global iteration handler. The card sets selectedSections=["storyElements"].
              // We ensure "storyElements" is included before dispatching.
              onRequestElementsIteration={async (
                feedback: string,
                sections: Array<TemplateIterationSections>
              ) => {
                const uniqueSections = Array.from(
                  new Set(["storyElements", ...sections])
                );
                await handleAiIterationSubmit(feedback, uniqueSections);
              }}
            />
          )}

          {activeTab === "outcomes" && (
            <OutcomesTab
              outcomes={formData.sharedOutcomes || []}
              onChange={handleOutcomesChange}
              // Enable player-specific outcomes in Outcomes tab
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
          )}

          {activeTab === "stats" && (
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
          )}

          {activeTab === "players" && (
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
          )}

          {activeTab === "ai-draft" && (
            <div className="mt-10">
              {!showAIDraftContent && (
                <ImageCard
                  publicImagePath="/wand.jpeg"
                  title="AI Worldbuilding Assistant"
                  className="max-w-md mx-auto"
                >
                  <div className="flex flex-col h-full">
                    <div className="text-base sm:text-lg text-gray-700 mb-3 text-center">
                      An AI Draft will override your existing World.
                    </div>
                    <div className="mt-auto flex justify-center">
                      <PrimaryButton
                        type="button"
                        leftIcon={<Icons.Wand className="h-4 w-4" />}
                        onClick={() => setShowAIDraftContent(true)}
                      >
                        Continue
                      </PrimaryButton>
                    </div>
                  </div>
                </ImageCard>
              )}
              {showAIDraftContent && (
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
              )}
            </div>
          )}
        </div>
        {/* Mobile bottom Save button (hide on AI tabs) */}
        {activeTab !== "ai-draft" && activeTab !== "ai-iterate" && (
          <div className="md:hidden mt-8">
            <PrimaryButton
              type="submit"
              disabled={isLoading}
              isLoading={isLoading}
              size="lg"
              className="w-full"
            >
              Save
            </PrimaryButton>
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
    </>
  );
};
