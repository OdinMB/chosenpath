import React from "react";
import {
  BasicInfoTab,
  GuidelinesTab,
  StatsTab,
  StoryElementsTab,
  OutcomesTab,
  PlayersTab,
} from "./";
import { StoryInitializer } from "@page/StoryInitializer";
import { StoryTemplate, PublicationStatus } from "@core/types";
import { PrimaryButton, Icons, Select } from "@components/ui";
import { useTemplateForm } from "../hooks/useTemplateForm";

type TabType =
  | "basic"
  | "guidelines"
  | "elements"
  | "outcomes"
  | "stats"
  | "players"
  | "ai-draft";

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
    getPlayerOptions,
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
    handlePlayerOptionsChange,
    handleCharacterSelectionIntroductionChange,
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
  } = useTemplateForm({
    initialTemplate: template,
    onSubmit,
    token,
    setIsLoading,
  });

  // Define tab navigation items
  const tabItems = [
    { id: "basic", label: "Basic Info" },
    { id: "guidelines", label: "Guidelines" },
    { id: "elements", label: "Elements" },
    { id: "outcomes", label: "Outcomes" },
    { id: "stats", label: "Stats" },
    { id: "players", label: "Players" },
    { id: "ai-draft", label: "AI Draft" },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-800 truncate">
          {formData.title ? formData.title : "New Template"}
        </h2>
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0">
            <Select
              value={formData.publicationStatus || PublicationStatus.Draft}
              onChange={handlePublicationStatusChange}
              variant="large"
              size="lg"
              className="w-40"
            >
              <option value={PublicationStatus.Draft}>Draft</option>
              <option value={PublicationStatus.Review}>Review</option>
              <option value={PublicationStatus.Published}>Published</option>
            </Select>
          </div>
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

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex">
          <div className="flex space-x-8">
            {tabItems.map((tab) => (
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
          </div>
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
            handleGameModeChange={handleGameModeChange}
            maxTurnsMin={formData.maxTurnsMin || 10}
            maxTurnsMax={formData.maxTurnsMax || 15}
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

        {activeTab === "guidelines" && (
          <GuidelinesTab
            template={formData}
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
            playerOptions={getPlayerOptions()}
            onChange={handleStatsChange}
          />
        )}

        {activeTab === "players" && (
          <PlayersTab
            playerOptions={getPlayerOptions()}
            onChange={handlePlayerOptionsChange}
            playerStats={formData.playerStats || []}
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
                  <p className="text-sm text-yellow-700 font-medium">Warning</p>
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
  );
};
