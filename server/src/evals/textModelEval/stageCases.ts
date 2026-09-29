import type { EvalCase } from "./cases.js";
import { stateAtChapterStart } from "./chapterFrames.js";
import { editedCase, type StateEdit } from "./roundCases.js";

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
