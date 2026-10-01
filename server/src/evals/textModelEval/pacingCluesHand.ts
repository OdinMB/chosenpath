import type { HandVerdict } from "./judgedChecks.js";

/*
 * The pacing-clues stage's blind hand reading (2026-10-01): each player's turn
 * in the story's late part both arms played, read in pacing-clues-blind.md
 * under its code (run code, the turn's place in the window, the player) before
 * the key (keys/pacing-clues-blind.json) was opened. yes: the turn plants no new
 * unexplained detail the story did not have (in its text, its interludes or the
 * facts it records), or explains the one it plants; no: it plants one and
 * leaves it unexplained (the note quotes it); partial: a reader could go either
 * way (left out of the counts). pacingCluesPrep.ts unblinds them through the
 * key for pacing-clues.md.
 */

export type PacingCluesHandEntry = { hand: HandVerdict; note: string };

export const PACING_CLUES_HAND: Record<string, PacingCluesHandEntry> = {};
