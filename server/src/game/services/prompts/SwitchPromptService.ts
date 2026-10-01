import { Story } from "core/models/Story.js";
import {
  StoryStatePromptService,
  type SectionConfig,
} from "./StoryStatePromptService.js";
import { GameModes } from "core/types/story.js";
import { isContestedOutcome } from "core/utils/outcomeReadiness.js";
import { outcomeNeeds } from "../pacing.js";

/*
 * The switch planner (planner v2, adopted on 2026-09-28; turn doc A2, A4,
 * A5): each topic direction names the one outcome it pushes, so the
 * player's pick sets the next chapter's outcome in code; continuity is
 * stated once in its narrow form and priority is binding late in the story
 * (the owner's call), both read against the PACING block the game computes
 * (pacing.ts) in place of STORY PROGRESS; the reply is lean
 * (plannerReplies.ts). The planner's view of the story leaves out the image
 * library, and shows the thread that just ended as such, with each beat's
 * chosen option only. Today's form before the adoption is kept for the eval
 * in storyTextRound0/; adoptedPlanners.test.ts holds this equal to the
 * measured planner v2, with, since 2026-10-01, the measured line that offers a
 * contested outcome's last stage only as a grouped thread
 * (CONTEST_LAST_STAGE_LINE, the parallel-threads stage).
 */

/** Closes the example output of every switch analysis after the opening multiplayer one. */
const SWITCH_EXERCISE_REMINDER = `IMPORTANT:
This whole exercise is ONLY about designing a sensible narrative structure. The output is NOT about what the player should do.
The relevant questions are:
- Given what has happened so far and the questions that the story wants to answer (for its ending), what could be the next thread (or set of threads)?
- How much agency can we give the player over which outcome/question will be explored next?
Don't make ANY assessment as to what the player should do to achieve their goals. It doesn't matter what would be sensible or rational for the player to do. That's for the player to decide.
`;

/**
 * A contested outcome's last stage is decided with both sides there (the
 * parallel-threads stage of 2026-10-01, fix 4 of the second playthroughs'
 * review, measured as the eval's parallelThreads switch planner and adopted as
 * measured). In the stored stories the switch offered the space pirates'
 * treasure claim (1 of 2) and the estate agents' sale (2 of 3) as one topic
 * direction among others; one side took it alone ("Join Rory at a
 * neighborhood open house"), the chapter planner had to follow the picks, and
 * the contest was settled in a thread the other side wasn't in. Replayed on
 * the three switches before such a stage, production offered it as a
 * direction one side could take alone in 5 of 6 plans, the line in 1 of 6
 * (moved, p 0.040), its switch planner no slower. Marginal: one of the line's
 * five held the contest back instead of grouping it; grouped offers alone,
 * 1 of 6 -> 4 of 6, read p 0.121, not moved. The chapter planned after a
 * grouped switch the line produced was never measured. Printed after the
 * coordination examples where a contested shared outcome has one milestone
 * still needed (the chapter that just ended counted as pending), in a contest
 * game after the opening switch.
 */
export const CONTEST_LAST_STAGE_LINE =
  "A contested shared outcome (Side A / Side B resolutions) that PACING shows with 1 milestone still needed is settled by its next thread, a contest that needs both sides in it. Offer it only as a grouped thread, a flavor switch on it for every player, never as one direction among others: one side could take that direction alone while the other side is elsewhere, and the contest would be settled without them.\n";

/** Whether the switch planner takes CONTEST_LAST_STAGE_LINE: a contest game after the opening, a contested shared outcome's next thread settling its last stage. */
export function contestAtLastStage(story: Story): boolean {
  const mode = story.getGameMode();
  if (!story.isMultiplayer() || (mode !== GameModes.Competitive && mode !== GameModes.CooperativeCompetitive) || story.getCurrentTurn() === 0) return false;
  const contested = new Set(story.getSharedOutcomes().filter(isContestedOutcome).map((o) => o.id));
  const [slot] = story.getPlayerSlots();
  return outcomeNeeds(story, slot, true).some((need) => contested.has(need.id) && need.stillNeeded === 1);
}

/** A4 step a: continuity in its narrow form. */
const STEP_A = `a) Continuity. Is the next thread's outcome forced? Only these things force it:
- the last thread's immediate consequences (the player betrayed an NPC, and the NPC strikes back);
- an event the story can't ignore: a stat reaches a threshold its narrative implications name, or a SWITCH/THREAD INSTRUCTION is due (a timing rule, or at the story's first switch an opening rule);
- a change of focus that would make no sense (the player just got past the traps into the mines).
A forced situation makes this a flavor switch on the open outcome it bears on most. If no open outcome fits, keep the switch you would otherwise choose and let the situation shape the next thread. When an instruction says topic switches must offer something (an escape, a feeding thread), make it one of the three directions, on the outcome it bears on most.
Something time-sensitive, a tempting opportunity or a partial failure does not force it: offer it as one of the directions.`;

/** A4 step b, binding late (owner, decision 3 (b)). */
const STEP_B = `b) Priority. Read PACING. When fewer threads are left than milestones still needed, every direction pushes an outcome that still needs milestones, those with no thread yet first; when only one outcome can still get its milestones, a flavor switch on it is right. A complete outcome is offered only when every outcome is complete. A situation step a found forced comes first.`;

const SWITCH_OUTPUT_1P = `The switch:
1. Switch type (topic/flavor)
2. If flavor switch: the outcome and the question the next thread explores. If topic switch: three directions the player can follow, each with the one outcome it pushes.
3. A title

For each direction, think of a thread type that isn't one of the player's last three (PREVIOUS THREAD TYPES) and, where one fits, is one of the story's thread types.`;

const SWITCH_OUTPUT_MP = `A list of switches, including

1. Which players are linked to this switch
2. Switch type (topic/flavor)
3. Relationship to other switches
4. If flavor switch: the outcome and the question the next thread explores. If topic switch: three directions the players can follow, each with the one outcome it pushes.
5. A title

For each direction, think of a thread type that isn't one of the players' last three (PREVIOUS THREAD TYPES) and, where one fits, is one of the story's thread types.`;

export class SwitchPromptService {
  /** The story state the switch planner reads: PACING where STORY PROGRESS would be, and no image library. */
  private static readonly SECTIONS_GAME_STATE: SectionConfig = {
    gameMode: true,
    guidelines: true,
    storyElements: true,
    worldFacts: true,
    stats: true,
    detailedStats: false,
    outcomes: true,
    players: true,
    previousThreads: true,
    switchPacing: true,
    switchAndThreadInstructions: true,
  } as const;

  private static readonly SECTIONS_PREVIOUS_THREAD: SectionConfig = {
    threadJustEndedForSwitches: true,
  };

  static createSwitchAnalysisPrompt(story: Story): string {
    return (
      this.createContextSection() +
      "\n" +
      this.createInstructionsSection(story) +
      "\n\n======= CURRENT GAME STATE =======\n" +
      StoryStatePromptService.createStoryStatePrompt(story, this.SECTIONS_GAME_STATE) +
      // Only show the previous thread if this is not the opening switch
      (story.getCurrentTurn() > 1
        ? "\n\n" + StoryStatePromptService.createStoryStatePrompt(story, this.SECTIONS_PREVIOUS_THREAD)
        : "")
    );
  }

  private static createContextSection(): string {
    return `CONTEXT

Beats
are a narrative structure of 5-6 paragraphs of text (3-5 sentences each) followed by a decision that the player must make.
Beats are the smallest narrative unit that in the game.

Threads
are a narrative structure of 2-4 beats that push one story outcome closer to its resolution.
The thread poses one question about its outcome: which of its possible milestones will the outcome get at the end of the thread?
- Example: A thread could be about the outcome "Does [insert player name] become a werewolf?". A thread relating to this outcome could pose the question "Does [insert player name] want to become a member of [NPC]'s pack?" Possible milestones could be: "[Player] decides to convince [NPC] to turn them", "[Player] realizes that they don't want to lose their humanity."
A thread can have one or more players involved.
Each player is linked to a thread. If there are several threads, they happen in parallel.

Switches
are a narrative structure of exactly 1 beat. Their main purpose is to give the player agency over the direction of the story.
There are two types of switches: topic switches and flavor switches.
Topic switches: The player can choose which question is going to be addressed in the next thread.
- Example: A player might choose between exploring the wastelands (pushing the outcome "Does [insert player name] unravel [mystery]?") and attending a meeting of the resistance (pushing the outcome "Will the resistance be able to take over [city]?").
Flavor switches: When the focused outcome for the next thread is already defined, the player can still choose the style of the thread.
- Example: You might determine that the next thread must be about the bounty hunters who are chasing the player. The player might choose between an evasive maneuver, a negotiation, or a direct confrontation.

Thread sequencing
A story follows the following structure: Switch, Thread, Switch, Thread, ..., Ending.
It is time to create the next switch to this sequence.
`;
  }

  private static createInstructionsSection(story: Story): string {
    const opening = story.isMultiplayer() && story.getCurrentTurn() === 0;
    let instructions = `\n\n======= YOUR JOB: CONTINUE THE STORY WITH A SWITCH =======

Follow these steps:

1. Decide for each player whether the next switch is a flavor switch or a topic switch`;
    if (opening) {
      // The first thread of a multiplayer game is one grouped thread (step 2 b)
      instructions += `\nEvery player gets a flavor switch, since the first thread is one grouped thread (step 2 b).`;
    } else {
      instructions += `\n${STEP_A}

${STEP_B}

Player agency in the form of a topic switch is valuable and should not be squandered.

Consider both player outcomes and shared outcomes throughout this process.
`;
    }

    if (story.isMultiplayer()) {
      instructions += "\n\n" + this.createSwitchCoordinationInstructions(story);
    }

    instructions += `\n\nFollow step 1 for each player`;
    if (story.isMultiplayer()) {
      instructions += `, then apply step 2 to determine how their switches should relate to each other`;
    }
    instructions += `.\n\nYOUR OUTPUT FORMAT:

${story.isMultiplayer() ? SWITCH_OUTPUT_MP : SWITCH_OUTPUT_1P}

EXAMPLE OUTPUT:\n\n`;

    if (opening) {
      instructions += `Coordination pattern: ALL players will participate in a single grouped thread addressing the shared outcome "Will they escape the collapsing temple?" Each player gets a flavor switch to determine how they will contribute.

Switch 1:
- Type: Flavor switch (Justification: First thread of a multiplayer game requires all players to be in the same thread)
- Outcome: "Does the group survive the adventure?"${" "}
- Question: "Does the group escape the collapsing temple unscathed?"
- Players: player1, player2

If the game mode is cooperative or cooperative-competitive, the first thread should be about a cooperative shared outcome. If the game mode is competitive, the first thread must be about a contested shared outcome.
`;
    } else if (story.isMultiplayer()) {
      instructions += `Coordination pattern: player1 and player2 will be in a grouped thread (and get a flavor switch). player3 will get a topic switch to decide if they want to join player1 and player2's thread or play a separate thread.

Switch 1:
- Type: Flavor switch (Justification: The immediate consequences of player1's betrayal of player2 must be addressed)
- Outcome: "Will the resistance movement survive?"
- Question: "How will the resistance respond to the betrayal?"
- Players: player1 and player2
- player3 has an option to join

Switch 2:
- Type: Topic switch (Justification: No immediate pressing matters for this player)
- Topic choices: 3 directions, including an option to join the grouped thread with player1 and player2
- Players: player3

${SWITCH_EXERCISE_REMINDER}`;
    } else {
      instructions += `Switch:
- Type: Topic switch (nothing forces the focus of the next thread, so the player chooses it)
- Topic choices: three directions, each with the one outcome it pushes
- Players: player1

${SWITCH_EXERCISE_REMINDER}`;
    }
    instructions += "\nAlso consider the SWITCH/THREAD INSTRUCTIONS that are specific to this story.\n";

    return instructions;
  }

  // only called for multiplayer games
  private static createSwitchCoordinationInstructions(story: Story): string {
    let instructions = `2. Determine switch coordination between players

a) Consider the game mode's implications`;

    if (story.getGameMode() === GameModes.Cooperative) {
      instructions += `\n- This game is marked as Cooperative. Prioritize shared outcomes and opportunities for players to be in the same thread to help each other`;
    } else if (story.getGameMode() === GameModes.Competitive) {
      instructions += `\n- This game is marked as Competitive. Focus on shared outcomes that players compete over. Over the course of the story, create both separate (preparation, eavesdropping, etc.) and joint (duel, direct competition, etc.) threads competition.`;
    } else {
      instructions += `\n- This game is marked as Cooperative-competitive. Balance joint threads for shared goals and individual threads for personal goals`;
    }

    if (story.getCurrentTurn() === 0) {
      instructions += `\nb) Player coordination.\nSince this will be the first thread of the game, ALL players MUST be in a SINGLE JOINT THREAD together.`;
    } else {
      instructions += `\nb) Analyze potential for player coordination based on
- Narrative proximity: Are players physically or narratively close enough to interact?
- Shared stakes: Do players have overlapping interests in any outcomes?
- Story momentum: Would bringing players together or keeping them separate serve the story better?
- Game mode alignment: Does the coordination serve the intended cooperative/competitive dynamic?`;
    }

    instructions += `\n\nc) Choose a coordination pattern
${"    "}
- Grouped thread: All players get flavor switches for the same outcome/question when the story demands their cooperation
  Example: All players must deal with an incoming invasion, but each can choose their approach
- Opt-in grouping: Players can choose to join a grouped thread with a topic switch.
  Example: Each player chooses between some variation of "Help the band prepare for the concert" or "Handle personal business". The ones who choose "help the band" end up in the same thread.
- Independent threads: Players get unrelated switches when their stories have naturally diverged
  Example: Player A explores the mountains while Player B investigates city politics`;

    if (story.getCurrentTurn() !== 0) {
      instructions += `\nYou can also combine these patterns.

Examples
- Independent threads + opt-in grouping: player1 and player2 are in independent threads (with a flavor switch) to deal with urgent matters. player3 can decide which player's thread they want to join with a topic switch.
- Grouped thread to compete over a shared outcome: player1 and player2 are in a grouped thread trying to woo the same NPC. They get flavor switches to decide their approach.
- In-grouping via an overlap of options: player1 and player2 can both choose how to proceed with a topic switch. Their switches should have one option in common ("Join the expedition"). If they both choose this option, they will be in the same thread.
`;
      if (contestAtLastStage(story)) instructions += CONTEST_LAST_STAGE_LINE;
    }

    return instructions;
  }
}
