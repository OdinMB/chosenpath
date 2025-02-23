import { type StoryState } from "shared/types/story.js";
import {
  StoryStatePromptService,
  type SectionConfig,
} from "./StoryStatePromptService.js";
import { isFirstBeat } from "shared/utils/storyUtils.js";

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
      previousThreadConfiguration:
        (state.currentBeatType === "switch" ||
          state.currentBeatType === "ending") &&
        state.previousThreadAnalysis !== null,
    } as const;
  }

  static createBeatPrompt(state: StoryState): string {
    const prompt =
      StoryStatePromptService.createStoryStatePrompt(
        state,
        this.getSections(state)
      ) + this.createInstructionsSection(state);
    // console.log(prompt);
    return prompt;
  }

  private static createInstructionsSection(state: StoryState): string {
    const gameWorldInstructions = this.createGameWorldInstructions(state);

    return `\n\n======= YOUR JOB: IDENTIFY CHANGES TO THE STORY STATE AND GENERATE THE NEXT SET OF STORY BEATS TO IMPLEMENT THE ${state.currentBeatType?.toUpperCase()}${
      state.currentBeatType !== "ending" ? " CONFIGURATION" : ""
    } =======

1. IDENTIFY STATS THAT AFFECT THE CONSEQUENCES OF PLAYER ACTIONS

${
  isFirstBeat(state)
    ? "Since this is the beginning of the story, there are no consequences of player actions to process. Just return an empty list."
    : "Given the previous set of beats and decisions of players, which stats seem relevant for deciding the consequences of player actions?\n\n" +
      "Includes stats that affect\n" +
      "- the chance of success. Example: Whether a player can successfully steal an artifact might depend on the that player's charisma stat.\n" +
      "- the scope of what is happening. Example: If the player has a trusted bodyguard among their companions, that character might be injured in the encounter.\n" +
      "- how the consequences play out. Example: How the player escapes pursuer depends on the spells that the player has access to.\n\n" +
      "Format: [statId]: [reason]"
}

2. GENERATE CHANGES TO THE STORY STATE

${
  isFirstBeat(state)
    ? "Since this is the beginning of the story, there are no changes to the story state. Just return an empty list."
    : "- STAT CHANGES based on players' decisions in the last beat\n" +
      "--- Changes can affect both the shared stats and the individual stats of each player.\n" +
      "--- For string and string[] types of stats, make sure to set or add values that can be displayed to the player directly (e.g. 'Ring of Protection' instead of 'ring_of_protection').\n" +
      (state.currentBeatType === "switch" || state.currentBeatType === "ending"
        ? "- NEW MILESTONES: The previous thread (or set of threads) has ended. For each outcome associated with these concluded threads, decide which milestone best represents the resolution of the thread. Then add that milestone to the outcome with a newMilestone change.\n"
        : "")
}

3. GENERATE ONE STORY BEAT FOR EACH PLAYER

CONTEXT

Beats
are a narrative structure of 4-5 paragraphs of text followed by a decision that the player must make.
Beats are the smallest narrative unit that in the game.

Threads
are a narrative structure of 2-4 beats that push one or more story outcomes closer to their resolution.
For each outcome that this thread is about, the thread poses a question: "Which of these possible milestones will be added to that outcome at the end of the thread?"
A thread can have one or more players involved. It can pose questions relating to one or more outcomes.
Each player is linked to a thread. If there are several threads, they happen in parallel.
${
  state.currentBeatType !== "ending"
    ? "\nSwitches\nare a narrative structure of exactly 1 beat. Their main purpose is to give the player agency over the direction of the story." +
      (state.currentBeatType === "switch"
        ? "There are two types of switches: topic switches and flavor switches.\n" +
          "Topic switches: The player can choose which question is going to be addressed in the next thread.\n" +
          "- Example: A player might choose between exploring the wastelands (pushing the outcome 'Does [player] unravel [mystery]?') and attending a meeting of the resistance (pushing the outcome 'Will the resistance be able to take over [city]?').\n" +
          "Flavor switches: When the focused outcome for the next thread is already defined, the player can still choose the style of the thread.\n" +
          "- Example: You might determine that the next thread must be about the bounty hunters who are chasing the player. The player might choose between an evasive maneuver, a negotiation, or a direct confrontation.\n"
        : "") +
      "\nStory structure\n" +
      "A story follows the following structure: Switch, Thread, Switch, Thread, ..., Ending.\n" +
      "It is time to create the next switch to this sequence.\n"
    : ""
}
How beats work mechanically:
- Players have separate beat histories. No player can see the beats of other players.
- Each beat must flow naturally from the previous beat OF THAT PLAYER.
- If several players encounter something new, you must introduce the new information to all players separately.
- No player can see the decisions of other players. If a player made a decision in the previous beat that affects other players, you must introduce the information to the other players separately.
- Beats for one turn are presented to players at the same time.

BEAT PLAN

How to narrate consequences${
      state.currentBeatType === "ending" ||
      (state.currentBeatType == "switch" && !isFirstBeat(state))
        ? ", milestones,"
        : ""
    } and stat changes in the story?
${
  isFirstBeat(state)
    ? "This step is irrelevant since this is the first beat of the story."
    : "- The player's decisions in the last beat: mention what happened as a result of that action\n" +
      "- Same for the decisions of other players, especially if they were in the same thread as this beat's player.\n" +
      "- statChanges you just applied (in so far as this beat's player should be aware of them).\n" +
      "- There should always be clear narrative feedback for players' decisions." +
      (state.currentBeatType == "switch"
        ? "\n- Since a thread was just ended, describe the resolution of the thread in detail: milestones that were added to outcomes, how that affects the player (and other players), etc."
        : "")
}

How to implement the ${state.currentBeatType?.toUpperCase()}?
${
  state.currentBeatType === "ending"
    ? "From the summary of the previous thread, transition to an overall ending of the story for the player.\n" +
      "- Touch on each individual and shared outcome that affects the player.\n" +
      "--- Use the information why the outcome resonates with the player / why the outcome is important to them.\n" +
      "--- For shared outcomes, touch on how the outcome affects the other players.\n" +
      "- Include any individual and shared stats that you think are worth mentioning in the ending.\n"
    : state.currentBeatType === "switch"
    ? "- For topic switches: Present options that let the player choose which outcome/question to focus on next\n" +
      "- If this is a flavor switch: Present options for different approaches to the predetermined outcome/question\n" +
      "- Ensure options align with the coordination pattern between players"
    : "- Follow the thread's plan. If it outlines a progression of beats like greeting (establishing first impression) / conversation (learning about interests or weaknesses) / call-to-action (success/failure), make sure that this progression is followed.\n" +
      "- Remember that this is beat " +
      (state.currentThreadBeatsCompleted + 1) +
      "/" +
      state.currentThreadMaxBeats +
      " of the current thread (or set of threads).\n" +
      (state.currentThreadBeatsCompleted + 1 == state.currentThreadMaxBeats
        ? "- This is the last beat of the thread. Make sure that after this round of player decisions, you can resolve each thread.\n"
        : "- This is not yet the last beat of the thread. While each beat should contribute toward the resolution of the thread, the question of how the thread should only be answered on the last beat.\n" +
          "--- Example: Example: In a 3-beat thread, if the question is 'Will [player] acquire the artifact?', the player should not be able to acquire the artifact in the first or second beat.\n")
}
How to stay consistent?
Which information from other beats that you already created in this turn do we need to consider for this beat?
Create a bullet list of things that happened in other beats that you already created in this turn that we should consider for this beat.
- This is particularly important if several players are in the same thread or switch (so the beats for the different players are consistent with each other).
- If this is the first beat you are creating in this turn (for player1), there is nothing to consider.

How to flesh out the game world to make it more immersive?
${gameWorldInstructions}

${
  state.currentBeatType !== "ending"
    ? "What should we consider as we create the options for this beat?\n" +
      "- How can we reinforce the story's key conflicts and focused types of decisions?\n" +
      "- Which stats (both individual and shared) should affect the design of the options?\n" +
      "--- Example: If the player has a high charisma stat, they might want to convince someone to help them.\n" +
      "--- Example: If the player has an item, ally, companion, or anything else that could be of use, make sure that the options reflect that.\n" +
      "--- Example: If a shared stat shapes the surrounding of the situation, it might affect the options. (Tensions running high, the spaceship being damaged, etc.)\n" +
      "- What are the requirements from the " +
      state.currentBeatType +
      " configuration" +
      (state.currentBeatType === "thread"
        ? ", including the tentative plan for the thread progression"
        : "") +
      "?" +
      (state.currentBeatType === "thread"
        ? "\n- Make sure that the options push toward the resolution of the thread's question. Don't deviate from the core question that the thread is posing."
        : "")
    : ""
}

BEAT ATTRIBUTES

Title: ${
      state.currentBeatType === "switch"
        ? "[title of the switch that this beat implements and nothing else]"
        : state.currentBeatType === "ending"
        ? "The End"
        : "[title for the thread that this beat is part of] (" +
          (state.currentThreadBeatsCompleted + 1) +
          "/" +
          state.currentThreadMaxBeats +
          ")"
    }

Text
- The first paragraph
--- Should continue exactly where the previous beat for this player ended
--- Describe the immediate consequences of the player's decision.
--- Be specific. Show, don't tell. If the player decided to talk to a character, open with the actual conversation. If the player punshes someone, describe the actual punch.
--- If the player was in a thread or switch with other players, also describe what the decisions and outcomes of the other players are. (Unless it would be implausible for the player to know about it.)
--- It often makes sense to include some reaction from the player's perspective, like a bodily sensation, a thought, or an emotion.
${
  !isFirstBeat(state) && state.currentBeatType === "switch"
    ? "- Most of the beat text\n" +
      "--- should be about the outcome of the previous thread that the player was involved in.\n" +
      "--- Process the milestones that were added to outcomes. Make it feel relevant to the player.\n" +
      "--- If several players were in the same thread, process also how the thread's resolution affects the other players."
    : ""
}${
      state.currentBeatType === "ending"
        ? "- Most of the beat text should be about the ending of the story for the player at hand.\n" +
          "--- Process the outcome of the previous thread that the player was involved in, then transition to the overall ending of the story.\n"
        : "- If several players are in the same beat, include them in each other's beat text.\n" +
          "--- In multiplayer games, the goal is to have an interesting interplay between the players and their decisions.\n" +
          "--- If the outcome of the thread is a shared goal or interest, the beat should be about how the players are collaborating.\n" +
          "--- If the outcome of the thread is a conflict or a contested goal, the beat should be about how the players are competing.\n" +
          "- Use direct speech\n" +
          "--- Both for the player characters and the NPCs.\n" +
          "--- Give characters a voice. Don't just say 'you absorb the cryptic wisdom imparted by X' or 'you talk to X'.\n" +
          "--- Exception: you want to skip over a routine conversation that doesn't add to the story.\n" +
          "- Story elements\n" +
          "--- If a player encounters a story element for the first time, introduce it properly.\n" +
          "--- If a player encounters a story element when they already encountered it before, don't introduce it again. Just refer to it assuming that the player knows what it is.\n" +
          "- The last paragraph\n" +
          "--- Never mention, introduce, or even refer to the player's options and choices.\n" +
          "--- Players will see their options clearly below the beat text. Talking about them in the beat text is redundant.\n" +
          "--- AVOID all of these formulations: 'The path before you ...', 'Will you do X, or will you do Y?', 'You must decide: ...', 'You weigh your options carefully', 'the complexity of your decision ...'\n" +
          "\nOptions\n" +
          "- Offer 3 options.\n" +
          "- Be specific.\n" +
          "--- Bad: 'Propose a compromise'. Good: Specify what the compromise is.\n" +
          "--- Bad: 'Confront [NPC] physically'. Good: Specify a concrete action like 'punch [NPC] in the face'.\n" +
          "- Don't offer options again that you already offered in previous beats.\n" +
          "--- This includes doubling down on the same option.\n" +
          "- Only include the action that the player can perform or the decision that they can make. Do NOT include the actual or likely consequences of a decision.\n" +
          "- Make sure that the beat implements the current " +
          state.currentBeatType +
          " configuration.\n" +
          "--- Don't give the player an opportunity to leave the scene, suddenly do something else, or derail the core theme of the " +
          state.currentBeatType +
          " in any other way.\n" +
          "\nRemember: one key purpose of this beat (or set of beats) is to implement the " +
          state.currentBeatType +
          " configuration. Move the story forward in a way that stays true to the " +
          state.currentBeatType +
          "'s theme and goals."
    }
`;
  }

  private static createGameWorldInstructions(state: StoryState): string {
    if (isFirstBeat(state)) {
      return this.createIntroductionInstructions(state);
    } else if (state.currentBeatType === "ending") {
      return this.createEndingInstructions(state);
    } else {
      return this.createNormalBeatInstructions(state);
    }
  }

  private static createEndingInstructions(state: StoryState): string {
    return `This is the ending of the story. DON'T ADD ANY NEW STORY ELEMENTS. Let's just give the player a proper ending.
- Tie the ending to the individual and shared outcomes that affect the player.
- Use references to important story elements and things that happened to the player.`;
  }

  private static createIntroductionInstructions(state: StoryState): string {
    return `This is the first beat of the story. DON'T ADD ANY NEW STORY ELEMENTS OR NEW FACTS. Let's just give the player a proper introduction to the existing story state.
- Required: Introduce the player itself.
- Required: Introduce the other players and their relationship to the player.
- Required: Introduce or at least hint at the outcomes that will define the ending for this player (both the personal and the shared ones).
- Optional: Introduce some initial story elements.
--- Add the element ids of the elements that you introduce to the player's list of known story elements (so they will not be introduced again).

Find a good balance between introducing the overall setup of the story, introducing some story elements, and still making this beat a good switch.`;
  }

  private static createNormalBeatInstructions(state: StoryState): string {
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
- The players' decisions are tracked separately and don't have to be tracked.`;
  }
}
