import type {
  CharacterIdentity,
  PlayerCount,
  PlayerSlot,
  PlayerMap,
} from "../types/player.js";

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

/**
 * Replaces pronoun placeholders in text with actual pronouns from a character identity
 * @param text The text containing placeholders
 * @param identity The character identity with name and pronouns
 * @returns Text with placeholders replaced with actual pronouns
 */
export function replacePronounPlaceholders(
  text: string,
  identity: CharacterIdentity | null
): string {
  if (!identity) return text;

  // Replace both lowercase and capitalized placeholders
  return text
    .replace(/{name}/g, identity.name)
    .replace(/{Name}/g, identity.name)
    .replace(/{personal}/g, identity.pronouns.personal)
    .replace(
      /{Personal}/g,
      identity.pronouns.personal.charAt(0).toUpperCase() +
        identity.pronouns.personal.slice(1)
    )
    .replace(/{object}/g, identity.pronouns.object)
    .replace(
      /{Object}/g,
      identity.pronouns.object.charAt(0).toUpperCase() +
        identity.pronouns.object.slice(1)
    )
    .replace(/{possessive}/g, identity.pronouns.possessive)
    .replace(
      /{Possessive}/g,
      identity.pronouns.possessive.charAt(0).toUpperCase() +
        identity.pronouns.possessive.slice(1)
    )
    .replace(/{reflexive}/g, identity.pronouns.reflexive)
    .replace(
      /{Reflexive}/g,
      identity.pronouns.reflexive.charAt(0).toUpperCase() +
        identity.pronouns.reflexive.slice(1)
    );
}
