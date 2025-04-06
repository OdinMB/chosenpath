import { useState, useEffect } from "react";
import { PrimaryButton } from "../../components/ui/PrimaryButton";
import { Icons } from "../../components/ui/Icons";
import { config } from "../../config";
import { Logger } from "../../utils/logger";
import {
  GameMode,
  GameModes,
  StorySetup,
  Guidelines,
} from "shared/types/story";
import { StoryElement } from "shared/types/storyElement";
import { Outcome } from "shared/types/outcome";
import {
  PlayerCount,
  PLAYER_SLOTS,
  CharacterSelectionIntroduction,
} from "shared/types/player";
import { StatValueEntry, Stat } from "shared/types/stat";
import {
  MIN_PLAYERS,
  MAX_PLAYERS,
  MIN_TURNS,
  MAX_TURNS,
  DEFAULT_TURNS,
} from "shared/config";
import { StoryTemplate } from "shared/types/storyTemplate";

// Custom type for the setup with maxTurns
interface SetupWithMaxTurns extends StorySetup<PlayerCount> {
  maxTurns?: number;
}

type PlayerOptionsGeneration = {
  outcomes: Outcome[];
  possibleCharacterIdentities: Array<{
    name: string;
    pronouns: {
      personal: string;
      object: string;
      possessive: string;
      reflexive: string;
    };
    appearance: string;
  }>;
  possibleCharacterBackgrounds: Array<{
    title: string;
    fluffTemplate: string;
    initialPlayerStatValues: StatValueEntry[];
  }>;
};

type StoryTemplateFormProps = {
  token: string;
  onCancel: () => void;
  onSaved: (updatedTemplate?: StoryTemplate) => void;
  existingTemplate?: StoryTemplate;
};

export const StoryTemplateForm = ({
  token,
  onCancel,
  onSaved,
  existingTemplate,
}: StoryTemplateFormProps) => {
  const [title, setTitle] = useState(existingTemplate?.title || "");
  const [playerCount, setPlayerCount] = useState<PlayerCount>(
    existingTemplate?.playerCount || (1 as PlayerCount)
  );
  const [gameMode, setGameMode] = useState<GameMode>(
    existingTemplate?.gameMode || GameModes.SinglePlayer
  );
  const [maxTurns, setMaxTurns] = useState(
    existingTemplate?.setup
      ? (existingTemplate.setup as unknown as SetupWithMaxTurns).maxTurns ??
          DEFAULT_TURNS
      : DEFAULT_TURNS
  );

  // Guidelines
  const [world, setWorld] = useState(
    existingTemplate?.setup?.guidelines?.world || ""
  );
  const [rules, setRules] = useState<string[]>(
    existingTemplate?.setup?.guidelines?.rules || [""]
  );
  const [tone, setTone] = useState<string[]>(
    existingTemplate?.setup?.guidelines?.tone || [""]
  );
  const [conflicts, setConflicts] = useState<string[]>(
    existingTemplate?.setup?.guidelines?.conflicts || [""]
  );
  const [decisions, setDecisions] = useState<string[]>(
    existingTemplate?.setup?.guidelines?.decisions || [""]
  );

  // Story Elements
  const [storyElements] = useState<StoryElement[]>(
    existingTemplate?.setup?.storyElements || []
  );

  // Stats
  const [statGroups] = useState<string[]>(
    existingTemplate?.setup?.statGroups || ["Character", "Resources", "World"]
  );
  const [sharedStats] = useState<Stat[]>(
    existingTemplate?.setup?.sharedStats || []
  );
  const [initialSharedStatValues] = useState<StatValueEntry[]>(
    existingTemplate?.setup?.initialSharedStatValues || []
  );
  const [playerStats] = useState<Stat[]>(
    existingTemplate?.setup?.playerStats || []
  );

  // Shared outcomes
  const [sharedOutcomes] = useState<Outcome[]>(
    existingTemplate?.setup?.sharedOutcomes || []
  );

  const [characterSelectionIntroduction] =
    useState<CharacterSelectionIntroduction>(
      existingTemplate?.setup?.characterSelectionIntroduction || {
        title: "",
        text: "",
      }
    );

  // Player options
  const [playerOptions, setPlayerOptions] = useState<
    Record<string, PlayerOptionsGeneration>
  >(
    existingTemplate?.setup
      ? Object.fromEntries(
          PLAYER_SLOTS.slice(0, playerCount).map((slot) => {
            const slotKey = `player${parseInt(slot.replace("player", ""))}`;
            return [
              slot,
              slotKey in existingTemplate.setup
                ? (existingTemplate.setup[
                    slotKey as keyof typeof existingTemplate.setup
                  ] as unknown as PlayerOptionsGeneration)
                : {
                    outcomes: [],
                    possibleCharacterIdentities: [],
                    possibleCharacterBackgrounds: [],
                  },
            ];
          })
        )
      : Object.fromEntries(
          PLAYER_SLOTS.slice(0, playerCount).map((slot) => [
            slot,
            {
              outcomes: [],
              possibleCharacterIdentities: [],
              possibleCharacterBackgrounds: [],
            },
          ])
        )
  );

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState("basic");

  // Handle game mode slider changes
  const handleGameModeChange = (value: number) => {
    if (playerCount === 1) {
      setGameMode(GameModes.SinglePlayer);
      return;
    }

    const values = [
      GameModes.Cooperative,
      GameModes.CooperativeCompetitive,
      GameModes.Competitive,
    ] as const;
    setGameMode(values[value]);
  };

  // Update playerOptions when playerCount changes
  useEffect(() => {
    // Only care about player count changes
    const newPlayerOptions: Record<string, PlayerOptionsGeneration> = {};

    PLAYER_SLOTS.slice(0, playerCount).forEach((slot) => {
      // Keep existing data if available
      if (playerOptions[slot]) {
        newPlayerOptions[slot] = playerOptions[slot];
      } else {
        // Initialize with empty data
        newPlayerOptions[slot] = {
          outcomes: [],
          possibleCharacterIdentities: [],
          possibleCharacterBackgrounds: [],
        };
      }
    });

    // Only update if the keys are different to avoid loops
    const currentKeys = Object.keys(playerOptions).sort().join(",");
    const newKeys = Object.keys(newPlayerOptions).sort().join(",");

    if (currentKeys !== newKeys) {
      setPlayerOptions(newPlayerOptions);
    }
  }, [playerCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // Helper to update array of string fields
  const handleArrayFieldChange = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    index: number,
    value: string
  ) => {
    setter((prev) => {
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });
  };

  // Helper to add new item to array of strings
  const handleAddArrayItem = (
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    setter((prev) => [...prev, ""]);
  };

  // Helper to remove item from array of strings
  const handleRemoveArrayItem = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    index: number
  ) => {
    setter((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Construct setup object
      const guidelines: Guidelines = {
        world,
        rules: rules.filter((r) => r.trim() !== ""),
        tone: tone.filter((t) => t.trim() !== ""),
        conflicts: conflicts.filter((c) => c.trim() !== ""),
        decisions: decisions.filter((d) => d.trim() !== ""),
      };

      // Generate player-specific data
      const playerData = Object.fromEntries(
        Object.entries(playerOptions)
          .slice(0, playerCount)
          .map((_ignored, index) => {
            const slot = `player${index + 1}`;
            const data = playerOptions[`player${index + 1}`];
            return [slot, data];
          })
      );

      const setup: Omit<SetupWithMaxTurns, keyof typeof playerData> = {
        title,
        guidelines,
        storyElements,
        sharedOutcomes,
        statGroups,
        sharedStats,
        initialSharedStatValues,
        playerStats,
        characterSelectionIntroduction,
        maxTurns,
        ...playerData,
      };

      const requestBody = {
        title,
        playerCount,
        gameMode,
        setup,
      };

      const url = existingTemplate
        ? `${config.apiUrl}/admin/library/templates/${existingTemplate.id}`
        : `${config.apiUrl}/admin/library/templates`;

      const method = existingTemplate ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to ${existingTemplate ? "update" : "create"} template`
        );
      }

      Logger.Admin.log(
        `Successfully ${existingTemplate ? "updated" : "created"} template`
      );

      if (existingTemplate) {
        // Return the updated template to stay in edit view
        onSaved({
          id: existingTemplate.id,
          title,
          playerCount,
          gameMode,
          setup: setup as unknown as StorySetup<PlayerCount>,
          createdAt: existingTemplate.createdAt,
          updatedAt: new Date().toISOString(),
        });
      } else {
        // New template was created
        onSaved();
      }
    } catch (error) {
      Logger.Admin.error(
        `Error ${existingTemplate ? "updating" : "creating"} template`,
        error
      );
      setError(
        `Failed to ${
          existingTemplate ? "update" : "create"
        } template. Please try again.`
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Placeholder for the actual form
  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-secondary">
          {existingTemplate
            ? existingTemplate.title
              ? `Edit: ${existingTemplate.title}`
              : "Edit Story Template"
            : "Create New Story Template"}
        </h2>
      </div>

      {error && (
        <div className="mb-4 flex items-center rounded-md bg-tertiary-100 p-4 text-sm text-tertiary">
          <Icons.Error className="mr-2 h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex mb-6 border-b border-gray-200">
        <button
          className={`px-4 py-2 font-medium ${
            currentTab === "basic"
              ? "text-secondary border-b-2 border-secondary"
              : "text-gray-500 hover:text-gray-700"
          }`}
          onClick={() => setCurrentTab("basic")}
        >
          Basic Info
        </button>
        <button
          className={`px-4 py-2 font-medium ${
            currentTab === "guidelines"
              ? "text-secondary border-b-2 border-secondary"
              : "text-gray-500 hover:text-gray-700"
          }`}
          onClick={() => setCurrentTab("guidelines")}
        >
          Guidelines
        </button>
        <button
          className={`px-4 py-2 font-medium ${
            currentTab === "stats"
              ? "text-secondary border-b-2 border-secondary"
              : "text-gray-500 hover:text-gray-700"
          }`}
          onClick={() => setCurrentTab("stats")}
        >
          Stats
        </button>
        <button
          className={`px-4 py-2 font-medium ${
            currentTab === "players"
              ? "text-secondary border-b-2 border-secondary"
              : "text-gray-500 hover:text-gray-700"
          }`}
          onClick={() => setCurrentTab("players")}
        >
          Players
        </button>
        <button
          className={`px-4 py-2 font-medium ${
            currentTab === "elements"
              ? "text-secondary border-b-2 border-secondary"
              : "text-gray-500 hover:text-gray-700"
          }`}
          onClick={() => setCurrentTab("elements")}
        >
          Story Elements
        </button>
      </div>

      {/* Basic Info Tab */}
      {currentTab === "basic" && (
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-primary mb-1">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md"
              placeholder="Story Title"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-primary mb-1">
              Number of Players: {playerCount}
            </label>
            <input
              type="range"
              min={MIN_PLAYERS}
              max={MAX_PLAYERS}
              value={playerCount}
              onChange={(e) =>
                setPlayerCount(Number(e.target.value) as PlayerCount)
              }
              className="w-full h-2 bg-secondary-100 rounded-lg appearance-none cursor-pointer touch-pan-x accent-secondary"
            />
            <div className="flex justify-between text-xs text-primary-600">
              <span>{MIN_PLAYERS} Player</span>
              <span>{MAX_PLAYERS} Players</span>
            </div>
          </div>

          <div className={`${playerCount === 1 ? "opacity-50" : ""}`}>
            <label className="block text-sm font-medium text-primary mb-1">
              Game Mode
            </label>
            <input
              type="range"
              min={0}
              max={2}
              value={
                playerCount === 1
                  ? 0
                  : gameMode === GameModes.Cooperative
                  ? 0
                  : gameMode === GameModes.CooperativeCompetitive
                  ? 1
                  : 2
              }
              onChange={(e) => handleGameModeChange(Number(e.target.value))}
              className="w-full h-2 bg-secondary-100 rounded-lg appearance-none cursor-pointer touch-pan-x accent-secondary"
              disabled={playerCount === 1}
            />
            <div className="flex justify-between text-xs text-primary-600">
              <span>Shared Goals</span>
              <span>Mixed Goals</span>
              <span>Competing Goals</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-primary mb-1">
              Story Length: {maxTurns} decisions
            </label>
            <input
              type="range"
              min={MIN_TURNS}
              max={MAX_TURNS}
              step={5}
              value={maxTurns}
              onChange={(e) => setMaxTurns(Number(e.target.value))}
              className="w-full h-2 bg-secondary-100 rounded-lg appearance-none cursor-pointer touch-pan-x accent-secondary"
            />
            <div className="flex justify-between text-xs text-primary-600">
              <span>{MIN_TURNS} decisions</span>
              <span>{MAX_TURNS} decisions</span>
            </div>
          </div>
        </div>
      )}

      {/* More tab contents would go here */}
      {currentTab === "guidelines" && (
        <div className="space-y-6">
          <p className="text-sm text-gray-600 mb-4">
            Define the world, rules, tone, conflicts, and decisions that will
            shape the story.
          </p>

          <div>
            <label className="block text-sm font-medium text-primary mb-1">
              World (three sentences about the essence of the world)
            </label>
            <textarea
              value={world}
              onChange={(e) => setWorld(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md"
              rows={3}
              placeholder="Describe the essence of the story world in three sentences"
            />
          </div>

          {/* Rules section */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-sm font-medium text-primary">
                Rules (fundamental rules governing the story world)
              </label>
              <button
                type="button"
                onClick={() => handleAddArrayItem(setRules)}
                className="text-secondary hover:text-secondary-700"
              >
                <Icons.Plus className="h-4 w-4" />
              </button>
            </div>
            {rules.map((rule, index) => (
              <div key={index} className="flex gap-2 mb-2">
                <input
                  value={rule}
                  onChange={(e) =>
                    handleArrayFieldChange(setRules, index, e.target.value)
                  }
                  className="flex-grow p-2 border border-gray-300 rounded-md"
                  placeholder="Add a rule"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveArrayItem(setRules, index)}
                  className="text-tertiary hover:text-tertiary-700"
                >
                  <Icons.Trash className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Tone section */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-sm font-medium text-primary">
                Tone (emotional and narrative tone guidelines)
              </label>
              <button
                type="button"
                onClick={() => handleAddArrayItem(setTone)}
                className="text-secondary hover:text-secondary-700"
              >
                <Icons.Plus className="h-4 w-4" />
              </button>
            </div>
            {tone.map((toneItem, index) => (
              <div key={index} className="flex gap-2 mb-2">
                <input
                  value={toneItem}
                  onChange={(e) =>
                    handleArrayFieldChange(setTone, index, e.target.value)
                  }
                  className="flex-grow p-2 border border-gray-300 rounded-md"
                  placeholder="Add a tone guideline"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveArrayItem(setTone, index)}
                  className="text-tertiary hover:text-tertiary-700"
                >
                  <Icons.Trash className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Conflicts section */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-sm font-medium text-primary">
                Conflicts (major conflicts driving the narrative)
              </label>
              <button
                type="button"
                onClick={() => handleAddArrayItem(setConflicts)}
                className="text-secondary hover:text-secondary-700"
              >
                <Icons.Plus className="h-4 w-4" />
              </button>
            </div>
            {conflicts.map((conflict, index) => (
              <div key={index} className="flex gap-2 mb-2">
                <input
                  value={conflict}
                  onChange={(e) =>
                    handleArrayFieldChange(setConflicts, index, e.target.value)
                  }
                  className="flex-grow p-2 border border-gray-300 rounded-md"
                  placeholder="Add a conflict"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveArrayItem(setConflicts, index)}
                  className="text-tertiary hover:text-tertiary-700"
                >
                  <Icons.Trash className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Decisions section */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-sm font-medium text-primary">
                Decisions (types of decisions players will make)
              </label>
              <button
                type="button"
                onClick={() => handleAddArrayItem(setDecisions)}
                className="text-secondary hover:text-secondary-700"
              >
                <Icons.Plus className="h-4 w-4" />
              </button>
            </div>
            {decisions.map((decision, index) => (
              <div key={index} className="flex gap-2 mb-2">
                <input
                  value={decision}
                  onChange={(e) =>
                    handleArrayFieldChange(setDecisions, index, e.target.value)
                  }
                  className="flex-grow p-2 border border-gray-300 rounded-md"
                  placeholder="Add a decision type"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveArrayItem(setDecisions, index)}
                  className="text-tertiary hover:text-tertiary-700"
                >
                  <Icons.Trash className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Placeholder for other tabs - we'll implement these in future iterations */}
      {currentTab === "stats" && (
        <div className="py-6 text-center text-gray-500">
          Stats configuration will be implemented in the next phase.
        </div>
      )}

      {currentTab === "players" && (
        <div className="py-6 text-center text-gray-500">
          Player options configuration will be implemented in the next phase.
        </div>
      )}

      {currentTab === "elements" && (
        <div className="py-6 text-center text-gray-500">
          Story elements configuration will be implemented in the next phase.
        </div>
      )}

      <div className="flex justify-end mt-6 gap-3">
        <PrimaryButton onClick={onCancel} variant="outline" size="md">
          Cancel
        </PrimaryButton>
        <PrimaryButton
          onClick={handleSave}
          size="md"
          disabled={isLoading || !title.trim()}
          isLoading={isLoading}
        >
          {existingTemplate ? "Update Template" : "Save Template"}
        </PrimaryButton>
      </div>
    </div>
  );
};
