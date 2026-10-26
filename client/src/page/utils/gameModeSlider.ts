import type { KeyboardEvent } from "react";
import { GameModes, type GameMode } from "core/types";

/*
 * Keys on the setup's game-mode slider (StoryInitializer, step 2, on the setup
 * page and in the World editor's AI Draft). The slider runs from 0 to 1 in
 * steps of 0.01 so it can be dragged anywhere, and shows the chosen mode at its
 * stop. The browser's own arrow keys would move it one hundredth, which picks
 * the same mode and snaps back, so the keys move from stop to stop instead.
 * Dragging and clicking are left to the slider's change handler.
 */

// The slider's stops, left to right
const GAME_MODE_STOPS: readonly GameMode[] = [
  GameModes.Cooperative,
  GameModes.CooperativeCompetitive,
  GameModes.Competitive,
];
const LAST_STOP = GAME_MODE_STOPS.length - 1;

/**
 * The mode a key moves the slider to: Right, Up and Page Up to the next mode,
 * Left, Down and Page Down to the previous one, Home and End to the ends.
 * Undefined for any other key, which the slider leaves to the browser.
 */
export function gameModeForKey(
  mode: GameMode,
  key: string
): GameMode | undefined {
  // The single-player mode a link can carry with more players has no stop of
  // its own; the slider shows it at the Competitive end
  const index = GAME_MODE_STOPS.indexOf(mode);
  const at = index === -1 ? LAST_STOP : index;

  switch (key) {
    case "ArrowRight":
    case "ArrowUp":
    case "PageUp":
      return GAME_MODE_STOPS[Math.min(at + 1, LAST_STOP)];
    case "ArrowLeft":
    case "ArrowDown":
    case "PageDown":
      return GAME_MODE_STOPS[Math.max(at - 1, 0)];
    case "Home":
      return GAME_MODE_STOPS[0];
    case "End":
      return GAME_MODE_STOPS[LAST_STOP];
    default:
      return undefined;
  }
}

/** The parts of a key press the slider's key handler reads. */
export type GameModeKeyEvent = Pick<
  KeyboardEvent,
  "key" | "altKey" | "ctrlKey" | "metaKey" | "preventDefault"
>;

/**
 * The game-mode slider's key handler: a slider key selects the mode it moves
 * to (nothing when that is the mode already selected) instead of the browser's
 * step. Keys pressed with Alt, Ctrl or Meta stay the browser's shortcuts.
 */
export function gameModeKeyHandler(
  mode: GameMode,
  onSelect: (mode: GameMode) => void
): (event: GameModeKeyEvent) => void {
  return (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const next = gameModeForKey(mode, event.key);
    if (next === undefined) return;
    event.preventDefault();
    if (next !== mode) onSelect(next);
  };
}
