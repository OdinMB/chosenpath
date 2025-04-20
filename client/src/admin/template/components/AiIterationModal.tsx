import React, { useState, useEffect } from "react";
import { PrimaryButton, Icons } from "@components/ui";
import {
  PlayerOptionsGeneration,
  PlayerSlot,
  SectionData,
  Stat,
} from "@core/types";
import {
  GuidelinesEditor,
  StoryElementsTab,
  OutcomesTab,
  StatsTab,
  PlayersTab,
} from "./";
import { Logger } from "@common/logger";

interface AiIterationModalProps {
  isOpen: boolean;
  onClose: () => void;
  iterationData: SectionData;
  onAcceptSection: (sectionKey: keyof SectionData, data: unknown) => void;
  playerOptions: Record<PlayerSlot, PlayerOptionsGeneration>;
  originalPlayerStats?: Stat[];
}

export const AiIterationModal: React.FC<AiIterationModalProps> = ({
  isOpen,
  onClose,
  iterationData,
  onAcceptSection,
  playerOptions,
  originalPlayerStats = [],
}) => {
  const [activeTab, setActiveTab] = useState<string>("guidelines");

  // Log the iterationData when it changes to debug
  useEffect(() => {
    if (isOpen && Object.keys(iterationData).length > 0) {
      Logger.UI.log("Iteration data received in modal:", iterationData);
    }
  }, [isOpen, iterationData]);

  if (!isOpen) return null;

  // Determine which tabs should be shown based on what data is available
  const tabs: Array<{ id: string; label: string }> = [];

  if (iterationData.guidelines) {
    tabs.push({ id: "guidelines", label: "Guidelines" });
  }

  if (iterationData.storyElements) {
    tabs.push({ id: "elements", label: "Elements" });
  }

  if (iterationData.sharedOutcomes) {
    tabs.push({ id: "outcomes", label: "Outcomes" });
  }

  if (
    iterationData.statGroups ||
    iterationData.sharedStats ||
    iterationData.playerStats ||
    iterationData.initialSharedStatValues ||
    iterationData.stats // Handle the case where stats are grouped under a stats object
  ) {
    tabs.push({ id: "stats", label: "Stats" });
  }

  if (
    iterationData.playerOptions ||
    iterationData.characterSelectionIntroduction ||
    iterationData.players // Handle the case where player data is nested
  ) {
    tabs.push({ id: "players", label: "Players" });
    Logger.UI.log("Players tab detected with data:", {
      playerOptions: iterationData.playerOptions,
      players: iterationData.players,
      characterSelectionIntroduction:
        iterationData.characterSelectionIntroduction,
    });
  }

  // Set active tab to first tab if we have tabs and the currently active tab doesn't exist
  if (tabs.length > 0 && !tabs.some((tab) => tab.id === activeTab)) {
    // Use the first tab available
    setTimeout(() => setActiveTab(tabs[0].id), 0);
  }

  // Get the effective player options from the iteration data
  const getEffectivePlayerOptions = () => {
    // First check if we have a players.playerOptions structure (processed data)
    if (iterationData.players?.playerOptions) {
      Logger.UI.log(
        "Using nested player options structure",
        iterationData.players.playerOptions
      );
      return iterationData.players.playerOptions;
    }

    // Then check if we have a playerOptions property (original structure)
    if (iterationData.playerOptions) {
      Logger.UI.log(
        "Using top-level player options structure",
        iterationData.playerOptions
      );
      return iterationData.playerOptions;
    }

    // Return an empty object as fallback
    Logger.UI.log(
      "No player options found in iteration data - using empty object"
    );
    return {};
  };

  // Get the effective character selection introduction
  const getEffectiveCharacterSelectionIntro = () => {
    // First check nested structure
    if (iterationData.players?.characterSelectionIntroduction) {
      return iterationData.players.characterSelectionIntroduction;
    }

    // Then check top-level property
    if (iterationData.characterSelectionIntroduction) {
      return iterationData.characterSelectionIntroduction;
    }

    // Fallback to empty intro
    return { title: "", text: "" };
  };

  // Add helper to get player stats, using original if not in iteration data
  const getEffectivePlayerStats = () => {
    // First check if iterationData has player stats
    if (iterationData.playerStats && iterationData.playerStats.length > 0) {
      Logger.UI.log(
        "Using iteration data player stats",
        iterationData.playerStats
      );
      return iterationData.playerStats;
    }

    // Otherwise use the original player stats
    Logger.UI.log("Using original template player stats", originalPlayerStats);
    return originalPlayerStats;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-lg p-6 max-w-5xl w-full mx-4 my-8 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">AI Generated Updates</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
            aria-label="Close"
          >
            <Icons.Close className="h-6 w-6" />
          </button>
        </div>

        <div className="mb-4 text-sm text-gray-600">
          Review the AI-generated updates below. You can accept each section
          individually.
        </div>

        {/* Tab navigation */}
        {tabs.length > 1 && (
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex">
              <div className="flex space-x-8">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
                      activeTab === tab.id
                        ? "border-indigo-500 text-indigo-600"
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    }`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </nav>
          </div>
        )}

        {/* Content based on active tab */}
        <div className="mt-6 bg-gray-50 p-4 rounded-md">
          {activeTab === "guidelines" && iterationData.guidelines && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium">Guidelines</h3>
                <PrimaryButton
                  onClick={() =>
                    onAcceptSection("guidelines", iterationData.guidelines)
                  }
                  leftIcon={<Icons.Check className="h-4 w-4" />}
                >
                  Accept Guidelines
                </PrimaryButton>
              </div>
              <GuidelinesEditor
                guidelines={iterationData.guidelines}
                readOnly={true}
              />
            </div>
          )}

          {activeTab === "elements" && iterationData.storyElements && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium">Story Elements</h3>
                <PrimaryButton
                  onClick={() =>
                    onAcceptSection(
                      "storyElements",
                      iterationData.storyElements
                    )
                  }
                  leftIcon={<Icons.Check className="h-4 w-4" />}
                >
                  Accept Elements
                </PrimaryButton>
              </div>
              <StoryElementsTab
                elements={iterationData.storyElements}
                onChange={() => {}}
                readOnly={true}
              />
            </div>
          )}

          {activeTab === "outcomes" && iterationData.sharedOutcomes && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium">Shared Outcomes</h3>
                <PrimaryButton
                  onClick={() =>
                    onAcceptSection(
                      "sharedOutcomes",
                      iterationData.sharedOutcomes
                    )
                  }
                  leftIcon={<Icons.Check className="h-4 w-4" />}
                >
                  Accept Outcomes
                </PrimaryButton>
              </div>
              <OutcomesTab
                outcomes={iterationData.sharedOutcomes}
                onChange={() => {}}
                readOnly={true}
              />
            </div>
          )}

          {activeTab === "stats" && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium">Stats</h3>
                <PrimaryButton
                  onClick={() => {
                    // Handle both nested and direct structure
                    const statUpdates = iterationData.stats || {
                      statGroups: iterationData.statGroups,
                      sharedStats: iterationData.sharedStats,
                      playerStats: iterationData.playerStats,
                      initialSharedStatValues:
                        iterationData.initialSharedStatValues,
                    };
                    onAcceptSection("stats", statUpdates);
                  }}
                  leftIcon={<Icons.Check className="h-4 w-4" />}
                >
                  Accept Stats
                </PrimaryButton>
              </div>
              <StatsTab
                statGroups={
                  iterationData.stats?.statGroups ||
                  iterationData.statGroups ||
                  []
                }
                sharedStats={
                  iterationData.stats?.sharedStats ||
                  iterationData.sharedStats ||
                  []
                }
                playerStats={
                  iterationData.stats?.playerStats ||
                  iterationData.playerStats ||
                  []
                }
                initialSharedStatValues={
                  iterationData.stats?.initialSharedStatValues ||
                  iterationData.initialSharedStatValues ||
                  []
                }
                playerOptions={playerOptions}
                onChange={() => {}}
                readOnly={true}
              />
            </div>
          )}

          {activeTab === "players" && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium">Player Options</h3>
                <PrimaryButton
                  onClick={() => {
                    // Get the processed player data
                    const effectivePlayerOptions = getEffectivePlayerOptions();
                    const effectiveCharacterSelectionIntro =
                      getEffectiveCharacterSelectionIntro();

                    // Create the player update structure
                    const playerUpdates = {
                      playerOptions: effectivePlayerOptions,
                      characterSelectionIntroduction:
                        effectiveCharacterSelectionIntro,
                    };

                    Logger.UI.log("Accepting player updates:", playerUpdates);
                    onAcceptSection("players", playerUpdates);
                  }}
                  leftIcon={<Icons.Check className="h-4 w-4" />}
                >
                  Accept Player Options
                </PrimaryButton>
              </div>
              <PlayersTab
                playerOptions={getEffectivePlayerOptions()}
                onChange={() => {}}
                playerStats={getEffectivePlayerStats()}
                characterSelectionIntroduction={getEffectiveCharacterSelectionIntro()}
                onCharacterSelectionIntroductionChange={() => {}}
                readOnly={true}
              />
            </div>
          )}
        </div>

        <div className="flex justify-end mt-6">
          <PrimaryButton onClick={onClose} variant="outline" leftBorder={false}>
            Close
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
};
