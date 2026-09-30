import type { EvalCase } from "./cases.js";
import { stateAtChapterStart } from "./chapterFrames.js";
import { editedCase, turnsLeft, type EditSpec, type StateEdit } from "./roundCases.js";

/*
 * The chapter-planning case the stage scoping needs (the owner's feedback of
 * 2026-09-29) that no stored case holds: story 8988006e (Novi Reg, Arielle
 * and the Waste Ring) before its first chapter, the chapter whose plan the
 * owner read ("Gathering Intel", "Infiltrating the Network", "Exposing the
 * Corruption" on an outcome of three milestones). The stored story files are
 * gone, so the earliest frozen state holding that chapter (the second turn,
 * the chapter's first step played) is cut back to the chapter's start as the
 * chapter backfill cuts it (stateAtChapterStart: the chapter's turns and
 * later plans removed, milestones and thread-type history recomputed; stats,
 * facts and story elements stay as that state has them, one turn later).
 * Built with --build-stage-cases, frozen beside the round cases; no calls.
 */

export const ARIELLE_FIRST_CHAPTER = {
  id: "round-thread-first-8988006e-t1",
  /** The earliest frozen state holding the chapter, the one the chapter backfill cut back too */
  base: "cont-8988006e-t2-o0",
  /** The chapter's plan in that state's phases */
  phaseIndex: 1,
} as const;

/** The state cut back to the start of the chapter at this phase index (the chapter backfill's view). */
export function chapterStart(phaseIndex: number): StateEdit {
  return {
    describe: `cut back to the start of the chapter at phase ${phaseIndex} (its turns and later plans removed, milestones and thread-type history recomputed; stats, facts and story elements stay as this state has them)`,
    apply: (state) => {
      Object.assign(state, stateAtChapterStart(state, phaseIndex));
    },
  };
}

/** The stage scoping's built cases from the frozen ones, and what could not be built. */
export function stageScopingCases(frozen: EvalCase[]): { cases: EvalCase[]; problems: string[] } {
  const base = frozen.find((c) => c.id === ARIELLE_FIRST_CHAPTER.base);
  if (!base) return { cases: [], problems: [`${ARIELLE_FIRST_CHAPTER.id}: no frozen case ${ARIELLE_FIRST_CHAPTER.base}`] };
  const built = editedCase(base, {
    id: ARIELLE_FIRST_CHAPTER.id,
    role: "thread",
    base: base.id,
    category: "first-chapter",
    purpose:
      "The Arielle story (Novi Reg) before its first chapter, the chapter the owner's feedback of 2026-09-29 read: the first switch chosen (investigate the Waste Ring, an outcome of three milestones), no chapter plan and no milestone yet (the stage scoping, planner v2d).",
    edits: [chapterStart(ARIELLE_FIRST_CHAPTER.phaseIndex)],
  });
  return { cases: [built], problems: [] };
}

/*
 * The climax arm's cases (the owner's open question of 2026-09-29, built
 * 2026-09-30): a chapter in the story's last thread whose outcome still needs
 * several milestones, the one place where planner v2d (the next stage, the
 * ending settling the rest) and its climax clause (the last chapter settles
 * the outcome outright) send different requests. No stored or built planning
 * case is one, so three are edited from frozen chapter-planning cases, their
 * story's length set so the chapter is its last (turnsLeft): the situation
 * binding late pacing produces when a setup plans more milestones than
 * chapters fit. No calls.
 */
const lastThread = (turns: number) =>
  `A chapter in the story's last thread (exactly ${turns} beats) whose outcome still needs several milestones, where the owner's open question of 2026-09-29 changes the request: planner v2d settles the next stage and leaves the rest to the ending; the climax clause (planV2dClimax) settles the outcome outright.`;

export const LAST_CHAPTER_CASES: EditSpec[] = [
  {
    id: "round-thread-last4-8988006e-t5",
    role: "thread",
    base: "thread-8988006e-t5-o0",
    category: "last-chapter",
    purpose: `${lastThread(4)} Novi Reg's second chapter plan, the Waste Ring outcome at 1 of 3 milestones.`,
    edits: [turnsLeft(4)],
  },
  {
    id: "round-thread-last2-8988006e-t5",
    role: "thread",
    base: "thread-8988006e-t5-o1",
    category: "last-chapter",
    purpose: `${lastThread(2)} Novi Reg's second chapter plan after the switch's second option, the Waste Ring outcome at 1 of 3 milestones.`,
    edits: [turnsLeft(2)],
  },
  {
    id: "round-thread-last4-mp-965413e1-p3-t5",
    role: "thread",
    base: "round-thread-mp-965413e1-p3-t5",
    category: "last-chapter",
    purpose: `${lastThread(4)} Red Dust Rhapsody's three-player second chapter plan, three independent threads on outcomes at 0 of 2 milestones each.`,
    edits: [turnsLeft(4)],
  },
];

/**
 * What --build-stage-cases freezes: every stage scoping case not frozen yet
 * (all of them when rebuilding), what could not be built, and what was left
 * as frozen. Building is deterministic, so a case frozen earlier keeps its bytes.
 */
export function stageCasesToFreeze(frozen: EvalCase[], replace: boolean): { cases: EvalCase[]; problems: string[]; skipped: string[] } {
  const built = [stageScopingCases(frozen), lastChapterCases(frozen)];
  const known = new Set(frozen.map((c) => c.id));
  const all = built.flatMap((b) => b.cases);
  const skipped = replace ? [] : all.filter((c) => known.has(c.id)).map((c) => c.id);
  return { cases: all.filter((c) => !skipped.includes(c.id)), problems: built.flatMap((b) => b.problems), skipped };
}

/** The climax arm's built cases from the frozen ones, and what could not be built. */
export function lastChapterCases(frozen: EvalCase[]): { cases: EvalCase[]; problems: string[] } {
  const byId = new Map(frozen.map((c) => [c.id, c]));
  const cases: EvalCase[] = [];
  const problems: string[] = [];
  for (const spec of LAST_CHAPTER_CASES) {
    const base = byId.get(spec.base);
    if (base) cases.push(editedCase(base, spec));
    else problems.push(`${spec.id}: no frozen case ${spec.base}`);
  }
  return { cases, problems };
}
