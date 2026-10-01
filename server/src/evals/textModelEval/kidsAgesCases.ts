import { KID_AGE_LABEL, type KidAges, type StoryPhase, type StoryState } from "core/types/index.js";
import {
  KIDS_AGES,
  KIDS_AGES_MOUSE_SOURCES,
  KIDS_AGES_SETUP_AGE,
  KIDS_AGES_SETUP_SOURCES,
  KIDS_AGES_SINGLE,
  kidsAgesGroupId,
  kidsAgesMouseId,
  kidsAgesSetupId,
} from "./arms.js";
import type { EvalCase, FixedAnalysis } from "./cases.js";
import { beforeSwitchTurn } from "./endingCases.js";
import type { EvalFiles } from "./evalFiles.js";
import { roundCase } from "./roundCases.js";
import { chainRunsFrom, type ChainRun } from "./setupChain.js";

/*
 * The kids-ages stage's cases (2026-10-01, the owner's decision that a
 * read-with-kids story's turns depend on the children's ages; no calls),
 * frozen beside the other cases with --build-kids-ages-cases:
 * - a single player: the kids-turns stage's six frozen turns of the second
 *   round's mouse story (read with a five-year-old: its first turn, a
 *   challenge chapter's opening and step, the switch turn after it, an
 *   exploration step and the ending), each recorded as read with a child aged
 *   4 and aged 10 (the 3-5 and 9-12 bands). At 7 (the 6-8 band) the variant is
 *   production's request byte for byte, so no single-player case is built
 *   there.
 * - a group: no stored group story is read with a child but setup round 3's
 *   setup-to-play chain on the two-player animal rescue (cooperative, set up
 *   for children of 7-10): its first turn (the story at its start with its
 *   first switch plan) and the switch turn after its first chapter (the story
 *   cut back before that turn, beforeSwitchTurn, with that switch plan), each
 *   recorded as read with a child aged 4, 7 and 10.
 * - setups: the mouse story's setup (the lever-direction stage's case, the
 *   second round's premise at ten turns) and the animal rescue's premise
 *   (frozen, two players), each with the age line made 10 and the setting
 *   recorded; below 9 the variant's setup is production's request byte for
 *   byte, so none is built there.
 * A turn's fixed plan is the applied phase the chain stored (its first beat
 * index and length included), so the case's request is the chain's own on the
 * form the chain sent (a test holds the prompt hashes).
 */

/** The setup chain the group cases come from. */
export const KIDS_AGES_CHAIN = { chain: "chain-kids-animal-rescue", sample: 1 } as const;

const CATEGORY = "kids-ages";
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const one = (age: number): KidAges => ({ min: age, max: age });

/** The state read with a child of this age: the setting recorded, the older readingAge taken out. */
function readWith(state: StoryState, age: number): StoryState {
  const next = clone(state);
  delete next.readingAge;
  return { ...next, category: "read-with-kids", kidAges: one(age) };
}

/** The premise with its age line made this age (the form's line, as the client merges it). */
export function premiseAtAge(premise: string, age: number): string | undefined {
  const lines = premise.split("\n");
  const at = lines.findIndex((l) => l.startsWith(`${KID_AGE_LABEL}:`));
  if (at < 0) return undefined;
  lines[at] = `${KID_AGE_LABEL}: ${age}`;
  return lines.join("\n");
}

function switchPhase(phase: StoryPhase | undefined): FixedAnalysis | undefined {
  return phase && "switches" in phase ? { kind: "switch", phase } : undefined;
}

/** The stage's cases from the frozen cases and the stored setup chain, and what could not be built. */
export function kidsAgesCases(frozen: EvalCase[], runs: ChainRun[]): { cases: EvalCase[]; problems: string[] } {
  const byId = new Map(frozen.map((c) => [c.id, c]));
  const cases: EvalCase[] = [];
  const problems: string[] = [];

  for (const age of KIDS_AGES_SINGLE) {
    for (const source of KIDS_AGES_MOUSE_SOURCES) {
      const base = byId.get(source);
      if (!base?.state) {
        problems.push(`${kidsAgesMouseId(source, age)}: no frozen case ${source}`);
        continue;
      }
      cases.push({
        ...clone(base),
        id: kidsAgesMouseId(source, age),
        state: readWith(base.state, age),
        tags: { ...base.tags, kids: true, category: CATEGORY },
        note: `The kids-turns stage's ${source} (the second round's mouse story, read with a five-year-old), recorded as read with a child aged ${age}: the read-with-kids setting {min: ${age}, max: ${age}} in place of the age its premise stated.`,
      });
    }
  }

  const run = runs.find((r) => r.premise.id === KIDS_AGES_CHAIN.chain && r.sample === KIDS_AGES_CHAIN.sample);
  if (!run?.start || !run.end) {
    problems.push(`${KIDS_AGES_CHAIN.chain} s${KIDS_AGES_CHAIN.sample}: no stored setup chain run with its start and end`);
  } else {
    const first = switchPhase(run.end.storyPhases[0]);
    const last = switchPhase(run.end.storyPhases[run.end.storyPhases.length - 1]);
    let beforeSwitch: StoryState | undefined;
    try {
      beforeSwitch = beforeSwitchTurn(run);
    } catch (error) {
      problems.push(`${KIDS_AGES_CHAIN.chain}: ${(error as Error).message}`);
    }
    const sources = [
      { turn: "first" as const, state: run.start, plan: first, what: "its first turn: the story at its start with its first switch plan" },
      { turn: "switch" as const, state: beforeSwitch, plan: last, what: "the switch turn after its first chapter: the story cut back before that turn, with that switch plan" },
    ];
    for (const age of KIDS_AGES) {
      for (const { turn, state, plan, what } of sources) {
        const id = kidsAgesGroupId(turn, age);
        if (!state || !plan) {
          problems.push(`${id}: the chain has no ${turn === "first" ? "first" : "last"} switch plan or state`);
          continue;
        }
        cases.push(
          roundCase({
            id,
            role: "beat",
            state: readWith(state, age),
            fixedAnalysis: clone(plan),
            category: CATEGORY,
            note: `Setup round 3's setup-to-play chain on the two-player animal rescue (${KIDS_AGES_CHAIN.chain}, sample ${KIDS_AGES_CHAIN.sample}; cooperative, set up for children of 7-10), ${what} as the chain stored it, recorded as read with a child aged ${age}.`,
          })
        );
      }
    }
  }

  for (const [premise, source] of Object.entries(KIDS_AGES_SETUP_SOURCES) as [keyof typeof KIDS_AGES_SETUP_SOURCES, string][]) {
    const id = kidsAgesSetupId(premise, KIDS_AGES_SETUP_AGE);
    const base = byId.get(source);
    const text = base?.setup ? premiseAtAge(base.setup.premise, KIDS_AGES_SETUP_AGE) : undefined;
    if (!base?.setup || text === undefined) {
      problems.push(`${id}: no frozen setup case ${source} with an age line`);
      continue;
    }
    cases.push({
      ...clone(base),
      id,
      setup: { ...clone(base.setup), premise: text, kidAges: one(KIDS_AGES_SETUP_AGE) },
      tags: { ...base.tags, kids: true, source: "round", category: CATEGORY },
      note: `${source}'s premise with its age line made ${KIDS_AGES_SETUP_AGE} and the read-with-kids setting recorded (the 9-12 band, where the variant's kids budget has a third visible player stat).`,
    });
  }
  return { cases, problems };
}

/** What --build-kids-ages-cases freezes: every built case not frozen yet (all of them when rebuilding), and what was left as frozen. */
export function kidsAgesCasesToFreeze(frozen: EvalCase[], runs: ChainRun[], replace: boolean): { cases: EvalCase[]; problems: string[]; skipped: string[] } {
  const { cases, problems } = kidsAgesCases(frozen, runs);
  const known = new Set(frozen.map((c) => c.id));
  const skipped = replace ? [] : cases.filter((c) => known.has(c.id)).map((c) => c.id);
  return { cases: cases.filter((c) => !skipped.includes(c.id)), problems, skipped };
}

// --- --build-kids-ages-cases ---

export function buildKidsAgesCasesMode(ctx: { files: EvalFiles; log: (line: string) => void }, replace: boolean): void {
  const { files, log } = ctx;
  if (!files.casesExist()) throw new Error("No frozen cases. Run --build-cases first.");
  const runs = chainRunsFrom(files.readSetupChain() ?? {}, files.loadOutputFile);
  const { cases, problems, skipped } = kidsAgesCasesToFreeze(files.readCases(), runs, replace);
  if (problems.length) throw new Error(problems.join("; "));
  if (skipped.length) log(`Already frozen, left as they are: ${skipped.join(", ")}.`);
  if (cases.length === 0) return log("Nothing new to freeze; no calls.");
  files.addCases(cases, undefined, replace);
  log(`Froze ${cases.map((c) => c.id).join(", ")} beside the other cases; no calls.`);
}
