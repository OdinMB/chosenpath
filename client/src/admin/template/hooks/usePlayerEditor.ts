import { useState } from "react";
import {
  PlayerOptionsGeneration,
  PlayerSlot,
  CharacterIdentity,
  CharacterBackground,
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

interface UsePlayerEditorResult {
  localOptions: PlayerOptionsGeneration;
  handleCopyOutcome: (
    sourcePlayerSlot: PlayerSlot,
    outcomeIndex: number
  ) => void;
  handleUpdateIdentity: (
    index: number,
    updatedIdentity: CharacterIdentity
  ) => void;
  handleDeleteIdentity: (index: number) => void;
  handleAddIdentity: () => void;
  handleUpdateBackground: (
    index: number,
    updatedBackground: CharacterBackground
  ) => void;
  handleDeleteBackground: (index: number) => void;
  handleAddBackground: () => void;
  handleUpdateOutcome: (index: number, updatedOutcome: PlayerOutcome) => void;
  handleDeleteOutcome: (index: number) => void;
  handleSave: () => void;
}

export function usePlayerEditor(
  playerSlot: PlayerSlot,
  options: PlayerOptionsGeneration,
  playerOptions: Record<PlayerSlot, PlayerOptionsGeneration>,
  handleUpdatePlayer: (
    playerSlot: PlayerSlot,
    updates: Partial<PlayerOptionsGeneration>
  ) => void,
  createEmptyIdentity: () => CharacterIdentity,
  createEmptyBackground: () => CharacterBackground,
  setEditingPlayers: (callback: (prev: Set<string>) => Set<string>) => void,
  readOnly: boolean = false
): UsePlayerEditorResult {
  const [localOptions, setLocalOptions] = useState<PlayerOptionsGeneration>(
    () => ({
      ...options,
      possibleCharacterIdentities: options.possibleCharacterIdentities.length
        ? options.possibleCharacterIdentities
        : Array(3).fill(null).map(createEmptyIdentity),
      possibleCharacterBackgrounds: options.possibleCharacterBackgrounds.length
        ? options.possibleCharacterBackgrounds
        : Array(3).fill(null).map(createEmptyBackground),
      outcomes: options.outcomes || [],
    })
  );

  const handleCopyOutcome = (
    sourcePlayerSlot: PlayerSlot,
    outcomeIndex: number
  ) => {
    if (readOnly) return;

    const sourceOutcome =
      playerOptions[sourcePlayerSlot]?.outcomes[outcomeIndex];

    if (sourceOutcome) {
      const copiedOutcome: PlayerOutcome = {
        ...sourceOutcome,
        id: crypto.randomUUID(),
      };

      // Update local state
      const updatedOutcomes = [...localOptions.outcomes, copiedOutcome];
      setLocalOptions((prev) => ({
        ...prev,
        outcomes: updatedOutcomes,
      }));

      // Immediately save changes to the parent component
      handleUpdatePlayer(playerSlot, {
        outcomes: updatedOutcomes,
      });
    }
  };

  const handleUpdateIdentity = (
    index: number,
    updatedIdentity: CharacterIdentity
  ) => {
    if (readOnly) return;

    const updated = [...localOptions.possibleCharacterIdentities];
    updated[index] = updatedIdentity;

    // Update local state
    setLocalOptions((prev) => ({
      ...prev,
      possibleCharacterIdentities: updated,
    }));

    // Immediately save changes to the parent component
    handleUpdatePlayer(playerSlot, {
      possibleCharacterIdentities: updated,
    });
  };

  const handleDeleteIdentity = (index: number) => {
    if (readOnly) return;

    const updated = [...localOptions.possibleCharacterIdentities];
    updated.splice(index, 1);

    // Update local state
    setLocalOptions((prev) => ({
      ...prev,
      possibleCharacterIdentities: updated,
    }));

    // Immediately save changes to the parent component
    handleUpdatePlayer(playerSlot, {
      possibleCharacterIdentities: updated,
    });
  };

  const handleAddIdentity = () => {
    if (readOnly) return;

    const updated = [
      ...localOptions.possibleCharacterIdentities,
      createEmptyIdentity(),
    ];

    // Update local state
    setLocalOptions((prev) => ({
      ...prev,
      possibleCharacterIdentities: updated,
    }));

    // Immediately save changes to the parent component
    handleUpdatePlayer(playerSlot, {
      possibleCharacterIdentities: updated,
    });
  };

  const handleUpdateBackground = (
    index: number,
    updatedBackground: CharacterBackground
  ) => {
    if (readOnly) return;

    const updated = [...localOptions.possibleCharacterBackgrounds];
    updated[index] = updatedBackground;

    // Update local state
    setLocalOptions((prev) => ({
      ...prev,
      possibleCharacterBackgrounds: updated,
    }));

    // Immediately save changes to the parent component
    handleUpdatePlayer(playerSlot, {
      possibleCharacterBackgrounds: updated,
    });
  };

  const handleDeleteBackground = (index: number) => {
    if (readOnly) return;

    const updated = [...localOptions.possibleCharacterBackgrounds];
    updated.splice(index, 1);

    // Update local state
    setLocalOptions((prev) => ({
      ...prev,
      possibleCharacterBackgrounds: updated,
    }));

    // Immediately save changes to the parent component
    handleUpdatePlayer(playerSlot, {
      possibleCharacterBackgrounds: updated,
    });
  };

  const handleAddBackground = () => {
    if (readOnly) return;

    const updated = [
      ...localOptions.possibleCharacterBackgrounds,
      createEmptyBackground(),
    ];

    // Update local state
    setLocalOptions((prev) => ({
      ...prev,
      possibleCharacterBackgrounds: updated,
    }));

    // Immediately save changes to the parent component
    handleUpdatePlayer(playerSlot, {
      possibleCharacterBackgrounds: updated,
    });
  };

  const handleUpdateOutcome = (
    index: number,
    updatedOutcome: PlayerOutcome
  ) => {
    if (readOnly) return;

    const updated = [...localOptions.outcomes];
    updated[index] = updatedOutcome;

    // Update local state
    setLocalOptions((prev) => ({
      ...prev,
      outcomes: updated,
    }));

    // Immediately save changes to the parent component
    handleUpdatePlayer(playerSlot, {
      outcomes: updated,
    });
  };

  const handleDeleteOutcome = (index: number) => {
    if (readOnly) return;

    const updated = [...localOptions.outcomes];
    updated.splice(index, 1);

    // Update local state
    setLocalOptions((prev) => ({
      ...prev,
      outcomes: updated,
    }));

    // Immediately save changes to the parent component
    handleUpdatePlayer(playerSlot, {
      outcomes: updated,
    });
  };

  const handleSave = () => {
    if (readOnly) return;

    handleUpdatePlayer(playerSlot, localOptions);
    setEditingPlayers((prev) => {
      const next = new Set(prev);
      next.delete(playerSlot);
      return next;
    });
  };

  return {
    localOptions,
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
