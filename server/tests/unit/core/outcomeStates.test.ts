import { outcomeState, outcomesInPlay } from "core/utils/outcomeStates.js";
import { createMockMultiplayerStory } from "../../helpers/testHelpers.js";
import { outcome } from "../../helpers/textFixtures.js";

/** Two players: player1's list holds a copy of the shared outcome, as a template can. */
function twoPlayers() {
  const base = createMockMultiplayerStory(2).getState();
  const voice = outcome("shared_voice");
  return {
    ...base,
    sharedOutcomes: [voice],
    players: {
      player1: { ...base.players.player1, outcomes: [voice, outcome("player1_debt")] },
      player2: { ...base.players.player2, outcomes: [outcome("player2_hideout")] },
    },
  };
}

const read = (list: ReturnType<typeof outcomesInPlay>) => list.map(({ owner, outcome }) => `${owner}:${outcome.id}`);

describe("outcomesInPlay", () => {
  it("reads the shared outcomes first, then each seat's own, a shared outcome copied into a seat's list once", () => {
    expect(read(outcomesInPlay(twoPlayers()))).toEqual(["shared:shared_voice", "player1:player1_debt", "player2:player2_hideout"]);
  });

  it("reads only the seats it is given", () => {
    expect(read(outcomesInPlay(twoPlayers(), ["player2"]))).toEqual(["shared:shared_voice", "player2:player2_hideout"]);
  });
});

describe("outcomeState", () => {
  it("counts the recorded milestones plus those added, complete at its intended number or past it", () => {
    const ring = outcome("player1_ring", { intendedNumberOfMilestones: 2, milestones: ["The ledger"] });

    expect(outcomeState("player1", ring)).toEqual({ id: "player1_ring", owner: "player1", milestones: 1, intended: 2, complete: false });
    expect(outcomeState("player1", ring, 1)).toMatchObject({ milestones: 2, complete: true });
    expect(outcomeState("player1", ring, 2)).toMatchObject({ milestones: 3, complete: true });
  });
});
