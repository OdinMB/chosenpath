import { type StoryState } from "../../../../shared/types/story.js";
import {
  StoryStatePromptService,
  type SectionConfig,
} from "./StoryStatePromptService.js";
import { isFirstBeat } from "../../../../shared/utils/storyUtils.js";

export class BeatPromptService {
  private static getSections(state: StoryState): SectionConfig {
    return {
      gameMode: true,
      guidelines: true,
      storyElements: true,
      worldFacts: true,
      sharedOutcomes: true,
      sharedStats: true,
      imageLibrary: false,
      players: true,
      storyProgress: true,
      switchConfiguration: state.currentBeatType === "switch",
      threadConfiguration: state.currentBeatType === "thread",
    } as const;
  }

  static createBeatPrompt(state: StoryState): string {
    const prompt =
      StoryStatePromptService.createStoryStatePrompt(
        state,
        this.getSections(state)
      ) + this.createInstructionsSection(state);
    console.log(prompt);
    return prompt;
  }

  private static createInstructionsSection(state: StoryState): string {
    const beatTypeInstructions = this.createBeatTypeInstructions(state);
    const gameWorldInstructions = this.createGameWorldInstructions(state);

    return `\n\n======= YOUR JOB: IDENTIFY CHANGES TO THE STORY STATE AND GENERATE THE NEXT SET OF STORY BEATS =======

1. Generate changes to the story state: (statChanges)
based on players' decisions in the last beat

Guidelines
- Include changes to the shared stats and the character stats of each player.
- Consider the current value of stats to decide outcomes. For example, if a player character tries to be stealthy, but the character traits indicate more of a brute force approach, the character should fail.
- If this is the first set of beats, there should be no changes. Just return an empty list.

2. Generate one story beat for each player

How beats work:
- Players have separate beat histories. No player can see the beats of other players.
- Each beat must flow naturally from the previous beat OF THAT PLAYER.
- If several players encounter something new, you must introduce the new information to all players separately.
- No player can see the decisions of other players. If a player made a decision in the previous beat that affects other players, you must introduce the information to the other players separately.
- Beats for one turn are presented to players at the same time.

For each beat, lay out a detailed plan covering the following points:

a) Developments to narrate
- Create a bullet list of all players' decisions in the last beat and the statChanges you just applied as a result.
- For each item: mention how we should narrate the item to this player (if at all).
- If a player chose to perform an action in the last beat, mention what happened as a result of that action (even if you then switch threads).
- There should always be clear narrative feedback for players' decisions.
- This step is irrelevant if this is the first beat of the story.

b) Type of beat
- The story flows in a sequence of switches and threads (switch -> thread -> switch -> thread -> ...).
- Switches are a narrative structure of exactly 1 beat. They allow the player to choose the direction of the story.
--- Topic switches: The player can choose which direction the story should take (which outcome the thread should focus on).
--- Flavor switches: The outcome that the thread is about is already defined. The player can choose the style of the thread, how to approach it, etc.
- Threads are a narrative structure of 2-4 beats that push one or more story outcomes closer to their resolution.
${beatTypeInstructions}

c) Which information from other beats that you already created in this turn do we need to consider for this beat?
- Create a bullet list of things that happened in other beats that you already created in this turn that we should consider for this beat.
--- This is particularly important if several players are in the same thread (so the beats for the different players are consistent with each other).
--- If this is the first beat you are creating in this turn, there is nothing to consider.

d) How should we flesh out the game world to make it more immersive?
${gameWorldInstructions}
- The players' decisions are tracked separately and don't have to be tracked.

e) What should we consider as we create the options for this beat?
- How can we reinforce the story's key conflicts and focused types of decisions?
- What are the requirements from the switch configuration (if this beat is implementing a switch) or the thread configuration (if this beat is part of a thread)?
- In a thread, make sure that the options push toward the resolution of the thread's question. Don't deviate from the core question that the thread is posing.

Beat title: 
- If a switch: '[title of the switch that this beat implements]'.
- If part of a thread: '[title for the thread that this beat is part of] ([current beat number within the thread]/[total number of beats in the thread])'.

Beat text
- The first paragraph
--- Should continue exactly where the previous beat for this player ended
--- Describe the immediate consequences of the player's decision.
--- Be specific. Show, don't tell. If the player decided to talk to a character, open with the actual conversation. If the player punshes someone, describe the actual punch.
--- If the player is in a thread with other players, also describe what the decisions and outcomes of the other players are. (Unless it would be implausible for the player to know about it.)
--- It often makes sense to include some reaction from the player's perspective, like a bodily sensation, a thought, or an emotion.
- If several players are in the same beat, include them in each other's beat text.
--- In multiplayer games, the goal is to have an interesting interplay between the players and their decisions.
--- If the outcome of the thread is a shared goal or interest, the beat should be about how the players are collaborating.
--- If the outcome of the thread is a conflict or a contested goal, the beat should be about how the players are competing.
--- If the outcomes of the thread include both shared and conflicting personal goals, the beat should be about how the players are balancing these different goals.
- Use direct speech
--- Both for the player characters and the NPCs.
--- Give characters a voice. Don't just say "you absorb the cryptic wisdom imparted by X" or "you talk to X".
--- Exception: you want to skip over a routine conversation that doesn't add to the story.
- Story elements
--- If a player encounters a story element for the first time, introduce it properly.
--- If a player encounters a story element when they already encountered it before, don't introduce it again. Just refer to it assuming that the player knows what it is.
- The last paragraph
--- Never mention, introduce, or even refer to the player's options and choices.
--- Players will see their options clearly below the beat text. Talking about them in the beat text is redundant.
--- AVOID all of these formulations: "The path before you ...", "Will you do X, or will you do Y?", "You must decide: ...", "You weigh your options carefully", "the complexity of your decision ..."

3. Options

- Offer 3 options.
- Be specific. Bad: "Propose a compromise". Good: "Suggest cutting the price in half".
- Make sure that the beat implements the current switch or thread configuration.
--- If a switch configuration needs the beat to include a specific option, you must include that option.
--- If a thread lays out a flow of beats (like discovery/investigation/confrontation), adhere to that flow.
--- In a thread, don't give the player an opportunity to leave the thread prematurely, to change the topic, or to derail the thread away from its core question.
`;
  }

  private static createGameWorldInstructions(state: StoryState): string {
    let instructions = "";
    if (isFirstBeat(state)) {
      instructions = this.createFirstBeatInstructions(state);
    } else {
      instructions = this.createSubsequentBeatInstructions(state);
    }
    return instructions;
  }

  private static createFirstBeatInstructions(state: StoryState): string {
    return `This is the first beat of the story. Instead of adding any new elements or facts to the story state, let's just give the player a proper introduction.
- Required: Introduce the player itself.
- Required: Introduce the other players and their relationship to the player.
- Required: Introduce or at least hint at the outcomes that will define the ending for this player (both the personal and the shared ones).
- Optional: Introduce some initial story elements.
--- Add the element ids of the elements that you introduce to the player's list of known story elements (so they will not be introduced again).

Find a good balance between introducing the overall setup of the story, introducing some story elements, and still making this beat a good switch.
`;
  }

  private static createSubsequentBeatInstructions(state: StoryState): string {
    return `- Check if the player is going to encounter a story element that has not yet been introduced to the player.
--- If so, introduce the element properly in the beat text and add the element id to the player's list of known story elements.
- Check if you should add a new story element to the story state.
--- Do this whenever a new element is introduced that is likely to be used in later beats.
--- In most beats, you don't have to add a new story element.
--- While NPCs and locations are the most common elements to add, you can also add items, organizations, mysteries, conflicts, rumors, projects, etc.
- For existing story elements, use newFact to add new details about them.
--- Only mention NEW information that is not yet recorded in the story state.
--- Try to link new facts to story elements (using their id). Only use 'world' if the fact doesn't fit anywhere else.
--- Aim for adding 3 or more new facts per beat. These are the details that make the world come to life. By recording them, we ensure consistency in future beats.
--- Example categories for new facts: appearance (NPCs, items), history (NPCs, locations), quirks (NPCs), functionality (items), interactions (NPCs, locations), mood (locations), etc.
--- Don't add facts for new story elements that you just created.
`;
  }

  private static createBeatTypeInstructions(state: StoryState): string {
    let switchAndThreadConfiguration = "";

    if (state.currentBeatType === "switch") {
      switchAndThreadConfiguration += `\nThe beats you are creating now are for the switches mentioned above.\n
Guidelines for switches:
- For topic switches: Present options that let the player choose which outcome/question to focus on next
- If this is a flavor switch: Present options for different approaches to the predetermined outcome/question
- Ensure options align with the coordination pattern between players`;
    } else if (state.currentBeatType === "thread") {
      switchAndThreadConfiguration += `\nThe beats you are creating now are part of the threads mentioned above.\n
Guidelines for threads:
- Follow the thread's plan. If it outlines a progression of beats like greeting (establishing first impression) / conversation (learning about interests or weaknesses) / call-to-action (success/failure), make sure that this progression is followed.
- If this is the last beat of the thread, make sure that after this round of player decisions, you can resolve the thread.`;
    }
    return switchAndThreadConfiguration;
  }
}
