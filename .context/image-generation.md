Title: Non-blocking Image Generation (Current Implementation)

Context

- Broadcast new story states immediately; generate images in background; clients show placeholders until images arrive.
- Image generation never mutates story state directly; it writes files and uses a lightweight queue operation to attach results.

Current server implementation

- Latest-beat requests only: After any progression (generated or pregen-adopted), the server collects image requests from the latest beat for each player (`collectLatestBeatImageRequests` in `server/src/game/services/StoryImageJobs.ts`) and filters out requests whose `id` is already in the story image library or in `failedImageIds`. A failed id is never retried: a refused prompt is refused again.
- Parallel generation: For each collected request, `startBackgroundImageGeneration` generates the image in the background (`AIImageGenerator.generateBeatImage`, no story mutation), then enqueues `attachImageToStory { imageId, caption }` if the file was written, or `recordImageFailure { imageId }` if it was not (a moderation refusal, an outage). A failed image never enters the library: a library entry without a file would invite later beats to reuse the id.
- Idempotent attach: attaching an id that is already in the library changes nothing. A written image outranks a recorded failure of the same id (two generations of one request can race), and `markImageFailed` is a no-op for an id in the library.

Server flows that trigger image generation

1. moveStoryForward (real progression)

- Compute the next beats (or adopt a pregen) and immediately broadcast the final story.
- Run the unified image flow:
  - Collect latest-beat image requests for each player.
  - Filter out requests whose `id` already exists in `story.images` or `failedImageIds`.
  - For each remaining request, generate the image, then enqueue `attachImageToStory` once it is written or `recordImageFailure` when it is not.

2. recordChoice with complete pregen (no moveStoryForward queued)

- After adopting a pregen story, the server broadcasts the new story.
- Then it runs the exact same unified image flow described above.

Image outcome operations

- `attachImageToStory` and `recordImageFailure` load the latest story, apply the outcome (`applyImageOutcome`: add the image with id, description, source=story; or add the id to `StoryState.failedImageIds`), store, and broadcast.
- They never fail the queue: errors are logged, not rethrown, so image bookkeeping never shows an error message in the reader.
- Every store in `GameQueueProcessor.updateAndBroadcastStory` first merges the latest stored story's images and failed ids into the story being stored (`mergeImageRecords`). An operation working from an older copy, or an adopted pregeneration, therefore cannot drop an outcome that landed meanwhile. Pregens are also merged when stored.

Storage and URLs

- Images are written to: `/images/stories/:storyId/(subDir/)?imageId.jpeg`.
- Clients render placeholders until the image is available at its deterministic URL. The reader (`StoryImage`) shows a spinner for any URL that fails to load and cannot tell "not written yet" from "failed". That is why the server records failures: `createImageFromPlaceholder` returns no image for a story image in `failedImageIds` (beat text, interludes), and the sidebar hides a failed portrait (`isFailedStoryImage`). The beat text stays; only the image slot disappears, with no error text.

Notes

- Pregeneration never generates images; only real progression paths trigger generation.
- Character images (during selection) and the custom-story cover follow the same background pattern (`attachToLibrary: false`): they are not inserted into the story's image library, but a failure is recorded (ids `player1_0` and so on, and `cover`).

Models and settings

- Two env vars pick the model (`server/src/config.ts`). An env var set on the host (Render) overrides the code default:
  - `IMAGE_GENERATION_MODEL` (default `gpt-image-2.5-flare`) drives the in-game flows: beat illustrations, custom-story cover, custom-story player portraits.
  - `IMAGE_GENERATION_TEMPLATE_MODEL` (default `gpt-image-2.5-sunburst`) drives the template editor: element images, player identity portraits, template cover. It does not follow `IMAGE_GENERATION_MODEL`: overriding only one leaves the other flows on their default, so a rollback by env var must set both.
- Current defaults come from the owner's blind rating of the 2026-09-24 eval (see "Evaluating image models"). Change them only on new evidence of the same kind:
  - Beats: Flare, medium, 1024x1024. Square is the owner's pick over Flare high landscape, not a cost choice: on 2.5, landscape and portrait use fewer output tokens than square.
  - Custom-story cover and player portrait: Flare, high, 1024x1536.
  - Template cover: Sunburst, xhigh, 1024x1536 (then shrunk). Template player portraits: Sunburst, high. Template element images: Sunburst, medium, size `auto`.
  - gpt-image-1.5 shuts down 2026-12-01, so pointing an env var back at it is a stopgap only. `gpt-image-2` is the named fallback and was not tested in the eval.
- Quality per flow comes from the `IMAGE_GENERATION_*_QUALITY` constants in `config.ts` (no env override). Beats use `BEAT`; the custom-story cover and player portrait pass `STORY_COVER` / `STORY_PLAYER` through `ImageRequest.imageQuality`; the template routes use `TEMPLATE_*` when the client sends no quality.
- `xhigh` and `max` exist only on `gpt-image-2.5*`. On any other model `requestImage` sends `high` and logs a warning, so a quality constant changed out of step with the model never turns into silent failures. For the code defaults the pairing is pinned by `server/tests/unit/images/imageGenerationDefaults.test.ts`: a default model that would downgrade its flow's default quality fails the suite.
- Request rules live in `server/src/images/openaiImageClient.ts`: edit when at least one reference image loaded, otherwise generate (a request whose references are all missing falls back to generate); at most 16 references per edit; `input_fidelity` is never sent; jpeg, compression 75, n=1. Moderation is `low`, except `auto` for in-game images of read-with-kids stories. Every prompt gets the prohibited-content rules appended. The safeguards are in `.context/content-safety.md`.
- Errors: `error.type === "image_generation_user_error"` (GPT Image 2.5) is classified CONTENT_POLICY or COPYRIGHT with `retryable: false`, because the unchanged request fails again. The app itself never retries; the OpenAI SDK retries only 408/409/429/5xx.
- Prompt wording lives in `server/src/images/imagePrompts.ts`. The eval builds its prompts with the same functions, so a wording change also changes what the eval measures.
- Template covers are generated at 1024x1536 and stored exactly as the API returns them. They are never resized or re-encoded: any re-encode invalidates OpenAI's C2PA content credentials, which the AI Act marking duty relies on (`.context/ai-transparency.md`). The trade-off is page weight: about 200 to 270 KB per cover, against about 50 KB for the old 512x768 copy. Covers stored before 2026-09-25 were shrunk to 512x768 and lost their credentials. The one-off `npm run backfill:cover-dst` (dry run by default, `-- --write` to apply) adds an unsigned IPTC `DigitalSourceType` to those covers without re-encoding them. It skips any cover that still carries credentials.
- Probe of 2026-09-24 (low quality, Flare and Sunburst): size `auto` is accepted on generate and on edit with references, and jpeg with `output_compression` is accepted, so no size or format fallback exists in `requestImage`. `auto` on 2.5 picks non-standard sizes (1254x1254 and 1312x1199 on generate, 1536x1024 on edit), unlike 1.5's three fixed sizes; template element images, which send `auto`, now come back in such sizes (the editor and reader display them fine; `auto` may cost more than 1024x1024). Two reference images cost 3,072 input image tokens on 2.5. The usage object reports no cached input tokens. Latency was 10 to 16 s at low quality.

Evaluating image models

- Harness: `server/src/evals/imageModelEval/`, run from `server/` (it finds `data/` and `server/.env` relative to the working directory):
  - `npm run eval:images` (dry run, the default): case list, arms per item, call count, estimated spend and duration. No API calls.
  - `npm run eval:images -- --probe --max-spend 0.5`: which request parameters GPT Image 2.5 accepts (size `auto` on generate and edit, jpeg with compression, png fallback, xhigh on 1.5). Raw SDK calls; checks that would pass the cap are skipped.
  - `npm run eval:images -- --run --max-spend 8`: the replay. Refuses to start if the estimate exceeds the cap, stops scheduling when the next call would, and resumes from `calls.jsonl` without repeating finished calls.
- What it replays: stored beat `imageRequest`s from `data/stories/*/story.json` and `pregeneration_*.json` (12 items plus 3 reserves, round-robin across templates, near-duplicate reference sets deferred), plus 2 custom-story covers, 1 custom-story portrait, 1 template cover and 1 template portrait. Prompts come from `imagePrompts.ts` and requests from `requestImage`, exactly as in production. It reads files only; no database, queue or route module is imported.
- Arms: `gpt-image-1.5` baseline at the pre-switch production quality against Flare/Sunburst at medium/high (xhigh for the template cover), plus a 1536x1024 Flare arm for beats. Each item has 2 to 4 options. The arms are hard-coded in `arms.ts`, not read from `config.ts`, and the baseline model stops existing on 2026-12-01; a rerun needs new arms.
- Output (gitignored, never committed): `DOCS/2026-09-24_gpt6-eval/` with `rating-sets.json` (the owner's blind rating file), `rating-key.json` (which label is which arm), `results.md` (per-arm failures, latency, tokens, $ per image and per story, automated gates), `calls.jsonl`, `probe.json` and `images/`.
- Blindness: any rater-visible text matching `LEAK_PATTERN` (`blinding.ts`: model names, "flare", "sora") drops the case at selection, and the rating file is only written if nothing in it matches. The API embeds C2PA content credentials naming the model (e.g. "gpt-image-1.5") in each JPEG's APP11 segments; the eval strips them losslessly from every rated image and reference copy (`stripContentCredentials`). The stripper is eval-only: removing the marks from images people see would break the AI Act's marking duty. The server's ESLint config rejects any import of `src/evals/` from other source files. The eval stores every image as the API returned it, the template cover included, which is what users see. The baseline's label is balanced across each set; the other options are ordered by hash.
- Pacing and cost: at most 5 request starts per rolling minute (Tier 1), shared across the baseline and candidate phases, and 3 in flight; only rate limits and transient failures are retried (twice, 30 s then 60 s). Cost comes from reported usage; estimates assume 1,600 input tokens per reference image for every model.
- Measured on 2026-09-24 (the first full run): a stored reference image costs about 1,536 input image tokens on 2.5 but about 323 on 1.5, so on the beat path, which sends 2 to 4 references, 2.5's cheaper output is partly eaten by reference input. Results, spend and the owner's rating files are in `DOCS/2026-09-24_gpt6-eval/results.md`.
- The owner's rating principles, which a new eval or default change should apply: for this app, cost per image and generation speed come first, as long as the image meets a minimum quality bar. Wrong defining character details (a missing prosthetic arm, an implant on the wrong side, a lost eye colour) count heavily against an image.
- Found in the 2026-09-24 blind rating, not fixed yet:
  - Portrait prompts produce busy scenes in which the face is small, so the portrait is a weak identity reference for the later images that send it as a reference. (The custom-story portrait goes through the scene prompt `getImagePrompt`; the template portrait uses `getTemplatePlayerPortraitPrompt`.)
  - A library image used as a reference contains the typo "ANGRO", and new images that receive it copy the typo.
