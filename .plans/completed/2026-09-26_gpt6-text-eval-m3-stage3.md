# GPT-6 text eval, Milestone 3, Stage 3: planning-field trim variants (slim, minimal), their run, and the comparison against the full forms

- **Date**: 2026-09-26
- **Status**: implemented (code, tests, docs and the free dry run: commits aa9cd0f, a6a313f, 0466673 and the docs commit, 2026-09-26). Runbook steps 3–6 are still to do: the paid runs, the Round 2 page and the owner report. The dry run reads $2.56, so step 2 needs no shrink.
- **Type**: feature (eval variants and harness readings). It includes one scoped refactor: the `resultsReport.ts` split, which is named debt that this task would otherwise overload.
- **Complexity**: complex
- **Branch**: `gpt6-text-eval` (already checked out; never switch, push, rebase or reset)
- **Sources**: test plan `DOCS/2026-09-26_gpt6-text-model-test-plan.md` §5 Stage 3, §4.5 Round 2 and Appendix A6 (read-only). Research: `scratchpad/gpt6-text/schemas.md` (which fields are consumed) and `scratchpad/gpt6-text/prompting.md` Q1 and its Stage 4 section (the trim variants and their evidence). Earlier plans: `.plans/completed/2026-09-26_gpt6-text-eval-m1.md` and `-m2.md`. Harness docs: `.context/text-model-eval.md`. Round 1: `DOCS/2026-09-26_gpt6-text-eval/2026-09-26_round1-report.md`.

## Before you start

- **Commits.** Put a pathspec on the commit itself: `git commit -m "…" -- path/one path/two`. First stage new files by explicit path (`git add path`), because `git commit -- <path>` rejects untracked paths. Never run `git add -A`, `git add .` or `git commit -a`.
  - The untracked `.plans/*-followup.md` files belong to other runs. The only one you touch is `.plans/2026-09-26_build-followup.md`, and it stays untracked.
  - Never commit anything under `DOCS/`.
  - Stage this plan file by path with your first commit.
- **The follow-up file.** Append to `.plans/2026-09-26_build-followup.md` with Edit, under its existing headings. Never overwrite it. Label every entry "Milestone 3 (planner)" or "Milestone 3 (implementer)". The planner had no Edit tool, so **your first edit** copies the "Hand-off to the follow-up file" section at the end of this plan into the headings it names.
- **Production does not change.** No file under `server/src/game/services/prompts/`, no `core/types/*` schema, and not `storyTextSteps.ts`, `AIStoryGenerator.ts` or any config or default changes. Production keeps gpt-4.1 and gpt-4.1-mini and today's post-fix prompts. The trims are derived from production's own requests and are selected only by the eval harness.
- **Never read or edit `.env` files.** No DB migrations. Deletions only inside the project, written literally as `./path`. No inline Node or Python. Try things in a Jest test or through the CLI.
- **Budget.** $18.51 of the $30 hard cap is spent. The Stage 3 cap is $3, and the harness enforces it. The owner's target was about $25 in total. Shrink samples before any cap would be exceeded (see Runbook step 2). Never raise a cap.

## Problem

Test plan Stage 3 asks whether the written planning fields are redundant once GPT-6 reasons privately. Examples: the beat's eight plan strings, the switch's per-player analysis, the thread's restated lists, and the setup's character-selection plan. Today the harness has only the `prod` variant, so it cannot send a trimmed form or compare one with the full form. `resultsReport.ts` can't take the comparison either: it is a 646-line file mixing statistics, gate readings and rendering, and Milestone 2 named it for a split "before Stage 3 or 4 adds anything".

## Approach

Four commits of code, then the paid run, then the owner-facing deliverables.

**1. Split `resultsReport.ts` (pure move).** Per-arm statistics go to `armStats.ts`, the owner's gate readings to `gateReadings.ts`, and `resultsReport.ts` keeps the rendering. This follows the Milestone 2 follow-up exactly. It is needed now for two reasons:
- the new comparison needs the per-arm statistics on a case-matched subset;
- `resultsReport.ts` must render the comparison. Without the split, `resultsReport.ts` and the new module would import each other.

**2. Trimmed requests, derived from production (`storyTextTrims.ts`, beside `storyTextSteps.ts`).** Each trimmed request starts from production's own request for the same input: `beatStep.request(story)`, `switchStep.request`, `threadStep.request` and `setupStep.request(…, "story")`. Two things are then removed:
- **Schema:** the droppable fields, via zod `.omit` and `.extend`. Kept fields stay production's own zod instances, in production's key order. Only two descriptions change, each because it names a dropped field.
- **Prompt:** a fixed list of anchored edits applied to the instruction part only, never to the story state or the premise. Each edit must match exactly once, or the build throws with the edit's name, so drift in the production prompt fails loudly instead of silently no-opping.

**What a trim removes.** Only fields that the schemas research shows are unread after generation, plus the prompt lines that ask the model to write those fields. Every *rule* such a line carries stays, as one sentence where it had no other home. So the variable Stage 3 measures is "written plan versus private plan", not "fewer rules". Rewording, capitals, repeats and examples are left alone; they belong to Stage 4.

**Variants:**
- **slim** (beats only): keeps `showDontTell` and a short options check (`optionConsiderations` cut to `previousOptionsToAvoid` plus `upToOneSacrificeOrRewardOption`). This is A6's definition and the research's "slim-options".
- **minimal** (beats, switch, thread, setup): drops every field test plan §5 lets Stage 3 drop.
- **full** is the existing `prod` variant. Its Round 1 records serve as the comparison, so nothing is re-run.

**3. Harness.**
- `variants.ts` gains `slim` and `minimal`.
- `arms.ts` gains the Stage 3 matrix, a Stage 3 pipeline pair, a "single-player" scope, per-arm case lists, and `prodSiblingKey`.
- `jobPlan.ts`:
  - applies the scope and the case lists;
  - takes the pipeline pair from `arms.ts`;
  - estimates a new variant's output from its `prod` sibling's measured calls until it has its own. Otherwise Luna medium falls back to the §2.2 guess of 6,200 reasoning tokens (measured: about 1,600), and the $3 cap refuses a run that fits.
- `dryRun.ts` prints the Stage 3 rows.
- A new `variantComparison.ts` pairs each trimmed arm with the full arm of the same model and effort, **on the same (case, sample) pairs**. It renders one results section:
  - output tokens (visible and reasoning);
  - waits;
  - cost per call and its share of a story;
  - first-attempt validity;
  - state counts (facts, new elements, introductions);
  - rule checks, where the trim reads lower or higher than the full form beyond the full form's own noise floor.
  
  Chains are compared the same way, which gives the analysis-turn wait.

**4. Docs.** Then the paid run inside $3, the Round 2 rating page (test plan §4.5: baseline, full, trimmed), and a short owner report.

**Alternatives considered.** No sub-agents were available, so the comparison was done inline.
- **Minimal scope: a `scaffold` parameter threaded through the production builders.** This means `createSetOfBeatGenerationSchema`, the switch, thread and setup schema factories, and the four prompt services, with production defaulting to "full". It follows the existing pattern (inline conditionals) and would make a later adoption a default flip. Rejected, for three reasons:
  - It adds about 20 eval-only branches to production builders that are already strained. `BeatPromptService.createInstructionsSection` alone is about 310 lines of template literal with about 25 branches.
  - Every branch is a chance to shift a production byte. The post-fix baseline measured those prompts, and re-running it costs about $5.
  - Stage 4 rewrites these prompts anyway, so the adoption benefit is small.
- **Strongest end-state: eval-owned copies of the four prompt builders with the trims applied.** Rejected: about 1,000 duplicated lines that drift from production on the next fix.
- **Chosen (pragmatic): derived requests with anchored, exactly-once edits.** Production is untouched. The whole trim is a reviewable list in one module. Drift fails the tests beside the production prompt tests. The cost is coupling to production wording, which is accepted for an eval-only, short-lived module (see Architectural debt).

**Reviewer disagreement (resolved inline, no review round).** A simplicity reading would skip the `resultsReport.ts` split and put the comparison inside the existing file. The architecture reading says the split is due: the debt was named in Milestone 2 with "before Stage 3 or 4 adds anything", and the new section would otherwise create an import cycle. For a feature landing in an already-strained file, the stronger end-state wins. The split is scoped to what the follow-up already specified, with no further restructuring.

## Decisions

### DECISION: Stage 3 trims are derived from production requests by anchored edits, beside storyTextSteps.ts
- **Affects**: architecture
- **Chosen**: A new module, `server/src/game/services/storyTextTrims.ts`, builds each trimmed request from production's own request. The schema is cut with zod `.omit`/`.extend`, and kept fields remain production's own instances. The prompt gets anchored edits that apply to the instruction part only and must each match exactly once. Production prompt and schema code are not touched, and only the eval's `variants.ts` calls the module.
- **Alternatives**: A `scaffold` parameter threaded through the production schema factories and prompt services, with production defaulting to "full". That is about 20 eval-only branches in already-strained builders, and a byte-identity risk for the measured post-fix prompts. Eval-owned copies of the prompt builders: about 1,000 duplicated lines. Placing the module under `src/evals/`, where ESLint would bar production from importing it. Rejected because the task places variants beside the production versions, and tests there fail right next to the prompt tests when a production edit breaks an anchor.
- **Why**: The owner's rule for this milestone is that production prompts and defaults do not change. Deriving from production's own request also guarantees that a trim differs from "full" only in what it removes.

### DECISION: A Stage 3 trim removes fields and the lines asking for them, and keeps every rule
- **Affects**: architecture
- **Chosen**: slim (beats) drops the stats list, the multiplayer coordination note and six plan strings. It keeps `showDontTell` and an options check reduced to `previousOptionsToAvoid` plus `upToOneSacrificeOrRewardOption`. minimal drops every field test plan §5 lists for beats, switch, thread and setup. Both keep new elements, introductions, facts, the summary, modifier reasons, stat changes and milestones. In the switch they keep the pattern summary and the relationships; in the thread, its type, duration, milestones and steps. A prompt line that asks for a dropped field goes. If that line also carries a rule stated nowhere else, the rule stays as one sentence. Examples, capitals and repeats are unchanged.
- **Alternatives**: Also dropping the planning guidance, such as how to narrate consequences or how to implement the thread step. That would mix "no written plan" with "fewer rules" and pre-empt Stage 4's rewrite. Keeping the field-asking lines while dropping the fields leaves the prompt contradicting the schema, which the research warns costs reasoning.
- **Why**: Stage 3 tests one hypothesis: that the written plan is redundant once the model plans privately. Everything else stays equal.

### DECISION: Stage 3 run design inside the $3 cap
- **Affects**: operations
- **Chosen**: The run matrix:
  - **Setup:** Sol low minimal on 9 premises (3 per player count, every game mode, a Kids premise and three dark ones) ×1, and Luna low minimal on all 18 premises ×2.
  - **Turns:** Luna medium and Luna low, each slim and minimal, on every single-player beat case ×2. Luna none minimal is a control, also ×2.
  - **Analysis:** Luna low minimal on all switch and thread cases ×2.
  - **Chains:** Luna low minimal analysis into Luna medium minimal and Luna low minimal beats, on single-player analysis cases ×1.
  
  The full forms are the Round 1 records of the same arms, compared on the same (case, sample) pairs. Estimated about $2.45.
- **Alternatives**: Re-running the full arms in the same session. That costs about $1.2 more (Sol setup is most of it) and only removes server-speed drift from the wait comparison. Sol low on all 18 premises: about $1.9, which with the rest leaves no margin under $3. Multiplayer turns: dropped by the task, and covered by the unit tests only.
- **Why**: The coordinator's carry-forward is Luna medium and low turns, Luna low analysis, and Sol low and Luna low setup. Matching on (case, sample) keeps the comparison paired. Token and cost deltas are robust to drift; wait deltas are read with that caveat.

### DECISION: resultsReport.ts is split into armStats.ts, gateReadings.ts and the renderer
- **Affects**: architecture
- **Chosen**: `armStats.ts` holds the per-arm statistics: `ArmStats`, `computeArmStats`, `armStatsOf` (formerly the private `statsFor`), cost readings and quantiles. `gateReadings.ts` holds `GameplayConfig`, `storyCost`, `gates`, `setupReading` and the cap and call-count constants. `resultsReport.ts` keeps `renderResults` and the tables. There are no re-exports.
- **Alternatives**: Keep one file and add the Stage 3 section to it. That grows a 646-line, three-job file, and the new comparison module could not use the statistics without an import cycle.
- **Why**: The debt was named in Milestone 2 as due before Stage 3 or 4 added anything. The new section is the first addition.

## Changes

### Commit 1: "Text eval report: split statistics and gate readings out of resultsReport.ts" (pure move)

| File | Change |
|------|--------|
| `server/src/evals/textModelEval/armStats.ts` (new) | Moved verbatim from `resultsReport.ts`: `CostBasis`, `COST_BASES`, `CostReading`, `ArmStats`, `percentile`, `quantiles`, `median`, `weightedQuantile`, `rate`, `ruleRatesOf`, `uncachedCost`, `PRICE`, `mean`, `costReading`, `statsFor` (exported as `armStatsOf`) and `computeArmStats`. |
| `server/src/evals/textModelEval/gateReadings.ts` (new) | Moved verbatim: `PER_STORY_WITH_PREGEN`, `PER_STORY_WITHOUT_PREGEN`, `TURN_MIX`, `PREGEN_TURN_CAP_S`, `NO_PREGEN_BAR`, `MULTIPLAYER_SLACK_S`, `SETUP_WAIT_FACTOR`, `GameplayConfig`, `callCost`, `storyCost`, `byBasis` (exported; the renderer uses it), `onePlayerLatency`, `analysisTurnP95`, `CostCheck`, `SetupReading`, `Gates`, the four reading helpers, `setupReading` and `gates`. |
| `server/src/evals/textModelEval/resultsReport.ts` | Keeps `ResultsInput`, the formatters, `configsFor`, the `render*` views, `todaysProduction`, `renderValidityGate` and `renderResults`, importing from the two new modules. Header comment: rendering only. |
| `server/tests/unit/evals/textModelEval/resultsReport.test.ts` | Imports from the new modules. No test logic changes. |

`armStats.ts`:
- *Responsibility:* per-arm statistics from call records and checks: validity, rule rates and noise floor, latencies, tokens, cost, and (commit 3) state counts.
- *Exports:* `ArmStats`, `CostBasis`, `COST_BASES`, `CostReading`, `armStatsOf`, `computeArmStats`, `percentile`, `weightedQuantile`.

`gateReadings.ts`:
- *Responsibility:* the owner's gate readings on a gameplay configuration: per-story cost, 60 s turn waits, no pregeneration, multiplayer, and the setup cap.
- *Exports:* `GameplayConfig`, `Gates`, `SetupReading`, `gates`, `storyCost`, `setupReading`, `byBasis`, and the constants listed above.

### Commit 2: "Stage 3 trims: slim and minimal requests derived from production (eval only)"

| File | Change |
|------|--------|
| `server/src/game/services/storyTextTrims.ts` (new) | See below. |
| `server/tests/unit/game/services/storyTextTrims.test.ts` (new) | See Tests. |

`storyTextTrims.ts`:
- *Responsibility:* the Stage 3 eval variants. Production's request for an input, minus the planning fields that nothing reads after generation, and minus the prompt lines that ask for them. Production never calls it.
- *Exports:* `TrimLevel` (`"slim" | "minimal"`), `trimmedBeatRequest(story, level)`, `trimmedSwitchRequest(story)`, `trimmedThreadRequest(story)`, `trimmedSetupRequest(premise, playerCount, gameMode, maxTurns)` (story kind), and `applyPromptEdits(prompt, edits, stateMarker)` with its `PromptEdit` type. The last is exported for its exactly-once test.

**The edit mechanism.**
- `PromptEdit` has two forms:
  - `{ name, find, replace }` replaces one occurrence;
  - `{ name, cutFrom, cutTo, replace }` replaces the text from the start of `cutFrom` up to, but not including, `cutTo`. The `cutTo` text stays, so a replacement that renumbers ends right before it.
- `applyPromptEdits` splits the prompt at the first occurrence of `stateMarker`, applies the edits in order to the part before it, and re-joins. The marker must exist. Each `find`, `cutFrom` and `cutTo` must occur exactly once in that part, and `cutTo` must come after `cutFrom`. Otherwise it throws `Stage 3 trim "<name>": anchor found N times`.
- State markers:
  - beat, switch and thread: `======= CURRENT GAME STATE =======`;
  - setup: `Remember: everything so far has only been general instructions and examples.`
  
  So story content and the premise are never edited, and cannot collide with an anchor.
- Edits that exist only on some production branches are included only under the same condition, as listed in the "When" column below. The conditions are `story.isMultiplayer()`, `story.getCurrentTurn() === 0` and `story.getCurrentBeatType() !== "ending"`.
- Private helpers:
  - `objectAt(shape, key)` and `arrayAt(shape, key)`: `instanceof` guards that throw on a shape mismatch;
  - `withoutSentence(description, sentence)`: exactly-once removal from a description.
  
  No `any` and no `as unknown as`.

**Beat schema** (`trimmedBeatRequest`):

| Level | Root | Each `playerN` | `plan` keeps (production order) |
|---|---|---|---|
| slim | omit `statsAffectingDecisionConsequences`, `multiplayerCoordination` | `.extend({ plan })` | `newGameElements`, `showDontTell`, `newIntroductionsOfStoryElements`, `establishedFacts`, `optionConsiderations`. The last becomes the production union's string branch plus its object branch with `keyConflictsAndDecisions`, `phaseRequirements` and `statsAffectingOptions` omitted, with the union's own description. |
| minimal | same | `.extend({ plan, text })`. `text` is production's `text` schema `.describe()`d with "Follow the 'show don't tell' elements that you generated for the 'plan' attribute." replaced by "Follow the principle of 'show don't tell'." (exactly once). | `newGameElements`, `newIntroductionsOfStoryElements`, `establishedFacts` |

Use `.omit` everywhere. It keeps production's key order; `.pick` follows the mask's order.

**Beat prompt edits** (instruction part only):

| # | Levels | When | Edit |
|---|---|---|---|
| B1 | slim, minimal | always | cut from `1. IDENTIFY STATS AND STORY ELEMENTS` to `IDENTIFY CHANGES TO THE STORY STATE BASED` → `1. ` (drops the stats-list step; step 2 becomes 1) |
| B2 | slim, minimal | multiplayer | cut from `\n\n3. MULTIPLAYER COORDINATION` to `\n\n4. GENERATE ONE STORY BEAT` → `` |
| B3 | slim, minimal | always | `${multiplayer ? "4" : "3"}. GENERATE ONE STORY BEAT FOR EACH PLAYER` → `2. GENERATE ONE STORY BEAT FOR EACH PLAYER` |
| B4 | slim, minimal | multiplayer | cut from `Which information from other beats` to `How to flesh out the game world` → `Keep this beat consistent with the beats you already created for other players in this turn, especially when several players are in the same thread or switch.\n\n` |
| B5 | minimal | always | cut from `Create a list of the three most important actions` to `the players performing the action that they chose` → `Show the three most important actions and developments in this beat instead of telling them.\nStart with ` |
| B6 | slim, minimal | not ending | `What should we consider as we create the options for this beat? Cover the following points:` → `When you design the options for this beat, consider the following:` |
| B7 | minimal | always | `--- Use the list of 'show don't tell' instructions that you generated in the plan for the beat.\n` → `` |
| B8 | slim, minimal | multiplayer, not ending | `- Take the multiplayer coordination for this set of beats into account. If several players are on the same side in a thread, this will ensure that their options are meaningfully different and both consistent and coordinated with each other.` → `- If several players are on the same side in a thread, make their options meaningfully different and both consistent and coordinated with each other.` |
| B9 | slim, minimal | multiplayer, not ending | ` The multiplayer coordination analysis for this set of beats has notes on how to avoid this.` → `` |

Everything else stays as production has it, including the "BEAT PLAN" guidance on narrating consequences, implementing the step or ending, world building and options. The world-building block instructs the three kept lists.

**Switch** (`trimmedSwitchRequest`, minimal):
- **Schema:** the root omits `player1`…`playerN` and `coordinationPatternAnalysis`. `switches` becomes `z.array(<production element>.omit({ relevantSuggestedThreadTypes, previousThreadTypesToBeAvoided, relevantSwitchAndThreadInstructions }))` with the production array's description.
- **Prompt edits:**
  - S1, always: `1. Determine the story situation for each player` → `1. Decide for each player whether the next switch is a flavor switch or a topic switch`.
  - S2, multiplayer at turn 0: cut from `a) Continuity. Since this is the beginning of the story` to `\n\n2. Determine switch coordination between players` → `This is a multiplayer game. The first thread should always be a grouped thread with all players, so every player gets a flavor switch.`
  - S3, otherwise: `c) Decision. Justify your choice of using a flavor switch or a topic switch.\n\n` → ``.
  - S4, always: `Follow steps 1a - c for each player` → `Follow step 1 for each player`.
  - S5, always: cut from `2. Switch type (topic/flavor) and justification` to `Relationship to other switches` → `2. Switch type (topic/flavor)\n3. `.
  - S6, always: `6. If flavor switch: Outcome/question that will be explored in the next thread. If topic switch: Exactly 3 possible directions that the players can follow.` → `4. If flavor switch: Outcome/question that will be explored in the next thread. If topic switch: Exactly 3 possible directions that the players can follow. Draw on the thread types this story suggests, and avoid thread types the players in this switch had lately.`
- **Unchanged:** the continuity and priority criteria (now the criteria for the `type` choice), the multiplayer step 2 (it produces the kept `coordinationPatternSummary`), and the examples.

**Thread** (`trimmedThreadRequest`, minimal):
- **Schema:** the root omits `relevantSwitchAndThreadInstructions` and `coordinationPatternSummary`. `threads` becomes `z.array(<production element>.omit({ previousThreadTypesToBeAvoided, relevantSuggestedThreadTypes, typeOfMilestone }))` with the production array's description.
- **Prompt edits:**
  - T1, multiplayer after turn 0: `A summary of how you want to set up the threads based on the switch configuration and player choices.` → `Set up the threads based on the switch configuration and player choices.`
  - T2, always: cut from `3. A list of previous thread types` to `Possible milestones that might be added to that outcome` → `3. The type of thread, summarized in a few words. Draw on the thread types this story suggests, and avoid types that the players in this thread had lately. Examples: Romantic Date, Physical Fight, Witness Interview, etc.\n4. `.
  - T3, always: `7. A progression of 2-4 beats` → `5. A progression of 2-4 beats`.

**Setup** (`trimmedSetupRequest`, minimal):
- **Schema:** the root omits `characterSelectionPlan`. Each `playerN` gets `.extend({ possibleCharacterBackgrounds })`: production's array with " Implement the background archetypes in the character selection plan." removed from its description, over production's element with " Consider the background archetypes." removed from its description.
- **Prompt edits:**
  - U1, multiplayer: `\nmultiplayerCoordination:\n` → `\n` (the rules below the heading stay).
  - U2, always: cut from `playerStatConversionRates:\n` to `- Example: 'No starting gold, but high reputation and high loyalty'` → `- Each background should represent a different tradeoff between player stats, with no option clearly better than another.\n`. The two tradeoff examples stay.

### Commit 3: "Text eval Stage 3: slim and minimal arms, single-player scope, estimates from the full form, and the trim-vs-full comparison"

| File | Change |
|------|--------|
| `server/src/evals/textModelEval/variants.ts` | `VariantId = "prod" \| "slim" \| "minimal"`; `VARIANTS` lists all three. `BUILDERS.slim`: beats call `trimmedBeatRequest(story, "slim")`; any other role throws `Variant slim does not cover role <role>`. `BUILDERS.minimal`: setup → `trimmedSetupRequest(premise, playerCount, gameMode, maxTurns)`, beat → `trimmedBeatRequest(story, "minimal")`, switch → `trimmedSwitchRequest`, thread → `trimmedThreadRequest`, iteration throws. Header comment: what each variant drops; "full" is `prod`. |
| `server/src/evals/textModelEval/arms.ts` | `ArmPlan.scope` adds `"single-player"` (cases whose tags are not multiplayer). `ArmPlan.caseIds?: string[]` restricts an arm to listed cases. `luna(effort, variant = "prod")` and `sol(…)` take a variant. New `prodSiblingKey(key)`: for `<model>@<setting>/<variant>` with a variant other than `prod`, the same key ending in `/prod`; otherwise `undefined` (arms.ts owns the key format). New `STAGE3_SETUP_PREMISES` (listed below). `armsFor("3", role)` returns the Stage 3 matrix (below). Replace `PIPELINE_ANALYSIS_ARM` and `pipelineBeatArms` with `pipelinePlan(stage): { analysis: Arm; beats: Arm[]; samples: number; scope: ArmPlan["scope"] } \| undefined`. Stage 1–2 gives Luna low (prod) → Luna none/low/medium (prod), ×2, all, as today. Stage 3 gives Luna low minimal → Luna medium minimal and Luna low minimal, ×1, single-player. Any other stage gives `undefined`. Update the "Stages 3 and 4 … no arms yet" comment to Stage 4 only. |
| `server/src/evals/textModelEval/jobPlan.ts` | `casesFor(cases, role, options, plan?: Pick<ArmPlan, "scope" \| "caseIds">)`: adds the single-player scope (any role) and `caseIds`; the `--cases` filter still intersects. `roleJobs` passes each `ArmPlan`. `pipelineJobs` takes cases, samples (`options.samples ?? plan.samples`, default 2 when there is no plan) and pairs from `pipelinePlan(options.stage)`, and always keeps the baseline pair as today. New private `measuredFor(measured, role, arm)`: the arm's own measured outputs when there are at least `MIN_MEASURED_RECORDS`, else its `prodSiblingKey` sibling's. Used in `planned` and in `chainJob`'s beat estimate. |
| `server/src/evals/textModelEval/dryRun.ts` | Two rows, "Stage 3 candidates (isolated)" and "Stage 3 pipeline chains", built like the Stage 1–2 rows. The trailing line becomes "Stage 4: no arms yet (its variants arrive with the next milestone)." Building the rows builds every trimmed request on every frozen case, so the dry run also proves that every edit applies on real cases. |
| `server/src/evals/textModelEval/armStats.ts` | `ArmStats.meanCounts: Record<string, number>` is the mean of each `CheckResult.counts` entry over usable final calls with checks (facts, newElements, introductions and statChanges for beats; storyElements and stat counts for setup; switches; threads). `medianTokens.visible` is the median of output minus reasoning. |
| `server/src/evals/textModelEval/variantComparison.ts` (new) | See below. |
| `server/src/evals/textModelEval/resultsReport.ts` | Per prompt state, after the views: `...renderVariantComparison(variantComparisons(records, checks, tags, promptState))`. It renders nothing when that state has no trimmed arms. |
| Tests | `jobPlan.test.ts`, `armsBudget.test.ts`, `resultsReport.test.ts` (fixture gains `meanCounts` and `visible`), and `variantComparison.test.ts` (new). See Tests. |

`STAGE3_SETUP_PREMISES`: 3 per player count, every multiplayer game mode, a Kids premise and three dark ones. Check that each id is a frozen case id.
- 1 player: `setup-pretend-er-doctor` (dark), `setup-custom-neo-tokyo` (dark), `setup-learn-lemonade`.
- 2 players: `setup-fiction-bounty-hunters` (competitive, dark), `setup-kids-animal-rescue` (cooperative, Kids), `setup-flexible-soul-flat` (cooperative-competitive).
- 3 players: `setup-vent-berlin-flat` (competitive), `setup-flexible-secret-society` (cooperative), `setup-pretend-cofounders` (cooperative-competitive).

**Stage 3 matrix** (`armsFor("3", role)`, in this order, so a cap stop cuts the control first):

| Role | Arms (variant) | Scope | Samples |
|---|---|---|---|
| setup | Sol low (minimal) | `caseIds: STAGE3_SETUP_PREMISES` | 1 |
| setup | Luna low (minimal) | all | 2 |
| beat | Luna medium (minimal), Luna medium (slim), Luna low (minimal), Luna low (slim), Luna none (minimal, the control) | single-player | 2 |
| switch, thread | Luna low (minimal) | all | 2 |
| iteration | none | | |

`variantComparison.ts`:
- *Responsibility:* the Stage 3 reading. Each trimmed-variant arm against the full (`prod`) arm of the same model and effort, on the same cases and samples.
- *Exports:* `VariantComparison`, `variantComparisons(records, checks, tags, promptState)`, `renderVariantComparison(comparisons)`.

How it works:
- **Records.** It uses the same filter as `computeArmStats`: frozen cases only, and chains read by their beat step.
- **Pairing.** For each non-baseline group and arm in the prompt state whose `prodSiblingKey` exists, the full arm is that sibling in the same group. For chains (`pipeline:<a>><b>`), the sibling of each side. A trimmed arm without a full sibling in the records is skipped.
- **Matching.** Take the (caseId, sample) pairs of the trimmed arm's job-final records. Keep only the full arm's records on those pairs, all attempts included. Compute `armStatsOf` on both.
- **Noise.** The full arm's noise is its `noiseFloor` (sample 1 against sample 2) for rule rates. For state counts it is |mean(sample 1) − mean(sample 2)|, via `armStatsOf` on each sample. There is none when only one sample is matched.
- **Per-arm row:**
  - role, arm, calls (trim / full);
  - first-attempt valid, k/n each;
  - median visible and reasoning tokens, full → trim, with Δ%;
  - p50 and p95 wait, full → trim;
  - for setup, the median by player count;
  - $/call billed, full → trim, with Δ%;
  - the role's share of a single-player story with pregeneration: $/call × 85, 19, 21 or 1, from `PER_STORY_WITH_PREGEN`.
- **State row:** each count, full (±noise) → trim.
- **Checks row:** the checks where the trim is lower than full minus the noise floor, and those higher than full plus it, each with both rates. With no noise floor, the rows show raw rates and no flags.
- **Chain rows:** analysis-turn p50 and p95 (`turnLatencies`), full → trim.
- **Heading:** these are readings on paired cases; waits carry server drift, because the full forms ran earlier; nothing is dropped or picked.

### Commit 4: "Docs: text eval Stage 3 (trims, matrix, comparison)"

| File | Change |
|------|--------|
| `.context/text-model-eval.md` | Update these parts, and delete the prose each change supersedes:<ul><li>**Model-free seams:** `storyTextTrims.ts` derives the Stage 3 requests from those seams (eval only; anchored exactly-once edits on the instruction part).</li><li>**Arms:** the Stage 3 matrix and pipeline pair; "Stage 4 has no arms yet" replaces the Stages 3 and 4 line.</li><li>**Estimates:** a new variant borrows its `prod` sibling's measured outputs.</li><li>**Report:** the module layout (`armStats`, `gateReadings`, `resultsReport`, `variantComparison`) and the Stage 3 section, matched on (case, sample).</li><li>**Known limits:** trimmed waits are compared with Round 1's full records (drift); multiplayer trims are unit-tested but not measured.</li></ul> |

After the run, add the Stage 3 spend and pointers (report, Round 2 page, key) to Known limits, as Round 1 did.

## Runbook (after commit 4; from `server/`; nothing under `DOCS/` is committed)

1. **Dry run:** `npm run eval:text`. Read the two Stage 3 rows. Expected (DERIVED from Round 1 per-call costs):

   | Part | Estimate |
   |---|---|
   | Sol low setup | about $0.95 |
   | Luna low setup | about $0.22 |
   | Five beat arms | about $1.07 |
   | Analysis | about $0.06 |
   | Chains | about $0.15 |
   | **Total** | **about $2.45** |

   Paste both rows into the follow-up under Borderline Insights.
2. **If the two rows exceed $2.75,** shrink in this order and re-read the dry run each time:
   1. the control at 1 sample: run its arm separately with `--samples 1`;
   2. the chains for Luna medium minimal only;
   3. Luna low slim at 1 sample.
   
   Never go below the 9 Sol premises (owner priority). If it still exceeds $3, stop and record under User Input Needed.
3. **Runs**, in this order (setup first, the owner's priority; chains last):
   1. `npm run eval:text -- --run --stage 3 --prompt-state postfix --role setup --arms gpt-6-sol@low/minimal,gpt-6-luna@low/minimal`
   2. `… --role beat --arms gpt-6-luna@medium/minimal,gpt-6-luna@medium/slim,gpt-6-luna@low/minimal,gpt-6-luna@low/slim,gpt-6-luna@none/minimal`
   3. `… --role analysis --arms gpt-6-luna@low/minimal`
   4. `… --role analysis --mode pipeline --arms gpt-6-luna@medium/minimal,gpt-6-luna@low/minimal`
   
   `--arms` keeps the (already finished) baselines out of the plan. Each run rewrites `results.md`. Record hangs (`outcome` `timeout`) separately, as Round 1 did.
4. **Read the Stage 3 section of `results.md`.** Choose the trim for the Round 2 page. The rule applies to Luna medium, the lead.
   - Take **minimal** if all three hold:
     - its validity reads pass;
     - no rule check reads lower beyond the noise floor;
     - no state count (facts, introductions, new elements per call) reads lower than the full form minus its noise.
   - Otherwise take **slim** if slim meets the same test.
   - Otherwise still take slim, and say in the report that both trims lost something.
   
   Record the choice under Controversial Decisions.
5. **Round 2 page** (free; test plan §4.5: 12 beat items, baseline, full, trimmed):
   - Build it with `npm run eval:text -- --rating-page turn --prompt-state postfix --arms gpt-4.1-mini@t0.2/prod,gpt-6-luna@medium/prod,gpt-6-luna@medium/<trim> --items 12`. Only single-player cases qualify, because the trimmed arm ran only there.
   - Rename the page to `rating/round2-turns.html` and the key to `keys/round2-turns-<pageId>.json`, as Round 1 did.
   - **Check the page.** With Playwright: serve it on 127.0.0.1, then check desktop and mobile, the `n`/`p` keys, export, reload and the console. Move screenshots to `.playwright-mcp` and clear it in the same turn.
   - **If Playwright is disconnected,** serve the page on 127.0.0.1 and run a throwaway Jest test over the HTML: the item count, 3 options per item, the repeated item and the control, and `htmlLeaks` clean. Then delete the test. Record that no visual check happened.
6. **Owner report:** `DOCS/2026-09-26_gpt6-text-eval/2026-09-26_stage3-report.md`, in the owner's register. It covers:
   - what each trim removes;
   - per arm, tokens, wait and cost, full → trim;
   - whether a trim loses anything on the automatic checks or state counts;
   - Sol low trimmed setup waits against the caps, overall and single-player;
   - the lead's per-story cost and analysis-turn p95 with the trims;
   - the Round 2 page and how to rate and export it;
   - Stage 3 spend.
   
   Give its full path in the final summary.
7. **Checks and records:**
   - `npm run check:all` from the root must be clean.
   - `client/src/page/static/Privacy.tsx` and `.context/ai-transparency.md` need no change (no production model, feature or data flow changes). Note the check in the follow-up.
   - Add the spend and headline numbers to the follow-up under Borderline Insights.
   - Set this plan's Status to implemented, `git mv` it to `.plans/completed/`, and commit with the docs.

## Tests

Follow the existing patterns:
- relative imports and `@jest/globals`;
- stories from `createMockStory` and `createMockMultiplayerStory`, and fixtures from `server/tests/helpers/textFixtures.ts` (`beatSet`, `beatGeneration`, `switchAnalysis`, `threadAnalysis`);
- eval records from `server/tests/unit/evals/textModelEval/fixtures.ts`.

Build thread, switch and ending stories the way `storyTextSteps.test.ts` and `BeatPromptService.test.ts` do.

**`server/tests/unit/game/services/storyTextTrims.test.ts` (new):**

- **`applyPromptEdits`:**
  - a replace and a cut each apply exactly once, and a cut keeps its `cutTo` text;
  - an anchor that is missing, or occurs twice, throws with the edit's name;
  - an anchor that occurs only after the state marker is not matched, and throws as missing;
  - the text from the marker on comes back unchanged.
- **Every production branch builds.** No request throws on any of these, which proves each edit's condition matches production's branch:
  - beats: first beat, a later switch beat, thread beats (mid and last step) and the ending, each single-player and 2-player, at both levels;
  - switch: single-player at turn 0 and later, multiplayer at turn 0 and later;
  - thread: single-player, multiplayer at turn 0 and later;
  - setup: 1 and 3 players.
- **Trims never touch the story state or the premise.** On those same branches, the prompt from the state marker on is byte-identical to production's.
- **Removed steps and kept rules, per role:**
  - beat: no "IDENTIFY STATS AND STORY ELEMENTS", no "Cover the following points", and in multiplayer no "MULTIPLAYER COORDINATION" and no "multiplayer coordination for this set of beats";
  - minimal beat: additionally no "generated in the plan for the beat";
  - beat, still present: "1. IDENTIFY CHANGES TO THE STORY STATE", "2. GENERATE ONE STORY BEAT FOR EACH PLAYER", the thread step's "Remember that this is beat", and in multiplayer "Keep this beat consistent";
  - switch: no "c) Decision", no "1a - c", no "Thread types that should be avoided"; the output list reads "3. Relationship to other switches" and "4. If flavor switch";
  - thread: no "A list of previous thread types"; the list reads "3. The type of thread", "4. Possible milestones" and "5. A progression";
  - setup: no "playerStatConversionRates:", no "backgroundArchetypes:", and no "multiplayerCoordination:" at 3 players, with "Each background should represent a different tradeoff" present.
- **Schemas:**
  - the key lists at every level named in the tables, in production order;
  - the kept fields are production's own zod instances (`toBe`): `statChanges`, `newMilestones`, the beat's `title`, `summary`, `options` and `interludes`, the plan's three lists, the switch's `coordinationPatternSummary`, the thread's `duration`, and every kept setup root field;
  - the setup player slots equal production's once descriptions are stripped (compare `toJsonSchema` output with every `description` key removed).
- **Downstream proof, one per variant (the task's requirement).** Parse a production-shaped fixture with the trimmed schema. zod strips the dropped fields, so the parsed value has exactly the variant's fields; assert the dropped keys are absent. Then hand it to production code:
  - **Beat, slim and minimal:** `beatSet` with a fact, a new element, an introduction, a stat change and a milestone.
    - `beatStep.apply(story, parsed as SetOfBeatGenerationSchema)` returns `[statChange, milestone, fact, element, intro]`, and the stored beat keeps the fixture's summary, options and text.
    - After `ChangeService.applyChanges`, the element exists, the fact is recorded, and the player knows the introduced element.
    - Production's next beat prompt, once the beat is played, contains the summary.
  - **Switch, minimal, single-player and 2-player:** a fixture with a distinctive `coordinationPatternSummary`, `relationshipToOtherSwitches`, title and topic choices. After `switchStep.apply`, production's switch-beat prompt contains all four.
  - **Thread, minimal:** after `threadStep.apply`:
    - the player's previous thread types contain the fixture's `typeOfThread`;
    - the current thread duration equals `duration`;
    - production's thread-beat prompt contains the thread title, the step question and the milestones.
  - **Setup, minimal, 1 and 3 players:** every field `AIStoryGenerator.createInitialState` reads is a key of the trimmed schema, with production's schema. Those fields are title, imageInstructions, guidelines, storyElements, sharedOutcomes, sharedStats, playerStats, difficultyLevel, characterSelectionIntroduction, and each `playerN` with outcomes, possibleCharacterIdentities and possibleCharacterBackgrounds. `characterSelectionPlan` is absent. (`createInitialState` cannot run without the model, so the setup proof is the consumer's field contract.)

**`jobPlan.test.ts` (extend):**
- the single-player scope leaves out multiplayer cases of any role;
- an `ArmPlan.caseIds` list restricts an arm, and `--cases` still intersects it;
- a variant with no records is estimated from its `prod` sibling's measured outputs, and from its own once it has `MIN_MEASURED_RECORDS`;
- Stage 3 chains pair Luna low minimal with the two minimal beat arms, on single-player analysis cases, at sample 1;
- Stage 1–2 chains are unchanged (three beat arms, 2 samples, all cases);
- `requestFor("slim", <a setup input>)` throws.

**`armsBudget.test.ts` (extend):** `prodSiblingKey` maps `gpt-6-luna@medium/minimal` to `gpt-6-luna@medium/prod` and keeps a `+v` verbosity part; it gives `undefined` for a `prod` key.

**`resultsReport.test.ts` (extend):** `meanCounts` averages the checks' counts over usable final calls only; `medianTokens.visible` is output minus reasoning.

**`variantComparison.test.ts` (new):**
- a trimmed arm pairs with its `prod` sibling in the same group and prompt state;
- the full arm is restricted to the trimmed arm's (case, sample) pairs: its calls on other cases and on rare-failure samples are left out;
- chains pair on both sides;
- the token, wait and cost deltas come out right;
- a check lower than full minus full's noise floor is listed as lower, and one inside the floor is not;
- a one-sample match (setup) lists no flags;
- a prompt state with no trimmed arm renders nothing.

No tests for the Stage 3 matrix, the premise list or the edit texts themselves: they are static content.

## Out of Scope

- **Adopting a trim in production,** or any production prompt, schema, model or default change. If a trim is carried forward, its production form belongs in the prompt builders or in Stage 4's rewrite.
- **The optional "facts after the text" variant** (test plan §5, A6 `factsAfterText`), which needs `mergeChanges` positions and has no room in $3.
- **Measuring multiplayer turns trimmed** (the task limits turns to single-player). Unit tests cover the multiplayer builds.
- **Other trims:** `statGroups` in story setup (droppable per the research, but not in the test plan), and the character-selection plan in template generation and iteration.
- **Stage 4:** rewrite, caching and verbosity.
- **Open harness items:** a gameplay view keyed by (beat arm, analysis arm), pricing estimates by player count, hang counts as a reading, and new automatic checks (repeated options, text–facts agreement).
- **Splitting `run.ts`,** which this plan does not grow.

## Architectural debt named

- **`storyTextTrims.ts` anchors on production prompt wording.** A production edit near an anchor fails its tests, which is intended while Stage 3 results are in use. Delete the module once Stage 3 is decided and Stage 4's rewrite supersedes it. Do not grow it into a production path.
- **`configsFor` in `resultsReport.ts`** pairs a candidate beat arm with the analysis arm of the same key. So the generic views read the Stage 3 beat arms with the baseline analysis. The Stage 3 section is the valid reading. The (beat, analysis) gameplay view stays open from Milestone 2.
- **`armsFor` is now a per-stage switch of static matrices** (Stage 1–2, Stage 3). Fine at two stages. If Stage 4 adds a third, it stays a table per stage, not new logic.

## Hand-off to the follow-up file

Copy these into `.plans/2026-09-26_build-followup.md`, each prefixed "Milestone 3 (planner):", under the heading named in brackets.

1. [Controversial Decisions] **Carry-forward for Stages 3–4 (the coordinator's choice, recorded here).** The owner has not rated Round 1 yet, so the coordinator chose:
   - turns: Luna medium (the lead) and Luna low;
   - analysis: Luna low;
   - setup: Sol low (the owner's priority) and Luna low;
   - gpt-4.1-mini and gpt-4.1 as the baselines.
2. [Controversial Decisions] **Trims are derived, not woven in.** `server/src/game/services/storyTextTrims.ts` takes production's own request and removes fields (zod `.omit`/`.extend`, kept fields are production's instances) and prompt lines (anchored edits on the instruction part, each exactly once or it throws). Production prompt and schema code are untouched. Two alternatives were rejected:
   - A `scaffold` parameter through the production builders: about 20 eval-only branches in already-strained builders, and a byte-identity risk for the prompts the post-fix baseline measured.
   - Eval-owned copies of the builders: duplication that drifts.
3. [Controversial Decisions] **Placement beside `storyTextSteps.ts`, not under `src/evals/`.** The task places variants beside the production versions, and the module's tests fail next to the prompt tests when a production edit breaks an anchor. The price is that ESLint does not bar production from importing it. Only `variants.ts` does.
4. [Controversial Decisions] **What a trim removes.** Fields nothing reads after generation, and the lines asking for them. Any rule such a line carried stays, as one sentence (for example "Keep this beat consistent with the beats you already created…", or "Draw on the thread types this story suggests…"). The planning guidance (narrating consequences, implementing the step, world building, the options considerations), the examples, the capitals and the repeats are unchanged, so Stage 3 tests "written plan versus private plan" only. slim = A6 (showDontTell plus `previousOptionsToAvoid` and `upToOneSacrificeOrRewardOption`), for beats only. minimal = everything §5 lets Stage 3 drop, for beats, switch, thread and setup. `statGroups` stays in setup; the test plan does not list it.
5. [Controversial Decisions] **"Full" is the Round 1 `prod` arms, not a new run.** The comparison uses the same (case, sample) pairs. Token and cost deltas are robust. Wait deltas carry server drift, because the full forms ran hours earlier. A same-session full rerun would cost about $1.2 more.
6. [Controversial Decisions] **Stage 3 run design (about $2.45 of $3, DERIVED):**
   - Sol low minimal setup on 9 premises (3 per player count, every game mode, one Kids and three dark) ×1; Luna low minimal on all 18 ×2;
   - Luna medium and Luna low × slim and minimal on every single-player beat case ×2; Luna none minimal as the control, ×2;
   - Luna low minimal analysis on all cases ×2;
   - chains (Luna low minimal analysis into the two minimal beat arms) on single-player analysis cases ×1.
   
   Shrink order if the dry run passes $2.75: the control to 1 sample, then the chains to Luna medium only, then Luna low slim to 1 sample. Never fewer Sol premises.
7. [Controversial Decisions] **Estimates for a new variant borrow its `prod` sibling's measured outputs.** Without that, Luna medium would be priced with the §2.2 guess of 6,200 reasoning tokens (measured: about 1,600), and the $3 cap would refuse a run that fits. The borrowed figure is conservative, since trims write less.
8. [Controversial Decisions] **`resultsReport.ts` split now** into `armStats.ts`, `gateReadings.ts` and the renderer, as the Milestone 2 follow-up specified. Stage 3's comparison is the first addition, and it would otherwise create an import cycle.
9. [Controversial Decisions] **Round 2 page rule.** Luna medium: minimal if it loses nothing beyond the full form's noise (validity, rule checks, state counts), else slim. The page shows baseline, full and trimmed, 12 items (test plan §4.5).
10. [Controversial Decisions] **Planner limits.** No sub-agent tool (no explorer, architect or reviewer agents), no Edit tool and no Bash. The architecture comparison and self-review were done inline. The self-review caught two anchor bugs in the renumbering edits before hand-off. No review round happened, and the decision-log collector's strict mode could not be run.
11. [User Input Needed] **Round 2 comes after Round 1.** The Round 2 page (about 40 minutes of rating) is built at the end of this run. Rate Round 1 first.
12. [User Input Needed] **Multiplayer turns were not trimmed in the measurement.** The trims drop `multiplayerCoordination` and `otherBeats`, which the research calls the only device for keeping players' beats consistent within one reply. A carried-forward trim would need a multiplayer check before production.
13. [Suggested Follow-Up Work] Delete `server/src/game/services/storyTextTrims.ts` and its test once Stage 3 is decided and Stage 4's rewrite supersedes it.
14. [Suggested Follow-Up Work] The optional "facts after the text" variant (A6 `factsAfterText`) and a `statGroups` trim for story setup were not run.
15. [Suggested Follow-Up Work] Automatic checks for repeated options within a thread and for text–facts agreement. The research names both as what trims might hurt, and today only the rating sees them.
