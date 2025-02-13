import { MIN_PLAYERS, MAX_PLAYERS } from '../config.js';

// Create union type from range MIN_PLAYERS to MAX_PLAYERS
type NumberRange<Start extends number, End extends number> = Exclude<Enumerate<End>, Enumerate<Start>> | End;
type Enumerate<N extends number, Acc extends number[] = []> = Acc['length'] extends N
  ? Acc[number]
  : Enumerate<N, [...Acc, Acc['length']]>;

export type PlayerCount = NumberRange<typeof MIN_PLAYERS, typeof MAX_PLAYERS>;

// Define the enum values based on MAX_PLAYERS
const playerSlotArray = Array.from(
  { length: MAX_PLAYERS }, 
  (_, i) => `player${i + 1}`
);
export const PLAYER_SLOTS = playerSlotArray as readonly string[] & {
  readonly [K in keyof typeof playerSlotArray]: typeof playerSlotArray[K]
};
export type PlayerSlot = typeof PLAYER_SLOTS[number];

// Helper type to create objects with player slot keys
export type PlayerMap<T> = {
  [K in PlayerSlot]?: T;
};

// Helper type to ensure exactly N players
export type ExactPlayerMap<T, N extends PlayerCount> = {
  [K in PlayerSlot]: K extends `player${NumberRange<typeof MIN_PLAYERS, N>}` ? T : never;
};
