Title: Non-blocking Image Generation (Current Implementation)

Context

- Broadcast new story states immediately; generate images in background; clients show placeholders until images arrive.
- Image generation never mutates story state directly; it writes files and uses a lightweight queue operation to attach results.

Current server implementation

- Latest-beat requests only: After any progression (generated or pregen-adopted), the server collects image requests from the latest beat for each player and filters out requests whose `id` already exists in the story image library.
- Parallel generation: For each collected request, the server generates the image in the background (no story mutation), then enqueues `attachImageToStory { imageId, caption }` on completion to safely update the story via the per-story queue.
- Idempotent attach: If an image with the same id already exists, attach is effectively a no-op at the story state level (client may still fetch by URL).

Server flows that trigger image generation

1. moveStoryForward (real progression)

- Compute the next beats (or adopt a pregen) and immediately broadcast the final story.
- Run the unified image flow:
  - Collect latest-beat image requests for each player.
  - Filter out requests whose `id` already exists in `story.images`.
  - For each remaining request, generate the image and enqueue `attachImageToStory { imageId, caption }` on completion.

2. recordChoice with complete pregen (no moveStoryForward queued)

- After adopting a pregen story, the server broadcasts the new story.
- Then it runs the exact same unified image flow described above.

Attach image operation

- `attachImageToStory` loads the latest story, adds the image metadata (id, description, source=story), stores, and broadcasts.
- No mirroring into pregenerated files is needed. When pregens are stored/used, the live story image library is merged into them to avoid losing references.

Storage and URLs

- Images are written to: `/images/stories/:storyId/(subDir/)?imageId.jpeg`.
- Clients render placeholders until the image is available at its deterministic URL.

Notes

- Pregeneration never generates images; only real progression paths trigger generation.
- Character images (during selection) follow the same background generation pattern, but are not inserted into the story’s image library.

Models and settings

- Two env vars pick the model (`server/src/config.ts`):
  - `IMAGE_GENERATION_MODEL` (default `gpt-image-1.5`) drives the in-game flows: beat illustrations, custom-story cover, custom-story player portraits.
  - `IMAGE_GENERATION_TEMPLATE_MODEL` (default: the value of `IMAGE_GENERATION_MODEL`) drives the template editor: element images, player identity portraits, template cover.
  - gpt-image-1.5 shuts down 2026-12-01. Candidates: `gpt-image-2.5-flare` for in-game, `gpt-image-2.5-sunburst` for the template editor, `gpt-image-2` as fallback. The defaults flip only after the owner's blind rating of the eval (see "Evaluating image models").
- Quality per flow comes from the `IMAGE_GENERATION_*_QUALITY` constants in `config.ts`. Beats use `BEAT`; the custom-story cover and player portrait pass `STORY_COVER` / `STORY_PLAYER` through `ImageRequest.imageQuality`; the template routes use `TEMPLATE_*` when the client sends no quality.
- `xhigh` and `max` exist only on `gpt-image-2.5*`. On any other model `requestImage` sends `high` and logs a warning, so a quality constant changed out of step with the model never turns into silent failures.
- Request rules live in `server/src/images/openaiImageClient.ts`: edit when at least one reference image loaded, otherwise generate (a request whose references are all missing falls back to generate); at most 16 references per edit; `input_fidelity` is never sent; jpeg, compression 75, moderation low, n=1.
- Errors: `error.type === "image_generation_user_error"` (GPT Image 2.5) is classified CONTENT_POLICY or COPYRIGHT with `retryable: false`, because the unchanged request fails again. The app itself never retries; the OpenAI SDK retries only 408/409/429/5xx.
- Prompt wording lives in `server/src/images/imagePrompts.ts`. The eval builds its prompts with the same functions, so a wording change also changes what the eval measures.
- Template covers are generated at 1024x1536 and shrunk to 512x768 (`templateCover.ts`).
