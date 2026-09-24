# Image model migration plumbing, Sora removal, and image-model eval harness

- **Date**: 2026-09-24
- **Status**: implemented (Phase 1 build); the paid eval run (step 7) is pending
- **Type**: feature
- **Complexity**: complex

## Outcome (2026-09-24)

- Commits: 4616bdf (A, Sora removal), b8c024d (B, plumbing), 3b62aa7 (D, harness), 219c0df (probe results). No commit for C: history confirmed unchanged, owner question stands.
- The workflow that ran this plan overrode step 7: "Do NOT run the paid eval yet (a dry run / tiny smoke call of at most $0.10)". So the probe ran with a $0.09 cap ($0.085 spent; the gpt-image-1.5 xhigh check was skipped by the cap), and the replay was only dry-run: 68 calls, estimate $4.46 plus up to $0.92 for reserves. To produce the rating files, run from `server/`: `npm run eval:images -- --run --max-spend 8`.
- Probe: size `auto` and jpeg with compression are accepted on 2.5 generate and edit, so no fallback code was added. `auto` returns non-standard sizes on 2.5.
- Deviations: `resizeTemplateCover` lives in `images/templateCover.ts` (importing `AIImageGenerator.ts` builds a singleton that needs the API key); the plan's `deliverable.ts` became `ratingFiles.ts`, `resultsReport.ts` and `deliverable.ts`, plus `itemScheduler.ts` (baselines first, reserves, then candidates) and `outputs.ts` (junk check and storage).

## Before you start

- This is **Phase 1** only. It builds the code, the eval harness, and one small API probe. It does **not** change a production model default. `IMAGE_GENERATION_MODEL` stays `gpt-image-1.5`. Every new env var defaults to today's behaviour. The text models (gpt-4.1 / gpt-4.1-mini) and the content filter are not touched.
- First run `git -C chosenpath pull --ff-only` from `D:/projects`. The planner had no shell, so this has not been done. The only file written so far is this plan, which is new and untracked.
- Commit to `main` locally with an explicit pathspec only. New (untracked) files need `git add <explicit paths>` first, because `git commit -- <path>` rejects paths git doesn't know yet. Then run `git commit -m "…" -- <every path>`. Never use `git add -A` or `git commit -a`. Never commit anything under `DOCS/`. If another run left a `DOCS/` line in `.gitignore`, leave it alone. Never push or deploy, and don't touch Render. End every commit message with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Never read `.env` files. Running `npm run eval:images` is fine; it loads `server/.env` through dotenv like the app does. The harness reads only JSON and image files under `data/` and never touches a database.
- API spend cap for this project: **$15**. Phase 1 ends where the owner's blind rating starts, so this run **does** execute the eval and produce the rating files, not only the harness. Spend: the probe (about $0.06) plus the replay (about $4.70 worst case, hard stop `--max-spend 8`; see "Eval run"). Probe plus run must stay under $15; the harness logs actual usage for both.
- `OPENAI_API_KEY` reaches the harness through `server/src/config.ts`, which calls `dotenv.config()` on import. That resolves `.env` relative to the working directory, so every `npm run eval:images` runs from `server/`. If the key is missing, `run.ts` aborts with a message naming the variable, never its value.
- The relayed request about gpt-5.2, story selection, a newsletter, a podcast and a dropped 10th article is about a different project. chosenpath has no gpt-5.x call and no article batching. `server/src/newsletter` is an email-subscription feature with no AI in it. Nothing in this plan depends on that request.

## Problem

Every image flow defaults to `gpt-image-1.5`, which shuts down on 2026-12-01. The code can't select a different model per flow. It can't send GPT Image 2.5's new qualities (`xhigh`, `max`). It ignores the per-flow quality constants that `config.ts` already declares, and it has no way to measure whether 2.5 keeps characters consistent. That consistency is the core requirement for beat images. Separately, the uncommitted Sora video WIP calls an API that shut down today, and a missing `()` in `BeatPromptService.ts:286` makes a prompt condition always true.

## Approach

The work lands in four parts, committed in this order: A, C, B, D.

**A. Sora removal (commit 1, the cleaned WIP).** Delete the Sora-specific code:
- every `/v1/videos` call and the Sora job lifecycle (status, download, remix, delete)
- the `sora-2` constants and types, and Sora's sizes and durations
- `.context/openai-sora-documentation.md`

Keep the provider-neutral plumbing: serving routes, storage helpers, neutral video types, the `templates_videos` permission and the route mount. `POST /videos/generate` checks auth and permission, then returns **501** with a clear message. It never reads the unvalidated `imageReference` body field. `AIVideoGenerator.ts` stays as the generator's place and carries the comment the owner asked for. This commit also includes the unrelated WIP wording change in `core/types/image.ts` and the one-line WIP backlog entry in `development.md`, which review found coherent.

**C. `!story.isBasedOnTemplate` (commit 2 only if fixed).** From code context, the intent is **ambiguous**:
- **What the code literally says.** Adding the parentheses as written would give the "request generic element images first" instruction to *template stories only*.
- **What the rest of the code assumes.** `Story.hasImages()` ("assumes that templates always have at least a few default images") and `GameQueueProcessor.ts:304` both treat custom stories as the ones that start without element pictures.
- **Why neither reading wins.** The instruction is self-conditional ("If a generic image … is not yet available"). It helps custom stories, and template stories whose elements lack pictures (`development.md` lists partial template images as a known gap).

**Git history, checked during review: it does not settle it.** `git log -S isBasedOnTemplate` on the file lists only b389d62 (2025-04-29) and 527ee37 (2025-05-21). The line was **introduced without parentheses** in 527ee37 and has not changed since, so rule (a) below cannot apply. Rule (b) is not met either:
- 527ee37's message ("Image handling for premise-based stories … conditional prompts") describes the whole commit, not this line, and it leans toward custom stories.
- The ternary's branch order (`!x ? "" : instruction`) points the other way, to template stories.
- The same commit added a sibling condition written the natural way (`!story.hasImages() ? instruction : ""`), so the inverted order may have been deliberate, or not.

Outcome: **leave the code unchanged** and report the owner question below. The implementer only re-runs the two `git log` commands to confirm nothing changed after the pull.

**B. Image migration plumbing (commit 3).** This part extracts the two seams that this task strains and that the eval reuses. It leaves the flows, storage and resize logic in `AIImageGenerator`:

1. **`openaiImageClient.ts` (new).**
   - **What it does.** Sends one Images API request and returns the bytes plus usage.
   - **Rules it owns.** Generate vs edit is picked by the number of *loaded* references. References are capped at 16. `input_fidelity` is never sent. `xhigh`/`max` are passed through for `gpt-image-2.5*` and downgraded to `high`, with a warning, on older models.
   - **Probe fallbacks.** The size and format fallbacks from the probe (part D) also live here.
   - **Errors.** It holds the moved error analyzer, which now maps `error.type === "image_generation_user_error"` to a user-correctable error with `retryable: false`.
2. **`imagePrompts.ts` (new).** The prompt builders move here verbatim, with no wording changes, so the eval measures today's prompts.
3. **Per-flow model.** A new `IMAGE_GENERATION_TEMPLATE_MODEL` drives the template editor and defaults to `IMAGE_GENERATION_MODEL`. `IMAGE_GENERATION_MODEL` keeps driving the in-game flows: beats, story cover and story player portrait.
4. **Per-flow quality.** The story-cover and story-player quality constants get wired in through a new optional `ImageRequest.imageQuality`. This follows the existing `imageSize`/`subDir` pattern.
5. **New qualities.** `IMAGE_QUALITIES` gains `xhigh` and `max`. The route validation and the core `ImageQuality` type pick them up automatically. The client needs no change, because no UI chooses quality today.

**D. Eval harness (commit 4, plus commit 5 for the probe results), then the eval run itself (not committed).** This is a CLI under `server/src/evals/imageModelEval/`, run with `npm run eval:images`. It has three modes:
- `--probe`: a tiny API capability check. It runs during implementation, because B's fallbacks depend on it.
- `--dry-run` (the default): case list, call plan and cost estimate, with no API calls.
- `--run --max-spend <usd>`: the replay, paced to 5 images/min, with a hard spend stop and resume.

The replay reads stored beat `imageRequest`s from `data/stories/*/story.json` and `pregeneration_*.json`, plus cover prompts and character identities from custom stories and templates. It builds prompts with the app's builders and calls the new client with each arm's model, quality and size. It writes only into `DOCS/2026-09-24_gpt6-eval/`: `results.md`, `rating-sets.json`, `rating-key.json`, `images/`, `images/refs/`, `calls.jsonl` and `probe.json`.

**Alternatives considered (B/D structure).**
- **Minimal: widen `AIImageGenerator`'s public API** (make `generateImage` public and return usage, make the prompt builders and analyzer public, and have the harness instantiate the generator). Rejected. It grows the public surface of a class that already mixes seven concerns (errors, prompts, API call, reference loading, saving, resize, beat orchestration). It also couples the eval to flow internals. Every B change lands on the API-call seam anyway.
- **Strongest: split `AIImageGenerator` fully** (storage, resize and flows too). Rejected as scope creep. Storage and the flows are untouched by this task.
- **Chosen: extract the API-call seam and the prompt seam.** Both have two callers today (the app and the eval). The analyzer moves with the API call because interpreting the API's errors is part of the API contract. `ImageGenerationError` stays in `AIImageGenerator.ts`, so `imageGenerationRoutes.ts` keeps its import.

## Decisions

### DECISION: Remove the Sora video generator and answer video generation with HTTP 501
- **Affects**: provider, architecture
- **Chosen**: Delete every call to OpenAI's Videos API, the Sora job-lifecycle routes (status, download, remix, delete) and the Sora constants, sizes and durations.
   Keep the neutral video serving routes, the storage helpers, the neutral types and the `templates_videos` permission.
   `POST /videos/generate` checks auth and permission, then returns 501 "video generation is not available".
   `AIVideoGenerator.ts` carries a comment that Sora was retired on 2026-09-24 and that a new generator belongs there.
- **Alternatives**: Keep the four lifecycle routes as 501 stubs. That guesses the next provider's job model, and remix and delete-from-provider-storage only exist on Sora.
   Park the whole WIP on a branch. The owner asked for deletion, and the WIP was never committed, so a branch would only preserve dead code.
- **Why**: OpenAI shut down the Videos API, sora-2 and sora-2-pro on 2026-09-24 with no replacement. The client never exposed video. The 501 path also stops reading the unvalidated `imageReference` body field.

### DECISION: Select the template-editor image model separately from the in-game image model
- **Affects**: model, operations
- **Chosen**: New env var `IMAGE_GENERATION_TEMPLATE_MODEL` drives the three template-editor flows (element, player portrait and cover images) and defaults to `IMAGE_GENERATION_MODEL`.
   `IMAGE_GENERATION_MODEL` keeps driving beats, the custom-story cover and the custom-story player portraits. Its default stays `gpt-image-1.5` in this phase.
- **Alternatives**: One model for all flows. That blocks the leading option: Flare for fast background beat images, Sunburst for manual, quality-first editor images.
   A model parameter on each HTTP request. That lets clients pick a paid model, and the client has no model UI anyway.
- **Why**: The assessment's targets differ per flow. Leaving the new variable unset reproduces today's behaviour exactly, so Phase 2 can flip each flow by env after the owner's ratings.

### DECISION: Downgrade xhigh and max to high on image models that don't support them
- **Affects**: model
- **Chosen**: The Images API client sends `xhigh`/`max` only to `gpt-image-2.5*` models. On any other model it sends `high` and logs a warning.
- **Alternatives**: Reject with HTTP 400 in the template routes. That puts model knowledge in the routes and doesn't protect the fire-and-forget in-game flows.
   Let the API reject it. In-game flows then fail silently as placeholders.
- **Why**: `xhigh`/`max` only exist on GPT Image 2.5. A quality constant or env model changed out of step with the other must not turn into silent image failures.

### DECISION: Move the OpenAI Images API call and the image prompt builders out of AIImageGenerator
- **Affects**: architecture
- **Chosen**: New `server/src/images/openaiImageClient.ts` owns the request rules, reference loading, the 16-reference cap, usage reporting and error classification.
   New `server/src/images/imagePrompts.ts` owns the per-flow prompt text.
   `AIImageGenerator` keeps the flows, file storage, cover resize and `ImageGenerationError`.
- **Alternatives**: Make more of `AIImageGenerator` public so the eval can call it. That widens a seven-concern class and ties the eval to flow internals.
   Split every concern out now. Scope creep; storage and the flows don't change in this task.
- **Why**: Every migration change lands on the API-call seam, and the eval must call exactly the production request and prompt code with other models, without saving into story or template folders.

### DECISION: Keep the image-model eval harness in the server source tree, replaying local data only
- **Affects**: architecture, operations
- **Chosen**: `server/src/evals/imageModelEval/`, run with `npm run eval:images` via tsx from `server/`.
   It is type-checked and linted by `npm run check:all`. It compiles into `dist/` but nothing imports it.
   It reads `data/stories` and `data/templates` as files. It never imports DB, repository or queue modules, and it writes only to the eval folder under `DOCS/`.
- **Alternatives**: `server/scripts/` outside the build. ESLint would still lint it (`files: **/*.{ts,js}`), but `tsc --noEmit` only covers `src/**`, so it would need its own tsconfig to get type-checked.
- **Why**: Type safety and unit tests come for free with no build changes. The harness is reusable for Phase 2 and for any later model deprecation.

## Changes

### Part A: Sora removal (commit 1)

| File | Change |
|------|--------|
| `server/src/videos/AIVideoGenerator.ts` (untracked WIP) | Reduce to a provider-neutral shell. At the top, a comment: *"Sora was retired on 2026-09-24 (OpenAI shut down the Videos API, sora-2 and sora-2-pro with no replacement), so the Sora generator was removed. To test video features, implement a new video generator here. Storage, serving (videoRoutes GET), types (core/types/video.ts) and the templates_videos permission are provider-neutral and stay."* Export `VIDEO_GENERATION_UNAVAILABLE_MESSAGE` (plain text, same meaning). Keep `saveVideoToTemplate` and `saveVideoToStory` (storage). Delete the OpenAI client and API-key check, `createVideoJob`, `remixVideo`, `getVideoStatus`, `downloadVideoContent`, `deleteVideo`, `pollAndDownloadVideo`, `generateCoverVideoForTemplate`, `getVideoPrompt`, and every Sora constant (model, size, duration, poll). |
| `server/src/videos/videoRoutes.ts` (untracked) | Keep the GET `/templates/:templateId/:path(*)` and `/stories/:storyId/:path(*)` serving routes, `/test`, and the catch-all. `POST /generate` keeps `verifyUser()` and `canGenerateVideos()`, then calls `sendError(res, VIDEO_GENERATION_UNAVAILABLE_MESSAGE, 501, req.body.requestId)` and reads nothing else from the body. Delete `/status/:videoJobId`, `/download/:videoJobId`, `/remix/:videoJobId` and `DELETE /:videoJobId`. Remove the imports that are now unused. |
| `server/src/media/mediaUtils.ts` (untracked) | Keep `saveMediaToFile` and `MediaSource`. Delete `analyzeMediaGenerationError`, `MediaGenerationError`, `MediaGenerationErrorInfo` and `loadImageReference(s)`. Only the Sora generator used them, they duplicate the image code, and their only additions were Sora rejection strings. |
| `core/types/video.ts` (untracked) | Delete `VIDEO_MODELS`/`VideoModel`, `VIDEO_SIZES`/`VideoSize`, `VIDEO_DURATIONS`/`VideoDuration` and `VideoJob`. Remove `seconds` and `size` from `videoRequestSchema` and `model` from `VideoRequest` (Sora-only options). Reword the "from OpenAI API" and "OpenAI video job ID" comments to be provider-neutral. Keep `videoSourceSchema`, `VideoStatus`, `VideoUI`, `VideoStoryState`, `VideoLibrary`, `videoRequestSchema`, `VideoRequest` and `VideoGenerationErrorInfo`. |
| `core/types/index.ts`, `server/src/routes.ts`, `server/src/shared/db.ts`, `server/src/users/authMiddleware.ts`, `server/src/shared/storageUtils.ts` (modified WIP) | Keep as they are: the `video.js` export, the `/videos` mount, the `templates_videos` role permission, `canGenerateVideos` and `getStoryVideosDirectoryPath`. Read each `git diff` first. If any hunk is Sora-specific beyond these, remove it. |
| `core/types/image.ts` (modified WIP) | Keep the wording change ("visual novel" → "interactive story"). Commit it here, **before** part B edits this file. |
| `development.md` (modified WIP) | **Include it.** Checked in review: the diff adds one coherent backlog line under `# NEXT` ("4: in pre-defined worlds, stories can have their first beat for each identity/background combination pre-defined…"). Re-check with `git diff development.md` after the pull. |
| `.context/openai-sora-documentation.md` | Delete with `git rm`. |
| `.context/api.md` | Rewrite "Video Endpoints (in development)". Document GET template video, GET story video, and `POST /videos/generate` (auth plus `templates_videos`; always returns 501 with the message). Add one line: Sora was retired on 2026-09-24 and no video generator is implemented. |

### Part C: BeatPromptService (commit 2, only if fixed)

| File | Change |
|------|--------|
| `server/src/game/services/prompts/BeatPromptService.ts` | **No change** (history checked in review; see part C above). Confirm after the pull with `git -C chosenpath log -S isBasedOnTemplate --date=short --format="%h %ad %s" -- server/src/game/services/prompts/BeatPromptService.ts` (expect only b389d62 and 527ee37) and `git -C chosenpath show 527ee37 -- server/src/game/services/prompts/BeatPromptService.ts`. The rule for a fix is (a) an earlier committed version had the parentheses and a later commit dropped them, or (b) a comment or commit message names the story type *for this line*. Neither holds today. If a newer commit changes that, apply the rule; otherwise report the owner question. No commit 2. |

### Part B: image migration plumbing (commit 3)

| File | Change |
|------|--------|
| `server/src/images/openaiImageClient.ts` (new) | *Responsibility:* Send one OpenAI Images API request under per-model rules and return the image bytes with usage. Also turn stored image references into upload files, and classify the API's errors. *Exports:* `requestImage`, `loadReferenceImages`, `analyzeImageGenerationError`, `MAX_REFERENCE_IMAGES` (16), and the `ImageApiRequest`/`ImageApiResult` types. See the details below this table. |
| `server/src/images/imagePrompts.ts` (new) | *Responsibility:* Compose the text prompt sent to the image model for each flow. *Exports:* `getImagePrompt(description, instructions?)` (moved method), `getTemplatePlayerPortraitPrompt(appearance, instructions?)` and `getTemplateCoverPrompt(coverPrompt, instructions?)` (both extracted from inline code in the template methods), and `getStoryPlayerPortraitDescription(identity)`, which is the `"Pronouns: x/y\n<appearance>"` body extracted from `GameQueueProcessor`. The style-block helper stays private. The strings move **verbatim**: the eval must measure today's prompts, so no wording changes. |
| `server/src/images/AIImageGenerator.ts` | `generateImage(prompt, references, size, quality, model)`: load references (`loadReferenceImages`), call `requestImage(this.openai, …)`, and log one line with model, effective quality, size and usage tokens. Errors are wrapped exactly as today (`analyzeImageGenerationError` → `ImageGenerationError`). Keep the defaults `quality || LOW` and `size || AUTO`. The template methods pass `IMAGE_GENERATION_TEMPLATE_MODEL` and use the `imagePrompts` builders. `generateImagesForBeats` passes `IMAGE_GENERATION_MODEL` and `imageRequest.imageQuality \|\| IMAGE_GENERATION_BEAT_QUALITY`. Delete the moved analyzer, loader and prompt methods. `resizeCoverImage` becomes an exported module function `resizeTemplateCover` (the harness reuses it), and its comment is fixed to say the output is 512x768, not 683x1024. `ImageGenerationError` stays here. |
| `server/src/config.ts` | Add `IMAGE_GENERATION_TEMPLATE_MODEL = process.env.IMAGE_GENERATION_TEMPLATE_MODEL \|\| IMAGE_GENERATION_MODEL`. Add comments naming which flows each model drives. Remove the unused `IMAGE_GENERATION_STORY_ELEMENT_QUALITY`, which no flow uses. No default changes. |
| `core/types/image.ts` | `IMAGE_QUALITIES` gains `XHIGH: "xhigh"` and `MAX: "max"`. `ImageRequest` gains `imageQuality?: ImageQuality`, next to `imageSize`. |
| `server/src/stories/StoryCreationService.ts` | Cover `ImageRequest` gets `imageQuality: IMAGE_GENERATION_STORY_COVER_QUALITY` (still medium, so no behaviour change). |
| `server/src/game/services/GameQueueProcessor.ts` | Portrait `ImageRequest` gets `imageQuality: IMAGE_GENERATION_STORY_PLAYER_QUALITY` (still medium). Its `prompt` comes from `getStoryPlayerPortraitDescription(selectedIdentity)`, which produces the same string. |
| `server/src/images/imageGenerationRoutes.ts` | No code change expected. `validateImageQuality` reads `IMAGE_QUALITIES`, so it accepts `xhigh`/`max` and lists them in its error text. Verify. `mapTemplateReferences` keeps its cap of 2. |
| client | No change. No UI chooses quality or size (`CoverImageEditor`, `StoryElementEditor` and `PlayerIdentityEditor` never pass them), and `ImageQuality` widens through `core`. |
| `.context/image-generation.md` | Add a "Models and settings" section: which env var drives which flow, their defaults, the per-flow quality constants, the 2.5 qualities and downgrade rule, the 16-reference cap, user-error handling, and the probe results (whether `auto`, jpeg and compression are accepted and whether a fallback is active). Add an "Evaluating image models" section: commands, output folder and spend flags. |
| `CLAUDE.md` | Change the `image-generation.md` pointer to "Image generation flows, models/settings, and the image-model eval harness". |

**`requestImage(client: Pick<OpenAI, "images">, req)` details.** `req` is `{ prompt, model, quality, size, images?: Uploadable[] }`.
- **Parameters.** It sends exactly `model`, `prompt`, `moderation: "low"`, `n: 1`, `quality`, `output_format: "jpeg"`, `output_compression: IMAGE_GENERATION_OUTPUT_COMPRESSION`, `size`, and `image` on edits only. It never sends `input_fidelity`.
- **References.**
  - More than 16 images are cut to 16, with a warning.
  - Zero loaded images means `images.generate`, even if references were requested.
  - Today, if every requested reference is missing, the code calls edit with an empty array and fails. This fixes that edge case.
- **Return value.** It returns `{ buffer, usage?: { inputTextTokens, inputImageTokens, outputTokens }, model, quality, size, imagesSent }`, where `quality` and `size` are the effective values.
- **Errors and types.** Raw SDK errors propagate, so the harness sees `status`, `code` and `type`. Keep the existing parameter-cast pattern (`as ImageGenerateParams` / `as ImageEditParams`). No `as unknown as`, and no SDK upgrade.

**Probe-dependent code, added in commit 5 after running `--probe`:**
- **Size `auto`.** If the probe shows `gpt-image-2.5*` rejects `size: "auto"`, `requestImage` maps `auto` to `1024x1024` for those models. Today, template element images send `auto`, because the client never passes a size. If `auto` is accepted, add no code and just record the result.
- **jpeg and compression.** If `output_compression` is rejected but jpeg is accepted, omit it for 2.5 and recompress to JPEG with sharp at `IMAGE_GENERATION_OUTPUT_COMPRESSION`. If jpeg itself is rejected, request png and transcode to JPEG with sharp. Callers always receive JPEG bytes, because storage is `.jpeg` everywhere. If both are accepted, add no code.

**`analyzeImageGenerationError` changes (moved as-is, plus one rule).** Also read `error.type`. If it is `"image_generation_user_error"`, treat it as content-policy-family:
- It becomes COPYRIGHT if the copyright heuristic matches, otherwise CONTENT_POLICY.
- It sets `retryable: false` and gives guidance to change the description or reference images, because sending the same request again will fail again.

The app has no automatic retry. The OpenAI SDK retries only 408/409/429/5xx, so these 400s are never resent. The harness's retry policy excludes them explicitly.

### Part D: eval harness (commit 4) and probe results (commit 5)

All harness files live in `server/src/evals/imageModelEval/`. The harness imports only the images modules, `core` models and types, `server/config`, `shared/storageUtils` and `shared/logger`. It must never import `shared/db`, `StoryRepository`, queue or route modules.

**Leak pattern** (shared by case selection and the validator): `/gpt[-_ ]?\d|gpt-image|chatgpt|dall-?e|\bflare\b|sunburst|\bsora\b|image-[12]/i`. A bare `gpt` is not used, because it matches "Egypt" and "Egyptian" and would silently drop any Egypt-set story. Template `e0bc82a0` has an NPC called "Sora", and style notes can mention "lens flare". Any case whose rater-visible text matches is skipped at selection time, so the final file validates cleanly and the rater isn't primed. Rater-visible text means the prompt or cover text, the style notes, and the reference element or identity names.

| File | Change |
|------|--------|
| `cases.ts` (new) | *Responsibility:* Read local story and template files (read-only) and build the eval cases with the app's prompt builders. *Exports:* `loadBeatCandidates`, `selectBeatCases`, `buildCoverPortraitCases`, `EvalCase`. `selectBeatCases` is pure and receives a `fileExists` predicate, so it can be tested. The selection and context rules are below this table. |
| `arms.ts` (new) | *Responsibility:* Define the arms and what each call should cost. *Exports:* `BEAT_BASELINE`, `beatArmsForItem(index)`, `coverPortraitArms(kind)`, `estimateCallCost(arm, promptChars, refCount)` and `costFromUsage(model, usage)`. Prices in USD per 1M tokens: gpt-image-1.5 is text in 5, image in 8, image out 32; gpt-image-2.5-flare and gpt-image-2.5-sunburst are 5, 8 and 30. Cached input is 1.25 (text) and 2 (image) on both; the eval re-sends the same reference images, so if `usage.input_tokens_details` reports cached tokens, bill them at the cached rate, and otherwise bill everything at the full rate (conservative). Output-token table from the brief (see "Arms and cost" below). Estimated input is `ceil(chars/4)` text tokens plus a conservative 1,500 image tokens per reference. |
| `runner.ts` (new) | *Responsibility:* Execute the planned calls safely and record every attempt. *Exports:* `runCalls`, `shouldRetry`, `CallRecord`. It receives the call function, clock and sleep as parameters, so it can be tested. The execution rules are below this table. |
| `probe.ts` (new) | *Responsibility:* Check which request parameters GPT Image 2.5 accepts, using raw SDK calls so none of the client's own fallbacks run. *Exports:* `runProbe`. For both `gpt-image-2.5-flare` and `gpt-image-2.5-sunburst`, all at quality `low` with moderation `low`: (1) generate at size `auto`, jpeg, compression 75; (2) generate at 1024x1024, jpeg, compression 75; (3) edit with 2 local template reference images at size `auto`, jpeg, compression 75, which is exactly what the template element flow sends when references are picked; (3b) only if (3) failed: the same edit at 1024x1024, to tell a size rejection from an edit rejection; (4) only if (2) failed: generate at 1024x1024, png, no compression. Also (5) `gpt-image-1.5` at quality `xhigh`, which is expected to be a 400 and costs nothing if rejected. It prints the estimate first (about $0.06), then writes `probe.json`: accepted or rejected per check, the error text, usage and cost. |
| `deliverable.ts` (new) | *Responsibility:* Turn cases and call records into the owner's rating files and the plain-language results. *Exports:* `buildRatingSets`, `buildRatingKey`, `validateRatingSets`, `computeArmMetrics` (with `percentile`) and `writeDeliverable`. The file contents are specified below this table. |
| `run.ts` (new) | CLI entry with `--probe [--max-spend 0.5]`, `--dry-run` (the default, with no API calls), and `--run --max-spend <usd>`, plus an optional `--out <dir>`. The default output folder is `path.resolve(process.cwd(), "..", "DOCS", "2026-09-24_gpt6-eval")`. **Guards:** abort if `NODE_ENV === "production"`; abort if `getStoragePath("stories")` is missing or outside the repo (it must be run from `server/`); abort `--probe`/`--run` if `OPENAI_API_KEY` is unset (name the variable, never print it); abort `--run` if the estimate exceeds `--max-spend`. **Dry run** prints the case list, arms per case, call count, estimated dollars and estimated duration. The SDK client is `new OpenAI({ maxRetries: 0, timeout: 180_000 })`: SDK retries off so the runner counts every attempt, and a 3-minute timeout that matches the editor's `LONG_OPERATION_TIMEOUT`. |
| `server/package.json` | Script `"eval:images": "tsx src/evals/imageModelEval/run.ts"`. |

**`cases.ts`: beat candidates.**
- **Sources.**
  - Every `players[slot].beatHistory[]` entry whose `imageRequest` is an object with a non-empty prompt.
  - Read from `data/stories/*/story.json` and `pregeneration_*.json`, using raw `fs` plus `JSON.parse`.
  - The reference set is `new Story(state)`, `getImageReferenceFromImageId` and `getImageInstructions`.
- **Filters.**
  - Deduplicate by story and request id, preferring `story.json`.
  - Skip a candidate if resolving a reference throws, or if any reference file is missing.
  - Skip it if its rater-visible text matches the leak pattern.
- **Ordering and selection.**
  - Group by template, or by story for custom stories.
  - Within a group, order by: references a player portrait first, then `story.json` before pregeneration files, then story id, then beat order.
  - Within a group, don't take a second case with the same sorted reference set until every distinct reference set in that group has been used once. Pregeneration branches hold near-duplicates (for example `arielle_negotiation` and `arielle_negotiation_council`, or `arielle_public_rally` and `arielle_rallying_public`), and two of them would waste rating items.
  - Pick round-robin across groups: 12 cases plus up to 3 reserves.
- **Local data (checked in review).**
  - `story.json` files hold 10 object `imageRequest`s: 3 in `6edd813c` (template `b7ad0746`, Paris café) and 7 in `7492b211` and `8988006e` (template `e0bc82a0`, Novi Reg).
  - With the pregeneration files, there are 28 unique request ids: 7 for `b7ad0746` and 21 for `e0bc82a0`. `arielle_choosing_path` references the `sora` element, so the leak rule drops it.
  - Every referenced template element file exists, and so do `players/player1_{0,1,2}.jpeg` for both templates.
  - So the round-robin yields about 6 items per template. The pool is enough for 12 plus 3 reserves.
  - There are no custom-story beats and no multiplayer stories. Say so in `results.md`.
- **Prompt.** `getImagePrompt(imageRequest.prompt, story.getImageInstructions())`, exactly as production builds it.

**`cases.ts`: cover and portrait cases (5).** All are 1024x1536. Walk in sorted-id order, skipping any story or template whose rater-visible text matches the leak pattern.
- **Custom-story covers (2).** The first 2 custom stories (no `templateId`) that have `imageInstructions.coverPrompt`. Seven such stories exist locally under `data/stories`. Prompt: `getImagePrompt(coverPrompt, instructions)`.
- **Custom-story player portrait (1).** The next such story, identity 0 of `characterSelectionOptions.player1.possibleCharacterIdentities` (fields `name`, `pronouns`, `appearance`). Prompt: `getImagePrompt(getStoryPlayerPortraitDescription(identity), instructions)`.
- **Template cover (1).** The first template (`data/templates/<id>/template.json`) with a `coverPrompt`, with no references (the editor doesn't store cover references). Prompt: `getTemplateCoverPrompt(coverPrompt, instructions)`.
- **Template player portrait (1).** The next template whose `player1.possibleCharacterIdentities` is non-empty (templates keep identities under `player1`/`player2`/`player3`, not `characterSelectionOptions`). The appearance string is `"<name> (<personal>/<object>): <appearance>"`, which mirrors `useImageGeneration.ts:231-237`; add a comment saying so. Prompt: `getTemplatePlayerPortraitPrompt(…)`.

**`cases.ts`: rater context.** Each case also carries what the rater sees:
- the scene or cover text
- the style notes: visual style, atmosphere, color palette, character style
- the reference files, copied later to `images/refs/ref-<hash8>.jpeg`, with alt text set to the element name or "Player character (<identity name>)"

**`runner.ts`: execution rules.**
- **Pacing.** At most 5 request starts per rolling 60 s (the Tier-1 image limit), and at most 3 in flight. Retries count as starts.
- **Retries.** `shouldRetry` is true only for RATE_LIMIT and TECHNICAL, including timeouts. Up to 2 retries, with a 30 s and then 60 s backoff. It never retries CONTENT_POLICY, COPYRIGHT, `image_generation_user_error` or UNKNOWN.
- **Spend guard.** Before each attempt: if the actual spend so far plus the estimate for that call would exceed `--max-spend`, stop scheduling, let in-flight calls finish, and mark the run partial.
- **Records.** Every attempt appends a `CallRecord` to `calls.jsonl` right away. A record holds case, arm, model, quality, size, start time, latency in ms, status, error code, `type` and HTTP status, attempt number, usage, cost, cost source (`usage` or `estimate`), output file and junk reason.
- **Junk check.** It runs on the raw API bytes, before any resize. Dimensions must match the requested size, and the image is junk if the maximum channel stdev from `sharp().stats()` is below 3 (blank or near-uniform).
- **Saving.** On success, save the JPEG to `images/<itemId>-<hash6(itemId+armKey)>.jpeg`. For the template cover item, save the result of `resizeTemplateCover` for every arm, so the rater sees what users see.
- **Resume.** A case and arm that already has a final record (success, or a failure that isn't retried) and an existing file is skipped. Re-running `--run` rebuilds the deliverable at no cost.
- **Reserves.** If an item's baseline fails, the item is replaced by the next reserve case, if the spend guard allows.

**`deliverable.ts`: the owner's files.**
- **`rating-sets.json`.** Exactly the requested shape:
  - Two sets: `chosenpath-beat-illustrations` (12 items) and `chosenpath-covers-portraits` (5 items). Item ids are `<set id>-01`, `-02` and so on. Every option has `type: "image"` and `src: "images/…"`.
  - **Option order.** Options are sorted by `sha256(itemId + "|" + armKey)` and then labelled A to D. Failed or junk arms are dropped. An item needs the baseline plus at least one candidate, otherwise it is dropped.
  - **Beat context.** `**Scene to illustrate:** …`, then `**Story style notes:** …`, then `**Reference images given to the generator:**` with `![alt](images/refs/…)` for each reference.
  - **Cover and portrait context.** The description plus the style notes. The template cover item also says it's shown at library size (512x768).
  - **Beat instructions.** "Each picture should illustrate the scene above using the reference images shown. Judge whether characters look like their references, whether the style matches the references and style notes, how well it fits the scene, and whether any stray text or captions appear."
  - **Cover and portrait instructions.** "Each picture was generated from the description shown, as a story cover or character portrait. Judge fit to the description and style notes, overall appeal, and whether any stray text appears."
- **`rating-key.json`.** `{ "<item id>": { "A": "gpt-image-1.5@medium", … } }`. Arm keys use `<model>@<quality>`, with `-<size>` appended only when the size differs from the call site's default (for example `gpt-image-2.5-flare@high-1536x1024`).
- **`validateRatingSets`.** A zod shape check: ids match the pattern, 2 to 4 options, labels in order, every `src` file exists. It also rejects any string anywhere in the file that matches the leak pattern.
- **`results.md`.** Plain language, with:
  - **One section per call site:**
    - beat illustrations
    - custom-story cover
    - custom-story player portrait
    - template cover
    - template player portrait
    - template element images (covered by the probe only; they follow the template-model decision)
    - text call sites (not evaluated; the owner keeps gpt-4.1 / gpt-4.1-mini)
    - video (removed; Sora retired)
  - **Per arm:**
    - calls, successes, refusals (CONTENT_POLICY, COPYRIGHT or user error), other errors, junk
    - p50 and p95 latency (with n of 9–12, p95 is effectively the maximum; say so)
    - average input text tokens, image input tokens and output tokens
    - dollars per image
    - dollars per image-enabled single-player story and per 1,000 such stories, and the change against the baseline
  - **Volume assumption.** The code has no usage analytics, and the inventory has no monthly story count, so a per-month figure can't be measured. Say that plainly, give the per-story figure, and add the formula "monthly cost = image-enabled stories per month × per-story cost", with one worked example at an assumed 100 stories a month, labelled as an assumption. Use 12 beat images per story, an upper bound from the partner doc's $0.50/story at gpt-image-1 medium. A custom story adds 1 cover and 1 portrait. Template flows are manual and a few per template, so give per-call cost only.
  - **Agreement with the baseline.** Say plainly that no machine metric measures it for images; the owner's blind rating is that measure.
  - **Automated gates.** These only rule arms out; they never pick a winner. An arm fails if its failures (errors, refusals and junk) exceed the baseline's by more than 1 on that call site. For beats only, it also fails if its p95 latency is above max(30 s, the baseline's p95), because the image must arrive before the player reaches the `[image]` tag.
  - **Decisions and pending ratings.** Automated checks decide no image call site alone; every one of them awaits the owner's rating. Restate the Phase-2 decision rule from the assessment: the cheapest arm that passes the gates and wins or ties the baseline in at least 50% of items on character match and style.
  - **Probe results**, and the fallbacks they activated.
  - **Limitations.** Local data has no custom-story beats and no multiplayer stories. The gpt-image-2 fallback wasn't tested.
  - **Spend.** Total API spend (probe plus run, from actual usage), and the partial-run flag if the run was cut short.

### Arms and cost

Beat items (12, 1024x1024 unless noted). The baseline appears in every item. The candidate order is `[flare@medium, flare@high, sunburst@high, flare@high-1536x1024]`, and item *i* (0-based) omits candidate *i* mod 4. Each item has 4 options, and each candidate appears in 9 items. The omitted arm is not generated. The landscape arm is included because the in-text reader handles landscape images: `StoryImage` gives landscape images a width of `md:w-3/5 lg:w-1/2`. It uses Flare at high because 2.5 landscape at high costs about 22% less than square at high, which is where the shape matters most.

| Arm | Output $/image | Images | Output $ |
|---|---|---|---|
| gpt-image-1.5@medium (baseline, today) | 0.034 | 12 | 0.41 |
| gpt-image-2.5-flare@medium | 0.0132 | 9 | 0.12 |
| gpt-image-2.5-flare@high | 0.0527 | 9 | 0.47 |
| gpt-image-2.5-sunburst@high | 0.0527 | 9 | 0.47 |
| gpt-image-2.5-flare@high-1536x1024 | 0.0412 | 9 | 0.37 |

Cover and portrait items (5, 1024x1536):
- **Custom covers (2) and the custom portrait (1)**, with the same arms as today's in-game flow: 1.5@medium (baseline), flare@medium, flare@high, sunburst@high. That is $0.143 per item.
- **Template cover (1).** 1.5@high (baseline, today), sunburst@high, sunburst@xhigh, flare@high, all resized to 512x768. That is $0.356.
- **Template player portrait (1).** 1.5@medium (baseline), sunburst@medium, sunburst@high, flare@high. That is $0.143.

Estimate: about $1.86 of beat output, plus up to about $1.50 of beat input (the reference-image token count is unmeasured, so the harness logs actual usage), plus about $0.93 for covers and portraits, plus up to about $0.40 for reserves. That comes to about **$4.70 worst case** for 68 images, plus the $0.06 probe. Recommended `--max-spend 8`, well under the $15 cap. Duration is at least 14 minutes at 5 images/min; expect 20–25.

## Tests

The project pattern is Jest ESM under `server/tests/unit/…`, with relative imports and no network. Stub OpenAI clients are plain objects with `images.generate`/`images.edit` as `jest.fn()`. File output goes to `os.tmpdir()`, never to `data/`.

- `server/tests/unit/images/openaiImageClient.test.ts`
  - Calls `generate` when no images are supplied and `edit` (with the `image` array) when images are supplied. An empty images array still means `generate`.
  - With 20 images, exactly 16 are sent.
  - The request keys are exactly the listed set. There is no `input_fidelity`, and `model` is passed through.
  - `xhigh`/`max` are passed through for `gpt-image-2.5-flare`, and downgraded to `high` for `gpt-image-1.5`. The effective quality is returned.
  - Usage is mapped to `{inputTextTokens, inputImageTokens, outputTokens}`. Missing usage gives `usage: undefined`. A missing `b64_json` throws.
  - Only if commit 5 adds them: `auto` becomes `1024x1024` for 2.5, and the png-to-jpeg or recompress path returns JPEG bytes (check with `sharp(buffer).metadata().format`).
  - `analyzeImageGenerationError`:
    - an error object with `type: "image_generation_user_error"` gives CONTENT_POLICY with `retryable: false`
    - the same error with "disney" in the prompt gives COPYRIGHT with `retryable: false`
    - a 429 still gives RATE_LIMIT, as a regression guard for the moved code
- `server/tests/unit/evals/imageModelEval/cases.test.ts` (on `selectBeatCases` with in-memory candidates)
  - Deduplication prefers `story.json`.
  - Candidates with a missing or unresolvable reference are skipped.
  - Candidates whose rater-visible text matches the leak pattern (including "Sora", and "flare" in the style notes) are skipped. A candidate set in "Egypt" is kept.
  - A second candidate with the same reference set is deferred until the group's other reference sets are used.
  - Round-robin across groups.
  - Player-reference candidates come first within a group.
  - Returns 12 plus reserves, or fewer when the pool is small.
- `server/tests/unit/evals/imageModelEval/arms.test.ts`
  - Over 12 items, the baseline is in every item, each candidate in exactly 9, and there are at most 4 arms per item.
  - `costFromUsage` produces correct dollars for 1.5 against 2.5 prices.
- `server/tests/unit/evals/imageModelEval/runner.test.ts` (stub call function, instant sleep)
  - The spend guard stops before an attempt that would exceed the cap.
  - A 429 is retried at most twice.
  - `image_generation_user_error` and CONTENT_POLICY are never retried.
  - Resume skips pairs that already have a final record.
- `server/tests/unit/evals/imageModelEval/deliverable.test.ts`
  - The option order is identical across two builds and differs between at least two items.
  - Key labels match the option labels one-to-one.
  - Failed or junk arms are dropped. An item without a baseline, or with fewer than 2 options, is dropped.
  - `validateRatingSets` rejects a file containing "gpt-image" or "flare", and one with 5 options.
  - `percentile` on known arrays.

No tests for the video 501 route (wiring), the prompt builders (moved verbatim; the wording is static), the config constants or the docs.

## Owner question (part C, only if history doesn't settle it)

When a story generates pictures, the AI that writes each turn gets an extra instruction: *"if a character, place or item has no picture yet, request a plain picture of it first, and use it in bigger scenes later."* A typo means every picture-enabled story gets this instruction today. The line looks as if it was meant for only one kind of story, but the code reads as "template stories only". Custom stories, which start with no pictures at all, are where it helps most.

The history doesn't answer it. The line came in with the typo already there, in your commit of 2025-05-21, "Image handling for premise-based stories … conditional prompts". That title suggests custom stories, but the way the condition is written points to template stories.

The options:
- **(a)** Keep it for all stories. This is today's behaviour and only removes the broken condition. For template elements that already have pictures, it changes nothing.
- **(b)** Custom stories only. Template stories with incomplete element pictures stop getting it.
- **(c)** Template stories only. This is what the code literally says; custom stories stop getting it and may request fewer pictures.

Recommendation: (a).

## Implementation order and commits

1. `git -C chosenpath pull --ff-only`, then `git -C chosenpath status --porcelain`. Confirm the WIP set matches part A's list. Leave any unexpected file untouched and report it.
2. **Part A.** Run `npm run check:all` from the repo root. Then:
   - `git -C chosenpath add server/src/videos/AIVideoGenerator.ts server/src/videos/videoRoutes.ts server/src/media/mediaUtils.ts core/types/video.ts`
   - `git -C chosenpath rm .context/openai-sora-documentation.md`
   - `git -C chosenpath commit -m "Remove Sora video generator; keep neutral video plumbing, generate returns 501" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>" -- server/src/videos/AIVideoGenerator.ts server/src/videos/videoRoutes.ts server/src/media/mediaUtils.ts core/types/video.ts core/types/index.ts core/types/image.ts server/src/routes.ts server/src/shared/db.ts server/src/users/authMiddleware.ts server/src/shared/storageUtils.ts .context/api.md .context/openai-sora-documentation.md development.md`
3. **Part C.** Re-run the two history commands. Expected: no change and no commit, and the owner question goes into the report.
4. **Part B.** Run `npm run check:all`. Commit the B paths and `server/tests/unit/images/openaiImageClient.test.ts`, with `git add` for the new files first.
5. **Part D.** Add the harness and tests. Run `npm run check:all`, then `npm run eval:images -- --dry-run` to verify case selection and the estimate (no spend). Commit the harness, its tests and `server/package.json`.
6. From `server/`, run `npm run eval:images -- --probe --max-spend 0.5`. Apply the probe-dependent code, if any, with tests. Update `.context/image-generation.md` and `CLAUDE.md`. Run `npm run check:all` and commit. `probe.json` stays in `DOCS/` and is not committed.
7. **Eval run (part of this phase; see below).** Produce the rating deliverable and `results.md`. Nothing from it is committed.
8. No Playwright check is needed; nothing on the client changes. No push and no deploy.

## Eval run (implementation step 7)

Phase 1 ends when the owner has the rating files, so this step runs in this phase. From `server/`:
1. Run `npm run eval:images -- --dry-run`. Check that the estimate is at most $8 and that the probe's actual spend plus the estimate stays under $15.
2. Run `npm run eval:images -- --run --max-spend 8`. If the run is interrupted, re-run the same command; it resumes without repeating calls.
3. Check that `validateRatingSets` passed (the run fails loudly if it didn't). Check that `rating-sets.json` has at most 12 beat items and 5 cover/portrait items, each with 2–4 options, and that `images/` holds every referenced file.
4. Report the total actual spend from `calls.jsonl` plus `probe.json`.

The owner then rates `DOCS/2026-09-24_gpt6-eval/rating-sets.json` (17 items). Phase 2, which is not this run, flips `IMAGE_GENERATION_MODEL`, `IMAGE_GENERATION_TEMPLATE_MODEL` and the quality constants.

## Out of Scope

- Changing any production default (models or qualities). That is Phase 2.
- Text models, the LangChain GPT-6 compatibility fixes, and the content filter, including its fail-open behaviour.
- A runtime failover to gpt-image-2, and a gpt-image-2 eval arm. gpt-image-2 stays a manual fallback choice.
- Prompt wording changes. For example, the custom-story portrait prompt never says "portrait"; improve it after the eval, not before, or it confounds the comparison.
- `triggerImageGenerationFlow` still attaches an image even when generation failed. `generateImagesForBeats` swallows errors, so the `.then` still enqueues `attachImageToStory`. Failed beat images can therefore show as endless spinners. This is worth fixing before Phase 2 flips the model; follow-up.
- `Privacy.tsx` not naming OpenAI image generation. This is pre-existing, and the processor doesn't change.
- A text-model replay eval (the assessment recommends building one before any gpt-4.1 shutdown notice).
- Video generation with any new provider.
