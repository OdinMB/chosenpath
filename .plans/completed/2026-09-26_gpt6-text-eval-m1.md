# GPT-6 text eval, Milestone 1: model factory, instrumentation, text-eval harness, blind rating pages, Stage 0 pre-fix baseline

- **Date**: 2026-09-26
- **Status**: implemented 2026-09-26 (steps 1–9 and the free parts of step 10; the paid Stage 0 runs are the next step, see `.plans/2026-09-26_build-followup.md`)
- **Type**: feature
- **Complexity**: complex
- **Branch**: `gpt6-text-eval` (already checked out; never switch, push, rebase or reset)
- **Sources**: `DOCS/2026-09-26_gpt6-text-model-test-plan.md` §3, §4, §5 (Stage 0) and Appendix A. Read it, never edit it (another agent may be editing it). Where it conflicts with the owner decisions of 2026-09-26 (in the task that launched this plan), the owner decisions win. This plan already applies them: arm matrix, stage caps, sample counts, gates.

## Before you start

- **Commits.** Commit with a pathspec on the commit itself: `git commit -m "…" -- path/one path/two`. New files must be staged by explicit path first (`git add path/one path/two`), because `git commit -- <path>` rejects untracked paths. Never `git add -A`, `git add .` or `git commit -a`. The untracked `.plans/*-followup.md` files from other runs are not yours; the only one you may touch is `.plans/2026-09-26_build-followup.md`. Never commit anything under `DOCS/` (it is gitignored: `.gitignore:50`).
- **The follow-up file.** Append to `.plans/2026-09-26_build-followup.md` with Edit, under its existing headings; never overwrite it. The planner had no Edit tool, so **your first edit** copies this plan's "Judgement calls" list (end of this file) under **Controversial Decisions**, prefixed "Milestone 1 (planner):".
- **Never read or edit `.env` files.** The harness runs from `server/` and loads `server/.env` through dotenv, as the image eval does. A missing key surfaces as a message naming the variable, never its value.
- **Production stays on gpt-4.1 / gpt-4.1-mini.** No production default changes, no prompt-text changes, no DB migrations in this milestone. GPT-6 is reached only through the eval harness or explicit env overrides.
- **API spend.** The whole evaluation targets $25 (hard ceiling $50). Milestone 1 spends only Stage 0 money: the probe (≤ $1), case building (≤ $0.75) and the pre-fix baseline (see step 10). The harness enforces the caps itself (step 4).
- Deletions only inside the project, written literally as `./path`. Don't use `npm run dev`; the server and client are already running.
- Tools: no inline Node or Python. Anything you want to try goes into a Jest test or through the CLI.

## Problem

Every text call builds its own `ChatOpenAI`. The settings would break a GPT-6 switch in several ways at once:
- `MODEL_BASE_REASONING = false` means effort is never sent. The `-mini` suffix trick turns any base model into a non-existent `-mini` model.
- Temperatures from env stay strings, because of the `as number` casts.
- LangChain 0.6.7 does not recognise `gpt-6-*` as a reasoning model (`chat_models.js:17-19`). It would send temperature and drop effort, so the call would run at medium.
- Retries are invisible: `AsyncCaller` retries up to 6 times by default, and a malformed-JSON parse inside `completionWithRetry` (`chat_models.js:1978-1995`) counts as a retryable failure.

Nothing logs tokens, latency, refusals or waits. There is no text-model eval, so the owner's questions can't be answered with data. Those are: cost, the 60-second pregeneration cap, setup quality, and multiplayer waits.

## Approach

Ten commit-sized steps. Steps 1–3 change production code without changing behaviour on today's models, apart from the retry cap, explicit timeouts and logging. Steps 4–8 build the harness under `server/src/evals/textModelEval/`. Step 9 is docs. Step 10 runs Stage 0 up to and including the pre-fix baseline.

**Production plumbing (steps 1–3).**
- **Per-role settings.** A resolver turns env into settings for 5 setting groups and 7 call roles. The existing env names keep their meaning, so the owner's `.env` keeps working.
- **One factory.** A single factory builds every `ChatOpenAI`. It supports a closed set of model families (gpt-4.x and gpt-6) and gives each a pinned request shape.
- **Logging.** A LangChain callback logs one line per call. The factory's retry hook logs each retry. A small in-memory module logs per-turn wait, pregeneration use and duplicates, and reading time.
- **Shared seams.** The pure parts of each text role move into one DB-free module, so the eval builds exactly what production sends. These are the prompt plus schema that go out, and how a response changes the story. `AIStoryGenerator` and `StoryProgressionService` delegate to that module.

**Harness (steps 4–8).**
- **Pattern.** It follows `imageModelEval`: dry run with estimates, probe, capped and resumable replay, baseline first per case, blind rating output with a separate answer key, results report.
- **Transport.** Every eval call goes through the **production factory and LangChain path**, with retries off. A wrapped `fetch` records the raw HTTP response (status, headers, body) before LangChain parses it. So the eval measures exactly the production request, and still sees the raw content when parsing fails (text after JSON, length cut-off, refusal).
- **Probe.** The probe alone uses raw SDK calls, for requests production must never send (temperature with effort, `minimal`, verbosity, cache breakpoints).
- **Rating pages.** Blind rating pages are single self-contained HTML files. The answer key lives in a separate file.

**Alternatives considered.**
- *Eval over the raw SDK with `openai/helpers/zod`* (test plan A5): rejected. It would be a second request builder that can drift from production's schema conversion and parameters. The fetch capture gives the same raw visibility. It also makes the test plan's "one LangChain smoke per arm" unnecessary, because every call is the LangChain path.
- *Duplicating prompt, schema and apply logic inside the eval*: rejected. Over 100 lines must match production exactly, or the eval measures something else. The extracted module is also where Stage 3 and 4 variants will land.
- *Extracting a shared runner from `imageModelEval`*: rejected. The image eval is finished and frozen. The text runner differs in kind: token-per-minute pacing, stage and global caps, samples, two-call chains. Copying and adapting keeps the image harness untouched.
- *Moving `buildMergedPrompt` and `categoryConfigs` from the client into core*: rejected for this milestone. It is a client refactor, and the server can't import client files (`server/tsconfig.json` `rootDir: src`). Setup premises become a frozen fixture instead, which also keeps reruns comparable if the site's suggestions change.

## Decisions

### DECISION: One chat-model factory with a closed set of model families
- **Affects**: model, architecture
- **Chosen**: Every text call gets its `ChatOpenAI` from `server/src/shared/llm/chatModel.ts`. Only gpt-4.x and gpt-6 models are accepted, each with a pinned request shape.
   gpt-4.x sends temperature and no reasoning parameters. gpt-6 never sends temperature, always sends `reasoning_effort`, rejects `minimal`, and sends `prompt_cache_options: { mode: "explicit" }`. Neither family sends `max_tokens`. Structured output stays on the default strict `json_schema` method. Any other model name throws at startup.
- **Alternatives**: Keep per-call-site construction (the reason GPT-6 would break today). Accept any model and guess the shape: an unknown family would fail at runtime, and a fail-closed content filter would then block every custom story.
- **Why**: A misconfigured shape fails loudly or silently on every call. A unit test can pin one choke point, not six.

### DECISION: Per-role text model settings with backward-compatible env fallbacks
- **Affects**: model, operations
- **Chosen**: Five setting groups:
   - setup: `SETUP_MODEL_*`, falling back to `GENERATION_MODEL_*`;
   - template editor: `GENERATION_MODEL_*`;
   - beats: `TEXT_MODEL_*`;
   - switch and thread analysis: `SWITCH_THREAD_MODEL_*`;
   - content filter: `CONTENT_FILTER_MODEL_*`.
   Each group has `_NAME`, `_TEMPERATURE` (parsed as a number) and `_REASONING_EFFORT`. Beats and analysis also take a `MULTIPLAYER_TEXT_MODEL_*` / `MULTIPLAYER_SWITCH_THREAD_MODEL_*` override. It applies only when its `_NAME` is set, and then all of its fields come from the override. Explicit defaults replace the `-mini` suffix trick: gpt-4.1 for setup and the template editor, gpt-4.1-mini for the rest, temperature 0.2. A gpt-6 model without an effort setting fails at startup.
- **Alternatives**: Keep the four existing groups. Then setup could not move to Sol while the template editor waits for its smoke check. Seven fully separate groups would add env vars nobody needs.
- **Why**: The owner decides setup and gameplay separately, and multiplayer may need a faster arm. Existing env names keep today's meaning, so no deployed setting changes behaviour.

### DECISION: Production text calls retry at most twice, with explicit per-role timeouts
- **Affects**: operations
- **Chosen**: `maxRetries: 2` on every production text call, with each retry logged. Timeouts: 240 s for setup and the template editor, 180 s for beats, 120 s for analysis, 60 s for the filter. The eval uses 0 retries and a 300 s timeout.
- **Alternatives**: LangChain's default of 6 silent retries, each billed. Adding no timeout leaves a request with the SDK default of 10 minutes.
- **Why**: Hidden retries hide failure rates and multiply cost. The timeouts sit well above today's slowest expected call (3-player setup, about 100 s), so they only cut hung requests.

### DECISION: Per-call and per-turn metrics are logged with story ids, never text or user ids
- **Affects**: personal-data, retention, operations
- **Chosen**: One `[LLM]` log line per call: role, model, effort, token counts by type, milliseconds, finish reason, refusal flag, story id, turn, player count, beat type, images flag, pregeneration flag. One `[LLM] retry` line per retry. `[TurnTiming]` lines hold story id, turn, player slot, seconds, pregeneration state and a duplicate flag. No prompt, output or user id is logged. Retention is whatever the host's log retention is.
- **Alternatives**: No logging, which leaves Stage 0 unmeasurable in production. Logging in the database would need a migration, which is out of scope. Logging text would copy player-written content into logs.
- **Why**: The 60-second cap rests on an estimate of reading time, and today nothing measures waits, retries or token use. A story id is pseudonymous, and none of these lines adds content.

### DECISION: The text eval sends through the production factory and captures raw responses at the fetch layer
- **Affects**: architecture
- **Chosen**: Eval calls run `createChatModel(...).withStructuredOutput(schema).invoke(prompt)` with `maxRetries: 0`. An injected `fetch` records status, headers and the raw body. The harness classifies validity from the raw body. Only the probe uses raw SDK requests.
- **Alternatives**: Raw SDK calls with `zodResponseFormat` (test plan A5), a second request builder. LangChain callbacks only, which have no raw body when parsing fails.
- **Why**: The eval must measure the request production sends, and still see why a reply failed.

### DECISION: The eval replays local development data to OpenAI and keeps every output in gitignored DOCS
- **Affects**: personal-data, provider
- **Chosen**: The harness reads only files under `data/` and the frozen case files. It never touches the database. It sends prompts to OpenAI under the production processor terms, and writes outputs, rating pages and answer keys only under `DOCS/2026-09-26_gpt6-text-eval/`. Template-iteration cases delete `creatorId` and `creatorUsername` from the template before it is serialised into the prompt. Production keeps sending them until the prompt-fix milestone strips them.
- **Alternatives**: Build synthetic states only. That loses the stored gpt-4.1-mini outputs and real play.
- **Why**: Real stored states are the only realistic beat inputs. Stripping the creator fields in the eval costs nothing.

### DECISION: Hard spend caps live in the harness: per stage, global, and a $50 ceiling
- **Affects**: operations
- **Chosen**: Default stage caps are $6 for Stage 0 (probe, case building, both baselines), $12 for Stages 1–2, $3 for Stage 3 and $4 for Stage 4. The default global cap is $25. The harness refuses to start when the estimate would exceed a cap, and it stops scheduling when the next call would. Raising a cap needs `--over-target-reason "<text>"`, which is logged in `budget-overrides.jsonl`. The global cap can never exceed $50.
- **Alternatives**: A single `--max-spend` per invocation (the image eval), which can't keep stages inside their shares.
- **Why**: The owner set explicit shares and a firm ceiling for an unattended run.

### DECISION: Setup premises are a frozen fixture in the eval
- **Affects**: architecture
- **Chosen**: `setupPremises.ts` holds 18 finished premise strings with their player count, game mode, category and tags. 13 are merged from the site's suggestion prompts with a copy of the client's `buildMergedPrompt` logic. 5 are reconstructed from stored custom stories.
- **Alternatives**: Import the client's `suggestionData.ts` at run time, which is not possible from `server/`. Move the merge logic to core, a client refactor.
- **Why**: The eval's inputs must not change under it between rounds.

## Changes

### Step 1: Per-role settings and the model factory (production)

| File | Change |
|------|--------|
| `server/src/shared/llm/textModelSettings.ts` (new) | Env to per-role settings. See the table after this one. |
| `server/src/shared/llm/chatModel.ts` (new) | The factory. See the notes after the table. |
| `server/src/config.ts` | Delete `MODEL_BASE_REASONING`, the `OPENAI_MODEL_BASE*` constants and the 11 `*_MODEL_*` exports (`:34-66`). Add `export const TEXT_MODEL_CONFIG = resolveTextModelConfig(process.env)`. Image settings stay untouched. |
| `server/src/game/services/AIStoryGenerator.ts` | Replace the three `new ChatOpenAI` (`:69-89`) with a private `modelFor(role, multiplayer)`. It lazily creates and caches one model per resolved settings through `createChatModel`, with production retries and timeouts. Setup and template calls use roles `setup`, `templateGeneration` and `templateIteration`; beats use `beat`; analysis uses `switchAnalysis` and `threadAnalysis`. Beats and analysis pass `story.isMultiplayer()`. |
| `server/src/game/services/ContentFilterService.ts` | Build the default classifier via `createChatModel({ role: "contentFilter", ... })` (`:116-120`). The `classify` injection seam stays. |

`textModelSettings.ts`:
- *Responsibility:* which model, effort and temperature each text role uses, read from env with today's defaults.
- *Exports:* `TextRole`, `ReasoningEffort`, `TextModelSettings`, `resolveTextModelConfig(env)`, `settingsFor(config, role, { multiplayer })`.
- Group mapping and fallbacks as in the Decision.
- `_TEMPERATURE` is parsed with `Number()`. Non-finite or out-of-range values (0–2) throw. An empty string counts as unset, as `||` treats it today.
- For gpt-4.x, effort is ignored even if set, because today's defaulted `minimal` must not break anything.
- For gpt-6, a set temperature is ignored with one startup warning, and a missing effort throws.
- Validation of each resolved setting calls `assertSupportedSettings` from `chatModel.ts`, so the rules live in one place.

`chatModel.ts`:
- *Responsibility:* the exact `ChatOpenAI` request shape per model family, plus retry policy and retry logging.
- *Exports:* `modelFamily(model)`, `assertSupportedSettings(settings)`, `chatModelFields(options)`, `createChatModel(options)`.
- `options = { role, settings, maxRetries, timeoutMs, callbacks?, configuration? }`. `configuration` is passed through, so tests and the eval can inject `fetch`.
- Families:
  - `gpt-4.1*` and `gpt-4o*` count as gpt-4.x. They get `{ model, temperature }`.
  - `/^gpt-6-/` counts as gpt-6. It gets `{ model, modelKwargs: { reasoning_effort, prompt_cache_options: { mode: "explicit" }, ...(verbosity && { verbosity }) } }`, with no `temperature` key at all.
  - Anything else throws.
  - `minimal` or an unknown effort throws for gpt-6.
- Always set: `maxRetries`, `timeout`, `useResponsesApi: false`, `__includeRawResponse: true`, `callbacks`, and `onFailedAttempt`.
- Never set: `maxTokens`. On 0.6.7 it becomes `max_tokens` for any non-o/gpt-5 model (`chat_models.js:1754-1760`).
- `onFailedAttempt` logs `[LLM] retry {role, attempt, retriesLeft, status, code, name}` whenever `retriesLeft > 0`. It **must then re-apply LangChain's default policy**, because a custom handler replaces it (`node_modules/@langchain/core/dist/utils/async_caller.js:3-37`). That policy rethrows on Cancel or Abort, `ECONNABORTED`, status 400–409 and `insufficient_quota`. Re-implement those few lines; the default handler isn't exported.
- `verbosity` is only a setting field. There is no env var for it in this milestone; the probe and later arms use it.

### Step 2: Instrumentation (production)

| File | Change |
|------|--------|
| `server/src/shared/llm/usageRecorder.ts` (new) | The per-call logger. See the notes after the table. |
| `server/src/game/services/turnTimings.ts` (new) | Per-turn timings. See the notes after the table. |
| `AIStoryGenerator.ts` | Every `invoke` passes `{ metadata: { storyId, turn, players, beatType, images, pregeneration } }`. The models get `callbacks: [llmCallLogger]`. `generateBeats`, `generateSwitches` and `generateThreads` take an optional last parameter `context?: { pregeneration: boolean }`. |
| `StoryProgressionService.ts` | Pass `{ pregeneration: skipDatabaseUpdate }` to the generator calls (the value is already in `handleProgression`). |
| `GameQueueProcessor.ts` | `updateAndBroadcastStory` (`:99-116`) calls `noteBroadcast`. `pregenerateStoryStateInternal` (`:569-769`) calls `notePregenerationFinished` in its success and failure paths. |
| `ChoiceProcessingService.ts` | `processChoice` (`:30-53`) calls `noteChoice` after `checkPregeneratedState`. It passes `pregenerationService.isPregenerationInProgress(...)`, whose result is the duplicate flag. |

`usageRecorder.ts`:
- *Responsibility:* turn one finished chat call into a metrics record, and log it.
- *Exports:* `callMetricsFromCompletion(raw)`, `LlmCallLogger` (a `BaseCallbackHandler`), `llmCallLogger` (the production instance).
- `callMetricsFromCompletion` reads a raw Chat Completions body:
  - usage: `prompt_tokens`, `prompt_tokens_details.cached_tokens`, `prompt_tokens_details.cache_write_tokens` (0.6.7 drops it from `usage_metadata`), `completion_tokens` and `completion_tokens_details.reasoning_tokens`;
  - from `choices[0]`: `finish_reason` and `message.refusal`;
  - also `model`, `system_fingerprint` and `service_tier`.
- The eval calls it on the fetch-captured body.
- The handler implements `handleChatModelStart` (chat models call this, not `handleLLMStart`), `handleLLMEnd` and `handleLLMError`, keyed by `runId`.
- On end, it reads `output.generations[0][0].message.additional_kwargs.__raw_response`. On error, it records status, code, param and the error name.
- It emits through an injected sink (tests). The production sink writes one `Logger.forService("LLM")` line with compact JSON.

`turnTimings.ts`:
- *Responsibility:* the per-turn wait, pregeneration use and duplication, and reading time, from in-memory timestamps.
- *Exports:* `noteBroadcast(storyId, turn, players)`, `noteChoice(storyId, turn, slot, pregenState, pregenInProgress)`, `notePregenerationFinished(storyId, turn, slot, option, ms, ok)`, plus `createTurnTimings(now, log)` for tests.
- `noteBroadcast` logs `delivered {waitSeconds}` only when the turn is higher than the last one seen for that story. The wait is measured from that story's last choice.
- `noteChoice` logs `choice {readingSeconds, pregen: complete|partial|none, duplicate}`. The reading time counts only when the choice is for the delivered turn. `duplicate` means the pregeneration isn't complete and is still in progress.
- The map is capped at 5,000 stories, dropping the oldest first. No text is logged.

### Step 3: DB-free seams shared by production and the eval

| File | Change |
|------|--------|
| `server/src/game/services/storyTextSteps.ts` (new) | The model-free half of each text role. See the notes after the table. |
| `AIStoryGenerator.ts` | Delegate to `storyTextSteps`. What stays in the class: transport, mocks, logging, error wrapping, and stripping `characterSelectionPlan`. |
| `server/src/game/services/ThreadResolutionService.ts` | Add `static resolveCurrentThreads(story): Story`. It holds the moved `checkNeedsThreadResolution` and `processThreadResolutions` logic (`StoryProgressionService.ts:62-67, 139-224`); same responsibility. `StoryProgressionService` calls it and uses `analysisBefore`. |
| `server/src/game/services/BeatResolutionService.ts` | Add `static resolveChoice(story, slot, optionIndex, difficulty): Story`, the moved body of `ChoiceProcessingService.processBeatResolution` (`:58-126`). `processBeatResolution` becomes a one-line delegate, so its callers in `GameQueueProcessor` don't change. |

`storyTextSteps.ts`:
- *Responsibility:* the exact prompt and zod schema production sends for each story text role, and how a beat or analysis response changes the story.
- *Exports:*
  - `beatStep = { request(story), apply(story, response, skipImageRequests) }`. The schema flags move from `:396-407`, and `apply` holds `processBeatsResponse` plus `mergeChanges` from `:428-497`.
  - `switchStep` and `threadStep`, each `{ request(story), apply(story, response) }`, with the transforms from `:303-371`.
  - `setupStep.request(premise, playerCount, gameMode, maxTurns, kind)`.
  - `partialTemplateSchema(sections, playerCount)`, moved from `:517-548`.
  - `analysisBefore(story, nextBeatType): "switch" | "thread" | undefined`, moved from `StoryProgressionService.ts:229-247`.
- Nothing in this module does I/O. It imports only core models and types plus the prompt services, which are DB-free.
- Behaviour must be byte-identical. The prompts and schemas are the same calls, moved.

### Step 4: Harness core (`server/src/evals/textModelEval/`)

| File | Change |
|------|--------|
| `arms.ts` (new) | *Responsibility:* the arm matrix per stage and role, prices, and cost and estimate functions. *Exports:* `Arm`, `armsFor(stage, role)`, `baselineArm(role, multiplayer)`, `costFromUsage(model, usage)`, `estimateCall(role, arm, promptChars, measured?)`. Details below. |
| `budget.ts` (new) | *Responsibility:* the spend caps. *Exports:* `resolveCaps(args)`, `spentByStage(records)`, `budgetCheck(caps, records, stage, estimateUsd)`. Defaults as in the Decision. A cap above the default needs a reason; the global cap is refused above $50. A reason appends to `budget-overrides.jsonl`. The probe and case building count as Stage 0. |
| `variants.ts` (new) | *Responsibility:* the prompt/schema variant hook. *Exports:* `VariantId` (M1: `"prod"`) and `requestFor(variant, role, input)`. `prod` calls `storyTextSteps` and `setupStep` unchanged, plus the iteration builder from step 5. Later milestones add `slim`, `minimal` and `gpt6`. The request type is `{ prompt: string; schema }`; Stage 4 will widen `prompt` to messages. |
| `executor.ts` (new) | *Responsibility:* one eval call through the production path. *Exports:* `executeCall(call)`, `executeChain(chain)`. Details below. |
| `responseCheck.ts` (new) | *Responsibility:* what happened to one call. *Exports:* `classifyCall(capture, error, schema)`. Details below. |
| `runner.ts` (new) | *Responsibility:* scheduling of planned calls and chains. *Exports:* `runJobs(jobs, deps, options)`, `jobKey(...)`, `finishedJobKeys(records)`. Details below. |
| `run.ts` (new) | The CLI. Guard the environment exactly like the image eval (refuse `NODE_ENV=production`; require `data/stories` and `data/templates` inside the repo). Details below. |
| `server/package.json` | Add `"eval:text": "tsx src/evals/textModelEval/run.ts"`. |

`arms.ts`:
- **Arm key**: `<model>@<effort | t<temperature>>[+v<verbosity>]/<variant>`, for example `gpt-4.1-mini@t0.2/prod` or `gpt-6-luna@medium/prod`.
- **Baseline**: `baselineArm` comes from `resolveTextModelConfig(process.env)`, so "as in production" is literal. The dry run prints it.
- **Stage 1–2 matrix** (from the owner decisions). It is defined now so the dry run can estimate it; it doesn't run in M1.
  - Setup, on all 18 premises: Sol low ×2, Sol medium ×2, Sol none ×1; Luna none, low and medium ×2 each.
  - Beats: Luna medium, none and low on all cases ×2; Luna high on the 15-case subset ×2; Sol low on the subset ×1.
  - Analysis: follows the Luna beat arms in pipeline mode.
  - Rare-failure batch: 150 Luna beat calls, 50 each at none, low and medium, 1 sample.
- **Prices per 1M tokens** (in / cached / cache write / out):
  - gpt-4.1: 2.00 / 0.50 / 0 / 8.00;
  - gpt-4.1-mini: 0.40 / 0.10 / 0 / 1.60;
  - gpt-6-sol: 2.00 / 0.20 / 2.50 / 10.00;
  - gpt-6-luna: 0.10 / 0.01 / 0.125 / 0.50.
- **Cost** = `(I − C − W)·p_in + C·p_cached + W·p_write + O·p_out`, where O = `completion_tokens` (which already includes reasoning).
- **Estimate**: input is the prompt length ÷ 4. Output and reasoning come from test plan §2.2 until at least 3 measured records exist for that role, model and effort; from then on, the measured medians. For Luna high, assume 12K reasoning tokens (there is no source figure).

`executor.ts`:
- `executeCall` builds the model with `createChatModel({ role, settings: arm, maxRetries: 0, timeoutMs: 300_000, configuration: { fetch: capturingFetch } })`. It runs `withStructuredOutput(schema).invoke(prompt)` and times the call.
- `capturingFetch` wraps the global `fetch`. It records the status, the `x-request-id` and `openai-processing-ms` headers, and `await res.clone().text()`.
- It stores `outputs/<callId>.json` with the raw content, the parsed output, the metrics from `callMetricsFromCompletion`, and the prompt hash. Each prompt is stored once as `prompts/<sha256>.txt`.
- `executeChain` runs the pipeline chain for one case, arm and sample. The steps are: analysis call, then `switchStep.apply` or `threadStep.apply`, then `beatStep.request`, then the beat call. The chain id and the summed turn latency go into the records.
- It never calls `AIStoryGenerator.generate*` (they swallow errors), and never imports `StoryProgressionService` (it pulls in the DB and the image generator).

`responseCheck.ts`:
- The outcomes, in priority order:
  - `http-error`, with status, code and `param`; a 400 with `param` counts as a rejected parameter;
  - `timeout`;
  - `refusal` (`message.refusal`);
  - `length` (`finish_reason: "length"`);
  - `valid` (the schema parse succeeded);
  - `repaired`: the content failed `JSON.parse`, but the first balanced top-level JSON object parses and validates. The trailing text is kept; this is "text after JSON";
  - `invalid-json`;
  - `schema-mismatch`.
- It also flags `junkChars` inside strings: control characters and characters in scripts outside Latin, Greek and Cyrillic, excluding common punctuation and emoji.

`runner.ts`:
- **Ordering**:
  - Roles run setup first, then beats, then switch and thread analysis (with pipeline chains), then iteration.
  - Within a role, every case's baseline runs first. Candidates run only for cases whose baseline is valid or repaired.
  - Samples are independent calls.
- **Pacing**: a rolling 60-second token window per model, with a default budget of 400K tokens per model (`--tpm` overrides it), and at most 6 calls in flight.
- **Retries**: only on 429, 5xx, timeouts and connection errors (including codes `slow_down` and `server_is_overloaded`). The backoff honours `retry-after`; otherwise 30 s, 60 s, 120 s. Every attempt is recorded.
- **Spend**: before each start, the runner reserves the estimate and checks `budgetCheck` for the stage, the global cap and any `--max-spend`. When a check fails, it stops scheduling.
- **Records**: one JSON line per attempt in `calls.jsonl`, carrying:
  - `stage`, `promptState`, `role`, `caseId`, `armKey` and `sample`;
  - `chainId?`, `attempt`, `final`, `outcome`, `latencyMs` and `processingMs`;
  - the usage by type, `costUsd`, `costSource`, `outputFile` and `promptHash`.
- **Resume**: skip every job key (`case|arm|promptState|sN`) that already has a final record.
- **Prompt-hash drift**: a hash that changes for the same key within one `promptState` means the code changed underneath. The runner warns and records it.

`run.ts`:
- **Modes**:
  - `--dry-run` (the default): cases, calls, estimated $ and duration per stage against the caps. No API calls.
  - `--probe [--max-spend 1]`.
  - `--build-cases [--rebuild-cases]`.
  - `--run --stage 0|1-2|3|4 --prompt-state <tag>`.
  - `--rating-page setup|turn --arms <k1,k2,k3> [--items N] [--preview]`.
  - `--score <export.json>`.
- **Filters**:
  - `--role setup,beat,switch,thread,iteration`; `analysis` means switch plus thread.
  - `--mode isolated|pipeline`, default isolated.
  - `--arms <keys>`, `--cases <ids>`, `--samples N`, `--subset15`.
- **Budget and output flags**: `--max-spend <usd>` (per invocation), `--global-cap <usd>`, `--stage-cap <usd>`, `--over-target-reason "<text>"`, `--out <dir>` (default `../DOCS/2026-09-26_gpt6-text-eval`).
- `--run` requires `--prompt-state`. M1 uses `prefix`; the next milestone uses `postfix`.

### Step 5: Cases

| File | Change |
|------|--------|
| `cases.ts` (new) | *Responsibility:* selecting and assembling replay cases from local files, with no API calls. *Exports:* `EvalCase`, `loadStoredSnapshots(storiesDir)`, `pairParentsAndChildren(snapshots)`, `continuationCase(parent, child?)`, `endingCase(parent)`, `selectSubset15(cases)`, `iterationCases(templates)`. Details below. |
| `caseBuilder.ts` (new) | *Responsibility:* building the cases that need the baseline to play forward, then freezing every case. *Exports:* `buildCases(deps)`. Details below. |
| `setupPremises.ts` (new) | *Responsibility:* the 18 frozen setup premises. *Exports:* `SETUP_PREMISES`. Details below. |

`cases.ts`:
- **Data.** It reuses `loadStoryStates` and `loadTemplates` from `../imageModelEval/cases.js`, and reads `data/stories/*/pregeneration_<k>_player1_<j>.json`, `story.json` and `data/story_checkpoints/`.
- **Continuations**, 33 with a stored output:
  - A snapshot P(k,j) counts as *adopted* when its latest beat text equals the beat at the same index in `story.json` or in any P(k+1,·).
  - Each adopted P(k,j) is the parent of every complete child P(k+1,j′).
  - The case input is the parent, with the child's `choice`, `resolution` and resolution details copied onto the parent's current beat. The child's new phase, if any, is injected with `story.addPhase(phase)`, plus `updatePlayerPreviousThreadTypes` for thread phases.
  - At run time the input then goes through `ThreadResolutionService.resolveCurrentThreads`.
  - The stored output is the child's new beat.
  - The test plan expects: 8988006e k=2–7, 6edd813c k=2–3, 7492b211 k=2, 2ee343b6 k=2, and the checkpoint story at k=1. Record any mismatch in the follow-up.
- **5 synthetic-choice continuations** from unadopted snapshots. The option is picked by hash. `BeatResolutionService.resolveChoice` resolves it at build time, and the result is frozen.
- **Images off.** Two of the 38 continuations are cloned with `generateImages: false` and an empty image library.
- **Endings.** `endingCase` sets `maxTurns` to the current turn on a parent whose thread has just resolved. It asserts that `determineNextBeatType()` returns `"ending"`, and skips the case otherwise. Three are built.
- **The 15-case subset** is stratified and hash-ordered: 9 single-player continuations, 2 first beats, 3 multiplayer, 1 ending.
- **Iteration cases (5).** Each is a template with `creatorId` and `creatorUsername` deleted, a feedback string and a set of sections. The prompt comes from `StorySetupPromptService.createSetupPrompt(feedback, playerCount, gameMode, maxTurns, true, sections, JSON.stringify(template))`, and the schema from `partialTemplateSchema`.

`caseBuilder.ts`:
- **First beats**: 3 single-player and 6 multiplayer (2–3 players).
  - Build with `createStoryStateFromTemplate`, then `setCharacterSelection` per player (options picked by hash), then `completeCharacterSelection`.
  - Run the baseline switch analysis and apply it with `switchStep.apply`. That result is the fixed analysis for isolated mode.
- **6 multiplayer continuations**:
  - From the multiplayer first beats: the baseline first beat, then `beatStep.apply` and `ChangeService.applyChanges`.
  - Each player's option is picked by hash and resolved with `resolveChoice`.
  - Run the baseline thread analysis and apply it.
- **Analysis cases**: 20 switch and 15 thread.
  - Use the stored ones, where a child adds a phase.
  - Add one switch and one thread case per template played forward from about 15 templates.
  - Favour competitive and cooperative-competitive templates, to get contest threads. The report lists which thread types occurred.
- **Freezing**: everything goes to `cases/cases.json` (the index with tags) and `cases/<id>.json` (the state). Tags: players, game mode, beat type, images, multiplayer, kids, dark, subset15 and `hasStoredOutput`.
- **Cost**: build calls use the baseline arm, `stage 0` and `promptState: prefix`, and are recorded like any call.
- **Refreshing**: `--build-cases` refuses to overwrite existing cases unless given `--rebuild-cases`, because rebuilding changes the inputs.

`setupPremises.ts`:
- Each entry has an id, the merged premise text, playerCount, gameMode, category, tags and source.
- The `categoryConfigs` instructions and `buildMergedPrompt` behaviour are copied from `client/src/page/components/StoryInitializer.tsx:208-309, 581-604`, with a source comment.
- **Coverage**:
  - player counts: 8 one-player, 5 two-player, 5 three-player;
  - all four game modes;
  - every category at least once;
  - 2 Kids premises (`read-with-kids` with a `kidAge`);
  - 2 dark themes that stay within the content rules;
  - 13 drawn from `client/src/page/data/suggestionData.ts`, 5 reconstructed from stored custom stories (`story.json` without `templateId`), using their title and `guidelines.world`.
- Use `maxTurns = DEFAULT_TURNS` from `core/config.ts` (25).
- No premise may match the blinding pattern (a test checks this).

### Step 6: Probe

| File | Change |
|------|--------|
| `probe.ts` (new) | *Responsibility:* which request parameters and schemas the API accepts for Sol and Luna. *Exports:* `probeChecks()`, `runProbe(client, deps)`, `ProbeReport`. It writes `probe.json`. Checks that would pass the cap are skipped. Details below. |

`probe.ts` covers test plan A4:
- **Items 1–3 and 5–8**, as raw SDK requests through `client.post("/chat/completions", { body })`:
  - effort none with temperature 0.2 (expect 200); effort low with temperature (expect 400); effort `minimal` (expect 400);
  - top-level `verbosity: "low"`;
  - `prompt_cache_options: { mode: "explicit" }` against the implicit default (look at `cache_write_tokens`);
  - a developer message whose text part carries `prompt_cache_breakpoint`, sent twice (look at `cached_tokens` on the repeat);
  - which usage fields are present.
  - Using `post` avoids casting SDK types that lack `"none"` and `prompt_cache_options`.
- **Schema acceptance** (items 4 and 9). The body is the factory's own `new ChatOpenAI(chatModelFields(...)).invocationParams({ response_format })`, narrowed to Completions params with an `in` check (no `as unknown as`). Add messages and `max_completion_tokens: 64`.
  - Why the cap: OpenAI validates the schema before generating, so each check costs cents.
  - Variants: setup for 1, 2 and 3 players, as story and as template; beats for 1 and 3 players, images on and off, milestones on and off; switch for 1 and 3 players; thread; filter; iteration.
  - Each at low and medium, on both models.
- **One full, uncapped completion per model at medium** on the filter schema, through `executeCall`. It confirms that a strict JSON reply parses at medium, and how a refusal surfaces through LangChain.

### Step 7: Automatic metrics and the report

| File | Change |
|------|--------|
| `textChecks.ts` (new) | *Responsibility:* the rule and state checks of test plan §4.4 on parsed outputs. *Exports:* `checkBeatSet(output, story)`, `checkSetup(output, input)`, `checkSwitch(output, story)`, `checkThread(output)`, `aggregateProse(outputs)`. Details below. |
| `resultsReport.ts` (new) | *Responsibility:* `results.md` from records and checks. *Exports:* `computeArmStats(records, checks)`, `storyCost(stats)`, `gates(stats, baseline)`, `weightedQuantile(samples, q)`, `renderResults(input)`. Details below. |

`textChecks.ts`:
- **Beats**:
  - paragraphs (5–6) and sentences per paragraph (3–5). Strip inline `[image …]` tags without dropping the line;
  - exactly 3 options, at most one sacrifice or reward option, and the option type matching the thread type;
  - image tags well-formed, pointing at existing ids, none in the last paragraph, and a requested image actually used;
  - 3 interludes;
  - `basePoints` within range by resource type, and modifiers between −15 and +15;
  - counts of facts, new elements and introductions;
  - every referenced id exists;
  - second person and present tense (proxies);
  - meta or mechanics words in player-facing text;
  - character names matching the state.
- **Setups**: difficulty modifier in {−20, −10, 0, 10, 20}, player slots present, and counts (3–4 shared stats, 3–4 player stats, 6–8 thread types).
- **Threads**: duration 2–4 with one step per beat.
- **Aggregates**: opening-word variety and stock-phrase frequency.

`resultsReport.ts`:
- **Per role and arm**:
  - validity rates: first-attempt valid, repaired, refusal, length, rejected parameter, text after JSON, junk;
  - rule and state rates against the baseline, where the noise floor is the gap between baseline sample 1 and sample 2;
  - latency p50 and p95 per call, and per turn in pipeline mode (analysis plus beat);
  - multiplayer waits by player count;
  - median tokens by type;
  - $ per call, both as billed and uncached for gpt-4.1 arms.
- **Three views per arm**:
  1. **Single-player with pregeneration.** Per story: 85 beats, 19 switch calls, 21 thread calls, plus 1 setup for custom stories. The 60-second gate: p95 ≤ 60 s for beat-only turns **and** for analysis turns.
  2. **Single-player without pregeneration.** Per story: 29 beats, 7 switch and 7 thread calls. The full-turn wait mixes the beat-only and analysis-turn distributions at 15/29 and 14/29 (`weightedQuantile`). Flag the owner's exception when the median is ≤ 5 s and the p95 ≤ 8 s.
  3. **Multiplayer.** Waits by player count. Mark the arm "needs multiplayer pregeneration" when its p95 exceeds the baseline's by more than 5 s but stays ≤ 60 s. Above 60 s it fails.
- **Setup gate**: median wait ≤ 1.5× the baseline median; p95 is shown alongside.
- **Cost cap**: per-story cost ≤ the baseline's measured per-story cost. Show a small matrix of setup arm × gameplay arm totals.
- **Spend** by stage against the caps.
- **Probe summary.**
- The report never picks a winner.

### Step 8: Blind rating pages

| File | Change |
|------|--------|
| `ratingSets.ts` (new) | *Responsibility:* which items and options go on a page, their labels, and the answer key. *Exports:* `planRatingSet(spec, records, cases)`, `RatingSet`, `RatingKey`. Details below. |
| `blinding.ts` (new) | *Responsibility:* proving that a page reveals no arm. *Exports:* `metadataLeaks(set)`, `htmlLeaks(html, key)`. Details below. |
| `ratingPage.ts` (new) | *Responsibility:* one self-contained HTML file per rating set. *Exports:* `renderRatingPage(set)`. Details below. |
| `ratingScore.ts` (new) | *Responsibility:* scoring an exported rating file against its key. *Exports:* `scoreRatings(exported, key)`, `renderScores(scores)`. Details below. |

`ratingSets.ts`:
- **Items.** The spec names a kind (`setup` or `turn`), the arms (the first is the baseline) and an item count. Setup and turn sets are separate pages.
- **Selection.** Items are stratified across player counts, modes, Kids/dark, first beats, endings, multiplayer and analysis turns. Only cases where every arm produced a valid output qualify, using sample 1.
- **Control items**:
  - one **repeated item**: an earlier item shown again at least 3 positions later, with its labels reshuffled;
  - one **baseline-against-baseline item**: baseline sample 1 against sample 2 on another case, with 2 options. It is skipped, with a note in the key, when no second baseline sample exists.
- **Labels**: A–C (up to D). The option order comes from `sha256(salt|itemId|armKey)`, where the salt is a fresh random 16-byte hex value per page. The baseline's position is balanced across the set (the image eval's `baselinePositions` approach). The label distribution is recorded in the key.
- **Ids**: item ids are neutral (`setup-01`, `turn-01`), and the item order is shuffled by the salt.
- **The key** holds the `pageId`, the salt, and item → label → `promptState:armKey`, plus the repeat and control mapping. It goes to `keys/<setId>-<pageId>.json`.

`blinding.ts`:
- `metadataLeaks` checks every non-narrative string: set title, instructions, item ids, labels, field labels and context headings.
  - Ids must match `^(setup|turn)-\d{2}$` and labels `^[A-D]$`.
  - Other strings must not match `/gpt[-_ ]?\d|chatgpt|openai|\bsol\b|\bluna\b|effort|reasoning|baseline|\b(none|minimal|low|medium|high)\b/i`.
- `htmlLeaks` scans the final HTML for every arm key, model id, effort token in key form (`@low`), variant id and the key's file name, taken literally from the key.
- Narrative (story text, premises, option texts) is exempt from the word pattern, so "Sol" and "Luna" may appear in stories, but not from the literal arm-key scan.

`ratingPage.ts`:
- **Self-contained.** Markup is rendered on the server with every string HTML-escaped. There is no external request: no `src`/`href` to the network, no fonts, no `@import`. The page never references the key file.
- **Inline script.** It is small and handles navigation, state, autosave and export. The page data it needs is an inline JSON block with `<` escaped as `\u003c`.
- **Layout**:
  - one item at a time: context, then option cards stacked (columns from about 1400 px wide);
  - Previous and Next, a jump list, and a progress line ("Item 3 of 8 · 5 fully rated").
- **Per option** there is a fieldset:
  - "Acceptable?" with yes/no radios;
  - "Rank" with radios 1..N (1 = best; ties allowed);
  - an optional one-line note.
  - An item counts as rated when every option has both answers.
- **The setup card** shows the title, introduction (`characterSelectionIntroduction`), world (the `guidelines` world, tone and conflicts), story elements (name and description), stats (shared and player: name, description, initial value), and character options per player slot.
- **A turn option** shows the player-visible content per player beat: title, text, options and interludes. Image tags are replaced by a muted "[picture: desc]".
- **Turn context**: the previous beat's summary, the chosen option's text and its outcome in words, and the relevant shared and player stats with values. First beats show the introduction and the chosen characters.
- **Autosave** writes to `localStorage` key `chosenpath-rating:<pageId>` on every change. Every storage access is in try/catch. When storage is unavailable, a visible notice says "Autosave is off in this browser — export before closing".
- **Export** downloads `ratings-<setId>-<pageId>.json` through a Blob and `a[download]`. It holds `{ pageId, setId, exportedAt, ratings: { itemId: { label: { acceptable, rank, note } } } }`. The page shows the last export time.
- **Keyboard and mobile**: native controls and a visible focus ring; `n`/`p` keys outside text inputs; 44 px targets.
- **Design**: a system font stack at 18 px, line-height 1.6, 70ch text measure, and a calm palette. Light and dark follow `prefers-color-scheme`.
- **Preview mode.** `--preview` allows single-option items and shows a "Preview — not for rating" banner. It writes to `rating/preview/` and exists only for layout checks.

`ratingScore.ts`:
- It rejects an export whose `pageId` or `setId` doesn't match the key.
- **Per arm**: acceptable rate, mean rank, the share of items ranked equal or better than the baseline, and wins, ties and losses against the baseline.
- **Controls**: agreement on the repeated item (acceptable verdicts and rank order), and the result of the baseline-against-baseline item.
- **Position bias**: the label distribution of rank-1 picks.
- The notes are listed per item, with the arm revealed.
- It writes `scores/<setId>-<pageId>.md` and `.json`.

### Step 9: Docs

| File | Change |
|------|--------|
| `.context/text-model-eval.md` (new) | How to run the text eval, mirroring `image-generation.md:63-79`. Cover: the commands (dry run, probe, build cases, run with stage and prompt state, rating page, score); caps and overrides; the case sources and counts; arms and keys; pipeline versus isolated; output folder layout; blindness rules; that arms and prices are hard-coded in `arms.ts` while the baseline follows production config; the known limits (built multiplayer and ending cases come from the baseline, and there are no dated GPT-6 snapshots). |
| `CLAUDE.md` | One pointer line under "Additional context information" for `.context/text-model-eval.md`. |
| `.context/content-safety.md` | Line 23: the extra retries are LangChain's, now at most 2 per attempt and logged. So the filter's worst case is 2 service attempts × 3 calls. |
| `.context/ai-transparency.md` | Line 30: model ids are the defaults in `server/src/shared/llm/textModelSettings.ts`, and only gpt-4.x and gpt-6 families are accepted. Rows #1, #2, #5 and #6: add the new env names (`SETUP_MODEL_NAME`, `MULTIPLAYER_*`). Models are unchanged. |

`client/src/page/static/Privacy.tsx` needs no change: same processor, no new data category. Check it anyway and note the result in the follow-up.

### Step 10: Stage 0 run (no commit of outputs)

1. `npm run eval:text` (dry run) from `server/`. Paste the per-stage estimates into the follow-up.
2. `npm run eval:text -- --probe --max-spend 1`. Record what it found in the follow-up, and in `.context/text-model-eval.md` if it changes how the harness must call:
   - does temperature at none work;
   - is strict JSON accepted at medium;
   - does `prompt_cache_options` pass through;
   - are cache writes reported;
   - how does a refusal look.
   If the probe shows the gpt-6 request shape is rejected (for example `prompt_cache_options` refused), fix the factory and its test before anything else runs.
3. `npm run eval:text -- --build-cases --max-spend 0.75`.
4. **The pre-fix baseline**: `--run --stage 0 --prompt-state prefix --samples 1 --role setup,beat,analysis --mode isolated`.
   - **Budget rule.** Probe and case building come out of Stage 0's $6 first. The pre-fix run may use at most a third of what is left, because the post-fix baseline (2 samples, plus pipeline) needs about twice as much.
   - **If the dry-run estimate is above that**, cut in this order and record each cut in the follow-up: analysis cases, then multiplayer continuations, then beats outside the 15-case subset. Setup premises are never cut.
   - Pass the resulting cap as `--max-spend`.
5. Check `results.md`: measured token sizes per role, today's waits and retry rate, and the per-story cost. Put the headline numbers in the follow-up under "Borderline Insights".
6. **Layout check.** Run `--rating-page setup --preview --arms <baseline>` and the same for `turn`. Open the pages in Playwright via their `file:///D:/projects/chosenpath/DOCS/2026-09-26_gpt6-text-eval/rating/preview/…` URLs:
   - at desktop and mobile widths;
   - keyboard navigation;
   - export;
   - reload (autosave);
   - console messages.
   Then move any screenshots to `.playwright-mcp` and clear it in the same turn, and close the browser.
7. Run `npm run check:all` from the root. It must be clean.

## Tests

Put them in `server/tests/unit/shared/llm/`, `server/tests/unit/game/services/` and `server/tests/unit/evals/textModelEval/`, following the image-eval tests (relative imports, `@jest/globals`, and fixtures built in the test).

- **textModelSettings**:
  - with no env, today's models and temperature 0.2 per role;
  - `SETUP_MODEL_NAME` falls back to `GENERATION_MODEL_NAME`, and `GENERATION_*` still moves the template editor;
  - the multiplayer override applies only when its `_NAME` is set, and then fully;
  - a string temperature is parsed, and invalid values throw;
  - gpt-6 without effort throws, `minimal` throws for gpt-6, and effort on gpt-4.x is ignored;
  - an unknown family throws.
- **chatModel (wire shape).** Inject a fake `fetch` through `configuration`, run a real `withStructuredOutput(z.object(...)).invoke("x")`, and assert on the JSON request body:
  - gpt-4.1-mini: `temperature: 0.2`, no `reasoning_effort`, `prompt_cache_options` or `max_tokens`;
  - gpt-6-luna@none and gpt-6-sol@medium: no `temperature` key, the `reasoning_effort` value, `prompt_cache_options: { mode: "explicit" }`, no `max_tokens` or `max_completion_tokens`, `response_format.type === "json_schema"` with `strict: true`, and no `tools`;
  - verbosity passes through when set.
  - **Retries**: 500 then 200 with `maxRetries: 1` means 2 requests and one retry log line; 400 means 1 request. Give this test a 20 s timeout, because p-retry backs off from about 1 s with jitter.
- **usageRecorder**:
  - `callMetricsFromCompletion` reads every token type, `finish_reason`, `refusal`, `model` and `service_tier`, and defaults missing fields;
  - the logger emits one record per call with latency and metadata;
  - the error path records status, code and param.
- **turnTimings**:
  - the wait is measured from the last choice;
  - reading time only for the delivered turn;
  - the duplicate flag;
  - the map cap;
  - no text in records.
- **storyTextSteps**:
  - the beat schema flags: milestones for an ending or a non-first switch; multiplayer coordination; images;
  - `beatStep.apply` merges stat changes, milestones, facts, elements and introductions;
  - `analysisBefore` branches (switch; thread at 0 beats completed; none);
  - `partialTemplateSchema` keeps only the section fields and the right player slots.
- **BeatResolutionService.resolveChoice**: an exploration option against a challenge option.
- **arms and budget**:
  - `costFromUsage` with cached, cache-write and reasoning tokens;
  - the estimate switches from the table to measured medians at 3 records;
  - the caps: stage stop, global stop, the reason required above the default, refusal above $50, the reservation blocking concurrent over-spend.
- **runner**:
  - resume skips finished keys;
  - retries on 429 and 5xx but not 400;
  - baseline-first per case, and no candidates after a failed baseline;
  - setup before beats;
  - the spend stop;
  - a prompt-hash drift warning.
- **responseCheck**: valid, repaired with trailing text, refusal, length, 400 with `param`, timeout, schema mismatch, junk characters.
- **cases**:
  - parent/child pairing on a small fixture of 3 snapshots;
  - the continuation carries the child's choice and resolution and injects its phase;
  - `endingCase` yields `"ending"`;
  - subset selection is deterministic and stratified;
  - iteration cases contain no `creatorId` or `creatorUsername`;
  - no setup premise matches the blinding pattern.
- **textChecks**:
  - paragraph counting with image tags at a paragraph start;
  - option-count, sacrifice and option-type rules;
  - interludes;
  - an unknown id;
  - an image tag in the last paragraph;
  - a setup difficulty outside the set;
  - thread duration against the step count.
- **resultsReport**:
  - story cost with and without pregeneration;
  - `weightedQuantile`;
  - the gates: 60 s on both turn kinds, the cost cap, setup at 1.5× the median, the multiplayer marker and fail, the no-pregeneration flag;
  - the noise floor.
- **ratingSets and blinding**:
  - option order changes with the salt;
  - the baseline position is balanced across a 9-item set;
  - repeated and control items are present and mapped in the key;
  - a model id in a label, an arm key anywhere in the HTML, and an effort word in an instruction are all rejected;
  - "Luna" in story text is accepted.
- **ratingPage**:
  - no network references;
  - narrative containing `</script>` and `<b>` is escaped;
  - every option's text is present;
  - no arm key or key file name in the output.
- **ratingScore**:
  - labels map to arms;
  - acceptable rate, mean rank, and equal-or-better against the baseline;
  - repeated-item agreement;
  - a mismatched `pageId` is rejected.

No tests for static content: prompts, CSS, instruction copy, the premise texts, the price table values.

## Out of Scope

- **Prompt changes (the next milestone):**
  - the Stage 0 prompt-bug fixes and contradictions (test plan A7);
  - the intent defaults: portrait on the first beat only, and 3 interludes always;
  - stripping the creator fields in production template-iteration prompts.
- **Later runs and variants:**
  - the post-fix baseline and Stages 1–4 runs;
  - the Stage 3 `scaffold` schema variants and the Stage 4 message split, caching breakpoints and verbosity arms. Only the variant hook exists.
- **No production default change** for any role.
- **Other roles:** the content filter's labelled check and the template-editor smoke run. The iteration cases exist, but aren't run.
- **Pregeneration and client:**
  - cancelling duplicate pregenerations, and wiring `registerPendingProgression`;
  - any client change, including `DISABLE_PREGENERATION_FOR_MULTIPLAYER`.
- **Platform:** the LangChain upgrade, the Responses API, streaming, Fast mode and Flex.
- **Moving the setup-form merge logic to core.**
- **The play-test.**

## Architectural debt named

- **`AIStoryGenerator`** still mixes transport with mock-story handling and error wrapping. This plan moves only the pure role logic out, because that's the seam the eval strains. Mocks and error wrapping stay.
- **Loose production story instances.** `StoryProgressionService` and `ChoiceProcessingService` remain singletons that import the database. The eval sidesteps them through `storyTextSteps`, `ThreadResolutionService.resolveCurrentThreads` and `BeatResolutionService.resolveChoice` instead of making them injectable.
- **The premise merge logic is copied.** `setupPremises.ts` copies the client's category instructions. A future core move of `buildMergedPrompt` should delete the copy.

## Judgement calls (copy these into the follow-up file first)

1. **Transport.** The eval sends through the production factory with fetch-level raw capture, not the raw SDK. This measures exactly production's request; the test plan's A5 raw-SDK approach is rejected.
2. **Settings groups.** Five groups (setup split from the template editor), plus multiplayer overrides for beats and analysis. The existing env names keep their meaning, and `SETUP_*` falls back to `GENERATION_*`.
3. **Family allow-list.** Only gpt-4.x and gpt-6 families are accepted. Any other model name fails at startup.
4. **gpt-6 settings errors.** A gpt-6 model without an effort fails at startup rather than defaulting to none. A temperature set for a gpt-6 model is ignored with a warning, not treated as an error.
5. **Retries and timeouts.** Production gets 2 retries on every role, the filter included (so its worst case is 2 × 3 calls). Timeouts: 240 s setup and editor, 180 s beats, 120 s analysis, 60 s filter. The eval uses 0 retries and 300 s.
6. **Logging.** Per-call and per-turn logs carry story ids and numbers only. Reading time and duplicates are measured in memory, capped at 5,000 stories.
7. **The pregeneration tag.** It reaches per-call logs through a new optional `context` parameter on three `AIStoryGenerator` methods. This is one layer of threading, accepted over leaving the logs ambiguous.
8. **Extracted seams.** `storyTextSteps.ts` is new. The thread-resolution and choice-resolution logic move into their existing services. Production behaviour stays byte-identical.
9. **The runner is copied and adapted** from the image eval, not shared. The image harness stays untouched.
10. **Premises.** They are a frozen fixture; the client's merge logic is copied, not moved.
11. **Continuation count.** 38 continuations are 33 stored-output units plus 5 synthetic-choice units from unadopted snapshots. Two are cloned with images off.
12. **Gate readings:**
    - the 60 s cap applies to p95 of beat-only turns **and** of analysis turns separately (the stricter reading);
    - the setup cap compares median waits (p95 shown alongside);
    - the no-pregeneration view mixes beat-only and analysis turns at 15/29 and 14/29.
13. **Stage 0 budget split.** The pre-fix baseline may use at most a third of the Stage 0 money left after the probe and case building. If needed, cut analysis first, then multiplayer continuations, then beats outside the subset. Setup is never cut.
14. **Arm matrix.** Stage 1–2 follows the owner decisions, not test plan §4.3. That means no Sol none or Sol medium beat arms, no Sol analysis, and a 150-call rare-failure batch.
15. **Luna high reasoning estimate.** It assumes 12K reasoning tokens per call, because no source figure exists.
16. **Preview pages.** A `--preview` rating-page mode exists only for layout checks. A real blind page needs arms that don't exist before the next milestone.
17. **Planner limits.** The planner could not spawn explorer, architect or reviewer sub-agents, and had no Edit tool for the follow-up file. The architecture comparison and self-review were done inline; the review round did not happen.
