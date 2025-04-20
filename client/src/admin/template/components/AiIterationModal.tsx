import React, { useEffect } from "react";
import { PrimaryButton, Icons, Tabs, useTabs } from "@components/ui";
import {
  PlayerOptionsGeneration,
  PlayerSlot,
  Stat,
  StoryTemplate,
  TemplateIterationSections,
} from "@core/types";
import {
  GuidelinesEditor,
  StoryElementsTab,
  OutcomesTab,
  StatsTab,
  PlayersTab,
} from "./";
import { Logger } from "@common/logger";

type ModalTabType =
  | "guidelines"
  | "storyElements"
  | "sharedOutcomes"
  | "stats"
  | "players";

interface AiIterationModalProps {
  isOpen: boolean;
  onClose: () => void;
  iterationData: Partial<StoryTemplate>;
  onAcceptSection: (
    sectionKey: TemplateIterationSections,
    data: Partial<StoryTemplate>
  ) => void;
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
  const { activeTab, setActiveTab } = useTabs<ModalTabType>("guidelines");

  // Log the iterationData when it changes to debug
  useEffect(() => {
    if (isOpen && Object.keys(iterationData).length > 0) {
      Logger.UI.log("Iteration data received in modal:", iterationData);
    }
  }, [isOpen, iterationData]);

  if (!isOpen) return null;

  // Determine which tabs should be shown based on what data is available
  const tabs: Array<{ id: ModalTabType; label: string }> = [];

  if (iterationData.guidelines) {
    tabs.push({ id: "guidelines", label: "Guidelines" });
  }

  if (iterationData.storyElements) {
    tabs.push({ id: "storyElements", label: "Elements" });
  }

  if (iterationData.sharedOutcomes) {
    tabs.push({ id: "sharedOutcomes", label: "Outcomes" });
  }

  if (
    iterationData.statGroups ||
    iterationData.sharedStats ||
    iterationData.playerStats ||
    iterationData.initialSharedStatValues
  ) {
    tabs.push({ id: "stats", label: "Stats" });
  }

  if (iterationData.characterSelectionIntroduction || iterationData.player1) {
    tabs.push({ id: "players", label: "Players" });
  }

  // Set active tab to first tab if we have tabs and the currently active tab doesn't exist
  if (tabs.length > 0 && !tabs.some((tab) => tab.id === activeTab)) {
    // Use the first tab available
    setTimeout(() => setActiveTab(tabs[0].id as ModalTabType), 0);
  }

  // Add helper to get player stats, using original if not in iteration data
  const getEffectivePlayerStats = () => {
    // First check if iterationData has player stats
    if (iterationData.playerStats && iterationData.playerStats.length > 0) {
      Logger.UI.log("Using iteration data player stats");
      return iterationData.playerStats;
    }
    // Otherwise use the original player stats
    Logger.UI.log("Using original template player stats");
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
          <Tabs
            items={tabs}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            variant="bordered"
          />
        )}

        {/* Content based on active tab */}
        <div className="mt-6 bg-gray-50 p-4 rounded-md">
          {activeTab === "guidelines" && iterationData.guidelines && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium">Guidelines</h3>
                <PrimaryButton
                  onClick={() => onAcceptSection("guidelines", iterationData)}
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

          {activeTab === "storyElements" && iterationData.storyElements && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium">Story Elements</h3>
                <PrimaryButton
                  onClick={() =>
                    onAcceptSection("storyElements", iterationData)
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

          {activeTab === "sharedOutcomes" && iterationData.sharedOutcomes && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium">Shared Outcomes</h3>
                <PrimaryButton
                  onClick={() =>
                    onAcceptSection("sharedOutcomes", iterationData)
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
                    onAcceptSection("stats", iterationData);
                  }}
                  leftIcon={<Icons.Check className="h-4 w-4" />}
                >
                  Accept Stats
                </PrimaryButton>
              </div>
              <StatsTab
                statGroups={iterationData.statGroups || []}
                sharedStats={iterationData.sharedStats || []}
                playerStats={
                  iterationData.playerStats || getEffectivePlayerStats()
                }
                initialSharedStatValues={
                  iterationData.initialSharedStatValues || []
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
                    Logger.UI.log("Accepting player updates");
                    onAcceptSection("players", iterationData);
                  }}
                  leftIcon={<Icons.Check className="h-4 w-4" />}
                >
                  Accept Player Options
                </PrimaryButton>
              </div>
              <PlayersTab
                playerOptions={playerOptions}
                onChange={() => {}}
                playerStats={getEffectivePlayerStats()}
                characterSelectionIntroduction={
                  iterationData.characterSelectionIntroduction
                }
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
