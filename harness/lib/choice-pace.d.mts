// Types for choice-pace.mjs, so the server's tests can import it.

/** A limit on a seat's counted events: at most `maxRequests` in `windowMs`. */
export type ChoiceLimit = { windowMs: number; maxRequests: number };

export type ChoicePacer = {
  limit: ChoiceLimit;
  waitMs(): number;
  record(): ChoicePacer;
  pace(send: () => unknown): Promise<number>;
};

export declare const PACE_MARGIN_MS: number;

export declare function choiceLimitIn(configText: string): ChoiceLimit;
export declare function choiceLimit(): ChoiceLimit;
export declare function choicePacer(options?: {
  limit?: ChoiceLimit;
  marginMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<unknown>;
}): ChoicePacer;
