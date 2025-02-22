import type { PlayerCount, PlayerSlot, PlayerMap } from "../types/player.js";

export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 3;

export const getPlayerSlots = (count: PlayerCount): PlayerSlot[] => {
  return Array.from(
    { length: count },
    (_, i) => `player${i + 1}` as PlayerSlot
  );
};

export const mapPlayers = <T, R>(
  players: PlayerMap<T>,
  count: PlayerCount,
  fn: (player: T, playerSlot: PlayerSlot) => R
): R[] => {
  return getPlayerSlots(count)
    .map((slot) => players[slot])
    .filter((p): p is T => p !== undefined)
    .map((player, idx) => fn(player, `player${idx + 1}` as PlayerSlot));
};

export const createPlayerMap = <T>(
  count: PlayerCount,
  creator: (playerSlot: PlayerSlot) => T
): PlayerMap<T> => {
  return getPlayerSlots(count).reduce(
    (acc, slot) => ({
      ...acc,
      [slot]: creator(slot),
    }),
    {}
  );
};

// Helper function to validate player counts
export const isValidPlayerCount = (count: number): count is PlayerCount => {
  return count >= MIN_PLAYERS && count <= MAX_PLAYERS;
};
