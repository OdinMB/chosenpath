import type { Story } from "core/models/Story.js";
import { imageRequestSchema } from "core/types/index.js";
import type { ImageRequest } from "core/types/index.js";
import { Logger } from "shared/logger.js";

/*
 * In-game image generation in the background, and what its outcomes do to the
 * story. A written beat image joins the image library; a failed image (a
 * moderation refusal, an outage) is recorded so the reader hides its slot
 * instead of waiting for it forever. The story text never waits for images.
 */

export type ImageOutcomeOperation =
  | {
      type: "attachImageToStory";
      gameId: string;
      input: { imageId: string; caption: string };
    }
  | {
      type: "recordImageFailure";
      gameId: string;
      input: { imageId: string };
    };

export type StoryImageJobDeps = {
  /** Generates and writes one image; rejects when nothing was written. */
  generate: (story: Story, request: ImageRequest) => Promise<void>;
  /** Hands an outcome to the game queue, which applies it in order. */
  enqueue: (operation: ImageOutcomeOperation) => Promise<unknown>;
};

/**
 * The image requests of each player's latest beat that still need generating:
 * not in the library yet and not failed before. A failed id is not retried,
 * since a refused prompt is refused again.
 */
export function collectLatestBeatImageRequests(story: Story): ImageRequest[] {
  const handled = new Set([
    ...story.getImages().map((image) => image.id),
    ...story.getFailedImageIds(),
  ]);
  const requests: ImageRequest[] = [];
  for (const slot of story.getPlayerSlots()) {
    const beatHistory = story.getPlayer(slot)?.beatHistory ?? [];
    // A beat without an image carries a string such as "none" instead
    const parsed = imageRequestSchema.safeParse(
      beatHistory[beatHistory.length - 1]?.imageRequest
    );
    if (parsed.success && !handled.has(parsed.data.id)) {
      requests.push(parsed.data);
    }
  }
  return requests;
}

/**
 * Starts one generation per request and enqueues each outcome. With
 * `attachToLibrary` off (covers, player portraits), a written image needs no
 * bookkeeping; a failure is still recorded. Resolves once every outcome is
 * enqueued; callers normally do not wait for it.
 */
export async function startBackgroundImageGeneration(
  deps: StoryImageJobDeps,
  gameId: string,
  story: Story,
  requests: ImageRequest[],
  options: { attachToLibrary: boolean }
): Promise<void> {
  await Promise.all(
    requests.map(async (request) => {
      let written = false;
      try {
        await deps.generate(story, request);
        written = true;
      } catch (error) {
        Logger.Queue.error(
          `[StoryImageJobs] Image generation failed for ${gameId} (${request.id}):`,
          error
        );
      }
      try {
        if (!written) {
          await deps.enqueue({
            type: "recordImageFailure",
            gameId,
            input: { imageId: request.id },
          });
        } else if (options.attachToLibrary) {
          await deps.enqueue({
            type: "attachImageToStory",
            gameId,
            input: { imageId: request.id, caption: request.caption },
          });
        }
      } catch (error) {
        Logger.Queue.error(
          `[StoryImageJobs] Could not enqueue the image outcome for ${gameId} (${request.id}):`,
          error
        );
      }
    })
  );
}

/**
 * `into` with the written images and recorded failures of `from` added, so a
 * story built from an older copy (or a pregenerated state) keeps every image
 * outcome that landed meanwhile. An image outranks a failure of the same id.
 */
export function mergeImageRecords(from: Story, into: Story): Story {
  const known = new Set(into.getImages().map((image) => image.id));
  let merged = into;
  for (const image of from.getImages()) {
    if (!known.has(image.id)) {
      merged = merged.addImage(image);
    }
  }
  for (const imageId of from.getFailedImageIds()) {
    merged = merged.markImageFailed(imageId);
  }
  return merged;
}

/** The story with an image outcome applied. Attaching an id twice adds it once. */
export function applyImageOutcome(
  story: Story,
  outcome: ImageOutcomeOperation
): Story {
  if (outcome.type === "attachImageToStory") {
    if (story.getImage(outcome.input.imageId)) {
      return story;
    }
    return story.addImage({
      id: outcome.input.imageId,
      source: "story",
      description: outcome.input.caption || "",
    });
  }
  return story.markImageFailed(outcome.input.imageId);
}
