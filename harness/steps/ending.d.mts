// Types for ending.mjs, so the server's tests can import it. A page is a
// Playwright page; Playwright is installed globally, not a dependency here.

/** The latest beat as the game shows it. */
export type ScreenBeat = { beat: number; of: number; writing: boolean; title: string; text: boolean; choices: string[] };

export type PlayedToEnd = { choices: number; beat: number; endings: ScreenBeat[] };

export declare const ENDING_SETTLE_MS: number;
export declare const CHOICES_PER_TURN: number;

export declare function beatOnScreen(mark: string): ScreenBeat;

export declare function nextBeat(page: unknown, after: number): Promise<ScreenBeat>;

export declare function playToEnd(options: {
  pages: unknown[];
  shot: (name: string, page?: unknown) => Promise<unknown>;
  log: (line: string) => void;
  finding?: (text: string) => void;
  maxChoices: number;
  labels?: string[];
  choose?: (turn: number, count: number) => number;
}): Promise<PlayedToEnd>;

export declare function endingProblems(options: { played: PlayedToEnd; maxTurns: number }): string[];

declare function ending(context: Record<string, unknown>): Promise<void>;
export default ending;
