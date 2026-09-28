import {
  armKey,
  armsFor,
  armSettings,
  baselineArm,
  estimateBaseKey,
  makeArm,
  productionArm,
  referenceKey,
  ROUND1_SETUP_PAGE_PREMISES,
  ROUND3_PROBLEM_TURN,
  ROUND3_REPLAY_CASES,
  ROUND3_REPLAY_SAMPLES,
  secondReferenceKeys,
  SETUP_RETEST_PREMISES,
  SETUP_SANITY_PREMISES,
  STAGES,
  stageRunsBaseline,
  standInKey,
} from "../../../../src/evals/textModelEval/arms.js";
import { SETUP_PREMISES } from "../../../../src/evals/textModelEval/setupPremises.js";
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
    ]);
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
    for (const stage of LEDGER_STAGES) expect(STAGE_CAP_REASONS[stage].length).toBeGreaterThan(20);
    // Stage 3 and 4 keep their caps; Stage 4 is closed
    expect(DEFAULT_STAGE_CAPS).toMatchObject({ "0": 8, "1-2": 13, "3": 3, "4": 4, filter: 0.3 });
    // The new caps fit inside the $33 hard cap beside the ledger when they opened ($26.39), with the filter check's unspent cap too
    const newCaps = DEFAULT_STAGE_CAPS["setup-rounds"] + DEFAULT_STAGE_CAPS["turn-rounds"] + DEFAULT_STAGE_CAPS.migration;
    expect(LEDGER_WHEN_ROUNDS_OPENED + newCaps + DEFAULT_STAGE_CAPS.filter).toBeLessThanOrEqual(HARD_CEILING);
  });

  it("gives each run of the owner's feedback workflow (2026-09-28) its own stage, cap and reason, inside the $40 hard cap", () => {
    expect(DEFAULT_STAGE_CAPS).toMatchObject({ "plan-refresh": 0.1, reruns: 0.6, "setup-retests": 0.1, groups: 0.4, "form-gate": 0.4, "final-check": 0.6 });
    expect(FEEDBACK_STAGES).toEqual(["plan-refresh", "reruns", "setup-retests", "groups", "form-gate", "final-check"]);
    for (const stage of FEEDBACK_STAGES) {
      expect(STAGES).toContain(stage);
      expect(LEDGER_STAGES).toContain(stage);
      expect(stageRunsBaseline(stage)).toBe(false);
      expect(STAGE_CAP_REASONS[stage]).toMatch(/2026-09-28/);
    }
    // The ledger read $31.99 when they opened; with the stalled Stage 4 calls' possible $1.3 on top, all six caps still fit
    const caps = FEEDBACK_STAGES.reduce((sum, stage) => sum + DEFAULT_STAGE_CAPS[stage], 0);
    expect(caps).toBeCloseTo(2.2);
    expect(LEDGER_WHEN_FEEDBACK_OPENED + UNRECORDED_STAGE4_USD + caps).toBeLessThanOrEqual(HARD_CEILING);
    // A run's stage only spends its own cap
    const spend = spentByStage([{ stage: "plan-refresh", costUsd: 0.09 }]);
    const { caps: defaults } = resolveCaps({});
    expect(budgetCheck(defaults, spend, 0, "plan-refresh", 0.02)).toMatchObject({ ok: false, reason: expect.stringMatching(/Stage plan-refresh cap \$0\.10/) });
    expect(budgetCheck(defaults, spend, 0, "reruns", 0.02)).toEqual({ ok: true });
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
    // Planner v2's records stand in for planner v2b's, and nothing else stands in
    expect(standInKey("gpt-6-luna@low/planV2b")).toBe("gpt-6-luna@low/planV2");
    expect(standInKey("gpt-6-luna@low/planV2c")).toBeUndefined();
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
