import { type StoryState } from "shared/types/story.js";
import {
  StoryStatePromptService,
  type SectionConfig,
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
    console.log("\x1b[36m%s\x1b[0m", prompt);
    return prompt;
  }

  private static createInstructionsSection(): string {
    return `\n\nCONTEXT

Outcomes and milestones
pose questions that define the ending of the story. ("Will [players] unravel the mystery of the dark forest?")
Outcomes can be individual or shared between players.
Each outcome has 3 possible resolutions.
Over the course of the story, milestones are added to outcomes. Milestones mark progress toward the outcome's resolution and make some resolutions more likely.

Beats
are a narrative structure of 4-5 paragraphs of text followed by a decision that the player must make.
Beats are the smallest narrative unit in the game.

Switches
are a narrative structure of exactly 1 beat. Their purpose is to give the player agency over the direction of the story. How players should be allocated to threads depends on the switches that precede them.

Threads
are a narrative structure of 2-4 beats that push one or more story outcomes closer to their resolution.
They do this by adding a milestone to an outcome. Which milestone is added depends on how the thread unfolds.
Each beat in a thread results in a favorable, mixed, or unfavorable outcome (or in contested threads: Side A wins, mixed result, Side B wins).
The outcome of each beat affects the probability distribution of outcomes in the next beat, until finally a milestone is reached after the last beat.

Types of Threads:
1. Standard Threads
- All players work together toward shared goals
- Outcomes are favorable/mixed/unfavorable
- Example milestones (one will be added to the outcome at the end of the thread): "The group finds the artifact", "The group finds a clue about the artifact's location", "The group fails to find any trace of the artifact"
2. Contested Threads
- Players are split into Side A and Side B, competing over an outcome
- Outcomes are "Side A wins"/"Mixed result"/"Side B wins"
- Example milestones (one will be added to the outcome at the end of the thread): "Side A convinces the council", "Both sides reach a compromise", "Side B convinces the council"

Story structure
A story follows the following structure: Switch, Thread, Switch, Thread, ..., Ending.
It is time to create the next thread to this sequence for all players.

======= YOUR JOB: GENERATE THE NEXT THREAD (OR SET OF THREADS) TO MOVE THE STORY FORWARD =======

OUTPUT FORMAT

A duration for this thread (or set of threads) between 2-4 beats.
- 2 beats for short threads (~40% of all threads)
- 3 beats for medium threads (~50% of all threads)
- 4 beats for showdowns (~10% of all threads)
- The duration is the same for all threads in this batch
- Choose a duration that works for all threads

A summary of how you want to set up the threads based on the switch configuration and player choices.
Examples:
- Independent threads: Each player gets their own standard thread
- Cooperative thread: All players are on Side A of a standard thread
- Contested thread: Players are split between Side A and Side B
- Mixed setup: Some players cooperate in a standard thread while others compete in a contested thread
For single-player games, there is only one thread.

A list of threads, each with:
1. Players involved (Side A and, if it's a multiplayer thread over a contested outcome, Side B)
2. The outcome ID this thread will add a milestone to (to drive the outcome closer to resolution)
3. Possible milestones that might be added to that outcome
   - Remember that it takes several milestones to resolve an outcome. The milestone options should only establish one step toward the outcome's resolution.
   - Be very specific. Bad: "The familiar fails." Good: "The familiar fails to stop the dark stone's influence over Layla." (At the end of the game, when we read the milestones, we should be able to determine the outcome's overall resolution.)
4. A progression of 2-4 beats (matching the duration) that:
   - Builds dramatic tension toward the thread's climax on the last beat
   - Has each beat establish advantages/disadvantages for the next beat, without making the next beat impossible to reach or resolve. Example: Failing to be stealthy in the first beat must only give a disadvantage on the second beat, not have the players be carried away by the police.
   - Always gets through the entire beat progression. Specifically, no step should preempt the final outcome of the thread. (That will be decided with the player decision on the last beat.) Players should not be able to leave the thread or derail it.
   - Describes what type of advantage/disadvantage is transferred to the next beat for each possible outcome for each beat of the thread. We only need general terms, like types of first impressions, level of alarm that the guards are on, etc. Don't mention what the players are doing or how the how the advantage/disadvantage comes about. We will flesh out these details later.

EXAMPLE 2: 3-BEAT COOPERATIVE THREAD
Players (Side A): player1, player2
Outcome: Will the players stop the noble's conspiracy? (with ID shared_uncover_conspiracy)
Possible Milestones:
- Favorable: "The group steals incriminating documents about the noble's involvement"
- Mixed: "The group finds hints about the noble's involvement but no solid proof"
- Unfavorable: "The group flees the noble's manor and fails to find any evidence"
Title: Infiltrating the Noble's Manor
(Note that the possible milestones only mark one stop toward the outcome's resolution. More than one thread is needed to resolve the outcome.)

Beat Progression:
1. Getting Past the Guards
Question: How do [players] approach the manor's security?
- Favorable: The guards are distracted, giving easy access to the manor
- Mixed: [players] find a way in but the guards are on higher alert
- Unfavorable: The guards are suspicious and increase their patrols
(Note how the beat progression can continue no matter the outcome of step 1.)

2. Searching the Study
Question: How do [players] search the study without leaving traces?
- Favorable: [players] find promising leads and the study remains undisturbed
- Mixed: [players] find some leads but leave signs of searching
- Unfavorable: The study is a mess and [players] alert the household

3. Final Confrontation
Question: The noble returns early! How do [players] handle the situation?
Since this is the final beat of the thread, the possible results are the list of possible milestones that can be added to the outcome.

EXAMPLE 2: 2-BEAT CONTESTED THREAD
Title: Swaying the Council
Side A: player1 (supports military action)
Side B: player2 (advocates for diplomacy)
Outcome: Will there be war? (with ID shared_will_there_be_war)
Possible Milestones:
- Side A Wins: "The council votes for immediate military action"
- Mixed: "The council decides to prepare for war while attempting negotiations"
- Side B Wins: "The council commits to diplomatic resolution"

Beat Progression:
1. Opening Arguments
Question: How do [players] present their initial cases to the council?
- Side A Wins: Military urgency resonates with the council
- Mixed: The council remains divided and uncertain
- Side B Wins: Diplomatic opportunities capture the council's interest
(Leads to the climax in beat 2 witout preempting the council's final vote.)

2. Final Deliberation
Question: How do [players] address the council's key concerns?
Since this is the final beat of the thread, the possible results are the list of possible milestones that can be added to the outcome.
`;
  }
}
