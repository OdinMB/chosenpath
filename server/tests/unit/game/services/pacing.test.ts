import { describe, expect, it } from "@jest/globals";
import { GameModes } from "core/types/index.js";
import {
  allowedLengths,
  chaptersThatFit,
  isLastChapter,
  lastChapterAfterSwitch,
  mainOutcomeId,
  outcomeNeeds,
  phaseOf,
  pickedOutcome,
  switchPacingBlock,
  threadPacingBlock,
} from "../../../../src/game/services/pacing.js";
import { endedChapter, flavorSwitch, outcome, roundStory, topicSwitch } from "../../../helpers/roundStories.js";

// Production's pacing (adopted with planner v2): the same rules as the eval's measured copy, storyTextRounds/pacing.ts

const GUILD = "player1_guild_reform";
const ENCLAVE = "player1_enclave_trust";
const MIA = "player1_mia_friendship";
const SUSPENDS = "Sir Bram suspends the bounty for one season";

/** The turn doc's A4 example: the switch at turn 13 of 25, after two 3-beat chapters on the guild outcome. */
function switchAtTurn13() {
  return roundStory({
    turns: 12,
    maxTurns: 25,
    playerOutcomes: {
      player1: [
        outcome(GUILD, { intendedNumberOfMilestones: 3, milestones: ["The Guild listens for the first time"] }),
        outcome(ENCLAVE, { intendedNumberOfMilestones: 2 }),
        outcome(MIA, { intendedNumberOfMilestones: 1 }),
      ],
    },
    phases: [
      topicSwitch([["Go to the Guild", GUILD]], 4),
      endedChapter(GUILD, 3, 5, "The Guild listens for the first time"),
      topicSwitch([["Go back to the Guild", GUILD]], 8),
      endedChapter(GUILD, 3, 9, SUSPENDS),
    ],
  });
}

describe("the pacing arithmetic (turn doc A4)", () => {
  it.each([
    [0, []],
    [1, []],
    [2, [2]],
    [3, [3]],
    [4, [4]],
    [5, [2]],
    [6, [2, 3]],
    [7, [2, 3, 4]],
    [12, [2, 3, 4]],
  ])("a chapter starting with %i turns left may have %j turns", (left, lengths) => {
    expect(allowedLengths(left)).toEqual(lengths);
  });

  it("every allowed length ends the story on its turn count when each later chapter keeps to the rule", () => {
    // From any start with at least 5 turns left, some path of allowed chapters (each after a switch turn) lands on 0
    const canEnd = (left: number): boolean => left === 0 || allowedLengths(left).some((length) => left - length === 0 || canEnd(left - length - 1));
    for (let left = 5; left <= 25; left++) {
      expect(canEnd(left)).toBe(true);
      for (const length of allowedLengths(left)) expect(left - length === 0 || canEnd(left - length - 1)).toBe(true);
    }
  });

  it("counts the chapters that fit as turns left over four, rounded down", () => {
    expect([13, 12, 5, 4, 3].map(chaptersThatFit)).toEqual([3, 3, 1, 1, 0]);
  });

  it("marks the chapter a switch opens as the last when 4 or fewer turns follow the switch, with exactly that many turns", () => {
    expect([6, 5, 4, 3, 2].map(lastChapterAfterSwitch)).toEqual([undefined, 4, 3, 2, undefined]);
    expect([5, 4, 3, 2, 1].map(isLastChapter)).toEqual([false, true, true, true, false]);
  });

  it("reads the phase from the turn: the first quarter, up to two thirds, then late; the last chapter is the final one", () => {
    expect([1, 5, 6, 13, 14, 20].map((turn) => phaseOf(turn, 20, false))).toEqual(["opening", "opening", "middle", "middle", "late", "late"]);
    expect(phaseOf(3, 20, true)).toBe("final");
  });

  it("takes a shared outcome as the main one (a contested one first), else the most intended milestones, the first listed on a tie", () => {
    const contested = outcome("shared_duel", { possibleResolutions: { sideAWins: "A", mixed: "draw", sideBWins: "B" } });
    expect(mainOutcomeId([outcome("shared_a"), contested], new Set(["shared_a", "shared_duel"]))).toBe("shared_duel");
    expect(mainOutcomeId([outcome("p_a"), outcome("shared_b")], new Set(["shared_b"]))).toBe("shared_b");
    expect(mainOutcomeId([outcome("p_a", { intendedNumberOfMilestones: 1 }), outcome("p_b", { intendedNumberOfMilestones: 3 })], new Set())).toBe("p_b");
    expect(mainOutcomeId([outcome("p_a"), outcome("p_b")], new Set())).toBe("p_a");
  });
});

describe("outcomeNeeds", () => {
  it("counts the chapter that just ended as pending at a switch, marks untouched outcomes and complete ones", () => {
    const needs = outcomeNeeds(switchAtTurn13(), "player1", true);
    expect(needs.map((n) => [n.id, n.recorded, n.pending, n.stillNeeded, n.noChapterYet, n.complete, n.main])).toEqual([
      [GUILD, 1, 1, 1, false, false, true],
      [ENCLAVE, 0, 0, 2, true, false, false],
      [MIA, 0, 0, 1, true, false, false],
    ]);
    expect(needs[0].pendingText).toBe(SUSPENDS);
  });

  it("marks an outcome at n of n, counting the pending milestone, as complete", () => {
    const story = roundStory({
      turns: 8,
      maxTurns: 20,
      playerOutcomes: { player1: [outcome(GUILD, { intendedNumberOfMilestones: 1 }), outcome(ENCLAVE)] },
      phases: [topicSwitch([["Guild", GUILD]], 4), endedChapter(GUILD, 3, 5, SUSPENDS)],
    });
    const [guild] = outcomeNeeds(story, "player1", true);
    expect(guild).toMatchObject({ stillNeeded: 0, complete: true });
  });
});

describe("switchPacingBlock", () => {
  it("renders the turn doc's example in the model's words (threads and beats)", () => {
    expect(switchPacingBlock(switchAtTurn13())).toBe(
      [
        "======= PACING =======",
        "Turn 13 of 25; 13 turns left, this one included. A switch and its thread take about 4 turns, so about 3 more threads fit, the one this switch opens included.",
        "Milestones still needed (the thread that just ended counts as pending):",
        `- ${GUILD} (the main outcome): 1 of 3, +1 pending ("${SUSPENDS}") → 1 still needed`,
        `- ${ENCLAVE}: 0 of 2, no thread yet → 2 still needed`,
        `- ${MIA}: 0 of 1, no thread yet → 1 still needed`,
        "4 milestones still needed for about 3 threads.",
        "Complete: none.",
        `Recent threads: 3 beats (${GUILD}), 3 beats (${GUILD}).`,
        "Phase: the middle of the story. What it asks of the next thread: complicate what the player has built (a rival moves, an ally doubts, a price comes due).",
      ].join("\n")
    );
  });

  it("names the last chapter's exact length late in the story, and the final phase", () => {
    const story = roundStory({
      turns: 20,
      maxTurns: 25,
      playerOutcomes: { player1: [outcome(GUILD), outcome(ENCLAVE)] },
      phases: [topicSwitch([["Guild", GUILD]], 16), endedChapter(GUILD, 3, 17, SUSPENDS)],
    });
    const block = switchPacingBlock(story);
    expect(block).toContain("Turn 21 of 25; 5 turns left, this one included.");
    expect(block).toContain("so about 1 more thread fits, the one this switch opens included.");
    expect(block).toContain("The thread this switch opens is the last before the ending: it has exactly 4 beats.");
    expect(block).toContain("Phase: the story's final thread. What it asks of it: the story's climax");
  });

  it("lists every player's outcomes in multiplayer, a shared outcome in each list", () => {
    const shared = outcome("shared_city", { intendedNumberOfMilestones: 3 });
    const story = roundStory({
      players: 2,
      turns: 0,
      maxTurns: 20,
      sharedOutcomes: [shared],
      playerOutcomes: { player1: [outcome("player1_own")], player2: [outcome("player2_own")] },
      gameMode: GameModes.Cooperative,
    });
    const block = switchPacingBlock(story);
    expect(block).toContain("Milestones still needed:\nplayer1 (Test Player 1):\n- shared_city (the main outcome): 0 of 3, no thread yet → 3 still needed");
    expect(block).toContain("player2 (Test Player 2):\n- shared_city (the main outcome)");
    expect(block).toContain("Recent threads: none yet.");
    expect(block).toContain("Phase: the opening of the story. What it asks of the next thread: meet the world and its people");
  });

  it("names complete outcomes", () => {
    const story = roundStory({
      turns: 8,
      maxTurns: 20,
      playerOutcomes: { player1: [outcome(GUILD, { intendedNumberOfMilestones: 1 }), outcome(ENCLAVE)] },
      phases: [topicSwitch([["Guild", GUILD]], 4), endedChapter(GUILD, 3, 5, SUSPENDS)],
    });
    expect(switchPacingBlock(story)).toContain(`Complete: ${GUILD}.`);
    expect(switchPacingBlock(story)).toContain(`- ${GUILD}: 0 of 1, +1 pending ("${SUSPENDS}") → complete`);
  });
});

describe("pickedOutcome (turn doc A2: the player's pick sets the chapter's outcome)", () => {
  it("reads a topic switch's chosen direction by position, the first outcome its text names", () => {
    const story = roundStory({
      turns: 5,
      maxTurns: 20,
      lastChoice: 1,
      playerOutcomes: { player1: [outcome(GUILD), outcome(ENCLAVE), outcome(MIA)] },
      phases: [topicSwitch([["Meet Sir Bram", GUILD], [`Visit the enclave (${MIA})`, ENCLAVE], ["Find Mia", MIA]], 4)],
    });
    expect(pickedOutcome(story, "player1")).toMatchObject({ kind: "topic", choice: 1, directions: 3, outcomeId: MIA, optionText: "player1 option 4.1" });
  });

  it("reads a flavor switch's set outcome", () => {
    const story = roundStory({
      turns: 5,
      maxTurns: 20,
      playerOutcomes: { player1: [outcome(GUILD), outcome(ENCLAVE)] },
      phases: [flavorSwitch(ENCLAVE, "How does Rikkit answer the enclave?", 4)],
    });
    expect(pickedOutcome(story, "player1")).toMatchObject({ kind: "flavor", outcomeId: ENCLAVE });
  });

  it("prefers the structured direction a round's switch plan keeps", () => {
    const plan = topicSwitch([["Meet Sir Bram", GUILD], ["Visit the enclave", ENCLAVE]], 4);
    const structured = {
      ...plan,
      switches: plan.switches.map((sw) => ({ ...sw, topicDirections: [{ direction: "Meet Sir Bram", outcomeId: ENCLAVE }, { direction: "x", outcomeId: GUILD }] })),
    };
    const story = roundStory({ turns: 5, maxTurns: 20, lastChoice: 0, playerOutcomes: { player1: [outcome(GUILD), outcome(ENCLAVE)] }, phases: [structured] });
    expect(pickedOutcome(story, "player1")?.outcomeId).toBe(ENCLAVE);
  });
});

describe("threadPacingBlock", () => {
  it("renders the turn doc's example: the start, the allowed lengths, the outcome's need, recent chapters and the phase", () => {
    const story = roundStory({
      turns: 13,
      maxTurns: 25,
      playerOutcomes: { player1: [outcome(GUILD, { intendedNumberOfMilestones: 3, milestones: ["a", "b"] }), outcome(ENCLAVE)] },
      phases: [endedChapter(GUILD, 3, 6, "a"), endedChapter(GUILD, 3, 9, "b"), topicSwitch([["Guild", GUILD], ["Enclave", ENCLAVE]], 12)],
    });
    expect(threadPacingBlock(story)).toBe(
      [
        "======= PACING =======",
        "This thread starts at turn 14 of 25; 12 turns are left, this one included.",
        "Allowed lengths for this thread: 2, 3 or 4 beats.",
        `The outcome this thread pushes: ${GUILD}: 2 of 3 milestones; this thread's milestone is its last one.`,
        "Recent threads: 3 beats, 3 beats.",
        "Phase: the middle of the story.",
      ].join("\n")
    );
  });

  it("allows only a 2-beat thread with 5 turns left, and names a complete outcome's aftermath", () => {
    const story = roundStory({
      turns: 5,
      maxTurns: 10,
      playerOutcomes: { player1: [outcome(GUILD, { intendedNumberOfMilestones: 1, milestones: ["done"] }), outcome(ENCLAVE, { intendedNumberOfMilestones: 1 })] },
      phases: [endedChapter(GUILD, 3, 1, "done"), flavorSwitch(GUILD, "q", 4)],
    });
    const block = threadPacingBlock(story);
    expect(block).toContain("Allowed lengths for this thread: 2 beats.");
    expect(block).toContain(`The outcome this thread pushes: ${GUILD}: 1 of 1 milestones; complete, so this thread's milestone is an aftermath.`);
  });

  it("makes the last chapter take exactly the turns left and calls it the climax", () => {
    const story = roundStory({
      turns: 17,
      maxTurns: 20,
      playerOutcomes: { player1: [outcome(GUILD, { intendedNumberOfMilestones: 3 })] },
      phases: [flavorSwitch(GUILD, "q", 16)],
    });
    const block = threadPacingBlock(story);
    expect(block).toContain("This is the story's last thread: exactly 3 beats. It is the story's climax.");
    expect(block).not.toContain("Allowed lengths");
    expect(block).toContain(`${GUILD}: 0 of 3 milestones; 3 still needed.`);
    expect(block).toContain("Phase: the story's final thread.");
  });
});
