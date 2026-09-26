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

## Skipped Items

- Milestone 1: **the paid Stage 0 steps** (probe, `--build-cases`, the pre-fix baseline, the results headline numbers), as instructed. They are the next step. The free dry run was run.
- Milestone 1: **Playwright layout check of the rating pages.** No Playwright tool was available in this session. Preview pages built from stored material are ready to open:
  - `file:///D:/Projects/chosenpath/DOCS/2026-09-26_gpt6-text-eval/rating/preview/text-turn-e2074b2786.html`
  - `file:///D:/Projects/chosenpath/DOCS/2026-09-26_gpt6-text-eval/rating/preview/text-setup-3a1b662bcc.html`

  Check desktop and mobile, `n`/`p` keys, export, reload (autosave) and the console.
- Milestone 1: **the "guard can fail" proof.** The plan was to disable the blinding scan, the stage cap, the creator-field strip and the log-tag allow-list one at a time, confirm a test goes red, then restore. The environment's safety classifier refused the temporary guard-disabling edits, so this was not done. Tests for each guard exist (`rating.test.ts`, `armsBudget.test.ts`, `cases.test.ts`, `usageRecorder.test.ts`). The disable-and-see-red check needs a person.
- Run A: **Rating-page trial, what was not exercised.** Multi-option ranking, the repeated item and the baseline-against-baseline item need two arms or two baseline samples, so they wait for the post-fix baseline. The turn page was not trialled; the task asked for the setup set.
- Milestone 2 (eval run): **Stages 3 and 4 were not started;** they were out of scope for this run. The owner's ratings come first.
- Milestone 2 (eval run): **Setup page reload check.** The Playwright connection dropped just after the export, before the reload step. Autosave was shown instead by the ratings surviving the browser relaunch, and by a full reload on the turn page (ratings, current item and last-export time all restored).
- Milestone 3 (implementer): **Runbook steps 3–6 of the Stage 3 plan are not done:** the four paid runs, the Round 2 page and its check, and the owner report. The task said not to run paid stages. The dry run puts Stage 3 at $2.56, under the plan's $2.75 shrink threshold, so step 2 needs no shrink and the runs can start as written: setup, then beats, then analysis, then chains, all with `--stage 3 --prompt-state postfix`. No rating page was built, so no visual check happened.
- Milestone 3 (eval run): **No visual check of the Round 2 page.** The Playwright MCP server was disconnected. Instead, I served `rating/` (and not `keys/`) on 127.0.0.1 and ran a throwaway Jest test against the served HTML. It checked:
  - 14 items: 12 regular, the repeat of turn-01 at turn-14 at least 3 items apart, and the today-against-today control at turn-07 with samples 1 and 2 on an unused case;
  - 3 options per regular item, each with the same three arms, at sample 1, on a single-player case;
  - the baseline at A, B and C four times each;
  - every option with its Acceptable?, rank and note controls, a title, at least 3 paragraphs, and 3 options (endings excepted);
  - `htmlLeaks` clean, no leak words in the fixed text, and no network references.

  A synthetic export was then scored with `--score`. The test, the export and the scores were deleted. Layout, the `n`/`p` keys, reload and the in-browser export were not exercised; the page template is unchanged since Round 1's browser check.
- Milestone 3 (planner): **No Round 3 setup page.** Test plan §4.5 judges the setup rewrite by the automatic checks and the play-test.
- Run A: **The 29–58 s gaps between local pregeneration files** (test plan §2.6) were not investigated. Today's text calls take about 10–17 s per turn, and pregeneration runs its options in parallel. Production `[TurnTiming]` lines will show the real pregeneration time.

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

## Suggested Follow-Up Work

- Milestone 1: The call logger keeps a start entry for any run that ends without an end or error callback (an abort). That is negligible today. Revisit when progressions become cancellable (`registerPendingProgression`).
- Milestone 1: `run.ts` is 476 lines: the CLI plus six modes. If Stages 3 and 4 add modes, move each mode into its own module.
- Milestone 1: A seeded or idempotent thread resolution would let the eval re-resolve threads at replay time, instead of freezing states. Not needed now.
- Milestone 1: `.context/ai-transparency.md` could name the new call and turn logs in its processors and data section. That depends on the privacy-page decision above.
- Run A: **Stage 4: is the schema in the cacheable prefix?** The schema is 64% of a setup call's input and about a third of a 1-player beat's. Whether explicit caching can cover it decides how much Stage 4 saves.
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
- Milestone 2 (implementer): Resuming a job that stopped mid-retry restarts at attempt 1 with the same `callId`. That overwrites `outputs/<callId>.json`, and `modelAttemptsByStep` would see two attempt-1 records for that call. This was already true of transport retries, and re-sends make it a little more likely. It is low risk, since resumes are rare.
- Milestone 2 (eval run): **A shorter turn timeout for GPT-6 in production.** Four Luna turn calls hung for 300 s, and production would wait 180 s before retrying. Luna medium's normal p95 is 42 s and its 3-player p95 is 62 s. So a 90–120 s beat timeout for gpt-6 models would cut the worst wait by about half without cutting off normal replies. It is a small change in `PRODUCTION_TIMEOUT_MS`, and it needs the owner's go-ahead, since it changes production behaviour.
- Milestone 2 (eval run): **`results.md` pairs each candidate beat arm with the same-effort analysis arm** (`configsFor`), but the lead is Luna medium beats with Luna low analysis. The round-1 report computed the cross pairs with the harness's own `storyCost`/`gates` in a throwaway test. A gameplay view keyed by (beat arm, analysis arm) would make this reproducible. It belongs with the planned `resultsReport.ts` split.
- Milestone 2 (eval run): **`results.md` has no setup waits by player count,** although single-player vs group decides whether Sol low fits the cap (55.2 s vs 63–75 s median). The same view should show a candidate against today's production (Run A) as well as the post-fix baseline, since the owner's caps name Run A's figures.
- Milestone 2 (eval run): **Price multiplayer estimates by player count** (`estimateCall` uses one median over all player counts; see Implementation Issues).
- Milestone 2 (eval run): **Report hangs as their own reading:** count of `timeout` attempts per arm, and the summed wait per call including the hung attempt. Today they are visible only in `calls.jsonl`.
- Milestone 2 (eval run): **The distinct-openings metric depends on how many turns an arm has** (a count of distinct two-word openings). It could be read per sample, or on a fixed-size draw, so arms with 19, 140 and 203 turns compare fairly.
- Milestone 2 (implementer): `SwitchPromptService.createInstructionsSection` now has three example-output branches (opening multiplayer, later multiplayer, single-player). If Stage 4 adds another, move the examples into a map keyed by situation.
- Milestone 3 (planner): Delete `server/src/game/services/storyTextTrims.ts` and its test once Stage 3 is decided and Stage 4's rewrite supersedes it.
- Milestone 3 (planner): The optional "facts after the text" variant (A6 `factsAfterText`) and a `statGroups` trim for story setup were not run.
- Milestone 3 (planner): Automatic checks for repeated options within a thread and for text–facts agreement. The research names both as what trims might hurt, and today only the rating sees them.
- Milestone 3 (implementer): **If Stage 4 adds a third matrix, split `server/src/evals/textModelEval/arms.ts` in two.** Prices and estimates (`PRICES`, `costFromUsage`, `estimateCall`, `outputTokensPerSecond` and the §2.2 tables) would go to `pricing.ts`. The stage matrices and key formats would stay in `arms.ts`. Today the two concerns share a file of about 330 lines, and every stage adds to the matrix part.
- Milestone 3 (implementer): `variantComparison.ts` both computes and renders the Stage 3 section, as the plan placed it. If Stage 4 reuses the pairing (rewrite against full), move `renderVariantComparison` into `resultsReport.ts`. That puts all rendering in one module and leaves the comparison as pure readings.
- Milestone 3 (eval run): **Share one paragraph normaliser between the client and the eval.** `server/src/evals/textModelEval/playerText.ts` is a copy of `normalizeStoryText` in `client/src/game/utils/storyTextProcessor.ts`, because the server cannot import client code. Moving the function to `core/utils/` and importing it from both would remove the copy. That touches production client code, so it was left for a normal build with a visual check.
- Milestone 3 (eval run): **`checkThread` could check that each thread's `outcomeId` exists in the story** (it checks only duration and steps). The switch check already does this for flavor switches. Case `thread-tpl-e401abf2-p1-t1` would fail it on every arm.
- Milestone 3 (eval run): **Stage 4 options from Stage 3:** start the rewrite from the slim or minimal turn form, whichever Round 2 supports, and keep the minimal planning forms. Planning lost nothing measurable and is about 30–55% shorter. The fewer established facts (−9%) on reasoning efforts is the one thing to watch; a "facts after the text" layout (A6) is the planned probe for it.
- Milestone 3 (planner): A multiplayer beat rewrite, measured, before any multiplayer adoption.
- Milestone 3 (planner): Rewrite and cache the switch and thread analysis calls (their prompts are about 6K input tokens each).
- Milestone 3 (planner): Cache-aware estimates in `pricing.ts`, once Stage 4 has measured the read shares per role.
- Milestone 3 (planner): On adoption: move the message shaping to `shared/llm/` beside the factory, and decide an explicit cache TTL there (a production request-shape change, the owner's call).
- Milestone 3 (planner): A Luna low rewrite arm, the next cheaper turn arm (about $0.1).
