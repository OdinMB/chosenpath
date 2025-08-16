import { useState } from "react";
import { GameModes, PlayerCount } from "core/types";

interface PendingGameModeChange {
  newMode: GameModes;
  oldMode: GameModes;
  value: number;
}

interface PendingPlayerCountChange {
  newMin: PlayerCount;
  newMax: PlayerCount;
  oldMin: PlayerCount;
  oldMax: PlayerCount;
  isMinChange: boolean;
}

interface PendingCompetitiveSingleChange {
  newMin: PlayerCount;
  newMax: PlayerCount;
  isMinChange: boolean;
}

interface UseTemplateWarningsProps {
  handleGameModeChangeOriginal: (value: number) => void;
  handlePlayerCountMinChangeOriginal: (value: PlayerCount) => void;
  handlePlayerCountMaxChangeOriginal: (value: PlayerCount) => void;
}

export function useTemplateWarnings({
  handleGameModeChangeOriginal,
  handlePlayerCountMinChangeOriginal,
  handlePlayerCountMaxChangeOriginal,
}: UseTemplateWarningsProps) {
  // State for multiplayer mode warning modal
  const [showMultiplayerWarning, setShowMultiplayerWarning] = useState(false);
  const [pendingGameModeChange, setPendingGameModeChange] = useState<PendingGameModeChange | null>(null);

  // State for player count change warning modal
  const [showPlayerCountWarning, setShowPlayerCountWarning] = useState(false);
  const [pendingPlayerCountChange, setPendingPlayerCountChange] = useState<PendingPlayerCountChange | null>(null);

  // State for competitive single player warning modal
  const [showCompetitiveSingleWarning, setShowCompetitiveSingleWarning] = useState(false);
  const [pendingCompetitiveSingleChange, setPendingCompetitiveSingleChange] = useState<PendingCompetitiveSingleChange | null>(null);

  // Handle multiplayer warning modal actions
  const handleMultiplayerWarningProceed = () => {
    if (pendingGameModeChange) {
      handleGameModeChangeOriginal(pendingGameModeChange.value);
      setPendingGameModeChange(null);
    }
    setShowMultiplayerWarning(false);
  };

  const handleMultiplayerWarningCancel = () => {
    setPendingGameModeChange(null);
    setShowMultiplayerWarning(false);
  };

  // Handle player count warning modal actions
  const handlePlayerCountWarningProceed = () => {
    if (pendingPlayerCountChange) {
      if (pendingPlayerCountChange.isMinChange) {
        handlePlayerCountMinChangeOriginal(pendingPlayerCountChange.newMin);
      } else {
        handlePlayerCountMaxChangeOriginal(pendingPlayerCountChange.newMax);
      }
      setPendingPlayerCountChange(null);
    }
    setShowPlayerCountWarning(false);
  };

  const handlePlayerCountWarningCancel = () => {
    setPendingPlayerCountChange(null);
    setShowPlayerCountWarning(false);
  };

  // Handle competitive single player warning modal actions
  const handleCompetitiveSingleWarningProceed = () => {
    if (pendingCompetitiveSingleChange) {
      if (pendingCompetitiveSingleChange.isMinChange) {
        handlePlayerCountMinChangeOriginal(pendingCompetitiveSingleChange.newMin);
      } else {
        handlePlayerCountMaxChangeOriginal(pendingCompetitiveSingleChange.newMax);
      }
      setPendingCompetitiveSingleChange(null);
    }
    setShowCompetitiveSingleWarning(false);
  };

  const handleCompetitiveSingleWarningCancel = () => {
    setPendingCompetitiveSingleChange(null);
    setShowCompetitiveSingleWarning(false);
  };

  // Trigger functions to show warnings
  const triggerGameModeWarning = (newMode: GameModes, oldMode: GameModes) => {
    const value = newMode === GameModes.Cooperative ? 0 
      : newMode === GameModes.CooperativeCompetitive ? 1 
      : 2;
    
    setPendingGameModeChange({ newMode, oldMode, value });
    setShowMultiplayerWarning(true);
  };

  const triggerPlayerCountWarning = (
    newMin: PlayerCount,
    newMax: PlayerCount,
    oldMin: PlayerCount,
    oldMax: PlayerCount,
    isMinChange: boolean
  ) => {
    setPendingPlayerCountChange({ newMin, newMax, oldMin, oldMax, isMinChange });
    setShowPlayerCountWarning(true);
  };

  const triggerCompetitiveSingleWarning = (
    newMin: PlayerCount,
    newMax: PlayerCount,
    isMinChange: boolean
  ) => {
    setPendingCompetitiveSingleChange({ newMin, newMax, isMinChange });
    setShowCompetitiveSingleWarning(true);
  };

  return {
    // Warning modal states
    showMultiplayerWarning,
    showPlayerCountWarning,
    showCompetitiveSingleWarning,
    pendingGameModeChange,
    pendingPlayerCountChange,
    pendingCompetitiveSingleChange,
    
    // Handlers
    handleMultiplayerWarningProceed,
    handleMultiplayerWarningCancel,
    handlePlayerCountWarningProceed,
    handlePlayerCountWarningCancel,
    handleCompetitiveSingleWarningProceed,
    handleCompetitiveSingleWarningCancel,
    
    // Trigger functions
    triggerGameModeWarning,
    triggerPlayerCountWarning,
    triggerCompetitiveSingleWarning,
  };
}