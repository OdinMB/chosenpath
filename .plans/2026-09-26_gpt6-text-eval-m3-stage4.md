# GPT-6 text eval, Milestone 3, Stage 4: the GPT-6-style rewrite with caching (eval variants), its run, and the rewrite-against-reference readings

- **Date**: 2026-09-26
- **Status**: draft
- **Type**: feature (eval variants, harness scheduling and readings). It includes two scoped pure-move refactors. Both are named debts whose tripwire this task hits: prices and estimates move out of `arms.ts` (Stage 4 adds the third matrix), and the comparison's rendering moves into `resultsReport.ts` (Stage 4 reuses the pairing).
- **Complexity**: complex
- **Branch**: `gpt6-text-eval` (already checked out; never switch, push, rebase or reset)
- **Sources**:
  - Test plan `DOCS/2026-09-26_gpt6-text-model-test-plan.md` (read-only): §5 Stage 4 and its evidence list, §4.5 Round 3, Appendix A8.
  - Research: `scratchpad/gpt6-text/prompting.md` (Q3 to Q7, §4 and §5) and `scratchpad/gpt6-text/schemas.md`.
  - Earlier plans: `.plans/completed/2026-09-26_gpt6-text-eval-m1.md`, `-m2.md` and `-m3-stage3.md`.
  - Harness docs: `.context/text-model-eval.md`.
  - Reports: Round 1 and Stage 3 under `DOCS/2026-09-26_gpt6-text-eval/`.

## Before you start

- **Commits.** Put a pathspec on the commit itself: `git commit -m "…" -- path/one path/two`.
  - Stage new files first, by explicit path (`git add path`), because `git commit -- <path>` rejects untracked paths.
  - Never run `git add -A`, `git add .` or `git commit -a`. The untracked `.plans/*-followup.md` files belong to other runs.
  - Never commit anything under `DOCS/`.
  - Stage this plan file by path with your first commit.
- **The follow-up file.** Append to `.plans/2026-09-26_build-followup.md` with Edit, under its existing headings. Never overwrite it, and label every entry "Milestone 3 (implementer)" or "Milestone 3 (eval run)".
  - The planner had no Edit tool. So **your first edit** copies the "Hand-off to the follow-up file" section at the end of this plan into the headings it names.
- **Production does not change.** Don't touch:
  - any file under `server/src/game/services/prompts/`, `core/types/*`, `storyTextSteps.ts` or `AIStoryGenerator.ts`;
  - `shared/llm/chatModel.ts`, `textModelSettings.ts` or `config.ts`, or any default.
  
  Production keeps gpt-4.1 and gpt-4.1-mini and today's post-fix prompts. The rewrite is selected only by the eval harness's variant hook.
- **Never read or edit `.env` files.** No DB migrations. Deletions only inside the project, written literally as `./path`. No inline Node or Python: try things in a Jest test or through the CLI.
- **Budget.**
  - $20.77 of the $30 hard cap is spent. The Stage 4 cap is $4, and the harness enforces it. The owner's target is about $25 in total.
  - Never raise a cap. Shrink samples before a cap would be exceeded (Runbook step 3).
- **Core rebuild.** This plan does not edit `core/`. If you do, run `npm run build:core` before the server type-check.

## Problem

Test plan Stage 4 asks whether GPT-6-style prompting improves quality and cost further, on GPT-6 and on today's gpt-4.1-mini. GPT-6-style means:
- the fixed rules sit in their own first message, cached;
- each rule is stated once, with no capitals or repeats;
- no schema definitions are restated in prose;
- counts are enforced by the schema;
- there is a compact prose-style block.

Today the harness sends one user-message string per call and never warms a cache. It has no Stage 4 arms, and it reads a variant only against its `prod` sibling. So it can neither send the rewrite nor measure cache hits and input cost against the non-rewritten form of the same arm.

## Approach

Five code commits, then the paid run, the Round 3 page and the owner report.

**1. Two pure moves** (named debts in the follow-up file, and this task trips both):
- `pricing.ts` takes the price table, cost and estimate functions out of `arms.ts`. Stage 4 adds the third stage matrix.
- `renderVariantComparison` moves into `resultsReport.ts`, so `variantComparison.ts` holds readings only. Stage 4 reuses the pairing.

**2. The rewrite (eval only), beside `storyTextSteps.ts`, in `server/src/game/services/storyTextRewrite/`.**

Each builder returns a split request:
- `fixed`: the developer message. It is byte-identical for every call of that role (setup: of that single-player or multiplayer class), so it caches.
- `perCall`: the user message. It holds this call's facts and branch instructions, then production's own state or configuration text, sliced verbatim from production's prompt.
- `schema`: production's field set, types and key order. Descriptions are rewritten only where the allocation tables below say, and counts go in as `minItems`/`maxItems`.

What stays verbatim from production:
- the story state (beats);
- the configuration block with the premise in tags (setup);
- setup's example stat setups (with-examples arm only);
- every schema field, type and key order, and every description the tables don't name;
- the shared schema instances (one player schema for all slots, one stat schema for both stat lists), so the JSON schema keeps production's references.

What is new: the fixed rules text, the per-call instructions, and the named descriptions.

**The allocation rule:**
- A rule about one field goes in that field's description.
- A rule across fields, or about the story, goes in the prompt: in `fixed` if it holds for every call, in `perCall` if it depends on this call's branch.
- Each rule appears once, stated positively, with its condition in words.
- For an inconsistent story state (or a thin or odd premise), the rule is "use the most plausible reading and continue", and the player never sees the inconsistency mentioned.

Every behaviour rule the game depends on stays, once: tables B and S in commit 3. Tests pin each rule's presence per branch.

**Scaffolds** (which planning fields the rewrite's schema keeps):
- **Turns, Luna medium: slim.** Stage 3 carried slim to Round 2 (both trims lost about the same, and slim met the pre-set fallback rule), and the Stage 3 report proposed carrying slim into Stage 4.
- **Turns, gpt-4.1-mini: full** (production's fields). It never reasons, so the written plan is its only planning. The question for it is whether the cleanup helps today's model, and a trim would confound that.
- **Turns, a hedge: Luna medium on the full scaffold,** ×1, last in the run. It answers the "full" branch of the task if the owner's Round 2 rating says slim loses to full.
- **Setup: full** (the character-selection plan stays). Stage 3's setup trim saved 7% of the tokens and no wait, and it failed an automatic check on Luna (5 visible player stats in 2 of 36 setups). gpt-4.1 also runs this rewrite, at no reasoning.
- The rewrite does not import `storyTextTrims.ts`, so the trims module can still be deleted once Stage 3 is decided. Only a test compares the slim schema's shape with it.

**3. Harness.**
- **Split requests end to end.**
  - `variants.ts`: an `EvalRequest` union and `requestText`, used for prompt storage, hashing and estimates.
  - `executor.ts` sends a split request by model family:
    - gpt-6: a `developer` message whose text part carries `prompt_cache_breakpoint: { mode: "explicit" }`, then the user message. The factory already sends `prompt_cache_options: { mode: "explicit" }`.
    - gpt-4.x: a `system` message and the user message, with no breakpoint. Its implicit prefix cache needs none, and `prompt_cache_options` is gpt-5.6+ only.
- **Warm-first scheduling.** A job with a split request carries a `cacheLine`: a hash of arm key, JSON schema and fixed text. The runner lets the first call of each line run alone. Other lines proceed in parallel, and the rest of a line starts once its first call has finished. Cases run in turn order: story, then turn; setup by player count.
  - The fixed block is story-independent, so GPT-6 reads it from any earlier call on the line. Turn order still helps gpt-4.1-mini's implicit cache of the shared state prefix.
  - The record keeps the line hash, so the report can show one write per line.
- **Rejected requests are re-planned.** A job whose final record is a 400 naming a parameter (`rejectedParam`) is not finished: the next invocation re-plans it, and validity leaves such attempts out, like transport failures. A request-shape bug found by the smoke run therefore doesn't leave a dead job behind.
- **References replace prod siblings.** `referenceKey(key)` in `arms.ts`:
  - a verbosity sub-arm reads against the same key without verbosity;
  - otherwise the key reads against its variant's base, `VARIANT_REFERENCE`: slim, minimal and rewrite → prod; rewriteSlim → slim; rewriteZeroShot → rewrite.
  
  Estimates walk that chain until they find `MIN_MEASURED_RECORDS` measured outputs. The comparison pairs each non-baseline arm with its reference arm's records, and the baseline's records can be the reference: today's `gpt-4.1-mini@t0.2/prod` is the baseline.
- **The Stage 4 matrix** is in Runbook step 3 and commit 5.
- **Readings.**
  - Per arm: cache read and write share of input tokens, cache lines and calls that wrote, and input cost per call billed and uncached. Uncached now also prices cache writes as plain input, which is "caching off". That changes nothing for earlier records: none has cache writes.
  - The noise floor comes from the reference's own sample 1 against sample 2 on the matched cases. A one-sample arm (setup, gpt-4.1-mini, the verbosity arm) still gets flags.
  - Beat checks gain two counts, `words` (prose) and `planChars` (the plan's JSON length), so prose and planning lengths are measured separately (test plan: whether verbosity reaches strings inside JSON is undocumented).
- **Dry run.** A "Stage 4 candidates (isolated)" row. Building it builds every rewrite request on every case in scope.

**4. Docs**, then the Runbook: a smoke, the paid invocations in priority order, the Round 3 page (test plan §4.5: 8 beat items, before and after the rewrite) and the owner report.

**Alternatives considered** (inline: no sub-agent tool was available to this planner).
- *Rewrite construction:*
  - **Anchored edits on production's prompt** (Stage 3's mechanism) cannot restructure a prompt into two messages or restate every rule once. Rejected.
  - **A `promptStyle` parameter threaded through the production prompt services** means eval-only branches in production builders, against the milestone rule that production prompts do not change. Rejected.
  - **A full copy of the four prompt services, then edited** is about 1,300 duplicated lines, including the state renderer and the 300-line examples. Rejected.
  - **Chosen:** new text for what the rewrite changes, and production's verbatim state, configuration, examples and schema pieces for what it does not. So the rewrite differs from production only in the instructions and the named descriptions.
- *Measuring warm caching:*
  - **Serial runs (`--max-in-flight 1`):** simpler (one flag), but about 2.2 hours of wall clock against about 40 minutes, for the same GPT-6 cache behaviour, since the fixed block is story-independent.
  - **Cache-aware estimates:** would make the dry run read about $3.3 instead of about $4.4. But an optimistic estimate lets in-flight calls overshoot the stage cap if caching fails.
  - **Chosen:** warm-first scheduling with conservative, uncached estimates, and the paid runs as separate invocations in priority order.
- *Beat rewrite for multiplayer:* not built. Stage 4 turns run single-player only, and an unmeasured multiplayer prompt would be adoption risk without evidence. The builder throws on a multiplayer story. This is a follow-up before any multiplayer adoption.

**Reviewer disagreement** (resolved inline; no review round was possible).
- A simplicity reading would skip both pure moves, the re-plan of rejected requests, and the reference-noise change, and run serially.
- An architecture reading holds that the two moves are named debts whose tripwires Stage 4 hits. It also holds that a 400 left as a "finished" job is a harness defect the Stage 4 smoke is likely to meet.
- For a feature landing in an already-strained harness, the stronger end-state wins on those items. Each is scoped to the seam this task strains, with no further restructuring.
- Serial vs warm-first is a judgement call: recorded under Decisions.

## Decisions

### DECISION: The Stage 4 rewrite is eval-owned new text beside storyTextSteps.ts that reuses production's state, configuration, examples and schema pieces verbatim
- **Affects**: architecture
- **Chosen**: `server/src/game/services/storyTextRewrite/` builds split requests (fixed developer rules, then a per-call user message, then the schema) for single-player beats and for custom-story setup. The per-call message ends with production's own story state or configuration block, sliced from production's prompt. The with-examples setup arm carries production's example stat setups verbatim. Schemas keep production's fields, types, key order and shared instances, with rewritten descriptions only where a rule moved or was stated twice, and with array counts as `minItems`/`maxItems`. Only the eval's `variants.ts` calls it, and it does not import `storyTextTrims.ts`.
- **Alternatives**: Anchored edits on production's prompt, which cannot split messages or restate rules once. A `promptStyle` parameter through the production prompt services, which breaks the milestone rule that production prompts do not change. Eval-owned copies of the prompt services, about 1,300 duplicated lines that drift.
- **Why**: The rewrite then differs from production only in the instructions it rewrites, so the Stage 4 readings measure the rewrite and caching, not a changed state or premise. Production stays untouched until the owner decides.

### DECISION: Stage 4 builds turns on slim for Luna, full for gpt-4.1-mini, and setup on the full form
- **Affects**: operations
- **Chosen**: The lead is Luna medium on the slim scaffold, the Stage 3 carry to Round 2, ×2. gpt-4.1-mini gets the rewrite on production's full scaffold, ×1. A hedge runs Luna medium on the full scaffold, ×1 and last. Setup keeps the character-selection plan on Sol low and gpt-4.1, with and without the example stat setups.
- **Alternatives**: Full for every arm, reading "its trims failed" strictly: both trims lost a little beyond noise. Slim for gpt-4.1-mini too, which confounds "does the cleanup help today's model" with an untested trim on a non-reasoning model. Setup on the minimal form, which saved 7% of the tokens and no wait, and missed the visible-stat check in 2 of 36 Luna setups.
- **Why**: Each arm reads against its own non-rewritten form, and the hedge covers the case where the owner rates slim below full.

### DECISION: Split requests go out as developer plus breakpoint on gpt-6, and as system without breakpoint on gpt-4.x
- **Affects**: architecture
- **Chosen**: The eval executor sends the fixed rules as a `developer` message whose text part carries `prompt_cache_breakpoint: { mode: "explicit" }` on gpt-6, where the factory already sends explicit cache mode. On gpt-4.x they go as a plain `system` message. The per-call part is always the user message. Nothing changes in `chatModel.ts`, and no TTL is set, so the default TTL is what is measured.
- **Alternatives**: The same message shape for both families, which risks a 400 on gpt-4.x for a gpt-5.6+ field. Setting `ttl: "30m"` through the factory, which changes production's request shape.
- **Why**: Run A's probe confirmed the breakpoint shape on GPT-6, and gpt-4.x caches a static prefix without one. On adoption, this message shaping belongs beside the factory in `shared/llm/`.

### DECISION: Warm-first scheduling per cache line measures warm caching, instead of serial runs
- **Affects**: operations
- **Chosen**: The runner lets the first call of each cache line (arm key, JSON schema and fixed text) run alone, then runs the rest of the line in parallel. Other lines are not held. Cases are queued in turn order.
- **Alternatives**: `--max-in-flight 1` for Stage 4: simpler, and the same GPT-6 cache behaviour, but about 2.2 hours of wall clock instead of about 40 minutes. Cache-aware estimates: rejected, because an optimistic estimate lets calls in flight pass the stage cap when caching fails.
- **Why**: The fixed block is story-independent, so one warm-up call per line is what production's steady traffic sees. Each write shows up as the first call of its line, which separates write cost from steady-state reads.

### DECISION: A request the API rejected is re-planned and left out of validity
- **Affects**: operations
- **Chosen**: A job whose final record is a 400 naming a parameter (`rejectedParam`) does not count as finished: the next invocation plans it again. Such attempts are left out of the validity counts and the call count, like transport failures. The rejected-parameter rate is still reported over all records.
- **Alternatives**: Keep 400s as finished. A request-shape bug found by the Stage 4 smoke would then leave dead jobs that only hand surgery on `calls.jsonl` could clear. A separate probe mode for Stage 4 shapes: more code, and its spend would sit outside `calls.jsonl`.
- **Why**: A rejected request says nothing about the model's reply. It costs nothing, and re-planning it keeps the budget ledger untouched.

### DECISION: Variants read against a reference arm, with the reference's own noise floor and a caching-off cost basis
- **Affects**: operations
- **Chosen**: `referenceKey` replaces `prodSiblingKey`. A verbosity sub-arm reads against the same key without verbosity, and otherwise against the variant's base (`VARIANT_REFERENCE`). The baseline's records can serve as a reference but are never read as candidates. Rule-check and count noise is the reference's sample 1 against sample 2 on the matched cases. The uncached basis prices cache writes as plain input. The comparison adds cache read and write shares, cache lines, writing calls, and input cost billed and uncached.
- **Alternatives**: A separate Stage 4 comparison module, duplicating the pairing, matching and noise logic. Noise only from matched samples, which gives one-sample arms no flags at all.
- **Why**: Stage 4 has chained references (the verbosity arm on the rewrite, the rewrite on slim, today's rewrite on the baseline), and several one-sample arms whose references have two samples.

### DECISION: Stage 4 run design inside the $4 cap
- **Affects**: operations
- **Chosen**: The arms, in priority order:
   - Sol low setup with and without the examples on the 9 Stage 3 premises ×1;
   - Luna medium rewriteSlim on the 44 single-player turn cases ×2;
   - gpt-4.1-mini rewrite ×1;
   - gpt-4.1 setup with and without the examples on the 9 premises ×1, shrinkable to 6 or 3;
   - Luna medium with verbosity low, rewriteSlim ×1;
   - Luna medium rewrite on the full scaffold ×1.

   Each is a separate invocation, checked against what is left of the cap. Estimates are uncached (about $4.4 in total), and caching brings the expected spend to about $3.3 (DERIVED). No analysis rewrite runs.
- **Alternatives**: One invocation, which the uncached estimate refuses. gpt-4.1 setup at 6 premises from the start: it gives up comparability without need, while the adaptive shrink keeps it only when the money is there. Luna low turns: not in the task's design.
- **Why**: The owner's priority is Sol setup and the lead's turns. A cap stop or shrink then lands on the reference-only arms.

## Changes

### Commit 1: "Text eval: prices and estimates out of arms.ts into pricing.ts" (pure move)

| File | Change |
|------|--------|
| `server/src/evals/textModelEval/pricing.ts` (new) | Moved verbatim from `arms.ts`: `Usage`, `Price`, `PRICES`, `priceFor`, `costFromUsage`, `visibleOutputTokens`, `reasoningTokens`, `MIN_MEASURED_RECORDS`, `Estimate`, `median`, `estimateCall` and `outputTokensPerSecond`. It imports the `Arm` and `EvalRole` types from `arms.ts`, and `arms.ts` never imports it. |
| `server/src/evals/textModelEval/arms.ts` | Keeps roles, stages, `Arm`, `ArmPlan`, the key formats, the baseline, the matrices and the pipeline plans. Header comment updated. No re-exports. |
| Importers | `runner.ts`, `armStats.ts`, `probe.ts`, `dryRun.ts`, `jobPlan.ts`, and any other importer that `rg "costFromUsage\|estimateCall\|outputTokensPerSecond\|MIN_MEASURED_RECORDS" server/` finds, tests included (`armsBudget.test.ts`). Imports change; no logic changes. |

`pricing.ts`:
- *Responsibility:* what a call costs: the per-model price table, the cost of measured usage, and the pre-run estimate of a planned call.
- *Exports:* `Usage`, `Estimate`, `costFromUsage`, `estimateCall`, `outputTokensPerSecond`, `MIN_MEASURED_RECORDS`.

### Commit 2: "Text eval report: the variant comparison's rendering moves into resultsReport.ts" (pure move)

| File | Change |
|------|--------|
| `server/src/evals/textModelEval/variantComparison.ts` | Keeps the readings: `CheckReading`, `CountReading`, `VariantComparison` and `variantComparisons`. The rendering half moves out: `renderVariantComparison` and its helpers (`fromTo`, `callsPerStory`, `storyShare`, `renderArmRows`, `renderStateRows`, `renderSetupWaits`, `renderChainWaits`). Header comment: readings only. |
| `server/src/evals/textModelEval/resultsReport.ts` | Gains the rendering as private functions. Reconcile the duplicate formatters (`pct`, `secs`, `usd`) without changing any rendered string: the undefined-tolerant versions win. |
| `server/tests/unit/evals/textModelEval/variantComparison.test.ts`, `resultsReport.test.ts` | Rendering assertions move to `resultsReport.test.ts` and go through `renderResults`. No assertion changes. |

### Commit 3: "Stage 4 rewrite: split requests for single-player beats and custom-story setup (eval only)"

| File | Change |
|------|--------|
| `server/src/game/services/storyTextRewrite/common.ts` (new) | The split request type, first-occurrence slicing of production's prompt, and zod guards. |
| `server/src/game/services/storyTextRewrite/beat.ts` (new) | `rewriteBeatRequest(story, scaffold)`, per tables B and BS below. |
| `server/src/game/services/storyTextRewrite/setup.ts` (new) | `rewriteSetupRequest(premise, playerCount, gameMode, maxTurns, withExamples)`, per tables S and SS below. |
| Tests (new) | `server/tests/unit/game/services/storyTextRewrite/common.test.ts`, `beat.test.ts` and `setup.test.ts` (see Tests). |

`common.ts`:
- *Responsibility:* what both rewrites share: the split request shape, taking production's verbatim text from its prompt at an anchor, and guarded access to production's zod schemas.
- *Exports:*
  - `SplitTextRequest` (`{ fixed: string; perCall: string; schema: z.ZodTypeAny }`);
  - `textFrom(text, anchor, name)`: from the anchor's first occurrence, which must exist;
  - `textBetween(text, from, to, name)`: between the first occurrences, exclusive, both present and in order;
  - `asObject`, `asArray`, `asUnion`, `asDiscriminatedUnion`: `instanceof` guards that throw with the label. No `any` and no `as unknown as`.

`beat.ts`:
- *Responsibility:* the Stage 4 single-player beat request. It holds the fixed rules, the per-call instructions for this beat's branch followed by production's story state, and production's beat schema with the named descriptions rewritten and counts enforced.
- *Exports:* `RewriteScaffold` (`"full" | "slim"`), `rewriteBeatRequest(story, scaffold): SplitTextRequest`.
- It throws `Stage 4 rewrite covers single-player beats` for a multiplayer story.
- `perCall` ends with production's prompt from the first `======= CURRENT GAME STATE =======`, taken from `beatStep.request(story).prompt`.

`setup.ts`:
- *Responsibility:* the Stage 4 custom-story setup request. It holds the fixed rules (optionally with production's example stat setups), production's configuration block with the premise as the per-call message, and production's story-kind setup schema with counts enforced.
- *Exports:* `rewriteSetupRequest(premise, playerCount, gameMode, maxTurns, withExamples): SplitTextRequest`.
- `perCall` is production's prompt from the first `Number of players:`, taken from `setupStep.request(…, "story").prompt`.
- The examples are `textBetween(prod, "EXAMPLE STAT SETUPS", "Character Selection Instructions")`. Both anchors must occur exactly once in the text before `Number of players:`.
- `fixed` is identical for every premise and game mode within the single-player class, and within the multiplayer class. Multiplayer rules are stated as "In multiplayer games, …".

**Writing the text.** You write the wording. The constraints:
- Every row of tables B and S appears once, in the place the table names.
- No word of three or more capital letters, except `NPC` and `JSON`.
- No sentence appears twice anywhere in the request: fixed, per-call instructions, or schema descriptions.
- No schema description is restated in the prompt.
- Plain sentences and short lists. Numbered sections are fine: the GPT-5.4 guidance favours structure for small models, and Luna is GPT-6's smallest.
- Keep each good/bad example pair a rule names, once.
- Production's verbatim parts are exempt from these checks: the state, the configuration block and the examples.
- `fixed` ends with one line saying that the field descriptions in the reply format are part of the instructions.
- `fixed` opens with the persona and the prose-style block.

**Table B: beat rules** (single-player; "fixed" is identical for every beat call and both scaffolds):

| # | Rule (substance, from production) | Where | Applies when |
|---|---|---|---|
| B1 | Persona and register: the narrator of an interactive story, with tone from the story's guidelines | fixed | always |
| B2 | Second person for the player character, present tense; other characters by name or in third person | fixed | always |
| B3 | 5–6 paragraphs of 3–5 sentences, plain prose (no headings, lists or bold) | fixed | always |
| B4 | Show, don't tell (the sage's-hint good/bad pair); direct speech with the actual words, for the player and the NPCs | fixed | always |
| B5 | From the second beat on, the first paragraph continues exactly where the player's previous beat ended. It narrates the chosen action, in the scene, and its already-decided result. | fixed | always |
| B6 | Vary openings (not "You step/stand/sit/lean"); names exactly as in the story state | fixed | always |
| B7 | No game words in anything the player sees: NPC, player character, stat, beat, milestone, points, success rate | fixed | always |
| B8 | Phrases to avoid: the checker's `STOCK_PHRASES` plus the fiction-relevant items of the GPT-6 slop list ("delve", "it's worth noting", "genuinely", "This isn't about X. It's about Y."), and no "X, not Y" framing | fixed | always |
| B9 | The last paragraph never mentions or hints at the options (production's banned formulations) | fixed | always |
| B10 | Inconsistent story state: use the most plausible reading, continue, and never mention it where the player sees it | fixed | always |
| B11 | How the game works, compactly: beats; threads (2–4 beats, a question about outcomes, favorable/mixed/unfavorable, and points shift the distribution, with the 50-point example); switches (topic vs flavor, with the two examples); the story's structure | fixed | always |
| B12 | Stat changes: a sacrifice option loses what was sacrificed; a reward option gains the reward; replacing a string[] item is a removeElement plus an addElement; within a thread, only stats marked as changeable in beat resolutions change, and only a little | fixed | always |
| B13 | A thread was just resolved: any stat may change, per its "Adjustments after threads" and what was at stake. Add one milestone per outcome of each resolved thread, based on its resolution and made specific (the railroad example). | perCall | later switch, ending |
| B14 | Story elements: add one only when it is likely to recur, since most beats add none. When the player meets an element for the first time, introduce it and record the introduction. Never reintroduce a known element. | fixed | always |
| B15 | Facts: only new details; 3 or more per switch and per thread step; linked to element ids, with `world` only when nothing fits; none for elements created in this beat. Plant one detail that makes the player curious. | fixed | always |
| B16 | Stats shape which options exist, narratively (the force/agility example); sacrifice and reward options only for stats whose definitions allow them | fixed | not ending |
| B17 | This beat's option type (exploration, or challenge), computed as the checker's `expectedOptionType` does | perCall | switch, thread |
| B18 | The options answer this step's question | perCall | thread |
| B19 | Switch options: a topic switch offers the directions from the switch configuration; a flavor switch offers approaches to its set question; nothing similar to earlier threads; reinforce the story's key conflicts and decision types | perCall | switch |
| B20 | Follow the thread's progression plan. Set up this step's question and stop before its resolution (the troll example). | perCall | thread |
| B21 | Last step: don't narrate the thread's resolution. Not the last step: no permanent gain or loss of the thread's goal (the artifact example). | perCall | thread (last / not last) |
| B22 | The previous beat's result sets the tone (momentum after favorable, difficulty after unfavorable), and the thread configuration says what success and failure mean | perCall | thread with a completed step; switch after a thread |
| B23 | Narrate the resolved thread, with at least one full paragraph on the new milestone: what it is, its outcome, and why it matters to the player | perCall | later switch |
| B24 | First beat: introduce the player, hint at their outcomes, and introduce some elements (record the introductions). Add no new elements or facts, and keep it a good switch. | perCall | first beat |
| B25 | Ending: close the previous thread, then the story. Tie it to each of the player's outcomes and why they resonate, and to the stats worth mentioning. No new elements. | perCall | ending |
| B26 | Title: the switch's title; or the thread's title with "(k/n)" filled in; or "The End" | perCall | always |
| B27 | Image tags: the format with its example; at the start of a paragraph; 1–2 per beat (3 are too many); none in or after the last paragraph; ids only from the library or just requested; player images by slot id; the player's own image only in the first beat; a requested image used in the 3rd or 4th paragraph with source `story` | schema: `text` | images shown |
| B28 | No image tags | schema: `text` | no images |
| B29 | Player images use source `template` or `story`, per `isBasedOnTemplate()`. When the library has no non-player images yet: the player's image plus requested ones only. | perCall | images shown |
| B30 | Show the player's own portrait plus another element | perCall | first beat with images |
| B31 | Request an image only when nothing fitting exists (the glyphs and birds examples); generic element images first (production's `GENERIC_ELEMENT_IMAGES_FIRST_INSTRUCTION`, imported); only the references needed | schema: `imageRequest` | generating |
| B32 | Interludes: 1 stream of consciousness of the player (imageId = slot), 1–2 about elements in the beat (imageId = element id), 0–1 world detail (any image, or `cover`); imply, don't spell out (canal and distillery examples); with images off, an empty imageId and source `none` | schema: `interludes` | always |
| B33 | Options, as a set: specific (good/bad pairs); only the action, never its consequences, except naming the stat traded in a sacrifice or reward option; stay in the scene; what the text narrated is established; at most one sacrifice or reward option; sacrifices are always lost and rewards always gained; flavourful wording (the lips example); nothing similar to earlier options in this thread | schema: `options`, `resourceType` | not ending |
| B34 | The story ends with this beat, so the options stay empty | schema: `options` | ending |
| B35 | Challenge options: basePoints ranges, sacrifice `+${POINTS_FOR_SACRIFICE}` and reward `${POINTS_FOR_REWARD}`, riskType, the modifiers' statId form, and a reason consistent with the stat. A modifier's effect is within ±15, and when a stat's definition names a larger effect, 15 is used. | schema: challenge option | challenge options |
| B36 | Show-don't-tell points: the most important developments, the player's chosen action first, each with a pointer for showing it | schema: `plan.showDontTell` | always |
| B37 | The field descriptions of the reply format are part of these instructions | fixed | always |

**Table BS: beat schema changes** (both scaffolds, on top of the field set):

| Path | Count | Description |
|---|---|---|
| root (slim) | – | Production's root without `statsAffectingDecisionConsequences` and `multiplayerCoordination`. Full keeps production's root. |
| `player1.plan` | – | slim: `newGameElements`, `showDontTell`, `newIntroductionsOfStoryElements`, `establishedFacts`, and `optionConsiderations` cut to the string branch plus `previousOptionsToAvoid` and `upToOneSacrificeOrRewardOption`. Full: production's plan. |
| `plan.showDontTell` | length 3 | B36 |
| `player1.text` | – | Rewritten per image flags: B27 or B28, plus a pointer to the prose-style block and to the show-don't-tell points. No paragraph counts (B3 lives in `fixed`). |
| `player1.imageRequest` (generating) | – | Production's plus B31 |
| `player1.options` (not ending) | length 3 | B33 |
| `player1.options` (ending) | none | B34 |
| challenge `modifiersToSuccessRate` | max 2 | "The most relevant stats" without the number; its element's `effect` carries B35's cap rule |
| `player1.interludes` | length 3 | B32, without "exactly 3" |
| everything else | – | production's instances |

Rebuild with `.extend` on production's instances, taken from `beatStep.request(story).schema` through the guards. Production's key order and discriminated-union branches stay. Only array counts are enforced: no numeric bounds (see Out of Scope).

**Table S: setup rules** ("fixed" is identical within the single-player class and within the multiplayer class):

| # | Rule | Where | Applies when |
|---|---|---|---|
| S1 | Task: build the setup from the premise, player count and game mode in the user message | fixed | always |
| S2 | Inclusivity and diversity, every production point in order: a diverse cast across the listed dimensions; defying stereotypes (the four examples); romance not limited by gender; pronouns respected; deviate only when the premise requires it (the LGBTQ+ example); weave it into guidelines, identities, backgrounds and NPCs, in the story's own flavour; don't overdo it | fixed | always |
| S3 | Element mix: 2–4 NPCs, 2–4 locations, 2–4 other elements; no player characters among them | fixed | always |
| S4 | The instructions attribute sets story hints and mechanics (production's three examples) | fixed | always |
| S5 | No material from established franchises (the two examples) | fixed | always |
| S6 | Every player has 3 outcomes counting shared ones, with 6 milestones in total | fixed | always |
| S7 | Shared outcomes: 0–3, with 0–6 milestones between them; each player has 3 − shared individual outcomes with 6 − shared milestones (the worked example); a shared outcome is never repeated as an individual one (the forest example) | fixed | multiplayer |
| S8 | 3–4 visible shared stats and 3–4 visible player stats, plus any invisible ones; in multiplayer games, stats that keep the score of contested things | fixed | always (plus multiplayer) |
| S9 | Stat groups: flavourful, short names (the three examples) | fixed | always |
| S10 | Stat design: favour string and string[] (the two exceptions); the mix of stats shapes the story's focus (the space-opera example); vary the types (the wizard example); shared vs player (the ship and NPC examples); isVisible for hidden mechanics; partOfPlayerBackgrounds false (the health and status examples); names convey the stat, with no placeholders; don't track outcome progress (except contested outcomes in multiplayer), remaining turns or ordinary decisions; in multiplayer, backgrounds stay consistent across players (the pilot and guitarist examples) | fixed | always (plus multiplayer) |
| S11 | Stat types: when each fits, with production's examples and not-good-for cases. Leave out the one-line definitions that the schema's `type` description gives. | fixed | always |
| S12 | How stats act in play: threads, beats, favorable/mixed/unfavorable, points, sacrifices and rewards shifting chances, early beats helping later ones, and the last beat deciding the milestone | fixed | always |
| S13 | Backgrounds differ and balance, so none is clearly better; in multiplayer, identities and backgrounds differ from, and stay consistent with, the other players' | fixed | always (plus multiplayer) |
| S14 | Exactly one difficulty level. What +10, 0, −10 and −20 mean. Match the range to the story type: kids, cozy and wholesome +20 to 0; balanced, adventure and mystery +10 to −10; horror, grim, dark and survival 0 to −20 (the three examples). | fixed | always |
| S15 | "Example stat setups (for depth and shape; your setup fits its own premise):" then production's examples verbatim | fixed | with examples |
| S16 | A thin or contradictory premise: use the most plausible reading, build a complete setup, and don't comment on it | fixed | always |
| S17 | The field descriptions of the reply format are part of these instructions | fixed | always |
| S18 | Production's configuration block verbatim: the number of players, the game-mode description, and `<premise>` | perCall | always |

The per-field stat definitions stay only in `statSchema`'s descriptions and leave the prompt: effect sizes, sacrifice and reward options, narrative thresholds, adjustments after threads, and whether a stat can change in beat resolutions. The same goes for the outcome resolutions and milestone counts in `outcomeSchema`, and for the character-selection plan's fields.

**Table SS: setup schema changes** (on production's `createStorySetupSchema(playerCount, "story")`):

| Path | Count | Description |
|---|---|---|
| `storyElements` | min 6, max 8 | production's |
| story element `facts` | length 3 | without "Three"; keeps the NPC pronouns and motivations rule |
| `guidelines.typesOfThreads` | min 6, max 8 | without "6-8" |
| `guidelines.switchAndThreadInstructions` | max 3 | without "Generate 0-3 instructions." |
| `statGroups` | max 3 | without "Maximum of 3 groups." |
| stat `effectOnPoints` (one stat instance, both lists) | min 3 | without "List 3 ways" and "Remember: at least 3 items in this list!" |
| `difficultyLevel` and its `modifier` | – | what the field is; the story-type mapping lives in S14 only |
| `characterSelectionPlan.playerStatConversionRates` | length 3 | without "List three" |
| `characterSelectionPlan.backgroundArchetypes` | length 3 | without "exactly 3" |
| `characterSelectionPlan.multiplayerCoordination` | length 3 (multiplayer only) | without "List three"; single-player keeps production's |
| `playerN.outcomes` (one player instance, all slots) | max 3 | production's |
| `playerN.possibleCharacterIdentities` | length 3 | "Identities the player can choose from." |
| `playerN.possibleCharacterBackgrounds` | length 3 | without "Generate exactly 3" |
| everything else | – | production's instances |

### Commit 4: "Text eval: split requests, warm-first scheduling and re-planned rejected requests"

| File | Change |
|------|--------|
| `server/src/evals/textModelEval/variants.ts` | `VariantId` adds `rewrite`, `rewriteSlim` and `rewriteZeroShot`, and `VARIANTS` lists all six. `export type EvalRequest = TextRequest \| SplitTextRequest`; `isSplitRequest(request)`; `requestText(request)`: the prompt, or `fixed + MESSAGE_SEPARATOR + perCall` with `MESSAGE_SEPARATOR = "\n\n----- per-call message -----\n\n"`. `requestFor` returns `EvalRequest`. The new builders: **rewrite**: setup → `rewriteSetupRequest(…, true)`, beat → `rewriteBeatRequest(story, "full")`. **rewriteSlim**: beat → `rewriteBeatRequest(story, "slim")`. **rewriteZeroShot**: setup → `rewriteSetupRequest(…, false)`. Any other role throws `Variant <v> does not cover role <role>`. The header comment lists the variants and what each builds on. |
| `server/src/evals/textModelEval/executor.ts` | `CallSpec.request: EvalRequest`. New exported `chatInput(request, model)`: a string for a `TextRequest`. For a split request on gpt-6: `[new ChatMessage({ role: "developer", content: [{ type: "text", text: fixed, prompt_cache_breakpoint: { mode: "explicit" } }] }), new HumanMessage(perCall)]`. On gpt-4.x: `[new SystemMessage(fixed), new HumanMessage(perCall)]`, choosing the family with `modelFamily` from `chatModel.ts`. `storePrompt` stores `requestText(request)`. |
| `server/src/evals/textModelEval/jobPlan.ts` | `requestChars` uses `requestText` plus the schema. New private `inTurnOrder(cases)`: beats, switch and thread by `caseStory(c).getId()`, then `getCurrentTurn()`, then id; setup by `setup.playerCount`, then id; applied to every arm's scoped cases (it changes only execution order). `callJob` sets `cacheLine` for a split request: `sha256(armKey \| JSON schema \| fixed).slice(0, 12)`. |
| `server/src/evals/textModelEval/runner.ts` | `Job.cacheLine?` and `CallRecord.cacheLine?`, copied onto every record of the job. `PlannedCall.request: () => EvalRequest`. `finishedJobKeys` ignores final records with `rejectedParam`. `runPhase` becomes warm-first: a worker takes the first queued job whose line is unset, already warm, or not being warmed. When that job warms a line, the line is warm once the job finishes, whatever its outcome. If every queued job is on a line being warmed, the worker waits for a warm-up to finish, then re-checks `stoppedReason`. Header comment updated. |
| `server/src/evals/textModelEval/validityGate.ts` | `modelAttemptsByStep` drops `rejectedParam` records as it drops transport failures. The `transportOnly` doc comment becomes "calls without a model attempt (transport failures or rejected requests)". |
| `server/src/evals/textModelEval/armStats.ts` | `calls` counts final records without `rejectedParam`. |
| Tests | `executor.test.ts`, `jobPlan.test.ts`, `runner.test.ts` and `validityGate.test.ts` (see Tests). |

### Commit 5: "Text eval Stage 4: arms, references, and the variant-against-reference readings with caching"

| File | Change |
|------|--------|
| `server/src/evals/textModelEval/arms.ts` | `referenceKey(key)` replaces `prodSiblingKey`. It parses `<model>@<setting>[+v<verbosity>]/<variant>` (a pipeline key gives `undefined`). With a verbosity part: the same key without it. Otherwise `VARIANT_REFERENCE[variant]` (slim, minimal and rewrite → prod; rewriteSlim → slim; rewriteZeroShot → rewrite; prod → none). New private `todays(model, variant)` = `makeArm({ model, temperature: 0.2 }, variant)`. `luna` and `sol` take an optional verbosity. `armsFor("4", role)` returns the Stage 4 matrix below, and `pipelinePlan("4")` stays `undefined`. `STAGE3_SETUP_PREMISES` gets a doc comment: "Stages 3 and 4". |
| `server/src/evals/textModelEval/jobPlan.ts` | `measuredFor` walks `referenceKey` from the arm's own key until a key has `MIN_MEASURED_RECORDS` outputs, else it returns its own (at most 4 steps). |
| `server/src/evals/textModelEval/armStats.ts` | `ArmStats.cache: { readShare, writeShare, writingCalls, lines }`. The shares are ΣC/ΣI and ΣW/ΣI over all attempts; `writingCalls` counts records with W > 0; `lines` counts distinct `cacheLine`. `ArmStats.inputCost: Record<CostBasis, number>`, the mean per call with attempts summed: billed is `costFromUsage(model, { I, C, W, O: 0 })`, uncached is I at the input rate. `uncachedCost` prices cache writes as plain input (`cacheWriteTokens: 0`). |
| `server/src/evals/textModelEval/variantComparison.ts` | Types rename `trimmedKey`/`fullKey`/`trimmed`/`full` to `armKey`/`referenceKey`/`arm`/`reference`. `byArm` holds every result record in the prompt state, the baseline's included. Candidates are the non-baseline arms. The reference is `referenceKey` of the arm, or of each side for a chain. Matching is unchanged. The noise comes from the reference's records on the matched cases, sample 1 against sample 2 (`hasNoise` when both exist), for rule rates and counts. The header comment says Stages 3 and 4. |
| `server/src/evals/textModelEval/resultsReport.ts` | The section becomes "Variants against their reference (Stage 3 trims, Stage 4 rewrite)", with columns read reference → arm. The arm table gains a Reference column. A new "Input and caching" table per comparison: cache lines, calls that wrote, cache read share, median input tokens, input $/call billed and uncached, $/call billed and uncached, and the 1-player-story share on both bases. The state and check rows now include `words` and `planChars`. The header comment is updated. |
| `server/src/evals/textModelEval/textChecks.ts` | `checkBeat` counts gain `words` (prose words, image tags stripped) and `planChars` (`JSON.stringify(beat.plan).length`). |
| `server/src/evals/textModelEval/dryRun.ts` | The row "Stage 4 candidates (isolated)" is built like the Stage 3 row. The "Stage 4: no arms yet" line goes. |
| Tests | `armsBudget.test.ts`, `jobPlan.test.ts`, `variantComparison.test.ts`, `resultsReport.test.ts` and `textChecks.test.ts` (see Tests). |

**Stage 4 matrix** (`armsFor("4", role)`, in this order):

| Role | Arm key | Scope | Samples |
|---|---|---|---|
| setup | `gpt-6-sol@low/rewrite` | `caseIds: STAGE3_SETUP_PREMISES` | 1 |
| setup | `gpt-6-sol@low/rewriteZeroShot` | same | 1 |
| setup | `gpt-4.1@t0.2/rewrite` | same | 1 |
| setup | `gpt-4.1@t0.2/rewriteZeroShot` | same | 1 |
| beat | `gpt-6-luna@medium/rewriteSlim` | single-player | 2 |
| beat | `gpt-4.1-mini@t0.2/rewrite` | single-player | 1 |
| beat | `gpt-6-luna@medium+vlow/rewriteSlim` | single-player | 1 |
| beat | `gpt-6-luna@medium/rewrite` (full-scaffold hedge) | single-player | 1 |
| switch, thread, iteration | none | | |

### Commit 6: "Docs: text eval Stage 4 (rewrite, caching, warm-first runner, references)"

| File | Change |
|------|--------|
| `.context/text-model-eval.md` | Update these parts, and delete the prose each change supersedes: <ul><li>**Model-free seams:** `storyTextRewrite/` builds the Stage 4 split requests: fixed rules, then the per-call message ending with production's verbatim state or configuration, then production's schema with the named descriptions and counts. Eval only; single-player beats and custom-story setup. The first-occurrence anchors (the state marker, `Number of players:`, the examples' two headings) fail its tests on a production edit.</li><li>**Runner:** warm-first per cache line, and rejected requests re-planned and left out of validity.</li><li>**Arms:** the Stage 4 matrix, `referenceKey` and `VARIANT_REFERENCE`; replace "Stage 4 has no arms yet".</li><li>**Estimates:** the reference chain; Stage 4 estimates ignore caching.</li><li>**Report:** `pricing.ts` in the module list; rendering all in `resultsReport.ts`; the variant section, its references, the noise from the reference, the input and caching table, the caching-off uncached basis, and the `words`/`planChars` counts.</li><li>**Known limits:** default cache TTL; multiplayer beats not rewritten; the generic views pair Stage 4 beat arms with the baseline analysis (read the variant section).</li></ul> After the run, add the Stage 4 spend and pointers to Known limits, as Stage 3 did. |

## Runbook (after commit 6; from `server/`; nothing under `DOCS/` is committed)

1. **Dry run:** `npm run eval:text`. Read the Stage 4 row.
   - Expected (DERIVED from Round 1 and Stage 3 per-call figures) is 256 jobs (setup 36, beat 220), about $4.4 uncached. That is over the $4 cap, because estimates ignore caching.
   - The dry run building the row proves every rewrite request builds on every case in scope.
   - Paste the row into the follow-up under Borderline Insights.
2. **Smoke** (real calls, kept as records):
   1. `npm run eval:text -- --run --stage 4 --prompt-state postfix --role beat --arms gpt-6-luna@medium/rewriteSlim,gpt-4.1-mini@t0.2/rewrite --cases <one single-player thread case with images> --samples 1`
   2. `… --role setup --arms gpt-6-sol@low/rewrite,gpt-4.1@t0.2/rewrite --cases setup-learn-lemonade`
   
   Read the four records in `calls.jsonl`:
   - **All valid:** go on.
   - **A 400 naming a parameter:** fix the request shape, commit, and re-run the smoke. The job is re-planned.
   - **Luna or Sol shows `cacheWriteTokens` 0:** the breakpoint did not reach the API. Stop, and record it under User Input Needed with the record.
   - Also note whether the write covers the schema. It should be about the schema plus the fixed text, which answers Run A's open question: "is the schema in the cacheable prefix?".
3. **Paid invocations,** in this order. Each is its own `--run --stage 4 --prompt-state postfix` with `--role` and `--arms`, and is checked against what is left of the $4:

   | # | `--role` / `--arms` | Calls | Uncached estimate | Expected with caching |
   |---|---|---|---|---|
   | 1 | setup / `gpt-6-sol@low/rewrite,gpt-6-sol@low/rewriteZeroShot` | 18 | about $1.85 | about $1.40 |
   | 2 | beat / `gpt-6-luna@medium/rewriteSlim` | 88 | about $0.25 | about $0.18 |
   | 3 | beat / `gpt-4.1-mini@t0.2/rewrite` | 44 | about $0.39 | about $0.30 |
   | 4 | setup / `gpt-4.1@t0.2/rewrite,gpt-4.1@t0.2/rewriteZeroShot` | 18 | about $1.70 | about $1.25 |
   | 5 | beat / `gpt-6-luna@medium+vlow/rewriteSlim` | 44 | about $0.12 | about $0.09 |
   | 6 | beat / `gpt-6-luna@medium/rewrite` | 44 | about $0.12 | about $0.10 |
   | | **Total** | **256** | **about $4.4** | **about $3.3** (total spend then about $24.1) |

   **Shrink rules** (never raise a cap):
   - If invocation 4 is refused, add `--cases` with 6 premises: `setup-pretend-er-doctor,setup-learn-lemonade,setup-fiction-bounty-hunters,setup-kids-animal-rescue,setup-vent-berlin-flat,setup-pretend-cofounders`. If it is still refused, use 3: `setup-learn-lemonade,setup-kids-animal-rescue,setup-pretend-cofounders`.
   - Invocations 5 and 6 run only while they fit. A cap stop part-way is fine.
   - Never fewer than 9 Sol premises.
   
   After invocation 1, check the first line's second and third calls for `cachedTokens` > 0. If they show none, caching reads are failing: continue (the cost still fits), and record it. Record hangs (`outcome` `timeout`) separately, as Round 1 did.
4. **Read the variant section of `results.md`.** It gives, per Stage 4 arm against its reference, on matched (case, sample) pairs:
   - validity;
   - visible, reasoning and input tokens;
   - cache read share and writes per line;
   - input cost billed and uncached;
   - waits;
   - per-call and per-story cost;
   - state counts including `words` and `planChars`;
   - the checks beyond the reference's noise.
   
   Derive the lead's figures from these rows:
   - the per-story cost: rewriteSlim turns ×85, plus Stage 3's Luna low minimal analysis (19 switch and 21 thread calls), plus a Sol low rewrite setup;
   - its 60 s reading: thread p95 plus rewriteSlim p95, added.
5. **Round 3 page** (free; test plan §4.5: 8 beat items, before and after the rewrite):
   - `npm run eval:text -- --rating-page turn --prompt-state postfix --arms gpt-6-luna@medium/slim,gpt-6-luna@medium/rewriteSlim --items 8 --cases <single-player turn cases on neither the Round 1 nor the Round 2 page>`
   - Take the case ids from `keys/round1-turns*.json` and `keys/round2-turns-891345004e.json`. If fewer than 9 qualify, re-admit Round 1 cases only: Round 2 showed the slim texts.
   - Rename the page to `rating/round3-turns.html` and the key to `keys/round3-turns-<pageId>.json`.
   - Check it with Playwright (serve on 127.0.0.1; desktop and mobile, the `n`/`p` keys, export, reload and the console; move screenshots to `.playwright-mcp` and clear it in the same turn).
   - If Playwright is disconnected, serve `rating/` on 127.0.0.1 and run a throwaway Jest test over the HTML: the item count, 2 options per regular item, the repeat and the control, the baseline label balance, the controls, and `htmlLeaks` clean. Then delete the test, and record that no visual check happened.
6. **Owner report:** `DOCS/2026-09-26_gpt6-text-eval/2026-09-26_stage4-report.md`, in the register of the Stage 3 report. It covers:
   - what the rewrite changes, and what it keeps verbatim;
   - caching: hit rates, whether the schema sits in the cached prefix, input cost with and without caching, and the cost per story;
   - per arm, tokens, waits, cost, checks and counts against the reference;
   - the verbosity reading, prose (`words`) against plan (`planChars`);
   - Sol and gpt-4.1 setups with and without examples, and Sol's waits against the setup caps, overall and single-player;
   - whether the cleanup helps gpt-4.1-mini;
   - the lead's per-story cost and 60 s reading;
   - the Round 3 page and how to rate it;
   - spend and limits.
   
   Give its full path in the final summary.
7. **Checks and records:**
   - `npm run check:all` from the root must be clean.
   - `client/src/page/static/Privacy.tsx` and `.context/ai-transparency.md` need no change: no production model, feature or data flow changes. Note the check in the follow-up.
   - Add the spend and headline numbers to the follow-up under Borderline Insights.
   - Add the Stage 4 spend and pointers to `.context/text-model-eval.md` Known limits.
   - Set this plan's Status to implemented, `git mv` it to `.plans/completed/`, and commit it with the docs.

## Tests

Follow the existing patterns:
- relative imports and `@jest/globals`;
- `createMockStory`, and `beatSet`, `beatGeneration`, `switchAnalysis`, `thread` and `threadAnalysis` from `server/tests/helpers/textFixtures.ts`;
- eval records from `server/tests/unit/evals/textModelEval/fixtures.ts`.

Build branch stories the way `storyTextTrims.test.ts` and `storyTextSteps.test.ts` do (`lastThreadStep`, `played`). Commits 1 and 2 change no test logic.

**`storyTextRewrite/common.test.ts` (new):**
- `textFrom` and `textBetween` take the first occurrences;
- they throw with the name when an anchor is missing, or when `to` comes before `from`.

**`storyTextRewrite/beat.test.ts` (new).** The branch fixtures, each for scaffold full and slim:
- first beat with images (template);
- first beat without images;
- a later switch after a resolved thread;
- thread step 1 of 3;
- step 2 of 3 after a favorable beat;
- the last step;
- an exploration-thread step;
- the ending;
- a custom story that generates images and has an empty library.

The assertions:
- **Builds, and throws only on multiplayer:** every branch builds, and a 2-player story throws.
- **Cacheable:** `fixed` is byte-identical across every branch and both scaffolds.
- **State untouched:** `perCall` ends with production's prompt from the state marker, byte for byte.
- **Shape:** `JSON.stringify` of `toJsonSchema(rewrite.schema)`, with every `description`, `minItems` and `maxItems` removed, equals the same for:
  - production's schema, on the full scaffold;
  - `trimmedBeatRequest(story, "slim").schema`, on slim.
  
  The comparison is order-sensitive, so it also pins key order and shared references.
- **Counts:** options min and max 3 except on the ending (none); interludes 3; `showDontTell` 3; `modifiersToSuccessRate` max 2.
- **Downstream:** parse a production-shaped `beatSet` with the rewrite schema. `beatStep.apply` gives the same changes and the same stored beat fields as parsing with production's schema (slim drops only its dropped fields).
- **Rule presence (the task's requirement).** A table in the test holds one entry per row of table B: id, part (`fixed` / `perCall` / `schema`), applies-when (a predicate on the branch), and a pattern. You choose each pattern: a distinctive phrase of the text you wrote.
  - For every branch where a rule applies, its pattern matches exactly once in its part, and nowhere else in the request.
  - Where it does not apply, it matches nowhere.
  - B35 also checks that `POINTS_FOR_SACRIFICE` and `POINTS_FOR_REWARD` appear with their signs.
- **Stated once, no shouting:**
  - across `fixed`, the per-call instructions (before the state marker) and every schema description, no normalised sentence of 25 characters or more appears twice;
  - no all-caps word of 3 or more letters outside `NPC` and `JSON`.

**`storyTextRewrite/setup.test.ts` (new).** The fixtures: 1, 2 and 3 players, every game mode, with and without examples.
- **Cacheable:** `fixed` is identical across premises and game modes within the single-player class and within the multiplayer class. Without examples, it equals the with-examples text minus the examples section.
- **Configuration untouched:** `perCall` equals production's prompt from `Number of players:`, premise included, verbatim.
- **Examples verbatim:** with examples, the section equals production's slice byte for byte.
- **Shape:** production's schema once descriptions and count keywords are stripped (order-sensitive), at 1 and 3 players.
- **Counts:** at every path in table SS.
- **Downstream:** every field that `AIStoryGenerator.createInitialState` reads is a key of the rewrite schema, as in Stage 3's setup proof.
- **Rule presence:** the same table-driven check over table S. Multiplayer-only rows are absent at 1 player.
- **Stated once, no shouting:** as for beats, with the examples and the configuration block exempt.

**`executor.test.ts` (extend):** capture the request body from the injected fetch.
- **gpt-6 split request:** `messages[0]` is `developer`, with a text part carrying `prompt_cache_breakpoint: { mode: "explicit" }`, and `messages[1]` is `user`.
- **gpt-4.1-mini split request:** `system` and `user` string contents, with no breakpoint anywhere in the body.
- **Stored prompt:** the prompt file holds both parts around `MESSAGE_SEPARATOR`.
- **Plain request:** a `TextRequest` still goes out as one user message.

**`jobPlan.test.ts` (extend):**
- **Turn order:** beat cases run in story, then turn, order; setup cases by player count.
- **Cache line:**
  - two split-request cases with the same schema and fixed text share a `cacheLine`;
  - an image-off case and an ending get their own;
  - prod requests have none.
- **Reference chain for estimates:** `rewriteSlim` borrows slim's measured outputs; the verbosity arm borrows `rewriteSlim`'s once it has `MIN_MEASURED_RECORDS`, else slim's; `gpt-4.1-mini@t0.2/rewrite` borrows the baseline's.
- **Stage 4 plan:** single-player beats only, the setup case list, and the matrix's samples.
- **Variants that don't cover a role throw:** `requestFor("rewriteSlim", <setup input>)` and `requestFor("rewriteZeroShot", <beat input>)`.

**`runner.test.ts` (extend):**
- **Warm-first:** use a fake execute with controllable promises and `maxInFlight` 3. Three jobs on line A and one on line B: A1 and B1 start together; A2 and A3 start only after A1 finishes; a job without a line is never held.
- **Stopped while waiting:** a cap stop while workers wait ends the run.
- **Re-planned rejection:** a job whose final record is a 400 with `rejectedParam` runs again on the next `runJobs`. Other final records still resume as finished.

**`validityGate.test.ts` (extend):** a `rejectedParam` attempt before a valid one counts as neither a call nor an invalid first attempt.

**`armsBudget.test.ts` (extend; replaces the `prodSiblingKey` test):**
- `referenceKey` maps:
  - `…/minimal` to `…/prod`;
  - `gpt-6-luna@medium/rewriteSlim` to `…/slim`;
  - `gpt-6-luna@medium+vlow/rewriteSlim` to `gpt-6-luna@medium/rewriteSlim`;
  - `…/rewriteZeroShot` to `…/rewrite`;
  - `gpt-4.1-mini@t0.2/rewrite` to `gpt-4.1-mini@t0.2/prod`.
- It gives `undefined` for a prod key and for a chain key.
- Stage 4's gpt-4.1 and gpt-4.1-mini arms have the settings of `baselineArm(role, false, {})` (production defaults).

**`variantComparison.test.ts` (extend):**
- **Reference pairing:** an arm pairs with its `referenceKey` arm.
- **The baseline as reference:** the baseline's records serve as a reference, and are never a candidate.
- **Noise from the reference:** a one-sample arm gets noise from the reference's two samples on the matched cases, and a check beyond it is flagged.
- **Cache readings:** read and write shares, writing calls, lines, and input cost billed against uncached come out right.

**`resultsReport.test.ts` (extend):**
- the uncached basis prices cache writes as plain input;
- the variant section renders the Reference column and the input and caching table.

**`textChecks.test.ts` (extend):** `words` leaves out image tags; `planChars` is the plan's JSON length.

No tests for the Stage 4 matrix values, the premise lists, or the rewrite's wording beyond the pinned rule phrases: those are static content.

## Out of Scope

- **Adopting the rewrite in production,** or any production prompt, schema, model, default, TTL or factory change. On adoption:
  - the message shaping in `executor.ts` moves beside the factory in `shared/llm/`;
  - the rewrite becomes the prompt services.
- **A multiplayer beat rewrite,** and a rewrite of switch and thread analysis or template iteration.
- **Numeric bounds in the schema** (modifier ±15, basePoints). Only array counts are enforced, as A8 names. The ±15 rule stays a description with an explicit tie-break.
- **A second cache breakpoint after a per-story block** (A8, optional). It needs `StoryStatePromptService` to separate stat definitions from values.
- **Cache-aware estimates,** and an explicit `ttl`.
- **Luna low turns on the rewrite.**
- **A Round 3 setup page.** Test plan §4.5 judges the setup rewrite by the automatic checks and the play-test.
- **Deleting `storyTextTrims.ts`.** It waits until Stage 3 is decided; the rewrite does not depend on it.
- **Escaping `</premise>`** (carried from Milestone 2). The rewrite passes production's configuration block verbatim.
- **Splitting `run.ts`.** This plan does not grow it.

## Architectural debt named

- **The rewrite reads production's prompt at four anchors:** the state marker, `Number of players:`, `EXAMPLE STAT SETUPS` and `Character Selection Instructions`. A production edit there fails its tests, which is intended while the Stage 4 records are in use.
- **The rewrite's slim scaffold restates Stage 3's field list** (five plan fields and two option-consideration fields) instead of calling the trims module. That is deliberate: it keeps the trims deletable. The slim shape test uses the trims module, and changes when the trims module goes.
- **`configsFor` in `resultsReport.ts`** still pairs a candidate beat arm with the same-key analysis arm. So the generic views read Stage 4 turn arms with the baseline analysis. The variant section is the valid reading, and the (beat, analysis) gameplay view stays open from Milestone 2.
- **`arms.ts` holds three static matrices** (Stage 1–2, 3 and 4) plus the key formats. After the `pricing.ts` move, that is its single job. A fifth stage would still be a table, not new logic.

## Hand-off to the follow-up file

Copy these into `.plans/2026-09-26_build-followup.md`, each prefixed "Milestone 3 (planner):", under the heading named in brackets.

1. [Controversial Decisions] **Stage 4 carry-forward (the coordinator's choice; the owner has not rated Round 1).** Turns: Luna medium (the lead), and gpt-4.1-mini to test whether the cleanup helps today's model. Setup: Sol low (the owner's priority) and gpt-4.1. The analysis calls are not rewritten in Stage 4.
2. [Controversial Decisions] **Stage 4 rewrite bases.**
   - Luna medium turns build on slim, the Stage 3 carry to Round 2, although both trims lost a little beyond noise.
   - gpt-4.1-mini turns build on the full scaffold, so the reading isolates the cleanup on a non-reasoning model.
   - A Luna medium rewrite on the full scaffold runs ×1 last, as a hedge in case Round 2 rates slim below full.
   - Setup keeps the character-selection plan. The Stage 3 setup trim saved 7% and no wait, and missed the visible-stat check in 2 of 36 Luna setups.
3. [Controversial Decisions] **The rewrite is eval-owned new text in `server/src/game/services/storyTextRewrite/`.** It reuses production's story state, configuration block, example stat setups and schema pieces verbatim, sliced at first-occurrence anchors. It does not import `storyTextTrims.ts`, so the trims stay deletable. Rejected: anchored edits (they cannot split messages), a style parameter through the production prompt services (production must not change), and copies of the prompt services.
4. [Controversial Decisions] **Beat rewrite covers single-player only;** a multiplayer story throws. Stage 4 turns run single-player, and an unmeasured multiplayer prompt adds adoption risk without evidence.
5. [Controversial Decisions] **Message shape per family.** On gpt-6, a developer text part with an explicit `prompt_cache_breakpoint`. On gpt-4.x, a plain system message without one (its implicit cache needs none, and the field is gpt-5.6+). No TTL is set, so the default TTL is measured. The factory is unchanged.
6. [Controversial Decisions] **Warm-first scheduling instead of serial runs.** The first call per cache line runs alone, then the line runs in parallel, and cases are queued in turn order. The fixed block is story-independent, so this measures the same GPT-6 caching as a serial run, in about 40 minutes instead of 2.2 hours. Estimates stay uncached (conservative), so the paid runs are separate invocations in priority order.
7. [Controversial Decisions] **Rejected requests (a 400 naming a parameter) are re-planned and left out of validity,** like transport failures. The rate is still reported. Without this, a request-shape bug found by the smoke would leave dead "finished" jobs.
8. [Controversial Decisions] **Readings against a reference.**
   - `referenceKey`/`VARIANT_REFERENCE` replace the prod sibling: the verbosity sub-arm reads against the same key without verbosity; rewriteSlim against slim; rewrite against prod; rewriteZeroShot against rewrite.
   - The baseline's records can be a reference.
   - Noise comes from the reference's two samples on the matched cases, so one-sample arms get flags. The Stage 3 section of `results.md` may now show flags for Sol setup, where it showed none.
   - Uncached now prices cache writes as plain input ("caching off"), which changes no earlier record.
   - The beat checks gain `words` and `planChars` counts.
9. [Controversial Decisions] **Two contradictions resolved inside the rewrite only.** The ending's options schema says "leave empty"; production's schema says "exactly 3" while the ending prompt asks for none. A modifier's effect is capped at ±15, with 15 used when a stat's definition names more (Milestone 2's named cross-role mismatch). Only array counts are enforced in the schema, not numeric bounds.
10. [Controversial Decisions] **The rewrite's phrase-avoid list overlaps with the checker's `STOCK_PHRASES`.** For the rewrite arms, the stock-phrase reading therefore measures compliance, not slop in general. The rating is the judge.
11. [Controversial Decisions] **Stage 4 run design (DERIVED).**
    - The arms: Sol low setup with and without examples on 9 premises ×1; Luna medium rewriteSlim ×2; gpt-4.1-mini rewrite ×1; gpt-4.1 setup with and without examples on 9 premises ×1 (shrinkable to 6, then 3); Luna medium verbosity low ×1; Luna medium rewrite on the full scaffold ×1.
    - Cost: about $4.4 uncached estimate, about $3.3 expected with caching.
    - Never fewer than 9 Sol premises.
12. [Controversial Decisions] **Two named debts done as pure moves:** prices and estimates into `pricing.ts` (the third matrix arrived), and the variant rendering into `resultsReport.ts` (Stage 4 reuses the pairing).
13. [Controversial Decisions] **Planner limits.** No sub-agent tool, no Edit tool and no Bash. The architecture comparison and the review were done inline, and the decision-log collector's strict mode could not be run.
14. [Skipped Items] **No Round 3 setup page.** Test plan §4.5 judges the setup rewrite by the automatic checks and the play-test.
15. [User Input Needed] **Round 3 (8 items, about 20 minutes) comes after Rounds 1 and 2.** If Round 2 rates slim below full, read the Luna medium rewrite on the full scaffold instead; a second sample costs about $0.1.
16. [Suggested Follow-Up Work] A multiplayer beat rewrite, measured, before any multiplayer adoption.
17. [Suggested Follow-Up Work] Rewrite and cache the switch and thread analysis calls (their prompts are about 6K input tokens each).
18. [Suggested Follow-Up Work] Cache-aware estimates in `pricing.ts`, once Stage 4 has measured the read shares per role.
19. [Suggested Follow-Up Work] On adoption: move the message shaping to `shared/llm/` beside the factory, and decide an explicit cache TTL there (a production request-shape change, the owner's call).
20. [Suggested Follow-Up Work] A Luna low rewrite arm, the next cheaper turn arm (about $0.1).

## Self-review against the simplicity criteria

- **YAGNI.** Every change serves the rewrite, its caching measurement, or its readings:
  - the multiplayer rewrite, analysis rewrite, numeric bounds, TTL and cache-aware estimates are all out;
  - the rejected-request re-plan is there because the smoke is likely to meet a 400 on a new request shape, and the harness has no other recovery.
- **Duplication against complexity.**
  - The slim field list is restated (7 names) rather than creating a dependency on a module slated for deletion.
  - The comparison is generalised rather than duplicated: its pairing, matching and noise logic is non-trivial and would drift.
- **New files.**
  - `pricing.ts` is a named debt.
  - The three rewrite files have one responsibility each: plumbing, beat and setup, following production's per-role prompt services.
  - No shallow pass-throughs: `common.ts` holds the type and guards that both builders use.
- **Grown files.**
  - `runner.ts` grows by the warm-first rule inside `runPhase`, which is scheduling, its existing job.
  - `resultsReport.ts` grows by rendering only.
  - `variantComparison.ts` becomes readings only.
  - `arms.ts` shrinks by the pricing move and grows by one table.
- **Clarity.** The tables B, BS, S and SS make each rule's home explicit. The tests pin the branch logic, not the wording.
