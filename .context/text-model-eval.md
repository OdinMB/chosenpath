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
  - `setupStep.request` passes its kind to the prompt: a custom story asks for one difficulty level, a template for 3–5.
  - AI Iteration (`TemplateService.iterateTemplate`) and the eval build their prompt with `StorySetupPromptService.createIterationPrompt`. It drops the template's `creatorId` and `creatorUsername` before the template is sent to OpenAI.
  - `storyTextTrims.ts` (eval only) derives the Stage 3 variants from these requests. Each is production's request minus the planning fields nothing reads after generation, and minus the prompt lines asking for them. Kept schema fields stay production's zod instances, shared across player slots where production shares them. Prompt edits are anchored on production's wording and apply only before the story state or premise. Each must match exactly once, so a production prompt edit near an anchor fails `storyTextTrims.test.ts` instead of silently undoing a trim: fix the anchor, not the prompt. Only `variants.ts` calls it. Delete it once Stage 3 is decided and Stage 4's rewrite supersedes it.
  - `storyTextRewrite/` (eval only) builds the Stage 4 split requests, for single-player beats (`beat.ts`; a multiplayer story throws) and custom-story setup (`setup.ts`).
    - `fixed`: the rules, each stated once across the whole request. It is byte-identical for every beat call, and for setup within the single-player class and within the multiplayer class, so it caches.
    - `perCall`: this call's branch instructions, then production's story state or configuration block (with the premise), verbatim.
    - `schema`: production's fields, types, key order and shared instances, with the named descriptions rewritten and the array counts enforced (`minItems`/`maxItems`). Production clauses that restate a rule the prompt carries are cut from the other descriptions (title, stat changes, milestones, new elements, facts and world building for beats; the stat lists, the stat's type, name, visibility, backgrounds flag and outcome-tracking clause, the background's multiplayer clause and the conversion rates' balance clause for setup). The tests pin each cut clause by name, since the exact-sentence check cannot see a paraphrase.
    - The with-examples setup carries production's example stat setups verbatim.
    - It reads production's prompt at four first-occurrence anchors: the state marker, `Number of players:`, `EXAMPLE STAT SETUPS` and `Character Selection Instructions`. A production edit there fails its tests: fix the anchor, not the prompt.
    - It does not import `storyTextTrims.ts`, so the trims stay deletable. Only `variants.ts` calls it.

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
  - Filters: `--role setup,beat,switch,thread,iteration` (`analysis` means switch plus thread), `--mode isolated|pipeline`, `--arms`, `--cases`, `--samples N`, `--subset15`, `--no-mp-continuations` (leaves out multiplayer beats other than first beats and endings), and `--rare-failure skip|only` (leaves out the rare-failure batch, or plans only it, so it can run after the analysis and the chains). The dry run takes the same filters.
  - Prompt states: `prefix` is before the prompt-bug fixes (Run A), `postfix` after. `--run` refuses `prefix`: the pre-fix prompts exist only in Run A's records, so a resumed prefix run would mix post-fix prompts into pre-fix results.
  - The post-fix prompts (Milestone 2, test plan A7) fix these on today's models:
    - thread beats see their own thread's beat texts;
    - the ending sees the thread it wraps up, the outcomes, and the stats' "Adjustments after threads";
    - only switch beats are told to "create the next switch";
    - a later switch beat keeps its thread-resolution instruction;
    - single-player switch analysis gets a single-player example;
    - the premise and iteration feedback are sent verbatim in `<premise>`/`<feedback>` tags, not upper-cased;
    - the "show other players' images" note goes to multiplayer stories;
    - six separator and punctuation slips.
  - They also resolve eight contradictions:
    - the player's own portrait is allowed in the first beat only;
    - 3 interludes even with images off;
    - basePoints +5 to −15, sacrifice +30 and reward −30 (`POINTS_FOR_SACRIFICE`/`POINTS_FOR_REWARD`);
    - one difficulty level for a custom story;
    - the schema's `backgroundArchetypes` name;
    - ±20 for a major stat effect;
    - 3–5 sentences per paragraph;
    - 3–4 *visible* shared and player stats plus any invisible ones.
  - The checkers follow the corrected rules: visible stat counts, and sacrifice and reward at exactly ±30. Endings are not held to three options, because the ending prompt asks for none.
  - Paragraphs are split as the game shows them. `playerText.ts` copies the client's `normalizeStoryText` (`client/src/game/utils/storyTextProcessor.ts`), so a single newline starts a paragraph and an image line joins the paragraph after it. The paragraph, sentence and image-placement checks and the rating pages all use it. Keep it in step with the client function.
- `--rating-page setup|turn --arms <baseline,cand1,…> [--items N] [--per-item K]`: a blind rating page.
  - An arm is `armKey` or `promptState:armKey`; the first arm is the baseline.
  - `--per-item K` shows the baseline plus K candidates per item. Every K-subset appears once per cycle, the least-shown first, so with 3 candidates, K = 2 and 9 items each candidate is on 6 items. The baseline's label also shifts once per cycle, so each pair meets it at every label. Subsets are handed out in stratum order (setup: player count first), so each candidate is spread over the strata; the page still shows the items in salted order. The repeated item keeps the arms of the item it repeats. Every arm still needs a usable sample 1 on a case for that case to qualify.
  - `--cases a,b,…` limits the regular items to those cases; the baseline-against-baseline control still comes from the other cases.
  - Post-fix pages need `--prompt-state postfix` (or `postfix:<armKey>` refs), because a bare arm key defaults to `prefix`.
  - `--preview` allows a single arm and shows a banner. `--preview --stored` builds a layout-only page from stored beats and custom-story setups, with no eval output needed.
- `--rerender-page <pageId>`: renders the page of an existing key afresh from the stored outputs, after a rendering fix. The page id, items and labels stay the same, so ratings a browser has already saved still apply, and the key is not rewritten. It writes `rating/text-<kind>-<pageId>.html`, so rename it over the handed-out file.
- `--score <ratings-export.json>`: scores an export against its answer key.

**Budget** (owner, 2026-09-26).
- The target is about $25 overall; the hard cap is $30.
  - Going a little over $25 is justified because the owner explicitly prioritised Sol for story setups.
  - Setup inputs are also 21–23K tokens with the schema, not the 15K the test plan assumed.
- Stage caps: Stage 0 (probe, case building, both baselines) $8, Stages 1–2 $13, Stage 3 $3, Stage 4 $4.
- A stage cap above its default (`--stage-cap`) needs `--over-target-reason "<why>"`, which is appended to `budget-overrides.jsonl`. `--global-cap` can only lower the $30; no flag or reason raises it.
- `--max-spend` caps one invocation.
- The runner reserves each call's estimate, re-sends included, before it starts, so parallel calls overshoot a cap only by the estimates' error. Setup estimates read low (see Estimates), so with 6 calls in flight a setup invocation can pass a cap by up to about $0.1.
- Groups run setup first and pipeline chains last. A cap stop cuts from the end of that order, so the chains go first and Sol setup is reached last.
- The owner's shrink order when a dry run predicts an overrun:
  1. `--no-mp-continuations`;
  2. analysis at one sample (`--role analysis --samples 1`);
  3. never Sol setup.
- Probe spend counts against Stage 0, including earlier probe runs (`priorSpendUsd`).

**Runner.**
- Transport failures (429, 5xx, timeouts, dropped connections) retry after a backoff, on their own budget of 3.
- A reply production's LangChain parse rejects is re-sent at once, at most `PRODUCTION_MAX_RETRIES` (2) times, as production does. That covers `repaired` (text after the JSON), `invalid-json`, `schema-mismatch`, `length` and `refusal`.
- A 400 is never retried. One naming a parameter (`rejectedParam`) leaves its job open: the next invocation plans it again. `finishesJob` in `runner.ts` is the one definition of finished, used for resuming, for case building (`finishingRecord`) and for the variant section's pairs. Validity, the call count, the cost and input-cost means and the cache readings leave such attempts out, like transport failures, and the rejected-parameter rate still reads over all records. So a request-shape bug found by a smoke run leaves no dead job, and a job still waiting for its re-run is neither a matched pair nor a $0 call.
- Every attempt is a record in `calls.jsonl`. Attempts are numbered after those already recorded for the job and step, so a re-run (a re-planned rejected request, or a job resumed part-way) gets new callIds and never overwrites an earlier attempt's `outputs/<callId>.json`. A job without records starts at attempt 1.
- **Split requests** (Stage 4) go out per model family (`chatInput` in `executor.ts`):
  - gpt-6: a `developer` message whose text part carries `prompt_cache_breakpoint: { mode: "explicit" }` (the factory already sends explicit cache mode), then the user message;
  - gpt-4.x: a plain `system` message, then the user message. Its implicit prefix cache needs no breakpoint, and the field is gpt-5.6+ only.
  - The factory is unchanged and no TTL is set. The stored prompt holds both parts around `MESSAGE_SEPARATOR`.
- **Warm-first scheduling.** A split request's job carries a cache line: the first 12 characters of `sha256(arm key | JSON schema | fixed)`, copied onto every record of the job.
  - The first call of a line runs alone. The rest of the line starts once it has finished, whatever its outcome. Other lines, and jobs without a line, are never held.
  - A worker left with only held jobs waits for a warm-up to finish, then checks for a stop again.
  - Cases queue in turn order: story, then turn; setup by player count. GPT-6's fixed block is story-independent, so this mainly helps gpt-4.1-mini's implicit cache of a story's state prefix.

**Arms.** They are hard-coded in `arms.ts`. The baseline alone follows production config (`baselineArm` → `resolveTextModelConfig`), so "as in production" is literal.
- Arm key format: `<model>@<effort | t<temperature>>[+v<verbosity>]/<variant>`, for example `gpt-6-luna@medium/prod` or `gpt-4.1-mini@t0.2/prod`. A chain's key is `pipeline:<analysis key>><beat key>`. `arms.ts` owns both formats (`armKey`, `referenceKey`, `chainKey`, `chainSides`), so build and parse keys only through them.
- Variants (`variants.ts`): `prod` is what production sends, and Stage 3's "full" form. `slim` (beats only) drops the stats list, the multiplayer coordination note and six plan strings; `showDontTell` stays, and the options check keeps `previousOptionsToAvoid` and `upToOneSacrificeOrRewardOption`. `minimal` (setup, beats, switch, thread) drops every field test plan §5 lets Stage 3 drop. Every rule a dropped line carried stays as one sentence, so Stage 3 measures "written plan versus private plan", not "fewer rules".
  - Stage 4's split requests (`storyTextRewrite/`): `rewrite` is beats on production's full planning fields and setup with production's example stat setups; `rewriteSlim` is beats on the slim fields; `rewriteZeroShot` is setup without the examples. A variant throws on a role it does not cover.
- **References.** `referenceKey` names the arm a variant arm is read and estimated against. With a verbosity part, it is the same key without it. Otherwise it is the variant's base (`VARIANT_REFERENCE`): slim, minimal and rewrite → prod; rewriteSlim → slim; rewriteZeroShot → rewrite; prod has none. The baseline can be a reference: `gpt-4.1-mini@t0.2/rewrite` reads against today's `gpt-4.1-mini@t0.2/prod`.
- Scopes: `all`, `subset15` (beats only), `single-player` (any role), plus an optional per-arm case list. `--cases` still intersects.
- Stage 1–2 (owner decisions, 2026-09-26):
  - Setup: Sol low ×2, medium ×1, none ×1; Luna none, low and medium ×2.
  - Beats: Luna medium, none and low on all cases ×2; Luna high on the 15-case subset ×2; Sol low on the subset ×1.
  - Analysis: Luna none, low and medium ×2.
  - Pipeline: Luna low analysis, then each Luna beat arm.
  - Rare-failure batch: 50 extra single-sample Luna beat calls per effort.
- Stage 3 (Milestone 3). This is the coordinator's carry-forward, chosen before the owner rated Round 1. The full forms are the Stage 1–2 `prod` records and are not re-run. So run Stage 3 with `--prompt-state postfix`: the comparison pairs arms only within one prompt state.
  - Setup: Sol low minimal on 9 premises (`STAGE3_SETUP_PREMISES`: 3 per player count, every game mode, a Kids premise and three dark ones) ×1. Luna low minimal on all 18 ×2.
  - Beats: Luna medium and Luna low, each slim and minimal, and a Luna none minimal control, on single-player cases ×2. The control comes last, so a cap stop cuts it first.
  - Analysis: Luna low minimal ×2.
  - Pipeline: Luna low minimal analysis, then Luna medium minimal and Luna low minimal beats, on single-player analysis cases ×1 (`pipelinePlan`). The baseline chain stays on every case.
  - Dry run of 2026-09-26: $2.38 isolated plus $0.18 for chains, against the $3 cap.
- Stage 4 (Milestone 3, the coordinator's carry-forward): the GPT-6-style rewrite. No analysis arms and no chains. Run it with `--prompt-state postfix`.
  - Setup on the 9 `STAGE3_SETUP_PREMISES` ×1: Sol low and gpt-4.1 (production's default settings), each `rewrite` and `rewriteZeroShot`.
  - Beats on single-player cases, in this order: Luna medium `rewriteSlim` ×2 (the lead), gpt-4.1-mini `rewrite` ×1 (does the cleanup help today's model?), Luna medium verbosity low `rewriteSlim` ×1, and Luna medium `rewrite` ×1 (the full-scaffold hedge).
  - Dry run of 2026-09-26: 256 jobs (setup 36, beat 220), $3.62 uncached against the $4 cap. Setup estimates read low (see Estimates), so about $4.1 uncached is the realistic figure, over the cap as the plan expected.
- Prices per 1M tokens are in `pricing.ts`, with the cost and estimate functions. Cost = (I − C − W)·in + C·cached + W·write + O·out, where O already includes reasoning.
- Estimates count the JSON schema as input (`requestChars` in `jobPlan.ts`), because OpenAI bills it: the production schemas alone are 4K to 16.5K tokens (setup about 14K, a 1-player beat about 4.5K, a 3-player beat about 15K).
- Until a new variant has `MIN_MEASURED_RECORDS` measured outputs, it borrows them from its reference chain: `referenceKey` is walked until a key has enough (the verbosity arm → `rewriteSlim` → slim → prod). A trim writes less than its full form, so its estimate errs high. Without the borrowing, Luna medium would be priced at the §2.2 guess of 6,200 reasoning tokens (measured: about 1,600), and the cap would refuse a run that fits.
- Estimates ignore caching: every input token is priced uncached, so a Stage 4 estimate reads high when caching works.
- Input is estimated at 4 characters per token, which undercounts the JSON schema: it bills at about 1.8 characters per token. Setup input therefore reads about 6–7K tokens (28–32%) low per call (Stage 3 Sol minimal: 14.6–15.2K estimated, 20.4–22.3K measured), while beats are about right. A setup estimate is not conservative: check a setup invocation against measured per-call costs (a Sol or gpt-4.1 rewrite setup is about $0.09 uncached), not against the pre-run refusal alone.

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
- **Template iteration: 5**, with `creatorId` and `creatorUsername` removed (the prompt builder drops them as well). No stage runs them yet.
- **The 15-case subset**, hash-ordered: 9 single-player continuations, 2 first beats, 3 multiplayer and 1 ending.

**Output folder** (`DOCS/2026-09-26_gpt6-text-eval/`, gitignored). The layout is listed in `evalFiles.ts`: `calls.jsonl`, `budget-overrides.jsonl`, `probe.json`, `cases/`, `outputs/<callId>.json` (raw body, parsed output, metrics), `prompts/<sha256>.txt`, `rating/`, `keys/`, `scores/` and `results.md`.

**Blindness.**
- Item ids are `setup-NN` or `turn-NN`, and labels are A–D. The option order comes from `sha256(salt|item|arm)` with a fresh salt per page, and the baseline's position cycles across the labels.
- Every non-narrative string must pass `LEAK_PATTERN` (`blinding.ts`): the title, instructions, field labels and context headings. Context headings are fixed text; character names go in the lines.
- The final HTML must not contain any arm key, model id, `@effort` or `/variant` from the key, nor the key's file name.
- Narrative is exempt from the word pattern: "Luna" and "Sol" are common names.
- The page is written only if nothing leaks. Keys go to `keys/`, never next to the pages.

**Gate readings in `results.md`.** These are readings, not verdicts. Each is marked within or over, no arm is dropped, and the owner decides which reading applies. Each post-fix section also prints today's production (the pre-fix baseline's per-story cost and setup waits).
- Modules: `pricing.ts` prices calls, `armStats.ts` computes the per-arm statistics, `gateReadings.ts` the readings below, and `variantComparison.ts` the variant readings. `resultsReport.ts` renders all of them and computes none.
- **Validity** (`validityGate.ts`), per isolated arm:
  - at least 98% valid on the first model attempt;
  - 100% valid within production's 2 retries;
  - worse than the same role's baseline only at a one-sided Fisher exact p < 0.05 on first-attempt failures. 1 in 100 against 0 in 115 gives p = 0.47.
  - Transport failures are left out, and `repaired` counts as invalid.
  - The diagnostic rates (repaired, refusal, length, text after JSON, junk) are read from first attempts.
- **60 s:** p95 at most 60 s, separately for beat-only turns and for analysis turns.
- **Cost:**
  - The per-story cost against the baseline's on two bases: billed against billed, and uncached against uncached. Uncached is caching off: cache reads and cache writes are both priced as plain input. No record before Stage 4 has cache writes, so that changed no earlier figure.
  - With pregeneration that is 85 beats, 19 switch calls, 21 thread calls and 1 setup; without it, 29/7/7.
  - A call's cost sums its attempts.
  - Each role is priced at the story's player count when such calls exist, else at the mean over all calls. The summed analysis-turn wait uses single-player waits, since multiplayer calls carry more output.
- **Setup:** at most 1.5 × today's wait, read on the median and on the p95 side by side.
- **Multiplayer:**
  - Above the baseline p95 + 5 s, the arm is marked "needs multiplayer pregeneration"; above 60 s it fails.
  - The cost per custom story by player count is shown without multiplayer pregeneration (29/7/7 calls) and with it (85/19/21, an approximation: it pregenerates the last player's options), on both bases.
- **No pregeneration** (reported, not gated): flagged when the full-turn median is at most 5 s and its p95 at most 8 s. The full turn mixes beat-only and analysis turns at 15/29 and 14/29.
- **Variants against their reference (Stage 3 trims, Stage 4 rewrite).** Each non-baseline variant arm is read against its reference arm (`referenceKey`) in the same group and prompt state; the baseline's records can be the reference. Both sides are read on the (case, sample) pairs both finished. The reference's other cases and its rare-failure samples are left out. Columns read reference → arm.
  - Rows: median visible and reasoning tokens, p50/p95 waits, $/call and its share of a single-player story (85/19/21 calls, one setup), first-attempt validity, and mean state counts per call. The counts are facts, new elements, introductions, stat changes, `words` (prose, image tags stripped) and `planChars` (the plan's JSON length) for beats; elements and stats for setup; switches; threads.
  - Input and caching: cache lines, calls that wrote a cache, the cache read share, median input tokens, input $/call and $/call billed and uncached, and the 1-player-story share on both bases.
  - Noise: the reference's sample 1 against its sample 2 on the matched cases, for rule rates and counts. Rule checks are flagged lower or higher only beyond it. A one-sample arm (setup, gpt-4.1-mini, the verbosity arm) is flagged against a two-sample reference; only a reference with a single sample there shows raw rates without flags. Since Stage 4, Stage 3's Sol setup reads flags too.
  - Chains give the analysis-turn wait, and setup shows medians by player count.

**Known limits.**
- The built multiplayer and ending cases come from the baseline or from synthetic settings, not from real play.
- There are no dated GPT-6 snapshots, so a later rerun may meet a changed model.
- Run A (2026-09-26) did the probe, the case build and the pre-fix baseline for $2.39 of Stage 0. Its measured sizes, waits and per-story cost are in `DOCS/2026-09-26_gpt6-text-eval/2026-09-26_run-A-report.md`.
- The baseline's billed cost includes gpt-4.1's implicit cache hits, which depend on how close together the eval sends its calls. `results.md` shows the uncached figure beside it.
- Waits count each attempt alone, not the re-sends in front of it. If re-sends pass about 1%, the 60 s gate should read the summed wait per call.
- A call that hangs until the 300 s timeout is a transport failure. It is retried, left out of validity, and absent from every wait percentile. Round 1 had 4 such hangs in 714 Luna turn calls, so count them separately (`outcome` `timeout` in `calls.jsonl`).
- Stage 3's full forms are Round 1's records, so the trimmed waits carry server drift; tokens and cost do not. Multiplayer trims are unit-tested but not measured, because Stage 3 turns run single-player only.
- GPT-6's cache is measured at its default TTL: the eval sets no `ttl`.
- Multiplayer beats are not rewritten: the Stage 4 builder throws on them, and Stage 4 turns run single-player only. A multiplayer rewrite needs its own measurement before any multiplayer adoption.
- The rewrite keeps a few production descriptions that touch a prompt rule on purpose: the planning fields that ask the model to apply one (beat `optionConsiderations` and `newIntroductionsOfStoryElements`; setup `characterSelectionPlan.multiplayerCoordination`), the fields' own definitions (a story element's `instructions`, a fact's `storyElementId` allowing `world`, a character name unique across players), and production-internal repeats inside the schema (the stat's ±10/±20 effect sizes). They define or plan a field rather than restate the rule. Everything else a prompt rule restated is cut and pinned in the tests.
- The generic views pair a variant beat arm with the analysis arm of the same key (`configsFor`), else with the baseline's analysis, which is what every Stage 4 beat arm gets there. Read the variants from their own section.
- Round 1 (2026-09-26) ran the post-fix baseline ($4.03) and Stages 1–2 ($12.09), $18.51 in total. The owner's report is `DOCS/2026-09-26_gpt6-text-eval/2026-09-26_round1-report.md`. The rating pages are `rating/round1-setup.html` and `rating/round1-turns.html`; their keys are `keys/round1-*.json`.
- Until the Stage 3 run, the checks and pages split paragraphs on blank lines only. gpt-4.1-mini sometimes separates paragraphs with single newlines, so its post-fix paragraph and image-placement rates read low: 92.9% and 90.2%, now 100% and 96.4%. GPT-6 figures did not change. `round1-turns.html` was re-rendered with `--rerender-page`, and one option changed.
- Stage 3 (2026-09-26) cost $2.26, which brings the total to $20.77. The owner's report is `DOCS/2026-09-26_gpt6-text-eval/2026-09-26_stage3-report.md`. The Round 2 turn page is `rating/round2-turns.html`, and its key is `keys/round2-turns-891345004e.json`. No Round 2 setup page was built.
- Stage 4 (2026-09-26) cost $3.99 of its $4 cap, which brings the ledger total to $24.76. The ledger books its 43 hung GPT-6 calls at their estimate ($0.51); if OpenAI billed them as 300 s replies, the real figure is about $1.3 higher. The owner's report is `DOCS/2026-09-26_gpt6-text-eval/2026-09-26_stage4-report.md`. The Round 3 turn page is `rating/round3-turns.html`, and its key is `keys/round3-turns-291fb89390.json`. The verbosity arm and the full-scaffold hedge did not fit; gpt-4.1 setup ran on 6 premises with examples and 5 without (one job left open by the cap).
- The Stage 4 rewrite's exact array counts (`minItems` equal to `maxItems`: interludes, facts, identities and others, with the count taken out of the description) make models pad: gpt-4.1 setups ran away in whitespace to the 32,768-token limit on 3 of 12 first attempts and Luna left a blank interlude in 13 of 88 turns. GPT-6 also hung on 43 of 149 attempts, probably the same loop (not proven: a hang leaves no reply). No check reads blank list items, so validity and the rule checks read 100% on them.
- The runner retries a timeout up to 3 times (`backoffsMs`), production twice (`PRODUCTION_MAX_RETRIES`), and validity leaves transport failures out. So a job that finished in the eval can still fail in production: 4 of 88 Stage 4 Luna rewrite turns answered only on a fourth attempt. Read hangs per job from `calls.jsonl`.
