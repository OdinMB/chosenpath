# Text models: settings, call logs, and the text-model eval

## Production text calls

- **One factory.** Every text `ChatOpenAI` comes from `createChatModel` in `server/src/shared/llm/chatModel.ts`. Don't construct `ChatOpenAI` anywhere else.
- **Two model families, each with a pinned request shape.** Any other model name throws at startup.
  - `gpt-4.1*` and `gpt-4o*` send `temperature`.
  - `gpt-6-*` never sends temperature. It always sends `reasoning_effort` (none, low, medium or high; `minimal` is rejected) and `prompt_cache_options: { mode: "explicit" }`, all through `modelKwargs`. LangChain 0.6.7 does not recognise gpt-6 as a reasoning model.
  - `maxTokens` is never set, because 0.6.7 would send it as `max_tokens`.
  - Structured output stays on the default strict `json_schema`.
- **Per-role settings** live in `server/src/shared/llm/textModelSettings.ts`. `server/src/config.ts` resolves them once as `TEXT_MODEL_CONFIG`. Each group reads `_NAME`, `_TEMPERATURE` (parsed as a number, 0–2) and `_REASONING_EFFORT`. An empty value counts as unset.

  | Group | Env prefix | Default |
  |---|---|---|
  | Custom-story setup | `SETUP_MODEL_*`, or all of `GENERATION_MODEL_*` when `SETUP_MODEL_NAME` is unset | gpt-4.1 |
  | Template editor (AI Draft, AI Iteration) | `GENERATION_MODEL_*` | gpt-4.1 |
  | Beats | `TEXT_MODEL_*`; `MULTIPLAYER_TEXT_MODEL_*` for multiplayer when its `_NAME` is set | gpt-4.1-mini |
  | Switch and thread analysis | `SWITCH_THREAD_MODEL_*`; `MULTIPLAYER_SWITCH_THREAD_MODEL_*` likewise | gpt-4.1-mini |
  | Content filter | `CONTENT_FILTER_MODEL_*` | gpt-4.1-mini |

  - The default temperature is 0.2.
  - Effort is ignored on gpt-4.x, so an old `..._REASONING_EFFORT=minimal` keeps working.
  - On gpt-6 a missing effort throws. A set temperature is dropped with one warning.
  - A multiplayer override takes all its fields from its own prefix and inherits nothing.
- **Retries and timeouts.** Every production call retries at most twice (`PRODUCTION_MAX_RETRIES`), and each retry is logged. A custom `onFailedAttempt` replaces LangChain's default policy, so `retryHandler` re-applies it: no retry on 400–409, cancel/abort or `insufficient_quota`. Timeouts (`PRODUCTION_TIMEOUT_MS`): 240 s for setup and the template editor, 180 s for beats, 120 s for analysis, 60 s for the filter. A malformed JSON reply fails inside LangChain's retried section, so it is retried too.
- **Model-free seams.** `server/src/game/services/storyTextSteps.ts` holds the exact prompt and schema of each story role (`setupStep`, `beatStep`, `switchStep`, `threadStep`, `partialTemplateSchema`), how a reply changes the story (`apply`), and `analysisBefore`. Thread resolution is `ThreadResolutionService.resolveCurrentThreads`, and choice resolution is `BeatResolutionService.resolveChoice`. None of these touch the database. Production and the eval both build their requests here, so a prompt change here changes what the eval measures.

## Call and turn logs (no text, no user ids)

- **`[LLM] {…}`** comes from `llmCallLogger` in `server/src/shared/llm/usageRecorder.ts`, one line per call. It carries:
  - role, model and effort;
  - `metrics`: input, cached, cache-write, output and reasoning tokens, finish reason, a refusal flag, the served model and the service tier;
  - `ms`, and `error` {status, code, param} on failure;
  - the invoke tags: storyId, turn (the turn being generated), players, beatType (beats only), images and pregeneration.

  Only these tag names pass (`tagsFrom`); any other metadata is dropped. The factory puts `role` into the model's metadata, and callers pass the story tags as `invoke(prompt, { metadata })`.
- **`[LLM] retry {…}`** is one line per retry: role, attempt, retriesLeft, status, code and name.
- **`[TurnTiming] {…}`** comes from `server/src/game/services/turnTimings.ts`, which keeps in-memory timestamps for at most 5,000 stories. It logs three events:
  - `delivered`, with the wait since that story's last choice. It fires only when a broadcast carries a higher turn; choice and image broadcasts don't count.
  - `choice`: reading seconds (only for a choice on the delivered turn), pregeneration `complete`/`partial`/`none`, and `duplicate`. `duplicate` means the pregeneration was not complete and still running, so the live progression repeats it.
  - `pregeneration`: seconds and ok.
- Retention is the host's log retention.

## The text-model eval (`server/src/evals/textModelEval/`)

Run everything from `server/`. The harness finds `data/` and `server/.env` relative to the working directory, refuses `NODE_ENV=production`, and never touches the database.

**Commands** (`npm run eval:text -- …`):

- *(no flags)*: the dry run. It prints the cases, the jobs, and the estimated $ and minutes per stage against the caps. No API calls.
- `--probe [--max-spend 1]`: what Sol and Luna accept.
  - Raw SDK checks: a small strict schema at none, low, medium and high; temperature with effort, `minimal`, verbosity, explicit and implicit caching, and a cache breakpoint. Each cache check has its own prefix, so one check's cache write cannot show up as another's read.
  - Every production schema, capped at 64 output tokens: at all four efforts on Luna, at low on Sol (schema validation does not depend on effort).
  - Full completions through the production path: Sol medium, Luna medium and Luna high.
  - Checks run cheapest first. The tail is skipped at the cap.
  - Findings of 2026-09-26 (about $0.47): every schema accepted on both models; temperature 0.2 accepted at none and rejected above it; `minimal` rejected (the API lists none, low, medium, high and xhigh); explicit caching writes nothing, the implicit default writes the whole prompt; a breakpoint is read back on the repeat; cached, cache-write and reasoning tokens are all reported.
- `--build-cases [--rebuild-cases] [--max-spend 0.75]`: plays templates forward with the baseline and freezes every case. It refuses to overwrite frozen cases without `--rebuild-cases`, because rebuilding changes the inputs.
- `--run --stage 0|1-2|3|4 --prompt-state <tag>`: the replay. It refuses to start when the estimate exceeds a cap, stops scheduling when the next call would, and resumes from `calls.jsonl`. It rewrites `results.md` at the end.
  - Filters: `--role setup,beat,switch,thread,iteration` (`analysis` means switch plus thread), `--mode isolated|pipeline`, `--arms`, `--cases`, `--samples N` and `--subset15`.
  - Prompt states: `prefix` is before the prompt-bug fixes, `postfix` after.
- `--rating-page setup|turn --arms <baseline,cand1,…> [--items N]`: a blind rating page.
  - An arm is `armKey` or `promptState:armKey`; the first arm is the baseline.
  - `--preview` allows a single arm and shows a banner. `--preview --stored` builds a layout-only page from stored beats and custom-story setups, with no eval output needed.
- `--score <ratings-export.json>`: scores an export against its answer key.

**Budget.**
- The owner's target is $25 overall. Stage caps: Stage 0 (probe, case building, both baselines) $6, Stages 1–2 $12, Stage 3 $3, Stage 4 $4.
- A cap above its default (`--stage-cap`, `--global-cap`) needs `--over-target-reason "<why>"`, which is appended to `budget-overrides.jsonl`. The global cap can never exceed $50.
- `--max-spend` caps one invocation.
- The runner reserves each call's estimate before it starts, so parallel calls cannot overshoot.
- Probe spend counts against Stage 0, including earlier probe runs (`priorSpendUsd`).

**Arms.** They are hard-coded in `arms.ts`. The baseline alone follows production config (`baselineArm` → `resolveTextModelConfig`), so "as in production" is literal.
- Arm key format: `<model>@<effort | t<temperature>>[+v<verbosity>]/<variant>`, for example `gpt-6-luna@medium/prod` or `gpt-4.1-mini@t0.2/prod`.
- Stage 1–2 (owner decisions, 2026-09-26):
  - Setup: Sol low ×2, medium ×2, none ×1; Luna none, low and medium ×2.
  - Beats: Luna medium, none and low on all cases ×2; Luna high on the 15-case subset ×2; Sol low on the subset ×1.
  - Analysis: Luna none, low and medium ×2.
  - Pipeline: Luna low analysis, then each Luna beat arm.
  - Rare-failure batch: 50 extra single-sample Luna beat calls per effort.
- Stages 3 and 4 have no arms until their variants exist (`variants.ts`; only `prod` so far).
- Prices per 1M tokens are in `arms.ts`. Cost = (I − C − W)·in + C·cached + W·write + O·out, where O already includes reasoning.
- Estimates count the JSON schema as input (`requestChars` in `jobPlan.ts`), because OpenAI bills it: the production schemas alone are 4K to 16.5K tokens (setup about 14K, a 1-player beat about 4.5K, a 3-player beat about 15K).

**Isolated versus pipeline.**
- Isolated: every beat arm gets the same fixed analysis (the stored one, or the baseline's for built cases).
- Pipeline: a chain runs the analysis call, applies it with the production step, then runs the beat built from it. The chain's summed latency is the analysis-turn wait the 60 s gate reads. Without a chain, the report adds the p95s of the analysis and the beat (conservative).

**Cases.** Built by `cases.ts` and `caseBuilder.ts`, frozen under `cases/`.
- **Stored continuations: 33 units.** A pregeneration `P(k,j)` is *adopted* when its latest beat reappears in `story.json` or any `P(k+1,·)`. Each adopted state, or `story.json`, is paired with every complete pregeneration made from it.
  - Measured 2026-09-26: 8988006e 18, 6edd813c 6, 7492b211 3, 2ee343b6 3, and the checkpoint 3, as the test plan expected.
  - The input carries the child's choice, roll and phases, so thread resolution is exactly what happened in play. The child's new phase is the fixed analysis. Its beat is the stored output.
- **Synthetic continuations: 5**, from unplayed snapshots. The choice is picked by hash and resolved at build time; 2 of the 5 have images off. The case state is always frozen past thread resolution: `resolveCurrentThreads` rolls dice (challenge threads) and is not idempotent, so it never runs at replay time.
- **Endings: 3.** `maxTurns` is set to the turn on a stored unit whose choice resolves the thread. Production reaches the ending through `getCurrentBeatType() === "ending"` after resolution. `determineNextBeatType` never returns "ending" at that point.
- **Built from templates:** 6 playable multiplayer templates (contest modes first) and 9 single-player ones. They give 3 single-player and 6 multiplayer first beats, 6 multiplayer continuations, and a switch and a thread case per template. Templates whose extra player slots have no characters or backgrounds are skipped.
- **Setup premises: 18** (`setupPremises.ts`). 13 are merged with a copy of the client's `buildMergedPrompt`, and 5 are reconstructed from stored custom stories. A test checks that no premise matches the blinding pattern.
- **Template iteration: 5**, with `creatorId` and `creatorUsername` removed. They are not run in M1.
- **The 15-case subset**, hash-ordered: 9 single-player continuations, 2 first beats, 3 multiplayer and 1 ending.

**Output folder** (`DOCS/2026-09-26_gpt6-text-eval/`, gitignored). The layout is listed in `evalFiles.ts`: `calls.jsonl`, `budget-overrides.jsonl`, `probe.json`, `cases/`, `outputs/<callId>.json` (raw body, parsed output, metrics), `prompts/<sha256>.txt`, `rating/`, `keys/`, `scores/` and `results.md`.

**Blindness.**
- Item ids are `setup-NN` or `turn-NN`, and labels are A–D. The option order comes from `sha256(salt|item|arm)` with a fresh salt per page, and the baseline's position cycles across the labels.
- Every non-narrative string must pass `LEAK_PATTERN` (`blinding.ts`): the title, instructions, field labels and context headings. Context headings are fixed text; character names go in the lines.
- The final HTML must not contain any arm key, model id, `@effort` or `/variant` from the key, nor the key's file name.
- Narrative is exempt from the word pattern: "Luna" and "Sol" are common names.
- The page is written only if nothing leaks. Keys go to `keys/`, never next to the pages.

**Gates in `results.md`.** The report never picks a winner.
- **60 s:** p95 at most 60 s, separately for beat-only turns and for analysis turns.
- **Cost:** the per-story cost is at most the baseline's. With pregeneration that is 85 beats, 19 switch calls, 21 thread calls and 1 setup; without it, 29/7/7. A story is priced from single-player calls only, and the summed analysis-turn wait from single-player waits, since multiplayer calls carry more output.
- **Setup:** the median wait is at most 1.5 × the baseline median; p95 is shown alongside.
- **Multiplayer:** above the baseline p95 + 5 s, the arm is marked "needs multiplayer pregeneration"; above 60 s it fails.
- **The owner's exception:** flagged when the no-pregeneration full-turn median is at most 5 s and its p95 at most 8 s. The full turn mixes beat-only and analysis turns at 15/29 and 14/29.

**Known limits.**
- The built multiplayer and ending cases come from the baseline or from synthetic settings, not from real play.
- There are no dated GPT-6 snapshots, so a later rerun may meet a changed model.
- Run A (2026-09-26) did the probe, the case build and the pre-fix baseline for $2.39 of Stage 0. Its measured sizes, waits and per-story cost are in `DOCS/2026-09-26_gpt6-text-eval/2026-09-26_run-A-report.md`.
- The baseline's billed cost includes gpt-4.1's implicit cache hits, which depend on how close together the eval sends its calls. `results.md` shows the uncached figure beside it.
