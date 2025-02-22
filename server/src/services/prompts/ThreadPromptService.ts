import { type StoryState } from "shared/types/story.js";
import {
  StoryStatePromptService,
  type SectionConfig,
  DEFAULT_SECTION_CONFIG,
} from "./StoryStatePromptService.js";

export class ThreadPromptService {
  private static readonly SECTIONS: SectionConfig = {
    gameMode: true,
    guidelines: true,
    storyElements: true,
    worldFacts: true,
    sharedStats: true,
    sharedOutcomes: true,
    imageLibrary: false,
    players: true,
    storyProgress: true,
    switchConfiguration: true,
    threadConfiguration: false,
    previousThreadConfiguration: false,
  } as const;

  static createThreadPrompt(state: StoryState): string {
    const prompt =
      StoryStatePromptService.createStoryStatePrompt(state, this.SECTIONS) +
      this.createInstructionsSection();
    console.log(prompt);
    return prompt;
  }

  private static createInstructionsSection(): string {
    return `\n\nCONTEXT

Beats
are a narrative structure of 4-5 paragraphs of text followed by a decision that the player must make.
Beats are the smallest narrative unit that in the game.

Threads
are a narrative structure of 2-4 beats that push one or more story outcomes closer to their resolution.
For each outcome that a thread is about, the thread poses a question: "Which of these possible milestones will be added to that outcome at the end of the thread?"
- Example: A thread could be about the outcome "Does [player] become a werewolf?". A thread relating to this outcome could pose the question "Does [player] want to become a member of [NPC]'s pack?" Possible milestones could be: "[Player] decides to convince [NPC] to turn them", "[Player] realizes that they don't want to lose their humanity."
Each player is linked to exactly one thread.
A thread can have one or more players involved. It can pose questions relating to one or more outcomes.
If there are several threads, they happen in parallel.

Switches
are a narrative structure of exactly 1 beat. Their main purpose is to give the player agency over the direction of the story.
There are two types of switches: topic switches and flavor switches.
Topic switches: The player can choose which question is going to be addressed in the next thread.
Flavor switches: When the focused outcome for the next thread is already defined, the player can choose the style of the thread.

Story structure
A story follows the following structure: Switch, Thread, Switch, Thread, ..., Ending.
It is time to create the next thread to this sequence for all players.

======= YOUR JOB: GENERATE THE NEXT THREAD (OR SET OF THREADS) TO MOVE THE STORY FORWARD =======

OUTPUT FORMAT

A duration for this thread (or set of threads) between 2-4 beats.
- 2 beats for short threads (~40% of all threads). Examples: a quick trip to the library to get information, buying a magic amulet, allocating resources
- 3 beats for medium threads (~50% of all threads). Examples: fleeing from a bounty hunter, exploring a dungeon, trying to win an ally at a ball
- 4 beats for showdowns (~10% of all threads). Examples: the final concert of the band, the final duel, the final boss fight
- The duration is the same for all threads that you create in this batch.
- Choose the duration in a way that works for all threads. Design the threads in a way that works with this normalized duration.
--- If player1 and player2 are searching for an artifact in a 3-beat thread, make sure that the independent thread for player3 is worthy of a 3-beat thread (and not a 2-beat scene for buying a potion that cannot fill the 3-beat duration).
- In multiplayer games, if there is a 4-beat showdown, all players should be in the same thread.

A summary of how you want to set up the threads based on the switch configuration and the choices that the players made in these switches.
Examples:
- Independent threads + opt-in grouping: In the switch configuration, player1 and player2 are in independent threads to deal with urgent matters. player3 could decide if they want to join one of these threads. If they did, add player3 to the respective thread.
- Grouped thread to compete over a shared outcome: player1 and player2 are in a grouped thread trying to woo the same NPC. They got flavor switches to decide their approach. Set up a thread with player1 and player2 based on the approaches that they chose.
- In-grouping via an overlap of options: player1 and player2 could both choose how to proceed (via a topic switch). Their switches had option in common ("Join the expedition"). If they both chose this option, put them in the same thread. Otherwise, give them independent threads.
In single-player stories, you need not worry about the coordination pattern. You only need to generate one thread.

A list of threads.

THREADS
must include the following attributes:

1. One or several outcome/question pairs that the thread is about (with possible milestones for each outcome that might be added to that outcome at the end of the thread depending on player choices)
- Keep the threads focused with only one outcome/question pair per thread.
- A second outcome/question pair is allowed if it can be answered alongside the first outcome/question pair without derailing the thread.

2. Which players are linked to this thread

3. A title

4. A flexible (and tentative) plan to guide the thread
We are looking for a rough structure, not a rigid script. The thread is supposed to evolve one beat at a time, not follow a predetermined path.

4a) A simple progression of beats that builds dramatic tension over the course of the thread.
- For each step, formulate a question indicating the type of choice that the player(s) will have to make.
--- The question must be about player choices only.
- For each step, say how it affects the thread's outcome.
- Example (for a 2-beat negotiation)
--- 1. Conversation: How does [player] learn about interests or weaknesses of [NPC]? (Learning about weaknesses will make it easier to get the NPC to do what they want in the closing beat.)
--- 2. Closing: How does [player] get the NPC to do what they want? (This should be hard if the player has not learned about the weaknesses.)
- Example (for a 3-beat thread)
--- 1. Setup: How does [player] prepare for the encounter? (Choosing an approach that aligns with the player's strengths should give them an advantage in the encounter.)
--- 2. Escalation: How does [player] behave during the encounter? (A second chance to establish an advantage or to squander the existing one.)
--- 3. Climax: Does [player] take a risk to decide the conflict or escape? (Without having established an advantage, even the risky option should fail.)
- While each beat should contribute toward the resolution of the thread, the question of how the thread should be resolved should only be answered on the last beat.
--- Example: In a 3-beat thread, if the question is "Will [player] acquire the artifact?", the player should not be able to acquire the artifact in the first or second beat.
- Aim to reach the thread's climax with the last and decisive decision exactly on the final beat. The aftermath or resolution of the thread will be covered in the introduction of the following turn. For the purposes of this task, the thread is considered over when the player makes the last decision.

4b) For multiplayer threads: How will you coordinate between the players?
- How can they influence each other in this thread?
- How will they show up in each other's beats?
- How do you make sure that they don't get in each other's way or create implausible situations?

5. If it's a multiplayer game: relationship to other threads that are created in this batch
`;
  }
}
