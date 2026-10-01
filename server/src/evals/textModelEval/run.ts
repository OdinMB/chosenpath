import crypto from "crypto";
import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { DEFAULT_TURNS } from "core/config.js";
import type { PlayerCount, SetOfBeatGenerationSchema, StoryTemplate } from "core/types/index.js";
import { getStoragePath } from "shared/storageUtils.js";
import { repairBeatReply } from "../../game/services/beatRepairs.js";
import { createStoryStateFromTemplate } from "../../game/services/StoryStateFactory.js";
import { contentFilterClassifier } from "../../game/services/ContentFilterService.js";
import { loadStoryStates, loadTemplates } from "../imageModelEval/cases.js";
import { armSettings, baselineArm, EVAL_ROLES, STAGES, type EvalRole, type Stage } from "./arms.js";
import { balanceSimulation, renderBalanceSim, storedChallengeSets } from "./balanceSim.js";
import { htmlLeaks, metadataLeaks } from "./blinding.js";
import { DEFAULT_STAGE_CAPS, budgetCheck, resolveCaps, spentByStage, type Caps, type LedgerStage, type SpendRecord } from "./budget.js";
import { buildCases } from "./caseBuilder.js";
import { caseStory, loadStoredSnapshots, type EvalCase } from "./cases.js";
import { chapterFrameChecks, type FrameSet } from "./chapterFrames.js";
import { checkBaselines, renderCheckBaselines, type BaselineReport } from "./checkBaselines.js";
import { localCases, printDryRun, type LocalCaseSources } from "./dryRun.js";
import { evalFiles, type EvalFiles } from "./evalFiles.js";
import { executeCall, sha256 } from "./executor.js";
import { FILTER_CASES } from "./filterCases.js";
import {
  DEFAULT_FILTER_ARMS,
  FILTER_ARMS,
  filterCheckEstimateUsd,
  filterSpendUsd,
  openFilterCases,
  renderFilterReport,
  runFilterCheck,
  scoreFilterCheck,
} from "./filterCheck.js";
import { jobEstimateUsd, planJobs, rebuiltToday, requestJob, sameRequestAs, todaysRequestHash, type PlanOptions } from "./jobPlan.js";
import { checksForRecords } from "./outputChecks.js";
import { prepSpend } from "./prepCalls.js";
import { previewSource, STORED_ARM } from "./previewSource.js";
import { runProbe } from "./probe.js";
import { renderRatingPage } from "./ratingPage.js";
import { planRatingSet, ratingSetFromKey, type ArmRef, type PairwiseCriteriaSet, type RatingKind } from "./ratingSets.js";
import { renderPairwiseScores, renderScores, scorePairwise, scoreRatings, type ExportedRatings } from "./ratingScore.js";
import { renderResults } from "./resultsReport.js";
import { DEFAULT_CHAIN_MAX_SPEND, setupChainMode } from "./setupChainMode.js";
import { PLAYTHROUGH_ROUNDS, playthroughsMode, printPlaythroughPlan } from "./playthroughMode.js";
import { DEFAULT_TOKENS_PER_MINUTE, finishedJobKeys, finishingRecord, keyOf, runJobs, usable, type CallRecord } from "./runner.js";
import { buildStageCasesMode, judgeStagesMode } from "./stagePrep.js";
import { buildEndingCasesMode, judgeEndingsMode } from "./endingPrep.js";
import { buildChoiceCasesMode, judgeChoiceResultsMode } from "./choiceResultPrep.js";
import { buildSettledCasesMode, judgeSettledMode } from "./outcomeSettledPrep.js";
import { buildRecordedCasesMode, judgeRecordedMode } from "./recordedResultPrep.js";
import { buildLeverCasesMode } from "./leverDirectionCases.js";
import { judgeLeversMode } from "./leverDirectionPrep.js";
import { buildParallelCasesMode, judgeParallelMode } from "./parallelThreadsPrep.js";
import { buildChallengeCasesMode, judgeChallengeResultsMode } from "./challengeResultsPrep.js";
import { buildKidsCasesMode, kidsTurnsMode } from "./kidsTurnPrep.js";
import { buildKidsAgesCasesMode } from "./kidsAgesCases.js";
import { kidsAgesMode } from "./kidsAgesPrep.js";
import { buildMoneyCasesMode, judgeMoneyMode } from "./moneyAddsUpPrep.js";
import { buildLatePacingCasesMode, judgeCluesMode, latePacingPlayMode, printLatePacingPlan } from "./latePacingPrep.js";
import { choiceLineMode } from "./choiceLinePrep.js";
import { statReadouts } from "./turnDesignChecks.js";
import { turnKindOf } from "./turnWaits.js";
import {
  DEFAULT_JUDGE_SAMPLES,
  DEFAULT_RECORD_JUDGE_SAMPLES,
  backfillChaptersMode,
  buildRoundCasesMode,
  judgeCalibrationMode,
  judgeGroupsMode,
  judgeRecordsMode,
  printPrepPlan,
  spendBeside,
  type PrepContext,
} from "./turnPrep.js";
import { CURRENT_PROMPT_STATE, PRE_FIX_PROMPT_STATE, retiredPromptStateProblem } from "./variants.js";

/*
 * CLI for the text-model eval. Run from server/ (npm run eval:text -- …):
 *   --dry-run (default) [--prompt-state <tag>, default round0]  cases, open jobs, estimated $ and duration per stage; no API calls
 *   --probe [--max-spend 1]       which parameters and schemas Sol and Luna accept
 *   --build-cases [--rebuild-cases] [--max-spend 0.75]
 *   --run --stage 0|1-2|3|4|setup-rounds|turn-rounds|migration|plan-refresh|reruns|setup-retests|groups|form-gate|final-check|stage-scoping|options-continuity|options-o2|planner-v2e|ending-state|runaway --prompt-state <tag> [filters]
 *     (options-continuity runs under adopted2: production's form beside the three arms, interleaved;
 *     options-o2 under adopted3: production's form beside version O2 on the stored rolled chapter steps, interleaved,
 *     then O2's retest turnO2b once on the same steps; planner-v2e under round0, beside planner v2c's and v2d's
 *     stored plans; ending-state under adopted2: the ending told as its milestones leave it beside production's
 *     ending, interleaved, on the stored and built endings, production's stored-ending samples already recorded;
 *     runaway under adopted4: production's request and noSwitchReminder three times each on the switch turn that
 *     reasoned to its output cap, interleaved; choice-result in two parts: --role beat under adopted5, production's
 *     turn and choiceResult on the exploration steps, interleaved, then --role thread under round0, planner v2e and
 *     v2f on the chapter plans beside planner v2e's stored plans; choice-line-sp --role beat under adopted6: the
 *     same on the single-player steps, each turn with production's one checked retry; outcome-settled --role beat under
 *     adopted8: production's turn and outcomeSettled on the second playthroughs' completing switch turns and endings;
 *     recorded-result --role beat under adopted9: production's turn and recordedResult on the second playthroughs'
 *     turns after an exploration step that changed direction; lever-direction --role setup under adopted10: production's
 *     setup and leverDirection on six premises, interleaved; parallel-threads under adopted11: --role switch, production's
 *     group switch planner and parallelThreads', and --role thread --mode pipeline, each side's chapter planner into its
 *     own group turn, interleaved; challenge-results --role thread under adopted12: production's chapter planner and
 *     resultsAsOutcomes on the second playthroughs' chapter plans, interleaved; kids-turns --role beat under adopted13:
 *     production's turn and kidsTurn on the mouse story's turns and a template tagged Kids, interleaved, each turn with
 *     production's one checked retry; money-adds-up --role beat under adopted14: production's turn and moneyAddsUp on
 *     the lemonade story's turns, interleaved; kids-ages under adopted16: --role beat, production's turn and kidsAges on
 *     the mouse story's turns read with a child aged 4 and 10 and a two-player kids story's turns at 4, 7 and 10,
 *     interleaved, each with production's one checked retry, and --role setup, production's setup and kidsAges at 10)
 *     (refuses the retired "prefix" and "postfix"; the rounds and the migration check run no baseline)
 *   --rating-page setup|turn --arms <k1,k2,…> [--items N] [--per-item K] [--pairwise] [--no-repeat] [--preview [--stored]]
 *     (--per-item K: the baseline plus K rotating candidates per item; --cases limits the regular items;
 *     --pairwise: exactly two arms, the reference then the candidate, Which is better? per item;
 *     --chain-arms <ref chain>,<candidate chain> [--chain-items 4]: on a pairwise turn page, chapter openings
 *     too, each option the chain's first turn with its own plan;
 *     --no-repeat: leaves the repeated item out; --criteria turn-round2|groups|options: a pairwise turn page with that
 *     round's questions (turn round 2's, the group round's, the options and continuity page's);
 *     --chain-cases a,b: the chapter openings from those cases only; --frames nearer: the contexts show the nearer
 *     chapter frames, recorded in the key)
 *   --rerender-page <pageId>      renders an existing key's page afresh (same items, labels, page id)
 *   --score <export.json>
 *   --results                     rewrites results.md from the stored records (after a reading changed); no API calls
 *   --check-baselines [--ratings <export.json>,…]  the improvement documents' new checks over every stored
 *     output, per arm with the two-sample noise, what separates the rated pages' rank-1 picks, waits per
 *     turn kind and the stored references' currency; writes check-baselines.md and .json. No API calls.
 *   --filter-check [--arms k1,k2] [--fresh] [--max-spend 0.30]  the content filter's fixed test set through
 *     the production filter path (default arms: gpt-4.1-mini and Luna low); its own ledger stage, capped at
 *     $0.30. Answered pairs are skipped unless --fresh.
 *   The turn rounds' preparation (turnPrep.ts), in the turn-rounds stage:
 *   --build-round-cases [--rebuild-cases] [--max-spend 0.10]  the cases play never produced (roundCases.ts),
 *     frozen beside the others; the few missing turns and plans come from production's GPT-6 defaults
 *   --backfill-chapters [--max-spend 0.10]  a chapter question and plan per stored chapter (chapterFrames.ts);
 *     --frames nearer --stage plan-refresh: the nearer frames (planner v2c's question and kind of milestone,
 *     chapter-frames-nearer.json); --cases limits a run to the chapters those cases read (a smoke)
 *   --judge-calibration [--arms gpt-6-luna@low] [--samples 2] [--max-spend 0.10]  the judged checks on the
 *     hand-read turns (judgedChecks.ts)
 *   --judge-records --arms <beat or chain keys> --prompt-state <tag> [--samples 1] [--max-spend 0.10]  the judged
 *     checks on a round's turns after the first (the reference and the candidates), then judged-turns.md and .json;
 *     --frames nearer --stage reruns: on the nearer frames, judged-turns-nearer.md and .json
 *   --judge-groups --arms <reference,candidate> --prompt-state <tag> [--stage groups] [--max-spend 0.10]  the group
 *     round's judged consistency check (groupJudge.ts): its calibration on today's stored group turns (the reference's
 *     sample 1, judged twice) and every group reply of the arms once, then judged-groups.md and .json
 *   The stage scoping (stagePrep.ts, the owner's feedback of 2026-09-29), in the stage-scoping stage:
 *   --build-stage-cases [--rebuild-cases]  the Arielle story's first chapter as a chapter-planning case
 *     (stageCases.ts), frozen beside the others; no calls
 *   --judge-stages [--arms <chapter planner keys>] --prompt-state <tag> [--max-spend 0.10]  the judged stage check
 *     (stageJudge.ts): its calibration (two samples), the stored chapters and every isolated chapter plan of the
 *     arms (one sample), then judged-stages.md and .json; --cases <item or case ids> sends only those (a smoke)
 *   The ending (endingPrep.ts, the owner's decision of 2026-09-30), in the ending-state stage:
 *   --build-ending-cases [--rebuild-cases]  four endings no frozen case holds (endingCases.ts: a single player
 *     with an outcome complete, a two-player contest complete and unfinished, three players in two camps), from a
 *     frozen case and the stored setup chain, frozen beside the others; no calls
 *   --judge-endings --arms <beat keys> --prompt-state <tag> [--max-spend 0.05]  the judged check "each outcome told
 *     as its milestones leave it" (endingJudge.ts): its calibration (two samples) and every ending of the arms (one
 *     sample, one call per player), then judged-endings.md and .json; --cases <item or case ids> sends only those
 *   The choice-result stage (choiceResultPrep.ts, 2026-09-30), in its own stage:
 *   --build-choice-cases [--rebuild-cases]  turns and chapter plans of the playthroughs' stored runs (choiceResultCases.ts,
 *     replayed from each run's start), each only where its request is the one production sent; no calls
 *   --judge-choice-results [--max-spend 0.15]  the two judged checks (choiceResultJudge.ts): their calibration on the
 *     playthroughs (two samples) and the stage's turns (adopted5) and plans (round0), one sample each, then
 *     judged-choice-results.md and .json; --cases <item or case ids> sends only those (a smoke)
 *   The exploration line for one player (choiceLinePrep.ts, 2026-09-30), in the choice-line-sp stage: its turns run with
 *   --run --stage choice-line-sp --role beat --prompt-state adopted6 (production's turn and choiceResult, interleaved, each
 *   with production's one checked retry of a short or option-less first reply as its second step), then
 *   --choice-line-sp [--max-spend 0.10] [--report-only]  the options judge on every reply (first and retry, one sample),
 *     then choice-line-sp.md and .json: each turn read whole (checkedTurns.ts), the reply the game keeps, the wait
 *     including the retry, cost; --cases <case ids> judges only those (a smoke)
 *   The turn that completes an outcome, and the ending (outcomeSettledPrep.ts, 2026-09-30), in the outcome-settled stage:
 *   --build-settled-cases [--rebuild-cases]  switch turns completing an outcome and endings of the second round's stored
 *     runs (outcomeSettledCases.ts, replayed), each only where its request is the one production sent; no calls; the
 *     turns then run with --run --stage outcome-settled --role beat --prompt-state adopted8 (production's turn and
 *     outcomeSettled, interleaved)
 *   --judge-settled [--max-spend 0.10]  completedToldSettled (outcomeSettledJudge.ts) on its calibration (two samples)
 *     and every switch turn of the stage's arms, and the ending's outcomesToldAsLeft on every ending, one sample each,
 *     then judged-settled.md and .json; --cases <item or case ids> sends only those (a smoke)
 *   The turn after an exploration step told as recorded (recordedResultPrep.ts, 2026-09-30), in the recorded-result stage:
 *   --build-recorded-cases [--rebuild-cases]  turns of the second round's stored runs after an exploration step that
 *     changed direction (recordedResultCases.ts, replayed), each only where its request is the one production sent; no
 *     calls; the turns then run with --run --stage recorded-result --role beat --prompt-state adopted9 (production's
 *     turn and recordedResult, interleaved)
 *   --judge-recorded [--max-spend 0.05]  recordedResultTold (recordedResultJudge.ts) on its calibration (two samples)
 *     and every reply of the stage's arms, one call per player of an exploration thread, one sample each, then
 *     judged-recorded.md and .json; --cases <item or case ids> sends only those (a smoke)
 *   Setups whose sacrifices cost and rewards help, whichever way a stat runs (leverDirectionPrep.ts, 2026-09-30), in the
 *   lever-direction stage:
 *   --build-lever-cases [--rebuild-cases]  the second round's mouse story setup as a round case (leverDirectionCases.ts),
 *     its request the one production sent; no calls; the setups then run with --run --stage lever-direction --role setup
 *     --prompt-state adopted10 (production's setup and leverDirection, interleaved)
 *   --judge-levers [--max-spend 0.05]  leversRunRightWay (leverDirectionJudge.ts) on its calibration (two samples) and
 *     every setup of the stage's arms, one call per setup, one sample each, then judged-levers.md and .json; --cases
 *     <item or case ids> sends only those (a smoke)
 *   Parallel threads in one world, contests with both sides (parallelThreadsPrep.ts, 2026-10-01), in the parallel-threads
 *   stage:
 *   --build-parallel-cases [--rebuild-cases]  the second round's switch plans before a contest's last stage and chapter
 *     openings with parallel threads (parallelThreadsCases.ts, replayed), each only where its request is the one
 *     production sent; no calls; they then run with --run --stage parallel-threads --prompt-state adopted11, --role
 *     switch and --role thread --mode pipeline
 *   --judge-parallel [--max-spend 0.05]  placesConsistent (parallelThreadsJudge.ts) on its calibration (two samples) and
 *     every chain's turn of the stage's arms, one call per group turn, one sample each, and the plans read by the game (no
 *     calls), then judged-parallel.md and .json; --cases <item or case ids> sends only those (a smoke)
 *   Challenge and contest results that tell how the attempt turns out (challengeResultsPrep.ts, 2026-10-01), in the
 *   challenge-results stage:
 *   --build-challenge-cases [--rebuild-cases]  chapter plans of the second round's stored runs (challengeResultsCases.ts,
 *     replayed), each only where its request is the one production sent; no calls; they then run with --run --stage
 *     challenge-results --role thread --prompt-state adopted12 (production's chapter planner and resultsAsOutcomes)
 *   --judge-challenge-results [--max-spend 0.05]  the choice-result stage's calibrated resultsFitKind on every chapter
 *     plan of the stage's arms, one call per plan, one sample each, and the second round's stored readings against the
 *     hand (no calls), then judged-challenge-results.md and .json; --cases <case ids> sends only those (a smoke)
 *   Read-with-kids turns, shorter and simpler (kidsTurnPrep.ts, 2026-10-01), in the kids-turns stage:
 *   --build-kids-cases [--rebuild-cases]  turns of the second round's mouse story (kidsTurnCases.ts, replayed), each only
 *     where its request is the one production sent, recorded as a read-with-kids story with the child's age; no calls;
 *     they then run with --run --stage kids-turns --role beat --prompt-state adopted13 (production's turn and kidsTurn,
 *     each with production's one checked retry)
 *   --kids-turns  the stage's report, no calls: each turn read whole (checkedTurns.ts), the reply kept read for its
 *     length and plainness (kidsReadability.ts), per arm and the variant against production, the retries, the
 *     automatic checks, the waits including the retry and cost; kids-turns.md and .json
 *   Money and counts that add up in a learning story (moneyAddsUpPrep.ts, 2026-10-01), in the money-adds-up stage:
 *   --build-money-cases [--rebuild-cases]  turns of the second round's lemonade story (moneyAddsUpCases.ts, replayed),
 *     each only where its request is the one production sent, recorded as a learning story; no calls; they then run
 *     with --run --stage money-adds-up --role beat --prompt-state adopted14 (production's turn and moneyAddsUp)
 *   --judge-money [--max-spend 0.05]  the stage's judged check figuresAddUp on its calibration (two samples) and every
 *     reply of the stage's arms (one call per player, one sample), then judged-money.md and .json, every reply listed
 *     with its stat changes; --cases <item or case ids> sends only those (a smoke)
 *   Pacing that leaves the last chapter a milestone, instructions below pacing, hints paid off (latePacingPrep.ts,
 *   2026-10-01), in the late-pacing stage:
 *   --build-late-pacing-cases [--rebuild-cases]  switch plans of the second round's stored runs (latePacingCases.ts,
 *     replayed), each only where its request is the one production sent; no calls; they then run with --run --stage
 *     late-pacing --role switch --prompt-state adopted15 (production's switch planner and latePacing's), and the stored
 *     endings with --role beat
 *   --late-pacing-play [--cases <story ids>] [--samples N] [--turns N] [--arms <variants>] [--max-spend 0.50]
 *     [--report-only]  the short playthroughs (latePacingPlay.ts): each stored story replayed to its start and played on
 *     with production's code and the variant's, side by side (or the variants --arms names: latePacingB, the
 *     fix-and-retest), to the story's last chapter plan; prep-calls.jsonl, under adopted15; writes late-pacing.md and
 *     .json (the runs, their readings and the stored switches' plans read the same way)
 *   --judge-clues [--max-spend 0.06]  the stage's judged checks on planted details (cluesJudge.ts) on their calibration
 *     (two samples), the short playthroughs' late turns and the stage's endings (one sample), then judged-clues.md and
 *     .json; --cases <item or case ids> sends only those (a smoke)
 *   Read-with-kids turns and setups by the children's age band (kidsAgesPrep.ts, 2026-10-01), in the kids-ages stage:
 *   --build-kids-ages-cases [--rebuild-cases]  the mouse story's frozen kids turns read with a child aged 4 and 10, the
 *     two-player animal rescue's first turn and switch turn (setup round 3's stored chain) at 4, 7 and 10, and two
 *     setups at 10 (kidsAgesCases.ts); no calls; they then run with --run --stage kids-ages --prompt-state adopted16,
 *     --role beat (production's turn and kidsAges, each turn with production's one checked retry) and --role setup
 *   --kids-ages  the stage's report, no calls: each turn read whole (checkedTurns.ts), every player's kept text read for
 *     its length and plainness against its band's limits (kidsReadability.ts), per age and player count, the variant
 *     against production under the stop rule, the retries, the automatic checks, the waits and cost, and the setups'
 *     stats; kids-ages.md and .json
 *   --balance-sim [--arms <beat keys>] [--prompt-state <tag>]  B6's balance simulation over the stored challenge
 *     options of today's form (balanceSim.ts), balance-sim.md; no API calls
 *   --setup-chain [--cases <chain ids>] [--samples N] [--max-spend 0.20] [--report-only] [--merge <chain file>]  setup
 *     round 3's setup-to-play chain (setupChain.ts): new setups on the final form, played through the first chapter;
 *     prep-calls.jsonl, in the setup-rounds stage; writes setup-chain.md and .json with the runs the file already
 *     holds (--samples picks the chain's sample, default 1; --report-only renders afresh without calls; --merge adds
 *     another chain file's runs)
 *   --playthroughs [--round 2] [--cases <story ids>] [--samples N] [--turns N] [--max-spend 0.70] [--report-only]  whole-story
 *     playthroughs on production's own code (playthroughs.ts, playthroughMode.ts): four new setups played to their
 *     ending by an automated player, then the judged stage and ending checks; prep-calls.jsonl, in the playthroughs
 *     stage under adopted4; writes playthroughs.md and .json and a page per story in stories/ (--turns stops each
 *     story after that many turns, the smoke; --report-only renders afresh without calls). --round 2: the second round
 *     on production's current code (the same four and two more, the player pressing Try again once where a turn fails
 *     twice, the judged options and results checks too), in the playthroughs-2 stage under adopted7; writes
 *     playthroughs-2.md and .json and its pages in stories/round2/
 * Filters: --role setup,beat,switch,thread,iteration (analysis = switch+thread),
 *   --mode isolated|pipeline, --arms, --cases, --samples N, --subset15,
 *   --no-mp-continuations (drops multiplayer beats other than first beats and endings),
 *   --rare-failure skip|only (leaves out, or plans only, the rare-failure batch)
 * Budget: --max-spend <usd> (this invocation), --global-cap, --stage-cap,
 *   --over-target-reason "<text>" (a --run that raises --stage-cap also needs --arms);
 *   --tpm <tokens/min per model>; --out <dir>
 * Reads only local files under data/ and the frozen cases; never touches a database.
 */

type Mode =
  | "dry-run"
  | "probe"
  | "build-cases"
  | "run"
  | "rating-page"
  | "rerender-page"
  | "score"
  | "filter-check"
  | "check-baselines"
  | "results"
  | "build-round-cases"
  | "backfill-chapters"
  | "judge-calibration"
  | "judge-records"
  | "judge-groups"
  | "build-stage-cases"
  | "judge-stages"
  | "build-ending-cases"
  | "judge-endings"
  | "build-choice-cases"
  | "judge-choice-results"
  | "choice-line-sp"
  | "build-settled-cases"
  | "judge-settled"
  | "build-recorded-cases"
  | "judge-recorded"
  | "build-lever-cases"
  | "judge-levers"
  | "build-parallel-cases"
  | "judge-parallel"
  | "build-challenge-cases"
  | "judge-challenge-results"
  | "build-kids-cases"
  | "kids-turns"
  | "build-money-cases"
  | "judge-money"
  | "build-late-pacing-cases"
  | "late-pacing-play"
  | "judge-clues"
  | "build-kids-ages-cases"
  | "kids-ages"
  | "balance-sim"
  | "setup-chain"
  | "playthroughs";

type Args = {
  mode: Mode;
  stage?: Stage;
  promptState?: string;
  roles: EvalRole[];
  mode2: "isolated" | "pipeline";
  armKeys?: string[];
  caseIds?: string[];
  samples?: number;
  subset15: boolean;
  skipMultiplayerContinuations: boolean;
  rareFailure?: "skip" | "only";
  maxSpend?: number;
  globalCap?: number;
  stageCap?: number;
  overTargetReason?: string;
  tpm: number;
  outDir: string;
  rebuildCases: boolean;
  ratingKind?: RatingKind;
  items?: number;
  /** Rating pages: candidates shown beside the baseline per item, rotated */
  perItem?: number;
  /** Rating pages: the reference against one candidate, Which is better? per item */
  pairwise: boolean;
  /** Rating pages: the repeated item (--no-repeat turns it off) */
  repeat: boolean;
  /** Pairwise turn pages: the chapter-opening items' two chains (reference, candidate), and how many */
  chainArmKeys?: string[];
  chainItems?: number;
  preview: boolean;
  /** Preview pages from stored beats and setups (no eval output needed) */
  stored: boolean;
  scoreFile?: string;
  /** --rerender-page: the page whose key to render afresh */
  pageId?: string;
  /** --filter-check --fresh: ask every case again; earlier records stay in the ledger */
  fresh: boolean;
  /** --check-baselines --ratings: rating exports whose rank-1 picks to read the checks against */
  ratingsFiles: string[];
  /** Pairwise pages: a round's own questions (--criteria turn-round2) */
  criteria?: PairwiseCriteriaSet;
  /** --setup-chain --report-only: render setup-chain.md afresh from setup-chain.json, no calls */
  reportOnly: boolean;
  /** --setup-chain --merge <file>: add another chain file's runs */
  mergeFile?: string;
  /** --playthroughs --turns N: each story only to that many turns (the smoke) */
  turns?: number;
  /** --playthroughs --round N: the round to play or render (1, the default, or 2) */
  round?: 1 | 2;
  /** --frames nearer: the nearer chapter frames (the owner's feedback of 2026-09-28) for the backfill, the judge and a turn page */
  frames?: FrameSet;
  /** --chain-cases: the chapter-opening items' cases on a pairwise turn page (turns-r1b: the old page's four) */
  chainCaseIds?: string[];
};

class UsageError extends Error {}

const DEFAULT_PROBE_MAX_SPEND = 1;
const DEFAULT_BUILD_MAX_SPEND = 0.75;
const DEFAULT_ITEMS: Record<RatingKind, number> = { setup: 6, turn: 15 };
/** The round pages: nine setup premises (setup doc section 4), about 14 turns (turn doc round 1) */
const DEFAULT_PAIRWISE_ITEMS: Record<RatingKind, number> = { setup: 9, turn: 14 };
/** Turn round 1's page: 3-4 chapter-opening items beside about 10 chapter steps (turn doc section 4) */
const DEFAULT_CHAIN_ITEMS = 4;
const MAX_IN_FLIGHT = 6;

function numberArg(name: string, value: string | undefined): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new UsageError(`${name} needs a number`);
  return n;
}

function rolesArg(value: string | undefined): EvalRole[] {
  const roles = (value ?? "").split(",").flatMap((r) => (r === "analysis" ? ["switch", "thread"] : [r]));
  for (const role of roles) {
    if (!EVAL_ROLES.includes(role as EvalRole)) throw new UsageError(`Unknown role ${role}`);
  }
  return roles as EvalRole[];
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    mode: "dry-run",
    roles: ["setup", "beat", "switch", "thread"],
    mode2: "isolated",
    subset15: false,
    skipMultiplayerContinuations: false,
    tpm: DEFAULT_TOKENS_PER_MINUTE,
    outDir: path.resolve(process.cwd(), "..", "DOCS", "2026-09-26_gpt6-text-eval"),
    rebuildCases: false,
    pairwise: false,
    repeat: true,
    preview: false,
    stored: false,
    fresh: false,
    ratingsFiles: [],
    reportOnly: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    switch (arg) {
      case "--dry-run":
      case "--probe":
      case "--build-cases":
      case "--run":
      case "--filter-check":
      case "--check-baselines":
      case "--results":
      case "--build-round-cases":
      case "--backfill-chapters":
      case "--judge-calibration":
      case "--judge-records":
      case "--judge-groups":
      case "--build-stage-cases":
      case "--judge-stages":
      case "--build-ending-cases":
      case "--judge-endings":
      case "--build-choice-cases":
      case "--judge-choice-results":
      case "--choice-line-sp":
      case "--build-settled-cases":
      case "--judge-settled":
      case "--build-recorded-cases":
      case "--judge-recorded":
      case "--build-lever-cases":
      case "--judge-levers":
      case "--build-parallel-cases":
      case "--judge-parallel":
      case "--build-challenge-cases":
      case "--judge-challenge-results":
      case "--build-kids-cases":
      case "--kids-turns":
      case "--build-money-cases":
      case "--judge-money":
      case "--build-late-pacing-cases":
      case "--late-pacing-play":
      case "--judge-clues":
      case "--build-kids-ages-cases":
      case "--kids-ages":
      case "--balance-sim":
      case "--setup-chain":
      case "--playthroughs":
        args.mode = arg.slice(2) as Mode;
        break;
      case "--turns":
        args.turns = numberArg(arg, next());
        break;
      case "--round": {
        const round = numberArg(arg, next());
        if (round !== 1 && round !== 2) throw new UsageError("--round is 1 (the first playthroughs) or 2 (the second, on production's current code)");
        args.round = round;
        break;
      }
      case "--criteria": {
        const value = next();
        if (value !== "turn-round2" && value !== "groups" && value !== "options") {
          throw new UsageError("--criteria is turn-round2 (a pairwise turn page with turn round 2's questions), groups (the group round's) or options (the options and continuity page's)");
        }
        args.criteria = value === "turn-round2" ? "turnRound2" : value;
        break;
      }
      case "--ratings":
        args.ratingsFiles = (next() ?? "").split(",").filter(Boolean).map((file) => path.resolve(file));
        break;
      case "--rating-page": {
        args.mode = "rating-page";
        const kind = next();
        if (kind !== "setup" && kind !== "turn") throw new UsageError("--rating-page needs setup or turn");
        args.ratingKind = kind;
        break;
      }
      case "--rerender-page":
        args.mode = "rerender-page";
        args.pageId = next();
        if (!args.pageId) throw new UsageError("--rerender-page needs a page id (the key's -<pageId>.json suffix)");
        break;
      case "--score":
        args.mode = "score";
        args.scoreFile = path.resolve(next() ?? "");
        break;
      case "--stage": {
        const stage = next();
        if (!STAGES.includes(stage as Stage)) throw new UsageError(`--stage is one of ${STAGES.join(", ")}`);
        args.stage = stage as Stage;
        break;
      }
      case "--prompt-state":
        args.promptState = next();
        break;
      case "--role":
        args.roles = rolesArg(next());
        break;
      case "--mode": {
        const mode = next();
        if (mode !== "isolated" && mode !== "pipeline") throw new UsageError("--mode is isolated or pipeline");
        args.mode2 = mode;
        break;
      }
      case "--arms":
        args.armKeys = (next() ?? "").split(",").filter(Boolean);
        break;
      case "--cases":
        args.caseIds = (next() ?? "").split(",").filter(Boolean);
        break;
      case "--samples":
        args.samples = numberArg(arg, next());
        break;
      case "--subset15":
        args.subset15 = true;
        break;
      case "--no-mp-continuations":
        args.skipMultiplayerContinuations = true;
        break;
      case "--rare-failure": {
        const value = next();
        if (value !== "skip" && value !== "only") throw new UsageError("--rare-failure is skip or only");
        args.rareFailure = value;
        break;
      }
      case "--per-item":
        args.perItem = numberArg(arg, next());
        break;
      case "--pairwise":
        args.pairwise = true;
        break;
      case "--chain-arms":
        args.chainArmKeys = (next() ?? "").split(",").filter(Boolean);
        break;
      case "--chain-items":
        args.chainItems = numberArg(arg, next());
        break;
      case "--no-repeat":
        args.repeat = false;
        break;
      case "--max-spend":
        args.maxSpend = numberArg(arg, next());
        break;
      case "--global-cap":
        args.globalCap = numberArg(arg, next());
        break;
      case "--stage-cap":
        args.stageCap = numberArg(arg, next());
        break;
      case "--over-target-reason":
        args.overTargetReason = next();
        break;
      case "--tpm":
        args.tpm = numberArg(arg, next());
        break;
      case "--out":
        args.outDir = path.resolve(next() ?? "");
        break;
      case "--rebuild-cases":
        args.rebuildCases = true;
        break;
      case "--items":
        args.items = numberArg(arg, next());
        break;
      case "--preview":
        args.preview = true;
        break;
      case "--stored":
        args.stored = true;
        break;
      case "--fresh":
        args.fresh = true;
        break;
      case "--report-only":
        args.reportOnly = true;
        break;
      case "--merge":
        args.mergeFile = path.resolve(next() ?? "");
        break;
      case "--frames": {
        const value = next();
        if (value !== "backfilled" && value !== "nearer") throw new UsageError("--frames is backfilled or nearer");
        args.frames = value;
        break;
      }
      case "--chain-cases":
        args.chainCaseIds = (next() ?? "").split(",").filter(Boolean);
        break;
      default:
        throw new UsageError(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function guardEnvironment(): { storiesDir: string; templatesDir: string; checkpointsDir: string } {
  if (process.env.NODE_ENV === "production") {
    throw new UsageError("Refusing to run with NODE_ENV=production.");
  }
  const repoRoot = path.resolve(process.cwd(), "..");
  const storiesDir = path.resolve(getStoragePath("stories"));
  const templatesDir = path.resolve(getStoragePath("templates"));
  const checkpointsDir = path.resolve(repoRoot, "data", "story_checkpoints");
  const insideRepo = (dir: string) => dir.startsWith(repoRoot + path.sep);
  const ok =
    fs.existsSync(path.join(repoRoot, ".git")) &&
    insideRepo(storiesDir) &&
    insideRepo(templatesDir) &&
    fs.existsSync(storiesDir) &&
    fs.existsSync(templatesDir);
  if (!ok) {
    throw new UsageError(
      "Local data/stories and data/templates were not found inside the repo. Run this from server/: npm run eval:text"
    );
  }
  return { storiesDir, templatesDir, checkpointsDir };
}

function requireApiKey() {
  if (!process.env.OPENAI_API_KEY) {
    throw new UsageError("OPENAI_API_KEY is not set (expected in server/.env).");
  }
}

function newStory(template: StoryTemplate, playerCount: PlayerCount, caseId: string) {
  const maxTurns = Math.min(Math.max(DEFAULT_TURNS, template.maxTurnsMin || DEFAULT_TURNS), template.maxTurnsMax || DEFAULT_TURNS);
  const difficulty =
    template.difficultyLevels.find((d) => d.modifier === 0) ?? template.difficultyLevels[0] ?? { title: "Balanced", modifier: 0 };
  const codes = Object.fromEntries(Array.from({ length: playerCount }, (_, i) => [`player${i + 1}`, `EVAL${i + 1}`]));
  return createStoryStateFromTemplate(caseId, template, playerCount, maxTurns, template.containsImages, true, difficulty, codes);
}

/**
 * Spend outside calls.jsonl: the probe's (probe.json, Stage 0), the filter
 * check's (filter-check.jsonl) and the turn rounds' preparation calls
 * (prep-calls.jsonl, their own stage).
 */
function extraSpend(files: EvalFiles): SpendRecord[] {
  return spendBeside(files, "calls");
}

function capsFor(args: Args, files: EvalFiles, stage: LedgerStage, defaultMaxSpend?: number): Caps {
  const { caps, override } = resolveCaps({
    stage,
    stageCap: args.stageCap,
    globalCap: args.globalCap,
    maxSpend: args.maxSpend ?? defaultMaxSpend,
    overTargetReason: args.overTargetReason,
    forRun: args.mode === "run",
    armKeys: args.armKeys,
  });
  if (override) {
    files.appendOverride(override);
    console.log(`Cap raised above the owner's target (${override.reason}); recorded in budget-overrides.jsonl.`);
  }
  return caps;
}

function planOptions(args: Args, stage: Stage, promptState: string, records: PlanOptions["records"], extra: Partial<PlanOptions> = {}): PlanOptions {
  return {
    stage,
    promptState,
    roles: args.roles,
    mode: args.mode2,
    armKeys: args.armKeys,
    caseIds: args.caseIds,
    samples: args.samples,
    subset15: args.subset15,
    skipMultiplayerContinuations: args.skipMultiplayerContinuations,
    rareFailure: args.rareFailure,
    records,
    ...extra,
  };
}

function localSources(dirs: ReturnType<typeof guardEnvironment>): LocalCaseSources {
  return {
    snapshots: loadStoredSnapshots(dirs.storiesDir, dirs.checkpointsDir),
    templates: loadTemplates(dirs.templatesDir),
    newStory,
  };
}

async function dryRun(args: Args, files: EvalFiles, dirs: ReturnType<typeof guardEnvironment>) {
  const records = files.readRecords();
  await printDryRun({
    outDir: files.outDir,
    records,
    extraSpend: extraSpend(files),
    frozenCases: files.casesExist() ? files.readCases() : undefined,
    sources: localSources(dirs),
    options: (stage, promptState, extra) => planOptions(args, stage, promptState, records, extra),
    promptState: args.promptState,
    samples: args.samples,
    tpm: args.tpm,
    maxInFlight: MAX_IN_FLIGHT,
    log: (line) => console.log(line),
  });
  printPrepPlan(files, (line) => console.log(line));
  for (const round of Object.values(PLAYTHROUGH_ROUNDS)) printPlaythroughPlan(files, (line) => console.log(line), round);
  printLatePacingPlan(files, (line) => console.log(line));
}

const DEFAULT_PREP_MAX_SPEND = 0.1;

/**
 * The rounds' own calls (turnPrep.ts, and setup round 3's chain), each capped
 * by its stage (turn-rounds, or setup-rounds for the chain) and --max-spend.
 */
function prepContext(args: Args, files: EvalFiles, stage: LedgerStage = "turn-rounds", defaultMaxSpend = DEFAULT_PREP_MAX_SPEND): PrepContext {
  requireApiKey();
  const caps = capsFor(args, files, stage, defaultMaxSpend);
  return {
    files,
    caps,
    deps: (ledger) => runnerDeps(files, ledger),
    refuse: (stage, estimate) => refuseIfOverCaps(caps, files, stage, estimate),
    tpm: args.tpm,
    maxInFlight: MAX_IN_FLIGHT,
    log: (line) => console.log(line),
  };
}

/** A mode's context that sends nothing (--report-only): the default caps, and runner deps that refuse any call. */
function reportContext(files: EvalFiles): PrepContext {
  return {
    files,
    caps: resolveCaps({}).caps,
    deps: () => {
      throw new UsageError("--report-only sends no call");
    },
    refuse: () => undefined,
    tpm: DEFAULT_TOKENS_PER_MINUTE,
    maxInFlight: MAX_IN_FLIGHT,
    log: (line) => console.log(line),
  };
}

function refuseIfOverCaps(caps: Caps, files: EvalFiles, stage: LedgerStage, estimate: number) {
  const spend = spentByStage([...files.readRecords(), ...extraSpend(files)]);
  const problems = [
    spend.byStage[stage] + estimate > caps.stageCaps[stage] ? `Stage ${stage} cap $${caps.stageCaps[stage]} (spent $${spend.byStage[stage].toFixed(2)})` : "",
    spend.total + estimate > caps.globalCap ? `global cap $${caps.globalCap} (spent $${spend.total.toFixed(2)})` : "",
    caps.maxSpend !== undefined && estimate > caps.maxSpend ? `--max-spend $${caps.maxSpend}` : "",
  ].filter(Boolean);
  if (problems.length) {
    throw new UsageError(`Estimated $${estimate.toFixed(2)} would exceed: ${problems.join("; ")}. Nothing was sent.`);
  }
}

/** Runner deps that append each attempt to calls.jsonl, or to prep-calls.jsonl for the rounds' own calls. */
function runnerDeps(files: EvalFiles, ledger: "calls" | "prep" = "calls") {
  return {
    execute: (spec: Parameters<typeof executeCall>[0]) => executeCall(spec, { outDir: files.outDir, now: Date.now }),
    record: (record: Parameters<EvalFiles["appendRecord"]>[0]) => {
      if (ledger === "prep") files.appendPrepRecord(record);
      else files.appendRecord(record);
      console.log(
        `${record.caseId} ${record.callArmKey} s${record.sample} step ${record.step} attempt ${record.attempt}: ${record.outcome}${record.status && record.status >= 400 ? ` ${record.status}` : ""} (${(record.latencyMs / 1000).toFixed(1)} s, $${record.costUsd.toFixed(4)})`
      );
    },
    now: Date.now,
    sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    warn: (line: string) => console.warn(`WARNING: ${line}`),
  };
}

async function probe(args: Args, files: EvalFiles) {
  requireApiKey();
  const caps = capsFor(args, files, "0", DEFAULT_PROBE_MAX_SPEND);
  const maxSpendUsd = caps.maxSpend ?? DEFAULT_PROBE_MAX_SPEND;
  refuseIfOverCaps(caps, files, "0", maxSpendUsd);
  const previous = files.readProbe();
  const report = await runProbe(new OpenAI({ maxRetries: 0, timeout: 120_000 }), {
    maxSpendUsd,
    log: (line) => console.log(`  ${line}`),
    executeCall: (spec) => executeCall(spec, { outDir: files.outDir, now: Date.now }),
  });
  report.priorSpendUsd = previous ? previous.totalCostUsd + (previous.priorSpendUsd ?? 0) : undefined;
  files.writeProbe(report);
  console.log(`Probe spend: $${report.totalCostUsd.toFixed(4)}. Wrote probe.json.`);
}

async function buildCasesMode(args: Args, files: EvalFiles, dirs: ReturnType<typeof guardEnvironment>) {
  requireApiKey();
  if (files.casesExist() && !args.rebuildCases) {
    throw new UsageError("Cases are already frozen. --rebuild-cases replaces them (and changes the eval's inputs).");
  }
  const caps = capsFor(args, files, "0", DEFAULT_BUILD_MAX_SPEND);
  refuseIfOverCaps(caps, files, "0", 0);
  const records = files.readRecords();
  const deps = runnerDeps(files);
  // Each build call is its own runner pass, so --max-spend is carried across them here
  let buildSpent = 0;
  const { cases, report } = await buildCases({
    ...localSources(dirs),
    callBaseline: async (role, caseId, request, players) => {
      const job = requestJob({ stage: "0", promptState: PRE_FIX_PROMPT_STATE, caseId, role, arm: baselineArm(role), players, request, records });
      const remaining: Caps = { ...caps, maxSpend: caps.maxSpend === undefined ? undefined : caps.maxSpend - buildSpent };
      const result = await runJobs([job], deps, { caps: remaining, previous: records, extraSpend: extraSpend(files), tokensPerMinute: args.tpm });
      buildSpent += result.records.reduce((sum, r) => sum + r.costUsd, 0);
      records.push(...result.records);
      if (result.stoppedReason) console.warn(`Stopped: ${result.stoppedReason}`);
      // The record that finished the job, from this invocation or an earlier one (never a stale rejected request)
      const final = finishingRecord(records, keyOf(job));
      return final && usable(final) ? files.loadOutput(final) : undefined;
    },
    log: (line) => console.log(line),
  });
  files.writeCases(cases, report);
  console.log(`Froze ${cases.length} cases. Thread types: ${JSON.stringify(report.threadTypes)}. Skipped: ${report.skipped.length}`);
  for (const line of report.skipped) console.log(`  skipped: ${line}`);
}

async function run(args: Args, files: EvalFiles) {
  if (!args.stage || !args.promptState) throw new UsageError("--run needs --stage and --prompt-state.");
  const retired = retiredPromptStateProblem(args.promptState);
  if (retired) throw new UsageError(retired);
  requireApiKey();
  if (!files.casesExist()) throw new UsageError("No frozen cases. Run --build-cases first.");
  const caps = capsFor(args, files, args.stage);
  const records = files.readRecords();
  const cases = files.readCases();
  const jobs = planJobs(cases, planOptions(args, args.stage, args.promptState, records));
  const finished = finishedJobKeys(records);
  const estimate = jobs.filter((j) => !finished.has(keyOf(j))).reduce((sum, j) => sum + jobEstimateUsd(j), 0);
  refuseIfOverCaps(caps, files, args.stage, estimate);
  console.log(`${jobs.length} jobs (${jobs.filter((j) => !finished.has(keyOf(j))).length} open), est $${estimate.toFixed(2)}`);
  const result = await runJobs(jobs, runnerDeps(files), {
    caps,
    previous: records,
    extraSpend: extraSpend(files),
    tokensPerMinute: args.tpm,
    maxInFlight: MAX_IN_FLIGHT,
  });
  writeResults(files, caps, cases);
  console.log(`${result.stoppedReason ? `Stopped: ${result.stoppedReason}` : "Run complete"}. Wrote results.md.`);
}

/** results.md afresh from the stored records and outputs, after a reading changed (the stop rule of 2026-09-27); no API calls. */
function resultsMode(args: Args, files: EvalFiles) {
  if (!files.casesExist()) throw new UsageError("No frozen cases. Run --build-cases first.");
  writeResults(files, resolveCaps({ globalCap: args.globalCap }).caps, files.readCases());
  console.log(`Wrote results.md in ${files.outDir}`);
}

function writeResults(files: EvalFiles, caps: Caps, cases: EvalCase[]) {
  const records = files.readRecords();
  const { checks, prose } = checksForRecords(records, cases, files.loadOutput, files.loadReplyContent, files.loadPrompt);
  files.writeResults(
    renderResults({
      records,
      checks,
      tags: new Map(cases.map((c) => [c.id, c.tags])),
      caps,
      probe: files.readProbe(),
      filterCheckUsd: filterSpendUsd(files.readFilterRecords()),
      sideSpend: prepSpend(files.readPrepRecords()),
      prose,
      // A chain's turn is rebuilt from its own stored plan, so the chains' records and outputs go along
      storedReference: rebuiltToday(cases, { records, load: files.loadOutput }),
      sameRequest: sameRequestAs(cases),
      turnKinds: new Map(cases.flatMap((c) => {
        const kind = turnKindOf(c);
        return kind ? [[c.id, kind] as const] : [];
      })),
      generatedAt: new Date(),
    })
  );
}

/** The content filter's fixed test set on each arm, through the production filter path. */
async function filterCheck(args: Args, files: EvalFiles) {
  requireApiKey();
  const armKeys = args.armKeys?.length ? args.armKeys : DEFAULT_FILTER_ARMS;
  const arms = armKeys.map((key) => {
    const arm = FILTER_ARMS.find((a) => a.key === key);
    if (!arm) throw new UsageError(`Unknown filter arm ${key}; one of ${FILTER_ARMS.map((a) => a.key).join(", ")}`);
    return arm;
  });
  const caps = capsFor(args, files, "filter");
  // --fresh asks every case again (after a prompt, model or limit change); the ledger keeps every record
  const previous = args.fresh ? [] : files.readFilterRecords();
  // Priced as if every open case ran on every arm: an upper bound, never low
  refuseIfOverCaps(caps, files, "filter", filterCheckEstimateUsd(openFilterCases(FILTER_CASES, armKeys, previous), armKeys));
  const base = spentByStage([...files.readRecords(), ...extraSpend(files)]);
  const result = await runFilterCheck({
    cases: FILTER_CASES,
    arms,
    previous,
    deps: {
      classifierFor: (arm, fetch) => contentFilterClassifier(armSettings(arm), { configuration: { fetch } }),
      fetch: (input, init) => fetch(input, init),
      now: Date.now,
      record: (record) => files.appendFilterRecord(record),
      budget: (estimateUsd, invocationSpent) =>
        budgetCheck(
          caps,
          {
            byStage: { ...base.byStage, filter: base.byStage.filter + invocationSpent },
            total: base.total + invocationSpent,
          },
          invocationSpent,
          "filter",
          estimateUsd
        ),
      log: (line) => console.log(line),
    },
  });
  const records = files.readFilterRecords();
  // The report shows every arm with records; the console reads this run's arms
  const reported = FILTER_ARMS.map((a) => a.key).filter((key) => records.some((r) => r.armKey === key));
  const scores = scoreFilterCheck(records, FILTER_CASES, reported);
  files.writeFilterReport(renderFilterReport(scores, records, FILTER_CASES, new Date()));
  for (const s of scores.filter((score) => armKeys.includes(score.armKey))) {
    console.log(`${s.armKey}: ${s.passes ? "passes" : "fails"} (missed refusals: ${s.missedRefusals.join(", ") || "none"}; refused allowed: ${s.refusedAllowed.join(", ") || "none"}; unavailable: ${s.unavailable.join(", ") || "none"})`);
  }
  console.log(`${result.stoppedReason ? `Stopped: ${result.stoppedReason}` : "Filter check complete"}. This run spent $${filterSpendUsd(result.records).toFixed(4)}. Wrote filter-check.md.`);
}

/** `promptState:armKey` or a bare key in --prompt-state; a chain key ("pipeline:…") is never read as a state. */
function armRefs(args: Args, keys: string[] | undefined = args.armKeys): ArmRef[] {
  const promptState = args.promptState ?? "prefix";
  return (keys ?? []).map((ref) => {
    const colon = ref.indexOf(":");
    return colon > 0 && !ref.slice(0, colon).includes("@") && !ref.startsWith("pipeline:")
      ? { promptState: ref.slice(0, colon), armKey: ref.slice(colon + 1) }
      : { promptState, armKey: ref };
  });
}

/** Eval outputs, or (--preview --stored) the stored beats and custom-story setups, for a layout check. */
async function ratingMaterial(args: Args, files: EvalFiles, dirs: ReturnType<typeof guardEnvironment>, kind: RatingKind) {
  if (!args.stored) {
    return { arms: armRefs(args), cases: files.readCases(), records: files.readRecords(), loadOutput: files.loadOutput };
  }
  if (!args.preview) throw new UsageError("--stored is for --preview pages only.");
  const cases = files.casesExist() ? files.readCases() : (await localCases(localSources(dirs))).cases;
  const custom = loadStoryStates(dirs.storiesDir).filter((s) => !s.templateId);
  return { arms: [STORED_ARM], ...previewSource(kind, cases, custom) };
}

async function ratingPage(args: Args, files: EvalFiles, dirs: ReturnType<typeof guardEnvironment>) {
  const kind = args.ratingKind as RatingKind;
  const { arms, cases, records, loadOutput } = await ratingMaterial(args, files, dirs, kind);
  if (arms.length === 0) throw new UsageError("--rating-page needs --arms <baseline,candidate,…>.");
  if (arms.length === 1 && !args.preview) throw new UsageError("A real rating page needs at least two arms (or --preview).");
  if (args.pairwise && arms.length !== 2) {
    throw new UsageError("--pairwise needs exactly two arms: --arms <reference>,<candidate>.");
  }
  const items = args.items ?? (args.pairwise ? DEFAULT_PAIRWISE_ITEMS : DEFAULT_ITEMS)[kind];
  const chainArms = args.chainArmKeys?.length ? armRefs(args, args.chainArmKeys) : undefined;
  if (chainArms && (!args.pairwise || chainArms.length !== 2)) throw new UsageError("--chain-arms needs --pairwise and exactly two chains: <reference>,<candidate>.");
  const { set, key } = planRatingSet(
    {
      kind,
      arms,
      items,
      preview: args.preview,
      perItem: args.perItem,
      caseIds: args.caseIds,
      pairwise: args.pairwise,
      repeat: args.repeat,
      ...(chainArms ? { chainArms, chainItems: args.chainItems ?? DEFAULT_CHAIN_ITEMS } : {}),
      ...(args.chainCaseIds?.length ? { chainCaseIds: args.chainCaseIds } : {}),
      ...(args.criteria ? { criteria: args.criteria } : {}),
      ...(args.frames === "nearer" ? { frames: "nearer" as const } : {}),
    },
    records,
    cases,
    { loadOutput, salt: crypto.randomBytes(16).toString("hex"), now: new Date() }
  );
  const html = renderRatingPage(set);
  const leaks = [...metadataLeaks(set), ...htmlLeaks(html, key)];
  if (leaks.length > 0) {
    throw new UsageError(`The page would reveal an arm; nothing written:\n  ${leaks.join("\n  ")}`);
  }
  const page = files.writeRatingPage(`${set.setId}-${set.pageId}.html`, html, args.preview);
  files.writeKey(key);
  console.log(`Wrote ${set.items.length} items to ${page}`);
  console.log(`Open: file:///${page.replace(/\\/g, "/")}`);
  for (const note of key.notes) console.log(`  note: ${note}`);
}

/** An existing page rendered afresh from its key, e.g. after a rendering fix; ratings in progress still apply. */
function rerenderPage(args: Args, files: EvalFiles) {
  const key = files.readKey(args.pageId as string);
  if (!key) throw new UsageError(`No answer key for page ${args.pageId} in ${files.at("keys")}.`);
  const set = ratingSetFromKey(key, files.readRecords(), files.readCases(), files.loadOutput);
  const html = renderRatingPage(set);
  const leaks = [...metadataLeaks(set), ...htmlLeaks(html, key)];
  if (leaks.length > 0) {
    throw new UsageError(`The page would reveal an arm; nothing written:\n  ${leaks.join("\n  ")}`);
  }
  const page = files.writeRatingPage(`${set.setId}-${set.pageId}.html`, html, false);
  console.log(`Re-rendered ${set.items.length} items to ${page} (key unchanged)`);
}

function score(args: Args, files: EvalFiles) {
  const exported = JSON.parse(fs.readFileSync(args.scoreFile as string, "utf-8")) as ExportedRatings;
  const key = files.readKey(exported.pageId);
  if (!key) throw new UsageError(`No answer key for page ${exported.pageId} in ${files.at("keys")}.`);
  if (key.mode === "pairwise") {
    const pairwise = scorePairwise(exported, key);
    files.writeScores(`${key.setId}-${key.pageId}`, renderPairwiseScores(pairwise), pairwise);
  } else {
    const scores = scoreRatings(exported, key);
    files.writeScores(`${key.setId}-${key.pageId}`, renderScores(scores), scores);
  }
  console.log(`Wrote scores/${key.setId}-${key.pageId}.md and .json`);
}

const READOUT_SAMPLES = 40;

/** The stat readouts on stored isolated beats, a hash-ordered sample for reading the check's false alarms by hand. */
function readoutSamples(records: CallRecord[], cases: EvalCase[], files: EvalFiles): BaselineReport["readouts"] {
  const byId = new Map(cases.map((c) => [c.id, c]));
  const hits = records.flatMap((r) => {
    const evalCase = byId.get(r.caseId);
    if (r.role !== "beat" || r.group !== "beat" || !r.final || !usable(r) || !r.outputFile || !evalCase?.state) return [];
    const output = files.loadOutput(r);
    if (output === undefined) return [];
    const story = caseStory(evalCase);
    const { reply } = repairBeatReply(story, output as SetOfBeatGenerationSchema);
    return statReadouts(story, reply).map((hit) => ({ arm: `${r.promptState}:${r.armKey}`, outputFile: r.outputFile as string, hit }));
  });
  return hits.sort((a, b) => sha256(`${a.outputFile}|${a.hit}`).localeCompare(sha256(`${b.outputFile}|${b.hit}`))).slice(0, READOUT_SAMPLES);
}

/** The new checks over every stored output, with their noise, the rated pages' picks, waits per turn kind and reference currency. */
function checkBaselinesMode(args: Args, files: EvalFiles) {
  const records = files.readRecords();
  const cases = files.readCases();
  const { checks, design } = checksForRecords(records, cases, files.loadOutput, files.loadReplyContent, files.loadPrompt);
  const rated = args.ratingsFiles.flatMap((file) => {
    const exported = JSON.parse(fs.readFileSync(file, "utf-8")) as ExportedRatings;
    const key = files.readKey(exported.pageId);
    if (!key) throw new UsageError(`No answer key for page ${exported.pageId} in ${files.at("keys")}.`);
    if (key.mode === "pairwise") {
      console.log(`  ${file}: a pairwise page; the rank-1 reading needs ranks, so it is left out`);
      return [];
    }
    return [{ key, exported }];
  });
  const report = checkBaselines({
    records,
    cases,
    design,
    all: checks,
    rated,
    // Today's production-form request for a case, as the executor hashes it; a case today's code cannot build has none
    todaysPromptHash: (evalCase) => todaysRequestHash(evalCase),
    readouts: readoutSamples(records, cases, files),
    frames: chapterFrameChecks(cases),
    nearerFrames: chapterFrameChecks(cases, "nearer"),
    generatedAt: new Date(),
  });
  files.writeCheckBaselines(renderCheckBaselines(report), report);
  console.log(`Checked ${report.replies} stored replies. Wrote check-baselines.md and .json in ${files.outDir}`);
}

/** The reference arm whose stored challenge sets B6's balance simulation scores (today's form on Luna medium). */
const BALANCE_SIM_ARMS = ["gpt-6-luna@medium/prod"];

/** B6's balance simulation over today's stored challenge options (balanceSim.ts); no API calls. */
function balanceSimMode(args: Args, files: EvalFiles) {
  const promptState = args.promptState ?? CURRENT_PROMPT_STATE;
  const armKeys = args.armKeys?.length ? args.armKeys : BALANCE_SIM_ARMS;
  const sets = storedChallengeSets(files.readRecords(), files.readCases(), files.loadOutput, armKeys, promptState);
  const text = renderBalanceSim(balanceSimulation(sets), new Date(), `${armKeys.join(", ")} under ${promptState}`);
  fs.writeFileSync(files.at("balance-sim.md"), text);
  console.log(`Scored ${sets.length} challenge sets. Wrote balance-sim.md in ${files.outDir}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dirs = guardEnvironment();
  const files = evalFiles(args.outDir);
  switch (args.mode) {
    case "probe":
      return probe(args, files);
    case "build-cases":
      return buildCasesMode(args, files, dirs);
    case "run":
      return run(args, files);
    case "rating-page":
      return ratingPage(args, files, dirs);
    case "rerender-page":
      return rerenderPage(args, files);
    case "score":
      return score(args, files);
    case "filter-check":
      return filterCheck(args, files);
    case "check-baselines":
      return checkBaselinesMode(args, files);
    case "results":
      return resultsMode(args, files);
    case "build-round-cases":
      return buildRoundCasesMode(prepContext(args, files), args.rebuildCases);
    case "backfill-chapters":
      // --stage routes the calls to a feedback run's own stage (the nearer backfill: plan-refresh); --cases runs a smoke
      return backfillChaptersMode(prepContext(args, files, args.stage), { frames: args.frames, stage: args.stage, caseIds: args.caseIds });
    case "judge-calibration":
      return judgeCalibrationMode(prepContext(args, files), args.armKeys, args.samples ?? DEFAULT_JUDGE_SAMPLES);
    case "judge-records":
      return judgeRecordsMode(prepContext(args, files, args.stage), args.armKeys, args.samples ?? DEFAULT_RECORD_JUDGE_SAMPLES, args.promptState ?? CURRENT_PROMPT_STATE, {
        caseIds: args.caseIds,
        frames: args.frames,
        stage: args.stage,
      });
    case "judge-groups":
      // The group round's judged check books to its own stage (groups) unless another is given
      return judgeGroupsMode(prepContext(args, files, args.stage ?? "groups"), args.armKeys, args.promptState ?? CURRENT_PROMPT_STATE, { stage: args.stage ?? "groups" });
    case "build-stage-cases":
      return buildStageCasesMode({ files, log: (line) => console.log(line) }, args.rebuildCases);
    case "judge-stages":
      // The stage scoping's judged check books to its own stage unless another is given
      return judgeStagesMode(prepContext(args, files, args.stage ?? "stage-scoping"), args.armKeys, args.promptState ?? CURRENT_PROMPT_STATE, {
        stage: args.stage ?? "stage-scoping",
        caseIds: args.caseIds,
      });
    case "build-ending-cases":
      return buildEndingCasesMode({ files, log: (line) => console.log(line) }, args.rebuildCases);
    case "judge-endings":
      // The ending's judged check books to its own stage unless another is given
      return judgeEndingsMode(prepContext(args, files, args.stage ?? "ending-state"), args.armKeys, args.promptState ?? CURRENT_PROMPT_STATE, {
        stage: args.stage ?? "ending-state",
        caseIds: args.caseIds,
      });
    case "build-choice-cases":
      return buildChoiceCasesMode({ files, log: (line) => console.log(line) }, args.rebuildCases);
    case "judge-choice-results":
      // The stage's judged checks book to its own stage unless another is given
      return judgeChoiceResultsMode(prepContext(args, files, args.stage ?? "choice-result"), { stage: args.stage ?? "choice-result", caseIds: args.caseIds });
    case "choice-line-sp":
      // The stage's options judge books to its own stage; --report-only renders the report afresh without a call
      return choiceLineMode(args.reportOnly ? reportContext(files) : prepContext(args, files, "choice-line-sp"), { reportOnly: args.reportOnly, caseIds: args.caseIds });
    case "build-settled-cases":
      return buildSettledCasesMode({ files, log: (line) => console.log(line) }, args.rebuildCases);
    case "judge-settled":
      // The stage's judged checks book to its own stage
      return judgeSettledMode(prepContext(args, files, "outcome-settled"), { caseIds: args.caseIds });
    case "build-recorded-cases":
      return buildRecordedCasesMode({ files, log: (line) => console.log(line) }, args.rebuildCases);
    case "judge-recorded":
      // The stage's judged check books to its own stage
      return judgeRecordedMode(prepContext(args, files, "recorded-result"), { caseIds: args.caseIds });
    case "build-lever-cases":
      return buildLeverCasesMode({ files, log: (line) => console.log(line) }, args.rebuildCases);
    case "judge-levers":
      // The stage's judged check books to its own stage
      return judgeLeversMode(prepContext(args, files, "lever-direction"), { caseIds: args.caseIds });
    case "build-parallel-cases":
      return buildParallelCasesMode({ files, log: (line) => console.log(line) }, args.rebuildCases);
    case "judge-parallel":
      // The stage's judged check books to its own stage
      return judgeParallelMode(prepContext(args, files, "parallel-threads"), { caseIds: args.caseIds });
    case "build-challenge-cases":
      return buildChallengeCasesMode({ files, log: (line) => console.log(line) }, args.rebuildCases);
    case "judge-challenge-results":
      // The stage's judged check books to its own stage
      return judgeChallengeResultsMode(prepContext(args, files, "challenge-results"), { caseIds: args.caseIds });
    case "build-kids-cases":
      return buildKidsCasesMode({ files, log: (line) => console.log(line) }, args.rebuildCases);
    case "kids-turns":
      // A deterministic check: no calls, so no key and no caps
      return kidsTurnsMode({ files, log: (line) => console.log(line) });
    case "build-money-cases":
      return buildMoneyCasesMode({ files, log: (line) => console.log(line) }, args.rebuildCases);
    case "judge-money":
      // The stage's judged check books to its own stage
      return judgeMoneyMode(prepContext(args, files, "money-adds-up"), { caseIds: args.caseIds });
    case "build-late-pacing-cases":
      return buildLatePacingCasesMode({ files, log: (line) => console.log(line) }, args.rebuildCases);
    case "late-pacing-play":
      // The short playthroughs book to the stage, one invocation at most the stage's cap unless --max-spend says less
      return latePacingPlayMode(args.reportOnly ? reportContext(files) : prepContext(args, files, "late-pacing", DEFAULT_STAGE_CAPS["late-pacing"]), {
        sample: args.samples ?? 1,
        caseIds: args.caseIds,
        turns: args.turns,
        reportOnly: args.reportOnly,
        armKeys: args.armKeys,
      });
    case "judge-clues":
      // The stage's judged checks book to its own stage
      return judgeCluesMode(prepContext(args, files, "late-pacing"), { caseIds: args.caseIds });
    case "build-kids-ages-cases":
      return buildKidsAgesCasesMode({ files, log: (line) => console.log(line) }, args.rebuildCases);
    case "kids-ages":
      // A deterministic check: no calls, so no key and no caps
      return kidsAgesMode({ files, log: (line) => console.log(line) });
    case "balance-sim":
      return balanceSimMode(args, files);
    case "setup-chain":
      return setupChainMode(prepContext(args, files, "setup-rounds", DEFAULT_CHAIN_MAX_SPEND), {
        sample: args.samples ?? 1,
        caseIds: args.caseIds,
        reportOnly: args.reportOnly,
        mergeFile: args.mergeFile,
      });
    case "playthroughs": {
      // Each round books to its own stage, and one invocation spends at most that stage's cap unless --max-spend says less
      const round = PLAYTHROUGH_ROUNDS[args.round ?? 1];
      return playthroughsMode(args.reportOnly ? reportContext(files) : prepContext(args, files, round.stage, DEFAULT_STAGE_CAPS[round.stage]), {
        sample: args.samples ?? 1,
        caseIds: args.caseIds,
        turns: args.turns,
        reportOnly: args.reportOnly,
        round,
      });
    }
    default:
      return dryRun(args, files, dirs);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
