import { describe, expect, it, jest } from "@jest/globals";
import { outcomeStateLines, outcomeStatesAtEnding } from "../../../../src/game/services/endingStates.js";
import { endedChapter, outcome, roundStory, topicSwitch } from "../../../helpers/roundStories.js";

/*
 * Where each outcome stands once the ending's milestones are added (the
 * owner's decision of 2026-09-30: each outcome is told at the ending as its
 * milestones leave it). The ending adds one milestone per thread of the
 * chapter that just ended, on that thread's outcome; the state's "Milestones
 * (k / n)" leaves it out, so the game states it.
 */

jest.spyOn(console, "log").mockImplementation(() => undefined);

const RING = "player1_ring";

function onePlayer(intended: number, recorded: string[]) {
  return roundStory({
    turns: 7,
    maxTurns: 7,
    playerOutcomes: { player1: [outcome(RING, { intendedNumberOfMilestones: intended, milestones: recorded }), outcome("player1_home", { intendedNumberOfMilestones: 1 })] },
    phases: [topicSwitch([["Dig", RING]], 0), endedChapter(RING, 2, 1, "The ledger"), topicSwitch([["Dig", RING]], 3), endedChapter(RING, 3, 4, "The exposé")],
  });
}

function group(players: number) {
  const slots = Array.from({ length: players }, (_, i) => `player${i + 1}`);
  const shared = outcome("shared_voice", { intendedNumberOfMilestones: 3 });
  return roundStory({
    players,
    turns: 4,
    maxTurns: 4,
    sharedOutcomes: [shared],
    // A template can copy a shared outcome into a player's list: it is read once, as shared
    playerOutcomes: Object.fromEntries(slots.map((slot) => [slot, [shared, outcome(`${slot}_own`)]])),
    phases: [topicSwitch([["Speak", "shared_voice"]], 0, slots), endedChapter("shared_voice", 3, 1, "The vote", slots)],
  });
}

describe("outcomeStatesAtEnding", () => {
  it("adds the milestone the chapter that just ended brings to its own outcome, complete at the intended count", () => {
    expect(outcomeStatesAtEnding(onePlayer(2, ["The ledger"]))).toEqual([
      { id: RING, owner: "player1", milestones: 2, intended: 2, complete: true },
      { id: "player1_home", owner: "player1", milestones: 0, intended: 1, complete: false },
    ]);
    expect(outcomeStatesAtEnding(onePlayer(3, ["The ledger"]))[0]).toMatchObject({ milestones: 2, intended: 3, complete: false });
    // Past its count (an aftermath) is complete too
    expect(outcomeStatesAtEnding(onePlayer(1, ["The ledger"]))[0]).toMatchObject({ milestones: 2, intended: 1, complete: true });
  });

  it("reads shared outcomes first, then each player's, and a shared outcome once", () => {
    expect(outcomeStatesAtEnding(group(2)).map((s) => `${s.owner}:${s.id} ${s.milestones}/${s.intended}`)).toEqual([
      "shared:shared_voice 1/3",
      "player1:player1_own 0/2",
      "player2:player2_own 0/2",
    ]);
  });

  it("reads nothing before the ending", () => {
    expect(outcomeStatesAtEnding(onePlayer(2, ["The ledger"]).clone({ maxTurns: 20 }))).toEqual([]);
  });
});

describe("outcomeStateLines", () => {
  it("writes the complete outcomes and the unfinished ones, a player's own marked with its seat in a group", () => {
    expect(outcomeStateLines(onePlayer(2, ["The ledger"]))).toBe(
      `--- Complete after this beat: ${RING} (2 of 2 milestones).\n--- Unfinished after this beat: player1_home (0 of 1 milestones).\n`
    );
    expect(outcomeStateLines(group(2))).toBe(
      "--- Complete after this beat: none.\n--- Unfinished after this beat: shared_voice (shared, 1 of 3 milestones), player1_own (player1, 0 of 2 milestones), player2_own (player2, 0 of 2 milestones).\n"
    );
  });
});
