import { useState, useEffect } from "react";
import { useSession } from "../hooks/useSession";
import {
  CharacterIdentity,
  CharacterBackground,
} from "../../../shared/types/player";
import { PlayerOptionsGeneration } from "../../../shared/types/story";
import { StatDisplay } from "./StatDisplay";
import { replacePronounPlaceholders } from "../../../shared/utils/playerUtils.js";
import { CharacterCard } from "./CharacterCard";
import { PrimaryButton } from "./ui/PrimaryButton";

interface CharacterSelectionProps {
  onCharacterSelected: (identityIndex: number, backgroundIndex: number) => void;
}

export function CharacterSelection({
  onCharacterSelected,
}: CharacterSelectionProps) {
  const { storyState, isRequestPending, isOperationRunning } = useSession();
  const [selectedIdentity, setSelectedIdentity] = useState<number | null>(null);
  const [selectedBackground, setSelectedBackground] = useState<number | null>(
    null
  );

  // Check if we're waiting for character selection to process
  const isSelectionPending =
    isRequestPending("select_character") ||
    isOperationRunning("select_character");

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

  // Check if the current player has already selected a character
  const currentPlayer = storyState.players[playerSlot];
  const hasSelectedCharacter = currentPlayer?.characterSelected === true;

  if (!options) return null;

  const handleConfirmSelection = () => {
    if (selectedIdentity !== null && selectedBackground !== null) {
      onCharacterSelected(selectedIdentity, selectedBackground);
    }
  };

  // If the player has already selected a character, return null
  // The GameLayout component will handle showing the waiting screen
  if (hasSelectedCharacter) {
    return null;
  }

  const renderIdentityCard = (identity: CharacterIdentity, index: number) => (
    <CharacterCard
      key={`identity-${index}`}
      isSelected={selectedIdentity === index}
      onClick={() => setSelectedIdentity(index)}
    >
      <h3 className="font-bold text-lg text-primary">{identity.name}</h3>
      <p className="text-primary-700 mb-2">
        {identity.pronouns.personal}/{identity.pronouns.object}
      </p>
      <p className="text-primary-600 text-sm">{identity.appearance}</p>
    </CharacterCard>
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
      <CharacterCard
        key={`background-${index}`}
        isSelected={selectedBackground === index}
        onClick={() => setSelectedBackground(index)}
      >
        <div>
          <h3 className="font-bold text-lg mb-2 text-primary">
            {background.title}
          </h3>
          <div className="text-primary-600 text-sm mb-4 min-h-[80px]">
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
      </CharacterCard>
    );
  };

  return (
    <div className="p-6 max-w-4xl mx-auto font-lora">
      <h1 className="text-2xl font-bold text-center mb-2 text-primary">
        {storyState.characterSelectionIntroduction?.title || "Who are you?"}
      </h1>

      {storyState.characterSelectionIntroduction?.text ? (
        <p className="mb-8 text-primary-700">
          {storyState.characterSelectionIntroduction.text}
        </p>
      ) : (
        <div></div>
      )}

      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4 text-primary">Identity</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {options.possibleCharacterIdentities.map(renderIdentityCard)}
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4 text-primary">Background</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {options.possibleCharacterBackgrounds.map(renderBackgroundCard)}
        </div>
      </div>

      <div className="flex flex-col items-center mt-8">
        <PrimaryButton
          onClick={handleConfirmSelection}
          disabled={
            selectedIdentity === null ||
            selectedBackground === null ||
            isSelectionPending
          }
          fullWidth
          className="max-w-md"
          size="lg"
        >
          {isSelectionPending
            ? "Processing Character Selection..."
            : "Confirm Selection"}
        </PrimaryButton>
      </div>
    </div>
  );
}
