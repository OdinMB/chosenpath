import { type StoryState } from "../../../../shared/types/story.js";
import {
  StoryStatePromptService,
  type SectionConfig,
  DEFAULT_SECTION_CONFIG,
} from "./StoryStatePromptService.js";

export class NextThreadPromptService {
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
  } as const;

  static createThreadPrompt(state: StoryState): string {
    return (
      StoryStatePromptService.createStoryStatePrompt(state, this.SECTIONS) +
      this.createInstructionsSection()
    );
  }

  private static createInstructionsSection(): string {
    return `
======= YOUR JOB: CONTINUE THE STORY WITH A SWITCH =======

Beats
are a narrative structure of 4-5 paragraphs of text followed by a decision that the player must make.
Beats are the smallest narrative unit that in the game.

Threads
are a narrative structure of 2-4 beats that push one or more story outcomes closer to their resolution.
For each outcome that this thread is about, the thread poses a question: "Which of these possible milestones will be added to that outcome at the end of the thread?"
- Example: A thread could be about the outcome "Does [player] become a werewolf?". A thread relating to this outcome could pose the question "Does [player] want to become a member of [NPC]'s pack?" Possible milestones could be: "[Player] decides to convince [NPC] to turn them", "[Player] realizes that they don't want to lose their humanity."
A thread can have one or more players involved. It can pose questions relating to one or more outcomes.
Each player is link to a thread. If there are several threads, they happen in parallel.

Switches
are a narrative structure of exactly 1 beat. Their main purpose is to give the player agency over the direction of the story.
There are two types of switches: topic switches and flavor switches.
Topic switches: The player can choose which question is going to be addressed in the next thread.
- Example: A player might choose between exploring the wastelands (pushing the outcome "Does [player] unravel [mystery]?") and attending a meeting of the resistance (pushing the outcome "Will the resistance be able to take over [city]?").
Topic switches can be used to identify a player's priorities. In some cases, that can be a milestone toward an outcome in its own right.
- Example: If the player chooses between "Ask [NPC] out to a picnic" and "Ask [other NPC] out to a theater play", the choice could be a milestone toward the outcome "Does [player] end up in a relationship?"
Flavor switches: When the focused outcome for the next thread is already defined, the player can still choose the style of the thread.
- Example: You might determine that the next thread must be about the bounty hunters who are chasing the player. The player might choose between an evasive maneuver, a negotiation, or a direct confrontation.

Thread sequencing
A story follows the following structure: Introduction, Switch, Thread, Switch, Thread, ..., Ending.
It is time to create the next switch to this sequence.

Follow these steps:

1. Determine the story situation for each player

a) Based on the last thread (or story setup, if this is the first switch), which outcome/question pairs seem to be forced or at least strongly suggested as the focus of the next thread?
Reasons for being forced or strongly suggested:
- Immediate consequences. Example: If the player just betrayed an NPC, the next thread should address the fallout of that betrayal.
- Time-sensitive events. Example: If a bomb is about to explode, the next thread must deal with defusing it or escaping.
- Consistent actions and narrative momentum. Example: If the player just discovered a crucial piece of evidence, the next thread should follow up on that discovery.

b) Which outcome/question pairs should get priority given the story state?
When should an outcome/question get priority?
- Story duration. Example: There are only 10 beats left in the story, and the outcome "Does [player] become a famous musician?" only has 1/4 milestones. It must be pushed now to get a resolution before the story ends.
- Story dependencies. Example: Other outcomes depend on resolving this one first, like needing to determine if the player becomes a werewolf before exploring their role in the pack.
- Dramatic timing. Example: A revelation about a character's true identity should be addressed while the emotional impact is still fresh.
- Player investment (always the last consideration). Example: If the player has consistently shown interest in a particular storyline through their choices, that outcome should get priority.

c) Justify your choice of using a flavor switch or a topic switch.
- If an outcome/question pair is forced or sufficiently strongly suggested, justify why it should be the focus of the next thread. We will create a flavor switch.
- If an outcome/question pair should get priority based on the story state, justify why it should get priority . We will create a flavor switch.
- Otherwise, we can afford to give the player more agency. We will create a topic switch.

Consider both player outcomes and shared outcomes throughout this process.
`;
  }
}
