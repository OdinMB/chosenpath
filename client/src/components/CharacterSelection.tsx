import { useState, useEffect } from "react";
import { useSession } from "../hooks/useSession";
import {
  CharacterIdentity,
  CharacterBackground,
} from "../../../shared/types/player";
import { PlayerOptionsGeneration } from "../../../shared/types/story";
import { StatDisplay } from "./StatDisplay";

interface CharacterSelectionProps {
  onCharacterSelected: (identityIndex: number, backgroundIndex: number) => void;
}

export function CharacterSelection({
  onCharacterSelected,
}: CharacterSelectionProps) {
  const { storyState } = useSession();
  const [selectedIdentity, setSelectedIdentity] = useState<number | null>(null);
  const [selectedBackground, setSelectedBackground] = useState<number | null>(
    null
  );

  // Select the first identity by default
  useEffect(() => {
    if (
      storyState &&
      storyState.characterSelectionOptions &&
      selectedIdentity === null
    ) {
      const playerSlot = Object.keys(storyState.characterSelectionOptions)[0];
      const options = storyState.characterSelectionOptions[playerSlot];

      if (options && options.possibleCharacterIdentities.length > 0) {
        setSelectedIdentity(0);
      }
    }
  }, [storyState, selectedIdentity]);

  if (!storyState) return null;

  // Get the current player's slot and options
  const playerSlot = Object.keys(storyState.characterSelectionOptions)[0];
  const options: PlayerOptionsGeneration =
    storyState.characterSelectionOptions[playerSlot];

  if (!options) return null;

  const handleConfirmSelection = () => {
    if (selectedIdentity !== null && selectedBackground !== null) {
      onCharacterSelected(selectedIdentity, selectedBackground);
    }
  };

  // Helper function to replace pronoun placeholders with actual pronouns
  const replacePronounPlaceholders = (
    text: string,
    identity: CharacterIdentity | null
  ): string => {
    if (!identity) return text;

    // Replace both lowercase and capitalized placeholders
    return text
      .replace(/{name}/g, identity.name)
      .replace(/{Name}/g, identity.name)
      .replace(/{personal}/g, identity.pronouns.personal)
      .replace(
        /{Personal}/g,
        identity.pronouns.personal.charAt(0).toUpperCase() +
          identity.pronouns.personal.slice(1)
      )
      .replace(/{object}/g, identity.pronouns.object)
      .replace(
        /{Object}/g,
        identity.pronouns.object.charAt(0).toUpperCase() +
          identity.pronouns.object.slice(1)
      )
      .replace(/{possessive}/g, identity.pronouns.possessive)
      .replace(
        /{Possessive}/g,
        identity.pronouns.possessive.charAt(0).toUpperCase() +
          identity.pronouns.possessive.slice(1)
      )
      .replace(/{reflexive}/g, identity.pronouns.reflexive)
      .replace(
        /{Reflexive}/g,
        identity.pronouns.reflexive.charAt(0).toUpperCase() +
          identity.pronouns.reflexive.slice(1)
      );
  };

  const renderIdentityCard = (identity: CharacterIdentity, index: number) => (
    <div
      key={`identity-${index}`}
      className={`
        border rounded-lg p-4 cursor-pointer transition-all
        ${
          selectedIdentity === index
            ? "border-indigo-500 bg-indigo-50 shadow-md"
            : "border-gray-200 hover:border-indigo-300 hover:bg-gray-50"
        }
      `}
      onClick={() => setSelectedIdentity(index)}
    >
      <h3 className="font-bold text-lg">{identity.name}</h3>
      <p className="text-gray-600 mb-2">
        {identity.pronouns.personal}/{identity.pronouns.object}
      </p>
      <p className="text-gray-600 text-sm">{identity.appearance}</p>
    </div>
  );

  const renderBackgroundCard = (
    background: CharacterBackground,
    index: number
  ) => {
    const selectedIdentityData =
      selectedIdentity !== null
        ? options.possibleCharacterIdentities[selectedIdentity]
        : null;

    return (
      <div
        key={`background-${index}`}
        className={`
          border rounded-lg p-4 cursor-pointer transition-all flex flex-col h-full
          ${
            selectedBackground === index
              ? "border-indigo-500 bg-indigo-50 shadow-md"
              : "border-gray-200 hover:border-indigo-300 hover:bg-gray-50"
          }
        `}
        onClick={() => setSelectedBackground(index)}
      >
        <div>
          <h3 className="font-bold text-lg mb-2">{background.title}</h3>
          <div className="text-gray-600 text-sm mb-4 min-h-[80px]">
            {replacePronounPlaceholders(
              background.fluffTemplate,
              selectedIdentityData
            )}
          </div>
        </div>

        {/* Display stats */}
        <div className="mt-auto">
          <div className="space-y-1">
            {background.initialPlayerStatValues.map((statValueEntry) => {
              // Find the stat definition in playerStats
              const statDef = storyState.playerStats.find(
                (s) => s.id === statValueEntry.statId
              );

              if (!statDef) return null;

              return (
                <div
                  key={`stat-${statValueEntry.statId}`}
                  className="stat-display-wrapper max-w-xs mx-auto"
                >
                  <StatDisplay
                    name={statDef.name}
                    value={statValueEntry.value}
                    type={statDef.type}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 max-w-4xl mx-auto font-lora">
      <h1 className="text-2xl font-bold text-center mb-2 text-indigo-800">
        {storyState.characterSelectionIntroduction?.title || "Who are you?"}
      </h1>

      {storyState.characterSelectionIntroduction?.text ? (
        <p className="mb-8 text-gray-700">
          {storyState.characterSelectionIntroduction.text}
        </p>
      ) : (
        <div></div>
      )}

      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Identity</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {options.possibleCharacterIdentities.map(renderIdentityCard)}
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Background</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {options.possibleCharacterBackgrounds.map(renderBackgroundCard)}
        </div>
      </div>

      <div className="flex justify-center mt-8">
        <button
          onClick={handleConfirmSelection}
          disabled={selectedIdentity === null || selectedBackground === null}
          className={`
            px-6 py-3 rounded-lg font-medium text-white
            ${
              selectedIdentity !== null && selectedBackground !== null
                ? "bg-indigo-600 hover:bg-indigo-700"
                : "bg-gray-400 cursor-not-allowed"
            }
          `}
        >
          Confirm Selection
        </button>
      </div>
    </div>
  );
}
