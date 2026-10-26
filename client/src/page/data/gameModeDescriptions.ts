import { GameModes, type GameMode } from "core/types";
import { contestsPlayable } from "core/utils/outcomeReadiness";

/*
 * The line under the setup's game-mode slider (StoryInitializer, on the setup
 * page and in the World editor's AI Draft): what the selected mode means for a
 * group. Each sentence states only what the code guarantees, not what the
 * setup asks the model for (how many shared goals or prizes, a visible score,
 * camps), so change it when that code changes:
 * - Only competitive and cooperative-competitive games play contests, players
 *   against each other: the plan check refuses a contest in a cooperative game
 *   and turns one written there into a challenge (server/src/game/services/
 *   planChecks.ts, checkThread and oneSidedAsChallenge; core's
 *   contestsPlayable). The shared goal is the mode's intent, which the setup,
 *   the switch planner and every turn are told (setupPromptText.ts GAME_MODES,
 *   SwitchPromptService, StoryStatePromptService).
 * - A contest has exactly two sides, side A and side B (planChecks.ts,
 *   checkThread; core's Thread.playersSideA and playersSideB), so a contest
 *   all three players are in is two against one.
 * The single-player mode, which a link can carry with more players, gets no
 * line: the setup gives such a group no game-mode sentence of its own.
 */
const GAME_MODE_DESCRIPTIONS: Partial<Record<GameMode, string>> = {
  [GameModes.Cooperative]:
    "Players work together toward a shared goal and never compete against each other.",
  [GameModes.CooperativeCompetitive]:
    "Players work together toward a shared goal and also compete against each other for a prize.",
  [GameModes.Competitive]: "Players compete against each other for a prize.",
};

export const THREE_PLAYER_CONTEST =
  "With three players, a contest still has only two sides, so when all three compete, it is two against one.";

/** The selected game mode's line for a group of this size, or undefined where there is none to show. */
export function gameModeDescription(
  mode: GameMode,
  playerCount: number
): string | undefined {
  const line = GAME_MODE_DESCRIPTIONS[mode];
  if (!line || playerCount < 2) return undefined;
  return playerCount === 3 && contestsPlayable(mode, playerCount)
    ? `${line} ${THREE_PLAYER_CONTEST}`
    : line;
}
