import type { Story } from "core/models/Story.js";
import { isLatePart } from "./pacing.js";

/*
 * The late part's clue lines (adopted 2026-10-01 from the pacing-clues stage,
 * fix 8's retest in whole short playthroughs; the eval's pacingClues turn,
 * storyTextRounds/latePacing.ts, which measured them). Every turn after the
 * first is told to plan a hint that makes the player curious, and the
 * interludes to imply details instead of spelling them out; nothing asked a
 * later turn to pay one off, so the second round's stories each carried six to
 * ten small mysteries their endings never explained. Past two thirds of the
 * story's turns (isLatePart), on a turn after the first and before the ending,
 * the hint line gives way to the late one (plant no new mystery, explain an
 * earlier one where it fits) and the interludes' examples are followed by
 * their late line. Read blind in the stage's short playthroughs: player turns
 * with no new unexplained detail 68 of 73 -> 80 of 80; the clue judge (v2,
 * reliable on its calibration) 46 of 80 -> 72 of 80. Measured on grown-up
 * stories of one to three players; a read-with-kids turn carries the lines
 * too, unmeasured there.
 */

/** The hint line every turn after the first carries (BeatPromptService). */
const HINT = "- Plan a hint about a detail in the world that makes the player curious without spelling out what's going on. (Similar to the interlude, see below.)";

/** The late part's line in the hint's place. */
const HINT_LATE =
  "- The story is in its late part: plant no new mystery. Where it fits this beat, explain a detail an earlier beat left unexplained instead (a mark, a sound, a missing or odd object that the facts or earlier beats keep bringing back): say plainly what it is or was, in the story's own terms. The interludes (see below) bring no new mystery either.";

/** The interludes' last example, and the late part's line after it. */
const INTERLUDE_ANCHOR = `- "The dream distillery is surrounded by scaffolding." (What's a dream distillery?)\n`;
const INTERLUDE_LATE = "In the story's late part, an interlude recalls or explains a detail the story already has instead of implying a new one.\n";

/** The passages BeatPromptService prints and the tests pin. */
export const LATE_CLUES_TEXT = { hint: HINT, hintLate: HINT_LATE, interludeAnchor: INTERLUDE_ANCHOR, interludeLate: INTERLUDE_LATE } as const;

/** Whether the turn being written takes the late part's clue lines: past two thirds of the story's turns, after the first turn, before the ending. */
export const takesLateClues = (story: Story): boolean => !story.isFirstBeat() && story.getCurrentBeatType() !== "ending" && isLatePart(story);
