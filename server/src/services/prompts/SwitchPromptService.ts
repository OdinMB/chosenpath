import { type Story } from "../Story.js";
import {
  StoryStatePromptService,
  type SectionConfig,
} from "./StoryStatePromptService.js";
import { GameModes } from "shared/types/story.js";

export class SwitchPromptService {
  private static readonly SECTIONS_GAME_STATE: SectionConfig = {
    gameMode: true,
    guidelines: true,
    storyElements: true,
    worldFacts: true,
    stats: true,
    detailedStats: false,
    outcomes: true,
    imageLibrary: true,
    players: true,
    storyProgress: true,
  } as const;

  private static readonly SECTIONS_PREVIOUS_THREAD: SectionConfig = {
    threadConfigurationForSwitches: true,
  };

  static createSwitchAnalysisPrompt(story: Story): string {
    const prompt =
      this.createContextSection() +
      "\n" +
      "======= CURRENT GAME STATE =======\n" +
      StoryStatePromptService.createStoryStatePrompt(
        story,
        this.SECTIONS_GAME_STATE
      ) +
      "\n\n" +
      this.createInstructionsSection(story) +
      "\n\n" +
      StoryStatePromptService.createStoryStatePrompt(
        story,
        this.SECTIONS_PREVIOUS_THREAD
      );
    // console.log("\x1b[36m%s\x1b[0m", prompt);
    return prompt;
  }

  private static createContextSection(): string {
    return `CONTEXT

Beats
are a narrative structure of 5-6 paragraphs of text followed by a decision that the player must make.
Beats are the smallest narrative unit that in the game.

Threads
are a narrative structure of 2-4 beats that push one or more story outcomes closer to their resolution.
For each outcome that this thread is about, the thread poses a question: "Which of these possible milestones will be added to that outcome at the end of the thread?"
- Example: A thread could be about the outcome "Does [insert player name] become a werewolf?". A thread relating to this outcome could pose the question "Does [insert player name] want to become a member of [NPC]'s pack?" Possible milestones could be: "[Player] decides to convince [NPC] to turn them", "[Player] realizes that they don't want to lose their humanity."
A thread can have one or more players involved. It can pose questions relating to one or more outcomes.
Each player is linked to a thread. If there are several threads, they happen in parallel.

Switches
are a narrative structure of exactly 1 beat. Their main purpose is to give the player agency over the direction of the story.
There are two types of switches: topic switches and flavor switches.
Topic switches: The player can choose which question is going to be addressed in the next thread.
- Example: A player might choose between exploring the wastelands (pushing the outcome "Does [insert player name] unravel [mystery]?") and attending a meeting of the resistance (pushing the outcome "Will the resistance be able to take over [city]?").
Topic switches can be used to identify a player's priorities. In some cases, that can be a milestone toward an outcome in its own right.
- Example: If the player chooses between "Ask [NPC] out to a picnic" and "Ask [other NPC] out to a theater play", the choice could be a milestone toward the outcome "Does [insert player name] end up in a relationship?"
Flavor switches: When the focused outcome for the next thread is already defined, the player can still choose the style of the thread.
- Example: You might determine that the next thread must be about the bounty hunters who are chasing the player. The player might choose between an evasive maneuver, a negotiation, or a direct confrontation.

Thread sequencing
A story follows the following structure: Switch, Thread, Switch, Thread, ..., Ending.
It is time to create the next switch to this sequence.
`;
  }

  private static createInstructionsSection(story: Story): string {
    let instructions = `\n\n======= YOUR JOB: CONTINUE THE STORY WITH A SWITCH =======

Follow these steps:

1. Determine the story situation for each player

a) Continuity. Based on the ${
      story.getCurrentTurn() === 0 ? "story setup" : "previous thread"
    }, is there an outcome/question pair that is forced as the focus of the next thread?
Consider these cases:
- The immediate consequences of the last thread must be addressed in the next thread for narrative reasons. Example: If the player just betrayed an NPC, and the NPC launches a revenge operation, the next beat should address the revenge operation.
- Events are interfering with the story that cannot be ignored for narrative reasons. Example: The narrative function of a stat 'city_tension' defines that at <25%, a crisis should break out. That number is now at 20%.
- Switching focus would be illogical from a narrative perspective. Example: If the player just avoided dangerous traps to venture further into the mines, the next thread should be about exploring the mines.
The following cases are NOT important enough to force an outcome/question pair because of Continuity:
- Something is time-sensitive, but the story can continue without addressing it. (It's enough to present dealing with the issue as one of the options of a topic switch.)
- It seems like the player would be stupid if they ignored an opportunity. (It's enough to present the opportunity is one of several options of a topic switch.)
- The player tried to deal with an issue but failed or only succeeded partially. (It's enough to present dealing with the issue again as one of the options of a topic switch.)

b) Priority. Is there any outcome/question pair that must be addressed now to allow all outcomes to be resolved before the story ends?
- Example: There are only 10 beats left in the story, and the outcome "Does [insert player name] become a famous musician?" only has 1/4 milestones. It must be pushed now to get a resolution before the story ends.

Only mark an outcome/question pair as important for Continuity or Priority if it is forced as a next thread for narrative reasons.
Player agency in the form of a topic switch is valuable and should not be squandered.

c) Decision. Justify your choice of using a flavor switch or a topic switch.

Consider both player outcomes and shared outcomes throughout this process.

2. Determine which types of threads have been used in the previous (up to) 10 beats

This helps to avoid repeating similar types of threads, which would be boring.
Do not create switch configurations that feature the same types of threads that have been used recently.
`;

    if (story.isMultiplayer()) {
      instructions += `\n3. Determine switch coordination between players

a) Consider the game mode's implications
${
  story.getGameMode() === GameModes.Cooperative
    ? "This game is marked as Cooperative. Prioritize shared outcomes and opportunities for players to help each other\n  Example: Players should often get switches that let them contribute to shared goals"
    : ""
}${
        story.getGameMode() === GameModes.Competitive
          ? "This game is marked as Competitive. Focus on personal outcomes and meaningful competition opportunities\n  Example: Players' switches should create interesting points of conflict or resource competition"
          : ""
      }${
        story.getGameMode() === GameModes.CooperativeCompetitive
          ? "This game is marked as Cooperative-competitive. Balance shared and competing interests\n  Example: Players might need to choose between advancing personal goals or shared objectives"
          : ""
      }

b) Analyze potential for player coordination based on
- Narrative proximity: Are players physically or narratively close enough to interact?
- Shared stakes: Do players have overlapping interests in any outcomes?
- Story momentum: Would bringing players together or keeping them separate serve the story better?
- Game mode alignment: Does the coordination serve the intended cooperative/competitive dynamic?

c) Choose a coordination pattern
- Grouped thread: All players get flavor switches for the same outcome/question when the story demands their cooperation
  Example: All players must deal with an incoming invasion, but each can choose their approach
- Opt-in grouping: Players can choose to join a grouped thread with a topic switch.
  Example: Each player chooses between some variation of "Help the band prepare for the concert" or "Handle personal business". The ones who choose "help the band" end up in the same thread.
- Independent threads: Players get unrelated switches when their stories have naturally diverged
  Example: Player A explores the mountains while Player B investigates city politics

You can also combine these patterns.

Examples
- Independent threads + opt-in grouping: player1 and player2 are in independent threads (with a flavor switch) to deal with urgent matters. player3 can decide which player's thread they want to join with a topic switch.
- Grouped thread to compete over a shared outcome: player1 and player2 are in a grouped thread trying to woo the same NPC. They get flavor switches to decide their approach.
- In-grouping via an overlap of options: player1 and player2 can both choose how to proceed with a topic switch. Their switches should have one option in common ("Join the expedition"). If they both choose this option, they will be in the same thread.

Follow steps 1a-c for each player, then apply step 2 to determine how their switches should relate to each other.
`;
    }

    instructions += `\n\nYOUR OUTPUT FORMAT:

A list of switches, including

1. Switch type (topic/flavor) and justification
2. Relationship to other switches${
      story.isMultiplayer()
        ? ""
        : ". Since this is a single-player story, you can ignore this step."
    }
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
This whole exercise is ONLY about designing a sensible narrative structure. The output is NOT about what the player should do.
The relevant questions are:
- Given what has happened so far and the questions that the story wants to answer (for its ending), what could be the next thread (or set of threads)?
- How much agency can we give the player over which outcome/question will be explored next?
Don't make ANY assessment as to what the player should do to achieve their goals. It doesn't matter what would be sensible or rational for the player to do. That's for the player to decide.
`;

    return instructions;
  }
}
