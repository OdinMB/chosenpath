import { useState, useEffect } from "react";
import { AcademyContextCard } from "./AcademyContextCard";
import { AiIterationCard } from "./AiIterationCard";
import { AiIterationSuggestDraft } from "./AiIterationSuggestDraft";
import { Stat, PlayerSlot, PlayerOptionsGeneration } from "core/types";
import { useStatEditorHelpers } from "../hooks/useStatEditor";
import { StatGroupEditor } from "./StatGroupEditor";
import { StatListSection } from "./StatListSection";

type StatsTabProps = {
  statGroups: string[];
  sharedStats: Stat[];
  playerStats: Stat[];
  playerOptions: Record<PlayerSlot, PlayerOptionsGeneration>;
  onChange?: (updates: {
    statGroups?: string[];
    sharedStats?: Stat[];
    playerStats?: Stat[];
    playerOptions?: Record<PlayerSlot, PlayerOptionsGeneration>;
  }) => void;
  readOnly?: boolean;
  showContextCards?: boolean;
  isAiIterating?: boolean;
  isSparse?: boolean;
  templateId?: string;
  onRequestStatsIteration?: (
    feedback: string,
    sections: string[]
  ) => Promise<void> | void;
};

export const StatsTab = ({
  statGroups,
  sharedStats,
  playerStats,
  playerOptions,
  onChange,
  readOnly = false,
  showContextCards = true,
  isAiIterating,
  isSparse = false,
  templateId,
  onRequestStatsIteration,
}: StatsTabProps) => {
  // Track which stats are being edited by their IDs
  const [editingStats, setEditingStats] = useState<Set<string>>(new Set());

  // Use the extracted helper functions
  const {
    handleAddStat,
    handleUpdateStat,
    handleRemoveStat,
    handleConvertStat,
    ensureBackgroundCompleteness,
  } = useStatEditorHelpers({
    statGroups,
    sharedStats,
    playerStats,
    playerOptions,
    editingStats,
    onChange,
    setEditingStats,
    readOnly,
  });

  // Automatically validate and fix background completeness when player stats change
  useEffect(() => {
    if (readOnly || !onChange) return;

    const validatedPlayerOptions = ensureBackgroundCompleteness(
      playerOptions,
      playerStats
    );
    if (validatedPlayerOptions !== playerOptions) {
      console.log("Auto-correcting background completeness");
      onChange({ playerOptions: validatedPlayerOptions });
    }
  }, [
    playerStats,
    playerOptions,
    ensureBackgroundCompleteness,
    onChange,
    readOnly,
  ]);

  const handleUpdateStatGroups = (updatedGroups: string[]) => {
    if (readOnly || !onChange) return;
    onChange({ statGroups: updatedGroups });
  };

  return (
    <div className="space-y-8">
      {showContextCards && !readOnly && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <AcademyContextCard
            lectureHref="/academy/stats"
            blurb="Stats model what matters in your World: conditions, resources, abilities, relationships, ..."
            blurbShort="Model what matters: conditions, resources, abilities, relationships, ..."
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
                if (onRequestStatsIteration) {
                  await onRequestStatsIteration(feedback, sections as string[]);
                }
              }}
              templateId={templateId}
              isLoading={Boolean(isAiIterating)}
              placeholder="Instructions"
              placeholderShort="Instructions"
              selectedSections={["stats", "players"]}
              buttonText="Improve Stats"
            />
          )}
        </div>
      )}
      {/* Stat Groups */}
      <StatGroupEditor
        statGroups={statGroups}
        onChange={handleUpdateStatGroups}
        sharedStats={sharedStats}
        playerStats={playerStats}
        readOnly={readOnly}
      />

      {/* Shared Stats */}
      <StatListSection
        title="Shared Stats"
        tooltip="Stats shared by all players in the game"
        icon="Shared stats apply to all players"
        iconColor="bg-blue-500"
        stats={sharedStats}
        statGroups={statGroups}
        type="shared"
        editingStats={editingStats}
        onAddStat={handleAddStat}
        onUpdateStat={handleUpdateStat}
        onRemoveStat={handleRemoveStat}
        onConvertStat={handleConvertStat}
        setEditingStats={setEditingStats}
        readOnly={readOnly}
      />

      {/* Player Stats */}
      <StatListSection
        title="Player Stats"
        tooltip="Stats that are unique to each player"
        icon="Player stats are unique to each player"
        iconColor="bg-green-500"
        stats={playerStats}
        statGroups={statGroups}
        type="player"
        editingStats={editingStats}
        onAddStat={handleAddStat}
        onUpdateStat={handleUpdateStat}
        onRemoveStat={handleRemoveStat}
        onConvertStat={handleConvertStat}
        setEditingStats={setEditingStats}
        readOnly={readOnly}
      />
    </div>
  );
};
