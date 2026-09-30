import { LEVER_MOUSE_CASE } from "./arms.js";
import type { EvalCase } from "./cases.js";
import type { EvalFiles } from "./evalFiles.js";
import { PLAYTHROUGHS_2, playthroughSetupInput } from "./playthroughs.js";

/*
 * The lever-direction stage's own case (2026-09-30, fix 3 of the second
 * playthroughs' review): the mouse story's setup, read with a five-year-old at
 * the second round's ten turns, as that round sent it (the premise the client
 * merges from the site's read-with-kids suggestion, production's kids setup).
 * Its request is the one production sent there, byte for byte (a test holds
 * the prompt hash). No calls: the setup input is the round's own. The stage's
 * other premises are frozen setup cases already (setupPremises.ts).
 */

export const LEVER_MOUSE_CASE_ID = LEVER_MOUSE_CASE;
const MOUSE_STORY = "play-kids-mouse";

/** The stage's built cases: the mouse story's setup. */
export function leverDirectionCases(): EvalCase[] {
  const spec = PLAYTHROUGHS_2.find((s) => s.id === MOUSE_STORY);
  if (!spec?.premise) throw new Error(`No second-round playthrough ${MOUSE_STORY}`);
  const input = playthroughSetupInput(spec);
  const { kids, ...setup } = input;
  return [
    {
      id: LEVER_MOUSE_CASE_ID,
      role: "setup",
      setup,
      tags: {
        players: setup.playerCount,
        gameMode: setup.gameMode,
        images: false,
        multiplayer: setup.playerCount > 1,
        kids: kids ?? false,
        dark: false,
        subset15: false,
        hasStoredOutput: false,
        firstBeat: false,
        ending: false,
        analysisTurn: false,
        source: "round",
        category: spec.premise.category,
      },
      note: `The second round's ${MOUSE_STORY} setup (${spec.premise.source}), at its ${spec.maxTurns} turns: the lever-direction stage's defect case (Cat's Nearness spent as a sacrifice).`,
    },
  ];
}

/** The cases to freeze: those not frozen yet, or all of them with `replace`; the rest are named as skipped. */
export function leverCasesToFreeze(existing: EvalCase[], replace: boolean): { cases: EvalCase[]; skipped: string[] } {
  const frozen = new Set(existing.map((c) => c.id));
  const built = leverDirectionCases();
  return replace ? { cases: built, skipped: [] } : { cases: built.filter((c) => !frozen.has(c.id)), skipped: built.filter((c) => frozen.has(c.id)).map((c) => c.id) };
}

// --- --build-lever-cases ---

export function buildLeverCasesMode(ctx: { files: EvalFiles; log: (line: string) => void }, replace: boolean): void {
  const { files, log } = ctx;
  if (!files.casesExist()) throw new Error("No frozen cases. Run --build-cases first.");
  const { cases, skipped } = leverCasesToFreeze(files.readCases(), replace);
  if (skipped.length) log(`Already frozen, left as they are: ${skipped.join(", ")}.`);
  if (cases.length === 0) return log("Nothing new to freeze; no calls.");
  files.addCases(cases, undefined, replace);
  log(`Froze ${cases.map((c) => c.id).join(", ")} beside the other cases; no calls.`);
}
