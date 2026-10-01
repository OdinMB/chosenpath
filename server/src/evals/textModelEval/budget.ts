import { FEEDBACK_STAGES, STAGES, type Stage } from "./arms.js";

export { FEEDBACK_STAGES };

/*
 * The spend caps. Owner (2026-09-26): target about $25 for the whole
 * evaluation, a hard cap of $30 (below the owner's standing ceiling of $50),
 * extra spend only when obviously useful and recorded. Going a little over
 * $25 is justified because the owner explicitly prioritised Sol for story
 * setups, and setup inputs are 21-23K tokens with the schema, not the 15K
 * the plan assumed. The owner raised the hard cap to $33 on 2026-09-27, for
 * the setup and turn rounds after the Round 0 play fixes, to $40 on
 * 2026-09-28, for the missing steps after the owner's feedback of that day
 * (going on although the stalled Stage 4 calls may have been billed), and to
 * $42 on 2026-09-30, for a second round of whole-story playthroughs on
 * production's current code (the owner OK'd "a few more dollars to do useful
 * playthroughs" and the coordinator set $42: the ledger read $37.24, so the
 * $40 left $2.76, about $1.46 with the stalled Stage 4 calls on top), and to
 * $45 on 2026-10-01, for the fixes the owner decided that day and the
 * measurements they need (the owner: "do all the fixes and the measurements
 * needed for them", "few bucks don't matter. I just want to make sure that we
 * stay frugal and only run what's needed"; the ledger read $39.94, so the $42
 * left $2.06, about $0.76 with the stalled Stage 4 calls on top), and to $48
 * on the evening of 2026-10-01, for round 3's open defects (the status note's
 * decision A, which the coordinator settled as everything, (d): the no-call
 * fixes, both group changes measured, the seal, the money setup rule and turn
 * line, the result-words line and a full confirming round, about $2 more than
 * the $45 left; under the owner's standing instructions "do all the fixes and
 * the measurements needed for them", "Few bucks don't matter. I just want to
 * make sure that we stay frugal and only run what's needed" and "No need to be
 * more frugal than before"; the ledger read $43.61, so the $45 left $1.39,
 * about $0.09 with the stalled Stage 4 calls on top). The
 * stage caps are $8 / $13 / $3 / $4 for Stages 0 to 4, $3 / $2 / $1.20 for
 * the setup rounds, the turn rounds and the migration check, and $0.10 /
 * $0.60 / $0.10 / $0.40 / $0.40 / $0.60 / $0.40 / $1.40 / $0.70 / $0.15 / $0.10 / $0.08 / $0.70 / $0.40 / $0.25 / $1.20 / $0.39 / $0.26 / $0.26 / $0.195 / $0.195 / $0.195 / $0.195 / $0.78 / $0.39 / $0.43 / $0.60 / $0.60 / $0.85 / $1.50 / $1.00 for the feedback
 * workflow's runs (STAGE_CAP_REASONS says why); a stage cap above its default needs a
 * recorded reason, and the global cap can only be lowered. The probe and case
 * building count as Stage 0. The content-filter check (--filter-check,
 * filterCheck.ts) is its own ledger stage, "filter", capped at $0.30: its
 * calls cost fractions of a cent, and it has no --run stage.
 */

/** A stage of the spend ledger: the --run stages plus the filter check. */
export type LedgerStage = Stage | "filter";
export const LEDGER_STAGES: LedgerStage[] = [...STAGES, "filter"];

export const DEFAULT_STAGE_CAPS: Record<LedgerStage, number> = {
  "0": 8,
  "1-2": 13,
  "3": 3,
  "4": 4,
  "setup-rounds": 3,
  "turn-rounds": 2,
  migration: 1.2,
  filter: 0.3,
  "plan-refresh": 0.1,
  reruns: 0.6,
  "setup-retests": 0.1,
  groups: 0.4,
  "form-gate": 0.4,
  "final-check": 0.6,
  "stage-scoping": 0.4,
  "options-continuity": 1.4,
  "options-o2": 0.7,
  "planner-v2e": 0.15,
  "ending-state": 0.1,
  runaway: 0.08,
  playthroughs: 0.7,
  "choice-result": 0.4,
  "choice-line-sp": 0.25,
  "playthroughs-2": 1.2,
  "outcome-settled": 0.39,
  "recorded-result": 0.26,
  "lever-direction": 0.26,
  "parallel-threads": 0.195,
  "challenge-results": 0.195,
  "kids-turns": 0.195,
  "money-adds-up": 0.195,
  "late-pacing": 0.78,
  "kids-ages": 0.39,
  // Its estimate plus 30% ($0.36), raised to $0.43 for its fix-and-retest's second sample (STAGE_CAP_REASONS)
  "group-levers": 0.43,
  "short-replies": 0.6,
  "runaway-2": 0.6,
  "options-o2c": 0.85,
  // Its estimate plus 30% ($1.30), raised to $1.50 for its fix-and-retest's runs (STAGE_CAP_REASONS)
  "pacing-clues": 1.5,
  "playthroughs-3": 1,
};
/**
 * The owner's hard cap: $30, raised to $33 on 2026-09-27, to $40 on 2026-09-28, to $42 on 2026-09-30 (more playthroughs),
 * to $45 on 2026-10-01 (the fixes of that day and the measurements they need; "few bucks don't matter") and to $48 on the
 * evening of that day (round 3's open defects, decision A settled as everything: "do all the fixes and the measurements
 * needed for them", "no need to be more frugal than before").
 */
export const HARD_CEILING = 48;
export const DEFAULT_GLOBAL_CAP = HARD_CEILING;

/** The ledger total when the round stages opened (2026-09-27): $26.39 of the then $33 hard cap, $6.61 left. */
export const LEDGER_WHEN_ROUNDS_OPENED = 26.39;

/** The ledger total when the feedback workflow's stages opened (2026-09-28): $31.99 of the $40 hard cap. */
export const LEDGER_WHEN_FEEDBACK_OPENED = 31.99;

/**
 * The ledger total when the second playthroughs' review opened its fix stages (2026-09-30): $37.99 of the $42 hard cap,
 * the stages before it at what they spent. Each fix is capped at its estimate plus 30%, the workflow held to about
 * $2.40; the caps fit the $42 with the stalled Stage 4 calls on top.
 */
export const LEDGER_WHEN_REVIEW_OPENED = 37.99;

/**
 * The ledger total when the owner's decisions of 2026-10-01 opened their measurements: $39.94 of the $45 hard cap. Each
 * stage is capped at its estimate plus 30%; the caps fit the $45 with the stalled Stage 4 calls on top.
 */
export const LEDGER_WHEN_DECISIONS_OPENED = 39.94;

/**
 * The ledger total when the hard cap went to $48 for round 3's open defects (decision A, the evening of 2026-10-01):
 * $43.61, every stage before it closed at what it spent; $1.39 was left under the $45, about $0.09 with the stalled
 * Stage 4 calls on top. Each paid run still gets its own stage, cap and reason, a smoke first and a dry-run count.
 */
export const LEDGER_WHEN_DECISION_A_OPENED = 43.61;

/**
 * What the ledger may not record: Stage 4's 43 hung GPT-6 calls are booked at
 * their estimate, and if OpenAI billed them as 300 s replies the real total is
 * about $1.3 higher (open since 2026-09-26; the owner went on regardless on
 * 2026-09-28). The feedback stages' caps fit the $40 with it on top.
 */
export const UNRECORDED_STAGE4_USD = 1.3;

/** Why each stage's cap is what it is (printed by the dry run beside the spend). */
export const STAGE_CAP_REASONS: Record<LedgerStage, string> = {
  "0": "probe, case building and both baselines (owner, 2026-09-26)",
  "1-2": "the model and effort matrix of Round 1 (owner, 2026-09-26)",
  "3": "the Stage 3 trims; closed with $2.26 spent",
  "4": "the Stage 4 rewrite; closed, its 4b count fix ran on the owner's one-off $6 raise",
  "setup-rounds":
    "coordinator, 2026-09-27: setup rounds 1 to 3 on Luna low, with Sol low in round 1 (about $0.95 for nine premises) and a two-sample Luna noise run per round (about $0.11); the setup doc's three rounds came to $2.63; coordinator, 2026-09-29: the Casablanca sentence's retest (setupR3c, four Luna low setups, about $0.02-0.03) and its second (setupR3d six times on Casablanca and production's form four more, about $0.065) from what is left",
  "turn-rounds":
    "coordinator, 2026-09-27: turn rounds 1 and 2 on Luna medium turns and Luna low planners, with the judged checks and their calibration (turn doc: about $0.90), plus retries and cold caches",
  migration:
    "production's GPT-6 defaults on today's prompts at two samples, and the single-player chains: dry run $0.75, plus AI Iteration (--role iteration, about $0.02) and setup estimates that read about 30% low",
  filter: "the content filter's fixed test set; its calls cost fractions of a cent",
  "plan-refresh":
    "coordinator, 2026-09-28 (the owner's feedback, $40 hard cap): planner v2c's chapter plans on the planning cases, which the reruns' chapter turns are written from; about $0.0013 a plan, 19 plans a sample (planner v2's 38 plans at two samples came to $0.049)",
  reruns:
    "coordinator, 2026-09-28: turn round 1's page rebuilt with new outputs (the framed chapter turn on planner v2c's plans and today's form beside it, chapter steps and chain openings) and their judged checks; round 1's two turn forms and chains came to about $0.80 at two samples",
  "setup-retests":
    "coordinator, 2026-09-28: the setup retests (the Casablanca clause, about $0.011, and any setup sentence the feedback adds), a few Luna low setups at about $0.006 each",
  groups:
    "coordinator, 2026-09-28: the group turn round (B10): the sharpened note twice on the 12 stored group turns and today's group form's sample 2 beside it (36 turns, about $0.17 at the migration check's $0.0042-0.0055 a group turn), the group judge's calibration and readings (about 60 Luna low calls, about $0.03) and a smoke; about $0.21, with room for B10's one fix-and-retest (B10b, 24 turns and their judge calls, about $0.11)",
  "form-gate":
    "coordinator, 2026-09-28: the request form's gate (B9: chapter-step p95 at or under 45 s and no worse than the one-message form): production's single-player turn form once as one message and once split, on the 44 stored turns in one invocation (88 turns, about $0.29 at $0.0033 a turn uncached; the split one's cache reads bill less), and a smoke",
  "final-check":
    "coordinator, 2026-09-28: the paid final check on production's own code (the adopted variant, under adopted1): one sample of the 44 stored single-player turns (sample 2; the form gate ran sample 1, $0.147) and both planners (about $0.06), the 12 stored group turns (about $0.05), six Luna low custom-story setups (about $0.05) and two template setups on Sol low, the template editor's first AI Drafts on the round-3 form (about $0.22), then the chapter-opening chains per player count (about $0.10) as the cap allows",
  "stage-scoping":
    "coordinator, 2026-09-29 (the owner's feedback on a first chapter that reached into its outcome's next stage; the ledger at $33.85 of the $40 hard cap): planner v2d (planV2d) twice on the 20 chapter-planning cases and planner v2c and today's form twice on the built first chapter (about $0.06 at $0.0013 a plan), the judged stage check's calibration and its readings on the stored plans (about 200 Luna low calls, about $0.09), a smoke, and room for one fix and retest; coordinator, 2026-09-30 (the owner's open question on the story's last chapter, so it can be answered from data): the climax clause (planV2dClimax) twice on three built last chapters, with planner v2d and v2c twice there too (18 plans, about $0.03), from what is left",
  "options-continuity":
    "coordinator, 2026-09-30 (the owner's feedback on options that differ only in risk, sacrifices too common and rewards rare, and a turn that repeated the one before it; the ledger at $34.02 of the $40 hard cap): production's single-player turn form (adopted, under adopted2) and the three arms on it (turnO, turnC, turnOC) twice on the 44 stored single-player turns, interleaved (352 turns, about $1.15 at the form gate's $0.0033 a turn), the judged checks on their turns (about 350 Luna low calls, about $0.10), a smoke, and room for one fix and retest; the fix and retest (2026-09-30): arm O with one sentence (turnOb, its options named their stat) once on the 21 rolled chapter steps of the two Novi Reg stories (about $0.08), from what is left",
  "options-o2":
    "coordinator, 2026-09-30 (after the options and continuity run: arm O's variety gain without its wrong-way moves; the ledger at $35.40 of the $40 hard cap): version O2 (turnO2: arm O's stat variety with the lever option left out of the bonus count, its retest sentence, B6's negative base kept, a reward invited until the chapter offered one) and production's single-player turn form beside it (adopted, under adopted3), twice on the 32 stored rolled chapter steps, interleaved (128 turns, about $0.44 at the run's $0.0034 a turn), their judged checks (about $0.03), a smoke, and room for one fix and retest (O2 once on the 32, about $0.11); the fix and retest (2026-09-30): O2 with sacrifices on today's rate (turnO2b, its strong-reason clause gave unreasoned second sacrifices) once on the 32 (about $0.12) and its judged turns, from what is left",
  "planner-v2e":
    "coordinator, 2026-09-30 (the owner's decision that the story's last chapter settles only its outcome's next stage, planner v2d's clause, and planner v2d's last step written twice in 4 of 46 plans; the ledger at $36.01 of the $40 hard cap): planner v2e (planV2e: planner v2d with its last step listed once) twice on the 23 chapter-planning cases, stored and built, the built first chapter and three last chapters among them (46 plans, about $0.065 at planner v2d's $0.0014 a plan), the judged stage check on its plans (about 50 Luna low calls, about $0.02), a smoke, and room for one fix and retest",
  "ending-state":
    "coordinator, 2026-09-30 (the owner's decision that each outcome is told at the ending as its milestones leave it, complete ones resolved, unfinished ones in their current state; the ledger at $36.08 of the $40 hard cap): the ending told as its milestones leave it (endingState, the smoke's draft, then endingStateB with the smoke's one fix, the rule's words kept out of the prose) and production's ending beside it (adopted, under adopted2, whose two samples on the three stored endings are already recorded) twice on the stored endings and four built ones (one player, a two-player contest complete and unfinished, three players in two camps): 22 turns, about $0.08 at $0.003 a single-player and $0.004-0.005 a group ending, the judged check on every ending and its calibration (about 60 Luna low calls, about $0.02-0.03), and a smoke",
  runaway:
    "coordinator, 2026-09-30 (production's single-player switch turn on story 8988006e after its first chapter reasons to the 12,000-token output cap and writes nothing, 3 of 4 first tries of its exact request that day, retried at about 70 s more for the player; the ledger at $36.17 of the $40 hard cap): production's request (adopted, under adopted4) and the suspected cause fixed (noSwitchReminder: the switch configuration's reminder, the chapter planner's, left out on a switch turn, the turn document's B3.13 alone) three times each on the case that ran away, interleaved, with a smoke among them: 6 turns, about $0.02 at $0.0034 a turn, plus the runaways production's retries pay (about $0.0074 each, at most two a job)",
  playthroughs:
    "coordinator, 2026-09-30 (the owner's \"do whatever additional tests you think are useful\"; the coordinator chose whole-story playthroughs; the ledger at $36.20 of the $40 hard cap): four stories set up and played to their ending on production's own code and models (adopted, under adopted4: setup, character selection, both planners with pacing and their retry, turns with repairs, stat changes, chapter resolution, the ending), an automated player, no pregeneration: a 10-turn and a 25-turn single-player story, a 25-turn two-player contest and a 25-turn three-player cooperative-competitive story, about 150 calls, about $0.49 at the final check's measured costs ($0.0034 a single-player turn, $0.0043-0.0055 a group turn, $0.0011-0.0014 a plan, $0.006-0.009 a setup), the judged stage and ending checks on them (about 30 Luna low calls, about $0.01), a two-turn smoke, and the retries and runaways production's own re-sends pay",
  "choice-result":
    "coordinator, 2026-09-30 (after the playthroughs: exploration options that carry out another step result than the one at their position, and challenge results that say what the player does, so the next turn follows the result and not the choice; the ledger at $36.73 of the $40 hard cap): the exploration-order turn (choiceResult) and production's turn beside it (adopted, under adopted5), twice on the two stored exploration steps and eleven built from the playthroughs' stored runs (eight single-player, three group; 52 turns, about $0.21 at $0.0037 a single-player and $0.005-0.0065 a group turn); planner v2f (planV2f: challenge and contest results say how the attempt turns out, exploration results are the player's own choices) and planner v2e beside it twice on five built chapter plans, and planner v2f once on the 23 other chapter-planning cases beside planner v2e's stored plans (under round0; 43 plans, about $0.065); the two judged checks' calibration on hand-read playthrough turns and plans and their readings (about 230 Luna low calls, about $0.09-0.11), the judged stage check on planner v2f's plans, and a smoke; the one fix-and-retest (2026-09-30, after the run: 3 of the variant's 20 single-player replies one short paragraph): the same line asking for the full text (choiceResultB) twice on the ten single-player steps (about $0.06) and its judged turns, from what is left",
  "choice-line-sp":
    "coordinator, 2026-09-30 (after the choice-result run: the exploration-order line fixed a single player's options, 14 of 20 -> 19 of 20, but 3 of 20 replies came back as one short paragraph; measured again with production's one retry of a short reply in the loop as its safety net; the ledger at $37.11 of the $40 hard cap): production's turn (adopted, under adopted6) and the line (choiceResult) on Luna medium twice on the choice-result run's ten single-player exploration steps, interleaved, each turn with production's one checked retry where its first reply is short or has no options (40 turns, about $0.15 at $0.0037 a turn, plus the retries: about 3 of 20 on the line), the options judge on every first reply and retry (about 45 Luna low calls, about $0.015), and a smoke",
  "playthroughs-2":
    "coordinator, 2026-09-30 (the owner OK'd \"a few more dollars to do useful playthroughs\"; the hard cap raised to $42 for it; the ledger at $37.24): a second round of whole-story playthroughs on production's current code (adopted, under adopted7: planner v2e and v2f, the ending's current-state rule, the group exploration owner rule, the one-sided contest repair, the pacing count, the five no-call fixes, the exploration line for every player count, the failed turn's resend and Try again), the first round's four premises and two more (a two-player contest over several chapters and a short story read with a child): 187 to 213 calls (typical 191), about $0.60 at the measured costs of production's own calls before retries (round 1 came in about 20% over its estimate, at $0.52), the judged stage, ending, options and results checks (about 120 Luna low calls, about $0.05), a two-turn smoke, and the resends and retries production pays",
  "outcome-settled":
    "coordinator, 2026-09-30 (fix 1 of the second playthroughs' review, estimated at about $0.30 and capped 30% above it; the ledger at $37.99 of the $42 hard cap, and the whole review's workflow held to about $2.40): the turn that completes an outcome told and recorded as settled, no stat change against the milestone beside it, and the ending's milestones over earlier facts that call a complete outcome open (outcomeSettled), with production's turn beside it (adopted, under adopted8), twice on 12 turns of the second round's stored runs (7 switch turns completing an outcome, 5 endings; 48 turns, about $0.20 at the run's $0.003 a single-player and $0.004-0.006 a group turn), the new judged check on the switch turns with its calibration and the calibrated ending check on the endings (about 110 Luna low calls, about $0.04), a smoke, and room for one fix-and-retest; the fix-and-retest (2026-09-30, after the run: the variant's milestones copied the plan's words, milestoneNotCopied moved lower, and the judge's calibration read not reliable): the completing milestone kept specific (outcomeSettledB) twice on the 7 switch turns and once on the 5 endings (19 turns, about $0.075), and the judge's one fix (prompt v2) on its calibration and the switch turns of production and the retest (about 75 Luna low calls, about $0.035), from what is left",
  "recorded-result":
    "coordinator, 2026-09-30 (fix 2 of the second playthroughs' review, estimated at about $0.20 and capped 30% above it; the ledger at $38.35 of the $42 hard cap after fix 1, and the whole review's workflow held to about $2.40): the turn after an exploration step told as the game recorded it, where the player's choice changes direction from the step before (recordedResult), with production's turn beside it (adopted, under adopted9), twice on 8 turns of the second round's stored runs (food trucks turn 23, where the chosen result was told as the earlier one, and seven ordinary changes of direction; 32 turns, about $0.16 at $0.0037 a single-player and $0.005-0.0075 a group turn), a new judged check (the recorded result told) with its calibration on hand-read stored turns and constructed failing versions (about 80 Luna low calls, about $0.03), a smoke, and what is left for one fix-and-retest",
  "lever-direction":
    "coordinator, 2026-09-30 (fix 3 of the second playthroughs' review, estimated at about $0.20 and capped 30% above it; the ledger at $38.52 of the $42 hard cap after fixes 1 and 2, and the whole review's workflow held to about $2.40): the setup whose sacrifices cost and rewards help whichever way a stat runs (leverDirection: one line in the stat rules and the two lever fields reworded), with production's setup beside it (adopted, under adopted10), twice on six premises (the second round's mouse story and New Avalon, three where production's stored setups wrote a pressure backwards, and one where they wrote it right; 24 setups, about $0.13 at the playthroughs' $0.004-0.0065 a Luna low setup), a new judged check (every lever runs the right way) with its calibration on hand-read stored setups (about 60 Luna low calls, about $0.03), a smoke, and what is left for one fix-and-retest",
  "parallel-threads":
    "coordinator, 2026-10-01 (fix 4 of the second playthroughs' review of 2026-09-30, estimated at about $0.15 and capped 30% above it; the ledger at $38.69 of the $42 hard cap after fixes 1 to 3, and the whole review's workflow held to about $2.40): parallel threads in one world and contests with both sides (parallelThreads: a switch-planner line offering a contest's last stage only as a grouped thread, two chapter-planner lines, parallel threads in one place and a one-sided contest as that side's challenge, and a group-turn line), with production beside it (adopted, under adopted11), twice each: the switch planner on three switches before a contest's last stage (12 plans, about $0.025 at $0.002 a group plan) and the chapter planner into the group turn on three chapter openings of the second round's stored runs, two where the defect happened (12 chains, about $0.09 at the round's $0.0069-0.0086 a chapter opening); a new judged check (people and places consistent across the players' texts) with its calibration on hand-read stored turns and constructed failing versions (about 50 Luna low calls, about $0.035), a smoke, and what is left for one fix-and-retest",
  "challenge-results":
    "coordinator, 2026-10-01 (fix 5 of the second playthroughs' review of 2026-09-30, estimated at about $0.15 and capped 30% above it; the ledger at $38.84 of the $42 hard cap after fixes 1 to 4, and the whole review's workflow held to about $2.40): challenge and contest results that tell how the attempt turns out, not the player's approach (resultsAsOutcomes: one sentence after the results rule, the switch's approach and a step's question are where a thread starts and no result restates them; the flavor pick's line in PLAYER DECISIONS worded the same way; the challenge and contest milestone fields' 'naming who did what' narrowed to what was won or lost), with production's chapter planner beside it (adopted, under adopted12), twice on 15 chapter plans of the second round's stored runs (11 whose results failed the calibrated resultsFitKind check, 4 that passed; 60 plans, about $0.11 at the round's $0.0011-0.0016 a single-player and $0.0016-0.0025 a group plan), the calibrated resultsFitKind judge on every plan (60 Luna low calls, about $0.03), a smoke, and what is left for one fix-and-retest",
  "kids-turns":
    "coordinator, 2026-10-01 (fix 6 of the second playthroughs' review of 2026-09-30, estimated at about $0.15 and capped 30% above it; the ledger at $38.98 of the $42 hard cap after fixes 1 to 5, and the whole review's workflow held to about $2.40): read-with-kids turns shorter and simpler for the child's age (kidsTurn: on a read-with-kids story the '5-6 paragraphs of 3-5 sentences' count and its repeats made '3-4 short paragraphs of 2-3 short sentences', and one block of rules for a child of the recorded age, options and interludes too), with production's turn beside it (adopted, under adopted13), twice on seven single-player turns (six of the second round's mouse story, read with a five-year-old, and a template tagged Kids; 28 turns, about $0.12 at the round's $0.0025-0.0062 a mouse turn), each with production's one checked retry of a one-paragraph first reply (the round's mouse story retried 2 of 11; about $0.01), a deterministic readability check (no judge calls), a smoke, and what is left for one fix-and-retest",
  "money-adds-up":
    "coordinator, 2026-10-01 (fix 7 of the second playthroughs' review of 2026-09-30, estimated at about $0.15 and capped 30% above it; the ledger at $39.05 of the $42 hard cap after fixes 1 to 6, and the whole review's workflow held to about $2.40): money and counts that add up in a learning story (moneyAddsUp: on a learn-something story that keeps a counted stat, one block at the end of the stat-changes section, every amount the text pays or earns moving its stat by that amount, a worked-out margin moving only by the sum the text shows, never as a reward, no stated total other than the stat's), with production's turn beside it (adopted, under adopted14), twice on six turns of the second round's lemonade story, the one stored learning story that counts money (24 turns, about $0.09 at the round's $0.0026-0.0042 a lemonade turn), a new judged check (the figures add up) with its calibration on hand-read stored turns and constructed failing versions (about 70 Luna low calls, about $0.035), a smoke, and what is left for one fix-and-retest",
  "kids-ages":
    "coordinator, 2026-10-01 (the owner's decision that a read-with-kids story's turns and stat budget depend on the children's ages, \"this should depend on the age range that should be part of kids stories settings\"; the owner's \"few bucks don't matter. I just want to make sure that we stay frugal and only run what's needed\"; the ledger at $39.94 of the $45 hard cap; estimated at about $0.30 and capped 30% above it): read-with-kids turns written for the youngest child's age band (kidsAges: 3-5 very short, 6-8 production's kids turn, 9-12 a chapter book's page, every player count, picture places by band) with production's turn beside it (adopted, under adopted16), twice on the mouse story's six frozen turns read with a child aged 4 and 10 (48 turns, about $0.13 at the kids-turns stage's $0.0025-0.003 a turn; at 7 the variant is production's request byte for byte, so none runs) and on a two-player kids story's first turn and switch turn at 4, 7 and 10 (24 group turns, about $0.14 at $0.005-0.0065 a group turn), each with production's one checked retry; the 9-12 band's setup with a third visible player stat beside production's kids setup once on two premises at 10 (4 setups, about $0.025; below 9 the variant is production's setup byte for byte); a deterministic readability check per band (no judge calls), a smoke, and what is left for one fix-and-retest",
  "late-pacing":
    "coordinator, 2026-10-01 (fix 8 of the second playthroughs' review of 2026-09-30, estimated at about $0.50-0.60 and capped 30% above its upper end; the ledger at $39.21 of the $42 hard cap after fixes 1 to 7, the whole review's workflow held to about $2.40, about $1.18 of it left): pacing that leaves the story's last chapter a milestone, story instructions ranked below pacing, hints planted early and paid off late (latePacing: the chapter planner's allowed lengths narrowed to those whose threads after it match the milestones still needed, in PACING and the plan check; the switch planner's priority step keeping a milestone for the last thread and never letting a forced situation take a thread from a player with none to spare; the turn's hint line), with production beside it (adopted, under adopted15): short playthroughs of both, twice each, from the chapter plan where the lengths decided the last chapter to the last chapter's plan, on three of the second round's stored 25-turn stories (New Avalon and the food trucks from turn 17, the estate agents from 13; about 12 runs of 5-10 turns, about $0.44 at the round's $0.0045-0.0062 a turn with its plans), both switch planners twice on five stored switches (20 plans, about $0.03), both turns twice on five stored endings (20 turns, about $0.08), a new judged check (no new mystery late, earlier ones explained at the ending) with its calibration on hand-read stored turns (about 150 Luna low calls, about $0.06), a smoke, and what is left for one fix-and-retest; the fix-and-retest (2026-10-01, after the short playthroughs: the variant's lengths left the food trucks' two players one thread for one milestone each and its switch planner gave that thread to the complete contract, the setup's final-thread rule): latePacingB (the story's SWITCH/THREAD INSTRUCTIONS named in step b as ranked below a player's needed milestones) twice on the five stored switches, and production, the variant and B four times each on the variant's own switch where it failed (22 switch plans, about $0.04), from what is left",
  "group-levers":
    "coordinator, 2026-10-01 (the second playthroughs' review: groups got 1 sacrifice or reward in 129 option sets, no reward, and players' own stats rarely moved; B6 was never built or measured for groups; the owner's \"few bucks don't matter. I just want to make sure that we stay frugal and only run what's needed\"; the ledger at $40.18 of the $45 hard cap after the kids-ages stage; estimated at about $0.275 and capped 30% above it): group sacrifices, rewards and own stats (groupLevers: production's group turn with B6's lever parts for each player in a challenge or contest thread, each player's computed lever line, the reward exception, a shared stat's lever to one player a turn and own stats first, no second sacrifice of a stat in a thread, the plan's lever question without '(Many beats …)'), with production's group turn beside it (adopted, under adopted17), twice on twelve group chapter steps of the second round's stored runs (eight two-player at about $0.005 a turn and four three-player at about $0.0058, the recorded-result and outcome-settled stages' Luna low group turns: 48 turns, about $0.26), each with production's one checked retry (about $0.015), deterministic lever readings and a hand read (no judge calls), a smoke, and what is left for a fix-and-retest on the cases where its cause shows; the fix-and-retest (2026-10-01, after the run: the variant offered a lever in 11 of the 48 sets its line invited one, and its plans declined the rest in the plan question's own frame, 'not needed for this beat'): groupLeversB (the rolled players' plan question asked from their line) once on the twelve cases (12 turns, about $0.06), from what is left; then, since it moved every target against production on that sample and the stage measures twice, its second sample (12 turns, about $0.06) under a stage cap raised to $0.43 for its arm (the reason in budget-overrides.jsonl), the cap it keeps; spent $0.373 (the run $0.256, the retest $0.117)",
  "short-replies":
    "coordinator, 2026-10-01 (the second playthroughs: 13 of 126 first replies one short paragraph, 2 short again after production's retry and used; the owner's \"few bucks don't matter. I just want to make sure that we stay frugal and only run what's needed\"; the ledger at $40.56 of the $45 hard cap after the group-levers stage; estimated at about $0.46 and capped 30% above it): turns whose text goes on after its first paragraph (shortReplies: one line in the text rules and one in each player's text field, a blank line between paragraphs, never ending after the first), with production's turn beside it (adopted, under adopted18), twice on 23 turns, each with production's one checked retry: the second round's short turns the replay still reaches (12), the stored turns that came back short most often over the earlier stages (7), and ordinary ones never short there (4); 15 single-player turns on Luna medium (60 turns, about $0.24 at the second round's $0.004 a long story's turn) and 8 group turns on Luna low (32 turns, about $0.19 at $0.0055 a two-player and $0.0068 a three-player turn; the dry run reads 92 jobs at $0.34, and the group-levers stage's group turns came in about 40% over theirs), the retries production pays (about 10% of its first replies, about $0.03), deterministic readings (no judge calls), a smoke, and what is left for one fix-and-retest; spent $0.366 (92 jobs as the dry run counted, 9 retries), no fix-and-retest run",
  "runaway-2":
    "coordinator, 2026-10-01 (another attempt at the runaway turn's cause: every reply the eval ever cut at the output cap fell on a turn that closes a chapter, 15 of 192 such first tries on Luna medium since 29 September and none of 679 other turns, each costing about 70-90 s and $0.0074 more; the owner's \"few bucks don't matter. I just want to make sure that we stay frugal and only run what's needed\"; the ledger at $40.93 of the $45 hard cap after the short-replies stage; estimated at about $0.46 and capped 30% above it): production's closing turn (adopted, under adopted19) and two diagnostic variants, each without one of the two blocks only a closing turn carries (noThreadAudit: the after-thread stat audit, a chapter step's stat line in its place; noNewMilestones: the milestone the turn writes, newMilestones as on every other turn), sixteen times each on the case that ran away most (story 8988006e's switch turn after its first chapter, 6 of 14 first tries since 29 September), interleaved, with production's single-player limits (48 turns, about $0.27 at $0.0037 an answered turn and $0.011 a runaway with its retry, production's runaways at about 40% and the variants' at about half that), deterministic readings (no judge calls), a smoke and a first half before the second, and room for one fix-and-retest at the block the loop needs beside production (32 turns, about $0.19)",
  "options-o2c":
    "coordinator, 2026-10-01 (the owner on O2b: \"14 reward options in 32 choice sets is a bit too much. At most one reward is good. Several sacrifices can sometimes make sense, but should have a strong justification starting at the second one\", options that use different stats and not only risk; the target about 4-6 reward sets per 32 rolled sets, and O2b's extra reasoning and odds tilt recovered if it can be; the owner's \"few bucks don't matter. I just want to make sure that we stay frugal and only run what's needed\"; the ledger at $41.09 of the $45 hard cap after the runaway-2 stage; the run and its judge estimated at about $0.48, plus 30% ($0.62), and room for one fix-and-retest ($0.23)): option variety with fewer rewards (turnO2c: O2b's stat lines and risk-only weak example on production's single-player turn, and a lever line the game computes, a reward only on a chapter's first step where the player's previous chapter offered none and a stat allows one, no sacrifice there, elsewhere no reward and a sacrifice on B6's rate, a second in a chapter only for a strong reason in the option's text), with production's turn beside it (adopted, under adopted20), twice on the 32 stored rolled chapter steps O2 and O2b ran on, interleaved, first tries as they ran (128 turns, about $0.45 at the options-o2 stage's $0.0034-0.0036 a turn), the judged checks on them (about 130 Luna low calls, about $0.03), a smoke, and the fix-and-retest at its cause if one is needed (O2c's changed form twice on the 32, about $0.23)",
  "pacing-clues":
    "coordinator, 2026-10-01 (fix 8's retest in whole short playthroughs, the coordinator's call after the owner's decisions of that day; the owner's \"few bucks don't matter. I just want to make sure that we stay frugal and only run what's needed\"; the ledger at $41.59 of the $45 hard cap after the options-o2c stage, the decisions' five stages before it closed at what they spent): the late-pacing stage's fix-and-retest planners (the chapter planner's paced lengths; step b keeping a milestone for the story's last thread, a forced situation never taking a thread from a player with none to spare, the story's SWITCH/THREAD INSTRUCTIONS ranked below a player's needed milestones) and the late part's clue lines (no new mystery past two thirds of the story, an earlier one explained where it fits, the interludes too) together as one variant (pacingClues), with production's code beside it (adopted, under adopted21): short playthroughs of both, twice each, from the late-pacing stage's three starts (New Avalon and the food trucks at turn 17, the estate agents at 13) and the space pirates' threshold switch at turn 14, to the story's last chapter plan (16 runs: the dry run reads $0.334 a sample of both arms before retries, $0.67 for two, and the late-pacing stage's samples came in 21-27% over theirs, so about $0.84), the clue judge's one fix (v2) calibrated on its 25 late-turn items twice (50 Luna low calls, about $0.04) and, where it reads reliable, once on the late turns both arms played (about 160 calls, about $0.13), a blind hand reading of those turns (no calls), a smoke, and the retries production's own re-sends pay; about $1.0, plus 30% ($1.30); raised to $1.50 for the one fix-and-retest (2026-10-01, after the run: $0.94 spent, the clue line moved, the pacing target did not, the switch planner breaking step b where it decides the last chapter, the food trucks' final-thread rule taking both players' last thread again in 1 of 2 runs and the space pirates' spare thread spending the scout's last milestone before the last thread in 2 of 2): pacingCluesB (the same requests, the switch plan check reading step b's pacing, one retry told the problem, never failing the turn) twice on the four starts alone (8 runs, the dry run's $0.167 a sample of one arm before retries, about $0.39 at this stage's 17% over, plus 30%)",
  "playthroughs-3":
    "coordinator, 2026-10-01 (the final whole-story playthroughs after the owner's decisions and the fixes of that day; the owner's \"few bucks don't matter. I just want to make sure that we stay frugal and only run what's needed\"; the ledger at $42.87 of the $45 hard cap, every stage before it closed at what it spent): a third round on production's current code (adopted, under adopted22: only what was played gets a milestone, the owner's roll alone on a player's own outcome, a contest in a cooperative story, the lever-direction setup, the kids age bands with the age set through the read-with-kids setting, group levers with the owner's-roll lever line, the short-replies lines, O2c's options, the late clue lines and the paced planners with the switch plan's pacing check), round 2's six premises once each (a 10-turn and a 25-turn single-player story, two two-player contests, three players in two camps, the mouse story read with a five-year-old): round 2 came to $0.75 with its judged checks, its story calls 19% over their estimate; this round plays more levers and the planners' pacing retries, so about $0.80, capped at about $1.00 (a two-turn smoke, the judged stage, results, options and ending checks as round 2 had them, and the resends and retries production pays); it fits the $45 on the recorded ledger, and with the stalled Stage 4 calls' possible $1.3 on top would reach about $45.17 at the full cap",
};

export type Caps = {
  stageCaps: Record<LedgerStage, number>;
  globalCap: number;
  /** Per invocation (--max-spend) */
  maxSpend?: number;
};

export type BudgetOverride = {
  at: string;
  stage?: LedgerStage;
  stageCap?: number;
  globalCap?: number;
  reason: string;
  /** A paid run's --arms: the arms the raise pays for */
  arms?: string[];
};

export type CapArgs = {
  stage?: LedgerStage;
  stageCap?: number;
  globalCap?: number;
  maxSpend?: number;
  overTargetReason?: string;
  /** A paid run (--run), whose raised stage cap pays only for the arms it names */
  forRun?: boolean;
  /** The run's --arms */
  armKeys?: string[];
};

/**
 * Throws on a stage cap above its default without a reason, or a global cap
 * above the hard ceiling. A paid run that raises a stage cap must name its
 * arms (--arms), and the recorded override lists them: the raise is approved
 * for arms, and plan order cannot hold it to them (the runner goes setup
 * before beat, and warm-first can start a later arm early), so a run filtered
 * by role alone would spend it on whatever else the stage plans.
 */
export function resolveCaps(
  args: CapArgs,
  now: () => Date = () => new Date()
): { caps: Caps; override?: BudgetOverride } {
  const globalCap = args.globalCap ?? DEFAULT_GLOBAL_CAP;
  if (globalCap > HARD_CEILING) {
    throw new Error(`The global cap can never exceed $${HARD_CEILING}.`);
  }
  const stageCaps = { ...DEFAULT_STAGE_CAPS };
  if (args.stageCap !== undefined) {
    if (!args.stage) {
      throw new Error("--stage-cap needs --stage.");
    }
    stageCaps[args.stage] = args.stageCap;
  }
  const raisesStage =
    args.stage !== undefined && stageCaps[args.stage] > DEFAULT_STAGE_CAPS[args.stage];
  const raisesGlobal = globalCap > DEFAULT_GLOBAL_CAP;
  const reason = args.overTargetReason?.trim();
  if ((raisesStage || raisesGlobal) && !reason) {
    throw new Error(
      'A cap above the owner\'s target needs --over-target-reason "<why this spend is obviously useful>".'
    );
  }
  const arms = args.armKeys?.length ? args.armKeys : undefined;
  if (raisesStage && args.forRun && !arms) {
    throw new Error("A raised stage cap pays only for the arms it was approved for: name them with --arms.");
  }
  const caps: Caps = { stageCaps, globalCap, maxSpend: args.maxSpend };
  if (!reason || !(raisesStage || raisesGlobal)) {
    return { caps };
  }
  return {
    caps,
    override: {
      at: now().toISOString(),
      stage: raisesStage ? args.stage : undefined,
      stageCap: raisesStage && args.stage ? stageCaps[args.stage] : undefined,
      globalCap: raisesGlobal ? globalCap : undefined,
      reason,
      ...(args.forRun && arms ? { arms } : {}),
    },
  };
}

export type SpendRecord = { stage: LedgerStage; costUsd: number };

export type Spend = { byStage: Record<LedgerStage, number>; total: number };

export function spentByStage(records: SpendRecord[]): Spend {
  const byStage = Object.fromEntries(LEDGER_STAGES.map((stage) => [stage, 0])) as Record<LedgerStage, number>;
  for (const record of records) {
    byStage[record.stage] += record.costUsd;
  }
  return { byStage, total: Object.values(byStage).reduce((a, b) => a + b, 0) };
}

export type BudgetVerdict = { ok: true } | { ok: false; reason: string };

/**
 * Whether a call estimated at `estimateUsd` may start. `spent` includes
 * reservations for calls in flight; `invocationSpent` is this run's share.
 */
export function budgetCheck(
  caps: Caps,
  spent: Spend,
  invocationSpent: number,
  stage: LedgerStage,
  estimateUsd: number
): BudgetVerdict {
  const fmt = (usd: number) => `$${usd.toFixed(2)}`;
  if (spent.byStage[stage] + estimateUsd > caps.stageCaps[stage]) {
    return {
      ok: false,
      reason: `Stage ${stage} cap ${fmt(caps.stageCaps[stage])} reached (spent ${fmt(spent.byStage[stage])})`,
    };
  }
  if (spent.total + estimateUsd > caps.globalCap) {
    return {
      ok: false,
      reason: `Global cap ${fmt(caps.globalCap)} reached (spent ${fmt(spent.total)})`,
    };
  }
  if (caps.maxSpend !== undefined && invocationSpent + estimateUsd > caps.maxSpend) {
    return {
      ok: false,
      reason: `--max-spend ${fmt(caps.maxSpend)} reached (this run spent ${fmt(invocationSpent)})`,
    };
  }
  return { ok: true };
}
