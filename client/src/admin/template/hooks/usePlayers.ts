import { useState } from "react";
import {
  CharacterIdentity,
  CharacterBackground,
  PlayerOptionsGeneration,
  PlayerSlot,
  Stat,
} from "@core/types";

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

interface UsePlayersResult {
  editingPlayers: Set<string>;
  editingIdentities: Set<string>;
  editingBackgrounds: Set<string>;
  editingOutcomes: Set<string>;
  setEditingPlayers: (callback: (prev: Set<string>) => Set<string>) => void;
  setEditingIdentities: (callback: (prev: Set<string>) => Set<string>) => void;
  setEditingBackgrounds: (callback: (prev: Set<string>) => Set<string>) => void;
  setEditingOutcomes: (callback: (prev: Set<string>) => Set<string>) => void;
  handleUpdatePlayer: (
    playerSlot: PlayerSlot,
    updates: Partial<PlayerOptionsGeneration>
  ) => void;
  createEmptyIdentity: () => CharacterIdentity;
  createEmptyBackground: () => CharacterBackground;
  handleAddPlayerOutcome: (playerSlot: PlayerSlot) => void;
}

export function usePlayers(
  playerOptions: Record<PlayerSlot, PlayerOptionsGeneration>,
  onChange: (updates: Record<PlayerSlot, PlayerOptionsGeneration>) => void,
  playerStats: Stat[]
): UsePlayersResult {
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

  const handleUpdatePlayer = (
    playerSlot: PlayerSlot,
    updates: Partial<PlayerOptionsGeneration>
  ) => {
    // Create the updated player options
    const updatedPlayerOptions = {
      ...playerOptions,
      [playerSlot]: {
        ...playerOptions[playerSlot],
        ...updates,
      },
    };

    // Immediately propagate the change to parent component
    onChange(updatedPlayerOptions);
  };

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

  const createEmptyBackground = (): CharacterBackground => {
    const initialPlayerStatValues = playerStats.map((stat) => {
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

  const handleAddPlayerOutcome = (playerSlot: PlayerSlot) => {
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
    const currentOutcomes = playerOptions[playerSlot]?.outcomes || [];
    const updatedOutcomes = [...currentOutcomes, newOutcome];

    // Save changes immediately
    handleUpdatePlayer(playerSlot, {
      outcomes: updatedOutcomes,
    });
  };

  return {
    editingPlayers,
    editingIdentities,
    editingBackgrounds,
    editingOutcomes,
    setEditingPlayers,
    setEditingIdentities,
    setEditingBackgrounds,
    setEditingOutcomes,
    handleUpdatePlayer,
    createEmptyIdentity,
    createEmptyBackground,
    handleAddPlayerOutcome,
  };
}
