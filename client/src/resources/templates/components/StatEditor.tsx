import React from "react";
import { PrimaryButton, Icons, Input, Checkbox } from "components/ui";
import { ArrayField, AcademyContextButton } from "components";
import { Stat } from "core/types";
import { StatValueInput } from "./StatValueInput";
import { useStatEditor } from "../hooks/useStatEditor";
import { ConfirmDialog } from "components/ui/ConfirmDialog";

interface StatEditorProps {
  stat: Stat;
  index: number;
  type: "shared" | "player";
  statGroups: string[];
  onUpdateStat: (
    type: "shared" | "player",
    index: number,
    updates: Partial<Stat>
  ) => void;
  onRemoveStat: (type: "shared" | "player", index: number) => void;
  setEditingStats: (updater: (prev: Set<string>) => Set<string>) => void;
  readOnly?: boolean;
}

export const StatEditor: React.FC<StatEditorProps> = ({
  stat,
  index,
  type,
  statGroups,
  onUpdateStat,
  onRemoveStat,
  setEditingStats,
  readOnly = false,
}) => {
  const {
    localStat,
    handleSave,
    updateStatField,
    handleRemoveStat,
    handleClose,
    showDeleteConfirm,
    setShowDeleteConfirm,
    performRemoveStat,
    showPartOfBackgroundsConfirm,
    handleConfirmPartOfBackgroundsChange,
    handleCancelPartOfBackgroundsChange,
    pendingPartOfBackgroundsValue,
  } = useStatEditor({
    stat,
    index,
    type,
    onUpdateStat,
    onRemoveStat,
    setEditingStats,
    readOnly,
  });

  return (
    <div className="bg-white p-4 rounded-lg shadow mb-4">
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1 space-y-4 mr-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold w-24">Name</span>
            <AcademyContextButton
              mode="icon"
              content={
                <div>
                  <div className="font-semibold mb-2">
                    What Stats Tell the AI
                  </div>
                  <div className="text-sm mb-2">
                    <strong>What to Focus On:</strong> Elements captured as
                    stats become narrative priorities.
                  </div>
                  <div className="text-sm mb-2">
                    <strong>What to Monitor:</strong> The AI tracks changes and
                    adjustments to stat values.
                  </div>
                  <div className="text-sm mb-2">
                    <strong>What to Integrate:</strong> Stats shape player
                    options and influence success/failure mechanics.
                  </div>
                  <div className="text-sm">
                    For more information, see the lecture on "Stats".
                  </div>
                </div>
              }
              link="/academy/stats"
            />
            <Input
              id={`stat-name-${stat.id}`}
              name={`stat-name-${stat.id}`}
              className="flex-1"
              value={localStat.name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                updateStatField("name", e.target.value)
              }
              placeholder="Enter stat name"
              disabled={readOnly}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold w-24">ID</span>
            <div className="flex flex-1">
              <span className="inline-flex items-center px-3 rounded-l border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
                {type === "shared" ? "shared_" : "player_"}
              </span>
              <input
                id={`stat-id-${stat.id}`}
                name={`stat-id-${stat.id}`}
                className="flex-1 p-2 border rounded-r"
                value={localStat.id.replace(/^(shared_|player_)/, "")}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const prefix = type === "shared" ? "shared_" : "player_";
                  const newId = prefix + e.target.value;
                  updateStatField("id", newId);
                }}
                placeholder="Enter stat ID"
                disabled={readOnly}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold w-24">Description</span>
            <Input
              id={`stat-description-${stat.id}`}
              name={`stat-description-${stat.id}`}
              className="flex-1"
              value={localStat.tooltip}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                updateStatField("tooltip", e.target.value)
              }
              placeholder="Enter stat description"
              disabled={readOnly}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold w-24">Group</span>
            <AcademyContextButton
              mode="icon"
              content={
                <div>
                  <div className="font-semibold mb-2">Stat Groups</div>
                  <div className="text-sm mb-2">
                    Organize stats into groups for the user interface. This has
                    no mechanical effect but improves clarity.
                  </div>
                  <div className="text-sm">
                    For more information, see the lecture on "Stats".
                  </div>
                </div>
              }
              link="/academy/stats"
            />
            <select
              id={`stat-group-${stat.id}`}
              name={`stat-group-${stat.id}`}
              className="flex-1 p-2 border rounded"
              value={localStat.group}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                updateStatField("group", e.target.value)
              }
              disabled={readOnly}
            >
              {statGroups.map((group, i) => (
                <option key={i} value={group}>
                  {group}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold w-24">Type</span>
            <AcademyContextButton
              mode="icon"
              content={
                <div>
                  <div className="font-semibold mb-2">Types of Stats</div>
                  <div className="text-sm mb-2">
                    <strong>Percentage:</strong> for elements that need
                    granular, frequent tracking. Good for things with a capacity
                    limit (e.g., health, fuel, mana).
                  </div>
                  <div className="text-sm mb-2">
                    <strong>String:</strong> for discrete levels (e.g., health
                    states) or slots that can be filled with one element (e.g.,
                    romantic interest).
                  </div>
                  <div className="text-sm mb-2">
                    <strong>String List:</strong> collections (e.g., skills,
                    contacts, inventory).
                  </div>
                  <div className="text-sm mb-2">
                    <strong>Opposites:</strong> two percentage stats whose sum
                    is always 100% (e.g., Spontaneous vs. Controlled).
                  </div>
                  <div className="text-sm mb-2">
                    <strong>Number:</strong> simple counts. Use sparingly. Other
                    types often work better.
                  </div>
                  <div className="text-sm">
                    For more information, see the lecture on "Stats".{" "}
                  </div>
                </div>
              }
              link="/academy/stats"
            />
            <select
              id={`stat-type-${stat.id}`}
              name={`stat-type-${stat.id}`}
              className="flex-1 p-2 border rounded"
              value={localStat.type}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                const newType = e.target.value as Stat["type"];
                updateStatField("type", newType);
                // Reset initial value based on type
                if (
                  type === "shared" ||
                  (type === "player" &&
                    localStat.partOfPlayerBackgrounds === false)
                ) {
                  if (newType === "string") {
                    updateStatField("initialValue", "");
                  } else if (newType === "string[]") {
                    updateStatField("initialValue", []);
                  } else {
                    updateStatField("initialValue", 50);
                  }
                }
              }}
              disabled={readOnly}
            >
              <option value="percentage">Percentage</option>
              <option value="number">Number</option>
              <option value="string">String</option>
              <option value="string[]">String List</option>
              <option value="opposites">Opposites</option>
            </select>
          </div>

          {(() => {
            const canEditInitial =
              type === "shared" ||
              (type === "player" &&
                localStat.partOfPlayerBackgrounds === false);
            if (canEditInitial) {
              return (
                <div className="flex items-center gap-2">
                  <StatValueInput
                    statType={localStat.type}
                    value={
                      localStat.initialValue ||
                      (localStat.type === "string"
                        ? ""
                        : localStat.type === "string[]"
                        ? []
                        : 50)
                    }
                    onChange={(value) => updateStatField("initialValue", value)}
                    placeholder="Enter initial value"
                    className="flex-1"
                    label="Initial Value"
                    disabled={readOnly}
                  />
                </div>
              );
            }
            return (
              <div className="flex items-center gap-2">
                <span className="font-semibold">Initial Value</span>
                <span className="text-sm text-gray-600">
                  is defined in player backgrounds
                </span>
              </div>
            );
          })()}
          {/* Additional stat fields */}
          {(localStat.type === "string" || localStat.type === "string[]") && (
            <div className="flex items-center gap-2">
              <span className="font-semibold w-40">Possible Values</span>
              <Input
                id={`stat-possible-values-${stat.id}`}
                name={`stat-possible-values-${stat.id}`}
                className="flex-1"
                value={localStat.possibleValues}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateStatField("possibleValues", e.target.value)
                }
                placeholder={
                  localStat.type === "string"
                    ? "e.g., Novice, Apprentice, Master"
                    : "e.g., only minor spells, (max 4 items)"
                }
                disabled={readOnly}
              />
            </div>
          )}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id={`stat-visible-${stat.id}`}
                name={`stat-visible-${stat.id}`}
                checked={localStat.isVisible}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateStatField("isVisible", e.target.checked)
                }
                disabled={readOnly}
              />
              <label
                htmlFor={`stat-visible-${stat.id}`}
                className="font-semibold"
              >
                Visible to players
              </label>
              <AcademyContextButton
                mode="icon"
                content={
                  <div>
                    <div className="font-semibold mb-2">Visible to Players</div>
                    <div className="text-sm mb-2">
                      If deactivated, the stat will not show up in the game UI.
                    </div>
                    <div className="text-sm mb-2">
                      Useful for stats that are only relevant to the AI engine,
                      such as countdowns to doomsday events.
                    </div>
                    <div className="text-sm">
                      For more information, see the lecture on "Stats".
                    </div>
                  </div>
                }
                link="/academy/stats"
              />
            </div>

            {type === "player" && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`stat-background-${stat.id}`}
                  name={`stat-background-${stat.id}`}
                  checked={
                    localStat.partOfPlayerBackgrounds !== false ? true : false
                  }
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    updateStatField("partOfPlayerBackgrounds", e.target.checked)
                  }
                  disabled={readOnly}
                />
                <label
                  htmlFor={`stat-background-${stat.id}`}
                  className="font-semibold"
                >
                  Part of player backgrounds
                </label>
                <AcademyContextButton
                  mode="icon"
                  content={
                    <div>
                      <div className="font-semibold mb-2">
                        Part of Player Backgrounds
                      </div>
                      <div className="text-sm mb-2">
                        If activated, the initial value of this stat will be
                        defined in the player backgrounds. This means that the
                        values can vary depending on the background that the
                        player chooses at the beginning of the story.
                      </div>
                      <div className="text-sm mb-2">
                        Deactivate this if you want a player stat to have the
                        same starting value for all backgrounds.
                      </div>
                      <div className="text-sm">
                        For more information on player backgrounds, see the
                        lecture on "The Setting".
                      </div>
                    </div>
                  }
                  link="/academy/setting"
                />
              </div>
            )}

            <ArrayField
              title="Narrative Implications"
              items={localStat.narrativeImplications}
              onChange={(items: string[]) =>
                updateStatField("narrativeImplications", items)
              }
              placeholder="e.g., Below 30% causes visible weakness"
              emptyPlaceholder="Click + to add narrative implications"
              readOnly={readOnly}
              extraHeaderContent={
                <AcademyContextButton
                  mode="icon"
                  content={
                    <div>
                      <div className="font-semibold mb-2">
                        Narrative Implications
                      </div>
                      <div className="text-sm mb-2">
                        Define how this stat should affect the story. Examples:
                      </div>
                      <ul className="list-disc ml-5 text-sm text-gray-700 space-y-1 mb-2">
                        <li>
                          <strong>Health:</strong> Below 30% causes visible
                          weakness that other characters might comment on.
                        </li>
                        <li>
                          <strong>Relationship with Queen Ula:</strong> At stage
                          "Conflict" or lower, the player is no longer allowed
                          to participate in the Queen's council meetings.
                        </li>
                      </ul>
                      <div className="text-sm">
                        For more information, see the lecture on "Stats".{" "}
                      </div>
                    </div>
                  }
                  link="/academy/stats"
                />
              }
            />

            <ArrayField
              title="Effect on Success/Failure rolls"
              items={localStat.effectOnPoints}
              onChange={(items: string[]) =>
                updateStatField("effectOnPoints", items)
              }
              placeholder="e.g., Above 70% provides +10 points to social challenges"
              emptyPlaceholder="Click + to add effects"
              readOnly={readOnly}
              extraHeaderContent={
                <AcademyContextButton
                  mode="icon"
                  content={
                    <div>
                      <div className="font-semibold mb-2">
                        Success/Failure Bonuses
                      </div>
                      <div className="text-sm mb-2">
                        Explain bonuses or penalties that this stat should apply
                        to Success/Failure rolls. Examples:
                      </div>
                      <ul className="list-disc ml-5 text-sm text-gray-700 space-y-1 mb-2">
                        <li>
                          <strong>Reputation:</strong> If "Respected" or higher,
                          apply +10 points to social challenges.
                        </li>
                        <li>
                          <strong>Spaceship Integrity:</strong> If "Damaged" or
                          lower, apply -10 points to all challenges that require
                          the spaceship to function.
                        </li>
                      </ul>
                      <div className="text-sm">
                        For more information, see the lecture on "Success and
                        Failure".
                      </div>
                    </div>
                  }
                  link="/academy/success-failure"
                />
              }
            />

            <div className="flex items-center gap-2">
              <span className="font-semibold w-48">Sacrifice Options</span>
              <AcademyContextButton
                mode="icon"
                content={
                  <div>
                    <div className="font-semibold mb-2">Sacrifices</div>
                    <div className="text-sm mb-2">
                      If and how you want to allow players to sacrifice this
                      stat in exchange for a one-time boost in a Challenge.
                      Examples:
                    </div>
                    <ul className="list-disc ml-5 text-sm text-gray-700 space-y-1 mb-2">
                      <li>
                        <strong>Wealth:</strong> Can sacrifice one level to
                        bribe a character.
                      </li>
                      <li>
                        <strong>Mana:</strong> Can sacrifice 10 to use a power
                        from the player's list of special powers.
                      </li>
                    </ul>
                    <div className="text-sm mb-2">
                      While a one-time boost in a Challenge is valuable, players
                      should not be able to sacrifice stats that have a lot of
                      weight, like special powers in a superhero World.
                    </div>
                    <div className="text-sm">
                      For more information, see the lecture on "Success and
                      Failure".
                    </div>
                  </div>
                }
                link="/academy/success-failure"
              />
              <Input
                id={`stat-sacrifice-options-${stat.id}`}
                name={`stat-sacrifice-options-${stat.id}`}
                className="flex-1"
                value={localStat.optionsToSacrifice}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateStatField("optionsToSacrifice", e.target.value)
                }
                placeholder="How can this stat be sacrificed to gain a one-time boost in a Challenge?"
                disabled={readOnly}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold w-48">Reward Options</span>
              <AcademyContextButton
                mode="icon"
                content={
                  <div>
                    <div className="font-semibold mb-2">Reward Options</div>
                    <div className="text-sm mb-2">
                      If and how you want to allow players to gain this stat as
                      a reward in exchange for a one-time malus in a Challenge.
                      Examples:
                    </div>
                    <ul className="list-disc ml-5 text-sm text-gray-700 space-y-1 mb-2">
                      <li>
                        <strong>Ingredients:</strong> Can ignore the task at
                        hand to collect a rare plant at some distance while
                        outside the village.
                      </li>
                      <li>
                        <strong>Contacts:</strong> Can ignore the task at hand
                        during an investigation to help a bystander.
                      </li>
                    </ul>
                    <div className="text-sm mb-2">
                      While a one-time malus in a Challenge can be awkward,
                      players should not be able to gain stats that have a lot
                      of weight this way, like a level of trust from the Queen
                      in a World about a royal court.
                    </div>
                    <div className="text-sm">
                      For more information, see the lecture on "Success and
                      Failure".
                    </div>
                  </div>
                }
                link="/academy/success-failure"
              />
              <Input
                id={`stat-reward-options-${stat.id}`}
                name={`stat-reward-options-${stat.id}`}
                className="flex-1"
                value={localStat.optionsToGainAsReward}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateStatField("optionsToGainAsReward", e.target.value)
                }
                placeholder="How can this stat be gained as a reward for accepting a one-time malus?"
                disabled={readOnly}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id={`stat-beat-changes-${stat.id}`}
                name={`stat-beat-changes-${stat.id}`}
                checked={localStat.canBeChangedInBeatResolutions}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateStatField(
                    "canBeChangedInBeatResolutions",
                    e.target.checked
                  )
                }
                disabled={readOnly}
              />
              <label
                htmlFor={`stat-beat-changes-${stat.id}`}
                className="font-semibold"
              >
                Can be changed after each Beat
              </label>
              <AcademyContextButton
                mode="icon"
                content={
                  <div>
                    <div className="font-semibold mb-2">Beat Resolutions</div>
                    <div className="text-sm mb-2">
                      If activated, the value of this stat can change after each
                      Beat. This is useful for granular stats that you want to
                      be updated frequently, like a character's sanity as a
                      percentage stat in a Lovecraftian horror World.
                    </div>
                    <div className="text-sm mb-2">
                      If deactivated, the stat is protected from being changed
                      after a single Beat. This is useful for more impactful
                      stats that should not change somewhat randomly, like a
                      character's special abilities.
                    </div>
                    <div className="text-sm mb-2">
                      Even if deactivated, the stat can still be sacrificed and
                      gained as a reward (if you allowed these possibilities).
                    </div>
                    <div className="text-sm">
                      For more information, see the lecture on "Stats".
                    </div>
                  </div>
                }
                link="/academy/stats"
              />
            </div>

            <ArrayField
              title="How to change after Threads"
              items={localStat.adjustmentsAfterThreads}
              onChange={(items: string[]) =>
                updateStatField("adjustmentsAfterThreads", items)
              }
              placeholder="e.g., Mana regenerates by 10% after each thread"
              emptyPlaceholder="Click + to add thread adjustments"
              readOnly={readOnly}
              extraHeaderContent={
                <AcademyContextButton
                  mode="icon"
                  content={
                    <div>
                      <div className="font-semibold mb-2">
                        How to change after Threads
                      </div>
                      <div className="text-sm mb-2">
                        A Thread is a set of 2-4 Beats with its own narrative
                        arc. Think of it as a mini-chapter. Define how this stat
                        should change after each Thread. Examples:
                      </div>
                      <ul className="list-disc ml-5 text-sm text-gray-700 space-y-1 mb-2">
                        <li>
                          <strong>Regeneration:</strong> After each Thread,
                          increase Mana by 10%.
                        </li>
                        <li>
                          <strong>Dedicated Threads:</strong> A new special
                          power can only be gained via a dedicated Thread with a
                          favorable outcome.
                        </li>
                        <li>
                          <strong>Ripple effects:</strong> Increase reputation
                          by one level after a favorable social Thread in
                          public.
                        </li>
                      </ul>
                      <div className="text-sm">
                        For more information, see the lecture on "Narrative
                        Structure".
                      </div>
                    </div>
                  }
                  link="/academy/switches-threads"
                />
              }
            />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {readOnly && (
            <button
              onClick={handleClose}
              className="text-secondary hover:text-secondary-700"
              aria-label={`Collapse ${stat.name}`}
              title="Collapse details"
            >
              <Icons.ChevronUp className="h-5 w-5" />
            </button>
          )}
          {!readOnly && (
            <button
              onClick={() => {
                console.log(
                  `Delete button clicked for ${localStat.name} (type=${type})`
                );
                handleRemoveStat();
              }}
              className="text-tertiary hover:text-tertiary-700"
              aria-label="Remove stat"
            >
              <Icons.Trash className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <PrimaryButton
          onClick={handleClose}
          variant="outline"
          leftBorder={false}
        >
          Close
        </PrimaryButton>
        {!readOnly && (
          <PrimaryButton
            onClick={handleSave}
            disabled={!localStat.name}
            variant="outline"
          >
            Save
          </PrimaryButton>
        )}
      </div>

      {/* Confirmation Dialog for Player Stat Deletion */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => {
          console.log("Closing delete confirmation dialog");
          setShowDeleteConfirm(false);
        }}
        onConfirm={() => {
          console.log("Confirmed deletion");
          performRemoveStat();
          setShowDeleteConfirm(false);
        }}
        title={`Delete ${localStat.name}`}
        message={`This will remove the stat ${localStat.name} from all character backgrounds. This cannot be undone. Do you want to continue?`}
        confirmText="Delete"
        cancelText="Cancel"
      />

      {/* Confirmation Dialog for Part of Backgrounds Change */}
      <ConfirmDialog
        isOpen={showPartOfBackgroundsConfirm}
        onClose={handleCancelPartOfBackgroundsChange}
        onConfirm={handleConfirmPartOfBackgroundsChange}
        title={
          pendingPartOfBackgroundsValue
            ? `Add to Backgrounds`
            : `Remove from Backgrounds`
        }
        message={
          pendingPartOfBackgroundsValue
            ? `Adding "${localStat.name}" to character backgrounds will:
            
• Add this stat to ALL character backgrounds
• Use preserved values if available, otherwise default values
• Allow different starting values per background
• This stat will no longer use a universal initial value

This change can be reversed later.`
            : `Removing "${localStat.name}" from character backgrounds will:
            
• Remove this stat from ALL character backgrounds  
• Switch to using a universal initial value for all players
• Preserve your current initial value if set
• Any background-specific values will be lost permanently

⚠️ Background-specific values cannot be recovered once removed.`
        }
        confirmText={
          pendingPartOfBackgroundsValue
            ? "Add to Backgrounds"
            : "Remove from Backgrounds"
        }
        cancelText="Cancel"
      />
    </div>
  );
};
