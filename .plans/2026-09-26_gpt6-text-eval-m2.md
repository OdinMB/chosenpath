# GPT-6 text eval, Milestone 2: prompt-bug fixes on today's models, the new budget, and every gate reading in the report

- **Date**: 2026-09-26
- **Status**: draft
- **Type**: bugfix (dominant: the production prompt fixes; the harness items are small features, planned with a balanced lean)
- **Complexity**: complex
- **Branch**: `gpt6-text-eval` (already checked out; never switch, push, rebase or reset)
- **Sources**: test plan `DOCS/2026-09-26_gpt6-text-model-test-plan.md` §6, §9 D6 and Appendix A7 (read-only). Milestone 1 plan: `.plans/completed/2026-09-26_gpt6-text-eval-m1.md`. Run A report: `DOCS/2026-09-26_gpt6-text-eval/2026-09-26_run-A-report.md`. Harness docs: `.context/text-model-eval.md`. Where the test plan conflicts with the owner decisions of 2026-09-26 (in the task that launched this plan), the owner decisions win; this plan already applies them.

## Before you start

- **Commits.** Commit with a pathspec on the commit itself: `git commit -m "…" -- path/one path/two`. Stage new files by explicit path first (`git add path/one`), because `git commit -- <path>` rejects untracked paths. Never `git add -A`, `git add .` or `git commit -a`. The untracked `.plans/*-followup.md` files from other runs are not yours; the only one you may touch is `.plans/2026-09-26_build-followup.md`. Never commit anything under `DOCS/` (gitignored). Stage this plan file by path with your first commit.
- **The follow-up file.** Append to `.plans/2026-09-26_build-followup.md` with Edit, under its existing headings; never overwrite it. Label every entry "Milestone 2 (planner)" or "Milestone 2 (implementer)". The planner had no Edit tool, so **your first edit** copies the "Hand-off to the follow-up file" section at the end of this plan into the headings it names.
- **Never read or edit `.env` files.** No DB migrations. Deletions only inside the project, written literally as `./path`. No inline Node or Python; try things in a Jest test or through the CLI.
- **Production stays on gpt-4.1 (setup, template editor) and gpt-4.1-mini (beats, analysis, filter).** This milestone changes prompt and schema *text* only; no model, setting or default changes. GPT-6 is reached only through the eval harness.
- **No paid API calls in this milestone.** The only eval command you run is the free dry run (step 6). The post-fix baseline and Stages 1–2 are later runs.
- Order: the setup work comes first (owner priority), so step 1 is the setup prompt.

## Problem

Today's prompts carry clear bugs that distort what any model is measured on. Thread beats see the wrong earlier beat texts; the ending sees the thread before the one it must wrap up and none of the outcomes; thread beats are told to "create the next switch"; a switch beat loses its resolution instruction to an operator-precedence slip; single-player switch analysis gets a 3-player example; the premise is sent in capitals; eight rules contradict each other; and AI Iteration still sends the template creator's id and username to OpenAI (Milestone 1 stripped them only in the eval). Separately, the harness still carries the old $6/$12/$25 caps and cannot yet show the readings the owner asked to decide between: cost on both the billed and the uncached basis, the setup cap on median and on p95, the validity gate (including "valid within production's 2 retries", which it cannot measure at all today), and multiplayer cost with and without multiplayer pregeneration.

## Approach

Six commit-sized steps. Steps 1–2 fix the prompts at the site of each bug, with a unit test per fix. Steps 3–5 change the harness. Step 6 is docs, the free dry run and the full check.

**Prompt fixes (steps 1–2): minimal, at each site.** Every change is confined to the lines that carry the bug. Nothing is restyled for GPT-6 (that is Stage 4). The one structural change: the setup prompt's entry point splits into `createSetupPrompt(…, kind)` and `createIterationPrompt(…, sections, template)`. Two fixes need it: the difficulty rule must know whether it builds a story (one level) or a template (3–5 levels), and the iteration prompt must receive the template object so it can drop the creator fields itself. Positional booleans cannot carry either cleanly, and the split means neither caller can forget the strip.

**The list of fixes is the test plan's approved A7 list** (D6 option C), which the task summarises. It includes the operator-precedence fix, which the task's summary omits. The optional A7 item (story progress in the thread prompt) is *not* done: it adds information rather than correcting it, so it belongs with Stage 4. Eight more small, clear bugs found while reading the same code are fixed now too: an inverted multiplayer condition, five missing separators, a doubled "?", and the ending not showing the "Adjustments after threads" it is told to consider. Any prompt change after the post-fix baseline has run would force that baseline to rerun (about $5), so now is the cheap time.

**How each contradiction is resolved** (a Decision below):

| # | Contradiction | Resolution |
|---|---|---|
| C1 | First-beat prompt asks for the player's own portrait; the beat schema bans it always | Owner intent: allowed on the first beat only. The schema gets the exception; the prompt is unchanged. |
| C2 | Prompt: exactly 3 interludes; schema: only the first interlude when images are off | Owner intent: 3 always. |
| C3 | basePoints: schema "+5 to −10" (then "−5 to −15"), sacrifice/reward "±20 to ±30"; prompt "+5 to −15", sacrifice/reward exactly `POINTS_FOR_SACRIFICE`/`POINTS_FOR_REWARD` | The prompt's rule, which the game constants back (and `stat.ts` says the sacrifice bonus is the same for all options): normal +5 to −15, sacrifice always +30, reward always −30, from the constants. |
| C4 | Setup prompt "define 3–5 difficulty levels"; the custom-story schema takes exactly one | Story prompts ask for exactly one; template prompts keep 3–5. |
| C5 | Setup prompt names a field `playerBackgroundVariety`; the schema's field is `backgroundArchetypes` | The schema's name. |
| C6 | Stat effect scale: `stat.ts:53` "±20 major"; `stat.ts:132` and the setup prompt "±30 major"; the same spaceship example as "−10/−20" and "−10/−30" | ±20 everywhere: it is the effect field's own description, the nearer to the beat-time cap of ±15 per modifier, and one of the two copies of the example. |
| C7 | Sentences per paragraph: 3–5 (beat prompt, beat schema, checker) against 4–5 (switch, thread and setup context) | 3–5. |
| C8 | Stat counts: schema "3–4 shared stats" and "3–4 player stats"; prompt "3–4 visible … plus any invisible ones that matter" | The prompt's rule (visible stats are what the UI shows and what the count is for; `isVisible` exists for hidden mechanics). Both schema descriptions say so. |

The eval's checkers follow the corrected rules (visible stat counts; sacrifice and reward exactly ±30), because a checker that encodes the old rule would score the fix as noise.

**Harness (steps 3–5).**
- **Budget.** The owner's new caps go into the two constants: stage caps $8 / $13 / $3 / $4 and a global cap of $30 that no flag can raise. Sol medium setup drops to 1 sample; every other sample count already matches. A `--no-mp-continuations` filter makes the owner's first shrink lever usable. `--run --prompt-state prefix` is refused from now on, because the pre-fix prompts no longer exist in the code.
- **Validity.** The runner re-sends every reply production could not parse, up to production's 2 retries, as LangChain does in production. A new `validityGate.ts` reads the gate: at least 98% valid on the first attempt, 100% valid within the retries, and "no worse than the baseline beyond noise" as a one-sided Fisher exact test at 5% (1 invalid in 100 against 0 in 115 gives p ≈ 0.47, so it does not fail an arm by itself).
- **Cost and setup readings.** Every arm is shown against the baseline on both bases: billed against billed, and uncached against uncached. The setup cap is checked on the median and on the p95. Multiplayer cost per story is added by player count, with and without multiplayer pregeneration. The pre-fix baseline's figures ("today's production") are printed beside each post-fix section. The report still picks no winner and gates nothing out.

**Alternatives considered** (no sub-agents were available; the comparison was done inline):
- *Minimal scope everywhere*: keep `createSetupPrompt`'s signature, word the difficulty rule for both kinds ("one level for a story, 3–5 for a template"), and strip the creator fields at both call sites; estimate "valid within retries" as 1 − p³ from the first-attempt failure rate. Rejected. The custom-story prompt would describe a case that never applies to it; a future caller could forget the strip; and the estimate assumes failures are independent on the same input, which is exactly what the gate should test.
- *Strongest end-state*: move all prompt builders to an options object, split `resultsReport.ts` into stats, gates and rendering, and add a general case-filter language. Rejected for this milestone: it is a refactor that would change every prompt call site on a bugfix, before a baseline that must measure the fixes alone. The report split is named as debt below.
- *Chosen (pragmatic)*: site fixes; the two-entry split only where two fixes need it; a separate module for the one new responsibility (the validity statistics); one named filter.

## Decisions

### DECISION: Template-iteration prompts no longer send the template creator's id and username
- **Affects**: personal-data, provider
- **Chosen**: The iteration prompt builder (`StorySetupPromptService.createIterationPrompt`) receives the template object and serialises it without `creatorId` and `creatorUsername` before it goes to OpenAI. Production (`TemplateService.iterateTemplate`) and the eval build the prompt through this one function.
- **Alternatives**: Strip at each call site, which a new caller can forget. Keep sending them; the model never needs them.
- **Why**: Approved with the Stage 0 prompt fixes (test plan D6). Milestone 1 stripped the fields only in the eval's cases, so production still sent the creator's identity on every AI Iteration call.

### DECISION: How the contradictory prompt rules are resolved
- **Affects**: architecture
- **Chosen**: The owner's intent defaults where they apply (C1: own portrait on the first beat only; C2: 3 interludes always). Otherwise the side the game code or the more specific field already uses: basePoints +5 to −15, sacrifice +30 and reward −30 from `POINTS_FOR_SACRIFICE`/`POINTS_FOR_REWARD`; one difficulty level for a custom story; the schema's `backgroundArchetypes`; stat effects ±10 minor and ±20 major; 3–5 sentences per paragraph; 3–4 *visible* shared and player stats plus any invisible ones.
- **Alternatives**: The other side of each pair (for example ±30 for stat effects, which two of three statements used, or 3–4 stats in total). Leaving them for the Stage 4 rewrite, which would measure GPT-6 on contradictory prompts, the thing OpenAI's GPT-5-era guidance warns costs reasoning.
- **Why**: D6 fixes the clear bugs on today's models first. Each chosen side is the one the rest of the system already agrees with, so fixing a contradiction does not open a new one. The remaining cross-role gap (a stat's "major" +20 against the beat's per-modifier cap of ±15) is left to the owner.

### DECISION: The eval re-sends replies production could not parse, up to production's two retries
- **Affects**: architecture
- **Chosen**: The runner re-sends a reply whose outcome is `repaired` (text after the JSON), `invalid-json`, `schema-mismatch`, `length` or `refusal` at once, at most `PRODUCTION_MAX_RETRIES` (2) times. Transport retries (429, 5xx, timeouts, dropped connections) keep their own backoff and budget. The validity reading ignores transport failures: first-attempt validity comes from each call's first model attempt, "valid within retries" from its first three.
- **Alternatives**: Estimate the within-retries rate from the first-attempt rate, assuming independent attempts. Leave the runner as it is, so the owner's "100% within production's 2 retries" gate cannot be read.
- **Why**: Production's LangChain path parses inside its retried section, so a malformed reply is re-sent there too. The gate asks whether a failure repeats on the same input, which only a real re-send shows. Re-sends cost money only on the rare failures, and they are reserved against the caps like any call.

### DECISION: The report shows every gate reading the owner decides between
- **Affects**: architecture
- **Chosen**: Cost: each arm's per-story cost against the baseline's on the billed basis (as billed) and on the uncached basis (both sides priced as if nothing came from cache). Setup: median ≤ 1.5 × baseline median, and p95 ≤ 1.5 × baseline p95, side by side. Validity: first attempt ≥ 98%, 100% within 2 retries, and "worse than the baseline" only when a one-sided Fisher exact test on first-attempt failures gives p < 0.05. Per-call cost sums every attempt of a call. The report marks each reading "within" or "over"; it never drops an arm.
- **Alternatives**: One basis per cap (the harness used billed and the median). A noise floor from the baseline's two samples, which is 0 when the baseline is always valid and so fails an arm on a single invalid reply. A fixed tolerance (for example 1 in 100), which does not scale with sample size.
- **Why**: Owner decisions of 2026-09-26: report both cost figures and both setup readings, and judge "no worse than baseline" beyond noise. The Fisher test is the standard exact comparison of two small failure counts and needs no tuning.

### DECISION: The evaluation's global spend cap is a hard $30
- **Affects**: operations
- **Chosen**: Stage caps $8 (Stage 0), $13 (Stages 1–2), $3 (Stage 3), $4 (Stage 4). The global cap is $30, and `--global-cap` can only lower it. A stage cap above its default still needs `--over-target-reason`, and still stays within the $30.
- **Alternatives**: A $30 default that a recorded reason could raise up to the owner's standing $50 ceiling. For an unattended run that would allow spend past what the owner called a hard cap.
- **Why**: Owner decision of 2026-09-26 ("global hard cap $30"). Going over the $25 target is justified because the owner explicitly prioritised Sol for story setups, and setup inputs are 21–23K tokens with the schema, not the 15K the plan assumed.

## Changes

### Step 1: The setup prompt (production), commit "Setup prompt fixes: premise verbatim, one difficulty for stories, creator fields stripped, rule contradictions"

| File | Change |
|------|--------|
| `server/src/game/services/prompts/StorySetupPromptService.ts` | **Entry split.** Replace the public `createSetupPrompt(prompt, playerCount, gameMode, maxTurns, iterationMode?, sections?, templateJson?)` with two public statics that share today's private builder: `createSetupPrompt(premise, playerCount, gameMode, maxTurns, kind: "story" \| "template")` (all sections) and `createIterationPrompt(feedback, playerCount, gameMode, maxTurns, sections, template: object)`. The private builder takes a mode `"story" \| "template" \| "iteration"` where it took `iterationMode` (every `iterationMode` test inside becomes `mode === "iteration"`). `maxTurns` stays in both signatures, unused as today. |
| (same file) | **Creator fields.** `createIterationPrompt` serialises `template` with `JSON.stringify` after dropping the keys `creatorId` and `creatorUsername` (filter `Object.entries`, so no unused-variable lint escape is needed). |
| (same file) | **Premise and feedback verbatim** (`getConfigurationInstructions`, `:732` and `:746`): drop both `toUpperCase()`. The setup premise goes inside `<premise>` … `</premise>` on their own lines; the iteration feedback inside `<feedback>` … `</feedback>`. |
| (same file) | **C4 difficulty** (`getDifficultyLevelsInstructions` gains the mode): for `"story"` the first two bullets ask for exactly one difficulty level, with a 'modifier' (+20 to −20 in steps of 10) and a 'title', and the examples line tells the model to pick the one level that fits from the matching range. For `"template"` and `"iteration"` the section is unchanged (3–5 levels). |
| (same file) | **C7** `:296` "(4-5 sentences each)" → "(3-5 sentences each)". **C6** `:306` "+/-30 for major effects" → "+/-20 for major effects"; `:308` example "-10/-30 points" → "-10/-20 points". **C5** `:673` heading `playerBackgroundVariety:` → `backgroundArchetypes:`. |
| `server/src/game/services/storyTextSteps.ts` | `setupStep.request` passes its `kind` to `createSetupPrompt`. |
| `server/src/templates/TemplateService.ts` | `iterateTemplate` (`:839-848`): call `createIterationPrompt(feedback, playerCount, gameMode, maxTurns, sections, template)`; delete the local `templateJson`. |
| `server/src/evals/textModelEval/variants.ts` | `iterationRequest` calls `createIterationPrompt(…, input.sections, input.template)`, so the eval builds exactly what production builds. |
| `core/types/stat.ts` | **C6** `:132` "+/-30 for major influences" → "+/-20 for major influences". |
| `core/types/story.ts` | **C8** `:214` "Generate 3-4 shared stats." → "Generate 3-4 visible shared stats, plus any invisible ones the story needs."; `:219` "Generate 3-4 player stats." → the same wording for player stats. |
| `server/src/evals/textModelEval/textChecks.ts` | `checkSetup`: the `sharedStats` and `playerStats` checks count stats whose `isVisible` is not `false`; `SetupShape` types both lists as `{ isVisible?: boolean }[]`. The `counts` keep the totals. |

### Step 2: Beat, switch and thread prompts (production), commit "Beat, switch and thread prompt fixes: thread texts, ending context, next-switch, single-player example, contradictions"

| File | Change |
|------|--------|
| `core/models/ThreadManager.ts` | `getThreadBeatTexts` (`:347-369`): each player's thread beats are `beatHistory.slice(thread.firstBeatIndex, thread.firstBeatIndex + thread.duration)`, replacing `slice(-thread.duration)` and its "simplification" comment. At a switch beat the result is unchanged (the history then ends exactly at the thread's last beat); on thread beats it now lines up with `formatPlayerBeatTexts`, which indexes from the thread's start. |
| `core/models/Story.ts` | New method `getResolvedThreadAnalysis(): ThreadAnalysis \| null` next to `getPreviousThreadAnalysis`: at the ending, the current thread analysis (the one just resolved); otherwise `getPreviousThreadAnalysis()`. Doc comment: "the thread analysis whose resolution the current beat narrates". |
| `server/src/game/services/prompts/StoryStatePromptService.ts` | `createThreadConfigurationSection`: the `"previous"` branch uses `story.getResolvedThreadAnalysis()`. `createStatsSection`: `showAdjustmentsAfterThreads` is true on the ending too (the ending prompt tells the model to consider that parameter). `createImageLibrarySection` (`:204`): the "Do show other players' images" sentence is added when the story **is** multiplayer (the condition is inverted today). |
| `server/src/game/services/prompts/BeatPromptService.ts` | `createBeatPrompt`: `outcomes` is on for the ending as well as switches. `getSectionsForContext`: `threadConfigurationForSwitchBeats` checks `story.getResolvedThreadAnalysis() !== null`. `createContextSection`: "It is time to create the next switch to this sequence." only on switch beats; thread beats get "It is time to create the next beat of the current thread."; add the missing "\n" before "There are two types of switches". `createInstructionsSection` (`:177-182`): parenthesise the multiplayer ternary so a later switch beat keeps "Since a thread was just resolved, describe the resolution …" and ends in " (and other players)." or "."; drop the extra `"?"` after the options' requirements question (`:251`). `createOptionInstructions`: add the missing "\n" before the thread and switch "--- …" lines (`:434`, `:437`) and before "- Take the multiplayer coordination" (`:442`). |
| `server/src/game/services/prompts/SwitchPromptService.ts` | `createInstructionsSection`: the `else` branch splits. Multiplayer after the first turn keeps today's 3-player example. Single-player gets its own example: "Coordination pattern: Single-player story: player1 gets one switch.", then "Switch 1:" with "- Type: Topic switch (Justification: Nothing forces the focus of the next thread, so the player chooses it)", "- Topic choices: 3 directions, each pushing a different outcome/question" and "- Players: player1". The "IMPORTANT: This whole exercise …" block moves into a private constant that both branches append, so its text is unchanged. **C7** `:54` "(4-5 sentences each)" → "(3-5 sentences each)". |
| `server/src/game/services/prompts/ThreadPromptService.ts` | **C7** `:59` → "(3-5 sentences each)". `:168-169`: "For Challenge${multiplayer ? " and Contest" : ""} threads" (today it renders "Challenge  and Contestthreads"). |
| `core/types/beat.ts` | **C1** `:223`: "Don't use images of the player for whom this beat is written, except in the first beat of the story." **C2** `:271`: replace "- If images are disabled for this story, only create the first interlude." with "- Create all 3 even if images are disabled for this story (leave imageId empty and set imageSource to 'none')." **C3** `:55-57`: normal "+5 to -15" (both ranges in that sentence), sacrifice "always +${POINTS_FOR_SACRIFICE}", reward "always ${POINTS_FOR_REWARD}", importing the constants from `../config.js` (as `story.ts` already imports `MAX_PLAYERS`). |
| `server/src/evals/textModelEval/textChecks.ts` | `basePointsInRange`: sacrifice must equal `POINTS_FOR_SACRIFICE`, reward `POINTS_FOR_REWARD`; normal stays −15 to +5. |

### Step 3: Budget, sampling and the prefix guard (harness), commit "Text eval: owner's new caps ($8/$13/$3/$4, hard $30), Sol medium setup x1, --no-mp-continuations"

| File | Change |
|------|--------|
| `server/src/evals/textModelEval/budget.ts` | `DEFAULT_STAGE_CAPS = { "0": 8, "1-2": 13, "3": 3, "4": 4 }`. `HARD_CEILING = 30` and `DEFAULT_GLOBAL_CAP = HARD_CEILING`. Rewrite the header comment: target about $25, hard cap $30 (owner, 2026-09-26), the owner's standing ceiling of $50, and the recorded justification for going over $25 (Sol setups prioritised; setup inputs 21–23K tokens with the schema, not 15K). `resolveCaps` logic is unchanged; while the default equals the ceiling, the reason-gated global raise simply cannot trigger. |
| `server/src/evals/textModelEval/arms.ts` | `armsFor("1-2", "setup")`: `sol("medium")` samples 2 → 1. Nothing else changes (the other counts already match the owner's list). |
| `server/src/evals/textModelEval/jobPlan.ts` | `PlanOptions.skipMultiplayerContinuations?: boolean`. In `casesFor`, when set, beat cases that are multiplayer and neither a first beat nor an ending are left out. |
| `server/src/evals/textModelEval/run.ts` | Parse `--no-mp-continuations` into the plan options (it applies to `--run` and to the dry run's rows through `planOptions`), and list it in the header comment. `--run` refuses `--prompt-state prefix` with a message that the pre-fix prompts no longer exist in the code (Run A recorded them). |
| `server/src/evals/textModelEval/dryRun.ts` | Drop the "Stage 0 pre-fix baseline" row (Run A finished it, and `--run` now refuses `prefix`). The totals line reads "… of $30 (hard cap; the owner's target is about $25)", using `HARD_CEILING`. |

### Step 4: Validity re-sends and the validity reading (harness), commit "Text eval: re-send unparseable replies as production does; validity gate reading"

| File | Change |
|------|--------|
| `server/src/evals/textModelEval/runner.ts` | `isRetryable` takes `Pick<CallCheck, "outcome" \| "status" \| "code">` (so records can be classified too); `runStep` passes `executed.check`. Export `PRODUCTION_RETRIED_OUTCOMES = ["repaired", "invalid-json", "schema-mismatch", "length", "refusal"]`. In `runStep`, keep two counters: a transport failure retries after the backoff while `transportRetries < backoffs.length` (as today; `backoffs[transportRetries]` replaces `backoffs[attempt - 1]`); an outcome in `PRODUCTION_RETRIED_OUTCOMES` re-sends at once while `validityRetries < PRODUCTION_MAX_RETRIES` (imported from `shared/llm/chatModel.js`). Every attempt reserves its estimate and is recorded as today; `final` is true when neither retry applies. No new record field: the attempt order and outcomes carry everything. |
| `server/src/evals/textModelEval/validityGate.ts` (new) | The owner's validity gate. See below. |
| `server/src/evals/textModelEval/resultsReport.ts` | `ArmStats` gains `validity: ValidityReading`. `rates.firstAttemptValid` goes (it lives in `validity`); `repaired`, `refusal`, `length`, `textAfterJson` and `junk` are computed over each call's **first model attempt** (from `modelAttemptsByStep`), so a re-send cannot hide them; `rejectedParam` stays over all records. `renderResults` adds a "Validity gate" table per prompt state after the per-call table: role, arm, calls, first-attempt valid as k/n and % (floor 98%), valid within 2 retries (must be 100%), Fisher p against the same role's baseline, and the verdict. Pipeline chains are left out (the isolated arms carry validity). The per-call table drops its "1st-attempt valid" column. |

`validityGate.ts`:
- *Responsibility:* the owner's validity gate: first-attempt and within-retries validity per arm, and whether an arm is worse than its baseline beyond noise.
- *Exports:* `modelAttemptsByStep(records)`, `ValidityReading`, `validityReading(records)`, `validityVerdict(arm, baseline)`, `FIRST_ATTEMPT_FLOOR` (0.98).
- `modelAttemptsByStep` groups records by `jobKey` and `step`, orders each group by `attempt`, and drops transport failures (`isRetryable`). Groups left empty are counted as `transportOnly` and kept out of the rates.
- `ValidityReading = { calls, firstAttemptValid, invalidFirstAttempts, validWithinRetries, transportOnly }`. A first model attempt counts as valid only when its outcome is `valid` (`repaired` fails LangChain's parse in production). "Within retries" means a `valid` outcome among the first `1 + PRODUCTION_MAX_RETRIES` model attempts.
- `validityVerdict(arm, baseline?)` returns `{ firstAttemptOk, withinRetriesOk, pWorse?, worseThanBaseline, pass }`. `pWorse` is the one-sided Fisher exact p-value that the arm's first-attempt failure share exceeds the baseline's (hypergeometric tail, log-factorials, private helper). Worse means `pWorse < 0.05`. With no baseline reading, `pWorse` and `worseThanBaseline` are left out and `pass` rests on the other two.

### Step 5: Cost, setup and multiplayer readings (harness), commit "Text eval report: cost on billed and uncached bases, setup cap on median and p95, multiplayer cost with and without multiplayer pregeneration"

| File | Change |
|------|--------|
| `server/src/evals/textModelEval/resultsReport.ts` | **Cost per call.** Replace `costPerCall`, `singlePlayerCostPerCall` and `uncachedCostPerCall` with `cost: { billed: CostReading; uncached: CostReading }`, where `CostReading = { perCall: number; byPlayers: Record<number, number> }`. A call's cost is the sum over all its attempts (so a re-send costs what production pays), averaged over calls; `byPlayers[n]` over calls with `n` players. The uncached basis reprices `costSource: "usage"` records with no cached tokens, as today. |
| (same file) | **`storyCost(config, basis, players = 1)`**: today's 85/19/21 and 29/7/7 counts, each role priced at `byPlayers[players]` when measured and `perCall` otherwise, plus the setup at the same player count. `basis` is required. |
| (same file) | **`gates`**: `costCap` becomes `cost: Record<"billed" \| "uncached", { perStory, baselinePerStory, withinCap }>`. `setup` adds `baselineP95`, `medianWithinCap` and `p95WithinCap` (the old `pass` goes). `multiplayer` adds `costByPlayers: Record<number, Record<"billed" \| "uncached", { withoutMpPregen, withMpPregen }>>` for 2 and 3 players where the beat arm has calls: `storyCost` at that player count, with the 29/7/7 counts for today and the 85/19/21 counts for multiplayer pregeneration (which pregenerates the last player's options, so it roughly triples the calls, like single-player). |
| (same file) | **`renderViews`** splits today's 11-column table into: (1) single-player with pregeneration: $/story billed with "within/over" against the baseline's billed figure, the same pair on the uncached basis, beat-only p95, analysis-turn p95 with its source, and the 60 s cap; (2) single-player without pregeneration, reported not gated: $/story on both bases, full-turn median and p95, and the ≤5 s / ≤8 s flag; (3) multiplayer: p95 by player count against the baseline's, the verdict, and $/custom story by player count without and with multiplayer pregeneration on both bases; (4) setup: median, p95, "within/over" for the median reading and for the p95 reading (each naming the 1.5× figure), and $/setup on both bases; (5) the setup × gameplay matrix, each cell "billed / uncached", marked where it is over the billed or the uncached cap. The headings say that these are readings, and that the owner decides which applies. |
| (same file) | **Today's production.** For a prompt state other than `prefix`, when the prefix baseline has results, print one line under the headings: the prefix baseline's per-custom-story cost on both bases and its setup median and p95. |

### Step 6: Docs, dry run and checks, commit "Docs: text eval Milestone 2 (prompt fixes, budget, gate readings)"

| File | Change |
|------|--------|
| `.context/text-model-eval.md` | **Commands:** add `--no-mp-continuations`, and that `--run` refuses `prefix`. **Prompt states:** one line per postfix fix (the tables in this plan's Approach, condensed), and that pre-fix prompts exist only in Run A's records. **Budget:** replace the caps line with $8 / $13 / $3 / $4 and the hard $30 (never raisable by flag), the $25 target and the recorded justification; say that the group order (setup first) means a cap stop cuts the pipeline chains last and never Sol setup; the owner's shrink order: `--no-mp-continuations`, then analysis at one sample (`--role analysis --samples 1`), never Sol setup. **Arms:** Sol medium setup ×1. **Runner:** the validity re-sends. **Gates:** replace the cost, setup and multiplayer bullets with the both-bases cost reading, the median and p95 setup readings, multiplayer cost with and without multiplayer pregeneration, and the validity gate (98% floor, 100% within 2 retries, Fisher p < 0.05 against the same role's baseline, transport failures left out). **Known limits:** waits count each attempt alone, not the retries in front of it. Delete the prose each change supersedes. |
| `.plans/2026-09-26_gpt6-text-eval-m2.md` | Set Status to implemented, then `git mv` it to `.plans/completed/`. |

Then, without committing anything from `DOCS/`:
1. From `server/`: `npm run eval:text` (the free dry run). It builds every frozen case's post-fix prompt, so it also proves the fixed prompt code runs on all real cases. Paste the Stage 0 post-fix baseline and Stages 1–2 rows into the follow-up under "Borderline Insights". Expected, from Run A's sizes: post-fix baseline about $4.3 plus $0.8 of chains against the $5.61 left of Stage 0's $8; Stages 1–2 about $12.9 against $13. If Stages 1–2 come out above $13, also run `npm run eval:text -- --no-mp-continuations` and record both figures under "User Input Needed", with the owner's shrink order.
2. `npm run check:all` from the root must be clean (lint, types, tests).
3. `client/src/page/static/Privacy.tsx` and `.context/ai-transparency.md` need no change (same models and features; less personal data goes to OpenAI). Check both and note the result in the follow-up.

## Tests

Follow the existing patterns: relative imports, `@jest/globals`, stories from `createMockStory` / `createMockMultiplayerStory` (`server/tests/helpers/testHelpers.ts`) and phases from `textFixtures.ts`, eval records from `server/tests/unit/evals/textModelEval/fixtures.ts`. The task asks for a test pinning each prompt fix; the selection and branch fixes get behaviour tests, and the static rule texts share one table-driven guard.

- **`server/tests/unit/game/services/prompts/StorySetupPromptService.test.ts`** (new):
  - a mixed-case premise appears verbatim inside `<premise>` tags, and its upper-cased form does not appear;
  - the story kind asks for exactly one difficulty level; the template kind still asks for 3–5;
  - `createIterationPrompt` puts the feedback verbatim inside `<feedback>` tags, and serialises a template whose `creatorId` and `creatorUsername` values never appear in the prompt while its title does.
- **`server/tests/unit/game/services/prompts/BeatPromptService.test.ts`** (extend):
  - a thread beat on a 3-beat thread starting at history index 2, with one step resolved, shows index 2's text under "Beat 1/3" and not the texts at indexes 0 and 1;
  - the ending (phases: an older resolved thread, a switch, the final resolved thread; turn at `maxTurns`) shows the final thread's title and not the older one's, and includes the shared and the player outcomes sections;
  - a thread beat has no "create the next switch", and a switch beat does;
  - a switch beat after a thread keeps "describe the resolution of the thread in detail", ending in " (and other players)." in multiplayer and in "." in single-player;
  - the "Do show other players' images" sentence appears in multiplayer after the first beat and not in single-player.
- **`server/tests/unit/game/services/prompts/SwitchPromptService.test.ts`** (new): a single-player switch analysis (at turn 0 and later) mentions neither `player2` nor `player3` and still contains the "IMPORTANT:" block; a later multiplayer one keeps the 3-player example.
- **`server/tests/unit/game/services/prompts/promptRules.test.ts`** (new): one table over the built texts: the setup prompt for story and template; beat prompts for a first beat, a single-player thread beat and a multiplayer thread and switch beat; switch and thread analysis prompts, single-player and multiplayer; and the JSON schemas of the beat and story-setup schemas via `toJsonSchema`. No text may contain the retired phrases ("4-5 sentences", "only create the first interlude", "+5 to -10", "+20 to +30", "+/-30", "-10/-30", "playerBackgroundVariety", "Generate 3-4 shared stats.", "story.There", "configuration.---", "??", "way.- Take", "Contestthreads"), and the story-kind setup prompt must not ask for "3-5 difficulty levels".
- **`textChecks.test.ts`** (extend): an invisible extra stat does not fail the stat-count checks; a sacrifice option at +25 fails `basePoints`, at +30 passes.
- **`runner.test.ts`**:
  - new: an `invalid-json` reply is re-sent at once (no sleep) and the valid re-send ends the call; three unparseable replies end it after two re-sends; a 429 followed by an invalid reply still gets both re-sends (the transport retry does not use them up); a 400 is never re-sent;
  - update "no candidate where the baseline failed": the failing baseline must now fail all three attempts.
- **`validityGate.test.ts`** (new):
  - a transport failure before a valid reply leaves first-attempt validity at 100%; a call made only of transport failures counts as `transportOnly`;
  - `repaired` on the first attempt counts as invalid; valid on the third model attempt counts within retries, on the fourth it does not;
  - Fisher: 1 invalid in 100 against 0 in 115 is not worse (p ≈ 0.465); 6 in 100 against 0 in 115 is worse (p ≈ 0.009);
  - the verdict fails on 97% first-attempt validity, on one call never valid within the retries, and on worse-than-baseline.
- **`resultsReport.test.ts`** (update the `arm()` fixture to the new `cost` shape, and the Stage 0 cap in the spend-table test to $8.00):
  - a call's cost sums its attempts;
  - `storyCost` prices by basis and by player count, falling back to `perCall`;
  - the cost reading can be within on the uncached basis and over on the billed one;
  - the setup reading can pass on the median and fail on the p95;
  - multiplayer cost with multiplayer pregeneration uses the 85/19/21 counts and without it 29/7/7, at the player count's per-call cost.
- **`jobPlan.test.ts`** (new): `--no-mp-continuations` (`skipMultiplayerContinuations`) drops multiplayer continuation beats and keeps multiplayer first beats, endings and single-player beats.
- **`armsBudget.test.ts`**: update the existing expectations to the new constants (the stage and global stops at $8 / $13 / $30; the global cap refused above $30 whatever the reason). No new tests for the constants themselves.

## Out of Scope

- **Paid runs:** the post-fix baseline, Stages 1–2 and the rating pages. This milestone makes them measure the right thing; the next one runs them.
- **The GPT-6-style rewrite and caching (Stage 4)**, planning-field trims (Stage 3), and any prompt restyling: capitals, repeated rules, typos ("custimized", "warrented"), wording.
- **The optional A7 item:** story progress in the thread prompt.
- **The template schema's "1–5 difficulty levels"** against the prompt's 3–5. It is a looser bound, not a contradiction; unchanged.
- **The beat-time cap of ±15 per modifier** against a stat's "major" effect of ±20: a design question for the owner or Stage 4.
- **Production defaults, models and settings**; the content filter; the template editor's model.
- **`--build-cases` after this milestone** still labels its calls `prefix`. It only matters with `--rebuild-cases`, which nothing plans.
- **Splitting `resultsReport.ts`** (see below).

## Architectural debt named

- **`resultsReport.ts` mixes three jobs:** per-arm statistics, the gate readings and the markdown rendering (about 430 lines before this milestone, more after). This milestone moves the one new statistical job, validity, into `validityGate.ts` and keeps the cost and setup readings in the gate code they modify. If Stage 3 or 4 adds views, split the rendering into its own module first.
- **`getPreviousThreadAnalysis`** now has one caller, `getResolvedThreadAnalysis`. It stays public; fold it in if nothing else needs it by Stage 4.
- **Prompt builders assemble strings by concatenation**, which is how the separator and precedence bugs got in. Stage 4's rewrite is the vehicle for a structural fix, not this bugfix.

## Hand-off to the follow-up file

Copy these into `.plans/2026-09-26_build-followup.md`, prefixed "Milestone 2 (planner):", under the heading named in brackets.

1. [Controversial Decisions] **Creator fields had not been stripped in production.** Milestone 1 removed `creatorId` and `creatorUsername` only from the eval's iteration cases; `TemplateService.iterateTemplate` still serialised the full template into every AI Iteration prompt. The task said "verify, don't redo"; verification failed, so this milestone strips them in production (approved in D6), inside the new `createIterationPrompt`, so the eval and production share one path.
2. [Controversial Decisions] **The fix list is test plan A7**, which the task summarises. It includes the operator-precedence fix the summary leaves out. The optional A7 item, story progress in the thread prompt, is not done: it adds information rather than fixing it, so it belongs with Stage 4.
3. [Controversial Decisions] **Eight more clear bugs fixed now, beyond A7:** the image-library note's inverted multiplayer condition; the ending not showing the "Adjustments after threads" it is told to consider; a doubled "?"; and five missing separators (before "There are two types of switches", before the thread and the switch option lines, before "Take the multiplayer coordination", and in "Challenge  and Contestthreads"). Reason: any prompt change after the post-fix baseline forces that baseline to rerun (about $5).
4. [Controversial Decisions] **Contradiction directions:** C1 and C2 per the owner's intent; C3 toward the prompt and the game constants (+5 to −15; sacrifice +30, reward −30); C4 one level for stories, 3–5 for templates; C5 the schema's `backgroundArchetypes`; C6 ±20 for a major stat effect (the effect field's own text, and nearer the beat's ±15 cap), not the ±30 two statements used; C7 3–5 sentences; C8 3–4 *visible* stats plus any invisible ones, not 3–4 in total.
5. [Controversial Decisions] **Own portrait (C1):** the first-beat prompt keeps asking for the player's own portrait ("include"); only the schema's blanket ban gets the first-beat exception. The owner's "may" is met; making the prompt optional would be a new behaviour.
6. [Controversial Decisions] **The setup prompt's entry point split in two** (`createSetupPrompt` with a kind, `createIterationPrompt` with the template object). It is the smallest change that lets the difficulty rule know its kind and lets the iteration builder own the strip.
7. [Controversial Decisions] **Checkers follow the corrected rules:** stat counts are visible stats only, and sacrifice and reward must equal ±30. Prefix outputs are re-scored with these rules when the report is rebuilt.
8. [Controversial Decisions] **Budget:** a hard global cap of $30 that no flag can raise, below the owner's standing $50, because the owner called it hard and the run is unattended. Stage caps $8 / $13 / $3 / $4. Sol medium setup ×1; every other sample count already matched the owner's list.
9. [Controversial Decisions] **Cost reading, symmetric bases:** billed against billed, and uncached against uncached (both sides priced as if nothing came from cache). For Stage 1–2's GPT-6 arms both are the same, since explicit caching reads nothing. The pre-fix baseline's figures are printed beside each post-fix section as "today's production". Nothing is gated out.
10. [Controversial Decisions] **Validity reading:** ≥ 98% valid on the first model attempt; 100% valid within production's 2 retries, measured by real re-sends; "worse than the baseline" only at a one-sided Fisher exact p < 0.05 on first-attempt failures against the same role's baseline (1 in 100 against 0 in 115 gives p ≈ 0.47). Transport failures (429, 5xx, timeouts, dropped connections) are left out of all three. `repaired` counts as invalid, because production's parse fails on text after the JSON.
11. [Controversial Decisions] **The runner re-sends unparseable replies** (text after JSON, broken JSON, schema mismatch, length cut-off, refusal) at once, at most twice, as production's LangChain retry does. A call's cost now sums its attempts. The diagnostic rates are read from first attempts, so re-sends cannot hide them.
12. [Controversial Decisions] **Multiplayer cost with and without multiplayer pregeneration is added.** The owner decisions ask for it, and the report lacked it. With multiplayer pregeneration it uses the single-player 85/19/21 call counts as an approximation (it pregenerates the last player's options, which roughly triples the calls).
13. [Controversial Decisions] **`--no-mp-continuations`** was added so the owner's first shrink lever can be applied without hand-listing case ids. The second lever needs no code: `--role analysis --samples 1`.
14. [Controversial Decisions] **`--run --prompt-state prefix` is refused from now on,** and the dry run drops its pre-fix row: the pre-fix prompts no longer exist in the code, so a resumed prefix run would mix post-fix prompts into pre-fix results.
15. [Controversial Decisions] **Planner limits:** no explorer, architect or reviewer sub-agents and no Edit tool were available. The architecture comparison and self-review were done inline; no review round happened.
16. [Suggested Follow-Up Work] The beat's ±15 cap per modifier against a stat's "major" ±20 effect: a remaining cross-role mismatch for the owner or Stage 4.
17. [Suggested Follow-Up Work] Pipeline chains on multiplayer analysis cases feed no gate (the 60 s gate reads single-player turns only). Leaving them out of Stage 1–2 would save money.
18. [Suggested Follow-Up Work] The `<premise>` and `<feedback>` tags are not escaped, so a premise containing `</premise>` would close the tag early. That is low risk, since the content filter screens premises first; worth one line in Stage 4.
19. [Suggested Follow-Up Work] `createSetupPrompt` and `createIterationPrompt` take a `maxTurns` they never use.
20. [Suggested Follow-Up Work] Waits count each attempt alone. If Stage 1–2 shows re-sends above about 1%, report the summed wait per call for the 60 s gate.
