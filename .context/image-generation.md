Title: Non-blocking Image Generation (Current Implementation)

Context

- Broadcast new story states immediately; generate images in background; clients show placeholders until images arrive.
- Image generation never mutates story state directly; it writes files and uses a lightweight queue operation to attach results.

Current server implementation

- Latest-beat requests only: After any progression (generated or pregen-adopted), the server collects image requests from the latest beat for each player and filters out requests whose `id` already exists in the story image library.
- Parallel generation: For each collected request, the server generates the image in the background (`AIImageGenerator.generateBeatImage`, no story mutation), then enqueues `attachImageToStory { imageId, caption }` only if the file was written. A failed generation is logged and attaches nothing: a library entry without a file would invite later beats to reuse the id. (`generateImagesForBeats` swallows per-image errors, so it cannot tell the caller what failed.)
- Idempotent attach: If an image with the same id already exists, attach is effectively a no-op at the story state level (client may still fetch by URL).

Server flows that trigger image generation

1. moveStoryForward (real progression)

- Compute the next beats (or adopt a pregen) and immediately broadcast the final story.
- Run the unified image flow:
  - Collect latest-beat image requests for each player.
  - Filter out requests whose `id` already exists in `story.images`.
  - For each remaining request, generate the image and enqueue `attachImageToStory { imageId, caption }` once it is written.

2. recordChoice with complete pregen (no moveStoryForward queued)

- After adopting a pregen story, the server broadcasts the new story.
- Then it runs the exact same unified image flow described above.

Attach image operation

- `attachImageToStory` loads the latest story, adds the image metadata (id, description, source=story), stores, and broadcasts.
- No mirroring into pregenerated files is needed. When pregens are stored/used, the live story image library is merged into them to avoid losing references.

Storage and URLs

- Images are written to: `/images/stories/:storyId/(subDir/)?imageId.jpeg`.
- Clients render placeholders until the image is available at its deterministic URL. The reader (`StoryImage`) shows a spinner for any URL that fails to load and cannot tell "not written yet" from "failed", so an image whose generation failed still spins in the beat that requested it.

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
- Probe of 2026-09-24 (low quality, Flare and Sunburst): size `auto` is accepted on generate and on edit with references, and jpeg with `output_compression` is accepted, so no size or format fallback exists in `requestImage`. `auto` on 2.5 picks non-standard sizes (1254x1254 and 1312x1199 on generate, 1536x1024 on edit), unlike 1.5's three fixed sizes; template element images, which send `auto`, will come back in such sizes after a switch. Two reference images cost 3,072 input image tokens on 2.5. The usage object reports no cached input tokens. Latency was 10 to 16 s at low quality.

Evaluating image models

- Harness: `server/src/evals/imageModelEval/`, run from `server/` (it finds `data/` and `server/.env` relative to the working directory):
  - `npm run eval:images` (dry run, the default): case list, arms per item, call count, estimated spend and duration. No API calls.
  - `npm run eval:images -- --probe --max-spend 0.5`: which request parameters GPT Image 2.5 accepts (size `auto` on generate and edit, jpeg with compression, png fallback, xhigh on 1.5). Raw SDK calls; checks that would pass the cap are skipped.
  - `npm run eval:images -- --run --max-spend 8`: the replay. Refuses to start if the estimate exceeds the cap, stops scheduling when the next call would, and resumes from `calls.jsonl` without repeating finished calls.
- What it replays: stored beat `imageRequest`s from `data/stories/*/story.json` and `pregeneration_*.json` (12 items plus 3 reserves, round-robin across templates, near-duplicate reference sets deferred), plus 2 custom-story covers, 1 custom-story portrait, 1 template cover and 1 template portrait. Prompts come from `imagePrompts.ts` and requests from `requestImage`, exactly as in production. It reads files only; no database, queue or route module is imported.
- Arms: `gpt-image-1.5` baseline at today's quality against Flare/Sunburst at medium/high (xhigh for the template cover), plus a 1536x1024 Flare arm for beats. Each item has 2 to 4 options.
- Output (gitignored, never committed): `DOCS/2026-09-24_gpt6-eval/` with `rating-sets.json` (the owner's blind rating file), `rating-key.json` (which label is which arm), `results.md` (per-arm failures, latency, tokens, $ per image and per story, automated gates), `calls.jsonl`, `probe.json` and `images/`.
- Blindness: any rater-visible text matching `LEAK_PATTERN` (`blinding.ts`: model names, "flare", "sora") drops the case at selection, and the rating file is only written if nothing in it matches. The API embeds C2PA content credentials naming the model (e.g. "gpt-image-1.5") in each JPEG's APP11 segments; the eval strips them losslessly from every rated image and reference copy (`stripContentCredentials`). The baseline's label is balanced across each set; the other options are ordered by hash.
- Pacing and cost: at most 5 request starts per rolling minute (Tier 1), shared across the baseline and candidate phases, and 3 in flight; only rate limits and transient failures are retried (twice, 30 s then 60 s). Cost comes from reported usage; estimates assume 1,600 input tokens per reference image for every model.
- Measured on 2026-09-24 (the first full run): a stored reference image costs about 1,536 input image tokens on 2.5 but about 323 on 1.5, so on the beat path, which sends 2 to 4 references, 2.5's cheaper output is partly eaten by reference input. Results, spend and the owner's rating files are in `DOCS/2026-09-24_gpt6-eval/results.md`.
