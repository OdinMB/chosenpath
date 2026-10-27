// Types for fake-story.mjs, so the server's tests can import it.

export type FakeStat = { id: string; type: string; shared: boolean };

export type FakeRequestReading = {
  chapterLength: number | undefined;
  stats: FakeStat[];
  firstBeat: boolean;
  turn: "switch" | "thread" | "ending" | undefined;
  turnNumber: number | undefined;
};

export declare const SHORTEST_CHAPTER: number;
export declare const ENDING_TITLE: string;
export declare const EMPTY_REQUEST: FakeRequestReading;
export declare const RISKS: string[];
export declare const BASE_POINTS: number[];
export declare const BONUS_EFFECTS: number[];
export declare const START_VALUES: number[];
export declare const CHANGE_STEPS: number[];

export declare function requestText(body: unknown): string;
export declare function chapterLengthIn(prompt: string): number | undefined;
export declare function statsIn(prompt: string): FakeStat[];
export declare function turnNumberIn(prompt: string): number | undefined;
export declare function readRequest(prompt: string): FakeRequestReading;
export declare function varietyKey(request: FakeRequestReading, schema: unknown): string;
export declare function seededRandom(seed: number, key?: number | string): () => number;

export declare const STORY_HINTS: Record<string, Record<string, (...args: never[]) => unknown>>;
