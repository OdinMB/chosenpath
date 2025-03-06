import { Story } from "../Story.js";
import {
  StoryStatePromptService,
  type SectionConfig,
} from "./StoryStatePromptService.js";

export class BeatPromptService {
  private static readonly SECTIONS_GAME_STATE: SectionConfig = {
    gameMode: true,
    guidelines: true,
    storyElements: true,
    worldFacts: true,
    sharedOutcomes: true,
    sharedStats: true,
    imageLibrary: true,
    players: true,
    storyProgress: true,
  } as const;

  private static getSectionsForContext(story: Story): SectionConfig {
    return {
      switchConfiguration: story.getCurrentBeatType() === "switch",
      threadConfiguration: story.getCurrentBeatType() === "thread",
      previousThreadConfiguration:
        (story.getCurrentBeatType() === "switch" ||
          story.getCurrentBeatType() === "ending") &&
        story.getPreviousThreadAnalysis() !== null,
    } as const;
  }

  static createBeatPrompt(story: Story): string {
    const prompt =
      this.createContextSection(story) +
      "\n\n" +
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
        this.getSectionsForContext(story)
      );
    console.log("\x1b[36m%s\x1b[0m", prompt);
    return prompt;
  }

  private static createContextSection(story: Story): string {
    return `CONTEXT

Beats
are a narrative structure of 4-5 paragraphs of text followed by a decision that the player must make.
Beats are the smallest narrative unit that in the game.${
      story.getCurrentBeatType() === "thread"
        ? "\nBeats in threads that have a favorable/unfavorable or sideA/sideB wins format are resolved to end in a favorable/mixed/unfavorable result." +
          "\nOptions can change this probability distribution with points. For example, it takes 50 points to change a 33/34/33 distribution to a 50/50/0 distribution (16 points to shift 16%-points from unfavorable to mixed, and 34 points to shift 17%-points from unfavorable to favorable)."
        : ""
    }

Threads
are a narrative structure of 2-4 beats that push one or more story outcomes closer to their resolution.
For each outcome that this thread is about, the thread poses a question: "Which of these possible milestones will be added to that outcome at the end of the thread?"
A thread can have one or more players involved. It can pose questions relating to one or more outcomes.
Each player is linked to a thread. If there are several threads, they happen in parallel.
Threads with a favorable/unfavorable or sideA/sideB wins format follow a progression of beats with increasing stakes. The result of each beat affects the success chances of the following beat. After the final beat, a favorable/mixed/unfavorable milestone is added to the outcome.
${
  story.getCurrentBeatType() !== "ending"
    ? "\nSwitches\nare a narrative structure of exactly 1 beat. Their main purpose is to give the player agency over the direction of the story." +
      (story.getCurrentBeatType() === "switch"
        ? "There are two types of switches: topic switches and flavor switches.\n" +
          "Topic switches: The player can choose which question is going to be addressed in the next thread.\n" +
          "- Example: A player might choose between exploring the wastelands (pushing the outcome 'Does [player] unravel [mystery]?') and attending a meeting of the resistance (pushing the outcome 'Will the resistance be able to take over [city]?').\n" +
          "Flavor switches: When the focused outcome for the next thread is already defined, the player can still choose the style of the thread.\n" +
          "- Example: You might determine that the next thread must be about the bounty hunters who are chasing the player. The player might choose between an evasive maneuver, a negotiation, or a direct confrontation.\n"
        : "") +
      "\n\nStory structure\n" +
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
`;
  }

  private static createInstructionsSection(story: Story): string {
    const gameWorldInstructions = this.createGameWorldInstructions(story);

    return `\n\n======= YOUR JOB: IDENTIFY CHANGES TO THE STORY STATE AND GENERATE THE NEXT SET OF STORY BEATS TO IMPLEMENT THE ${story
      .getCurrentBeatType()
      ?.toUpperCase()}${
      story.getCurrentBeatType() !== "ending" ? " CONFIGURATION" : ""
    } =======

1. IDENTIFY STATS THAT AFFECT THE CONSEQUENCES OF PLAYER ACTIONS IN THE LAST BEAT

${
  story.isFirstBeat()
    ? "Since this is the beginning of the story, there are no consequences of player actions to process. Just return an empty list."
    : "For success/failure and sideA vs. sideB threads, we already determined which side won or if the results are favorable/mixed/unfavorable. This section is about identifying other narrative consequences.\n\n" +
      "Includes stats that affect\n" +
      "- the scope of what is happening narratively. Example: If the player has a trusted bodyguard among their companions, that character might be injured in the encounter.\n" +
      "- how the consequences play out narratively. Example: How the player escapes pursuer depends on their stealth. If it's high, they escaped because of cunning. If it's low, there was a bit of luck involved.\n\n" +
      "Format: [statId]: [reason]"
}

2. GENERATE CHANGES TO THE STORY STATE

${
  story.isFirstBeat()
    ? "Since this is the beginning of the story, there are no changes to the story state. Just return an empty list."
    : "- STAT CHANGES based on players' decisions in the last beat\n" +
      "--- Include stat changes that are part of the instructions of the options that players chose in the last beat. (These instructions represent stat changes that are part of making the choice in the first place, like losing a bullet if a gun was fired, spending mana on a spell, or changing a character disposition.)\n" +
      "--- Identify any minor stat changes that are part of the consequences of the players' choices. (These are changes that are not part of making the choice, but rather the result of the choice.) Example: A player might slightly improve a skill, a spaceship might take some damage, etc.\n" +
      "--- Changes can affect both the shared stats and the individual stats of each player.\n" +
      "--- For string and string[] types of stats, make sure to set or add values that can be displayed to the player directly (e.g. 'Ring of Protection' instead of 'ring_of_protection').\n" +
      (story.getCurrentBeatType() === "switch" ||
      story.getCurrentBeatType() === "ending"
        ? "- NEW MILESTONES: The previous thread (or set of threads) has ended. For each outcome associated with these concluded threads, decide which milestone best represents the resolution of the thread. Then add that milestone to the outcome with a newMilestone change.\n"
        : "")
}

3. GENERATE ONE STORY BEAT FOR EACH PLAYER

BEAT PLAN

How to narrate consequences${
      story.getCurrentBeatType() === "ending" ||
      (story.getCurrentBeatType() == "switch" && !story.isFirstBeat())
        ? ", milestones,"
        : ""
    } and stat changes in the story?
${
  story.isFirstBeat()
    ? "This step is irrelevant since this is the first beat of the story."
    : "- The player's decisions in the last beat: mention what happened as a result of that action\n" +
      "- Same for the decisions of other players, especially if they were in the same thread as this beat's player.\n" +
      "- statChanges you just applied (in so far as this beat's player should be aware of them).\n" +
      "- There should always be clear narrative feedback for players' decisions." +
      (story.getCurrentBeatType() == "switch"
        ? "\n- Since a thread was just ended, describe the resolution of the thread in detail: milestones that were added to outcomes, how that affects the player (and other players), etc."
        : "")
}

How to implement the ${story.getCurrentBeatType()?.toUpperCase()}?
${
  story.getCurrentBeatType() === "ending"
    ? "From the summary of the previous thread, transition to an overall ending of the story for the player.\n" +
      "- Touch on each individual and shared outcome that affects the player.\n" +
      "--- Use the information why the outcome resonates with the player / why the outcome is important to them.\n" +
      "--- For shared outcomes, touch on how the outcome affects the other players.\n" +
      "- Include any individual and shared stats that you think are worth mentioning in the ending.\n"
    : story.getCurrentBeatType() === "switch"
    ? "- For topic switches: Present options that let the player choose which outcome/question to focus on next\n" +
      "- If this is a flavor switch: Present options for different approaches to the predetermined outcome/question\n" +
      "- Ensure options align with the coordination pattern between players"
    : "- Follow the thread's plan. If it outlines a progression of beats like greeting (establishing first impression) / conversation (learning about interests or weaknesses) / call-to-action (success/failure), make sure that this progression is followed.\n" +
      "- Remember that this is beat " +
      (story.getCurrentThreadBeatsCompleted() + 1) +
      "/" +
      story.getCurrentThreadDuration() +
      " of the current thread (or set of threads)." +
      (story.getCurrentThreadBeatsCompleted() === 0
        ? " Set up the situation and introduce the first step in the thread progression."
        : "") +
      "\n" +
      (story.getCurrentThreadBeatsCompleted() + 1 ==
      story.getCurrentThreadDuration()
        ? "- This is the last beat of the thread. Make sure that after this round of player decisions, you can resolve each thread.\n"
        : "- This is not yet the last beat of the thread. While each beat should contribute toward the resolution of the thread, the question of how the thread should only be answered on the last beat.\n" +
          "--- Example: Example: In a 3-beat thread, if the question is 'Will [player] acquire the artifact?', the player should not be able to acquire the artifact in the first or second beat.\n")
}
${
  story.isMultiplayer()
    ? `How to stay consistent?
Which information from other beats that you already created in this turn do we need to consider for this beat?
Create a bullet list of things that happened in other beats that you already created in this turn that we should consider for this beat.
- This is particularly important if several players are in the same thread or switch (so the beats for the different players are consistent with each other).
- If this is the first beat you are creating in this turn (for player1), there is nothing to consider.`
    : ""
}

How to flesh out the game world to make it more immersive?
${gameWorldInstructions}

${
  story.getCurrentBeatType() !== "ending"
    ? "What should we consider as we create the options for this beat?\n" +
      "- How can we reinforce the story's key conflicts and focused types of decisions?\n" +
      "- Which stats (both individual and shared) should affect the design of the options?\n" +
      "--- Example: If the player has a high charisma stat, they might want to convince someone to help them.\n" +
      "--- Example: If the player has an item, ally, companion, or anything else that could be of use, make sure that the options reflect that.\n" +
      "--- Example: If a shared stat shapes the surrounding of the situation, it might affect the options. (Tensions running high, the spaceship being damaged, etc.)\n" +
      "- What are the requirements from the " +
      story.getCurrentBeatType() +
      " configuration" +
      (story.getCurrentBeatType() === "thread"
        ? ", including the plan for the thread progression"
        : "") +
      "?" +
      (story.getCurrentBeatType() === "thread"
        ? "\n- Make sure that the options push toward the resolution of the thread's question. Don't deviate from the core question that the thread is posing."
        : "\n- Topic switches already have their options defined in the switch configuration.")
    : ""
}

BEAT ATTRIBUTES

Title: ${
      story.getCurrentBeatType() === "switch"
        ? "[title of the switch that this beat implements and nothing else]"
        : story.getCurrentBeatType() === "ending"
        ? "The End"
        : "[title for the thread that this beat is part of]\nAdd '(" +
          (story.getCurrentThreadBeatsCompleted() + 1) +
          "/" +
          story.getCurrentThreadDuration() +
          ")' after the title to indicate the beat number of the current thread."
    }

Text
- The first paragraph
--- Should continue exactly where the previous beat for this player ended
--- Describe the immediate consequences of the player's decision.
--- Be specific. Show, don't tell. If the player decided to talk to a character, open with the actual conversation. If the player punshes someone, describe the actual punch.${
      story.getCurrentBeatType() === "thread" &&
      story.getCurrentThreadBeatsCompleted() > 0
        ? "\n- If the last beat for this player was favorable / mixed / unfavorable, adjust the tone of this beat accordingly. Beats following a favorable beat should feel like there is positive momentum. Beats following an unfavorable beat should feel difficult."
        : ""
    }${
      story.isMultiplayer()
        ? "\n- If the player was in a thread or switch with other players, also describe what the decisions and outcomes of the other players are. (Unless it would be implausible for the player to know about it.)"
        : ""
    }
${
  !story.isFirstBeat() && story.getCurrentBeatType() === "switch"
    ? "- Most of the beat text\n" +
      "--- should be about the outcome of the previous thread that the player was involved in.\n" +
      "--- Process the milestones that were added to outcomes. Make it feel relevant to the player.\n" +
      (story.isMultiplayer()
        ? "--- If several players were in the same thread, process also how the thread's resolution affects the other players."
        : "")
    : ""
}${
      story.getCurrentBeatType() === "ending"
        ? "- Most of the beat text should be about the ending of the story for the player at hand.\n" +
          "--- Process the outcome of the previous thread that the player was involved in, then transition to the overall ending of the story.\n"
        : (story.isMultiplayer()
            ? "- If several players are in the same beat, include them in each other's beat text.\n" +
              "--- The goal is to have an interesting interplay between the players and their decisions.\n" +
              "--- If the outcome of the thread is a shared goal or interest, the beat should be about how the players are collaborating.\n" +
              "--- If the outcome of the thread is a conflict or a contested goal, the beat should be about how the players are competing.\n"
            : "") +
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
          "\n\nImages (optional)\n\n" +
          "If you want to generate an image for a beat, leave the imageId field empty.\n" +
          "If you want to use an existing image, specify its ID.\n" +
          "\nOptions\n" +
          "- Offer 3 options.\n" +
          "- Make sure that the beat implements the current " +
          story.getCurrentBeatType() +
          " configuration.\n" +
          (story.getCurrentBeatType() === "thread"
            ? "--- Only offer options that answer the question that is posed in this step of the thread progression.\n"
            : "") +
          "--- Don't give the player an opportunity to leave the scene, suddenly do something else, or derail the core theme of the " +
          story.getCurrentBeatType() +
          " in any other way.\n" +
          "- Be specific.\n" +
          "--- Bad: 'Propose a compromise'. Good: Specify what the compromise is.\n" +
          "--- Bad: 'Confront [NPC] physically'. Good: Specify a concrete action like 'punch [NPC] in the face'.\n" +
          "--- Bad: 'Create a diversion'. Good: 'Divert the guards by throwing some gold coins around.'\n" +
          "- Do NOT include the actual or likely consequences of a decision.\n" +
          "- For each option, set the optionType field:\n" +
          (story.getCurrentBeatType() === "switch"
            ? "--- Use 'exploration' for all options in switches.\n"
            : "--- Use 'exploration' for options in exploratory threads (that don't follow a success/failure or win/lose pattern).\n" +
              "--- Use 'challenge' for options in threads with favorable/unfavorable or sideA/sideB outcomes.\n") +
          "- Define stat changes that are a necessary part of choosing the option (if any). Don't include the results of the player's choice. (Those will be processed later.) Example: Using a spell might use up some mana. Making a choice might change a logic/empathy disposition a bit toward empathy.\n" +
          (story.getCurrentBeatType() === "thread"
            ? "- For threads with favorable/unfavorable or sideA/sideB outcomes, define how the option affects the likelihood of different outcomes\n" +
              "--- basePoints: assign a value between +25 to -25 depending on how much sense this option makes for achieving a favorable result / winning the contest (in general, ignoring stats).\n" +
              "--- modifiers: identify stats (individual and shared) that have an effect on the likelihood of success. Example: if the option is to woo an npc and player1_charisma is 70/100, you could assign a modifier of +20. If the group tries to escape the bounty hunters and their spaceship has status 'damaged', you could assign a modifier of -15.\n" +
              "--- riskType: decide if this option is risky (extreme outcomes are more likely), safe (extreme outcomes become less likely), or normal.\n"
            : "")
    }
`;
  }

  private static createGameWorldInstructions(story: Story): string {
    if (story.isFirstBeat()) {
      return this.createIntroductionInstructions(story);
    } else if (story.getCurrentBeatType() === "ending") {
      return this.createEndingInstructions(story);
    } else {
      return this.createNormalBeatInstructions(story);
    }
  }

  private static createEndingInstructions(story: Story): string {
    return `This is the ending of the story. DON'T ADD ANY NEW STORY ELEMENTS. Let's just give the player a proper ending.
- Tie the ending to the individual and shared outcomes that affect the player.
- Use references to important story elements and things that happened to the player.`;
  }

  private static createIntroductionInstructions(story: Story): string {
    return `This is the first beat of the story. DON'T ADD ANY NEW STORY ELEMENTS OR NEW FACTS. Let's just give the player a proper introduction to the existing story state.
- Required: Introduce the player itself.
- Required: Introduce the other players and their relationship to the player.
- Required: Introduce or at least hint at the outcomes that will define the ending for this player (both the personal and the shared ones).
- Optional: Introduce some initial story elements.
--- Add the element ids of the elements that you introduce to the player's list of known story elements (so they will not be introduced again).

Find a good balance between introducing the overall setup of the story, introducing some story elements, and still making this beat a good switch.`;
  }

  private static createNormalBeatInstructions(story: Story): string {
    return `World Building Instructions:
- Check if the player is going to encounter a story element that has not yet been introduced to the player.
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
