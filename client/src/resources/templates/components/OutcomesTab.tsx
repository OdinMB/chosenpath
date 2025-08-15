import React from "react";
import { PrimaryButton, Icons } from "components/ui";
import { AcademyContextCard } from "./AcademyContextCard";
import { AiIterationCard } from "./AiIterationCard";
import { AiIterationSuggestDraft } from "./AiIterationSuggestDraft";
import { AcademyContextButton } from "components";
import { Outcome, PlayerOptionsGeneration, PlayerSlot, Stat } from "core/types";
// MAX_PLAYERS handled within PlayerOutcomesAll
import { OutcomeEditor } from "./OutcomeEditor";
import { useOutcomeEditor } from "../hooks/useOutcomeEditor";
import { OutcomePlayerSection } from "./PlayerOutcomes";

interface OutcomesTabProps {
  outcomes: Outcome[];
  onChange?: (outcomes: Outcome[]) => void;
  readOnly?: boolean;
  // Optional: enable listing/editing player-specific outcomes here too
  playerOptions?: Record<PlayerSlot, PlayerOptionsGeneration>;
  onPlayerOptionsChange?: (
    updates: Record<PlayerSlot, PlayerOptionsGeneration>
  ) => void;
  playerStats?: Stat[];
  showContextCards?: boolean;
  isAiIterating?: boolean;
  isSparse?: boolean;
  templateId?: string;
  onRequestOutcomesIteration?: (
    feedback: string,
    sections: string[]
  ) => Promise<void> | void;
}

export const OutcomesTab: React.FC<OutcomesTabProps> = ({
  outcomes,
  onChange,
  readOnly = false,
  playerOptions,
  onPlayerOptionsChange,
  playerStats,
  showContextCards = true,
  isAiIterating,
  isSparse = false,
  templateId,
  onRequestOutcomesIteration,
}) => {
  const {
    editingOutcomes,
    setEditingOutcomes,
    handleAddOutcome,
    handleUpdateOutcome,
    handleRemoveOutcome,
  } = useOutcomeEditor(outcomes, onChange, readOnly);

  // Determine whether to render player-specific outcomes
  const enablePlayerOutcomes =
    !!playerOptions && !!onPlayerOptionsChange && !!playerStats;

  return (
    <div className="space-y-4">
      {showContextCards && !readOnly && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <AcademyContextCard
            lectureHref="/academy/outcomes-milestones-resolutions"
            blurb="Outcomes are the questions that every story in your World will answer."
            blurbShort="Outcomes are the questions that every story in your World will answer."
          />
          {isSparse ? (
            <AiIterationSuggestDraft
              onGoToDraft={() =>
                window.dispatchEvent(
                  new CustomEvent("cp:set-active-tab", {
                    detail: { tab: "ai-draft" },
                  })
                )
              }
            />
          ) : (
            <AiIterationCard
              onRequestIteration={async (feedback, sections) => {
                if (onRequestOutcomesIteration) {
                  await onRequestOutcomesIteration(
                    feedback,
                    sections as string[]
                  );
                }
              }}
              templateId={templateId}
              isLoading={Boolean(isAiIterating)}
              placeholder="Instructions"
              placeholderShort="Instructions"
              selectedSections={["sharedOutcomes", "players"]}
              buttonText="Improve Outcomes"
            />
          )}
        </div>
      )}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">Shared Outcomes</h3>
          <AcademyContextButton
            mode="icon"
            content={
              <div>
                <div className="font-semibold mb-2">Shared Outcomes</div>
                <div className="text-sm mb-2">
                  Apply to all players in the story. Address big questions that
                  affect everyone. In multiplayer games that are collaborative
                  (or mixed), all players try to achieve the shared outcomes
                  together. In competitive games, players compete for shared
                  outcomes to go their way.
                </div>
                <ul className="list-disc ml-5 text-sm text-gray-700 space-y-1 mb-2">
                  <li>
                    <strong>Collaborative:</strong> Will the Hero Guilds reform
                    their anti-goblin policies? (Assuming all players are Goblin
                    activists.)
                  </li>
                  <li>
                    <strong>Competitive:</strong> Who will become the King's
                    Black Hand? (In a World in which players compete for
                    positions at a royal court.)
                  </li>
                </ul>
                <div className="text-sm">
                  For more information, see the lecture “The Drivers: Outcomes,
                  Milestones, Resolutions”.
                </div>
              </div>
            }
            link="/academy/outcomes-milestones-resolutions"
          />
        </div>
        {!readOnly && (
          <PrimaryButton
            variant="outline"
            leftBorder={false}
            size="sm"
            onClick={handleAddOutcome}
            leftIcon={<Icons.Plus className="h-4 w-4" />}
          />
        )}
      </div>

      {outcomes.map((outcome, index) => (
        <OutcomeEditor
          key={outcome.id}
          outcome={outcome}
          index={index}
          editingOutcomes={editingOutcomes}
          setEditingOutcomes={setEditingOutcomes}
          onDelete={() => handleRemoveOutcome(index)}
          onUpdate={(idx, updatedOutcome) =>
            handleUpdateOutcome(idx, updatedOutcome as Outcome)
          }
          readOnly={readOnly}
        />
      ))}

      {enablePlayerOutcomes && playerOptions && onPlayerOptionsChange && (
        <OutcomePlayerSection
          playerOptions={
            playerOptions as Record<PlayerSlot, PlayerOptionsGeneration>
          }
          onPlayerOptionsChange={
            onPlayerOptionsChange as (
              updates: Record<PlayerSlot, PlayerOptionsGeneration>
            ) => void
          }
          playerStats={playerStats as Stat[]}
          readOnly={readOnly}
        />
      )}
    </div>
  );
};
