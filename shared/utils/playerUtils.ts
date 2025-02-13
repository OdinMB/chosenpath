import type { PlayerCount, PlayerNumber, PlayerMap } from '../types/players.js';

export const getPlayerNumbers = (count: PlayerCount): PlayerNumber[] => {
  return Array.from({ length: count }, (_, i) => `player${i + 1}` as PlayerNumber);
};

export const mapPlayers = <T, R>(
  players: PlayerMap<T>,
  count: PlayerCount,
  fn: (player: T, playerNumber: PlayerNumber) => R
): R[] => {
  return getPlayerNumbers(count)
    .map(num => players[num])
    .filter((p): p is T => p !== undefined)
    .map((player, idx) => fn(player, `player${idx + 1}` as PlayerNumber));
};

export const createPlayerMap = <T>(
  count: PlayerCount,
  creator: (playerNumber: PlayerNumber) => T
): PlayerMap<T> => {
  return getPlayerNumbers(count).reduce((acc, num) => ({
    ...acc,
    [num]: creator(num)
  }), {});
};

// Helper function to validate player counts
export const isValidPlayerCount = (count: number): count is PlayerCount => {
  return count >= 1 && count <= 3;
}; 