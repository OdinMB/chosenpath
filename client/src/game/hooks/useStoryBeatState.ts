import React from "react";
import { ClientStoryState, Beat } from "core/types";

interface StoryBeatStateProps {
  storyState: ClientStoryState | null;
  isRequestPending: (action: string) => boolean;
}

interface StoryBeatState {
  displayedBeatIndex: number | null;
  showNextBeatPlaceholder: boolean;
  localSelectedChoice: number | undefined;
  beatHistory: Beat[];
  isViewingLatestBeat: boolean;
  latestBeat: Beat | null;

  // Navigation
  navigateToBeat: (index: number) => void;

  // Choice management
  handleChoiceSelected: (index: number) => void;
  resetChoice: () => void;
}

/**
 * Hook for managing story beat state including navigation, history, and choices
 */
export function useStoryBeatState({
  storyState,
  isRequestPending,
}: StoryBeatStateProps): StoryBeatState {
  // Core state
  const [localSelectedChoice, setLocalSelectedChoice] = React.useState<
    number | undefined
  >(undefined);
  const [previousBeatCount, setPreviousBeatCount] = React.useState(0);
  const [displayedBeatIndex, setDisplayedBeatIndex] = React.useState<
    number | null
  >(null);
  const [showNextBeatPlaceholder, setShowNextBeatPlaceholder] =
    React.useState(false);

  // Critical state for preventing auto-redirects
  const isUserNavigatingRef = React.useRef(false);
  const lastUserNavigationTimeRef = React.useRef(0);
  const NAVIGATION_DEBOUNCE_TIME = 3000; // 3 seconds debounce

  // Get player data
  const playerSlotId = React.useMemo(
    () =>
      storyState?.players ? Object.keys(storyState.players)[0] : undefined,
    [storyState?.players]
  );

  const playerState = React.useMemo(
    () => (playerSlotId ? storyState?.players[playerSlotId] : undefined),
    [playerSlotId, storyState?.players]
  );

  const beatHistory = React.useMemo(
    () => playerState?.beatHistory || [],
    [playerState?.beatHistory]
  );

  // Calculate current state
  const isViewingLatestBeat = displayedBeatIndex === beatHistory.length - 1;
  const latestBeat =
    beatHistory.length > 0 ? beatHistory[beatHistory.length - 1] : null;

  // Function to check if we should allow automatic state updates
  // Returns true if enough time has passed since user navigation
  const canAutoUpdate = () => {
    return (
      !isUserNavigatingRef.current &&
      Date.now() - lastUserNavigationTimeRef.current > NAVIGATION_DEBOUNCE_TIME
    );
  };

  // Handle new beat arrival
  React.useEffect(() => {
    const currentBeatCount = beatHistory.length;
    if (currentBeatCount !== previousBeatCount) {
      // Only update if not during user navigation
      if (canAutoUpdate()) {
        setLocalSelectedChoice(undefined);
        setDisplayedBeatIndex(currentBeatCount - 1);
        setShowNextBeatPlaceholder(false);
      }
      setPreviousBeatCount(currentBeatCount);
    }
  }, [beatHistory.length, previousBeatCount]);

  // Initialize displayedBeatIndex if null
  React.useEffect(() => {
    if (
      displayedBeatIndex === null &&
      beatHistory.length > 0 &&
      canAutoUpdate()
    ) {
      setDisplayedBeatIndex(beatHistory.length - 1);
    }
  }, [beatHistory.length, displayedBeatIndex]);

  // Handle showing the placeholder for next beat when server confirms choice
  React.useEffect(() => {
    // Skip all these checks during user navigation
    if (!canAutoUpdate()) return;

    // Don't proceed if no choice was made or placeholder already showing
    if (localSelectedChoice === undefined || showNextBeatPlaceholder) return;

    // Only show placeholder when viewing latest beat
    if (!isViewingLatestBeat) return;

    // Check if server confirmed the choice
    const latestBeat = beatHistory[beatHistory.length - 1];
    if (latestBeat && latestBeat.choice !== -1) {
      // Show placeholder and update index
      setShowNextBeatPlaceholder(true);
      setDisplayedBeatIndex(beatHistory.length);
    }
  }, [
    localSelectedChoice,
    beatHistory,
    isViewingLatestBeat,
    showNextBeatPlaceholder,
  ]);

  // Reset choice if server rejects it
  React.useEffect(() => {
    // Skip during user navigation
    if (!canAutoUpdate()) return;

    // Only run if we have a choice selected
    if (localSelectedChoice === undefined) return;

    // If request still processing, do nothing
    if (isRequestPending("make_choice")) return;

    // Check if server confirmed the choice
    const latestBeat = beatHistory[beatHistory.length - 1];
    const serverConfirmedChoice = latestBeat && latestBeat.choice !== -1;

    // Reset everything if not confirmed
    if (!serverConfirmedChoice) {
      setLocalSelectedChoice(undefined);
      setShowNextBeatPlaceholder(false);
      setDisplayedBeatIndex(beatHistory.length - 1);
    }
  }, [isRequestPending, localSelectedChoice, beatHistory]);

  // Initialize choice from server state
  React.useEffect(() => {
    if (!canAutoUpdate()) return;

    if (beatHistory.length > 0 && localSelectedChoice === undefined) {
      const currentBeat = beatHistory[beatHistory.length - 1];
      if (currentBeat.choice !== -1) {
        setLocalSelectedChoice(currentBeat.choice);
      }
    }
  }, [beatHistory, localSelectedChoice]);

  // USER-INITIATED NAVIGATION
  // This is completely separate from auto-updates
  const navigateToBeat = (index: number) => {
    // Set the navigation flag to block automatic updates
    isUserNavigatingRef.current = true;
    lastUserNavigationTimeRef.current = Date.now();

    // Force the displayed beat index to the target
    setDisplayedBeatIndex(index);

    // Only show placeholder when navigating to the placeholder position AND
    // when there's a confirmed choice on the latest beat
    if (
      index === beatHistory.length &&
      beatHistory.length > 0 &&
      beatHistory[beatHistory.length - 1].choice !== -1
    ) {
      setShowNextBeatPlaceholder(true);
    } else {
      // Otherwise, we're viewing a regular beat
      setShowNextBeatPlaceholder(false);
    }

    // Set a timeout to re-enable automatic updates after the debounce period
    setTimeout(() => {
      isUserNavigatingRef.current = false;
    }, NAVIGATION_DEBOUNCE_TIME);
  };

  // Handle user choice selection
  const handleChoiceSelected = (index: number) => {
    // Only allow choice on the latest beat with no existing choice
    if (
      !isViewingLatestBeat ||
      (latestBeat && latestBeat.choice !== -1) ||
      localSelectedChoice !== undefined ||
      isRequestPending("make_choice")
    ) {
      return;
    }

    // Set local choice
    setLocalSelectedChoice(index);
  };

  // Reset choice
  const resetChoice = () => {
    setLocalSelectedChoice(undefined);
  };

  return {
    displayedBeatIndex,
    showNextBeatPlaceholder,
    localSelectedChoice,
    beatHistory,
    isViewingLatestBeat,
    latestBeat,
    navigateToBeat,
    handleChoiceSelected,
    resetChoice,
  };
}
