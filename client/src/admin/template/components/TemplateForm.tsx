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
} from "core/types";
import { PrimaryButton, Icons, Select, Tabs } from "components/ui";
import { useTemplateForm, TabType } from "../hooks/useTemplateForm";
import { ShareLink } from "components/ShareLink";
import { useAiIteration } from "../hooks/useAiIteration";
import { Logger } from "shared/logger";

interface TemplateFormProps {
  template: StoryTemplate;
  onSubmit: (template: StoryTemplate) => void;
  isLoading: boolean;
  token: string;
  setIsLoading: (isLoading: boolean) => void;
}

export const TemplateForm: React.FC<TemplateFormProps> = ({
  template,
  onSubmit,
  isLoading,
  token,
  setIsLoading,
}) => {
  const {
    activeTab,
    setActiveTab,
    formData,
    tags,
    handleSubmit,
    getPlayerOptionsFromStoryTemplate,
    handleAIDraftSetup,
    setWorld,
    setRules,
    setTone,
    setConflicts,
    setDecisions,
    setTypesOfThreads,
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
    handleImageInstructionsChange,
    // New helper functions
    getMinPlayerOptions,
    getMaxPlayerOptions,
    getMinTurnsOptions,
    getMaxTurnsOptions,
    gameModeOptions,
    getGameModeValue,
  } = useTemplateForm({
    initialTemplate: template,
    onSubmit,
    token,
    setIsLoading,
  });

  // Add these hooks for AI iteration
  const {
    isModalOpen,
    iterationData,
    requestAiIteration,
    handleCloseModal,
    handleAcceptSection,
  } = useAiIteration({
    token,
    setIsLoading,
  });

  // Define tab navigation items
  const tabItems = [
    { id: "basic" as TabType, label: "Setup" },
    { id: "media" as TabType, label: "Media" },
    { id: "guidelines" as TabType, label: "Guidelines" },
    { id: "elements" as TabType, label: "Elements" },
    { id: "outcomes" as TabType, label: "Outcomes" },
    { id: "stats" as TabType, label: "Stats" },
    { id: "players" as TabType, label: "Players" },
    { id: "ai-draft" as TabType, label: "Draft" },
    { id: "ai-iterate" as TabType, label: "Iteration" },
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
    } else if (sectionKey === "storyElements" && data.storyElements) {
      handleStoryElementsChange(data.storyElements as StoryElement[]);
    } else if (sectionKey === "sharedOutcomes" && data.sharedOutcomes) {
      handleOutcomesChange(data.sharedOutcomes as Outcome[]);
    } else if (sectionKey === "stats" && data.statGroups) {
      handleStatsChange({
        statGroups: data.statGroups,
        sharedStats: data.sharedStats,
        playerStats: data.playerStats,
        initialSharedStatValues: data.initialSharedStatValues,
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
      setIsLoading(true);
      await requestAiIteration(formData, feedback, sections);
    } catch (error) {
      console.error("Error submitting AI iteration:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Use a separate AI iteration section that's not inside the main form
  const renderAiIterationSection = () => {
    if (activeTab !== "ai-iterate") return null;

    return (
      <div className="p-4 bg-white rounded-lg border border-primary-100 shadow-md">
        <AiIterationForm
          onSubmit={handleAiIterationSubmit}
          isLoading={isLoading}
          templateId={formData.id}
        />
      </div>
    );
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800 truncate">
            {formData.title ? formData.title : "New Template"}
          </h2>
          <div>
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
          <Select
            value={formData.publicationStatus || PublicationStatus.Draft}
            onChange={handlePublicationStatusChange}
            variant="default"
            size="sm"
            className="w-40"
          >
            <option value={PublicationStatus.Draft}>Draft</option>
            <option value={PublicationStatus.Review}>Review</option>
            <option value={PublicationStatus.Published}>Published</option>
          </Select>

          {formData.id &&
            formData.publicationStatus === PublicationStatus.Published && (
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
              handleTagsChange={handleTagsChange}
              // Helper functions
              getMinPlayerOptions={getMinPlayerOptions}
              getMaxPlayerOptions={getMaxPlayerOptions}
              getMinTurnsOptions={getMinTurnsOptions}
              getMaxTurnsOptions={getMaxTurnsOptions}
              gameModeOptions={gameModeOptions}
              getGameModeValue={getGameModeValue}
              showOnWelcomeScreen={formData.showOnWelcomeScreen || false}
              setShowOnWelcomeScreen={handleShowOnWelcomeScreenChange}
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
                  } = updates.guidelines;
                  if (world !== undefined) setWorld(world);
                  if (rules !== undefined) setRules(rules);
                  if (tone !== undefined) setTone(tone);
                  if (conflicts !== undefined) setConflicts(conflicts);
                  if (decisions !== undefined) setDecisions(decisions);
                  if (typesOfThreads !== undefined)
                    setTypesOfThreads(typesOfThreads);
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
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-2">
                <div className="flex items-start">
                  <Icons.Warning className="h-5 w-5 text-yellow-400 mr-2 mt-0.5" />
                  <div>
                    <p className="text-sm text-yellow-700 font-medium">
                      Warning
                    </p>
                    <p className="text-sm text-yellow-600">
                      Generating a new template will override any existing
                      information in this form.
                    </p>
                  </div>
                </div>
              </div>
              <StoryInitializer
                onSetup={handleAIDraftSetup}
                onBack={() => setActiveTab("basic")}
                initialPlayerCount={formData.playerCountMin}
                initialMaxTurns={formData.maxTurnsMin}
                initialGameMode={formData.gameMode}
                showBackButton={false}
                isLoading={isLoading}
                wrappingForm={true}
                templateMode={true}
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
