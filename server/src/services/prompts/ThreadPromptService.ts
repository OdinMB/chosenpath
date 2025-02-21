import { type StoryState } from "../../../../shared/types/story.js";
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
  } as const;

  static createThreadPrompt(state: StoryState): string {
    const prompt =
      StoryStatePromptService.createStoryStatePrompt(state, this.SECTIONS) +
      this.createInstructionsSection();
    console.log(prompt);
    return prompt;
  }

  private static createInstructionsSection(): string {
    return `\n\n======= YOUR JOB: GENERATE THE NEXT THREAD (OR SET OF THREADS) =======

Beats
are a narrative structure of 4-5 paragraphs of text followed by a decision that the player must make.
Beats are the smallest narrative unit that in the game.

Threads
are a narrative structure of 2-4 beats that push one or more story outcomes closer to their resolution.
For each outcome that a thread is about, the thread poses a question: "Which of these possible milestones will be added to that outcome at the end of the thread?"
- Example: A thread could be about the outcome "Does [player] become a werewolf?". A thread relating to this outcome could pose the question "Does [player] want to become a member of [NPC]'s pack?" Possible milestones could be: "[Player] decides to convince [NPC] to turn them", "[Player] realizes that they don't want to lose their humanity."
Each player is link to exactly one thread.
A thread can have one or more players involved. It can pose questions relating to one or more outcomes.
If there are several threads, they happen in parallel.

Switches
are a narrative structure of exactly 1 beat. Their main purpose is to give the player agency over the direction of the story.
There are two types of switches: topic switches and flavor switches.
Topic switches: The player can choose which question is going to be addressed in the next thread.
Flavor switches: When the focused outcome for the next thread is already defined, the player can choose the style of the thread.

Thread sequencing
A story follows the following structure: Switch, Thread, Switch, Thread, ..., Ending.
It is time to create the next thread to this sequence for all players.

Follow these steps:

1. Consider the switch configuration and the decisions that players made in their last beat.

2. For multiplayer stories, determine thread coordination between players

Come up with a thread configuration that is based on the last switch configuration, taking into account the choices that players made in their last beat.

YOUR OUTPUT FORMAT:

A duration for this thread (or set of threads)
- 2-4 beats
- Choose 2 for a short thread (a quick negotiation), 3 for a medium thread (fleeing from a bounty hunter), 4 for a showdown of some sort

A list of threads, including
1. One or several outcome/question pairs that the thread is about (with possible milestones for each outcome that might be added to that outcome at the end of the thread depending on player choices)
- Keep the threads focused with only one outcome/question pair per thread.
- A second outcome/question pair is allowed if it can be answered alongside the first outcome/question pair without derailing the thread.
2. Which players are linked to this thread
3. A title
4. A flexible plan to guide the thread
Your plan must be as specific as possible without assuming any particular player choices, details of future beats, etc. The thread is still supposed to evolve one beat at a time.
We are looking for a flexible plan, not a rigid script.
Things to consider:
- Outline a logical flow of beats that builds dramatic tension over the course of the thread.
--- Use a simple progression. Examples (for 3-beat threads): discovery/preparation/confrontation, setup/escalation/climax, greeting/conversation/call-to-action, etc.
--- Don't elaborate too much on the progression. A few pointers are enough. Example: greeting (establishing first impression) / conversation (learning about interests or weaknesses) / call-to-action (success/failure)
--- Reach the thread's climax and resolution exactly on the final beat. The aftermath or resolution of the thread will be covered in the introduction of the following turn. The thread is over when the player made the last decision for the thread.
- For multiplayer threads: How will you coordinate between the players?
--- How can they influence each other in this thread?
--- How will they show up in each other's beats?
--- How do you make sure that they don't get in each other's way or create implausible situations?
5. Relationship to other threads that are created in this batch
`;
  }
}
