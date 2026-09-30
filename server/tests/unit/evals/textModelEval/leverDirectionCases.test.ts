import { describe, expect, it } from "@jest/globals";
import { GameModes } from "core/types/index.js";
import { LEVER_DIRECTION_CASES, LEVER_DIRECTION_PROMPT_STATE, armsFor, stageInterleavesArms, stagePlansCase } from "../../../../src/evals/textModelEval/arms.js";
import { sha256 } from "../../../../src/evals/textModelEval/executor.js";
import { requestInputFor } from "../../../../src/evals/textModelEval/jobPlan.js";
import { LEVER_MOUSE_CASE_ID, leverDirectionCases, leverCasesToFreeze } from "../../../../src/evals/textModelEval/leverDirectionCases.js";
import { SETUP_PREMISES } from "../../../../src/evals/textModelEval/setupPremises.js";
import { requestFor, requestText } from "../../../../src/evals/textModelEval/variants.js";
import { evalCase, tags } from "./fixtures.js";

/*
 * The lever-direction stage's cases (2026-09-30, fix 3 of the second
 * playthroughs' review): six setup premises, production's setup and the
 * variant twice on each. The mouse story read with a five-year-old (the
 * second round's defect: Cat's Nearness spent as a sacrifice) is frozen as a
 * round case from the second round's premise at its length; the other five
 * are frozen premises: New Avalon (the round's Heartwell Feedback; its setup
 * case is the round's request), the bounty hunters, Casablanca and the secret
 * society (production's stored setups wrote their pressures backwards), and
 * the emergency-room doctor (production's stored setups wrote its strain and
 * oversight the right way).
 */

/** The prompt hashes production's setup sent in the second round of playthroughs (prep-calls.jsonl, stage playthroughs-2). */
const ROUND2_SETUP_HASHES = {
  mouse: "57b34d989ae7dc68585d9f19eb88d1f514c774090de8dbf16bd4262c34bc8f87",
  avalon: "6a4d510620e2c81b903677bc6c2d38cdbd545f0a55b574e41a83f97d727d7ada",
};

const hashOf = (c: Parameters<typeof requestInputFor>[0]) => sha256(requestText(requestFor("adopted", requestInputFor(c))));

describe("the mouse story's setup case", () => {
  const [mouse] = leverDirectionCases();

  it("is the second round's premise as the client merged it, read with a child, at the story's length", () => {
    expect(mouse.id).toBe(LEVER_MOUSE_CASE_ID);
    expect(mouse.role).toBe("setup");
    expect(mouse.setup).toMatchObject({ playerCount: 1, gameMode: "single-player", maxTurns: 10 });
    expect(mouse.setup?.premise).toContain("How old is the child?: 5");
    expect(mouse.setup?.premise).toContain("I'm a field mouse trying to save my burrow village");
    expect(mouse.tags).toMatchObject({ players: 1, kids: true, source: "round", category: "read-with-kids" });
  });

  it("sends production's request the second round sent, byte for byte, and so does New Avalon's frozen premise", () => {
    expect(hashOf(mouse)).toBe(ROUND2_SETUP_HASHES.mouse);
    const avalon = SETUP_PREMISES.find((p) => p.id === "setup-custom-avalon");
    if (!avalon) throw new Error("no Avalon premise");
    const avalonCase = evalCase("setup-custom-avalon", "setup", { setup: { premise: avalon.premise, playerCount: 1, gameMode: GameModes.SinglePlayer, maxTurns: 25 }, tags: tags({ source: "premise" }) });
    expect(hashOf(avalonCase)).toBe(ROUND2_SETUP_HASHES.avalon);
  });

  it("is frozen once: an existing copy is left as it is unless replaced", () => {
    expect(leverCasesToFreeze([], false).cases.map((c) => c.id)).toEqual([LEVER_MOUSE_CASE_ID]);
    expect(leverCasesToFreeze([mouse], false)).toEqual({ cases: [], skipped: [LEVER_MOUSE_CASE_ID] });
    expect(leverCasesToFreeze([mouse], true).cases.map((c) => c.id)).toEqual([LEVER_MOUSE_CASE_ID]);
  });

  it("is planned from the lever-direction stage on, never by an earlier stage", () => {
    expect(stagePlansCase("recorded-result", LEVER_MOUSE_CASE_ID)).toBe(false);
    expect(stagePlansCase("setup-rounds", LEVER_MOUSE_CASE_ID)).toBe(false);
    expect(stagePlansCase("lever-direction", LEVER_MOUSE_CASE_ID)).toBe(true);
  });
});

describe("the stage's arms", () => {
  it("run production's setup and the variant on the setup model twice on the six cases, interleaved, under their own tag", () => {
    const plans = armsFor("lever-direction", "setup").map((p) => [p.arm.key, p.samples, p.scope, [...(p.caseIds ?? [])]]);
    expect(plans).toEqual([
      ["gpt-6-luna@low/adopted", 2, "all", [...LEVER_DIRECTION_CASES]],
      ["gpt-6-luna@low/leverDirection", 2, "all", [...LEVER_DIRECTION_CASES]],
    ]);
    expect(LEVER_DIRECTION_CASES).toEqual([
      LEVER_MOUSE_CASE_ID,
      "setup-custom-avalon",
      "setup-pretend-er-doctor",
      "setup-fiction-bounty-hunters",
      "setup-future-casablanca",
      "setup-flexible-secret-society",
    ]);
    for (const id of LEVER_DIRECTION_CASES.slice(1)) expect(SETUP_PREMISES.some((p) => p.id === id)).toBe(true);
    expect(stageInterleavesArms("lever-direction")).toBe(true);
    expect(LEVER_DIRECTION_PROMPT_STATE).toBe("adopted10");
    for (const role of ["beat", "switch", "thread", "iteration"] as const) expect(armsFor("lever-direction", role)).toEqual([]);
  });
});
