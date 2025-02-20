import { type StoryState } from "../../../../shared/types/story.js";
import {
  StoryStatePromptService,
  type SectionConfig,
} from "./StoryStatePromptService.js";

export class NextSwitchPromptService {
  private static readonly SECTIONS: SectionConfig = {
    gameMode: true,
    guidelines: true,
    storyElements: true,
    worldFacts: true,
    sharedOutcomes: true,
    sharedStats: true,
    imageLibrary: false,
    players: true,
    storyProgress: true,
  } as const;

  static createSwitchAnalysisPrompt(state: StoryState): string {
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
A story follows the following structure: Switch, Thread, Switch, Thread, ..., Ending.
It is time to create the next switch to this sequence.

Follow these steps:

1. Determine the story situation for each player

a) Continuity. Based on the last thread (or story setup, if this is the first switch), is there an outcome/question pair that is forced or at least strongly suggested as the focus of the next thread?
Consider the following:
- Immediate consequences. Example: If the player just betrayed an NPC, the next thread should address the fallout of that betrayal.
- Time-sensitive events. Example: If a bomb is about to explode, the next thread must deal with defusing it or escaping.
- Consistent actions and narrative momentum. Example: If the player just discovered a crucial piece of evidence, the next thread should follow up on that discovery.
- Dramatic timing. Example: A revelation about a character's true identity should be addressed while the emotional impact is still fresh.
Only mark an outcome/question pair as important for continuity if it is forced or very strongly suggested as a next thread by the previous thread. Player agency in the form of a topic switch is valuable and should not be squandered.

b) Priority. Is there any outcome/question pair that must be addressed now to allow all outcomes to be resolved before the story ends?
Consider the following:
- Story duration. Example: There are only 10 beats left in the story, and the outcome "Does [player] become a famous musician?" only has 1/4 milestones. It must be pushed now to get a resolution before the story ends.
- Story dependencies. Example: Other outcomes depend on resolving this one first, like needing to determine if the player becomes a werewolf before exploring their role in the pack.
Only enforce an outcome/question pair as priority if it is forced or very strongly suggested. Player agency in the form of a topic switch is valuable and should not be squandered.

c) Decision. Justify your choice of using a flavor switch or a topic switch.
- If an outcome/question pair must be prioritized because of Continuity or Priority, justify this assessment. We will create a flavor switch.
- Otherwise, we can afford to give the player more agency. We will create a topic switch.

Consider both player outcomes and shared outcomes throughout this process.

2. For multiplayer stories, determine switch coordination between players

a) Consider the game mode's implications:
- Cooperative: Prioritize shared outcomes and opportunities for players to help each other
  Example: Players should often get switches that let them contribute to shared goals
- Competitive: Focus on personal outcomes and meaningful competition opportunities
  Example: Players' switches should create interesting points of conflict or resource competition
- Cooperative-competitive: Balance shared and competing interests
  Example: Players might need to choose between advancing personal goals or shared objectives

b) Analyze potential for player coordination based on:
- Narrative proximity: Are players physically or narratively close enough to interact?
- Shared stakes: Do players have overlapping interests in any outcomes?
- Story momentum: Would bringing players together or keeping them separate serve the story better?
- Game mode alignment: Does the coordination serve the intended cooperative/competitive dynamic?

c) Choose a coordination pattern:
- Grouped thread: All players get flavor switches for the same outcome/question when the story demands their cooperation
  Example: All players must deal with an incoming invasion, but each can choose their approach
- Opt-in grouping: Players get topic switches that include both individual and group options
  Example: Each player chooses between some variation of "Help the band prepare for the concert" or "Handle personal business"
- Parallel threads with intersection points: Players get separate switches but their choices might affect each other
  Example: Player A's choice to warn the authorities could impact Player B's heist planning
- Fully independent threads: Players get unrelated switches when their stories have naturally diverged
  Example: Player A explores the mountains while Player B investigates city politics

You can also combine these patterns.

Examples:
- player1 and player2 are in independent threads (with a flavor switch) to deal with urgent matters. player3 can decide which player's thread they want to join with a topic switch (opt-in grouping).
- player1 and player2 are in a grouped thread trying to woo the same NPC. They get flavor switches to decide their approach.
- player1 and player2 can both choose how to proceed with a topic switch. Their switches should have one option in common ("Join the expedition"). If they both choose this option, they will be in the same thread.

Follow steps 1a-c for each player, then apply step 2 to determine how their switches should relate to each other.

YOUR OUTPUT FORMAT:

A list of switches, including

1. Switch type (topic/flavor) and justification
2. Relationship to other switches
3. If flavor switch: Outcome/question that will be explored in the next thread
4. Which players are linked to this thread

EXAMPLE OUTPUT:

Coordination pattern: player1 and player2 will be in a grouped thread (and get a flavor switch). player3 will get a topic switch to decide if they want to join player1 and player2's thread or play a separate thread.

Switch 1:
- Type: Flavor switch (Justification: The immediate consequences of Player A's betrayal of the resistance must be addressed)
- player3 has an option to join
- Outcome: "Will the resistance movement survive?"
- Question: "How will the resistance respond to the betrayal?"
- Players: player1 and player2

Switch 2:
- Type: Topic switch (Justification: No immediate pressing matters for this player)
- Includes an option to join the grouped thread with player1 and player2
- Players: player3

IMPORTANT:
This whole exercise is ONLY about designing a sensible flow of the story.
Given what has happened so far and the questions that the story wants to answer (for its ending), what should be the next thread (or set of threads)?
How much agency can we give the player over which outcome/question will be explored next?
Don't make ANY assessment as to what the player should do to achieve their goals. That's for the player to decide.
`;
  }
}
