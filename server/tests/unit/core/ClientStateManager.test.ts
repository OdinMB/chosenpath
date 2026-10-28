import { ClientStateManager } from "core/models/ClientStateManager.js";
import type { Story } from "core/models/Story.js";
import { AI_TEXT_PROVENANCE } from "core/types/index.js";
import type { Outcome, PlayerOptionsGeneration } from "core/types/index.js";
import { createMockStoryState } from "../../helpers/testHelpers.js";
import { endedChapter, outcome, roundStory, topicSwitch } from "../../helpers/roundStories.js";
import { outcomeStatesAtEnding } from "../../../src/game/services/endingStates.js";

const manager = new ClientStateManager();

function filtered(overrides: Parameters<typeof createMockStoryState>[0] = {}) {
  return manager.filterStateForPlayer(
    createMockStoryState(overrides),
    "player1",
    "thread",
    [],
    []
  );
}

describe("ClientStateManager.filterStateForPlayer", () => {
  it("sends the failed image ids, so the reader can hide those slots", () => {
    expect(filtered({ failedImageIds: ["harbour"] }).failedImageIds).toEqual([
      "harbour",
    ]);
    expect(filtered().failedImageIds).toEqual([]);
  });

  it("marks the story text it sends as AI-generated", () => {
    expect(filtered().provenance).toEqual(AI_TEXT_PROVENANCE);
    expect(filtered().provenance?.aiGenerated).toBe(true);
  });

  it("sends the story category", () => {
    expect(filtered({ category: "read-with-kids" }).category).toBe(
      "read-with-kids"
    );
  });
});

const HARBOUR = "shared_harbour";
const RING = "player1_ring";
const HOME = "player1_home";
const VOICE = "shared_voice";
const DEBT = "player1_debt";
const HIDEOUT = "player2_hideout";

/**
 * One player's story whose last chapter, on RING, has ended. Unwritten, it is
 * the turn the ending is written on: seven beats, the ending's milestone not
 * recorded yet. Written, it is the story as every state sent at the end finds
 * it: the ending is the eighth beat and its milestone is recorded.
 */
function soloEnding({ written, ringIntended = 3 }: { written: boolean; ringIntended?: number }) {
  return roundStory({
    turns: written ? 8 : 7,
    maxTurns: 7,
    sharedOutcomes: [outcome(HARBOUR, { intendedNumberOfMilestones: 1, milestones: ["The harbour reopens."] })],
    playerOutcomes: {
      player1: [
        outcome(RING, {
          intendedNumberOfMilestones: ringIntended,
          milestones: written ? ["The ledger", "The exposé"] : ["The ledger"],
        }),
        outcome(HOME, { intendedNumberOfMilestones: 1 }),
      ],
    },
    phases: [
      topicSwitch([["Dig", RING]], 0),
      endedChapter(RING, 2, 1, "The ledger"),
      topicSwitch([["Dig", RING]], 3),
      endedChapter(RING, 3, 4, "The exposé"),
    ],
  });
}

/** A two-player story once its ending is written; player1's list holds a copy of the shared outcome, as a template can. */
function groupEnding() {
  const slots = ["player1", "player2"];
  const voice = outcome(VOICE, { intendedNumberOfMilestones: 3, milestones: ["The vote"] });
  return roundStory({
    players: 2,
    turns: 5,
    maxTurns: 4,
    sharedOutcomes: [voice],
    playerOutcomes: {
      player1: [voice, outcome(DEBT, { milestones: ["Half the debt is paid."] })],
      player2: [outcome(HIDEOUT, { intendedNumberOfMilestones: 1, milestones: ["The hideout is found."] })],
    },
    phases: [topicSwitch([["Speak", VOICE]], 0, slots), endedChapter(VOICE, 3, 1, "The vote", slots)],
  });
}

describe("ClientStateManager.filterStateForPlayer: the outcomes at the end", () => {
  it("sends no outcomes before the story is over", () => {
    const state = soloEnding({ written: true }).clone({ maxTurns: 20 }).filterStateForPlayer("player1");

    expect(state.gameOver).toBe(false);
    expect("outcomesAtEnd" in state).toBe(false);
    expect(JSON.stringify(state)).not.toContain("Question of");
  });

  it("once the story is over, sends the shared outcomes and the player's own: each question, the milestones it reached and whether it got to its intended number", () => {
    const state = soloEnding({ written: true }).filterStateForPlayer("player1");

    expect(state.gameOver).toBe(true);
    expect(state.outcomesAtEnd).toEqual([
      {
        id: HARBOUR,
        owner: "shared",
        question: `Question of ${HARBOUR}?`,
        milestones: ["The harbour reopens."],
        intended: 1,
        complete: true,
      },
      {
        id: RING,
        owner: "player1",
        question: `Question of ${RING}?`,
        milestones: ["The ledger", "The exposé"],
        intended: 3,
        complete: false,
      },
      { id: HOME, owner: "player1", question: `Question of ${HOME}?`, milestones: [], intended: 1, complete: false },
    ]);
    // The player's own outcomes stay out of their player data
    expect(state.players.player1.outcomes).toBeUndefined();
  });

  it("counts the ending's own milestones once: each outcome ends where the ending was told it stands", () => {
    for (const ringIntended of [2, 3]) {
      const told = outcomeStatesAtEnding(soloEnding({ written: false, ringIntended })).map(
        ({ id, owner, milestones, intended, complete }) => ({ id, owner, reached: milestones, intended, complete })
      );
      const sent = soloEnding({ written: true, ringIntended })
        .filterStateForPlayer("player1")
        .outcomesAtEnd?.map(({ id, owner, milestones, intended, complete }) => ({
          id,
          owner,
          reached: milestones.length,
          intended,
          complete,
        }));

      expect(sent).toEqual(told);
    }
  });

  it("in a group, sends each player the shared outcomes and their own, a shared outcome once", () => {
    const story = groupEnding();
    const read = (slot: string) =>
      story.filterStateForPlayer(slot).outcomesAtEnd?.map(({ id, owner, milestones, intended, complete }) =>
        `${owner}:${id} ${milestones.length}/${intended}${complete ? " complete" : ""}`
      );

    expect(read("player1")).toEqual([`shared:${VOICE} 1/3`, `player1:${DEBT} 1/2`]);
    expect(read("player2")).toEqual([`shared:${VOICE} 1/3`, `player2:${HIDEOUT} 1/1 complete`]);
  });

  it("never sends a player another player's own outcomes", () => {
    const story = groupEnding();
    const player1 = JSON.stringify(story.filterStateForPlayer("player1"));
    const player2 = JSON.stringify(story.filterStateForPlayer("player2"));

    for (const text of [HIDEOUT, `Question of ${HIDEOUT}?`, "The hideout is found."]) {
      expect(player1).not.toContain(text);
    }
    for (const text of [DEBT, `Question of ${DEBT}?`, "Half the debt is paid."]) {
      expect(player2).not.toContain(text);
    }
  });

  it("never sends an outcome's possible resolutions or resonance", () => {
    const sent = [
      soloEnding({ written: true }).filterStateForPlayer("player1"),
      groupEnding().filterStateForPlayer("player1"),
      groupEnding().filterStateForPlayer("player2"),
    ].flatMap((state) => state.outcomesAtEnd ?? []);

    expect(sent.length).toBeGreaterThan(0);
    for (const item of sent) {
      expect(Object.keys(item).sort()).toEqual(["complete", "id", "intended", "milestones", "owner", "question"]);
    }
    // The fixture outcomes' resolutions and resonance (textFixtures.ts's outcome)
    for (const text of ["Won.", "Half won.", "Lost.", "It matters."]) {
      expect(JSON.stringify(sent)).not.toContain(text);
    }
  });

  it("sends an empty list at the end of a story with no outcomes", () => {
    const state = manager.filterStateForPlayer(createMockStoryState(), "player1", "ending", [], []);

    expect(state.outcomesAtEnd).toEqual([]);
  });
});

describe("ClientStateManager.filterStateForPlayer: reflection questions at the end", () => {
  const reflection = {
    [HARBOUR]: ["Who decided the harbour mattered most?", "What did it cost the town?"],
    [RING]: ["Would you expose it again?"],
    [HIDEOUT]: ["Whom did the hideout keep safe?"],
  };

  it("sends an outcome's reflection questions with it once the story is over, and no field where it has none", () => {
    const sent = soloEnding({ written: true }).clone({ reflectionQuestions: reflection }).filterStateForPlayer("player1");

    expect(sent.outcomesAtEnd?.map(({ id, reflectionQuestions }) => ({ id, reflectionQuestions }))).toEqual([
      { id: HARBOUR, reflectionQuestions: ["Who decided the harbour mattered most?", "What did it cost the town?"] },
      { id: RING, reflectionQuestions: ["Would you expose it again?"] },
      { id: HOME, reflectionQuestions: undefined },
    ]);
    expect(sent.outcomesAtEnd?.find((item) => item.id === HOME)).not.toHaveProperty("reflectionQuestions");
  });

  it("sends the questions nowhere else, and none before the end", () => {
    const story = soloEnding({ written: true }).clone({ reflectionQuestions: reflection });
    const atEnd = story.filterStateForPlayer("player1");
    const before = story.clone({ maxTurns: 20 }).filterStateForPlayer("player1");

    expect("reflectionQuestions" in atEnd).toBe(false);
    expect(JSON.stringify(before)).not.toContain("Would you expose it again?");
  });

  it("never sends a player the questions on another player's own outcome", () => {
    const story = groupEnding().clone({ reflectionQuestions: reflection });

    expect(JSON.stringify(story.filterStateForPlayer("player1"))).not.toContain("Whom did the hideout keep safe?");
    expect(story.filterStateForPlayer("player2").outcomesAtEnd?.find((item) => item.id === HIDEOUT)).toMatchObject({
      reflectionQuestions: ["Whom did the hideout keep safe?"],
    });
  });

  it("sends each outcome as before in a story with no reflection questions", () => {
    const sent = soloEnding({ written: true }).filterStateForPlayer("player1").outcomesAtEnd ?? [];

    for (const item of sent) expect(item).not.toHaveProperty("reflectionQuestions");
  });
});

/** A seat's character options as a setup or a template writes them: its own outcomes beside the identities and backgrounds. */
function seatOptions(slot: string, outcomes: Outcome[]): PlayerOptionsGeneration {
  return {
    outcomes,
    possibleCharacterIdentities: [0, 1, 2].map((i) => ({
      name: `${slot} name ${i}`,
      pronouns: { personal: "they", object: "them", possessive: "their", reflexive: "themselves" },
      appearance: `${slot} appearance ${i}`,
    })),
    possibleCharacterBackgrounds: [0, 1, 2].map((i) => ({
      title: `${slot} background ${i}`,
      fluffTemplate: `{name} grew up by the docks (${i}).`,
      initialPlayerStatValues: [{ statId: "player_nerve", value: 40 + i }],
    })),
  };
}

/** The group story's seats' options: each seat's own outcomes as they were set up, before any milestone. */
const GROUP_OPTIONS = {
  player1: seatOptions("player1", [outcome(DEBT)]),
  player2: seatOptions("player2", [outcome(HIDEOUT, { intendedNumberOfMilestones: 1 })]),
};

describe("ClientStateManager.filterStateForPlayer: the character options", () => {
  /** The group story before the character pick, part way and once it is over, its seats' options kept. */
  function groupStates(): { when: string; story: Story }[] {
    const ended = groupEnding().clone({ characterSelectionOptions: GROUP_OPTIONS });
    return [
      {
        when: "before the character pick",
        story: roundStory({ players: 2, turns: 0, maxTurns: 4 }).clone({
          characterSelectionCompleted: false,
          characterSelectionOptions: GROUP_OPTIONS,
        }),
      },
      { when: "part way", story: ended.clone({ maxTurns: 20 }) },
      { when: "once it is over", story: ended },
    ];
  }

  it("sends a player the identities and backgrounds they choose from, whole, and nothing else of their seat's options", () => {
    const state = groupStates()[0]!.story.filterStateForPlayer("player2");

    expect(state.characterSelectionOptions).toEqual({
      player2: {
        possibleCharacterIdentities: GROUP_OPTIONS.player2.possibleCharacterIdentities,
        possibleCharacterBackgrounds: GROUP_OPTIONS.player2.possibleCharacterBackgrounds,
      },
    });
    expect(Object.keys(state.characterSelectionOptions.player2!).sort()).toEqual([
      "possibleCharacterBackgrounds",
      "possibleCharacterIdentities",
    ]);
  });

  it.each(["player1", "player2"])(
    "never sends %s an outcome's possible resolutions or resonance, before the pick, part way or at the end",
    (slot) => {
      for (const { when, story } of groupStates()) {
        const sent = JSON.stringify(story.filterStateForPlayer(slot));

        for (const text of ["possibleResolutions", "resonance", "Won.", "Half won.", "Lost.", "It matters."]) {
          expect({ when, contains: text, sent: sent.includes(text) }).toEqual({ when, contains: text, sent: false });
        }
      }
    }
  );

  it("sends a player no outcome of their own before the story is over, and at the end only in outcomesAtEnd", () => {
    for (const { when, story } of groupStates()) {
      const state = story.filterStateForPlayer("player1");
      const { outcomesAtEnd, ...rest } = state;

      expect({ when, sent: JSON.stringify(rest).includes(`Question of ${DEBT}?`) }).toEqual({ when, sent: false });
      if (state.gameOver) {
        expect(outcomesAtEnd?.find((item) => item.id === DEBT)).toMatchObject({ owner: "player1", question: `Question of ${DEBT}?` });
      } else {
        expect(outcomesAtEnd).toBeUndefined();
      }
    }
  });

  it("sends no options for a seat that has none", () => {
    expect(filtered().characterSelectionOptions).toEqual({});
  });
});
