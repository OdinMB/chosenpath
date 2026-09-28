import { z } from "zod";
import type { Story } from "core/models/Story.js";
import type { TextRequest } from "../storyTextSteps.js";
import { round0BeatStep } from "../storyTextRound0/round0Steps.js";
import { replaceOnce } from "./roundEdits.js";

/*
 * B10, the group turn round (turn doc B10 and Appendix A, B10; turn round 3's
 * free readings; the owner's feedback workflow of 2026-09-28), an eval-only
 * variant: today's group turn (the round0 form) with the multiplayer
 * coordination note sharpened. Turn round 3 read today's stored group turns
 * by hand: places, objects and events agree in 12 of 12, but the shared
 * dialogue matched word for word in only 3 (a line changes speaker between
 * the players' turns, or one shared scene holds different conversations). The
 * note now asks, before the turns, for the one or two moments every turn shows
 * identically (who says what, word for word), each player's part and the kind
 * of action their options cover, the facts every turn agrees on, and options
 * that work whatever the others choose. It replaces today's question in the
 * prompt's coordination step and the note field's description, and nothing
 * else: "other beats" and its "How to stay consistent?" block stay, since on
 * GPT-6 that field carries player1's facts into the later players' turns
 * (123 of 126 stored turns). Groups only: a single player's turn has no note.
 */

const LABEL = "Turn round 3 group note (B10)";

/** Today's coordination question, in the prompt's coordination step (the note's field says it in its own words) */
export const TODAYS_COORDINATION_QUESTION =
  "If several players are in the same switch or thread, how do you ensure that their options are a) meaningfully different from each other, b) consistent with each other, and c) coordinated? Spell out how exactly you ensure that no combination of choices leads to inconsistencies in the story.";

/** B10's coordination note, the turn doc's Appendix A text */
export const B10_COORDINATION_NOTE =
  "Before the turns, for each switch or chapter several players share: (1) the one or two moments every turn shows identically: who says what, word for word, and what happens; (2) each player's part of the scene, and what kind of action their options cover (different kinds, so no option depends on another player's choice); (3) the facts every turn must agree on (who is where). Every option must work whatever the other players choose.";

/**
 * B10's one fix-and-retest (B10b, the group round of 2026-09-28): B10 moved
 * the judged shared-moment check 13% → 25% (not moved), and the closing
 * sentences that "wait" moved the wrong way (19% → 37% of closes), because the
 * turns now repeat one shared closing line for every player. The judge's
 * evidence shows what B10 leaves open: the planned moment reads alike, while
 * other lines in the same scene change speaker ("First day?" is Jasper's in one
 * turn, Emil's in the other) or differ. So the note's first part becomes the
 * shared moment's script, capped, which every turn gives and nothing more, and
 * a fourth part sends each turn back to its own player to close.
 */
export const B10B_COORDINATION_NOTE =
  "Before the turns, for each switch or chapter several players share: (1) the script of the moment they share: every line spoken there while two or more of their characters are present, each as Speaker: \"words\", at most four lines; every turn that shows the moment gives these lines, and only these, to the same speakers in the same words (in a player's own turn, their character's line is theirs: \"you say\"); (2) each player's part of the scene, and what kind of action their options cover (different kinds, so no option depends on another player's choice); (3) the facts every turn must agree on (who is where, what is in whose hands); (4) where each turn goes after the shared moment: its own player's part, which is where that turn ends. Every option must work whatever the other players choose.";

const NOTES = { note: B10_COORDINATION_NOTE, script: B10B_COORDINATION_NOTE } as const;

/**
 * B10's request for a group turn of any kind: today's group turn with the
 * sharpened coordination note, or (form "script", B10b) its retest.
 */
export function groupTurnB10Request(story: Story, form: keyof typeof NOTES = "note"): TextRequest<z.AnyZodObject> {
  if (!story.isMultiplayer()) throw new Error(`${LABEL}: B10 is for group turns; a single player's turn has no coordination note`);
  const today = round0BeatStep.request(story);
  const note = NOTES[form];
  return {
    prompt: replaceOnce(LABEL, today.prompt, TODAYS_COORDINATION_QUESTION, note),
    // extend keeps an existing key in its place, so the reply's field order is today's
    schema: today.schema.extend({ multiplayerCoordination: z.string().describe(note) }),
  };
}
