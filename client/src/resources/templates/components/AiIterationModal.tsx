import React, { useEffect } from "react";
import { PrimaryButton, Icons, Tabs, useTabs, Modal } from "components/ui";
import {
  PlayerOptionsGeneration,
  PlayerSlot,
  Stat,
  StoryTemplate,
  TemplateIterationSections,
} from "core/types";
import {
  GuidelinesEditor,
  StoryElementsTab,
  OutcomesTab,
  StatsTab,
  PlayersTab,
  MediaTab,
} from ".";
import { Logger } from "shared/logger";

type ModalTabType =
  | "guidelines"
  | "storyElements"
  | "sharedOutcomes"
  | "stats"
  | "players"
  | "media"
  | "difficultyLevels";

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
    iterationData.playerStats
  ) {
    tabs.push({ id: "stats", label: "Stats" });
  }

  if (iterationData.characterSelectionIntroduction || iterationData.player1) {
    tabs.push({ id: "players", label: "Players" });
  }

  if (iterationData.imageInstructions) {
    tabs.push({ id: "media", label: "Media" });
  }

  if (iterationData.difficultyLevels) {
    tabs.push({ id: "difficultyLevels", label: "Difficulty Levels" });
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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="AI Generated Updates"
      width="5xl"
      className="max-h-[90vh] overflow-y-auto"
    >
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
                onClick={() => onAcceptSection("storyElements", iterationData)}
                leftIcon={<Icons.Check className="h-4 w-4" />}
              >
                Accept Elements
              </PrimaryButton>
            </div>
            <StoryElementsTab
              elements={iterationData.storyElements}
              onChange={() => {}}
              readOnly={true}
              templateId={iterationData.id}
            />
          </div>
        )}

        {activeTab === "sharedOutcomes" && iterationData.sharedOutcomes && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Shared Outcomes</h3>
              <PrimaryButton
                onClick={() => onAcceptSection("sharedOutcomes", iterationData)}
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
              templateId={iterationData.id || ""}
              imageInstructions={iterationData.imageInstructions}
              characterSelectionIntroduction={
                iterationData.characterSelectionIntroduction
              }
              onCharacterSelectionIntroductionChange={() => {}}
              readOnly={true}
            />
          </div>
        )}

        {activeTab === "media" && iterationData.imageInstructions && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Image Instructions</h3>
              <PrimaryButton
                onClick={() => {
                  Logger.UI.log("Accepting media updates");
                  onAcceptSection("media", iterationData);
                }}
                leftIcon={<Icons.Check className="h-4 w-4" />}
              >
                Accept Image Instructions
              </PrimaryButton>
            </div>
            <MediaTab
              imageInstructions={iterationData.imageInstructions}
              setImageInstructions={() => {}}
              canGenerateImages={false}
            />
          </div>
        )}

        {activeTab === "difficultyLevels" && iterationData.difficultyLevels && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Difficulty Levels</h3>
              <PrimaryButton
                onClick={() => {
                  Logger.UI.log("Accepting difficultyLevels updates");
                  onAcceptSection("difficultyLevels", iterationData);
                }}
                leftIcon={<Icons.Check className="h-4 w-4" />}
              >
                Accept Difficulty Levels
              </PrimaryButton>
            </div>
            {/* Display basic info for difficulty levels - assuming it's an array of objects with title and modifier */}
            <div className="space-y-2">
              {iterationData.difficultyLevels.map((dl, index) => (
                <div key={index} className="p-2 border rounded bg-white">
                  <p className="font-semibold">{dl.title}</p>
                  <p className="text-sm text-gray-600">
                    Modifier: {dl.modifier}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end mt-6">
        <PrimaryButton onClick={onClose} variant="outline" leftBorder={false}>
          Close
        </PrimaryButton>
      </div>
    </Modal>
  );
};
