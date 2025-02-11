import type { StoryState } from "./story.js";
import type { Beat } from "./beat.js";
import type { Image } from "./image.js";

export interface InitializeResponse {
  sessionId: string;
  state: StoryState;
}

export interface BeatResponse extends Beat {
  image?: Image;
}

export interface ErrorResponse {
  error: string;
}

export type ApiResponse<T> = T | ErrorResponse;

export function isErrorResponse(response: unknown): response is ErrorResponse {
  return (
    typeof response === "object" && response !== null && "error" in response
  );
}
