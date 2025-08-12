import React, { useMemo, useState } from "react";
import { PlayerCount, DifficultyLevel } from "core/types";
import {
  Input,
  TextArea,
  InfoIcon,
  Select,
  Checkbox,
  // Tooltip, // No longer directly used here for sliders
} from "components/ui";
import { ArrayField, TagSelector, ExpandableItem } from "components";
import { TAG_CATEGORIES } from "client/resources/templates/tagCategories";
import {
  DEFAULT_DIFFICULTY_LEVELS,
  getDifficultyDescription,
  // getDefaultDifficultyLevel, // Not needed after refactor
} from "core/utils/difficultyUtils.ts";
// import { DEFAULT_SELECTED_DIFFICULTY_MODIFIER } from "core/config.js"; // Not needed after refactor

interface BasicInfoTabProps {
  title: string;
  setTitle: (title: string) => void;
  teaser: string;
  setTeaser: (teaser: string) => void;
  playerCountMin: PlayerCount;
  playerCountMax: PlayerCount;
  setPlayerCountMin: (count: PlayerCount) => void;
  setPlayerCountMax: (count: PlayerCount) => void;
  handleGameModeChange: (value: number) => void;
  maxTurnsMin: number;
  maxTurnsMax: number;
  setMaxTurnsMin: (turns: number) => void;
  setMaxTurnsMax: (turns: number) => void;
  tags: string[];
  handleTagsChange?: (tags: string[]) => void;
  showOnWelcomeScreen: boolean;
  setShowOnWelcomeScreen?: (show: boolean) => void;
  difficultyLevels: DifficultyLevel[]; // This is the array of currently selected/configured levels for the template
  handleDifficultyLevelsChange: (levels: DifficultyLevel[]) => void;
  // Helper functions
  getMinPlayerOptions: () => number[];
  getMaxPlayerOptions: () => number[];
  getMinTurnsOptions: () => number[];
  getMaxTurnsOptions: () => number[];
  gameModeOptions: Array<{ value: number; label: string }>;
  getGameModeValue: () => number;
}

export const BasicInfoTab: React.FC<BasicInfoTabProps> = ({
  title,
  setTitle,
  teaser,
  setTeaser,
  playerCountMin,
  playerCountMax,
  setPlayerCountMin,
  setPlayerCountMax,
  handleGameModeChange,
  maxTurnsMin,
  maxTurnsMax,
  setMaxTurnsMin,
  setMaxTurnsMax,
  tags,
  handleTagsChange,
  showOnWelcomeScreen,
  setShowOnWelcomeScreen,
  difficultyLevels, // Currently selected levels for this template
  handleDifficultyLevelsChange,
  // Helper functions
  getMinPlayerOptions,
  getMaxPlayerOptions,
  getMinTurnsOptions,
  getMaxTurnsOptions,
  gameModeOptions,
  getGameModeValue,
}) => {
  // Debugging TAG_CATEGORIES
  console.log("TAG_CATEGORIES:", TAG_CATEGORIES);

  const allPredefinedTags = useMemo(() => {
    return TAG_CATEGORIES.flatMap((category) => category.tags);
  }, []);

  // Note: tag toggling is handled inline within the ExpandableItem renderEditForm

  // Difficulty changes handled within the ExpandableItem renderEditForm

  // Local editing state for ExpandableItem sections
  const [editingBoxes, setEditingBoxes] = useState<Set<string>>(new Set());

  // Data models for ExpandableItem sections documented via inline generics

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <span className="font-semibold w-24">Title</span>
        <Input
          id="story-title"
          name="story-title"
          className="flex-1"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Story Title"
        />
      </div>

      <div className="flex items-start gap-2">
        <span className="font-semibold w-24 pt-2">Teaser</span>
        <TextArea
          id="story-teaser"
          name="story-teaser"
          className="flex-1"
          value={teaser}
          onChange={(e) => setTeaser(e.target.value)}
          placeholder="A short teaser to attract players to your story"
          autoHeight
        />
      </div>

      {/* Players and Game Mode section */}
      <div className="flex items-center gap-4 mb-2">
        <h3 className="font-semibold whitespace-nowrap">Players</h3>
        <InfoIcon
          tooltipText="Minimum and maximum number of players allowed"
          position="right"
          className="mr-2 mt-1 -ml-1"
        />
        <div className="flex flex-1 flex-wrap gap-4">
          <div className="flex items-center min-w-[150px]">
            <label className="text-sm text-gray-600 whitespace-nowrap mr-2">
              Min:
            </label>
            <Select
              id="player-count-min"
              name="player-count-min"
              value={
                playerCountMin !== undefined ? playerCountMin.toString() : "1"
              }
              onChange={(e) =>
                setPlayerCountMin(Number(e.target.value) as PlayerCount)
              }
            >
              {getMinPlayerOptions().map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-center min-w-[150px]">
            <label className="text-sm text-gray-600 whitespace-nowrap mr-2">
              Max:
            </label>
            <Select
              id="player-count-max"
              name="player-count-max"
              value={
                playerCountMax !== undefined ? playerCountMax.toString() : "1"
              }
              onChange={(e) =>
                setPlayerCountMax(Number(e.target.value) as PlayerCount)
              }
            >
              {getMaxPlayerOptions().map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-center min-w-[180px]">
            <label className="text-sm text-gray-600 whitespace-nowrap mr-2">
              Mode:
            </label>
            <InfoIcon
              tooltipText={
                "Cooperative: work together toward a shared outcome.\nMixed: cooperate overall but with individual edges.\nCompetitive: compete to win against others."
              }
              position="right"
              className="mr-1"
            />
            <div className={playerCountMax === 1 ? "opacity-50" : ""}>
              <Select
                id="game-mode"
                name="game-mode"
                value={
                  getGameModeValue() !== undefined
                    ? getGameModeValue().toString()
                    : "0"
                }
                onChange={(e) => handleGameModeChange(Number(e.target.value))}
                disabled={playerCountMax === 1}
              >
                {gameModeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Story Length section */}
      <div className="flex items-center gap-4 mb-2">
        <h3 className="font-semibold whitespace-nowrap">Length</h3>
        <InfoIcon
          tooltipText="Number of decisions players will make in the game"
          position="right"
          className="mr-2 mt-1 -ml-1"
        />
        <div className="flex flex-1 flex-wrap gap-4">
          <div className="flex items-center min-w-[150px]">
            <label className="text-sm text-gray-600 whitespace-nowrap mr-2">
              Min:
            </label>
            <Select
              id="story-length-min"
              name="story-length-min"
              value={maxTurnsMin !== undefined ? maxTurnsMin.toString() : "5"}
              onChange={(e) => setMaxTurnsMin(Number(e.target.value))}
            >
              {getMinTurnsOptions().map((turns) => (
                <option key={turns} value={turns}>
                  {turns}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-center min-w-[150px]">
            <label className="text-sm text-gray-600 whitespace-nowrap mr-2">
              Max:
            </label>
            <Select
              id="story-length-max"
              name="story-length-max"
              value={maxTurnsMax !== undefined ? maxTurnsMax.toString() : "10"}
              onChange={(e) => setMaxTurnsMax(Number(e.target.value))}
            >
              {getMaxTurnsOptions().map((turns) => (
                <option key={turns} value={turns}>
                  {turns}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {/* Difficulty Levels - Expandable */}
      <ExpandableItem<{ levels: DifficultyLevel[] }>
        id="difficulty-levels"
        title={
          <span className="font-semibold">Available Difficulty Levels</span>
        }
        data={{ levels: difficultyLevels }}
        editingSet={editingBoxes}
        setEditing={setEditingBoxes}
        onDelete={() => {}}
        onSave={(updated) => handleDifficultyLevelsChange(updated.levels)}
        description={(() => {
          if (!difficultyLevels || difficultyLevels.length === 0)
            return undefined;
          const summary = difficultyLevels
            .slice()
            .sort((a, b) => b.modifier - a.modifier)
            .map(
              (l) => `${l.title} (${l.modifier > 0 ? "+" : ""}${l.modifier})`
            )
            .join(" / ");
          return <div className="text-sm text-gray-600 mt-1">{summary}</div>;
        })()}
        renderEditForm={(data, onChange) => {
          const handleLevelCheck = (
            defaultLevel: DifficultyLevel,
            isChecked: boolean
          ) => {
            const current = data.levels;
            let newLevels: DifficultyLevel[];
            if (isChecked) {
              const exists = current.find(
                (l) => l.modifier === defaultLevel.modifier
              );
              newLevels = exists
                ? [...current]
                : [...current, { ...defaultLevel }];
            } else {
              newLevels = current.filter(
                (l) => l.modifier !== defaultLevel.modifier
              );
            }
            newLevels.sort((a, b) => b.modifier - a.modifier);
            onChange({ ...data, levels: newLevels });
          };

          const handleLevelTitle = (modifier: number, newTitle: string) => {
            const current = data.levels;
            const updated = current.map((l) =>
              l.modifier === modifier ? { ...l, title: newTitle } : l
            );
            const exists = updated.some((l) => l.modifier === modifier);
            if (!exists) {
              const def = DEFAULT_DIFFICULTY_LEVELS.find(
                (dl) => dl.modifier === modifier
              );
              if (def) updated.push({ ...def, title: newTitle });
            }
            updated.sort((a, b) => b.modifier - a.modifier);
            onChange({ ...data, levels: updated });
          };

          return (
            <div className="space-y-3 pt-1">
              <h3 className="text-lg font-semibold">
                Available Difficulty Levels
              </h3>
              <ul className="list-disc ml-5 text-sm text-gray-700 space-y-1">
                <li>Default (0) is a good default option.</li>
                <li>
                  Relaxed/Friendly (+10/+20) are useful for kids' and cozy slice
                  of life stories where things tend to work out for the players.
                </li>
                <li>
                  Challenging/Struggle (-10/-20) are useful for scenarios where
                  things are supposed to go wrong for the players.
                </li>
              </ul>
              <div className="space-y-4">
                {DEFAULT_DIFFICULTY_LEVELS.map((defaultLevel) => {
                  const active = (data.levels || []).find(
                    (tl) => tl.modifier === defaultLevel.modifier
                  );
                  const isChecked = !!active;
                  const currentTitle = active
                    ? active.title
                    : defaultLevel.title;
                  return (
                    <div
                      key={defaultLevel.modifier}
                      className="p-3 bg-primary-50 rounded-md border border-primary-100"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <Checkbox
                            id={`difficulty-check-${defaultLevel.modifier}`}
                            checked={isChecked}
                            onChange={(e) =>
                              handleLevelCheck(defaultLevel, e.target.checked)
                            }
                          />
                          <label
                            htmlFor={`difficulty-check-${defaultLevel.modifier}`}
                            className="ml-3 text-sm font-medium text-primary-700 cursor-pointer"
                          >
                            Enable: "{defaultLevel.title}" (Modifier:{" "}
                            {defaultLevel.modifier > 0 ? "+" : ""}
                            {defaultLevel.modifier})
                          </label>
                        </div>
                      </div>
                      <p className="mt-1 ml-8 text-xs text-primary-500">
                        {getDifficultyDescription(defaultLevel.modifier)}
                      </p>
                      {isChecked && (
                        <div className="mt-2 pl-8">
                          <label
                            htmlFor={`difficulty-title-${defaultLevel.modifier}`}
                            className="block text-xs font-medium text-primary-600 mb-1"
                          >
                            Custom Title:
                          </label>
                          <Input
                            id={`difficulty-title-${defaultLevel.modifier}`}
                            value={currentTitle}
                            onChange={(e) =>
                              handleLevelTitle(
                                defaultLevel.modifier,
                                e.target.value
                              )
                            }
                            placeholder={defaultLevel.title}
                            className="text-sm"
                          />
                        </div>
                      )}
                      {!isChecked && (
                        <p className="mt-1 pl-8 text-xs text-primary-400 italic">
                          This level is currently disabled for this World. Check
                          to enable and customize.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              {(data.levels || []).length === 0 && (
                <p className="text-sm text-yellow-600 bg-yellow-50 border border-yellow-200 p-3 rounded-md">
                  Warning: No difficulty levels are selected. At least one
                  difficulty level should be enabled.
                </p>
              )}
            </div>
          );
        }}
      />

      {/* Tags - Expandable */}
      <ExpandableItem<{ tags: string[] }>
        id="tags"
        title={<span className="font-semibold">Tags</span>}
        data={{ tags }}
        editingSet={editingBoxes}
        setEditing={setEditingBoxes}
        onDelete={() => {}}
        onSave={(updated) => {
          if (handleTagsChange) handleTagsChange(updated.tags);
        }}
        description={(() => {
          if (!tags || tags.length === 0) return undefined;
          return (
            <div className="text-sm text-gray-600 mt-1">{tags.join(", ")}</div>
          );
        })()}
        renderEditForm={(data, onChange) => (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Tags</h3>
            <ul className="list-disc ml-5 text-sm text-gray-700 space-y-1">
              <li>
                Tags help readers find your World in the official library (if
                published).
              </li>
              <li>
                Tags give players a quick sense of what kind of World this is.
              </li>
              <li>Tags do not influence the World itself.</li>
            </ul>
            <div className="mb-2">
              <ArrayField
                items={data.tags.filter((t) => !allPredefinedTags.includes(t))}
                onChange={(newCustomTags: string[]) => {
                  const predefinedSelected = data.tags.filter((tag) =>
                    allPredefinedTags.includes(tag)
                  );
                  const combined = [...predefinedSelected, ...newCustomTags];
                  onChange({ tags: combined });
                  if (handleTagsChange) handleTagsChange(combined);
                }}
                placeholder="Add a custom tag"
                emptyPlaceholder="Click + to add custom tags"
                label="Custom Tags"
                showLabel={true}
              />
            </div>
            <div>
              <h4 className="font-semibold text-gray-600 mb-2">
                Suggested Tags
              </h4>
              <TagSelector
                selectedTags={data.tags}
                onTagToggle={(tag) => {
                  const exists = data.tags.includes(tag);
                  const updated = exists
                    ? data.tags.filter((t) => t !== tag)
                    : [...data.tags, tag];
                  onChange({ tags: updated });
                  if (handleTagsChange) handleTagsChange(updated);
                }}
                expandedByDefault={true}
              />
            </div>
          </div>
        )}
      />

      {/* Show on welcome screen */}
      {setShowOnWelcomeScreen && (
        <div className="flex items-center mt-4">
          <Checkbox
            id="welcome-screen"
            checked={showOnWelcomeScreen}
            onChange={(e) => setShowOnWelcomeScreen(e.target.checked)}
          />
          <label htmlFor="welcome-screen" className="ml-2 text-sm">
            Show on welcome screen
          </label>
          <InfoIcon
            tooltipText="When selected, this template will be shown on the welcome screen"
            position="right"
            className="ml-2"
          />
        </div>
      )}
    </div>
  );
};
