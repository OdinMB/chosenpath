import { useState } from "react";
import {
  PlayerOptionsGeneration,
  PlayerSlot,
  CharacterIdentity,
  CharacterBackground,
  Stat,
} from "core/types";

interface PlayerOutcome {
  id: string;
  question: string;
  resonance: string;
  possibleResolutions:
    | { favorable: string; unfavorable: string; mixed: string }
    | { resolution1: string; resolution2: string; resolution3: string }
    | { mixed: string; sideAWins: string; sideBWins: string };
  intendedNumberOfMilestones: number;
  milestones: string[];
}

interface UsePlayerEditorResult {
  // Global editing states
  editingPlayers: Set<string>;
  editingIdentities: Set<string>;
  editingBackgrounds: Set<string>;
  editingOutcomes: Set<string>;
  setEditingPlayers: (callback: (prev: Set<string>) => Set<string>) => void;
  setEditingIdentities: (callback: (prev: Set<string>) => Set<string>) => void;
  setEditingBackgrounds: (callback: (prev: Set<string>) => Set<string>) => void;
  setEditingOutcomes: (callback: (prev: Set<string>) => Set<string>) => void;

  // Global helpers
  createEmptyIdentity: () => CharacterIdentity;
  createEmptyBackground: () => CharacterBackground;

  // Player-specific methods
  handleAddPlayerOutcome: (playerSlot: PlayerSlot) => void;
  handleCopyOutcome: (
    playerSlot: PlayerSlot,
    sourcePlayerSlot: PlayerSlot,
    outcomeIndex: number
  ) => void;
  handleUpdateIdentity: (
    playerSlot: PlayerSlot,
    index: number,
    updatedIdentity: CharacterIdentity
  ) => void;
  handleDeleteIdentity: (playerSlot: PlayerSlot, index: number) => void;
  handleAddIdentity: (playerSlot: PlayerSlot) => void;
  handleUpdateBackground: (
    playerSlot: PlayerSlot,
    index: number,
    updatedBackground: CharacterBackground
  ) => void;
  handleDeleteBackground: (playerSlot: PlayerSlot, index: number) => void;
  handleAddBackground: (playerSlot: PlayerSlot) => void;
  handleUpdateOutcome: (
    playerSlot: PlayerSlot,
    index: number,
    updatedOutcome: PlayerOutcome
  ) => void;
  handleDeleteOutcome: (playerSlot: PlayerSlot, index: number) => void;
  handleSave: (playerSlot: PlayerSlot) => void;
}

export function usePlayerEditor(
  allPlayerOptions: Record<PlayerSlot, PlayerOptionsGeneration>,
  onChange: (updates: Record<PlayerSlot, PlayerOptionsGeneration>) => void,
  playerStats: Stat[],
  readOnly: boolean = false
): UsePlayerEditorResult {
  // Track which players are being edited
  const [editingPlayers, setEditingPlayers] = useState<Set<string>>(new Set());
  // Track which identities are being edited
  const [editingIdentities, setEditingIdentities] = useState<Set<string>>(
    new Set()
  );
  // Track which backgrounds are being edited
  const [editingBackgrounds, setEditingBackgrounds] = useState<Set<string>>(
    new Set()
  );
  // Track which outcomes are being edited
  const [editingOutcomes, setEditingOutcomes] = useState<Set<string>>(
    new Set()
  );

  // Global update handler for player data
  const handleUpdatePlayer = (
    playerSlot: PlayerSlot,
    updates: Partial<PlayerOptionsGeneration>
  ) => {
    if (readOnly) return;

    // Create the updated player options
    const updatedPlayerOptions = {
      ...allPlayerOptions,
      [playerSlot]: {
        ...allPlayerOptions[playerSlot],
        ...updates,
      },
    };

    // Immediately propagate the change to parent component
    onChange(updatedPlayerOptions);
  };

  // Create an empty identity
  const createEmptyIdentity = (): CharacterIdentity => ({
    name: "",
    appearance: "",
    pronouns: {
      personal: "",
      object: "",
      possessive: "",
      reflexive: "",
    },
  });

  // Create an empty background with all player stats
  const createEmptyBackground = (): CharacterBackground => {
    const initialPlayerStatValues = playerStats
      .filter((stat) => stat.partOfPlayerBackgrounds !== false)
      .map((stat) => {
        let initialValue: number | string | string[];

        switch (stat.type) {
          case "string":
            initialValue = "";
            break;
          case "string[]":
            initialValue = [];
            break;
          case "number":
          case "percentage":
          case "opposites":
          default:
            initialValue = 50;
        }

        return {
          statId: stat.id,
          value: initialValue,
        };
      });

    return {
      title: "",
      fluffTemplate: "",
      initialPlayerStatValues,
    };
  };

  // Add a new outcome to a player
  const handleAddPlayerOutcome = (playerSlot: PlayerSlot) => {
    if (readOnly) return;

    const outcomeId = crypto.randomUUID();
    const newOutcome: PlayerOutcome = {
      id: outcomeId,
      question: "",
      resonance: "",
      possibleResolutions: {
        favorable: "",
        unfavorable: "",
        mixed: "",
      },
      intendedNumberOfMilestones: 3,
      milestones: [],
    };

    // Start in edit mode for the new outcome
    const outcomeStateKey = `${playerSlot}_outcome_${outcomeId}`;
    setEditingOutcomes((prev) => new Set(prev).add(outcomeStateKey));

    // Get current outcomes for this player
    const currentOutcomes = allPlayerOptions[playerSlot]?.outcomes || [];
    const updatedOutcomes = [...currentOutcomes, newOutcome];

    // Save changes immediately
    handleUpdatePlayer(playerSlot, {
      outcomes: updatedOutcomes,
    });
  };

  // Copy an outcome from one player to another
  const handleCopyOutcome = (
    playerSlot: PlayerSlot,
    sourcePlayerSlot: PlayerSlot,
    outcomeIndex: number
  ) => {
    if (readOnly) return;

    const sourceOutcome =
      allPlayerOptions[sourcePlayerSlot]?.outcomes[outcomeIndex];

    if (sourceOutcome) {
      const copiedOutcome: PlayerOutcome = {
        ...sourceOutcome,
        id: crypto.randomUUID(),
      };

      // Get current outcomes for this player
      const currentOutcomes = allPlayerOptions[playerSlot]?.outcomes || [];
      const updatedOutcomes = [...currentOutcomes, copiedOutcome];

      // Save changes immediately
      handleUpdatePlayer(playerSlot, {
        outcomes: updatedOutcomes,
      });
    }
  };

  // Update a player identity
  const handleUpdateIdentity = (
    playerSlot: PlayerSlot,
    index: number,
    updatedIdentity: CharacterIdentity
  ) => {
    if (readOnly) return;

    const playerData = allPlayerOptions[playerSlot];
    const updated = [...playerData.possibleCharacterIdentities];
    updated[index] = updatedIdentity;

    // Immediately save changes to the parent component
    handleUpdatePlayer(playerSlot, {
      possibleCharacterIdentities: updated,
    });
  };

  // Delete a player identity
  const handleDeleteIdentity = (playerSlot: PlayerSlot, index: number) => {
    if (readOnly) return;

    const playerData = allPlayerOptions[playerSlot];
    const updated = [...playerData.possibleCharacterIdentities];
    updated.splice(index, 1);

    // Immediately save changes to the parent component
    handleUpdatePlayer(playerSlot, {
      possibleCharacterIdentities: updated,
    });
  };

  // Add a new identity to a player
  const handleAddIdentity = (playerSlot: PlayerSlot) => {
    if (readOnly) return;

    const playerData = allPlayerOptions[playerSlot];
    const updated = [
      ...playerData.possibleCharacterIdentities,
      createEmptyIdentity(),
    ];

    // Immediately save changes to the parent component
    handleUpdatePlayer(playerSlot, {
      possibleCharacterIdentities: updated,
    });
  };

  // Update a player background
  const handleUpdateBackground = (
    playerSlot: PlayerSlot,
    index: number,
    updatedBackground: CharacterBackground
  ) => {
    if (readOnly) return;

    const playerData = allPlayerOptions[playerSlot];
    const updated = [...playerData.possibleCharacterBackgrounds];
    updated[index] = updatedBackground;

    // Immediately save changes to the parent component
    handleUpdatePlayer(playerSlot, {
      possibleCharacterBackgrounds: updated,
    });
  };

  // Delete a player background
  const handleDeleteBackground = (playerSlot: PlayerSlot, index: number) => {
    if (readOnly) return;

    const playerData = allPlayerOptions[playerSlot];
    const updated = [...playerData.possibleCharacterBackgrounds];
    updated.splice(index, 1);

    // Immediately save changes to the parent component
    handleUpdatePlayer(playerSlot, {
      possibleCharacterBackgrounds: updated,
    });
  };

  // Add a new background to a player
  const handleAddBackground = (playerSlot: PlayerSlot) => {
    if (readOnly) return;

    const playerData = allPlayerOptions[playerSlot];
    const updated = [
      ...playerData.possibleCharacterBackgrounds,
      createEmptyBackground(),
    ];

    // Immediately save changes to the parent component
    handleUpdatePlayer(playerSlot, {
      possibleCharacterBackgrounds: updated,
    });
  };

  // Update a player outcome
  const handleUpdateOutcome = (
    playerSlot: PlayerSlot,
    index: number,
    updatedOutcome: PlayerOutcome
  ) => {
    if (readOnly) return;

    const playerData = allPlayerOptions[playerSlot];
    const updated = [...playerData.outcomes];
    updated[index] = updatedOutcome;

    // Immediately save changes to the parent component
    handleUpdatePlayer(playerSlot, {
      outcomes: updated,
    });
  };

  // Delete a player outcome
  const handleDeleteOutcome = (playerSlot: PlayerSlot, index: number) => {
    if (readOnly) return;

    const playerData = allPlayerOptions[playerSlot];
    const updated = [...playerData.outcomes];
    updated.splice(index, 1);

    // Immediately save changes to the parent component
    handleUpdatePlayer(playerSlot, {
      outcomes: updated,
    });
  };

  // Finish editing a player
  const handleSave = (playerSlot: PlayerSlot) => {
    if (readOnly) return;

    setEditingPlayers((prev) => {
      const next = new Set(prev);
      next.delete(playerSlot);
      return next;
    });
  };

  return {
    // Global editing states
    editingPlayers,
    editingIdentities,
    editingBackgrounds,
    editingOutcomes,
    setEditingPlayers,
    setEditingIdentities,
    setEditingBackgrounds,
    setEditingOutcomes,

    // Global helpers
    createEmptyIdentity,
    createEmptyBackground,

    // Player-specific methods
    handleAddPlayerOutcome,
    handleCopyOutcome,
    handleUpdateIdentity,
    handleDeleteIdentity,
    handleAddIdentity,
    handleUpdateBackground,
    handleDeleteBackground,
    handleAddBackground,
    handleUpdateOutcome,
    handleDeleteOutcome,
    handleSave,
  };
}
