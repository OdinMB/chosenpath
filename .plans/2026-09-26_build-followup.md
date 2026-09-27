# Follow-up: GPT-6 text-model evaluation build (overnight, 2026-09-26)

Branch: `gpt6-text-eval`. Test plan: `DOCS/2026-09-26_gpt6-text-model-test-plan.md`.

## Controversial Decisions

- The owner pre-authorized an unattended overnight build ("/build as much as you can until I'm back"), so the planner's plan was not presented for approval before implementation. Decisions the planners made are recorded below per milestone.
- The blind rating pages and eval outputs go to the gitignored `DOCS/` folder rather than into the commits: they are generated exports (the owner's standing rule), and the answer key must not sit beside the samples. The harness that regenerates them is committed.
- Milestone 1 (planner): **Transport.** The eval sends through the production factory with fetch-level raw capture, not the raw SDK. This measures exactly production's request; the test plan's A5 raw-SDK approach is rejected.
- Milestone 1 (planner): **Settings groups.** Five groups (setup split from the template editor), plus multiplayer overrides for beats and analysis. The existing env names keep their meaning, and `SETUP_*` falls back to `GENERATION_*`.
- Milestone 1 (planner): **Family allow-list.** Only gpt-4.x and gpt-6 families are accepted. Any other model name fails at startup.
- Milestone 1 (planner): **gpt-6 settings errors.** A gpt-6 model without an effort fails at startup rather than defaulting to none. A temperature set for a gpt-6 model is ignored with a warning, not treated as an error.
- Milestone 1 (planner): **Retries and timeouts.** Production gets 2 retries on every role, the filter included (so its worst case is 2 × 3 calls). Timeouts: 240 s setup and editor, 180 s beats, 120 s analysis, 60 s filter. The eval uses 0 retries and 300 s.
- Milestone 1 (planner): **Logging.** Per-call and per-turn logs carry story ids and numbers only. Reading time and duplicates are measured in memory, capped at 5,000 stories.
- Milestone 1 (planner): **The pregeneration tag.** It reaches per-call logs through a new optional `context` parameter on three `AIStoryGenerator` methods. This is one layer of threading, accepted over leaving the logs ambiguous.
- Milestone 1 (planner): **Extracted seams.** `storyTextSteps.ts` is new. The thread-resolution and choice-resolution logic move into their existing services. Production behaviour stays byte-identical.
- Milestone 1 (planner): **The runner is copied and adapted** from the image eval, not shared. The image harness stays untouched.
- Milestone 1 (planner): **Premises.** They are a frozen fixture; the client's merge logic is copied, not moved.
- Milestone 1 (planner): **Continuation count.** 38 continuations are 33 stored-output units plus 5 synthetic-choice units from unadopted snapshots. Two are cloned with images off.
- Milestone 1 (planner): **Gate readings:** the 60 s cap applies to p95 of beat-only turns **and** of analysis turns separately (the stricter reading); the setup cap compares median waits (p95 shown alongside); the no-pregeneration view mixes beat-only and analysis turns at 15/29 and 14/29.
- Milestone 1 (planner): **Stage 0 budget split.** The pre-fix baseline may use at most a third of the Stage 0 money left after the probe and case building. If needed, cut analysis first, then multiplayer continuations, then beats outside the subset. Setup is never cut.
- Milestone 1 (planner): **Arm matrix.** Stage 1–2 follows the owner decisions, not test plan §4.3. That means no Sol none or Sol medium beat arms, no Sol analysis, and a 150-call rare-failure batch.
- Milestone 1 (planner): **Luna high reasoning estimate.** It assumes 12K reasoning tokens per call, because no source figure exists.
- Milestone 1 (planner): **Preview pages.** A `--preview` rating-page mode exists only for layout checks. A real blind page needs arms that don't exist before the next milestone.
- Milestone 1 (planner): **Planner limits.** The planner could not spawn explorer, architect or reviewer sub-agents, and had no Edit tool for the follow-up file. The architecture comparison and self-review were done inline; the review round did not happen.
- Milestone 1 (implementer): **Setup fallback is whole-group.** `SETUP_MODEL_*` applies only when `SETUP_MODEL_NAME` is set; otherwise all of `GENERATION_MODEL_*` is used. Per-field fallback could pair a gpt-6 setup name with a gpt-4 era `GENERATION_MODEL_REASONING_EFFORT=minimal` and stop the server.
- Milestone 1 (implementer): **Retry logging.** The retry handler applies LangChain's no-retry policy first and logs only real retries, so a 400 logs no `[LLM] retry` line.
- Milestone 1 (implementer): **Role tag.** The factory puts `metadata: { role }` on every model, so each `[LLM]` line has its role without callers passing it. Setup, template and iteration calls tag `players` only; `generateStorySetup` does not know the story id. The content filter also gets the call logger, and its schema is now exported so the probe checks the real one.
- Milestone 1 (implementer): **Case inputs are frozen past thread resolution.** This deviates from the plan's "at run time the input goes through resolveCurrentThreads". That function rolls dice (`Math.random` in challenge-thread resolution) and is not idempotent, so arms would see different inputs. Stored units take the child's copy of the phases, which is the resolution as it happened in play. Synthetic and built cases resolve once, at build time.
- Milestone 1 (implementer): **Ending check.** The plan asserted that `determineNextBeatType()` returns "ending". It cannot: once the thread has resolved at max turns, it returns "intro". The case builder checks `getCurrentBeatType() === "ending"` after resolution instead, which is how production reaches the ending.
- Milestone 1 (implementer): **Images-off cases.** They are 2 of the 5 synthetic continuations, not clones of stored ones, so the 38-continuation count holds and no stored-output case is duplicated. Images off also clears `templateId`, so `hasImages()` is false. One stored story already plays without images, so 9 local beat cases have images off.
- Milestone 1 (implementer): **Pipeline chains** are two-step runner jobs (`Job.then`), so pacing, retries and caps apply per call. There is no separate `executeChain`.
  - Isolated analysis arms are Luna none, low and medium ×2. The owner decisions list none; they say analysis follows the Luna beat arms.
  - A baseline chain (baseline analysis, then baseline beat) measures today's analysis-turn wait.
- Milestone 1 (implementer): **Modules beyond the plan's table**, each one responsibility kept out of `run.ts` and `ratingSets.ts`: `jobPlan.ts` (cases × arms → jobs), `evalFiles.ts` (output layout), `outputChecks.ts` (checks on stored outputs), `ratingContent.ts` (what a rater sees), `previewSource.ts` (layout-only previews from stored beats and setups, `--preview --stored`) and `dryRun.ts` (the no-API report).
- Milestone 1 (implementer): **Build calls are reused.** A template's build switch call uses the switch case's id, and a first-beat template's build beat call uses the first-beat case's id. Those calls then count as prefix baseline sample 1 and are not paid twice. Build calls on non-case inputs count as spend, not as results.
- Milestone 1 (implementer): **Setup premises.**
  - The 5 reconstructed ones are "title. world", category flexible, as the plan says.
  - Kids: read-with-kids animal rescue (2 players) and stuffed animals (3 players).
  - Dark: ER doctor, Wild West bounty hunters, and the Neo-Tokyo murders.
  - Picks avoid blinding words; "high school" matches `\bhigh\b`, which limited the learn-something choices.
- Milestone 1 (implementer): **Rating-page context headings** are fixed text ("Before this turn: player N"), so a character named Luna cannot trip the metadata check. Names go in the lines.
- Milestone 1 (implementer): **No independent review.** This session had no sub-agent tool, so the check battery ran inline and the code review was a self-review. It found and fixed three problems:
  - pipeline waits never reached the 60 s gate;
  - `--build-cases --max-spend` was not carried across build calls;
  - build calls polluted the baseline results.
- Run A (Stage 0 up to the pre-fix baseline): **Stage 0 cap stays $6.** The owner decisions set $6/$12/$3/$4, and the task says they win over the coordinator's $8/$11 note above. `DEFAULT_STAGE_CAPS` is unchanged.
- Run A: **Pre-fix share.** The task allowed about $2.50 for the pre-fix baseline, and I used that instead of the M1 plan's one-third rule (about $1.79 after the measured probe and build). The run was estimated at $2.00 and cost $1.75. No analysis, multiplayer or beat cases were cut.
- Run A: **Probe coverage changed before it ran.**
  - A small strict schema at none, low, medium and high on both models.
  - Every production schema at all four efforts on Luna, but only at low on Sol. Schema validation does not depend on effort, and Sol is 20× dearer.
  - A Luna high full completion.
  - A unique prefix per cache check.
- Run A: **Results-report fixes beyond "probe and page bugs".** Three were fixed, because each changes a gate the owner reads:
  - the story cost averaged multiplayer beats in;
  - the summed analysis-turn wait used all beats;
  - the spend table left out the probe.
- Run A: **The trial rating page used the single-arm preview mode.** Baseline-only outputs at 1 sample cannot make a two-arm page. Playwright here refuses `file://`, so the page was served with `python -m http.server` on 127.0.0.1 for the check. The server was stopped afterwards.
- Milestone 2 (coordinator): **Cost cap reading.** Run A measured today's text cost at $0.61 per story billed ($0.87 without cache hits), not the $1.08 the plan estimated. gpt-4.1's automatic cache covered 65% of turn input in the eval, and how often production gets those hits is unknown. Until Stage 4 gives GPT-6 its own caching, the round-1 report shows every arm against both figures and gates nothing on cost. The owner decides which reading "no more than today" means. This may decide the lead: Luna medium turns fit the billed cap only if Luna reasons at most about 6.5–7K tokens per turn.
- Milestone 2 (coordinator): **Validity gate.** Baseline replies were 115 of 115 valid, so "no worse than baseline" would fail an arm on a single bad reply. The reading used instead: at least 98% valid on the first attempt, 100% valid within production's 2 retries, and differences from the baseline judged beyond noise.
- Milestone 2 (coordinator): **Budget raised slightly above $25.** Hard cap $30. Per-stage caps: Stage 0 $8, Stages 1–2 $13, Stage 3 $3, Stage 4 $4. Reason: the owner prioritised Sol for story setups, and setup inputs are 21–23K tokens (the schema counts as input), not the 15K the plan assumed, so the Sol setup arms alone cost about $9–11 even with Sol medium and Sol none at 1 sample.
- Milestone 2 (coordinator): **Setup-cap reading.** The Milestone 1 harness compares median setup waits (cap about 58 s); test plan §6 says p95 (cap about 68 s). The report shows both, and the owner decides.
- Milestone 2 (planner): **Creator fields had not been stripped in production.** Milestone 1 removed `creatorId` and `creatorUsername` only from the eval's iteration cases; `TemplateService.iterateTemplate` still serialised the full template into every AI Iteration prompt. The task said "verify, don't redo"; verification failed, so this milestone strips them in production (approved in D6), inside the new `createIterationPrompt`, so the eval and production share one path.
- Milestone 2 (planner): **The fix list is test plan A7**, which the task summarises. It includes the operator-precedence fix the summary leaves out. The optional A7 item, story progress in the thread prompt, is not done: it adds information rather than fixing it, so it belongs with Stage 4.
- Milestone 2 (planner): **Eight more clear bugs fixed now, beyond A7:** the image-library note's inverted multiplayer condition; the ending not showing the "Adjustments after threads" it is told to consider; a doubled "?"; and five missing separators (before "There are two types of switches", before the thread and the switch option lines, before "Take the multiplayer coordination", and in "Challenge  and Contestthreads"). Reason: any prompt change after the post-fix baseline forces that baseline to rerun (about $5).
- Milestone 2 (planner): **Contradiction directions:** C1 and C2 per the owner's intent; C3 toward the prompt and the game constants (+5 to −15; sacrifice +30, reward −30); C4 one level for stories, 3–5 for templates; C5 the schema's `backgroundArchetypes`; C6 ±20 for a major stat effect (the effect field's own text, and nearer the beat's ±15 cap), not the ±30 two statements used; C7 3–5 sentences; C8 3–4 *visible* stats plus any invisible ones, not 3–4 in total.
- Milestone 2 (planner): **Own portrait (C1):** the first-beat prompt keeps asking for the player's own portrait ("include"); only the schema's blanket ban gets the first-beat exception. The owner's "may" is met; making the prompt optional would be a new behaviour.
- Milestone 2 (planner): **The setup prompt's entry point split in two** (`createSetupPrompt` with a kind, `createIterationPrompt` with the template object). It is the smallest change that lets the difficulty rule know its kind and lets the iteration builder own the strip.
- Milestone 2 (planner): **Checkers follow the corrected rules:** stat counts are visible stats only, and sacrifice and reward must equal ±30. Prefix outputs are re-scored with these rules when the report is rebuilt.
- Milestone 2 (planner): **Budget:** a hard global cap of $30 that no flag can raise, below the owner's standing $50, because the owner called it hard and the run is unattended. Stage caps $8 / $13 / $3 / $4. Sol medium setup ×1; every other sample count already matched the owner's list.
- Milestone 2 (planner): **Cost reading, symmetric bases:** billed against billed, and uncached against uncached (both sides priced as if nothing came from cache). For Stage 1–2's GPT-6 arms both are the same, since explicit caching reads nothing. The pre-fix baseline's figures are printed beside each post-fix section as "today's production". Nothing is gated out.
- Milestone 2 (planner): **Validity reading:** ≥ 98% valid on the first model attempt; 100% valid within production's 2 retries, measured by real re-sends; "worse than the baseline" only at a one-sided Fisher exact p < 0.05 on first-attempt failures against the same role's baseline (1 in 100 against 0 in 115 gives p ≈ 0.47). Transport failures (429, 5xx, timeouts, dropped connections) are left out of all three. `repaired` counts as invalid, because production's parse fails on text after the JSON.
- Milestone 2 (planner): **The runner re-sends unparseable replies** (text after JSON, broken JSON, schema mismatch, length cut-off, refusal) at once, at most twice, as production's LangChain retry does. A call's cost now sums its attempts. The diagnostic rates are read from first attempts, so re-sends cannot hide them.
- Milestone 2 (planner): **Multiplayer cost with and without multiplayer pregeneration is added.** The owner decisions ask for it, and the report lacked it. With multiplayer pregeneration it uses the single-player 85/19/21 call counts as an approximation (it pregenerates the last player's options, which roughly triples the calls).
- Milestone 2 (planner): **`--no-mp-continuations`** was added so the owner's first shrink lever can be applied without hand-listing case ids. The second lever needs no code: `--role analysis --samples 1`.
- Milestone 2 (planner): **`--run --prompt-state prefix` is refused from now on,** and the dry run drops its pre-fix row: the pre-fix prompts no longer exist in the code, so a resumed prefix run would mix post-fix prompts into pre-fix results.
- Milestone 2 (planner): **Planner limits:** no explorer, architect or reviewer sub-agents and no Edit tool were available. The architecture comparison and self-review were done inline; no review round happened.
- Milestone 2 (implementer): **No sub-agents in this session either.** The check battery ran inline and the code review was a self-review against the structure guidelines. It found no critical or important bugs. It gave one structure `violation` (`resultsReport.ts`, see Suggested Follow-Up Work) and one `borderline` (`SwitchPromptService.createInstructionsSection`, now three example-output branches).
- Milestone 2 (implementer): **The creator-field strip was proved able to fail.** Disabling the filter in `createIterationPrompt` turned `StorySetupPromptService.test.ts` red; restoring it turned it green. This time the environment allowed the temporary edit. The test's fixture carries both creator values, so the absence check is not vacuous.
- Milestone 2 (implementer): **Option-list separators.** Besides adding the missing leading `\n` before the thread and switch option lines and before "- Take the multiplayer coordination", I dropped the trailing `\n` of those branches. Otherwise the fix would leave a blank line inside the list. This changes whitespace only.
- Milestone 2 (implementer): **"Next beat" wording.** Thread beats now read "It is time to create the next beat of the current thread." Every other non-ending beat type keeps "create the next switch", including `intro`, which never reaches the beat prompt.
- Milestone 2 (implementer): **The custom-story difficulty examples** keep the three example ranges, introduced as "Examples of the levels in each range (pick the one level that fits this story from the matching range):".
- Milestone 2 (implementer): **`PRE_FIX_PROMPT_STATE`** lives in `variants.ts`, the prompt/schema hook. `run.ts` and the report share it. `--run` checks for `prefix` before the API-key check. I verified this through the CLI with `--max-spend 0`, so nothing could have been sent: it refused.
- Milestone 2 (implementer): **Report wording.** The validity table's verdict is "pass" or "FAIL: <reasons>", since the owner calls it a gate. The cost, setup and 60 s views mark readings "within" or "over". $/setup in the setup view is the mean over all 18 premises (1–3 players), on both bases.
- Milestone 2 (implementer): **`gates()` now composes one helper per reading** (`pregenTurnReading`, `noPregenReading`, `multiplayerReading`, `setupReading`). `setupReading` is exported, so the setup view and `gates()` share one computation; the old setup table recomputed the median check itself.
- Milestone 2 (implementer): **`resultsReport.ts` was not split** (646 lines, up from 431). The growth sits inside its existing gate-reading and rendering responsibilities. The one new responsibility, validity statistics, went to `validityGate.ts` as planned. The seam is recorded under Suggested Follow-Up Work.
- Milestone 2 (eval run): **Rotating candidates on the rating pages** (`--per-item K`, commit 5d0d1ea). The planner put every arm on every item. The owner asked for the baseline plus 2 of 3 candidates, each candidate on 6 of 9 items, so each item shows 3 cards. Every candidate pair meets the baseline at every label once per 9 items. The repeated item keeps the arms of the item it repeats.
- Milestone 2 (eval run): **`--rare-failure skip|only`** (5d0d1ea). The rare-failure calls were planned inside the beat group, between the turn arms, so a cap stop would have cut the pipeline chains before them. The task orders the batch last, so the beat run skips it and a final run plans only it.
- Milestone 2 (eval run): **Curated setup items** (`--cases` for rating pages, 0f4515d). With 10 setup strata and 9 items, stratified picking gives single-player premises only 2 of 9 items, although 8 of the 18 premises are single-player. I picked 3 premises per player count by hand, covering every game mode, a Kids premise and two dark ones. The baseline-against-baseline control still comes from the other premises.
- Milestone 2 (eval run): **Which "today" the caps read.** The owner named today's measured figures: $0.61 billed and $0.87 uncached per story, and 1.5 × today's setup wait. `results.md` compares post-fix arms with the post-fix baseline instead. That baseline is the same models on the fixed prompts, and it reads $0.566 billed, $0.876 uncached, and setup caps of 52.4 s (median) and 64.8 s (p95). Its billed figure is lower only because two samples of a case ran side by side and the second hit gpt-4.1's cache. The round-1 report reads every arm against today's production (Run A), as the owner said, and shows the post-fix baseline beside it. The harness was not changed.
- Milestone 2 (eval run): **Multiplayer continuations restored after the analysis and the chains.** The turn arms ran with `--no-mp-continuations`, the owner's first shrink lever, because the dry run put Stages 1–2 $0.16 over the cap. Two things changed that picture:
  - Real spend came in well under the estimates: $1.49 for the turn arms (estimate $2.05) and $0.21 for analysis (estimate $0.43).
  - All three multiplayer cases in the 15-case subset are continuations. Without them, Sol low and Luna high had no multiplayer turn at all, and the turn page could have only 12 of its 15 items.
  The 45 dropped jobs were re-planned at measured sizes (estimate $0.28) and run before the rare-failure batch, inside the $13 stage cap. The plan's original design had them anyway, so no cap was raised.
- Milestone 2 (eval run): **Best-passing Luna setup arm = Luna low.** It is within both setup-wait readings (median 51.5 s, p95 61.5 s, against 57.6 s and 68.3 s today). It passes every setup rule check (Luna none and Luna medium each miss one player-stat count), and it is the cheapest. Luna medium is over both readings (60.3 s, 80.7 s). The automatic metrics only ruled arms out here; the choice among the passing arms is a tie-break, not a quality verdict.
- Milestone 2 (eval run): **Turn page arms: gpt-4.1-mini plus 2 of Luna medium, Luna low and Sol low.** Luna high was left off because its turns without planning have a p95 of 64.6 s, over the 60 s cap. Luna low is the next-best Luna. Luna none also passes the gates, but Luna low leads it on known ids (92.0% vs 83.3%), sentence counts and requested images, and is slightly faster and cheaper.
- Milestone 2 (eval run): **The three-options check skips endings** (14a45b5). Every "three options" failure in Stages 1–2 was an ending with zero options. The beat prompt skips `createOptionInstructions` for endings and titles the beat "The End"; only the schema's field text says "exactly 3". gpt-4.1-mini adds 3 options to 5 of its 6 endings, GPT-6 none. `results.md` was rebuilt without API calls.
- Milestone 2 (eval run): **The Milestone 1 preview pages and their keys were deleted** (`rating/preview/text-setup-3a1b662bcc.html`, `text-turn-e2074b2786.html`, and the two keys). The real round-1 pages supersede them, and `--preview --stored` rebuilds them. The Skipped Items entry that pointed at them is now out of date.
- Milestone 2 (eval run): **Rating-page file names.** The harness writes `text-<kind>-<pageId>.html`. I renamed the pages to `rating/round1-setup.html` and `rating/round1-turns.html` as the task asked, and the keys to `keys/round1-setup-3434afcc6f.json` and `keys/round1-turns-5e2a3f7862.json`. `--score` still finds a key by its `-<pageId>.json` suffix.
- Milestone 3 (planner): **Carry-forward for Stages 3–4 (the coordinator's choice, recorded here).** The owner has not rated Round 1 yet, so the coordinator chose:
  - turns: Luna medium (the lead) and Luna low;
  - analysis: Luna low;
  - setup: Sol low (the owner's priority) and Luna low;
  - gpt-4.1-mini and gpt-4.1 as the baselines.
- Milestone 3 (planner): **Trims are derived, not woven in.** `server/src/game/services/storyTextTrims.ts` takes production's own request and removes fields (zod `.omit`/`.extend`, kept fields are production's instances) and prompt lines (anchored edits on the instruction part, each exactly once or it throws). Production prompt and schema code are untouched. Two alternatives were rejected:
  - A `scaffold` parameter through the production builders: about 20 eval-only branches in already-strained builders, and a byte-identity risk for the prompts the post-fix baseline measured.
  - Eval-owned copies of the builders: duplication that drifts.
- Milestone 3 (planner): **Placement beside `storyTextSteps.ts`, not under `src/evals/`.** The task places variants beside the production versions, and the module's tests fail next to the prompt tests when a production edit breaks an anchor. The price is that ESLint does not bar production from importing it. Only `variants.ts` does.
- Milestone 3 (planner): **What a trim removes.** Fields nothing reads after generation, and the lines asking for them. Any rule such a line carried stays, as one sentence (for example "Keep this beat consistent with the beats you already created…", or "Draw on the thread types this story suggests…"). The planning guidance (narrating consequences, implementing the step, world building, the options considerations), the examples, the capitals and the repeats are unchanged, so Stage 3 tests "written plan versus private plan" only. slim = A6 (showDontTell plus `previousOptionsToAvoid` and `upToOneSacrificeOrRewardOption`), for beats only. minimal = everything §5 lets Stage 3 drop, for beats, switch, thread and setup. `statGroups` stays in setup; the test plan does not list it.
- Milestone 3 (planner): **"Full" is the Round 1 `prod` arms, not a new run.** The comparison uses the same (case, sample) pairs. Token and cost deltas are robust. Wait deltas carry server drift, because the full forms ran hours earlier. A same-session full rerun would cost about $1.2 more.
- Milestone 3 (planner): **Stage 3 run design (about $2.45 of $3, DERIVED):**
  - Sol low minimal setup on 9 premises (3 per player count, every game mode, one Kids and three dark) ×1; Luna low minimal on all 18 ×2;
  - Luna medium and Luna low × slim and minimal on every single-player beat case ×2; Luna none minimal as the control, ×2;
  - Luna low minimal analysis on all cases ×2;
  - chains (Luna low minimal analysis into the two minimal beat arms) on single-player analysis cases ×1.

  Shrink order if the dry run passes $2.75: the control to 1 sample, then the chains to Luna medium only, then Luna low slim to 1 sample. Never fewer Sol premises.
- Milestone 3 (planner): **Estimates for a new variant borrow its `prod` sibling's measured outputs.** Without that, Luna medium would be priced with the §2.2 guess of 6,200 reasoning tokens (measured: about 1,600), and the $3 cap would refuse a run that fits. The borrowed figure is conservative, since trims write less.
- Milestone 3 (planner): **`resultsReport.ts` split now** into `armStats.ts`, `gateReadings.ts` and the renderer, as the Milestone 2 follow-up specified. Stage 3's comparison is the first addition, and it would otherwise create an import cycle.
- Milestone 3 (planner): **Round 2 page rule.** Luna medium: minimal if it loses nothing beyond the full form's noise (validity, rule checks, state counts), else slim. The page shows baseline, full and trimmed, 12 items (test plan §4.5).
- Milestone 3 (planner): **Planner limits.** No sub-agent tool (no explorer, architect or reviewer agents), no Edit tool and no Bash. The architecture comparison and self-review were done inline. The self-review caught two anchor bugs in the renumbering edits before hand-off. No review round happened, and the decision-log collector's strict mode could not be run.
- Milestone 3 (implementer): **Scope of this run: code, tests, docs and the free dry run only**, as the task said ("do not run paid stages"). Four commits: aa9cd0f (report split), a6a313f (trims), 0466673 (harness and comparison) and e58ec7c (docs). The plan is archived to `.plans/completed/2026-09-26_gpt6-text-eval-m3-stage3.md`, as Milestone 2's was before its eval run. Runbook steps 3–6 are still to do there (see Skipped Items).
- Milestone 3 (implementer): **One sentence kept beyond the plan's B1 edit.** B1 drops the stats-list step. That step was the only place saying that stats and story elements shape how a resolution is narrated (the bodyguard and stealth examples). The plan's own rule is that every rule a dropped line carried stays as one sentence. So edit B1b adds, on every beat but the first: "Let the stats and story elements involved shape how the previous beat's resolution came about and what it covers (a bodyguard might be injured; with low stealth, an escape owes something to luck)." Reverting to the plan's table exactly means deleting B1b in `storyTextTrims.ts`. It is one entry, and no test asserts its wording.
- Milestone 3 (implementer): **The trimmed schemas keep production's instance sharing.** Production reuses one player schema for every slot, and so does the trim (memoized per production instance). Otherwise a multiplayer JSON schema would inline each slot instead of referencing it, and would come out larger than production's for a reason that has nothing to do with the trim.
- Milestone 3 (implementer): **Identity tests capture the production request with a spy.** The schema factories build fresh zod instances per call, so "kept fields are production's instances" (`toBe`) can only be checked against the very request the trim used. The tests spy on `beatStep.request` (and the other steps) and read the spied call's result.
- Milestone 3 (implementer): **The comparison reads both arms on the intersection of their finished (case, sample) pairs.** The plan restricted only the full arm to the trimmed arm's pairs. With the intersection, a trimmed call whose full counterpart never finished drops out too, so both sides stay paired.
- Milestone 3 (implementer): **The chain key format has one owner.** `chainKey`/`chainSides` in `arms.ts` now build and parse `pipeline:<analysis>><beat>`. Before, `jobPlan.ts` built it and `resultsReport.ts` parsed it, and the comparison would have been a third copy. This is beyond the plan's table. `configsFor` behaves the same: it matches the beat side exactly instead of by `endsWith`, which is equivalent because arm keys contain no `>`.
- Milestone 3 (implementer): **`meanCounts` averages each count over the usable final calls whose check reports it.** A beat check whose player beat is missing reports no counts, so it does not pull the mean towards zero.
- Milestone 3 (implementer): **No sub-agents in this session.** TDD, the check battery and the code review ran inline, and the review was a self-review against the structure guidelines. It found one important item, the chain key parse sites (fixed, above). Structure check:
  - `storyTextTrims.ts`: Stage 3 requests derived from production's. Single-responsibility.
  - `armStats.ts`: per-arm statistics. Single-responsibility.
  - `gateReadings.ts`: the owner's gate readings. Single-responsibility.
  - `resultsReport.ts`: rendering only. Single-responsibility.
  - `variantComparison.ts`: pairs, reads and renders the Stage 3 section, as the plan placed it. Borderline: the rendering could move to `resultsReport.ts`.
  - `arms.ts`: the stage matrices plus prices and estimates. Borderline and pre-existing; this change only grew the matrix part.
  - `jobPlan.ts`, `variants.ts`, `dryRun.ts`: single-responsibility.
- Milestone 3 (implementer): **Both of the trims' guards were proven able to fail.** Applying the edits to the whole prompt instead of the part before the state marker turned 1 test red: the anchor that exists only after the marker. Disabling the exactly-once check turned 3 red. Both were restored, and the suite went green again.
- Milestone 3 (eval run): **The Round 2 trim is slim, because both trims failed the pre-set rule.** The rule was "minimal if it loses nothing beyond the full form's noise, else slim", read on Luna medium, 88 matched turns.
  - Minimal: established facts per turn 3.51 (±0.02) → 3.19. Lower checks: real story-element ids 97.7% → 96.6% (1 turn) and no game words 93.2% → 87.5% (5 turns).
  - Slim: facts 3.51 → 3.20. Lower checks: the same ids check (1 turn), no game words 93.2% → 90.9% (2 turns) and 5–6 paragraphs 100% → 97.7% (2 turns).
  - Both trims lose about the same. Minimal saves more: −39% visible tokens against −31%, and −19% cost against −15%.
  - I followed the rule, and the task's "slim if minimal failed", rather than picking minimal for its larger saving. The report says both lost something. If the owner rates slim equal to full, minimal is the natural Stage 4 follow-on to test.
- Milestone 3 (eval run): **Round 2 items avoid the cases already on Round 1.** `--cases` was limited to the 31 single-player turn cases that are not on the Round 1 turn page, so the owner never rates the same baseline or Luna medium text twice.
  - The price: the pool leans on stored story 8988006e, so 9 of the 12 items come from it, at different turns.
  - The mix is 5 analysis turns, 4 plain turns, 2 endings and 1 first turn. The today-against-today control is cont-6edd813c-t2-o0.
  - Without the exclusion, 13 of 44 cases would have overlapped with Round 1.
- Milestone 3 (eval run): **No Round 2 setup page.** The task asked for one only if the setup trim showed a meaningful length or wait saving.
  - Sol low minimal: −7% visible tokens (6,012 → 5,581), −4% cost ($0.0043 per setup). The median wait went from 62.5 s to 63.3 s, and the p95 from 80.4 s to 75.5 s (9 premises × 1).
  - No cap reading changed. Test plan §5 also decides the setup trim by the automatic checks, with no rating.
  - My threshold for "meaningful" was a trim that moves a cap reading, or saves about 10% of the wait. It did neither.
- Milestone 3 (eval run): **Round 1's turn page was re-rendered, although it was already handed out.** Its key was kept, so the page id, items and labels are unchanged and ratings saved in the owner's browser still apply. Only the paragraph rendering changed (see Implementation Issues): one of 50 options now shows its paragraph breaks.
  - The re-render path was proven on the setup page first: it came out byte-identical, so I left that page alone.
  - The alternative was to leave a text block that biases one option against its arm.
- Milestone 3 (planner): **Stage 4 carry-forward (the coordinator's choice; the owner has not rated Round 1).** Turns: Luna medium (the lead), and gpt-4.1-mini to test whether the cleanup helps today's model. Setup: Sol low (the owner's priority) and gpt-4.1. The analysis calls are not rewritten in Stage 4.
- Milestone 3 (planner): **Stage 4 rewrite bases.**
  - Luna medium turns build on slim, the Stage 3 carry to Round 2, although both trims lost a little beyond noise.
  - gpt-4.1-mini turns build on the full scaffold, so the reading isolates the cleanup on a non-reasoning model.
  - A Luna medium rewrite on the full scaffold runs ×1 last, as a hedge in case Round 2 rates slim below full.
  - Setup keeps the character-selection plan. The Stage 3 setup trim saved 7% and no wait, and missed the visible-stat check in 2 of 36 Luna setups.
- Milestone 3 (planner): **The rewrite is eval-owned new text in `server/src/game/services/storyTextRewrite/`.** It reuses production's story state, configuration block, example stat setups and schema pieces verbatim, sliced at first-occurrence anchors. It does not import `storyTextTrims.ts`, so the trims stay deletable. Rejected: anchored edits (they cannot split messages), a style parameter through the production prompt services (production must not change), and copies of the prompt services.
- Milestone 3 (planner): **Beat rewrite covers single-player only;** a multiplayer story throws. Stage 4 turns run single-player, and an unmeasured multiplayer prompt adds adoption risk without evidence.
- Milestone 3 (planner): **Message shape per family.** On gpt-6, a developer text part with an explicit `prompt_cache_breakpoint`. On gpt-4.x, a plain system message without one (its implicit cache needs none, and the field is gpt-5.6+). No TTL is set, so the default TTL is measured. The factory is unchanged.
- Milestone 3 (planner): **Warm-first scheduling instead of serial runs.** The first call per cache line runs alone, then the line runs in parallel, and cases are queued in turn order. The fixed block is story-independent, so this measures the same GPT-6 caching as a serial run, in about 40 minutes instead of 2.2 hours. Estimates stay uncached (conservative), so the paid runs are separate invocations in priority order.
- Milestone 3 (planner): **Rejected requests (a 400 naming a parameter) are re-planned and left out of validity,** like transport failures. The rate is still reported. Without this, a request-shape bug found by the smoke would leave dead "finished" jobs.
- Milestone 3 (planner): **Readings against a reference.**
  - `referenceKey`/`VARIANT_REFERENCE` replace the prod sibling: the verbosity sub-arm reads against the same key without verbosity; rewriteSlim against slim; rewrite against prod; rewriteZeroShot against rewrite.
  - The baseline's records can be a reference.
  - Noise comes from the reference's two samples on the matched cases, so one-sample arms get flags. The Stage 3 section of `results.md` may now show flags for Sol setup, where it showed none.
  - Uncached now prices cache writes as plain input ("caching off"), which changes no earlier record.
  - The beat checks gain `words` and `planChars` counts.
- Milestone 3 (planner): **Two contradictions resolved inside the rewrite only.** The ending's options schema says "leave empty"; production's schema says "exactly 3" while the ending prompt asks for none. A modifier's effect is capped at ±15, with 15 used when a stat's definition names more (Milestone 2's named cross-role mismatch). Only array counts are enforced in the schema, not numeric bounds.
- Milestone 3 (planner): **The rewrite's phrase-avoid list overlaps with the checker's `STOCK_PHRASES`.** For the rewrite arms, the stock-phrase reading therefore measures compliance, not slop in general. The rating is the judge.
- Milestone 3 (planner): **Stage 4 run design (DERIVED).**
  - The arms: Sol low setup with and without examples on 9 premises ×1; Luna medium rewriteSlim ×2; gpt-4.1-mini rewrite ×1; gpt-4.1 setup with and without examples on 9 premises ×1 (shrinkable to 6, then 3); Luna medium verbosity low ×1; Luna medium rewrite on the full scaffold ×1.
  - Cost: about $4.4 uncached estimate, about $3.3 expected with caching.
  - Never fewer than 9 Sol premises.
- Milestone 3 (planner): **Two named debts done as pure moves:** prices and estimates into `pricing.ts` (the third matrix arrived), and the variant rendering into `resultsReport.ts` (Stage 4 reuses the pairing).
- Milestone 3 (planner): **Planner limits.** No sub-agent tool, no Edit tool and no Bash. The architecture comparison and the review were done inline, and the decision-log collector's strict mode could not be run.
- Milestone 3 (implementer): **The Stage 4 WIP (e65e130) was kept as it stood.** Its `variants.ts` and `executor.ts` edits matched the plan, and the new executor tests capture the bodies they send: on gpt-6 a `developer` message whose text part carries the explicit breakpoint, on gpt-4.1-mini `system` and `user` strings with no breakpoint. Its `runner.ts` edits were the types, the record field and the re-plan of rejected requests. Commit 16e6f05 finishes commit 4 on top of it, and the WIP commit stays in history.
- Milestone 3 (implementer): **Turn order applies to every planned case list, the baseline's and the chains' included.** The plan says "every arm's scoped cases". I sorted inside `casesFor`, which serves the baseline, the candidates and the pipeline, so every group runs story by story. It changes only execution order. Two older jobPlan tests that asserted case order now compare sets.
- Milestone 3 (implementer): **Warm lines are tracked per runner phase and are not seeded from earlier records.** A resumed invocation warms each line again with its first queued job. That costs one serial call per line per invocation, and it can read a cache an earlier invocation left within its TTL. Seeding from `calls.jsonl` would have to guess whether that cache is still alive.
- Milestone 3 (implementer): **Only single calls get a cache line, not a chain's beat step.** Stage 4 has no chains, and a chain's beat request exists only after its analysis.
- Milestone 3 (implementer): **The noise comes from the reference's finished records on the matched cases, samples 1 and 2, whichever samples the arm ran.** The reference's own figures are still read on the matched (case, sample) pairs only. For a two-sample arm matched on every pair this is the old noise. It differs only where the arm finished one sample of a case that its reference ran twice.
- Milestone 3 (implementer): **Report layout.** The arm table's validity column now reads reference → arm (it was "trim / full"). The "Input and caching" table names the arm only, since the arm table beside it names the reference, and it reads every cell reference → arm. "Calls that wrote" counts attempts with cache writes, as the plan specifies for records.
- Milestone 3 (implementer): **The reference walk is bounded at 4 steps past the arm's own key.** The longest real chain (a verbosity arm on `rewriteZeroShot` → `rewriteZeroShot` → `rewrite` → `prod`) is 3 steps; the bound only guards against a loop.
- Milestone 3 (implementer): **No independent code review.** This session had no sub-agent tool, so TDD, the checks and the review ran inline. The self-review found nothing critical. Structure check: `runner.ts` grew by the warm-first rule inside `runPhase`, `jobPlan.ts` by turn order, cache lines and the reference walk, `armStats.ts` by the cache and input-cost readings, and `resultsReport.ts` by rendering only. `variantComparison.ts` holds readings only. Each stays single-responsibility.
- Milestone 3 (review): **A re-run continues its job's attempt numbers, so it never overwrites an earlier attempt's output file** (`runStep` in `runner.ts`).
  - The defect: the callId hashes job key, step and attempt, and the executor writes `outputs/<callId>.json` unconditionally. A re-planned rejected request started again at attempt 1, so its reply overwrote the 400's raw body, and the rejected record's `outputFile` then pointed at a 200 reply.
  - The fix: attempts now start after the highest attempt recorded for the job and step.
  - The judgement call: I chose this over the other suggested fix, a suffix on the hash that would leave the attempt number alone. Continued numbering keeps `modelAttemptsByStep`'s attempt order chronological, and one call can no longer have two attempt-1 records. A job without records still starts at attempt 1, so every callId in the restored `calls.jsonl` still matches its file. The retry budgets count separately and are unchanged.
  - It also covers a job resumed part-way (a cap stop between re-sends). So I deleted Milestone 2's Suggested Follow-Up item about that collision.
  - Tests: a re-planned job gets attempt 2 and the callId of `key|1|2`; a fresh job keeps `key|1|1`.
- Milestone 3 (review): **The rewrite's schema descriptions no longer restate rules its prompt carries.**
  - The problem: tables BS and SS left "everything else" as production's instances, while tables B and S put the same rules in the prompt. So these rules were stated twice, as paraphrases the exact-sentence check cannot see.
  - The fix, before the smoke run: I cut these clauses from the rewrite's descriptions (eval-only zod, nothing under `core/types`), with `reworded`, so a production edit to any of them fails the tests:
    - beats: the title rule, the stat changes' sacrifice, reward and "adjustments after threads" sentences, "create one item for each outcome" on milestones, "likely to be used in later beats" on new elements and world building, the curious detail on world building (full scaffold), and the `world` clause on facts;
    - setup: "Generate 3-4 visible …" on both stat lists, with `sharedStats`' multiplayer lead-tracking clause; the stat type's "favor string and string[]"; the stat name's "immediately convey"; `isVisible`'s bullets; `partOfPlayerBackgrounds`' "set to false" sentence; the stat's "don't track progress toward outcomes"; the background's multiplayer overlap sentence; the conversion rates' "no option clearly better".
  - The fixed `isVisible` line now names what production's description gave it: hidden mechanics, story flags and future reveals.
  - This deviates from the tables' "everything else" rows. The plan's own Decision allows it ("rewritten descriptions only where a rule moved or was stated twice"), and the constraint "No schema description is restated in the prompt" requires it. No Stage 4 records exist yet, so no comparability is lost.
  - The shape tests strip descriptions, so they hold unchanged. New tests pin each cut clause by name: present in production's descriptions, absent from the rewrite's.
  - Kept on purpose, and named in `.context/text-model-eval.md` Known limits: the planning fields that ask the model to apply a rule, the fields' own definitions, and production-internal repeats inside the schema.
  - The trims shortened the setup requests: the Stage 4 dry run went from $3.66 to $3.62 (see Borderline Insights).
- Milestone 3 (review): **Setup estimates stay as they are, and the Runbook checks setup invocations by hand.**
  - The finding: `requestChars/4` undercounts setup input by about 6–7K tokens per call (28–32%), because the JSON schema bills at about 1.8 characters per token. Stage 3 Sol minimal was estimated at 14.6–15.2K input tokens and measured at 20.4–22.3K. Beats are about right.
  - Realistic uncached costs are about $1.7 for Sol setup and about $1.6 for gpt-4.1 setup, against the dry run's $1.44 and $1.36. That puts Stage 4 at about $4.1, over the cap as the plan expected (DERIVED from the review's figures).
  - The judgement call: no code change. Commit 1 moved `estimateCall` verbatim, and a schema-density fix would change every earlier stage's estimates and reservations. I added a Runbook note in step 3 of the Stage 4 plan instead: before invocation 4, check the Stage 4 spend plus 18 × about $0.09 against $4 by hand, shrink to 6 premises if Stage 4 spend is above about $2.35, and use measured costs for invocations 5 and 6.
  - With 6 calls in flight, a setup invocation can pass a cap by up to about $0.1. `.context/text-model-eval.md` now says so, instead of "parallel calls cannot overshoot" and "reservations stay safe".
  - Two corrections to earlier entries: the Stage 4 dry-run gap (Borderline Insights) is mostly this undercount, not the shorter rewrite; and Stage 3's 13% setup overrun (Implementation Issues, "Estimates") came from it too, not from the output borrowing. The estimator fix is under Suggested Follow-Up Work.
- Milestone 3 (eval run): **Round 3 items avoid every case on the Round 1 and Round 2 turn pages, so the page holds only plain mid-thread turns.** `--cases` was limited to the 18 single-player turn cases that neither earlier key names. All 44 single-player cases have a usable sample 1 on both `gpt-6-luna@medium/slim` and `gpt-6-luna@medium/rewriteSlim`, and 26 of them were on an earlier page.
  - The price: every single-player first beat (3), ending (3) and analysis turn (11) was already on Round 1 or Round 2, so none is on Round 3. The rewrite's first-beat, later-switch and ending instructions (table B rows B13 and B23–B25) get no rating. The automatic checks are their only reading.
  - The same 18-case pool built the count-fix page (Borderline Insights, "Round 3 rebuilt"), so the price above holds for it too. The v1 page's 8 items (superseded): 4 from story 8988006e, 2 from 6edd813c, 1 from 2ee343b6 and 1 image-off synthetic turn from 7492b211. 7 show pictures and 1 doesn't. In 2 of them the story generates no new pictures (the `images` case tag), but item 3's versions still place pictures from the story's library. The control (slim against slim, samples 1 and 2) is on `cont-8988006e-t2-o0`, which was on neither earlier page either.
  - The fallback (re-admit Round 1 cases if fewer than 9 qualified) was not needed, so I did not use it. Re-admitting Round 1's first beats and endings would have covered those branches, at the price of showing the owner cases a second time.
- Rating pages (owner request): **Setup options now show the whole design the game uses, and leave out the character-selection plan.**
  - Each option shows, in sections that start open and fold on a click:
    - the difficulty and the character-selection screen;
    - every guideline: world, world rules, tone, conflicts, decisions, types of threads, switch and thread instructions;
    - the shared outcomes: question, resolutions, resonance, intended milestones and milestones;
    - the stat groups, and every field of each shared and player stat: type, group, visible, set by background, can change in beat resolutions, tooltip, initial value, possible values, effect on points, narrative implications, adjustments after threads, and the sacrifice and reward options;
    - every field of each story element;
    - per player: outcomes, identities with pronouns, and backgrounds with their fluff and starting stats, by stat name;
    - the image instructions;
    - a template's teaser and difficulty levels, when present.
  - Left out: the character-selection plan (conversion rates, background archetypes, multiplayer coordination). It is the model's planning scratch, and the game never reads it.
  - Added beyond the request: the image instructions, because the game reads them for every picture. Ids of stats, outcomes and elements show in small type. A starting value for a stat that is not a player stat is marked, so a broken reference is visible.
  - An absent field shows nothing. A list that is present but empty shows "(empty)", so a stat that starts empty, or a setup with no switch instructions, is visible.
  - `round1-setup.html` was re-rendered with `--rerender-page 3434afcc6f`. The page id, items, option order and labels are unchanged, so ratings already saved in the browser still apply. Those ratings were made on the thinner card, and each can still be changed. The earlier copy is `rating/superseded/round1-setup-before-full-design.html`. The page grew from 245 KB to 1.1 MB.
- Milestone 3 (count fix): **What each enforced count needs in the game, and what the worded form (v2) says.** The worded form drops every `minItems`, keeps `maxItems` only as a cap, and says each count in words in its description.
  - Beat options: exactly three. An exploration choice resolves as `resolution${choice % options + 1}` (`BeatResolutionService.getExplorationBeatResolution`), and an exploration step has exactly three resolutions, so two options never reach resolution 3 and four wrap round. Production's schema says "Exactly 3". v2: "Exactly three choices …", max 3. The ending keeps Stage 4's "this list stays empty" without a count keyword: `maxItems: 0` has never been sent, and a 400 would cost a smoke.
  - Interludes: the client carousel (`Interlude.tsx`) shows any number. Production says "exactly 3", but its own breakdown (1 thought, 1–2 elements, 0–1 world) allows two to four, and so does rule B32. v2: "Two to four snippets …", max 4.
  - Show-don't-tell points: planning only, and production gives no count. v2: "One to three …", max 3, which only keeps the plan short.
  - Modifiers: the game sums any number; production says "2 most relevant". v2: "Up to two …", max 2 (Stage 4 had the same cap).
  - Setup identities and backgrounds: `CharacterSelection.tsx` renders any number and `GameHandler` checks the chosen index against the list. Production says "Generate exactly 3", and v2 keeps that description with max 3.
  - Story-element facts, the list gpt-4.1 ran away in: free-form, any count works. v2 keeps production's "Three additional facts", max 3.
  - Story elements: production's prompt asks for 6-8, while the rewrite's fixed rules give only the 2–4 mix, so the v2 description reads "List of 6-8 important elements", max 8.
  - Thread types (6-8, max 8), switch and thread instructions (0-3, max 3) and stat groups (at most 3, max 3): production's descriptions come back unchanged.
  - Effects on points: production says "at least 3" twice. v2 says "List at least 3 ways" once, with no cap and no minimum.
  - Conversion rates, background archetypes and multiplayer coordination: nothing reads them after generation. v2 restores production's "three" as a cap (max 3).
  - Outcomes: max 3, as in Stage 4. The count stays in section 3 of the fixed rules, because saying it again in the description would state it twice.
- Milestone 3 (count fix): **v1 stays buildable byte for byte, through a counts parameter** (`RewriteCounts`, `"exact" | "worded"`, default `"exact"`) on `rewriteBeatRequest` and `rewriteSetupRequest`. A throwaway test rebuilt all 207 Stage 4 records' requests through `planJobs` on the frozen cases. Every prompt hash matched, and so did every cache line, which hashes the JSON schema and the fixed text. I deleted the test afterwards, because it reads `DOCS/`.
- Milestone 3 (count fix): **Variants and arms.** The new variants are `rewrite2` (setup with examples, and beats on the full scaffold), `rewrite2Slim` and `rewrite2ZeroShot`.
  - References are v1's: `rewrite2Slim` → slim, `rewrite2` → prod, `rewrite2ZeroShot` → `rewrite2`.
  - Estimates walk a new `estimateBaseKey`, which tries the arm's Stage 4 form before its reference. A walk along the references alone would have priced `rewrite2Slim` from slim.
  - The Stage 4b block is planned first in `armsFor("4", …)`. That orders jobs only within a role; `--arms` is what holds the $6 raise to these arms (Implementation Issues, "cap raise").
  - There is no separate dry-run row. `--role`/`--arms` filters give the row for each invocation.
- Milestone 3 (count fix): **The no-empty rule is one line in the fixed text** ("Every item in a list carries real content; a list never holds an empty or blank item."), just before "The field descriptions … are part of these instructions", in both beats and setup, so it caches. It deliberately doesn't say that a list may be shorter, because options must be exactly three.
- Milestone 3 (count fix): **The blank-item check (`noBlankItems`) flags a whole reply**, the unit the report counted. A list item is blank when it is an empty or whitespace-only string, or an object whose own text field (`text`, `name`, `title`, `question`, `fact`, `newMilestone`) is. Other empty strings are legitimate (an interlude without a picture, an abstract element's appearance, a percentage stat's possible values).
- Milestone 3 (count fix): **The cap raise is a CLI flag, so no cap value changed in the code.** Every Stage 4 `--run` passes `--stage 4 --stage-cap 6 --over-target-reason "Owner approved 2026-09-26: fix the rewrite's forced counts, re-run Luna medium turns and Sol low setup"`, plus `--arms` with Stage 4b keys only (a raised cap without `--arms` refuses to start; Implementation Issues, "cap raise"). The flag lasts one invocation, and each use appends a line to `budget-overrides.jsonl`. `DEFAULT_STAGE_CAPS` and the $30 hard cap are unchanged.
- Milestone 3 (count fix): **Step 3 of the run (the other 6 Sol premises) ran in two parts, because the hand check refused the whole step.**
  - After step 2, Stage 4 stood at $4.86. Twelve setups at the hand rate of $0.10 would have taken it to $6.06, over the $6 raise.
  - So I cut the step to what fit at the hand rate: 5 premises × 2 arms, $1.00, which would take it to $5.86. I left out `setup-flexible-secret-society` (3 players). v1 had neither a hang nor a blank on it, every game mode stays covered (`setup-flexible-soul-flat` is the other flexible premise), and the single-player reading keeps its 3 premises.
  - Those 10 setups read their lines' caches and cost $0.62. That left room for the premise I had cut, which then passed the hand check alone ($5.48 + 2 × $0.10 = $5.68), so I ran it as a fourth invocation. All 9 premises ran, as the plan asked.
  - Every invocation also carried a `--max-spend` guard below the room left ($0.45, $0.70, $1.00 and $0.30), so a run of hangs or cache writes could not reach $6 before the runner's own check.
- Rating pages (owner request): **The options of an item sit side by side as a comparison grid, and every section is foldable.** The owner asked that each section start at the same height for all options, that all sections and sub-sections fold, and named the ones that start folded.
  - Layout (`ratingRows.ts`, `ratingPage.ts`): one column per option and one row per section. A row is a single `<details>` whose header holds one cell per option, so the columns cannot drift apart and one click opens or folds the section in every option. The nested rows are aligned the same way: the seven guideline fields; stat groups, shared stats and player stats; each player (by slot, a dash where an option lacks one) with its outcomes, identities and backgrounds; the image instructions' seven fields; difficulty, the teaser and the character-selection screen. On turn pages, each player's title, text, options and interludes, under a "For <name>" row when the turn has several players.
  - Things whose number differs per option (each stat, story element, outcome, identity and background) fold one by one inside their own cell. Headers say what they hide: a count on list rows, a stat's name and type, an element's name, an outcome's question, an identity's name and pronouns, a background's title.
  - Folded at load, as the owner listed: Guidelines and, within it, Tone, Decisions and Types of threads (World, World rules, Conflicts and the switch instructions start open); every single stat (the stat lists stay open, so the names show); Story elements and every element; each player's Backgrounds and every background; Image instructions. Everything else starts open, and turn pages start fully open. Nothing remembers a fold, so a reload shows these defaults.
  - Rating controls stay one set per option, in the last row, with byte-identical inputs. The page data, item ids, labels and order are unchanged, so the owner's saved ratings still apply. Each controls cell now also says "Option X", since a setup column can be long.
  - Below the width where the columns fit (`WIDE_FROM`: 760 px for two options, 1100 for three, 1440 for four, about 340 px a column) the rows stay and the options stack inside each row, each cell tagged with its letter. On wide screens the "Option X" labels stick under the navigation bar.
  - Settled beyond the coordinator's list: the setup title and the option labels are headings, not folds. The image instructions' fields became aligned rows like the guidelines'. The item's premise or turn context is shared by all options, so it is a full-width fold (open) above the grid. A section an option lacks now shows "—" instead of nothing, so the row keeps its place. The page instructions describe the columns and the folding, and "Option", "Premise" and the turn labels (`TURN_FIELD_LABELS`) joined the field labels the blinding check reads.
  - All four live pages were re-rendered with `--rerender-page`, after backing each up to `rating/superseded/<name>-before-aligned-sections.html`. A throwaway test (deleted afterwards, because it reads `DOCS/`) compared each new page with its backup: identical page data, item ids and order, option labels and order, all 832 rating inputs and every element id; no text of any option or context lost; every section aligned and every default as listed; no key token in the HTML. Sizes: `round1-setup.html` 1.06 → 1.34 MB, `round1-turns.html` 247 → 324 KB, `round2-turns.html` 180 → 232 KB, `round3-turns.html` 92 → 122 KB.
  - No visual check happened: the Playwright MCP server was disconnected in this session, and nothing was installed. The alignment is proved structurally (every section's header cells sit in one grid row), not by measuring the rendered page, so the owner's first look is the visual check.
- Rating pages (owner request): **Turn pages now show the chapter the turn belongs to, its plan and the outcome it advances, all the outcomes, and the story so far, not just the stats.** The owner asked for more background on the turn pages, "especially which outcome is supposed to make progress, and what the plan for the chapter is".
  - The shared context above the options has five folds (`ratingContext.ts`). This chapter, Outcomes and Before this turn start open. Story so far and The story start folded.
    - This chapter: the turn and its kind (a switch, thread step k of n, a new thread starting, or the ending). A thread that just ended shows its result and the milestone this beat must add. The current thread shows its type, its players or sides, the outcome it advances (with its milestones), the kind of milestone, the length, the plan step by step and the possible results. Past steps show their results, and the current step is marked with what each result would mean. A switch shows its type and its set question and outcome, or its directions and the outcome each one names. The ending lists every outcome it must resolve, with its resolutions.
    - Outcomes: shared and per character, with milestones so far out of the intended number. The outcomes the chapter advances carry a badge.
    - Before this turn is unchanged. The first turn keeps the introduction and the chosen characters, and gains the opening switch and the outcomes.
    - Story so far: each earlier chapter with its result and milestone, and each beat's title and summary. The story: title, world, rules, tone and conflicts.
  - **Settled differently from the coordinator's design: there is no per-option "Chapter plan" row.** The design assumed that on an analysis turn each option's plan came from its own planning call. On these pages it does not. The keys hold only isolated beat arms (no `pipeline:` key), `findOutput` accepts only `beat`-group records, and chains run only on switch/thread cases. Every isolated beat job is built from `caseStory(evalCase)`, which is the frozen state plus the case's one fixed analysis. On `cont-checkpoi-t1-o0`, all six arms titled their beat "Building Community Connections (1/3)", the fixed thread. So the plan is the same for every option, and a per-option row would repeat identical cells. The shared fold shows the full plan instead, and on analysis turns it adds one line: "Planned for this turn; every version below was written from the same plan." If a page is ever built from chains, the row would be needed then.
  - Also settled: the context now reads the state with the fixed analysis applied. Before, it read the frozen state alone, which on an analysis turn lacks the new switch or thread. The turn kind mirrors `ThreadManager.getCurrentBeatType`, and a test checks it against the game's own function. Outcome ids show in small type, so a topic direction's "(player1_…)" can be matched to an outcome. An outcome id the story doesn't hold is named as such, not guessed. "Before this turn" lines are unchanged. Their fixed words joined `CONTEXT_LABELS`, and `metadataLeaks` now reads every context label as well as the headings. The turn page's first instruction now describes the background.
  - All three live turn pages were re-rendered with `--rerender-page`, after backing each up to `rating/superseded/<name>-before-turn-context.html`. A throwaway test (deleted afterwards, because it reads `DOCS/`) compared each new page with its backup. Unchanged: page data, item ids and order, option labels and order in the label and control rows, all 642 rating inputs, every element id, every option grid byte for byte, and the rest of the page apart from the stylesheet, the header instructions and the context. No `text-turn-*.html` copy is left. Sizes: `round1-turns.html` 324 → 448 KB, `round2-turns.html` 232 → 343 KB, `round3-turns.html` 122 → 205 KB.
  - Spot check: 5 items per page (15 in total, covering plain steps 2/3 and 3/3, new threads, topic and flavor switches, first turns, endings and a 3-player thread) were read against their frozen case JSON with `jq`. All matched: turn and length, the current thread or switch, which step is current, the advancing outcome, milestone counts, and the result and milestone of the thread that just ended.
  - No visual check happened: the Playwright MCP server failed to connect in this session, and nothing was installed. A static check of the live pages stood in. The folds and their defaults, a current-step mark on every thread item and on nothing else, no leak word in the stylesheet, script or attributes, no width a 390 px screen can't hold, and the n/p key handler unchanged.
  - Review fixes (two reviewers, 2026-09-27). Both confirmed the background matches the frozen state on 18 items, and that one shared plan per analysis item is right, since the keys hold only isolated beat arms.
    - On switches after a thread and on endings, the Outcomes fold showed no badge, although this beat must add the ended thread's milestone to a specific outcome. That outcome now carries "gets a milestone this turn", in Outcomes and on the ended thread's "For outcome" line. On a flavor switch that continues the same outcome, both badges show. Every item on the three pages now marks an outcome, except the three first-turn topic switches, where the direction is still open.
    - "Just ended" now lists the ended thread's type and every step with its result, as the beat prompt's previous-thread block does, so the result the beat must narrate first is on the page.
    - Story so far: a thread's milestone is labelled "Planned milestone" (the plan's wording; the outcome's own rewrite is under Outcomes), each chapter names its outcome, and a switch shows its question and each player's chosen option.
    - A shared outcome copied into each player's list (template fe7b68c7) showed three times with three badges. It now shows once, as shared, which is where `ChangeService` adds its milestones.
    - An outcome id a topic direction names in parentheses and the story lacks is now noted, as the report claimed but the code did not do. A story whose outcome lists are empty says so. An empty introduction or player name is said to be missing, which also restores the Introduction fold on round 1 turn-07 (case `first-tpl-e401abf2-p1`).
    - The context wraps long unbroken words (`overflow-wrap:anywhere`), so an outcome id in a direction cannot push a 390 px screen sideways. Nothing measured it.
    - The story's own chapter rules (`switchAndThreadInstructions`, e.g. "After each covert investigation thread, increase city surveillance by 5%") joined The story fold.
    - Rejected: showing story-element facts added during play. They sit in the prompt, but the design's folds don't hold story elements. A turn can carry dozens, and Before this turn already has the stats.
    - The three pages were re-rendered with `--rerender-page`. A throwaway test (deleted) compared each with the page before these fixes, and found no change outside the context and the stylesheet. It also compared each with `superseded/<name>-before-turn-context.html`: identical page data, all 642 rating inputs, every option grid, every element id and the script. No new backup was written. Sizes: `round1-turns.html` 459 → 478 KB, `round2-turns.html` 352 → 370 KB, `round3-turns.html` 210 → 219 KB. There was still no visual check, because Playwright failed to connect again.

## Skipped Items

- Milestone 1: **the paid Stage 0 steps** (probe, `--build-cases`, the pre-fix baseline, the results headline numbers), as instructed. They are the next step. The free dry run was run.
- Milestone 1: **Playwright layout check of the rating pages.** No Playwright tool was available in this session. Preview pages built from stored material are ready to open:
  - `file:///D:/Projects/chosenpath/DOCS/2026-09-26_gpt6-text-eval/rating/preview/text-turn-e2074b2786.html`
  - `file:///D:/Projects/chosenpath/DOCS/2026-09-26_gpt6-text-eval/rating/preview/text-setup-3a1b662bcc.html`

  Check desktop and mobile, `n`/`p` keys, export, reload (autosave) and the console.
- Milestone 1: **the "guard can fail" proof.** The plan was to disable the blinding scan, the stage cap, the creator-field strip and the log-tag allow-list one at a time, confirm a test goes red, then restore. The environment's safety classifier refused the temporary guard-disabling edits, so this was not done. Tests for each guard exist (`rating.test.ts`, `armsBudget.test.ts`, `cases.test.ts`, `usageRecorder.test.ts`). The disable-and-see-red check needs a person.
- Run A: **Rating-page trial, what was not exercised.** Multi-option ranking, the repeated item and the baseline-against-baseline item need two arms or two baseline samples, so they wait for the post-fix baseline. The turn page was not trialled; the task asked for the setup set.
- Milestone 2 (eval run): **Setup page reload check.** The Playwright connection dropped just after the export, before the reload step. Autosave was shown instead by the ratings surviving the browser relaunch, and by a full reload on the turn page (ratings, current item and last-export time all restored).
- Milestone 3 (eval run): **No visual check of the Round 2 page.** The Playwright MCP server was disconnected. Instead, I served `rating/` (and not `keys/`) on 127.0.0.1 and ran a throwaway Jest test against the served HTML. It checked:
  - 14 items: 12 regular, the repeat of turn-01 at turn-14 at least 3 items apart, and the today-against-today control at turn-07 with samples 1 and 2 on an unused case;
  - 3 options per regular item, each with the same three arms, at sample 1, on a single-player case;
  - the baseline at A, B and C four times each;
  - every option with its Acceptable?, rank and note controls, a title, at least 3 paragraphs, and 3 options (endings excepted);
  - `htmlLeaks` clean, no leak words in the fixed text, and no network references.

  A synthetic export was then scored with `--score`. The test, the export and the scores were deleted. Layout, the `n`/`p` keys, reload and the in-browser export were not exercised; the page template is unchanged since Round 1's browser check.
- Milestone 3 (planner): **No Round 3 setup page.** Test plan §4.5 judges the setup rewrite by the automatic checks and the play-test.
- Run A: **The 29–58 s gaps between local pregeneration files** (test plan §2.6) were not investigated. Today's text calls take about 10–17 s per turn, and pregeneration runs its options in parallel. Production `[TurnTiming]` lines will show the real pregeneration time.
- Milestone 3 (implementer): **Two jobPlan test cases moved from commit 4 to commit 5.** Both are cache-line cases on split requests: one line for two cases with the same schema and fixed text, and separate lines for an image-on case and an ending. `planJobs` can plan a split request only from the Stage 4 matrix, which arrives in commit 5. Commit 4 carries the other half, "a production request has no cache line". The commit 5 case was proven able to fail by disabling the cache-line assignment.
- Milestone 3 (implementer): **No visual check.** Nothing in this change touches the client or a rating page.
- Milestone 3 (count fix): **The Round 3 page's export was checked without a real browser download.** Both real download attempts (a Playwright `saveAs` script, then a plain click on Export ratings) dropped the Playwright MCP connection (Implementation Issues). So I stubbed the anchor's `click` in the page and read the blob the page's own export code built: file name `ratings-text-turn-c4867b2d79.json`, the rating and note inside, and the last-export time saved. The browser's download dialog itself was not exercised, and neither was the Jump-to menu. The page template is unchanged since the v1 page's check, where a real download worked.

## User Input Needed

- Milestone 1: **Deploy check.** A text `*_MODEL_NAME` outside `gpt-4.1*`, `gpt-4o*` and `gpt-6-*` now stops the server at startup (for example `gpt-4-turbo`, `o4-mini` or `chatgpt-4o-latest`). The local `server/.env` passes: the dry run resolved gpt-4.1 and gpt-4.1-mini. Please confirm the Render variables before deploying this branch.
- Milestone 1: **Privacy page.** `Privacy.tsx` is unchanged. The new `[TurnTiming]` lines log reading and wait seconds per story id and turn: pseudonymous telemetry, kept as long as the host keeps logs. The policy lists only IP address and email. Existing logs already carry story ids, and the content filter even logs premise text. Owner or Legal & Integrity to decide whether operational logs need a line.
- Milestone 1: **Stage 1–2 will not fit $12 at the planned samples.** The dry run estimates $11.83 for isolated candidates plus $0.24 for pipeline chains, before the ~15 built beat cases. The six setup arms alone are about $9, almost all of it Sol. The coordinator's note above (Sol medium setup at 1 sample, caps of $8/$11) is the lever. The caps are one constant, `DEFAULT_STAGE_CAPS` in `server/src/evals/textModelEval/budget.ts`; they still follow the $6/$12/$3/$4 split in the owner decisions.

- **Setup tie-break (coordinator).** Under my reading of "cost, speed and quality all count for setup", a tie in the ratings goes to the faster arm, then the cheaper. Every GPT-6 setup arm is estimated slower than gpt-4.1 (about 42 s), so on equal ratings gpt-4.1 keeps setup, even though Luna would save about 7 cents per story. If ties should favour cost instead, the rule in test plan §6 flips.
- **Budget split (coordinator).** To keep the whole evaluation near the owner's $25 target, the per-stage caps are $8 (Stage 0: probe plus both baselines), $11 (Stages 1–2), $3 (Stage 3) and $4 (Stage 4). Milestone 1 was started with a Stage 0 cap of $6, which is too small for the post-fix baseline at 2 samples, so Milestone 2 raises it to $8. Sol medium setup was cut to 1 sample to pay for that.
- Run A: **Cost-cap basis.** Today's measured cost per custom story (pregeneration on) is $0.61 billed, or $0.87 if nothing had come from gpt-4.1's implicit cache. The eval's cache share (65% of beat input) depends on how close together it sends calls, and production's share is unknown. GPT-6 arms get no cache reads with caching off.
  - Derived: on the billed cap, the lead (Luna medium beats, Luna low analysis) fits only if Luna medium reasons at most about 6.5–7.2K tokens per beat. The plan guessed 6.2K. On the uncached cap there is ample room.
  - The harness uses billed. Please confirm which basis D3 means. The production `[LLM]` lines will show the real cache share.
- Run A: **Setup cap reading.** The harness compares medians: 1.5 × 38.4 s = 57.6 s. Test plan §6 says the 95th percentile: 1.5 × 45.5 s = 68.3 s. The plan's Sol low setup estimate (53–83 s) passes or fails depending on the reading.
- Run A: **Stage 0 money for the post-fix baseline.**
  - $3.61 is left of $6. The post-fix baseline at measured cost is about $3.8 isolated (2 samples, setup $2.9 of it) plus about $0.6 for the pipeline chains.
  - It fits only with a trim, for example setup sample 2 on 9 of the 18 premises (saves about $0.7) and chains at 1 sample (saves about $0.3), or with `--stage-cap` and a recorded reason.
  - The setup prompt changes with the approved fixes (A7), so the pre-fix setup sample cannot stand in for post-fix sample 1.
- Run A: **Stages 1–2 at the planned samples: about $15.4 against $12** (dry run with measured sizes).
  - Derived: the Sol setup arms alone are about $11.4 (low ×2 $4.4, medium ×2 $5.0, none ×1 $2.1), because setup input is 21–23K tokens, not 15K.
  - Sol setup is the owner's named reason for extra spend. Cutting Sol medium to 1 sample saves about $2.5.
  - Going over $12 needs the owner's go-ahead or a recorded reason. The total would then be about $29 of the $50 ceiling.
- Run A: **First-attempt validity gate.** The baseline was 100% valid (115 of 115). "No worse than the baseline" then fails an arm on one invalid reply unless the noise floor absorbs it. Worth confirming the intended tolerance (the 98% floor alone?).
- Milestone 2 (implementer): **Stages 1–2 come out $0.16 over the $13 cap at the owner's sampling.** Free dry run after the prompt fixes, on the frozen cases:
  - As planned: $12.08 isolated plus $1.08 pipeline chains, $13.16 in total, at least 117 + 30 minutes.
  - With `--no-mp-continuations` (the owner's first shrink lever): $11.56 plus $1.08, $12.64 in total. It fits with $0.36 to spare. It drops 6 multiplayer continuation beat cases, 45 candidate beat jobs.
  - If more room is needed, the owner's order continues with analysis at one sample (`--role analysis --samples 1`), and never touches Sol setup. The planner's other lever is the multiplayer analysis pipeline chains, which feed no gate.
  - The Stage 0 post-fix baseline fits either way: $4.32 isolated plus $0.83 chains, $5.15 of the $5.61 left of $8. With `--no-mp-continuations` it is $4.21 plus $0.83.
  - Estimates do not include validity re-sends. They happen only on unparseable replies, which were 0 of 115 on the baseline.
- Milestone 2 (eval run): **Rate the two round-1 pages** (setup first). `DOCS/2026-09-26_gpt6-text-eval/rating/round1-setup.html` has 11 items and `round1-turns.html` has 17. Export each page and hand the files to the next session for `--score`. The round-1 report explains how: `DOCS/2026-09-26_gpt6-text-eval/2026-09-26_round1-report.md`.
- Milestone 2 (eval run): **The setup wait cap rules out every Sol arm on both readings.**
  - Sol low: median 62.2 s, p95 81.2 s, against 57.6 s and 68.3 s.
  - Sol medium: 84.2 s and 104.8 s. Sol none: 74.0 s and 94.1 s.
  - Sol low does fit on single-player premises: 55.2 s and 61.6 s.
  - Under the current rule, Sol cannot win setup whatever it is rated. The owner might keep the cap, apply it to single-player stories only, or raise the factor.
- Milestone 2 (eval run): **Multiplayer needs a decision for any GPT-6 turn arm.**
  - Every GPT-6 arm is more than 5 s over today's group p95. Luna low: 35.6 s for 2 players and 42.2 s for 3. Luna medium: 51.8 s and 62.0 s (the 3-player figure is 6 calls). Today: 18.6 s and 24.1 s.
  - With multiplayer pregeneration on, the lead costs more per group story than today's group stories without it on the billed reading: $0.54 against $0.40 for 2 players, $0.64 against $0.52 for 3. On the uncached reading it is 2–3 cents over.
- Milestone 2 (eval run): **Which "today" the caps read** (see Controversial Decisions). The report reads Run A's figures, as the owner said. The post-fix baseline would move only the Sol-setup-with-today's-turns cost verdicts and Sol low's single-player setup median.
- Milestone 3 (planner): **Round 2 comes after Round 1.** The Round 2 page (about 40 minutes of rating) is built at the end of this run. Rate Round 1 first.
- Milestone 3 (planner): **Multiplayer turns were not trimmed in the measurement.** The trims drop `multiplayerCoordination` and `otherBeats`, which the research calls the only device for keeping players' beats consistent within one reply. A carried-forward trim would need a multiplayer check before production.
- Milestone 3 (eval run): **Rate Round 2 after Round 1:** `DOCS/2026-09-26_gpt6-text-eval/rating/round2-turns.html`, 14 items, about 40 minutes. The export is `ratings-text-turn-891345004e.json`; hand it to the next session for `--score`. The Stage 3 report explains the page: `DOCS/2026-09-26_gpt6-text-eval/2026-09-26_stage3-report.md`.
- Milestone 3 (eval run): **Do about 9% fewer established facts per turn matter?** Both turn trims record fewer facts on Luna medium (3.51 → 3.2) and Luna low (3.60 → 3.3–3.4), and more introductions and stat changes instead. Luna none does not. Later beats read the facts, so the Round 2 rating is the check.
- Milestone 3 (eval run): **The setup trim, my reading: don't adopt it on its own.** It saves under half a cent per story and no measurable wait. On Luna low it pushed 2 of 36 setups to 5 visible player stats (full: 0 of 36). Stage 4's rewrite covers the setup prompt anyway.
- Milestone 3 (planner): **Round 3 (8 items, about 20 minutes) comes after Rounds 1 and 2.** If Round 2 rates slim below full, read the Luna medium rewrite on the full scaffold instead; a second sample costs about $0.1.
- Milestone 3 (eval run): **Stage 4 stopped at its cap, and the ledger probably understates what OpenAI billed.** Borderline Insights has the figures. One thing needs you:
  - **Check the OpenAI usage page** for gpt-6-sol and gpt-6-luna on 2026-09-26, 13:20–14:40 UTC. Stage 4's GPT-6 calls ran 13:20:21–14:33:22, and the last hang timed out at 14:31:07.
    - The harness books a hung call at its estimate: $0.41 for the 5 Sol hangs and $0.10 for the 38 Luna hangs.
    - The answered GPT-6 calls in that window cost $1.61 ($1.42 Sol, $0.20 Luna). About that on the page means the hangs were not billed.
    - If those calls kept generating for the full 300 s, at the smoke's measured speeds (Sol about 80, Luna about 110 tokens per second), they cost about $1.8 of output, so the page shows about $3.4, and the bill is about $1.3 higher than the ledger (DERIVED from the price table). That makes about $26.1 in total, not $24.76.
    - It is more if OpenAI kept generating after the client disconnected.
    - A whole-day view mixes in about $14.3 of earlier GPT-6 spend (Stages 1–2 and 3, before 10:25 UTC).
    - Stage 4b adds only 3 hung Luna calls (16:48–17:14 UTC), at most about $0.05 even if billed (DERIVED).
- Milestone 3 (count fix): **Rate Round 3 after Rounds 1 and 2:** `DOCS/2026-09-26_gpt6-text-eval/rating/round3-turns.html`, rebuilt from the count fix. It has 10 items (8 regular, a repeat and a control), 2 options each, about 20 minutes.
  - The export downloads as `ratings-text-turn-c4867b2d79.json`. Hand it to the next session for `--score`, which finds `keys/round3-turns-c4867b2d79.json` by its page id (checked with a test export).
  - The v1 page is kept, unrated, as `rating/superseded/round3-turns-v1.html` (key `keys/superseded/round3-turns-v1-291fb89390.json`). Don't rate it. If you had started rating it, those answers stay under its own page id and don't carry over.
  - No option on the new page has a blank item, so the v1 page's blank-bullet tell is gone.
  - Two structural differences remain, both real content that a player would see. On 2 of the 8 regular items (items 2 and 4), one version writes 2 interludes where the other writes 3. On every regular item, one version's story text is 56–89 words shorter. The Stage 4b entries in Borderline Insights say which version does which, so read them after rating if you want Round 3 blind.
- Milestone 3 (count fix): **Owner decisions left after Stage 4b** (the owner report's section 2; the usage-page check and the Round 3 rating are the entries above).
  - **The setup wait cap** (open since Round 1, Milestone 2 entry above). On Stage 4's 9 premises every Sol setup median is over the 57.6 s cap: today's form 62.5 s (single-player 60.2 s), v2 80.0 s with examples and 81.6 s without (single-player 77.2 and 70.5 s). Round 1's 16 single-player setups on today's form read 55.2 s, within it. If the cap is loosened, my reading is to carry v2 without examples forward on cost (10% cheaper, from the 18% shorter prompt), with the play-test as the quality check: 9 setups with no noise floor don't separate the two forms on quality.
  - **The shorter GPT-6 turn timeout and a production output cap, decided together** (they replace the Stage 4 timeout entry; the Milestone 2 timeout suggestion under Suggested Follow-Up Work stays). Either bounds a padded reply. At 90 s the two v2 replies past 180 s (208 and 275 s) would be retried sooner, and a hang would cost 1.5 minutes instead of 3; no unpadded v2 turn took longer than 57.2 s, but Luna medium's 3-player p95 was 62 s in Round 1. On output, the longest unpadded v2 turn wrote 6,770 tokens and Luna medium's 3-player turns up to 8,938, so a cap near 12,000 would have stopped the two long padded replies (24,500 and 39,530) and no normal turn (DERIVED). Both change production (an output cap changes the request shape, since production sends none).
  - **Whether to use the $0.39 left under the $6 Stage 4 cap.** The raise was recorded for the count fix only, so each option needs the owner's go-ahead:
    - replay the story 8988006e turn 4 cases with an output cap (a few cents, plus the eval-only option under Suggested Follow-Up Work) to see where the padding starts and whether a hang is padding past 300 s;
    - the verbosity arm and the full-scaffold hedge (about $0.26 by their estimates), which are still defined on the `exact` counts (`stage4Arms` in `arms.ts`) and would need `worded` versions first, or they reproduce v1's hangs and blanks. The hedge matters only if Round 2 rates slim below full;
    - gpt-4.1's open setups (about $0.45, doesn't fit), also on the `exact` counts.
    
    The cap goes no higher without the owner's go-ahead.

## Implementation Issues

- Milestone 1: **Mismatched thread in stored story 7492b211.** The current thread is typed challenge, but its beats resolve as exploration (resolution1–3). `ThreadResolutionService` therefore logs "No valid resolutions found, defaulting to mixed" for its 3 units. Production did the same with this data. The eval inherits the result through the stored child phases.
- Milestone 1: **Broken multiplayer template.** Template e0bc82a0 advertises up to 2 players but has no player-2 backgrounds, so a 2-player start would be refused. The case builder skips templates whose slots lack characters or backgrounds.
- Run A: **Estimates left out the JSON schema.** OpenAI bills it as input, and the probe measured 4K–16.5K tokens per production schema. Pre-flight checks and runner reservations were therefore low, by about $0.03 per gpt-4.1 or Sol setup call. Fixed in `d918ce5` (`requestChars`).
- Run A: **Playwright MCP blocks `file://`,** so rating pages must be served locally for automated checks. The owner opens them via `file://` as intended.
- Run A: `outputFile` in `calls.jsonl` uses Windows separators (`outputs\<id>.json`). Harmless here, but the folder would not read on another OS without normalising.
- Milestone 2 (eval run): **Two Luna none turns hung for the full 300 s.** They started 49 s apart (07:37:38 and 07:38:27 UTC) and got no reply at all. Each retry answered in 16–18 s. The wait statistics read only the usable final attempt, and the validity gate leaves transport failures out, so neither hang shows in any p95 or gate. In production the beat timeout is 180 s, so a player would wait 3 minutes plus the retry. That is 2 of about 100 Luna none turn calls in that window. The round-1 report states it separately.
- Milestone 2 (eval run): **The dry-run estimate was low for multiplayer Sol calls.** The 45 restored multiplayer continuations were estimated at $0.28 and cost $0.48. `estimateCall` takes the median measured output per role and arm over all player counts, so once 1-player outputs exist it underprices 2- and 3-player calls. It stayed inside the cap, but a Sol-heavy multiplayer run could overshoot its estimate. The runner's reservations use the same numbers.
- Milestone 2 (eval run): **The two remaining hangs** (after the two recorded above) were a Luna medium turn inside a pipeline chain (07:59:18 UTC) and a Luna none rare-failure call (08:29:04 UTC). That makes 4 of 714 Luna turn calls: Luna none 3 of 228, Luna medium 1 of 228, Luna low 0 of 228. Sol had none in 87 calls, and gpt-4.x none in about 460. A chain's turn wait also counts only the final attempt.
- Milestone 2 (eval run): **Playwright's MCP server dropped its connection twice during the rating-page check,** both times right after a file download or while a script was running. The export had already been saved, and the server reconnected on the next call. Scripts that download should save the file and return at once.
- Milestone 3 (implementer): **The secret-redaction hook flagged a test line as a credential.** It matched the annotation `outputTokens: number` in `jobPlan.test.ts` as a "secret-assignment". That is a false positive: no credential was involved, and the file on disk is unchanged. The type-check and tests read it normally.
- Milestone 3 (eval run): **The checks and rating pages split paragraphs only at blank lines; the game splits at single newlines too.** Found by the Round 2 page check: one baseline option rendered as a single paragraph. Fixed in 7ac22a1.
  - The cause: the client's `normalizeStoryText` turns every single newline into a paragraph break and joins image lines to the next paragraph. `paragraphsOf`, the image-tag positions and `withPictureNotes` split only on `\n\s*\n`.
  - `playerText.ts` now copies the client's normalisation, and all three use it. `--rerender-page <pageId>` re-renders a handed-out page from its key.
  - Effect on today's post-fix turns: 5–6 paragraphs 92.9% → 100%, no image in the last paragraph 90.2% → 96.4%, 3–5 sentences 56.3% (was 53.6%).
  - Baseline chains: paragraphs 75.8% → 95.5%, image placement 69.7% → 87.9%, sentences 42.4% → 50.0%.
  - Pre-fix baseline: paragraphs 91.1% → 94.6%, image placement 91.1% → 98.2%.
  - No GPT-6 figure changed. GPT-6 almost never uses single-newline paragraphs; the one Sol low option that shows as a single paragraph is a genuinely one-paragraph reply.
  - I re-rendered `round1-turns.html` (one option changed) and corrected §1 and §7 of the round-1 report.
- Milestone 3 (eval run): **Built case `thread-tpl-e401abf2-p1-t1` carries an outcome id the story does not have** (`outcome_adriana_dashboard_insights`). Every thread output on that case copies it, full and trimmed alike. The next beat prompt logs `[StoryStatePromptService] ERROR: Outcome not found` (twice in the Stage 3 chains). The cause is the case, not the trim. `checkThread` does not check outcome ids, so no reading flags it.
- Milestone 3 (eval run): **Estimates:** setup came in 13% over its estimate ($1.12 against $0.99). The Sol low sibling's measured outputs priced it, and the trims write only 7% less. Turns came in 26% under ($0.98 against $1.32), because the trims write 31–44% less than the borrowed full-form figures. Chains were $0.11 against $0.15.
- Milestone 2 (implementer): **Core changes need a rebuild before the server's type-check.** `server` reads core's built declarations, so after editing `core/`, run `npm run build:core` before `tsc --noEmit` in `server/`. The root `check:all` does this itself. Tests are unaffected, because Jest reads core's source.
- Milestone 3 (implementer): **On the machine the eval folder was restored to, `core/dist` was absent.** The server type-check failed with TS6305 ("Output file … has not been built from source file") on every core import until `npm run build:core`. Dependencies were already installed (`npm ls` showed nothing missing). The root `check:all` builds core first, so it is unaffected.
- Milestone 3 (review): **The variant section counted a job still waiting for its re-run as a matched pair.** `finishedPairs` kept every `jobFinal` record, a rejected 400 included, while the runner plans such a job again. So after a smoke run met a 400, the reference was read on a case where the arm had no reply. An arm holding only rejected records still got a comparison at $0 per call. Now `finishesJob` in `runner.ts` is the one definition of finished, and `finishedJobKeys` and the pairing both use it. Tests: a rejected-only pair is no pair, an arm holding only rejected records gets no comparison, and a re-run pairs again.
- Milestone 3 (review): **A job left with only a rejected request counted as a $0 call in the cost readings.** `cost.*.perCall`, `byPlayers` (which feeds the per-story cost), `inputCost` and the cache lines averaged over every job and step, while `calls` left these jobs out. `armStatsOf` now prices only records that are not rejected requests. They cost $0 with 0 tokens, so no sum changes, only the denominators. The rejected-parameter rate still reads over all records. Test: a rejected-only job beside a $0.02 call reads $0.02 per call, $0.01 input and 1 cache line.
- Milestone 3 (review): **Case building could throw away a re-run's valid output.** `buildCasesMode` took the first `jobFinal` record in file order, which after a re-planned rejection is the old 400, so the case was skipped. It now takes `finishingRecord` (the record that finished the job, from this invocation or an earlier one). This path was latent: the cases are frozen, and the ledger has no rejected records. Test: the finishing record is the re-run, never the earlier rejection.
- Milestone 3 (review): **The cache-line test did not pin the arm key in the hash.** It compared two arms whose schemas differ anyway. It now compares `gpt-6-luna@medium/rewriteSlim` with `gpt-6-luna@medium+vlow/rewriteSlim`, checks that they send the same text and schema, and checks that their lines differ. I proved it can fail: dropping the arm key from `cacheLineOf` turned it red, and restoring it turned it green.
- Milestone 3 (review): **The first beat's fixed facts count contradicted its "no new facts".** Fixed rule B15 asked for 3 or more facts per switch, and the first beat is a switch whose per-call line says "Add no new story elements and no new facts". Production has no such conflict: it swaps the whole world-building block out on the first beat. The count now reads "from the second beat on, 3 or more per switch and per thread step", so `fixed` stays one text and still caches. The first-beat cases are 3 of the 44 single-player turn cases. Test: the fixed text words the count with its condition.
- Milestone 3 (review): **The "examples verbatim" test was circular.** It took the expected slice from `productionExamples`, the function under test. It now slices production's prompt with literal anchors, checks both premises and the last line, and checks the whole section in `fixed` (heading, slice, then section 7). A new case checks that a heading found twice throws. I proved it can fail: moving the end anchor to "Premise: The last rock band on Mars" turned both player counts red.
- Milestone 3 (count fix): **A setup list left one item short passed every automatic check. Fixed: `checkSetup` now reads every list whose count the prompt states.**
  - The cause: the worded form drops every `minItems`, so a model that wants two identities can write two instead of a blank third, and `noBlankItems` cannot see a missing item. `checkSetup` checked only the visible stats and the thread types, and counted the elements without checking them. Stage 4b's setups are judged by the automatic checks and a play-test, with no Round 3 setup page, so this gap decided the reading.
  - New checks: `storyElements` (6-8), `threeFactsPerElement`, `effectsPerStat` (at least 3 on every stat), and per player `threeIdentities`, `threeBackgrounds` and `threeOutcomes` (counting the shared ones; production and the rewrite both ask for 3). New counts, as means: `factsPerElement`, `identitiesPerPlayer`, `backgroundsPerPlayer`. A missing list counts as empty.
  - Over the recorded setups (a throwaway scan, deleted): facts, backgrounds and effects never miss on any arm. `threeOutcomes` misses on gpt-4.1 rewrite 3 of 6 and rewriteZeroShot 4 of 5, Luna none prod 7 of 36, gpt-4.1 prod 2 of 36 and Sol low rewrite 1 of 9; Sol low prod 0 of 36. So the next `results.md` shows a new gpt-4.1 rewrite reading that Stage 4's report does not have. Luna none prod has one player with 2 identities and one setup outside 6-8 elements; Luna low minimal has one outside 6-8.
  - Tests: a complete 2-player setup passes; one list short or over, on one player, element or stat, fails only its own check; a missing list fails; the means.
- Milestone 3 (count fix): **A turn with 0 or 1 interludes read the same as an allowed 2 or 4. Fixed: `interludesTwoToFour` reads rule B32's range, and `interludes` is a new beat count.** `threeInterludes` stays as production's contract. This replaces the earlier advice to read `threeInterludes` beside `noBlankItems`: read `interludesTwoToFour` and `noBlankItems` together. Over the recorded turns, no reply has fewer than 2 or more than 4 interludes. Blank ones count as items, so v1 Round 3 item 7 (two blanks) still reads 3 there and fails only `noBlankItems`. Tests: 0, 1 and 5 fail, 2 to 4 pass, and a turn that drops an interlude passes `noBlankItems`.
- Milestone 3 (count fix): **The $6 raise was not held to the approved arms. Fixed: a `--run` that raises a stage cap now needs `--arms`, and the override records them.**
  - "Planned first, so a cap stop cuts Stage 4's leftovers first" held only within a role. The runner runs every setup job before any beat job, and warm-first can start a leftover while a Stage 4b cache line warms.
  - The pre-run refusal let a role-only run through. `--role setup` alone plans 25 jobs at about $1.97, which is $5.96 against $6. After Sol's 18 it would have run gpt-4.1's 7 leftover setups on the exact-count rewrite, the one that ran away. `--role beat` alone would have run the verbosity arm and the hedge after Luna, leaving less room for Sol.
  - `resolveCaps` (`budget.ts`) now takes `forRun` and `armKeys`. On a run, a raised stage cap without `--arms` throws before anything is planned. A run within the default cap needs no arms, and the probe and case building are unaffected. `budget-overrides.jsonl` gains an `arms` field on runs.
  - Not done: taking Stage 4's leftovers out of the matrix. They are your open options (User Input Needed), and funding them would then need a code change.
  - The wording is corrected in `arms.ts`, `.context/text-model-eval.md` and Controversial Decisions. Tests: a raise without `--arms`, or with an empty list, throws; a raise with arms records them; no arms are needed within the default cap or outside a run.
- Milestone 3 (count fix): **Whitespace padding inside a valid reply was read only by hand. Fixed: `noWhitespacePadding` and the count `longestWhitespaceRun`, on every role, read from the stored reply text.**
  - `junkIn` reads only the parsed strings, so padding between JSON tokens never reached a record. The new reading is computed when `results.md` renders, from `rawBody` in `outputs/` (`loadReplyContent` in `evalFiles.ts`; `replyContent` and `longestWhitespaceRun` in `responseCheck.ts`). So Stage 4 and Stage 4b read alike, and no record changed.
  - The threshold is 64 characters (`PADDING_RUN_CHARS`). Over all recorded outputs, layout runs (indentation) reach 29 characters, and padded replies start at 30,601.
  - **It found three padded replies nobody had seen, all Round 1 production-form Luna turns on story 8988006e turn 4.**
    - `cont-8988006e-t4-o0` in the rare-failure batch: 160,622 characters, 41,190 output tokens, 295.5 s, 5 s short of the eval's timeout.
    - Two chains on `switch-8988006e-t4-o0`: to Luna none (s1), 60,352 characters at 66.7 s; to Luna medium (s2), 31,710 at 121.8 s.
    - All three pad after the beat has closed, just before the reply's last brace. Stage 4's 176 s turn pads between two interludes.
  - So production's schemas also meet the loop, at a low rate: 3 of 714 Round 1 Luna turn replies padded and recovered, beside the 4 hangs. The rewrite's enforced counts raised the rate sharply (38 hangs in 126 Luna attempts), so the count reading stands, but padding is not only a count effect. In production, the 295 s turn would have timed out at 180 s.
  - Tests: the run is measured outside strings only (escaped quotes included); the reply text reads back from a stored output; the check fails one character past the threshold; pretty-printed JSON passes; `checksForRecords` adds the reading beside the role's own checks, and leaves it out when no reply text is stored.
- Milestone 3 (count fix): **The Playwright MCP connection dropped on both download attempts in the Round 3 check, and each time the browser lost its recent storage writes.** First a script that waited for the download and saved it, then a plain click on Export ratings. Each returned "Connection closed", and no file was saved. The server came back on the next call with a fresh page, and the test rating was gone from the page's storage while an older state (the current item) survived: the browser had been restarted before it wrote the latest changes to disk. So a reload check run straight after a download is not a reload check. The workaround that worked: stub `HTMLAnchorElement.prototype.click` in the page and read the export blob (Skipped Items). Milestone 2's entry on the same drops said a download script should save and return at once; that was not enough here.

## Borderline Insights

- Milestone 1: **Dry-run numbers** (2026-09-26, before built cases):
  - Stored units: 33 (8988006e 18, 6edd813c 6, 7492b211 3, 2ee343b6 3, checkpoint 3), exactly as the test plan predicted.
  - Case building: about $0.21.
  - Probe checks: about $1.04, plus about $0.07 for the two full completions. At `--max-spend 1` the last few Sol-medium schema checks will be skipped.
  - Pre-fix baseline (1 sample): 68 jobs, $1.65. The 18 gpt-4.1 setups alone are about $1.4.
  - Post-fix baseline: 136 isolated jobs at $3.30, plus $0.20 for the pipeline chains.
  - The pre-fix share is about ($6 − $1 − $0.21) / 3 ≈ $1.60. The plan's cut order (analysis, then multiplayer continuations, then beats outside the subset) is needed. Setup plus the 15 subset beats alone is about $1.55.
- Run A headline numbers (full report: `DOCS/2026-09-26_gpt6-text-eval/2026-09-26_run-A-report.md`):
  - **Spend:** probe $0.47, case build $0.17, pre-fix baseline $1.75. Stage 0 stands at $2.39 of $6.
  - **Dry run at the start:** the same as Milestone 1's above.
  - **Dry run after the schema fix, with frozen cases and measured baseline sizes:**
    - post-fix baseline: $4.31 isolated plus $0.83 chains, at least 11 + 5 minutes;
    - Stages 1–2: $14.28 isolated plus $1.08 chains, at least 123 + 30 minutes.
  - **Probe:**
    - every schema was accepted at every effort tested;
    - temperature is accepted at none and rejected above it;
    - `minimal` is rejected, and `xhigh` exists;
    - explicit caching writes nothing, while the implicit default writes the whole prompt;
    - a breakpoint is read back on the repeat;
    - all usage fields are reported.
  - **Measured sizes** (medians):

    | Call | Input | Output |
    |---|---|---|
    | Setup | 21.3–23.2K (plan 15K) | 5.8K / 6.9K / 7.8K for 1 / 2 / 3 players |
    | Beat, 1 player | 13.0K | 1.71K |
    | Switch | 5.7K | 0.31K |
    | Thread | 6.5K | 0.62K |

  - **Today per call, billed:** setup $0.080, beat $0.0052, switch $0.0019, thread $0.0025.
  - **Today per custom story:** $0.61 with pregeneration and $0.26 without, against the plan's $1.08 and $0.42.
  - **Waits:**
    - setup p50 38.4 s, p95 45.5 s;
    - 1-player beat p50 9.6 s, p95 11.4 s;
    - analysis turn (summed p95) 16.5 s;
    - 2-player beat p95 18.7 s, 3-player 24.1 s (n=2).
  - **Validity:** 100% valid on the first attempt, no retries.
- Run A: **Known-ids beat check at 44.6% on the baseline** is real baseline behaviour, not a checker bug. `establishedFacts` point at stat ids (`shared_city_surveillance`), at `player1` or `shared`, or at an element that is never introduced. The schema asks for a story element or `world`.
- Run A: **Thin strata in the built cases:** 1 contest thread and 2 three-player beat cases. Multiplayer 3-player waits rest on 2 calls.
- Milestone 2 (implementer): **Dry-run rows after the prompt fixes** (free, 2026-09-26, 112 frozen cases). The dry run builds every case's post-fix prompt, so it also shows that the fixed prompt code runs on all real cases.
  - Stage 0 post-fix baseline (2 samples, isolated): 214 jobs (setup 36, beat 112, switch 36, thread 30), est $4.32, at least 11 min.
  - Stage 0 post-fix baseline pipeline chains: 66 jobs, est $0.83, at least 5 min.
  - Stages 1–2 candidates (isolated): 909 jobs (setup 180, beat 531, switch 108, thread 90), est $12.08, at least 117 min.
  - Stages 1–2 pipeline chains: 198 jobs, est $1.08, at least 30 min.
  - Spend so far: $2.39 of $30 (Stage 0 $2.39 of $8).
- Milestone 2 (implementer): **The new report reproduces Run A's figures.** Rendering Run A's records through the new views gives today's production at $0.6123 billed and $0.8721 uncached per custom story with pregeneration, and setup caps of 57.6 s (median) and 68.3 s (p95).
- Milestone 2 (eval run): **Round 1 headline numbers** (full report: `DOCS/2026-09-26_gpt6-text-eval/2026-09-26_round1-report.md`):
  - **Dry run at the start** (post-fix prompts): Stage 0 post-fix baseline $4.32 plus $0.83 for chains. Stages 1–2 $12.08 plus $1.08, or $11.56 plus $1.08 with `--no-mp-continuations`.
  - **Spend:** Stage 0 $6.42 of $8 (post-fix baseline $4.03). Stages 1–2 $12.09 of $13 (setup $8.59, turns $1.49, analysis $0.21, chains $0.83, restored multiplayer continuations $0.48, rare-failure batch $0.49). Total $18.51 of $30.
  - **Validity reading:** every arm is 100% valid on the first attempt and within retries, so no arm is worse than baseline. The gate reads pass for all.
    - Isolated arms: setup 18–36 calls, Luna beats 162, Luna high 30, Sol low 15, analysis 36/30.
    - Chains: 396 calls, also all valid.
    - Baseline: 346 post-fix calls and 115 pre-fix.
  - **Setup:** see User Input Needed. Luna none and low are within both readings at $0.006 a setup.
  - **Cost per single-player story with pregeneration:**
    - The lead (Luna medium beats, Luna low analysis) is $0.327 for turns and analysis. Add $0.071 for a gpt-4.1 setup or $0.093 for Sol low.
    - Today's turns are $0.532 billed and $0.783 uncached; the whole story is $0.612 and $0.872.
    - Luna medium reasons about 1,600 tokens per turn, not the plan's 6,200.
    - Sol low turns are $3.62, about 6×.
  - **60 s cap:** the lead reads 41.8 s (turns without analysis) and 44.9 s (analysis turn, measured by chains). Luna low reads 21.9 s and 30.2 s. Luna high is over at 64.6 s.
  - **No-pregeneration bar (5 s / 8 s):** nothing comes close. Today reads 10.0 s / 13.8 s, the lead 31.9 s / 43.2 s.
  - **Rule checks, GPT-6 against baseline:**
    - Better: known story-element ids (83–100% vs 43%), 3–5 sentences (94–100% vs 54%), image placement, requested image.
    - Worse: modifiers within ±15 (90–94% vs 99%). The misses are +20s, the stats' "major" size, which is the known cross-role mismatch.
  - **Prose:** stock phrases 0.04–0.25 per 1,000 words (baseline 3.24). Distinct two-word openings 43–48% of 203 turns (baseline 18% of 140). Turns opening with "You": 62–77% (baseline 100%).
  - **Pre- vs post-fix baseline:** option points within the rules 62.5% → 95.5% (noise ±1.8). Known change ids 85.7% → 90.2%. No meta words 78.6% → 83.9%. Sentences 58.9% → 53.6% (±3.6, slightly worse). Everything else is within noise. Setup waits 38.4/45.5 s → 35.0/43.2 s.
- Milestone 2 (implementer): **Privacy page and AI transparency record: checked, no change.** `client/src/page/static/Privacy.tsx` names OpenAI for "your story premise, your choices, and anything you write about yourself". `.context/ai-transparency.md` rows 2, 5 and 6 name the same models and features. This milestone changes no model, feature or label, and it sends less personal data to OpenAI (AI Iteration no longer includes the creator's id and username).
- Milestone 3 (implementer): **Stage 3 dry-run rows** (free, 2026-09-26, 112 frozen cases). Planning builds every trimmed request, so the dry run also showed that each trim applies on every frozen case it covers (single-player beats, all 18 premises, all analysis cases). A chain's beat step is built only after its analysis; the trims tests cover that path on fixtures.
  - Stage 3 candidates (isolated): 551 jobs (setup 45, beat 440, switch 36, thread 30), est $2.38 (stage cap $3), at least 42 min.
  - Stage 3 pipeline chains: 42 jobs, est $0.18, at least 5 min.
  - Total $2.56 (the plan's DERIVED figure was about $2.45). Spend so far: $18.51 of $30, Stage 3 $0.00 of $3.
- Milestone 3 (implementer): **Privacy page and AI transparency record: checked, no change.** No production model, feature, prompt, schema or data flow changed. The trims run only in the eval harness, which sends the same frozen cases to the same OpenAI models as Round 1.
- Milestone 3 (implementer): **Documentation levels.** I updated the context level in `.context/text-model-eval.md`. It now covers the trims module and its anchor rule, variants and scopes, the Stage 3 matrix and pipeline, the key-format owner, borrowed estimates, the report modules and the Stage 3 section, and the known limits. The rest needed nothing:
  - There are no `.specs/`, no system record, no `decisions.md` and no `conventions.md`.
  - The `CLAUDE.md` pointer to `text-model-eval.md` already exists.
- Milestone 2 (implementer): **Documentation levels.** There are no `.specs/`, no `.context/system-overview.md`, no `decisions.md` and no `conventions.md`, so the spec and system-record levels had nothing to update. I updated the context level in `.context/text-model-eval.md`: commands, prompt states and the fix list, budget, runner, arms and gate readings. The one pattern worth recording, "the prompt builder owns the creator-field strip", is there too.
- Milestone 3 (eval run): **Stage 3 headline numbers.** The full report is `DOCS/2026-09-26_gpt6-text-eval/2026-09-26_stage3-report.md`. Every trimmed arm is read against its full form on the matched (case, sample) pairs.
  - **Dry run at the start:** $2.38 isolated plus $0.18 chains, $2.56 in total, below the $2.75 shrink threshold, so there was no shrink.
  - **Spend:** setup $1.12, turns $0.98, analysis $0.05, chains $0.11. Stage 3 is $2.26 of $3; the total is $20.77 of $30.
  - **Validity:** 635 attempts, all valid on the first attempt. No retries and no hangs.
  - **Turns** (88 single-player pairs each), full → trim:

    | Arm | Visible tokens | Reasoning tokens | p50 wait | p95 wait | $/turn |
    |---|---|---|---|---|---|
    | Luna medium minimal | 2,323 → 1,421 | 1,632 → 1,498 | 31.9 → 24.9 s | 41.8 → 33.2 s | $0.0032 → $0.0026 (−19%) |
    | Luna medium slim | → 1,600 | → 1,535 | → 26.6 s | → 35.1 s | → $0.0027 (−15%) |
    | Luna low minimal | 2,296 → 1,378 | 180 → 194 | 16.6 → 12.6 s | 18.9 → 14.4 s | −23% |
    | Luna low slim | → 1,539 | → 160 | → 12.8 s | → 14.7 s | −17% |
    | Luna none minimal | 2,509 → 1,409 | 0 → 0 | 18.6 → 11.2 s | 22.4 → 13.3 s | −28% |

  - **Analysis, Luna low minimal:** switch 458 → 200 visible tokens, 4.4 → 3.1 s p50. Thread 869 → 613 tokens, 7.4 → 6.1 s. Nothing lower; all checks at 100%.
  - **Chains** (analysis-turn wait, 21 single-player cases × 1): the lead minimal/minimal p50 29.8 → 20.2 s, p95 41.8 → 33.7 s. Luna low minimal/minimal p95 27.9 → 18.5 s.
  - **Lead per single-player story with pregeneration** (turns plus analysis, matched pairs):
    - full $0.313;
    - slim turns with minimal analysis $0.264 (−$0.049);
    - minimal turns with minimal analysis $0.253 (−$0.061).
  - **Setup:** Sol low minimal 6,012 → 5,581 tokens. The median wait went 62.5 → 63.3 s and the p95 80.4 → 75.5 s; single-player median 57.2 s (3 calls). Cost $0.105 → $0.101. Luna low minimal 7,395 → 6,903 tokens, 51.5 → 51.3 s, with the playerStats check at 100% → 94.4%.
- Milestone 3 (eval run): **Privacy page and AI transparency record: checked, no change.** No production model, feature, prompt, schema or data flow changed. The eval sent the same frozen cases to the same OpenAI models as Round 1, and the paragraph fix touches only the eval harness.
- Milestone 3 (implementer): **Stage 4 dry-run row** (free, 2026-09-26, 112 frozen cases, run after commits 4–6; re-run after the review fixes). Planning built every rewrite request on every case in scope with no throw: 9 premises × 4 setup arms, and 44 single-player beat cases × 5 beat samples.
  - `Stage 4 candidates (isolated): 256 jobs {"setup":36,"beat":220}, est $3.62 (stage cap $4), at least 22 min` (before the review fixes, $3.66; the rewrite's schema descriptions got shorter).
  - Spend so far: $20.77 of $30 (Stage 4 $0.00 of $4).
  - Per Runbook invocation (`--role`/`--arms` dry runs), against the plan's DERIVED figures: 1. Sol low setup $1.44 (plan about $1.85); 2. Luna medium rewriteSlim $0.23 ($0.25); 3. gpt-4.1-mini rewrite $0.33 ($0.39); 4. gpt-4.1 setup $1.36 ($1.70); 5. verbosity low $0.12 ($0.12); 6. the full-scaffold hedge $0.14 ($0.12). The total is $3.62, against about $4.4.
  - The gap is mostly setup, and, as the Milestone 3 review corrects, mostly the estimator rather than the shorter rewrite. Estimates count prompt plus schema at 4 characters per token, and the setup schema bills at about 1.8, so each setup call reads about 6–7K input tokens low. Realistic uncached figures are about $1.7 (Sol) and $1.6 (gpt-4.1), and about $4.1 for Stage 4, over the cap as the plan expected (see Controversial Decisions). The zero-shot arm also drops the examples.
  - So the dry run fits the $4 cap in one invocation, although the real cost would not. The Runbook's six separate invocations are still the right order: one invocation would run both gpt-4.1 setup arms (priority 4) before the Luna turns (priority 2), because the runner runs setup before beats.
- Milestone 3 (implementer): **Privacy page and AI transparency record: checked, no change.** No production model, feature, prompt, schema, default or data flow changed. The rewrite, the message shaping and the warm-first runner live in the eval harness. `storyTextRewrite/` sits beside the production services but has no production caller.
- Milestone 3 (eval run): **Stage 4 smoke (Runbook step 2): all four calls valid, both GPT-6 calls wrote the cache, and the write covers the schema plus the fixed text.**
  - **Before the smoke:** rule B12 now names the label the story state renders ("Can be adjusted anytime") instead of "changeable in beat resolutions" (3ef52b9). The free dry run still builds the Stage 4 row: 256 jobs, est $3.62.
  - **The beat case:** `cont-6edd813c-t2-o0`: 1 player, game mode single-player, images on (template portraits), step 2 of 3 of a challenge thread.
  - **The records** (first attempt each; no 400, no timeout, no retry):

    | Arm | Case | Outcome | Input | Cached | Cache write | Reasoning | Output | Wait | Cost |
    |---|---|---|---|---|---|---|---|---|---|
    | `gpt-6-luna@medium/rewriteSlim` | `cont-6edd813c-t2-o0` | valid | 8,247 | 0 | 4,409 | 1,536 | 2,743 | 25.4 s | $0.0023 |
    | `gpt-4.1-mini@t0.2/rewrite` | `cont-6edd813c-t2-o0` | valid | 8,938 | 0 | 0 | 0 | 1,586 | 11.6 s | $0.0061 |
    | `gpt-6-sol@low/rewrite` | `setup-learn-lemonade` | valid | 18,192 | 0 | 18,094 | 54 | 5,263 | 65.6 s | $0.0981 |
    | `gpt-4.1@t0.2/rewrite` | `setup-learn-lemonade` | valid | 18,193 | 0 | 0 | 0 | 3,338 | 26.1 s | $0.0631 |

  - **The schema is in the cacheable prefix** (Run A's open question). The explicit breakpoint caches everything before the user message: the JSON schema and the fixed rules.
    - Setup: input minus write is 98 tokens, which is the per-call message alone (483 bytes: the player count, the game mode and the premise). The fixed text is 25,834 bytes, about 5–6K tokens, so about 12K of the 18,094 written tokens is the schema. The probe measured production's 1-player setup schema at 13.6K; the rewrite's descriptions are shorter.
    - Beat: input minus write is 3,838 tokens, which is the per-call message (18,603 bytes, 17,592 of them production's state) at 4.8 bytes per token. Production's prompt on the same case bills at the same rate: 37,581 bytes, about 7,840 tokens once the schema is taken out. So the 4,409 written tokens are the fixed text (5,006 bytes, about 1,040 tokens) plus the slim schema (about 3,330 tokens).
  - **What that means for cost (DERIVED from the price table):** a warm Sol setup call reads about 18.1K tokens at $0.20/M instead of $2.00/M, so its input drops from about $0.036 to about $0.004 per call. The first call of a line pays a $0.009 write premium. Output then dominates, at about $0.05 per call. A warm Luna turn reads 53% of its input from the cache.
  - **The rewrite is shorter on input:** Luna rewriteSlim 8,247 tokens against slim's 11,508 on the same case, and gpt-4.1-mini 8,938 against prod's 12,383 (both −28%). Setup is 18,192 against prod's 21,265 (−14%).
  - **The estimator undercounts Sol setup,** as the review note said: $0.098 measured against $0.084 estimated. gpt-4.1 came in under its estimate ($0.063 against $0.079), because its output was shorter than the borrowed figure.
  - **The smoke records are kept.** The four jobs count as finished, so invocation 1 plans 17 Sol calls and invocation 2 plans 87 Luna calls. If the default TTL expires before invocation 1, Sol's lemonade line writes a second time. The report's "writes per line" can then show 2 on that line, and the cause is the gap between runs, not a failed read.
  - **Spend after the smoke:** Stage 4 $0.17 of $4, total $20.94 of $30. Dry run now: 252 jobs, est $3.45.
- Milestone 3 (eval run): **Stage 4 paid invocations (Runbook step 3): four ran, the cap stopped the fourth at $3.99, and invocations 5 and 6 did not fit.** The records are in `DOCS/2026-09-26_gpt6-text-eval/calls.jsonl`, and each run rewrote `results.md`. The invocations ran one at a time, in the plan's order, and no cap was raised.
  - **Per invocation.** Spend is the ledger's, and the ledger books a hung call at its estimate.

    | # | Arms | Jobs | Estimate | Spent | Outcome |
    |---|---|---|---|---|---|
    | 1 | Sol low setup, with and without examples, 9 premises | 17 open (+1 smoke) | $1.36 | $1.73 ($1.32 replies, $0.41 for 5 hangs) | all 18 valid |
    | 2 | Luna medium rewriteSlim ×2 | 87 open (+1 smoke) | $0.23 | $0.30 ($0.20 replies, $0.10 for 38 hangs) | all 88 valid; 25 jobs needed a retry, and 4 needed a fourth attempt (one more than production allows) |
    | 3 | gpt-4.1-mini rewrite ×1 | 43 open (+1 smoke) | $0.32 | $0.20 | all valid on the first attempt |
    | 4 | gpt-4.1 setup, shrunk to 6 premises | 11 open (+1 smoke) | $0.83 | $1.59 ($0.73 for 10 replies, $0.86 for 3 runaways) | cap stop: 11 valid, 1 job open |
    | 5 | Luna medium verbosity low ×1 | 44 | $0.12 | – | not run: $0.01 left |
    | 6 | Luna medium rewrite, full scaffold ×1 | 44 | $0.14 | – | not run |

  - **Stage 4: $3.99 of $4** (the smoke's $0.17 included). The ledger total is $24.76 of $30; User Input Needed has the likely real figure.
  - **The shrink.** Before invocation 4, $2.39 + 18 × $0.09 = $4.01: over the cap, and past the plan's $2.35 threshold. So it ran on the plan's 6 premises (12 jobs, the smoke's lemonade job already done).
    - The open job is `setup-pretend-er-doctor` without examples: its one attempt ran away, and its retry did not fit.
    - So gpt-4.1 has 6 premises with examples and 5 without.
  - **Caching reads work.** The first line (Sol rewrite, 1 player) read 18,094 cached tokens on its second call (neo-tokyo) and on its third (er-doctor, on the third attempt after two hangs).
    - Sol: 6 lines and 6 writes, one per line. All 12 warm valid calls read the whole fixed prefix, and 66% of input tokens came from the cache on both arms.
    - Luna rewriteSlim: 5 lines. All 84 warm valid calls read the cache, 47% of input tokens. The smoke's line was still warm 20 minutes after its write (13:20 → 13:40 UTC).
    - The ending line's write probably came from a hung attempt. Its third attempt read 4,388 cached tokens that no recorded call wrote, and only hung calls carry no usage, so a hung call probably started (its prefill ran).
    - gpt-4.1-mini (implicit cache, no breakpoint): 38 of 43 calls read it, 58% of input tokens. gpt-4.1 setup: 14% with examples, 54% without.
  - **Hangs: 43, all on GPT-6.** Each is an `outcome` `timeout` at 300 s, retried, and left out of validity and waits.
    - Sol hung on 5 of 23 attempts and Luna on 38 of 126. No job was lost.
    - For comparison: Round 1 had 4 hangs in 1,309 GPT-6 calls, and Stage 3 none in 635 (09:49–10:24 UTC the same day).
    - Sol's 5 started 13:26:55–13:32:25, four of them within about a minute. Luna's 38 started 13:40:38–14:26:07 (the last timed out at 14:31:07).
    - Later calls on a cache line hung on 42 of 138 attempts, first calls on 1 of 11. Every first call started when an invocation began (13:20, 13:22, 13:25:46, 13:40:38), and hung calls record no usage, so this doesn't show that reading the cache hangs.
    - gpt-4.1-mini had none in 43 calls on the same split request.
  - **Runaways: 3 of 13 gpt-4.1 setup attempts hit the 32,768-token output limit** (`finishReason` `length`), at $0.27–0.30 each.
    - Each is a whitespace loop (spaces and `\r`; the co-founders one also `\t`) that starts inside a story element's `facts` array, right after its second fact.
    - Table SS enforces exactly 3 facts in the schema and took "Three" out of the description. So the model writes 2, the constrained decoder won't let it close the array, and it pads until the limit.
    - `junkChars` reads 0 on these, because it counts only replies that parse.
  - **My reading, not measured:** the GPT-6 hangs are probably the same loop.
    - Stage 4 is the first stage whose schemas enforce counts. Beats enforce 3 options, 3 interludes and 3 show-don't-tell points.
    - A hung call had started.
    - With no `maxTokens`, GPT-6's output limit lets a loop outlast the 300 s timeout.
    - A replay of a few hung cases with `max_completion_tokens` set would show where the loop starts. If this reading holds, the count enforcement, or the counts' removal from the descriptions, needs revisiting before any adoption.
  - No 400s, and no invalid replies other than the 3 runaways.
- Milestone 3 (eval run): **The v1 Round 3 page (slim against `rewriteSlim`, page id `291fb89390`) is superseded, unrated.** It was built and browser-checked as Runbook step 5. The count fix rebuilt Round 3 (the "Round 3 rebuilt" entry below), and the v1 page and key moved to `rating/superseded/round3-turns-v1.html` and `keys/superseded/round3-turns-v1-291fb89390.json`. `--score` reads only the top level of `keys/`, so the moved key no longer resolves; move it back if a v1 export ever turns up.
- Milestone 3 (eval run): **Empty interludes: the enforced interlude count shows in the v1 rewrite's output.**
  - 13 of 88 `gpt-6-luna@medium/rewriteSlim` outputs have a blank interlude: 12 with empty text (13 interludes in all, most with an empty `imageId` and source `none`) and one whose third interlude is a single space (`cont-8988006e-t4-o1` s1). `cont-8988006e-t3-o0` s1 (v1 Round 3 item 7) blanked its second and third, so it wrote one interlude, below B32's minimum of two. One more output (`cont-6edd813c-t3-o2` s1) has a blank third option. Slim and the gpt-4.1-mini rewrite have none (88 and 44).
  - Table BS enforces exactly 3 interludes, while rule B32 asks for 1 player interlude, 1–2 about elements and 0–1 world detail, which allows 2. When the model wants 2, it pads a blank third one.
  - This is the same mechanism as gpt-4.1's facts runaways: Luna escapes with an empty string instead of whitespace. It supports the reading that the enforced counts need revisiting.
  - No automatic check flags an empty interlude, so validity and the checks read 100% on it. The game would show a blank interlude slide (`Interlude.tsx` renders `text || ""`).
  - It showed on the v1 Round 3 page (3 of the 8 regular items and the repeat), one reason that page was rebuilt from the count fix.
- Milestone 3 (eval run): **Stage 4 headline numbers** (full report: `DOCS/2026-09-26_gpt6-text-eval/2026-09-26_stage4-report.md`).
  - **Spend:** Stage 4 $3.99 of $4 (first test $0.17, Sol setup $1.73, Luna turns $0.30, gpt-4.1-mini turns $0.20, gpt-4.1 setup $1.59). Inside it: $0.51 for 43 hung calls at their estimate and $0.86 for 3 gpt-4.1 runaways. Ledger total $24.76 of $30; about $26.1 if OpenAI billed the hangs as 300 s replies.
  - **Caching:** the explicit breakpoint caches the reply format plus the fixed rules. Read share 66% on Sol setups and 47% on Luna turns. Input per call $0.045 → $0.019 (Sol setup) and $0.0012 → $0.0005 (Luna turn). All 96 later calls that answered read their line's write.
  - **Hangs:** 43 of 149 GPT-6 attempts (Luna 38 of 126, Sol 5 of 23), against 4 in 1,309 in Round 1 and none in 635 in Stage 3. 25 of 88 Luna jobs needed a retry, 4 of them a fourth attempt.
  - **Enforced counts:** gpt-4.1 ran away on 3 of 12 first setup attempts (whitespace inside `facts` to 32,768 tokens). Luna left a blank interlude in 13 of 88 turns and a blank option in 1; Sol left blank items in 3 of 18 setups. The reference forms had none.
  - **Luna medium turns, slim → rewrite (88 pairs):** input 12,117 → 8,900 tokens, visible 1,600 → 1,327, reasoning 1,535 → 1,884, p50 26.6 → 26.4 s, p95 35.1 → 40.9 s, $0.0027 → $0.00225 per turn on replies only ($0.0034 with hangs at their estimate). Words 334 → 259, facts 3.20 → 3.47; sentences 96.6% → 81.8% and paragraphs 97.7% → 88.6%.
  - **The lead per single-player story** (rewrite turns, Stage 3's Luna low minimal planning, Sol low rewrite setup): $0.295 billed and $0.345 caching off on replies only; $0.449 and $0.499 with hangs at their estimate. Round 1's lead reads $0.411 on the same matched basis, Stage 3's $0.362. 60 s reading 48.5 s (added).
  - **Sol low setup:** median 62.5 → 79.2 s with examples, 77.6 s without; single-player 60.2 → 68.2 / 63.4 s, against the 57.6 s cap. Replies-only cost $0.105 → $0.082 → $0.075.
  - **gpt-4.1-mini turns, today → rewrite:** −19% uncached, 11 of 44 turns open with "You" (was all), sentences 61.4% → 31.8% and paragraphs 100% → 84.1%.
  - **Report corrections before hand-off.** Two independent checkers read the report against `calls.jsonl`, the outputs and the earlier reports. I corrected: the 4 turns past production's retries, the blank-item counts (13 and 1, not 12), the 176 s turn's blank run (30,601 characters, not 38,000), the hang windows, the usage-page window and its expected figures, Sol's waits without examples, Round 1's lead on the matched basis ($0.411), the cache-read inferences, the setup cache lines per player count, the runaways' whitespace mix, the bounty-hunter blanks (21 of 21 lists), gpt-4.1's waits with runaways, the "still over" single-player wording, the Round 3 picture count, the ±15 non-reading, the timeout trade-off, and the internal wording.
- Milestone 3 (eval run): **Privacy page and AI transparency record: checked, no change** (Stage 4 run). No production model, feature or data flow changed. The eval sent the frozen cases and premises to the same OpenAI models as Rounds 1 and 2; the rewrite, caching and warm-first runner live only in the eval harness.
- Milestone 3 (count fix): **Dry-run rows** (free, 2026-09-26, 112 frozen cases). Planning built every v2 request on every case in scope, with no throw.
  - The whole Stage 4 row: 201 open jobs (setup 25, beat 176), est $2.47. That is Stage 4b's 106 plus Stage 4's 95 leftovers: the verbosity arm (44), the hedge (44) and gpt-4.1's setups (7).
  - Invocation 1, `--role beat --arms gpt-6-luna@medium/rewrite2Slim`: 88 jobs, est $0.24, at least 7 min.
  - Invocation 2, `--role setup --arms gpt-6-sol@low/rewrite2,gpt-6-sol@low/rewrite2ZeroShot`: 18 jobs, est $1.52 (with examples 9 for $0.82, without 9 for $0.70), at least 4 min.
  - Spend: $24.76 of $30, Stage 4 $3.99 of $4 (the dry run shows the default cap; the flag raises it to $6 for one `--run`).
- Milestone 3 (count fix): **The blank-item check over the existing records reproduces the Stage 4 report's hand count exactly.**
  - Luna medium rewriteSlim: 14 of 88 (13 blank interludes and 1 blank option).
  - Sol low rewrite: 2 of 9 (co-founders, animal rescue). Without examples: 1 of 9 (bounty hunters).
  - 0 on every other arm, Stages 0–3 included: slim 0 of 88, Sol prod 0 of 36, Sol minimal 0 of 9, gpt-4.1 prod 0 of 36, gpt-4.1 rewrite 0 of 11, gpt-4.1-mini rewrite 0 of 44.
  - In a re-render of `results.md` (scratchpad only; the one in `DOCS/` is untouched, and the next `--run` rewrites it with the check), the variant section flags Luna rewriteSlim 100% → 84.1% and Sol rewrite 100% → 77.8% lower. It shows rewriteZeroShot at 77.8% → 88.9% raw, since its reference has one sample.
- Milestone 3 (count fix): **Privacy page and AI transparency record: checked, no change** (the build and the Stage 4b runs). The count fix, the new variants and the blank check live only in the eval harness. No production prompt, schema, model or default changed, and the runs sent the same frozen cases and premises to the same OpenAI models as the earlier stages.
- Milestone 3 (count fix): **Stage 4b smoke (real calls): both replies valid and clean. The request shape works and the cache writes. The turn hung once before it answered.**
  - **How it ran.** Two invocations from `server/`, each with `--stage 4 --prompt-state postfix --samples 1 --stage-cap 6 --over-target-reason "Owner approved 2026-09-26: fix the rewrite's forced counts, re-run Luna medium turns and Sol low setup"` and its own `--arms`. `budget-overrides.jsonl` has one entry per invocation, with its arms. The turn smoke (16:48 UTC) was already in the ledger when this session started. It came from an earlier attempt at this step that ended before it recorded anything. The job had finished, so I kept it and didn't run it again.
  - **The turn case:** `cont-8988006e-t4-o1`. Story 8988006e turn 4 hung on 8 of its first 10 Stage 4 attempts. This case and `cont-8988006e-t4-o0` each hung 3 times on one sample and answered only on a 4th attempt.
  - **The records:**

    | Arm | Case | Attempt | Outcome | Input | Cached | Cache write | Reasoning | Output | Wait | Cost |
    |---|---|---|---|---|---|---|---|---|---|---|
    | `gpt-6-luna@medium/rewrite2Slim` | `cont-8988006e-t4-o1` | 1 | timeout | – | – | – | – | – | 300 s | $0.0029 (estimate) |
    | `gpt-6-luna@medium/rewrite2Slim` | `cont-8988006e-t4-o1` | 2 | valid, `stop` | 10,297 | 4,660 | 0 | 1,812 | 3,353 | 31.8 s | $0.0023 |
    | `gpt-6-sol@low/rewrite2` | `setup-kids-animal-rescue` (2 players) | 1 | valid, `stop` | 19,939 | 0 | 19,815 | 41 | 5,558 | 74.2 s | $0.1054 |

  - **Caching.** The setup's first call wrote 19,815 of its 19,939 tokens: everything except the 124-token per-call message. The turn's first call hung, so it has no usage record. But its retry read 4,660 cached tokens. That is the whole v2 prefix: it is larger than any v1 line's write (3,748 to 4,628), and no other call is on its cache line (`f767cc22dfe5`). So the hung call wrote it, as Stage 4's ending line showed (DERIVED).
  - **The replies (read from `outputs/`).**
    - The turn has 3 options, 3 interludes, 2 show-don't-tell points and 4 facts. Nothing in it is blank. Its longest whitespace run is 11 characters. In the stored text, the model's indentation drifts after `plan`, but the JSON is well formed and parses as it should.
    - The setup has 7 story elements with 3 facts each, 3 shared and 3 player stats with 3 effects each, and 7 thread types. Each player has 3 identities, 3 backgrounds and 3 outcomes (1 own plus 2 shared). Nothing in it is blank, and its longest whitespace run is 11.
    - In `results.md`, both pass `noBlankItems`, `noWhitespacePadding` and every list-count check. The one miss is `noMetaWords` on the turn: its prose says "The milestone is concrete". That is one reply. v1 read 88.6% on that check and slim 90.9%.
  - **The hang, which one call can't settle.** v2's first attempt on this case hung for 300 s, just as v1's first three did, and its second answered in 31.8 s. The full run (87 turns) is where the hang rate gets read.
  - **Cost.** The smoke cost $0.11: $0.0052 for the turn, the hung call included at its estimate, and $0.1054 for the setup. $0.10 per setup holds as the rate to budget by hand. A line's first call pays the write premium: $0.0955 caching off, against a $0.091 estimate. Stage 4 is at $4.10 of the $6 raise, and the ledger total is $24.87 of $30. The dry run shows 104 Stage 4b jobs open (87 turns and 17 setups).
- Milestone 3 (count fix): **Stage 4b paid runs: the worded counts removed every blank item and almost all the hangs. But Luna still pads after a finished beat, now on 4 of 88 turns.**
  - **How it ran.** Four invocations from `server/`, one at a time, 17:08–17:33 UTC. Each had `--stage 4 --prompt-state postfix --stage-cap 6 --over-target-reason "Owner approved 2026-09-26: fix the rewrite's forced counts, re-run Luna medium turns and Sol low setup"`, its own `--arms` and cases, and a `--max-spend` guard. Each run rewrote `results.md`, and each appended its override to `budget-overrides.jsonl`. The records are in `calls.jsonl`. Controversial Decisions explains why step 3 ran in two parts.

    | # | Arms and cases | Jobs | Hand check before | Spent | Outcome |
    |---|---|---|---|---|---|
    | 1 | Luna medium `rewrite2Slim`, 44 single-player cases ×2 | 87 open (+1 smoke) | $4.10 + about $0.20 | $0.239 | all 88 valid; 4 jobs retried once |
    | 2 | Sol low `rewrite2` and `rewrite2ZeroShot`: lemonade, animal rescue, co-founders | 5 open (+1 smoke) | $4.34 + 5 × $0.10 = $4.84 | $0.518 | all valid on the first attempt |
    | 3 | the same arms, 5 of the other 6 premises | 10 | $4.86 + 10 × $0.10 = $5.86 | $0.621 | all valid on the first attempt |
    | 4 | the same arms, `setup-flexible-secret-society` | 2 | $5.48 + 2 × $0.10 = $5.68 | $0.133 | all valid on the first attempt |

  - **Spend.** Stage 4b cost $1.62 including the smoke ($1.51 for the four runs). Stage 4 is at $5.61 of the $6 raise, so $0.39 is left. The ledger total is $26.38 of $30. The dry run's 95 open Stage 4 jobs are Stage 4's leftovers only (the verbosity arm, the hedge and gpt-4.1's 7 setups).
  - **v1 (Stage 4) → v2, per arm:**

    | Arm | Attempts | Hangs | Runaways | Padded and recovered | Jobs retried | Replies with blank items |
    |---|---|---|---|---|---|---|
    | Luna medium turns | 126 → 92 | 38 → 3 | 0 → 0 | 1 → 4 | 25 → 4 (at most 4 → 2 attempts) | 14 of 88 → 0 of 88 |
    | Sol low setup, with examples | 13 → 9 | 4 → 0 | 0 → 0 | 0 → 0 | 3 → 0 | 2 of 9 → 0 of 9 |
    | Sol low setup, without examples | 10 → 9 | 1 → 0 | 0 → 0 | 0 → 0 | 1 → 0 | 1 of 9 → 0 of 9 |

    Luna's 92 attempts include the smoke's 2 and one connection error.
  - **Luna's hangs.** Each was a 300 s timeout on a first attempt, and each answered on its retry:
    - `cont-8988006e-t4-o1` s1 at 16:48:45 UTC (the smoke);
    - `end-8988006e-t4-o0` s1 at 17:08:43;
    - `synth-8988006e-t4-pregeneration_3_player1_1` s2 at 17:14:04.

    All three are story 8988006e turn 4, which hung on 8 of its first 10 v1 attempts. There was also one connection error (`cont-8988006e-t3-o2` s1, 17:12:54, after 37 ms), retried at once. No job needed more than 2 attempts in the eval. That is not a production result: the two padded replies past 180 s (below) finished inside the eval's 300 s, so production's retries of them were never observed. On v1, 4 jobs needed a fourth attempt.
  - **Padding after the beat closes.** Four v2 turns wrote a run of whitespace after the interludes list and the player object had closed, just before the reply's last brace:

    | Case | Whitespace characters | Output tokens | Wait |
    |---|---|---|---|
    | `cont-8988006e-t4-o2` s1 | 170,819 | 39,530 | 274.8 s |
    | `first-tpl-e401abf2-p1` s1 | 92,226 | 24,500 | 208.4 s |
    | `cont-8988006e-t4-o0` s2 | 27,415 | 8,975 | 68.2 s |
    | `end-8988006e-t4-o1` s1 | 8,980 | 8,598 | 54.2 s |

    - Three of the four are on story 8988006e turn 4. This is Round 1's production-form pattern: 3 of 714 turns, all on that same turn, each padded in the same place. It is not v1's run between two interludes.
    - The two slowest would have passed production's 180 s timeout and been retried. So in production terms, 5 of 88 v2 turns need a retry (the 3 hangs and those 2), against 25 of 88 on v1.
    - The padding may also be what the hangs were, if a hung call pads past 300 s. A hung call leaves no reply, so this is not proven.
  - **Blank items.** `noBlankItems` reads 100% on all three v2 arms, against 84.1%, 77.8% and 88.9% on v1. My own scan of the replies agrees: no blank string and no item with blank text anywhere. The same scan reproduces v1's 14, 2 and 1.
  - **List counts** (the checks that see an item left out rather than blanked):
    - Luna: every one of the 82 non-ending turns has 3 options, and the 6 endings have none. 71 turns write 3 interludes and 17 write 2 (`interludesTwoToFour` 100%; `threeInterludes` 80.7%, low by design). 2 turns write 2 show-don't-tell points.
    - Sol: every player of every setup has 3 identities and 3 backgrounds, every story element has 3 facts, and every setup has 7–8 elements.
    - Sol with examples has two count slips, both real content rather than blanks. `setup-pretend-er-doctor` (1 player) has 4 outcomes, 2 shared plus 2 of its own; on v1, neo-tokyo had 5. `setup-vent-berlin-flat` has 5 visible shared stats, two of them scores for a contested lease. So `threeOutcomes` and `sharedStats` read 88.9% against today's form.
    - Without examples, every setup check reads 100%.
  - **Luna v2 against slim** (88 pairs; v1 in brackets):
    - Tokens: visible 1,600 → 1,416 (1,327); reasoning 1,535 → 2,046 (1,884).
    - Waits: p50 26.6 → 32.0 s (26.4); p95 35.1 → 54.2 s (40.9).
    - Prose and facts: words 334 → 267 (259); facts 3.20 → 3.58 (3.47).
    - Cost per turn, replies only: $0.00264 ($0.00225), or $0.00226 without the 4 padded replies (corrected from $0.00229 in the owner report step: $0.18997 over the 84 unpadded replies). With hangs at their estimate: $0.0028 ($0.0034).
    - Cache read share: 47.6% (46.8%).
    - Checks lower than slim beyond noise: sentences 86.4% (81.8%), paragraphs 89.8% (88.6%), no meta words 87.5% (88.6%), no whitespace padding 95.5% (98.9%), second person 96.6% (100%), requested image used 97.7%, no image in the last paragraph 98.9% (94.3%), and `threeInterludes` 80.7% (by design).
    - Part of the slower waits is server speed (DERIVED): on its unpadded replies, v2 wrote 110 tokens a second, against 121 on v1 and 117 on slim. It also writes about 7% more output (median 3,451 against 3,215 tokens).
  - **Sol v2** (9 premises per arm; v1 in brackets). Each line was written once, and the cache read share was 66.3% with examples and 66.2% without. Every reading is over the setup caps (57.6 s median, 68.3 s p95).

    | | Median | p95 | Median by players (1 / 2 / 3) | $ per setup as booked |
    |---|---|---|---|---|
    | With examples | 80.0 s (79.2) | 111.1 s (98.3) | 77.2 / 79.6 / 108.6 s (68.2 / 78.1 / 83.7) | $0.0805 ($0.1194; $0.082 replies only) |
    | Without examples | 81.6 s (77.6) | 106.0 s (81.9) | 70.5 / 81.6 / 104.0 s (63.4 / 77.6 / 79.8) | $0.0726 ($0.0836; $0.075 replies only) |

    - Sol wrote about 70 tokens a second, against 80 in Stage 4 and 93 in Round 1 (DERIVED), so these waits carry server drift.
- Milestone 3 (count fix): **Round 3 rebuilt from the count fix, and checked in the browser (read after rating Round 3 if you want it blind).**
  - From `server/`: `npm run eval:text -- --rating-page turn --prompt-state postfix --arms gpt-6-luna@medium/slim,gpt-6-luna@medium/rewrite2Slim --items 8 --cases <the 18 cases>`. Free: it reads stored outputs only.
  - The 18 cases are the v1 page's pool (Controversial Decisions): the single-player turn cases that neither `keys/round1-turns-5e2a3f7862.json` nor `keys/round2-turns-891345004e.json` names. `cont-2ee343b6-t2-o1`, `cont-2ee343b6-t2-o2`, `cont-6edd813c-t3-o0`, `cont-6edd813c-t3-o1`, `cont-6edd813c-t3-o2`, `cont-7492b211-t2-o1`, `cont-7492b211-t2-o2`, `cont-8988006e-t2-o0`, `cont-8988006e-t2-o2`, `cont-8988006e-t3-o0`, `cont-8988006e-t3-o1`, `cont-8988006e-t3-o2`, `cont-8988006e-t6-o0`, `cont-8988006e-t7-o0`, `cont-8988006e-t7-o2`, `synth-7492b211-t2-pregeneration_1_player1_1-noimg`, `synth-8988006e-t3-pregeneration_2_player1_1-noimg`, `synth-8988006e-t7-pregeneration_6_player1_2`.
  - Page id `c4867b2d79`. The page is renamed to `rating/round3-turns.html`, and the key to `keys/round3-turns-c4867b2d79.json`. The v1 page and key moved to `superseded/` first; nothing else was cleared. All 8 items qualified, and the planner wrote no notes. The baseline (slim) sits at A on 4 items and at B on 4.
  - The items:
    - regular: turn-01 `cont-2ee343b6-t2-o1`, turn-02 `cont-8988006e-t7-o2`, turn-03 `cont-8988006e-t6-o0`, turn-04 `cont-2ee343b6-t2-o2`, turn-06 `synth-8988006e-t7-pregeneration_6_player1_2`, turn-07 `cont-8988006e-t3-o0`, turn-08 `cont-7492b211-t2-o1`, turn-09 `synth-8988006e-t3-pregeneration_2_player1_1-noimg`;
    - turn-05 is the control (slim sample 1 against sample 2) on `cont-6edd813c-t3-o0`, which was on neither earlier page;
    - turn-10 repeats turn-01, 9 items later, with the same labels.
  - So 5 items come from story 8988006e (2 of them synthetic, one with images off), 2 from 2ee343b6 and 1 from 7492b211. 7 show pictures, and turn-09 doesn't. The two 2ee343b6 items generate no new pictures, but both versions place pictures from the story's library. All are plain mid-thread turns, as on v1. 3 of the 8 cases were on the v1 page, which was never rated, so no rater sees a case twice.
  - Every v2 option on the page is its job's first attempt, and valid. None of the 4 padded replies or the 3 hung jobs is on it: they are on story 8988006e turn 4 and `first-tpl-e401abf2-p1`, which were on the earlier pages. The longest whitespace run in any option's reply is 14 characters.
  - **Blank items: none, on either version.** A jq scan of all 18 stored replies behind the page found no empty or whitespace-only list item and no item with blank text. The rendered page has no empty bullet. Turn-07 (`cont-8988006e-t3-o0`), where v1 blanked two of three interludes, now writes three.
  - **The tells that remain are real content.**
    - Interludes: v2 writes 2 on turn-02 and turn-04 (at A both times), and slim writes 3 on every item.
    - Length: v2's story text is shorter on all 8 regular items, 223–333 words against slim's 294–390 (56–89 fewer; image tags stripped).
    - Openings: 1 of the 8 v2 texts opens with "You", against 4 of slim's 8.
    - Options (3) and show-don't-tell points (3) are the same on every option.
  - **The browser check** (Playwright, with `rating/` only served on 127.0.0.1):
    - desktop (1440) and mobile (390) widths, with no horizontal scroll; at 390 the two options stack;
    - `n` and `p` move between items, and typing "np" into a note does not;
    - one option rated (Acceptable yes, rank 1, a note): it went to the page's storage, and a reload restored the rating, the note and the current item;
    - export: the page's own export code built `ratings-text-turn-c4867b2d79.json` with that rating. It was captured from the page rather than downloaded (Skipped Items). A reload restored the last-export time;
    - console: only the test server's favicon 404. The only requests were for the page itself, plus the check's own read of the export blob.
  - `--score` on the captured export found `keys/round3-turns-c4867b2d79.json`. Then I deleted the test scores and the export, and removed the test rating from the browser's storage. I checked the origin's storage was empty from a same-origin 404 page, because the rating page writes its state again whenever it loads. Then I closed the browser, stopped the server and deleted this run's `.playwright-mcp/` files. The three files from 2026-03-15 are untouched.
- Milestone 3 (count fix): **Stage 4b owner report: `DOCS/2026-09-26_gpt6-text-eval/2026-09-26_stage4-fix-report.md`.** Figures the earlier entries don't have (DERIVED from `calls.jsonl` and `results.md`, which was current at 17:33 UTC and not rewritten):
  - **Story 8988006e turn 4 is where v2's trouble sits.** On that turn, 6 of v2's 17 attempts (14 jobs) hung or padded, against 0 of slim's 14 and 5 of Round 1's 95 GPT-6 beat attempts (2 hangs, 3 padded). Elsewhere v2 had no hang and one padded reply (`first-tpl-e401abf2-p1`, which hung once in Round 1 on Luna none prod).
  - **The lead on v2** (Luna medium v2 turns, Luna low minimal planning, Sol low v2 setup with examples, 1 player): $0.328 billed and $0.379 caching off, replies only; $0.339 and $0.390 with hung and failed calls at their estimate; $0.295 and $0.346 without the 4 padded replies. Caching off per turn is $0.00302, 10% above slim's $0.00274, all of it from the 4 padded replies ($0.00264 without them, 4% below slim).
  - **60 s reading:** thread planning p95 7.6 s + v2 turn p95 54.2 s = 61.8 s, over by 1.8 s; 56.1 s on the 84 unpadded replies (turn p95 48.5 s, nearest rank as `percentile` computes it).
  - **Sol v2 single-player slowest:** 82.1 s with examples, 71.1 s without, both over the 68.3 s p95 cap (v1 without examples read 67.0 s, within). At Round 1's 93 tokens a second the medians would be about 61 s and 60 s, still over 57.6 s.
  - **Billing if hangs are billed:** v2's hang rate would add about $0.03–0.05 per story (v1: $0.36–0.61); Stage 4b's 3 hangs at most about $0.05 in total.
- Milestone 3 (count fix): **Stage 4b headline numbers, as the owner report states them after its check.**
  - **Spend:** Stage 4b $1.62; Stage 4 $5.61 of the $6 raise; ledger total $26.38 of $30 ($1.38 over the ~$25 target; about $27.7 if Stage 4's 43 hangs were billed).
  - **Fixed:** blank items 14 → 0 of 88 Luna turns and 3 → 0 of 18 Sol setups; hangs 43 of 149 → 3 of 110 GPT-6 attempts; no list left short; at most 2 attempts per job in the eval.
  - **Left:** padding after the beat closed on 4 of 88 Luna turns (slim and v1 none), 3 of them on story 8988006e turn 4, where 4 of v2's 17 attempts would have run past production's 180 s (about a 1% chance per turn there of failing all 3 production attempts, DERIVED as (4/17)³). Production would retry 5 of 88 v2 turns (v1: 25).
  - **Luna v2 against slim:** words 334 → 267, facts 3.20 → 3.58, "You" openings 48 → 9; p50 26.6 → 32.0 s, p95 35.1 → 54.2 s; $0.00274 → $0.00264 per turn billed (replies only), $0.00226 without the padded replies. v1 on the same basis (without its one padded reply) is $0.00212, so v2 is about 7% above v1.
  - **The lead on v2:** $0.328 billed, $0.379 caching off (replies only); $0.295 and $0.346 without the padded replies, below Stage 3's $0.362 on both. 60 s reading 61.8 s (56.1 s without the padded replies).
  - **Sol v2 setup:** every check 100% without examples, two count slips with examples; $0.0805 and $0.0726 per setup billed against $0.1053 today; every wait reading over the setup caps.
- Milestone 3 (count fix): **Report corrections before hand-off.** Independent checkers read the fix report against `calls.jsonl`, the outputs, `results.md`, `arms.ts` and the Stage 4 report. Corrected:
  - the Round 3 length tell is 56–89 words, not 57–89 (item 9: 329 against 273), here too;
  - "every Sol setup median is over the cap, today's form included" now names Stage 4's 9 premises and gives Round 1's within-cap 55.2 s single-player reading beside it;
  - "no turn would fail in production" became "at most 2 attempts in the eval", with the two unobserved production retries and the turn-4 rate;
  - the caching-off cost rise over slim is the padded replies, not the reasoning, and v2 is compared with v1 on the same unpadded basis;
  - the blind-rating note now lists the sections that give the versions away (1, 3, 4, 5, 8 and 11) and sends the rater to section 9 only;
  - section 2 now carries the turn-4 replay, a production output cap beside the timeout, and says the verbosity arm, the hedge and gpt-4.1's setups are still on the `exact` counts and that the $0.39 needs the owner's go-ahead;
  - the list-count checks' new findings are stated as new (Sol v1 neo-Tokyo's 5 outcomes, which the Stage 4 report read as "all pass"; gpt-4.1 v1's three-outcome misses);
  - v1's one padded reply is no longer counted as the same after-the-end pattern;
  - "without examples is the better form" is now a cost reading, with the play-test as the quality check;
  - wording: the runaway sentence, the retry column's label, "a warm call", and the results file's post-fix caps (unchanged since Round 1).
  - Rejected in part: the checker's turn-4 failure estimate of about 4% per turn, (6/17)³. It counted the two padded replies that finished in 54 and 68 s, which production's 180 s timeout would not cut off; the report uses 4 of 17 (about 1%). And gpt-4.1 v1 without examples misses the three-outcome count on 4 of 5 setups, not 1 of 5 (the results file reads 20% passing).
  - The Stage 4 report now points to the fix report under its header, and its Round 3 note and section 9 link point to `rating/superseded/round3-turns-v1.html`.
- Milestone 3 (count fix): **Privacy page and AI transparency record: checked, no change** (the report and docs step). No production model, feature, prompt, schema, default or data flow changed; this step edited only the eval's reports, `.context/text-model-eval.md` and this file.

## Suggested Follow-Up Work

- Milestone 1: The call logger keeps a start entry for any run that ends without an end or error callback (an abort). That is negligible today. Revisit when progressions become cancellable (`registerPendingProgression`).
- Milestone 1: `run.ts` is 476 lines: the CLI plus six modes. If Stages 3 and 4 add modes, move each mode into its own module.
- Milestone 1: A seeded or idempotent thread resolution would let the eval re-resolve threads at replay time, instead of freezing states. Not needed now.
- Milestone 1: `.context/ai-transparency.md` could name the new call and turn logs in its processors and data section. That depends on the privacy-page decision above.
- Run A: The rating page repeats the instructions above every item. Now that the item bar is sticky, the instructions could fold into a `<details>` after the first item.
- Run A: Probe full completions do not record `usageFields`, and a refusal was never provoked. A deliberately borderline filter premise would show how a refusal surfaces through the production path.
- Milestone 2 (planner): The beat's ±15 cap per modifier against a stat's "major" ±20 effect: a remaining cross-role mismatch for the owner or Stage 4.
- Milestone 2 (planner): Pipeline chains on multiplayer analysis cases feed no gate (the 60 s gate reads single-player turns only). Leaving them out of Stage 1–2 would save money.
- Milestone 2 (planner): The `<premise>` and `<feedback>` tags are not escaped, so a premise containing `</premise>` would close the tag early. That is low risk, since the content filter screens premises first; worth one line in Stage 4.
- Milestone 2 (planner): `createSetupPrompt` and `createIterationPrompt` take a `maxTurns` they never use.
- Milestone 2 (planner): Waits count each attempt alone. If Stage 1–2 shows re-sends above about 1%, report the summed wait per call for the 60 s gate.
- Milestone 2 (implementer): **Split `server/src/evals/textModelEval/resultsReport.ts` (646 lines) by responsibility before Stage 3 or 4 adds anything.** This task is ready to queue.
  - `armStats.ts`: `ArmStats`, `computeArmStats`, `statsFor`, `costReading`, `uncachedCost`, `percentile` and `weightedQuantile`.
  - `gateReadings.ts`: `GameplayConfig`, `storyCost`, `gates` with its reading helpers, `setupReading`, the per-story call counts and the caps constants.
  - `resultsReport.ts` keeps `renderResults` and the view and validity tables.
  - `resultsReport.test.ts` would import from the new modules. There would be no re-exports.
- Milestone 2 (implementer): `run.ts` `armRefs` defaults a rating page's arms to prompt state `prefix`. Post-fix pages need `--prompt-state postfix` or `postfix:<armKey>` refs. Consider defaulting to `postfix` now that `--run` refuses `prefix`.
- Milestone 2 (eval run): **A shorter turn timeout for GPT-6 in production.** Four Luna turn calls hung for 300 s, and production would wait 180 s before retrying. Luna medium's normal p95 is 42 s and its 3-player p95 is 62 s. So a 90–120 s beat timeout for gpt-6 models would cut the worst wait by about half without cutting off normal replies. It is a small change in `PRODUCTION_TIMEOUT_MS`, and it needs the owner's go-ahead, since it changes production behaviour.
- Milestone 2 (eval run): **`results.md` pairs each candidate beat arm with the same-effort analysis arm** (`configsFor`), but the lead is Luna medium beats with Luna low analysis. The round-1 report computed the cross pairs with the harness's own `storyCost`/`gates` in a throwaway test. A gameplay view keyed by (beat arm, analysis arm) would make this reproducible. It belongs with the planned `resultsReport.ts` split.
- Milestone 2 (eval run): **`results.md` has no setup waits by player count,** although single-player vs group decides whether Sol low fits the cap (55.2 s vs 63–75 s median). The same view should show a candidate against today's production (Run A) as well as the post-fix baseline, since the owner's caps name Run A's figures.
- Milestone 2 (eval run): **Price multiplayer estimates by player count** (`estimateCall` uses one median over all player counts; see Implementation Issues).
- Milestone 2 (eval run): **Report hangs as their own reading:** count of `timeout` attempts per arm, and the summed wait per call including the hung attempt. Today they are visible only in `calls.jsonl`. Stage 4 adds a reason: the runner gives a timeout 3 retries, production 2, so the reading should also count jobs that needed more attempts than production allows (4 of 88 Luna rewrite turns did).
- Milestone 2 (eval run): **The distinct-openings metric depends on how many turns an arm has** (a count of distinct two-word openings). It could be read per sample, or on a fixed-size draw, so arms with 19, 140 and 203 turns compare fairly.
- Milestone 2 (implementer): `SwitchPromptService.createInstructionsSection` now has three example-output branches (opening multiplayer, later multiplayer, single-player). If Stage 4 adds another, move the examples into a map keyed by situation.
- Milestone 3 (planner): Delete `server/src/game/services/storyTextTrims.ts` and its test once Stage 3 is decided and Stage 4's rewrite supersedes it.
- Milestone 3 (planner): The optional "facts after the text" variant (A6 `factsAfterText`) and a `statGroups` trim for story setup were not run.
- Milestone 3 (planner): Automatic checks for repeated options within a thread and for text–facts agreement. The research names both as what trims might hurt, and today only the rating sees them.
- Milestone 3 (eval run): **Share one paragraph normaliser between the client and the eval.** `server/src/evals/textModelEval/playerText.ts` is a copy of `normalizeStoryText` in `client/src/game/utils/storyTextProcessor.ts`, because the server cannot import client code. Moving the function to `core/utils/` and importing it from both would remove the copy. That touches production client code, so it was left for a normal build with a visual check.
- Milestone 3 (eval run): **`checkThread` could check that each thread's `outcomeId` exists in the story** (it checks only duration and steps). The switch check already does this for flavor switches. Case `thread-tpl-e401abf2-p1-t1` would fail it on every arm.
- Milestone 3 (eval run): **A rewrite on the minimal turn form,** if Round 2 supports minimal over slim (Stage 4 built on slim). Keep the minimal planning forms on adoption: they lost nothing measurable and are about 30–55% shorter. Stage 4's rewrite brought the fact count back (3.20 → 3.47), so the "facts after the text" probe (A6) matters less than Stage 3 suggested.
- Milestone 3 (planner): A multiplayer beat rewrite, measured, before any multiplayer adoption.
- Milestone 3 (planner): Rewrite and cache the switch and thread analysis calls (their prompts are about 6K input tokens each).
- Milestone 3 (planner): Cache-aware estimates in `pricing.ts`, once Stage 4 has measured the read shares per role.
- Milestone 3 (planner): On adoption: move the message shaping to `shared/llm/` beside the factory, and decide an explicit cache TTL there (a production request-shape change, the owner's call).
- Milestone 3 (planner): A Luna low rewrite arm, the next cheaper turn arm (about $0.1).
- Milestone 3 (review): **Price the JSON schema at its real density in the estimates** (about 1.8 characters per token, not 4), or borrow measured input tokens along the reference chain as `measuredFor` does for outputs. Setup estimates read 28–32% low on input today. This changes every stage's estimates and the runner's reservations, so it wants its own change.
- Milestone 3 (eval run): **An eval-only output cap for replays** (`max_completion_tokens` on `--run`, recorded on the call). The runner has none, so a hung case can't be replayed to see where a loop starts.

## Round 0 play fixes (implementer)

Unit 1 (turn replies keep what they write, TR-1 to TR-10). Decisions beyond `.plans/2026-09-27_play-fixes-round0.md`:

- **Repair kinds** (`server/src/game/services/beatRepairs.ts`), which unit 5 counts as `repair:<kind>`: `statIdSeatForm`, `statGroupMoved`, `statChangeAmbiguous`, `statChangeUnknown`, `offLadderValue` (note), `factRefiled`, `introductionDropped`, `milestoneGroup`, `milestoneIdMapped`, `milestoneDropped`, `milestoneAmbiguousId` (note), `milestoneFromPlan`, `milestoneFromPlanSkipped` (note), `optionType`. One stat change can carry two repairs (a seat form filed under `shared` counts `statIdSeatForm` and `statGroupMoved`); a dropped change counts only its drop.
- **Notes, not repairs:** an outcome id held in two lists (the template's problem, not the reply's) and a planned milestone that could not be used (nothing in the reply changed). Unit 5's `noRepairs` ignores notes, as the plan says for off-ladder values.
- **Unknown milestone ids are mapped only on turns that may add milestones** (the ending, a switch after the first beat). On any other turn there is no just-ended thread, so an unknown id is dropped.
- **Several ended threads on one outcome** (parallel threads pushing one shared outcome): the reply's milestones on that outcome are taken to cover those threads in plan order, and the rest get their planned milestones.
- **Seat forms:** a seat form naming a seat that is not in the story (`player3_energy` in a two-player story) is dropped as unknown; in single player a player stat under any seat goes to player1 (`statGroupMoved`).
- **Introductions of player slots** (`player2` introduced to player1) are dropped with the other unknown ids, as the plan's rule reads: slots are not story elements. The prompt's "introduced to" list then no longer shows them.
- **TR-10 log line:** `[PlayerManager] Filled <n> background stat value(s) that <slot>'s background left out` (count and seat, no stat ids).
- **Shared code:** `isPlayerBeat` and `canAddMilestones` are exported from `storyTextSteps.ts`, so the schema and the repair read one rule each. `expectedOptionType` in `beatRepairs.ts` is a copy of the eval's until unit 5 imports it. Test fixtures `stat()` and `outcome()` are in `server/tests/helpers/textFixtures.ts` for the later units.
- **Dry run:** after unit 1, `npm run eval:text` (no `--run`) builds every stage; stages 0-3 have no pending jobs (all stored), Stage 4 plans its 95 jobs. No anchored passage changed in this unit.
