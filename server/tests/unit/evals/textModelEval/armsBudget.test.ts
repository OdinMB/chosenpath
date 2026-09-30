import {
  armKey,
  armsFor,
  armSettings,
  baselineArm,
  ENDING_STATE_BUILT_CASES,
  ENDING_STATE_PROMPT_STATE,
  ENDING_STATE_STORED_CASES,
  estimateBaseKey,
  FINAL_CHECK_SETUP_PREMISES,
  FINAL_CHECK_TEMPLATE_PREMISES,
  makeArm,
  OPTIONS_CONTINUITY_PROMPT_STATE,
  OPTIONS_CONTINUITY_RETEST_CASES,
  OPTIONS_O2_CASES,
  OPTIONS_O2_PROMPT_STATE,
  pipelinePlans,
  productionArm,
  referenceKey,
  ROUND1_SETUP_PAGE_PREMISES,
  ROUND3_PROBLEM_TURN,
  ROUND3_REPLAY_CASES,
  ROUND3_REPLAY_SAMPLES,
  secondReferenceKeys,
  SETUP_R3C_PREMISES,
  SETUP_R3D_PREMISES,
  SETUP_RETEST_PREMISES,
  SETUP_SANITY_PREMISES,
  STAGE_SCOPING_LAST_CHAPTER_CASES,
  STAGE_SCOPING_NEW_CASES,
  STAGES,
  stageInterleavesArms,
  stagePlansCase,
  stageRunsBaseline,
  standInKey,
} from "../../../../src/evals/textModelEval/arms.js";
import { SETUP_PREMISES } from "../../../../src/evals/textModelEval/setupPremises.js";
import { referenceKeyOf } from "../../../../src/evals/textModelEval/variantComparison.js";
import {
  costFromUsage,
  estimateCall,
  MIN_MEASURED_RECORDS,
} from "../../../../src/evals/textModelEval/pricing.js";
import {
  budgetCheck,
  DEFAULT_STAGE_CAPS,
  FEEDBACK_STAGES,
  HARD_CEILING,
  LEDGER_STAGES,
  LEDGER_WHEN_FEEDBACK_OPENED,
  LEDGER_WHEN_ROUNDS_OPENED,
  resolveCaps,
  spentByStage,
  STAGE_CAP_REASONS,
  UNRECORDED_STAGE4_USD,
} from "../../../../src/evals/textModelEval/budget.js";
import { z } from "zod";
import { GameModes } from "core/types/index.js";
import { TEXT_MODEL_GROUPS } from "../../../../src/shared/llm/textModelSettings.js";
import { requestChars } from "../../../../src/evals/textModelEval/jobPlan.js";

describe("costFromUsage", () => {
  it("bills uncached, cached, cache-write and output tokens separately", () => {
    // 1M in of which 200K cached and 300K written; 1M out (reasoning included)
    const usage = { inputTokens: 1_000_000, cachedTokens: 200_000, cacheWriteTokens: 300_000, outputTokens: 1_000_000, reasoningTokens: 600_000 };
    // Sol: 0.5M × 2.00 + 0.2M × 0.20 + 0.3M × 2.50 + 1M × 10.00
    expect(costFromUsage("gpt-6-sol", usage)).toBeCloseTo(1 + 0.04 + 0.75 + 10);
    // A served snapshot name prices like its family; gpt-4.1-mini is not priced as gpt-4.1
    expect(costFromUsage("gpt-4.1-mini-2025-04-14", { ...usage, cacheWriteTokens: 0 })).toBeCloseTo(0.8 * 0.4 + 0.2 * 0.1 + 1.6);
  });

  it("refuses a model without a price", () => {
    expect(() => costFromUsage("o3", { inputTokens: 1, cachedTokens: 0, cacheWriteTokens: 0, outputTokens: 1 })).toThrow();
  });
});

describe("arm keys and estimates", () => {
  it("keys effort arms by effort and temperature arms by temperature", () => {
    expect(armKey({ model: "gpt-6-luna", reasoningEffort: "medium" }, "prod")).toBe("gpt-6-luna@medium/prod");
    expect(armKey({ model: "gpt-4.1-mini", temperature: 0.2 }, "prod")).toBe("gpt-4.1-mini@t0.2/prod");
    expect(armKey({ model: "gpt-6-sol", reasoningEffort: "low", verbosity: "low" }, "prod")).toBe("gpt-6-sol@low+vlow/prod");
  });

  it("maps a variant arm to its reference: the same arm without verbosity, else its variant's base", () => {
    expect(referenceKey("gpt-6-luna@medium/minimal")).toBe("gpt-6-luna@medium/prod");
    expect(referenceKey("gpt-6-luna@medium/rewriteSlim")).toBe("gpt-6-luna@medium/slim");
    expect(referenceKey("gpt-6-luna@medium+vlow/rewriteSlim")).toBe("gpt-6-luna@medium/rewriteSlim");
    expect(referenceKey("gpt-6-sol@low/rewriteZeroShot")).toBe("gpt-6-sol@low/rewrite");
    expect(referenceKey("gpt-4.1-mini@t0.2/rewrite")).toBe("gpt-4.1-mini@t0.2/prod");
  });

  it("reads the count fix against the same bases as the Stage 4 rewrite", () => {
    expect(referenceKey("gpt-6-luna@medium/rewrite2Slim")).toBe("gpt-6-luna@medium/slim");
    expect(referenceKey("gpt-6-sol@low/rewrite2")).toBe("gpt-6-sol@low/prod");
    expect(referenceKey("gpt-6-sol@low/rewrite2ZeroShot")).toBe("gpt-6-sol@low/rewrite2");
  });

  it("estimates the count fix from its Stage 4 form, and everything else from its reference", () => {
    expect(estimateBaseKey("gpt-6-luna@medium/rewrite2Slim")).toBe("gpt-6-luna@medium/rewriteSlim");
    expect(estimateBaseKey("gpt-6-sol@low/rewrite2")).toBe("gpt-6-sol@low/rewrite");
    expect(estimateBaseKey("gpt-6-sol@low/rewrite2ZeroShot")).toBe("gpt-6-sol@low/rewriteZeroShot");
    expect(estimateBaseKey("gpt-6-luna@medium+vlow/rewrite2Slim")).toBe("gpt-6-luna@medium/rewrite2Slim");
    expect(estimateBaseKey("gpt-6-luna@medium/rewriteSlim")).toBe("gpt-6-luna@medium/slim");
    expect(estimateBaseKey("gpt-6-luna@medium/prod")).toBeUndefined();
    expect(estimateBaseKey("pipeline:gpt-6-luna@low/minimal>gpt-6-luna@medium/minimal")).toBeUndefined();
  });

  it("gives no reference for a prod arm or a chain key", () => {
    expect(referenceKey("gpt-6-luna@medium/prod")).toBeUndefined();
    expect(referenceKey("pipeline:gpt-6-luna@low/minimal>gpt-6-luna@medium/minimal")).toBeUndefined();
  });

  it("runs Stage 4's gpt-4.1 and gpt-4.1-mini arms on the comparison baseline's settings", () => {
    const todays = (role: "setup" | "beat") =>
      armsFor("4", role)
        .map((plan) => plan.arm)
        .filter((arm) => arm.model.startsWith("gpt-4.1"));
    for (const role of ["setup", "beat"] as const) {
      expect(todays(role).length).toBeGreaterThan(0);
      for (const arm of todays(role)) expect(armSettings(arm)).toEqual(armSettings(baselineArm(role)));
    }
  });

  it("gives production's GPT-6 default per role and player count, on production's form, whatever env says", () => {
    const previous = process.env.MULTIPLAYER_TEXT_MODEL_NAME;
    process.env.MULTIPLAYER_TEXT_MODEL_NAME = "gpt-6-sol";
    try {
      expect(productionArm("beat", 1).key).toBe("gpt-6-luna@medium/prod");
      expect(productionArm("beat", 3).key).toBe("gpt-6-luna@low/prod");
      expect(productionArm("switch", 1).key).toBe("gpt-6-luna@low/prod");
      expect(productionArm("thread", 2).key).toBe("gpt-6-luna@low/prod");
      expect(productionArm("setup", 1).key).toBe("gpt-6-luna@low/prod");
      expect(productionArm("beat", 1).baseline).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.MULTIPLAYER_TEXT_MODEL_NAME;
      else process.env.MULTIPLAYER_TEXT_MODEL_NAME = previous;
    }
  });

  it("keeps the baseline on the stored pre-migration keys, whatever production env says", () => {
    const previous = process.env.TEXT_MODEL_NAME;
    process.env.TEXT_MODEL_NAME = "gpt-4.1-mini";
    try {
      // Production would refuse this env at startup; the eval never reads it
      expect(baselineArm("setup").key).toBe("gpt-4.1@t0.2/prod");
      expect(baselineArm("iteration").key).toBe("gpt-4.1@t0.2/prod");
      expect(baselineArm("beat").key).toBe("gpt-4.1-mini@t0.2/prod");
      expect(baselineArm("switch").key).toBe("gpt-4.1-mini@t0.2/prod");
      expect(baselineArm("thread").key).toBe("gpt-4.1-mini@t0.2/prod");
      expect(baselineArm("beat").baseline).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.TEXT_MODEL_NAME;
      else process.env.TEXT_MODEL_NAME = previous;
    }
  });

  it("switches from the table to measured medians once enough records exist", () => {
    const arm = makeArm({ model: "gpt-6-luna", reasoningEffort: "medium" });
    const base = { role: "beat" as const, arm, promptChars: 4_000, players: 1 };
    const fromTable = estimateCall(base);
    expect(fromTable.outputTokens).toBe(2_100 + 6_200);
    const few = estimateCall({ ...base, measuredOutputTokens: Array(MIN_MEASURED_RECORDS - 1).fill(1_000) });
    expect(few.outputTokens).toBe(fromTable.outputTokens);
    const enough = estimateCall({ ...base, measuredOutputTokens: [900, 1_000, 5_000] });
    expect(enough.outputTokens).toBe(1_000);
    expect(enough.inputTokens).toBe(1_000);
  });

  it("counts the schema as input, since OpenAI bills it", () => {
    const schema = z.object({ answer: z.string().describe("x".repeat(2_000)) });
    const chars = requestChars({ prompt: "p".repeat(1_000), schema });
    expect(chars).toBeGreaterThan(3_000);
    expect(chars).toBeLessThan(3_500);
  });
});

describe("the setup rounds' arms (setup doc section 4, rounds 1 and 2)", () => {
  it("runs round 1 on Luna low at two samples on every premise and Sol low once on the owner's round-1 page premises, then round 2's two arms on Luna low at two samples", () => {
    expect(armsFor("setup-rounds", "setup").map((plan) => [plan.arm.key, plan.samples, plan.scope, plan.caseIds])).toEqual([
      ["gpt-6-luna@low/setupR1", 2, "all", undefined],
      ["gpt-6-sol@low/setupR1", 1, "all", ROUND1_SETUP_PAGE_PREMISES],
      ["gpt-6-luna@low/setupR2", 2, "all", undefined],
      ["gpt-6-luna@low/setupR2Order", 2, "all", undefined],
      // Round 1b: round 1 with the round-1 report's one-sentence fixes; then round 2's two arms on its passing changes
      ["gpt-6-luna@low/setupR1b", 2, "all", undefined],
      // Round 1c: round 1b with proposal 1's one fix-and-retest
      ["gpt-6-luna@low/setupR1c", 2, "all", undefined],
      ["gpt-6-luna@low/setupR2b", 2, "all", undefined],
      ["gpt-6-luna@low/setupR2bOrder", 2, "all", undefined],
      // Round 3's confirmation run: the final setup form on every premise, two samples
      ["gpt-6-luna@low/setupR3", 2, "all", undefined],
      // The Casablanca sentence (2026-09-29): round 3c twice on the two premises whose player stats carried a premise's name
      ["gpt-6-luna@low/setupR3c", 2, "all", SETUP_R3C_PREMISES],
      // Its second retest: production's form to six samples on Casablanca (1 and 2 are stored), and round 3d six times
      ["gpt-6-luna@low/setupR3", 6, "all", SETUP_R3D_PREMISES],
      ["gpt-6-luna@low/setupR3d", 6, "all", SETUP_R3D_PREMISES],
    ]);
    expect(SETUP_R3C_PREMISES).toEqual(["setup-future-casablanca", "setup-custom-susan"]);
    expect(SETUP_R3D_PREMISES).toEqual(["setup-future-casablanca"]);
    expect(armsFor("setup-rounds", "setup").map((plan) => plan.fromSample)).toEqual([...Array(10).fill(undefined), 3, undefined]);
    for (const role of ["beat", "switch", "thread", "iteration"] as const) expect(armsFor("setup-rounds", role)).toEqual([]);
    // gpt-4.x is never a new arm; its stored records are comparisons only
    expect(armsFor("setup-rounds", "setup").every((plan) => plan.arm.model.startsWith("gpt-6-") && !plan.arm.baseline)).toBe(true);
  });

  it("reads round 1 against production's form of the same arm, and estimates it from there", () => {
    expect(referenceKey("gpt-6-luna@low/setupR1")).toBe("gpt-6-luna@low/prod");
    expect(referenceKey("gpt-6-sol@low/setupR1")).toBe("gpt-6-sol@low/prod");
    expect(estimateBaseKey("gpt-6-sol@low/setupR1")).toBe("gpt-6-sol@low/prod");
  });

  it("reads round 2's arm A against round 1 and arm B against arm A, so the order's effect stays apart", () => {
    expect(referenceKey("gpt-6-luna@low/setupR2")).toBe("gpt-6-luna@low/setupR1");
    expect(referenceKey("gpt-6-luna@low/setupR2Order")).toBe("gpt-6-luna@low/setupR2");
    expect(estimateBaseKey("gpt-6-luna@low/setupR2Order")).toBe("gpt-6-luna@low/setupR2");
  });

  it("reads round 2's arms against production's form too (their base never ran alone), and Sol's round 1 against Luna's", () => {
    expect(secondReferenceKeys("gpt-6-luna@low/setupR2")).toEqual(["gpt-6-luna@low/prod"]);
    expect(secondReferenceKeys("gpt-6-luna@low/setupR2Order")).toEqual(["gpt-6-luna@low/prod"]);
    expect(secondReferenceKeys("gpt-6-sol@low/setupR1")).toEqual(["gpt-6-luna@low/setupR1"]);
    expect(secondReferenceKeys("gpt-6-luna@low/setupR1")).toEqual([]);
    expect(secondReferenceKeys("gpt-6-luna@low/prod")).toEqual([]);
  });

  it("reads round 1b against today's prompt, as round 1 was read, and against round 1 as it ran", () => {
    expect(referenceKey("gpt-6-luna@low/setupR1b")).toBe("gpt-6-luna@low/prod");
    expect(estimateBaseKey("gpt-6-luna@low/setupR1b")).toBe("gpt-6-luna@low/prod");
    expect(secondReferenceKeys("gpt-6-luna@low/setupR1b")).toEqual(["gpt-6-luna@low/setupR1"]);
  });

  it("reads round 1c against today's prompt, and against round 1b, whose one change it retests", () => {
    expect(referenceKey("gpt-6-luna@low/setupR1c")).toBe("gpt-6-luna@low/prod");
    expect(secondReferenceKeys("gpt-6-luna@low/setupR1c")).toEqual(["gpt-6-luna@low/setupR1b"]);
  });

  it("reads both of round 2b's arms against the fixed round 1, arm B against arm A too, and both against today's prompt (the carry-forward guard)", () => {
    // The fixed round 1 is round 1c: round 1b with proposal 1's fix-and-retest
    expect(referenceKey("gpt-6-luna@low/setupR2b")).toBe("gpt-6-luna@low/setupR1c");
    expect(referenceKey("gpt-6-luna@low/setupR2bOrder")).toBe("gpt-6-luna@low/setupR1c");
    expect(secondReferenceKeys("gpt-6-luna@low/setupR2b")).toEqual(["gpt-6-luna@low/prod"]);
    expect(secondReferenceKeys("gpt-6-luna@low/setupR2bOrder")).toEqual(["gpt-6-luna@low/setupR2b", "gpt-6-luna@low/prod"]);
  });

  it("reads setup round 3 against the carried-forward form it builds on and against today's prompt (the stop rule's two readings)", () => {
    expect(referenceKey("gpt-6-luna@low/setupR3")).toBe("gpt-6-luna@low/setupR2bOrder");
    expect(estimateBaseKey("gpt-6-luna@low/setupR3")).toBe("gpt-6-luna@low/setupR2bOrder");
    expect(secondReferenceKeys("gpt-6-luna@low/setupR3")).toEqual(["gpt-6-luna@low/prod"]);
  });

  it("reads the chain's planner against planner v2 and its turn form against today's form", () => {
    expect(referenceKey("gpt-6-luna@low/planV2b")).toBe("gpt-6-luna@low/planV2");
    expect(referenceKey("gpt-6-luna@medium/turnB6")).toBe("gpt-6-luna@medium/prod");
  });

  it("reads turn round 2's form (and the smoke's draft) against today's form, and its paragraph arm against the round-2 form and today's form", () => {
    expect(referenceKey("gpt-6-luna@medium/turnR2b")).toBe("gpt-6-luna@medium/prod");
    expect(referenceKey("gpt-6-luna@medium/turnR2")).toBe("gpt-6-luna@medium/prod");
    expect(referenceKey("gpt-6-luna@medium/turnR2Paragraphs")).toBe("gpt-6-luna@medium/turnR2b");
    expect(secondReferenceKeys("gpt-6-luna@medium/turnR2Paragraphs")).toEqual(["gpt-6-luna@medium/prod"]);
    expect(secondReferenceKeys("gpt-6-luna@medium/turnR2b")).toEqual([]);
    // B5's fix-and-retest: against today's form, and against the round-2 form it retests
    expect(referenceKey("gpt-6-luna@medium/turnR2c")).toBe("gpt-6-luna@medium/prod");
    expect(secondReferenceKeys("gpt-6-luna@medium/turnR2c")).toEqual(["gpt-6-luna@medium/turnR2b"]);
  });

  it("reads turn round 3's request form (B9) against the round-2 form it sends, and against today's form (the carry-forward guard)", () => {
    expect(referenceKey("gpt-6-luna@medium/turnR3Form")).toBe("gpt-6-luna@medium/turnR2b");
    expect(secondReferenceKeys("gpt-6-luna@medium/turnR3Form")).toEqual(["gpt-6-luna@medium/prod"]);
    // Until B9 has measured outputs of its own, it is priced from the round-2 form's
    expect(estimateBaseKey("gpt-6-luna@medium/turnR3Form")).toBe("gpt-6-luna@medium/turnR2b");
  });

  it("names round 3's replay cases: the problem story turn (8988006e turn 4) and the problem first turn", () => {
    expect(ROUND3_PROBLEM_TURN).toBe("cont-8988006e-t4-o0");
    expect(ROUND3_REPLAY_CASES).toEqual(["cont-8988006e-t4-o0", "first-tpl-e401abf2-p1"]);
    expect(ROUND3_REPLAY_SAMPLES).toBe(5);
  });

  it("names the nine premises of the owner's round-1 setup page (key 3434afcc6f, the Casablanca control left out), all frozen premises", () => {
    expect([...ROUND1_SETUP_PAGE_PREMISES].sort()).toEqual(
      [
        "setup-custom-avalon",
        "setup-pretend-er-doctor",
        "setup-learn-lemonade",
        "setup-fiction-bounty-hunters",
        "setup-kids-animal-rescue",
        "setup-flexible-soul-flat",
        "setup-vent-berlin-flat",
        "setup-flexible-secret-society",
        "setup-pretend-cofounders",
      ].sort()
    );
    const premises = new Map(SETUP_PREMISES.map((p) => [p.id, p]));
    const players = ROUND1_SETUP_PAGE_PREMISES.map((id) => premises.get(id)?.playerCount);
    expect([1, 2, 3].map((n) => players.filter((p) => p === n).length)).toEqual([3, 3, 3]);
  });
});

describe("budget caps", () => {
  const spend = (stage0: number, stage12 = 0) =>
    spentByStage([
      { stage: "0", costUsd: stage0 },
      { stage: "1-2", costUsd: stage12 },
    ]);

  it("stops at the stage cap, the global cap and the invocation cap", () => {
    const { caps } = resolveCaps({ maxSpend: 1 });
    expect(budgetCheck(caps, spend(7.9), 0, "0", 0.2)).toMatchObject({ ok: false });
    expect(budgetCheck(caps, spend(7.5), 0, "0", 0.2)).toEqual({ ok: true });
    expect(budgetCheck(caps, spend(8, 12.9), 0, "1-2", 0.05)).toEqual({ ok: true });
    expect(budgetCheck(caps, spend(8, 12.9), 0, "1-2", 0.2)).toMatchObject({ ok: false });
    // Stage caps sum to $28, so the $40 global cap only binds after a raised stage cap
    const nearGlobal = spentByStage([{ stage: "0", costUsd: 8 }, { stage: "1-2", costUsd: 24.9 }, { stage: "3", costUsd: 3 }, { stage: "4", costUsd: 4 }]);
    const { caps: raised } = resolveCaps({ stage: "4", stageCap: 10, overTargetReason: "rerun the rewrite" });
    expect(budgetCheck(raised, nearGlobal, 0, "4", 0.05)).toEqual({ ok: true });
    expect(budgetCheck(raised, nearGlobal, 0, "4", 0.2)).toMatchObject({ ok: false, reason: expect.stringMatching(/Global cap \$40/) });
    expect(budgetCheck(caps, spend(0), 0.95, "0", 0.1)).toMatchObject({ ok: false });
  });

  it("needs a reason above the owner's target and records it", () => {
    expect(() => resolveCaps({ stage: "1-2", stageCap: 14 })).toThrow(/over-target-reason/);
    const { caps, override } = resolveCaps(
      { stage: "1-2", stageCap: 14, overTargetReason: "more Sol setup samples" },
      () => new Date("2026-09-27T00:00:00Z")
    );
    expect(caps.stageCaps["1-2"]).toBe(14);
    expect(caps.globalCap).toBe(40);
    expect(override).toEqual({ at: "2026-09-27T00:00:00.000Z", stage: "1-2", stageCap: 14, globalCap: undefined, reason: "more Sol setup samples" });
    // Lowering a cap needs no reason
    expect(resolveCaps({ stage: "0", stageCap: 2 }).override).toBeUndefined();
    expect(resolveCaps({ globalCap: 20 }).caps.globalCap).toBe(20);
  });

  it("lets a paid run raise a stage cap only for the arms it names, and records them", () => {
    const reason = "Owner approved: re-run Luna medium turns";
    // Plan order protects approved arms only within a role, so a role-only run would spend the raise on leftovers
    expect(() => resolveCaps({ stage: "4", stageCap: 6, overTargetReason: reason, forRun: true })).toThrow(/--arms/);
    expect(() => resolveCaps({ stage: "4", stageCap: 6, overTargetReason: reason, forRun: true, armKeys: [] })).toThrow(/--arms/);
    const arms = ["gpt-6-luna@medium/rewrite2Slim"];
    const { caps, override } = resolveCaps(
      { stage: "4", stageCap: 6, overTargetReason: reason, forRun: true, armKeys: arms },
      () => new Date("2026-09-27T00:00:00Z")
    );
    expect(caps.stageCaps["4"]).toBe(6);
    expect(override).toMatchObject({ stage: "4", stageCap: 6, reason, arms });
    // A run within the default cap names no arms; so does a raise outside --run (probe, case building)
    expect(resolveCaps({ stage: "4", forRun: true }).caps.stageCaps["4"]).toBe(4);
    expect(resolveCaps({ stage: "4", stageCap: 3, forRun: true }).caps.stageCaps["4"]).toBe(3);
    expect(resolveCaps({ stage: "0", stageCap: 9, overTargetReason: reason }).override).not.toHaveProperty("arms");
  });

  it("gives the round stages and the migration check their own caps, each with a recorded reason", () => {
    expect(DEFAULT_STAGE_CAPS).toMatchObject({ "setup-rounds": 3, "turn-rounds": 2, migration: 1.2 });
    // The Casablanca sentence's retest (2026-09-29) books to the setup rounds, whose reason names it
    expect(STAGE_CAP_REASONS["setup-rounds"]).toMatch(/Casablanca sentence/);
    expect(STAGE_CAP_REASONS["setup-rounds"]).toMatch(/setupR3d/);
    for (const stage of LEDGER_STAGES) expect(STAGE_CAP_REASONS[stage].length).toBeGreaterThan(20);
    // Stage 3 and 4 keep their caps; Stage 4 is closed
    expect(DEFAULT_STAGE_CAPS).toMatchObject({ "0": 8, "1-2": 13, "3": 3, "4": 4, filter: 0.3 });
    // The new caps fit inside the $33 hard cap beside the ledger when they opened ($26.39), with the filter check's unspent cap too
    const newCaps = DEFAULT_STAGE_CAPS["setup-rounds"] + DEFAULT_STAGE_CAPS["turn-rounds"] + DEFAULT_STAGE_CAPS.migration;
    expect(LEDGER_WHEN_ROUNDS_OPENED + newCaps + DEFAULT_STAGE_CAPS.filter).toBeLessThanOrEqual(HARD_CEILING);
  });

  it("gives each run of the owner's feedback workflow (2026-09-28, the stage scoping of 2026-09-29, the options and continuity of 2026-09-30) its own stage, cap and reason, inside the $40 hard cap", () => {
    expect(DEFAULT_STAGE_CAPS).toMatchObject({
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
    });
    expect(FEEDBACK_STAGES).toEqual([
      "plan-refresh",
      "reruns",
      "setup-retests",
      "groups",
      "form-gate",
      "final-check",
      "stage-scoping",
      "options-continuity",
      "options-o2",
      "planner-v2e",
      "ending-state",
    ]);
    for (const stage of FEEDBACK_STAGES) {
      expect(STAGES).toContain(stage);
      expect(LEDGER_STAGES).toContain(stage);
      expect(stageRunsBaseline(stage)).toBe(false);
      expect(STAGE_CAP_REASONS[stage]).toMatch(/2026-09-(2[89]|30)/);
    }
    // The ledger read $31.99 when they opened; with the stalled Stage 4 calls' possible $1.3 on top, all eleven caps still fit
    const caps = FEEDBACK_STAGES.reduce((sum, stage) => sum + DEFAULT_STAGE_CAPS[stage], 0);
    expect(caps).toBeCloseTo(4.95);
    expect(LEDGER_WHEN_FEEDBACK_OPENED + UNRECORDED_STAGE4_USD + caps).toBeLessThanOrEqual(HARD_CEILING);
    // A run's stage only spends its own cap
    const spend = spentByStage([{ stage: "plan-refresh", costUsd: 0.09 }]);
    const { caps: defaults } = resolveCaps({});
    expect(budgetCheck(defaults, spend, 0, "plan-refresh", 0.02)).toMatchObject({ ok: false, reason: expect.stringMatching(/Stage plan-refresh cap \$0\.10/) });
    expect(budgetCheck(defaults, spend, 0, "reruns", 0.02)).toEqual({ ok: true });
  });

  it("runs the stage scoping (2026-09-29): planner v2d twice on every chapter-planning case, with planner v2c and today's form on the built first chapter", () => {
    const plans = armsFor("stage-scoping", "thread");
    expect(plans.map((p) => [p.arm.key, p.samples, p.scope, p.caseIds])).toEqual([
      ["gpt-6-luna@low/planV2d", 2, "all", undefined],
      // Production's planner v2c on the built cases no planner v2c ran on: the first chapter and (2026-09-30) the last chapters
      ["gpt-6-luna@low/planV2c", 2, "all", [...STAGE_SCOPING_NEW_CASES, ...STAGE_SCOPING_LAST_CHAPTER_CASES]],
      ["gpt-6-luna@low/prod", 2, "all", STAGE_SCOPING_NEW_CASES],
      // The climax arm (2026-09-30) on the built last chapters only
      ["gpt-6-luna@low/planV2dClimax", 2, "all", STAGE_SCOPING_LAST_CHAPTER_CASES],
    ]);
    for (const role of ["setup", "beat", "switch", "iteration"] as const) expect(armsFor("stage-scoping", role)).toEqual([]);
    expect(pipelinePlans("stage-scoping")).toEqual([]);
    expect(STAGE_SCOPING_NEW_CASES).toEqual(["round-thread-first-8988006e-t1"]);
    expect(STAGE_SCOPING_LAST_CHAPTER_CASES).toEqual(["round-thread-last4-8988006e-t5", "round-thread-last2-8988006e-t5", "round-thread-last4-mp-965413e1-p3-t5"]);
    // Frozen after the earlier stages closed, so only the stage scoping plans them
    for (const id of STAGE_SCOPING_LAST_CHAPTER_CASES) {
      expect(stagePlansCase("stage-scoping", id)).toBe(true);
      expect(stagePlansCase("final-check", id)).toBe(false);
    }
    // The climax clause against planner v2d, whose last-chapter clause it replaces, and production's planner v2c second
    expect(referenceKey("gpt-6-luna@low/planV2dClimax")).toBe("gpt-6-luna@low/planV2d");
    expect(secondReferenceKeys("gpt-6-luna@low/planV2dClimax")).toEqual(["gpt-6-luna@low/planV2c"]);
    expect(STAGE_CAP_REASONS["stage-scoping"]).toMatch(/planV2dClimax/);
    // Read against planner v2c, production's chapter planner, and today's form second
    expect(referenceKey("gpt-6-luna@low/planV2d")).toBe("gpt-6-luna@low/planV2c");
    expect(estimateBaseKey("gpt-6-luna@low/planV2d")).toBe("gpt-6-luna@low/planV2c");
    expect(secondReferenceKeys("gpt-6-luna@low/planV2d")).toEqual(["gpt-6-luna@low/prod"]);
    expect(STAGE_CAP_REASONS["stage-scoping"]).toMatch(/planV2d/);
    // The ledger read $33.85 when it opened: its cap fits under the $40 with the stalled Stage 4 calls on top
    expect(33.85 + UNRECORDED_STAGE4_USD + DEFAULT_STAGE_CAPS["stage-scoping"]).toBeLessThanOrEqual(HARD_CEILING);
  });

  it("runs the options and continuity arms (2026-09-30) beside production's form: Luna medium, twice on the stored single-player turns, the arms interleaved", () => {
    const plans = armsFor("options-continuity", "beat");
    const arms = ["adopted", "turnO", "turnC", "turnOC"].map((variant) => `gpt-6-luna@medium/${variant}`);
    expect(plans.slice(0, 4).map((p) => [p.arm.key, p.fromSample ?? 1, p.samples, p.scope, p.source, p.caseIds])).toEqual(
      arms.map((key) => [key, 1, 2, "single-player", "stored", undefined])
    );
    // Arm O's one fix-and-retest after the run: once, on the rolled steps of the two Novi Reg stories, where its options named their stat
    expect(plans.slice(4).map((p) => [p.arm.key, p.fromSample ?? 1, p.samples, p.scope, p.source, p.caseIds])).toEqual([
      ["gpt-6-luna@medium/turnOb", 1, 1, "single-player", "stored", OPTIONS_CONTINUITY_RETEST_CASES],
    ]);
    expect(OPTIONS_CONTINUITY_RETEST_CASES.length).toBe(21);
    expect(OPTIONS_CONTINUITY_RETEST_CASES.every((id) => /8988006e|7492b211/.test(id))).toBe(true);
    expect(referenceKey("gpt-6-luna@medium/turnOb")).toBe(arms[0]);
    expect(secondReferenceKeys("gpt-6-luna@medium/turnOb")).toEqual(["gpt-6-luna@medium/turnO"]);
    // Production's form on production's own settings group (TEXT_MODEL_GROUPS), and the arms on the same model and effort
    expect(arms[0]).toBe(armKey({ model: TEXT_MODEL_GROUPS.beat.model, reasoningEffort: TEXT_MODEL_GROUPS.beat.reasoningEffort }, "adopted"));
    for (const role of ["setup", "switch", "thread", "iteration"] as const) expect(armsFor("options-continuity", role)).toEqual([]);
    expect(pipelinePlans("options-continuity")).toEqual([]);
    expect(stageInterleavesArms("options-continuity")).toBe(true);
    expect(stageInterleavesArms("final-check")).toBe(false);
    expect(OPTIONS_CONTINUITY_PROMPT_STATE).toBe("adopted2");
    // Each arm against production's form, which ran beside it; both arms against each part alone too; the retest priced from arm O
    expect(estimateBaseKey("gpt-6-luna@medium/turnOb")).toBe("gpt-6-luna@medium/turnO");
    for (const key of arms.slice(1)) {
      expect(referenceKey(key)).toBe(arms[0]);
      expect(estimateBaseKey(key)).toBe(arms[0]);
    }
    expect(secondReferenceKeys("gpt-6-luna@medium/turnOC")).toEqual(["gpt-6-luna@medium/turnO", "gpt-6-luna@medium/turnC"]);
    expect(secondReferenceKeys("gpt-6-luna@medium/turnO")).toEqual([]);
    expect(STAGE_CAP_REASONS["options-continuity"]).toMatch(/turnOC/);
    // The ledger read $34.02 when it opened: its cap fits under the $40 with the stalled Stage 4 calls on top
    expect(34.02 + UNRECORDED_STAGE4_USD + DEFAULT_STAGE_CAPS["options-continuity"]).toBeLessThanOrEqual(HARD_CEILING);
  });

  it("runs version O2 (options-o2, 2026-09-30) beside production's form under its own prompt state: Luna medium, twice on the stored rolled chapter steps, interleaved", () => {
    const plans = armsFor("options-o2", "beat");
    const [production, o2, o2b] = ["adopted", "turnO2", "turnO2b"].map((variant) => `gpt-6-luna@medium/${variant}`);
    expect(plans.map((p) => [p.arm.key, p.fromSample ?? 1, p.samples, p.scope, p.source, p.caseIds])).toEqual([
      [production, 1, 2, "single-player", "stored", OPTIONS_O2_CASES],
      [o2, 1, 2, "single-player", "stored", OPTIONS_O2_CASES],
      // O2's one fix-and-retest, once on the same steps
      [o2b, 1, 1, "single-player", "stored", OPTIONS_O2_CASES],
    ]);
    // The retest against production's form, O2 second; priced from O2, the form it changes by one line
    expect(referenceKey(o2b)).toBe(production);
    expect(secondReferenceKeys(o2b)).toEqual([o2]);
    expect(estimateBaseKey(o2b)).toBe(o2);
    expect(STAGE_CAP_REASONS["options-o2"]).toMatch(/turnO2b/);
    // The 32 stored rolled chapter steps: the only turns whose request O2 changes; none from the round cases
    expect(OPTIONS_O2_CASES.length).toBe(32);
    expect(new Set(OPTIONS_O2_CASES).size).toBe(32);
    expect(OPTIONS_O2_CASES.every((id) => /^(cont|synth)-/.test(id))).toBe(true);
    // Arm O's retest cases are among them
    for (const id of OPTIONS_CONTINUITY_RETEST_CASES) expect(OPTIONS_O2_CASES).toContain(id);
    for (const role of ["setup", "switch", "thread", "iteration"] as const) expect(armsFor("options-o2", role)).toEqual([]);
    expect(pipelinePlans("options-o2")).toEqual([]);
    expect(stageInterleavesArms("options-o2")).toBe(true);
    expect(OPTIONS_O2_PROMPT_STATE).toBe("adopted3");
    // Against production's form beside it, with arm O and its retest second; priced from the retest, the form it builds on
    expect(referenceKey(o2)).toBe(production);
    expect(secondReferenceKeys(o2)).toEqual(["gpt-6-luna@medium/turnO", "gpt-6-luna@medium/turnOb"]);
    expect(estimateBaseKey(o2)).toBe("gpt-6-luna@medium/turnOb");
    expect(STAGE_CAP_REASONS["options-o2"]).toMatch(/turnO2/);
    expect(STAGE_CAP_REASONS["options-o2"]).toMatch(/2026-09-30/);
    // The ledger read $35.40 when it opened: its cap fits under the $40 with the stalled Stage 4 calls on top
    expect(35.4 + UNRECORDED_STAGE4_USD + DEFAULT_STAGE_CAPS["options-o2"]).toBeLessThanOrEqual(HARD_CEILING);
  });

  it("runs planner v2e (planner-v2e, 2026-09-30): Luna low, twice on every chapter-planning case, stored and built, against planner v2c", () => {
    const plans = armsFor("planner-v2e", "thread");
    expect(plans.map((p) => [p.arm.key, p.fromSample ?? 1, p.samples, p.scope, p.source, p.caseIds])).toEqual([["gpt-6-luna@low/planV2e", 1, 2, "all", undefined, undefined]]);
    for (const role of ["setup", "beat", "switch", "iteration"] as const) expect(armsFor("planner-v2e", role)).toEqual([]);
    expect(pipelinePlans("planner-v2e")).toEqual([]);
    expect(stageInterleavesArms("planner-v2e")).toBe(false);
    // The built first chapter and the three last chapters are planned here too: the stage comes after the stage scoping
    for (const id of [...STAGE_SCOPING_NEW_CASES, ...STAGE_SCOPING_LAST_CHAPTER_CASES]) expect(stagePlansCase("planner-v2e", id)).toBe(true);
    // Against production's planner v2c, with planner v2d (the form it fixes) and today's form second; priced from planner v2d
    expect(referenceKey("gpt-6-luna@low/planV2e")).toBe("gpt-6-luna@low/planV2c");
    expect(secondReferenceKeys("gpt-6-luna@low/planV2e")).toEqual(["gpt-6-luna@low/planV2d", "gpt-6-luna@low/prod"]);
    expect(estimateBaseKey("gpt-6-luna@low/planV2e")).toBe("gpt-6-luna@low/planV2d");
    expect(STAGE_CAP_REASONS["planner-v2e"]).toMatch(/planV2e/);
    expect(STAGE_CAP_REASONS["planner-v2e"]).toMatch(/2026-09-30/);
    expect(stageRunsBaseline("planner-v2e")).toBe(false);
    // The ledger read $36.01 when it opened: its cap fits under the $40 with the stalled Stage 4 calls on top
    expect(36.01 + UNRECORDED_STAGE4_USD + DEFAULT_STAGE_CAPS["planner-v2e"]).toBeLessThanOrEqual(HARD_CEILING);
  });

  it("runs the ending told as its milestones leave it (ending-state, 2026-09-30) beside production's ending: each player count on its own turn model, twice on the stored and built endings, interleaved", () => {
    const plans = armsFor("ending-state", "beat");
    const one = ["adopted", "endingStateB"].map((variant) => armKey({ model: TEXT_MODEL_GROUPS.beat.model, reasoningEffort: TEXT_MODEL_GROUPS.beat.reasoningEffort }, variant as "adopted"));
    const group = ["adopted", "endingStateB"].map((variant) =>
      armKey({ model: TEXT_MODEL_GROUPS.multiplayerBeat.model, reasoningEffort: TEXT_MODEL_GROUPS.multiplayerBeat.reasoningEffort }, variant as "adopted")
    );
    const single = [...ENDING_STATE_STORED_CASES, ...ENDING_STATE_BUILT_CASES.single];
    expect(plans.map((p) => [p.arm.key, p.fromSample ?? 1, p.samples, p.scope, p.source, p.caseIds])).toEqual([
      [one[0], 1, 2, "single-player", undefined, single],
      [one[1], 1, 2, "single-player", undefined, single],
      [group[0], 1, 2, "multiplayer", undefined, ENDING_STATE_BUILT_CASES.groups],
      [group[1], 1, 2, "multiplayer", undefined, ENDING_STATE_BUILT_CASES.groups],
    ]);
    // The run's variant is endingStateB (the smoke's one fix); the smoke's draft, endingState, is not planned again
    expect(one).toEqual(["gpt-6-luna@medium/adopted", "gpt-6-luna@medium/endingStateB"]);
    expect(group).toEqual(["gpt-6-luna@low/adopted", "gpt-6-luna@low/endingStateB"]);
    expect(plans.some((p) => p.arm.variant === "endingState")).toBe(false);
    expect(ENDING_STATE_STORED_CASES).toEqual(["end-8988006e-t4-o0", "end-8988006e-t4-o1", "end-8988006e-t4-o2"]);
    expect(ENDING_STATE_BUILT_CASES.single).toHaveLength(1);
    expect(ENDING_STATE_BUILT_CASES.groups).toHaveLength(3);
    for (const role of ["setup", "switch", "thread", "iteration"] as const) expect(armsFor("ending-state", role)).toEqual([]);
    expect(pipelinePlans("ending-state")).toEqual([]);
    expect(stageInterleavesArms("ending-state")).toBe(true);
    // Production's beat code is adopted2's (only its chapter planner changed since), whose records hold production's two samples on the stored endings
    expect(ENDING_STATE_PROMPT_STATE).toBe("adopted2");
    // The built endings are frozen after every earlier stage closed, so only this stage plans them
    for (const id of [...ENDING_STATE_BUILT_CASES.single, ...ENDING_STATE_BUILT_CASES.groups]) {
      expect(stagePlansCase("ending-state", id)).toBe(true);
      expect(stagePlansCase("planner-v2e", id)).toBe(false);
      expect(stagePlansCase("options-continuity", id)).toBe(false);
    }
    // Against production's ending on the same turn model; priced from the draft, then production's ending
    expect(referenceKey(one[1])).toBe(one[0]);
    expect(referenceKey(group[1])).toBe(group[0]);
    expect(referenceKey("gpt-6-luna@medium/endingState")).toBe(one[0]);
    expect(estimateBaseKey(one[1])).toBe("gpt-6-luna@medium/endingState");
    expect(estimateBaseKey("gpt-6-luna@medium/endingState")).toBe(one[0]);
    expect(secondReferenceKeys(one[1])).toEqual([]);
    expect(STAGE_CAP_REASONS["ending-state"]).toMatch(/endingStateB/);
    expect(STAGE_CAP_REASONS["ending-state"]).toMatch(/2026-09-30/);
    expect(stageRunsBaseline("ending-state")).toBe(false);
    // The ledger read $36.08 when it opened: its cap fits under the $40 with the stalled Stage 4 calls on top
    expect(36.08 + UNRECORDED_STAGE4_USD + DEFAULT_STAGE_CAPS["ending-state"]).toBeLessThanOrEqual(HARD_CEILING);
  });

  it("books and checks spend of the new stages on their own caps", () => {
    const spend = spentByStage([{ stage: "setup-rounds", costUsd: 2.95 }, { stage: "turn-rounds", costUsd: 1 }]);
    expect(spend.byStage["setup-rounds"]).toBeCloseTo(2.95);
    expect(spend.total).toBeCloseTo(3.95);
    const { caps } = resolveCaps({});
    expect(budgetCheck(caps, spend, 0, "setup-rounds", 0.1)).toMatchObject({ ok: false, reason: expect.stringMatching(/Stage setup-rounds cap \$3\.00/) });
    expect(budgetCheck(caps, spend, 0, "turn-rounds", 0.1)).toEqual({ ok: true });
  });

  it("reads the reruns' framed turn against today's form and round 1's framed turn, and the setup retests against the adopted form and today's prompt", () => {
    expect(referenceKey("gpt-6-luna@medium/chapterFullB")).toBe("gpt-6-luna@medium/prod");
    expect(secondReferenceKeys("gpt-6-luna@medium/chapterFullB")).toEqual(["gpt-6-luna@medium/chapterFull"]);
    expect(referenceKey("gpt-6-luna@low/setupR3b")).toBe("gpt-6-luna@low/setupR3");
    expect(secondReferenceKeys("gpt-6-luna@low/setupR3b")).toEqual(["gpt-6-luna@low/prod"]);
    // The Casablanca sentence against the adopted form, then against the retest whose clause it extends, and today's prompt
    expect(referenceKey("gpt-6-luna@low/setupR3c")).toBe("gpt-6-luna@low/setupR3");
    expect(estimateBaseKey("gpt-6-luna@low/setupR3c")).toBe("gpt-6-luna@low/setupR3");
    expect(secondReferenceKeys("gpt-6-luna@low/setupR3c")).toEqual(["gpt-6-luna@low/setupR3b", "gpt-6-luna@low/prod"]);
    // Its second retest (the multiplayer clause only) against the adopted form, then against the first retest and today's prompt
    expect(referenceKey("gpt-6-luna@low/setupR3d")).toBe("gpt-6-luna@low/setupR3");
    expect(estimateBaseKey("gpt-6-luna@low/setupR3d")).toBe("gpt-6-luna@low/setupR3");
    expect(secondReferenceKeys("gpt-6-luna@low/setupR3d")).toEqual(["gpt-6-luna@low/setupR3c", "gpt-6-luna@low/prod"]);
    // Its chain reads against today's pair (planner v2b, planner v2c's own reference, never ran in a chain), and round 1's chain second
    const chain = "pipeline:gpt-6-luna@low/planV2c>gpt-6-luna@medium/chapterFullB";
    expect(referenceKeyOf(chain)).toBe("pipeline:gpt-6-luna@low/prod>gpt-6-luna@medium/prod");
    expect(secondReferenceKeys(chain)).toEqual(["pipeline:gpt-6-luna@low/planV2>gpt-6-luna@medium/chapterFull"]);
    // Other chains still chain their sides' references
    expect(referenceKeyOf("pipeline:gpt-6-luna@low/planV2>gpt-6-luna@medium/chapterFull")).toBe("pipeline:gpt-6-luna@low/prod>gpt-6-luna@medium/prod");
    // Planner v2's records stand in for planner v2b's, and nothing else stands in
    expect(standInKey("gpt-6-luna@low/planV2b")).toBe("gpt-6-luna@low/planV2");
    expect(standInKey("gpt-6-luna@low/planV2c")).toBeUndefined();
  });

  it("runs the final check on production's own settings groups: the arms follow TEXT_MODEL_GROUPS, not a copy", () => {
    const key = (group: keyof typeof TEXT_MODEL_GROUPS, variant: "adopted" | "adoptedTemplate" = "adopted") =>
      armKey({ model: TEXT_MODEL_GROUPS[group].model, reasoningEffort: TEXT_MODEL_GROUPS[group].reasoningEffort }, variant);
    const keys = (role: Parameters<typeof armsFor>[1]) => armsFor("final-check", role).map((plan) => plan.arm.key);
    expect(keys("setup")).toEqual([key("setup"), key("templateEditor", "adoptedTemplate")]);
    expect(keys("beat")).toEqual([key("beat"), key("multiplayerBeat")]);
    // Both planner groups run Luna low, so one plan covers every case
    expect(new Set([...keys("switch"), ...keys("thread")])).toEqual(new Set([key("analysis"), key("multiplayerAnalysis")]));
    expect(keys("iteration")).toEqual([]);
    // Production's defaults as of the adoption: the template editor on Sol low, the rest on Luna
    expect(key("templateEditor", "adoptedTemplate")).toBe("gpt-6-sol@low/adoptedTemplate");
    expect(key("beat")).toBe("gpt-6-luna@medium/adopted");
    expect(stageRunsBaseline("final-check")).toBe(false);
  });

  it("gives the final check two new setups per player count and two templates, none read with a child", () => {
    const premise = (id: string) => SETUP_PREMISES.find((p) => p.id === id)!;
    const perCount = (ids: string[]) => ids.reduce<Record<number, number>>((acc, id) => ({ ...acc, [premise(id).playerCount]: (acc[premise(id).playerCount] ?? 0) + 1 }), {});
    expect(perCount(FINAL_CHECK_SETUP_PREMISES)).toEqual({ 1: 2, 2: 2, 3: 2 });
    expect(FINAL_CHECK_TEMPLATE_PREMISES).toHaveLength(2);
    // Production's template generation has no category, so no kids budget: a kids premise would read the wrong checks
    expect(FINAL_CHECK_TEMPLATE_PREMISES.some((id) => premise(id).tags.kids)).toBe(false);
    // One single-player template and one where the editor offers a contest (two or more players, a competitive mode)
    expect(FINAL_CHECK_TEMPLATE_PREMISES.map((id) => premise(id).playerCount).sort()).toEqual([1, 2]);
    expect(FINAL_CHECK_TEMPLATE_PREMISES.map((id) => premise(id).gameMode)).toContain(GameModes.CooperativeCompetitive);
    expect(STAGE_CAP_REASONS["final-check"]).toMatch(/template/);
  });

  it("reads production's own code against today's form, and against the measured variants it builds byte for byte", () => {
    expect(referenceKey("gpt-6-luna@medium/adopted")).toBe("gpt-6-luna@medium/prod");
    expect(referenceKey("gpt-6-luna@low/adopted")).toBe("gpt-6-luna@low/prod");
    // The template editor's AI Draft against Sol's stored custom-story setups on today's form: no template form ever ran
    expect(referenceKey("gpt-6-sol@low/adoptedTemplate")).toBe("gpt-6-sol@low/prod");
    // Luna low's adopted arm is the setup, both planners and the group turns: each second reference reads in its own role
    expect(secondReferenceKeys("gpt-6-luna@low/adopted")).toEqual([
      "gpt-6-luna@low/setupR3",
      "gpt-6-luna@low/setupR3b",
      "gpt-6-luna@low/planV2",
      "gpt-6-luna@low/planV2c",
    ]);
    expect(referenceKeyOf("pipeline:gpt-6-luna@low/adopted>gpt-6-luna@medium/adopted")).toBe("pipeline:gpt-6-luna@low/prod>gpt-6-luna@medium/prod");
    expect(referenceKeyOf("pipeline:gpt-6-luna@low/adopted>gpt-6-luna@low/adopted")).toBe("pipeline:gpt-6-luna@low/prod>gpt-6-luna@low/prod");
  });

  it("splits the eighteen setup premises between the retests and their sanity pass", () => {
    expect([...SETUP_RETEST_PREMISES, ...SETUP_SANITY_PREMISES].sort()).toEqual(SETUP_PREMISES.map((p) => p.id).sort());
    // The retests are the premises that name the player characters, and the two read with a child
    expect(SETUP_PREMISES.filter((p) => p.tags.kids).map((p) => p.id).every((id) => SETUP_RETEST_PREMISES.includes(id))).toBe(true);
  });

  it("runs no baseline in the round and migration stages, and in every older stage", () => {
    expect(STAGES.filter(stageRunsBaseline)).toEqual(["0", "1-2", "3", "4"]);
  });

  it("never lets the global cap pass $40 (the owner's raise of 2026-09-28), whatever the reason", () => {
    expect(HARD_CEILING).toBe(40);
    expect(() => resolveCaps({ globalCap: 40.01, overTargetReason: "anything" })).toThrow(/\$40/);
    expect(() => resolveCaps({ globalCap: 50, overTargetReason: "the owner's old ceiling" })).toThrow(/\$40/);
    expect(resolveCaps({ globalCap: 40 }).caps.globalCap).toBe(40);
    expect(resolveCaps({}).caps.globalCap).toBe(40);
    // Lowering it back to the old hard cap needs no reason
    expect(resolveCaps({ globalCap: 33 }).caps.globalCap).toBe(33);
  });
});
