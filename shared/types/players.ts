export type PlayerCount = 1 | 2 | 3;

export type PlayerNumber = 'player1' | 'player2' | 'player3';

// Helper type to create objects with numbered player keys
export type PlayerMap<T> = {
  [K in PlayerNumber]?: T;
};

// Helper type to ensure exactly N players
export type ExactPlayerMap<T, N extends PlayerCount> = {
  [K in PlayerNumber]: K extends `player${N extends 1 ? 1 : N extends 2 ? 1 | 2 : 1 | 2 | 3}` ? T : never;
};
