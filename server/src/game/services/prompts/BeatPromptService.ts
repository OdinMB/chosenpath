import { Story } from "core/models/Story.js";
import {
  StoryStatePromptService,
  type SectionConfig,
} from "./StoryStatePromptService.js";
import { POINTS_FOR_SACRIFICE, POINTS_FOR_REWARD } from "core/config.js";

export class BeatPromptService {
  private static readonly SECTIONS_GAME_STATE: SectionConfig = {
    gameMode: true,
    guidelines: true,
    storyElements: true,
    worldFacts: true,
    stats: true,
    detailedStats: true,
    imageLibrary: true,
    players: true,
    storyProgress: true,
  } as const;

  private static getSectionsForContext(story: Story): SectionConfig {
    return {
      switchConfiguration: story.getCurrentBeatType() === "switch",
      // switch and thread instructions can include instructions for stat changes after threads
      switchAndThreadInstructions: story.getCurrentBeatType() === "switch",
      // thread configuration for thread beats
      threadConfigurationForThreadBeats:
        story.getCurrentBeatType() === "thread",
      // previous thread to continue from
      threadConfigurationForSwitchBeats:
        (story.getCurrentBeatType() === "switch" ||
          story.getCurrentBeatType() === "ending") &&
        story.getPreviousThreadAnalysis() !== null,
    } as const;
  }

  static createBeatPrompt(story: Story): string {
    // Create a copy of SECTIONS_GAME_STATE and set outcomes based on beat type
    const sections = {
      ...this.SECTIONS_GAME_STATE,
      outcomes: story.getCurrentBeatType() === "switch",
    };

    const prompt =
      this.createContextSection(story) +
      "\n" +
      this.createInstructionsSection(story) +
      "\n\n======= CURRENT GAME STATE =======\n\n" +
      StoryStatePromptService.createStoryStatePrompt(story, sections) +
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
are a narrative structure of 5-6 paragraphs of 4-5 sentences each followed by a decision that the player must make.
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
          "- Example: A player might choose between exploring the wastelands (pushing the outcome 'Does [insert player name] unravel [mystery]?') and attending a meeting of the resistance (pushing the outcome 'Will the resistance be able to take over [city]?').\n" +
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

1. IDENTIFY STATS AND STORY ELEMENTS THAT AFFECT THE NARRATIVE CONSEQUENCES OF PLAYER DECISIONS IN THE PREVIOUS BEAT

${
  story.isFirstBeat()
    ? "Since this is the beginning of the story, there are no consequences of player actions to process. Just return an empty list."
    : "We already determined the resolution of the previous beat. This part is only about how these resolutions should be narrated.\n\n" +
      "Includes stats and story elements that affect\n" +
      "- the scope of what must be covered in the narrative. Example: If the player has a bodyguard, that NPC might be injured in the encounter.\n" +
      "- how the resolution came about. Example: The thread might have determined that the player escapes their pursuer, but how they do it depends on their stealth. If it's high, they escaped because of cunning or agility. If it's low, there was a bit of luck involved.\n\n" +
      "Format: [Id of the stat or story element]: [effect on how the previous beat's resolution is narrated]"
}

2. IDENTIFY CHANGES TO THE STORY STATE BASED ON PLAYER DECISIONS IN THE PREVIOUS BEAT

${
  story.isFirstBeat()
    ? "Since this is the beginning of the story, there are no changes to the story state. Just return an empty list."
    : "STAT CHANGES\n" +
      "- If a player chose a sacrifice option to gain a higher chance of success, that player should lose whatever was sacrificed.\n" +
      "- If a player chose a reward option and accepted a lower chance of success, that player should gain their reward.\n" +
      "- If you want to replace an item in a string[] stat, apply both a removeElement and addElement change.\n" +
      (story.getCurrentBeatType() === "switch" ||
      story.getCurrentBeatType() === "ending"
        ? "- The previous thread (or set of threads) was just resolved, so some meaningful stat changes might be warrented.\n" +
          "- Consider what was at stake in the previous thread and the thread's resolution.\n" +
          "- Stats define how they should be adjusted after threads. Consider the 'Adjustments after threads' parameter in the stat definitions.\n" +
          "- When a thread is resolved, all stats can change, not just the ones that are marked as 'can be changed in beat resolutions'.\n" +
          "\nNEW MILESTONES: To resolve the previous set of threads, for each outcome associated with these resolved threads, add a milestone based on the thread's resolution with a newMilestone change.\n" +
          "- Take the threads' resolution text as a baseline. Adjust it based on the thread's narrative text to make the new milestone more specific. Example: if the thread's general resolution is 'The council's decision heavily favors progress', based on the thread's narrative, the new milestone could be 'Threatened by the Furious Four, the council has no choice but to approve the new railroad.'\n"
        : "- For beat resolutions, only stats that are marked as 'can always be adjusted' can be changed. Even then, keep the changes minor.\n")
}${
      story.isMultiplayer()
        ? "\n\n3. MULTIPLAYER COORDINATION\n\n" +
          "If several players are in the same switch or thread, how do you ensure that their options are a) meaningfully different from each other, b) consistent with each other, and c) coordinated? Spell out how exactly you ensure that no combination of choices leads to inconsistencies in the story.\n" +
          "- Example: In thread tense_negotiation, we must ensure that [insert player names] don't represent the group in an inconsistent way. Let's give [player name 1] options for proposals, while [player name 2] gets options for shifting the atmosphere in the negotiation.\n" +
          "- Example: In thread investigating_manor, we must ensure that the players don't investigate the scene in an inconsistent way. Let's give [player name 1] options for examining specific evidence, while [player name 2] gets options for questioning witnesses or securing the perimeter."
        : ""
    }

${story.isMultiplayer() ? "4." : "3."} GENERATE ONE STORY BEAT FOR EACH PLAYER

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
    : "- The player's decisions in the previous beat: mention what happened as a result of that action\n" +
      (story.isMultiplayer()
        ? "- Same for the decisions of other players, especially if they were in the same thread as this beat's player.\n"
        : "") +
      "- statChanges you just applied (in so far as this beat's player should be aware of them).\n" +
      "- There should always be clear narrative feedback for players' decisions." +
      (story.getCurrentBeatType() == "switch"
        ? "\n- Since a thread was just resolved, describe the resolution of the thread in detail. Focus on the milestones that were added to outcomes and how that affects the player" +
          story.isMultiplayer()
          ? " (and other players)."
          : "."
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
          "--- Example: In a 3-beat thread, if the question is 'Will [insert player name] acquire the artifact?', the player should not be able to acquire the artifact in the first or second beat.\n")
}
${
  story.isMultiplayer()
    ? `\nHow to stay consistent?
Which information from other beats that you already created in this turn do we need to consider for this beat?
Create a bullet list of things that happened in other beats that you already created in this turn that we should consider for this beat.
- This is particularly important if several players are in the same thread or switch (so the beats for the different players are consistent with each other).
- If this is the first beat you are creating in this turn (for player1), there is nothing to consider.
`
    : ""
}
How to flesh out the game world to make it more immersive?
${gameWorldInstructions}

How to make sure that the text follows the principle of 'Show Don't Tell'?
Create a list of the three most important actions and developments that will be covered in this beat, each with a short instruction on how to make sure that the point is delivered based on the principle of 'show don't tell'. 
The first item must always be the players performing the actions that they chose in the previous beat and how these actions play out. Concrete actions, direct speech.${
      story.isMultiplayer() && story.isFirstBeat()
        ? "\nSince this is the first beat of a multiplayer story, introduce the characters of the other players."
        : ""
    }
Examples:
- The player decided to bribe the guard: we should narrate how the player presents the bribe using direct speech.
- The old sage provides a cryptic hint: we should spell out the cryptic hint and deliver it in direct speech.
- The player gets attacked by a goblin: we should describe the actual attack.

${
  story.getCurrentBeatType() !== "ending"
    ? "What should we consider as we create the options for this beat? Cover the following points:\n" +
      "- Most important: What are the requirements from the " +
      story.getCurrentBeatType() +
      " configuration" +
      (story.getCurrentBeatType() === "thread"
        ? ", especially the plan for the thread's progression?"
        : "?") +
      "?" +
      (story.getCurrentBeatType() === "thread"
        ? "\n- The options must answer the question posed in the step in the beat progression that must be implemented with this beat." +
          "\n- Choose the right option type: Exploration threads require Exploration options, Challenge threads require Challenge options, and Contest threads also require Challenge options." +
          "\n- Don't use options that are similar to options that the player had in previous beats in this thread." +
          "\n--- Example: If the player had the option " +
          "\n- Any stats that can be gained as a reward for choosing an option with lower chance of success that seem relevant for this beat? These options will apply a large malus to success chances." +
          "\n--- Only offer reward options for stats that allow for rewards in their stat definitions." +
          "\n--- Example: An energy stat might specify that it can be used as a reward when the player chooses to rest instead of focusing on the thread's goal." +
          "\n- Are there any stats that can be sacrificed (spent) in exchange for a higher chance of success that seem relevant for this beat? These options will grant a large bonus to success chances." +
          "\n--- Only offer sacrifice options for stats that allow for sacrifices in their stat definitions." +
          "\n--- Example: The player's mana stat might specify that the player can use special abilities for 10 mana each." +
          "\n- Which stats and their current values (both individual and shared) affect which options are available to the player narratively (not mechanically in terms of success chances)? Consider especially the narrative function of stats." +
          "\n--- Example: If force|agility stat leans toward force, the options should be forceful rather than sneaky."
        : "\n- How can we reinforce the story's key conflicts and focused types of decisions?" +
          "\n- Remember that topic switches already have their options defined in the switch configuration.")
    : ""
}

BEAT ATTRIBUTES

Title: ${
      story.getCurrentBeatType() === "switch"
        ? "[title of the switch that this beat implements]\n" +
          "Just the title and nothing else. (No id, no number, no nothing.)"
        : story.getCurrentBeatType() === "ending"
        ? "The End"
        : "[title for the thread that this beat is part of]\nAdd '(" +
          (story.getCurrentThreadBeatsCompleted() + 1) +
          "/" +
          story.getCurrentThreadDuration() +
          ")' after the title to indicate the beat number of the current thread."
    }

Text
- The first paragraph must
--- continue exactly where the previous beat for this player ended
--- describe how the player performs the action that was chosen in the previous beat
--- describe the consequences of that action
Example: If the player decided to organize a vote, describe what they do, how the vote plays out, and what the outcome is. Don't immediately jump to after the vote!${
      story.getCurrentBeatType() === "thread" &&
      story.getCurrentThreadBeatsCompleted() > 0
        ? "\n- If the previous beat for this player was favorable / mixed / unfavorable, adjust the tone of this beat accordingly. Beats following a favorable beat should feel like there is positive momentum. Beats following an unfavorable beat should feel difficult.\n"
        : ""
    }${
      story.isMultiplayer() && story.isFirstBeat()
        ? "\n- This is the first beat of a multiplayer story. Introduce the other player characters, including this player character's relationship to them"
        : ""
    }${
      !story.isFirstBeat() && story.getCurrentBeatType() === "switch"
        ? "\n- For the beat text, focus on the resolution of the previous thread that the player was involved in.\n" +
          "--- Process the milestones that were added to outcomes. Make it feel relevant to the player.\n" +
          (story.isMultiplayer()
            ? "--- If several players were in the same thread, process also how the thread's resolution affects the other players.\n" +
              "--- If there were other threads than the one with the player, describe the resolution of the other threads. (Unless it would be implausible for the player to know about it.)"
            : "")
        : ""
    }${
      story.getCurrentBeatType() === "ending"
        ? "- Most of the beat text should be about the ending of the story for the player at hand.\n" +
          "--- Process the outcome of the previous thread that the player was involved in, then transition to the overall ending of the story.\n"
        : ""
    }${
      story.getCurrentBeatType() !== "ending" && story.isMultiplayer()
        ? "- If several players are in the same " +
          story.getCurrentBeatType() +
          ", focus on the interplay between the players and their decisions.\n" +
          (story.getGameMode() === "cooperative" ||
          story.getGameMode() === "cooperative-competitive"
            ? "--- If the outcome of the thread is a shared goal or interest, the beat should be about how the players are collaborating.\n"
            : "") +
          (story.getGameMode() === "competitive" ||
          story.getGameMode() === "cooperative-competitive"
            ? "--- If the outcome of the thread is a conflict or a contested goal, the beat should be about how the players are competing.\n"
            : "") +
          "--- The goal of multiplayer games is to have an interesting interactions between players. The beat text should reflect that.\n"
        : ""
    } 
- Show, don't tell.
--- Use the list of 'show don't tell' instructions that you generated in the plan for the beat.
--- Right now, the most common failure mode for bad responses is that they don't follow the principle of 'show don't tell'. It's important that you don't make this mistake.
- Use direct speech
--- Both for the player characters and the NPCs.
--- Give characters a voice. Don't just say 'you absorb the cryptic wisdom imparted by X'. Spell out the actual words that the character says.
- Address the player directly (with 'You' in the second person)${
      story.isMultiplayer()
        ? "\n--- Only address the player that will see this beat directly. Other players in the same thread should be referenced by name or with third person pronouns.\n"
        : ""
    }
- Don't break the fourth wall
--- Don't use terms like 'NPC', 'player character', 'stat', 'story beat', etc. in the beat text.
- Story elements
--- If a player encounters a story element for the first time, introduce it properly.
--- If a player encounters a story element when they already encountered it before, don't introduce it again. Just refer to it assuming that the player knows what it is.
- The last paragraph
--- Never mention or even refer to the player's options and choices.
--- Players will see the options below the beat text. Talking about them in the beat text is redundant.
--- Avoid these kinds of formulations: 'The path before you ...', 'Will you do X, or will you do Y?', 'You must decide: ...', 'You weigh your options carefully', 'the complexity of your decision ...'

Images
${
  story.hasImages()
    ? "You can include image tags in the beat text to show images from the story's image library:\n" +
      "- Add an '[image]' tag at the beginning of the paragraph that you want to show the image in. No image tags at the end of the beat text.\n" +
      "- Parameters:\n" +
      "--- id: the id of the image from the story's image library. Image ids correspond to story elements.\n" +
      "--- source: 'template' or 'story' (as per image library)\n" +
      "--- desc: a caption that will be displayed below the image. Provide at least the name of the element that the image depicts.\n" +
      "--- float (optional): 'left', 'right' (default is 'left')\n" +
      "- Example: '[image id=mrs_sukuhashi source=template desc=\"Mrs. Sukuhashi\" float=right]'\n" +
      "- For player characters, use ids player1, player2, etc. and source " +
      (story.isBasedOnTemplate() ? "template" : "story") +
      ".\n" +
      "- Try to add 1-2 images per beat. 3 are already too many.\n" +
      (story.isFirstBeat()
        ? "- In this first beat of the story, include an image of the player character that this beat is for, plus an image of some other story element.\n"
        : "")
    : "This story does not support images. Do not use them in the beat text."
}
${
  story.getCurrentBeatType() !== "ending"
    ? this.createOptionInstructions(story)
    : ""
}

Interludes
are little snippets of image and text that the player sees while the next beat is being generated.
Create a total of exactly 3 interludes.
- Create 1 interlude with a stream of consciousness of the character for whom this beat is written. As always: show don't tell. First person, specific associations, emotions, and unfinished thoughts -- not a polished monologue or a third person summary. (imageId = player slot)
- Create 1-2 interludes based on story elements (location, NPC, item, etc.) that is relevant to the beat (imageId = story element id).
- Create 0-1 interlude that gives a general detail about the world (imageId = "cover").
`;
  }

  private static createOptionInstructions(story: Story): string {
    return `
Options
- Offer exactly 3 options.
- Make sure that the beat implements the current ${story.getCurrentBeatType()} configuration.${
      story.getCurrentBeatType() === "thread"
        ? "--- Only offer options that answer the question that is posed in this step of the thread progression.\n" +
          "--- Avoid offering options that are similar to options that were already offered to the player in previous beats in this thread.\n"
        : story.getCurrentBeatType() === "switch"
        ? "--- Don't offer options for the upcoming thread that are similar to the previous threads."
        : ""
    }
--- Don't give the player an opportunity to leave the scene, suddenly do something else, or derail the core theme of the ${story.getCurrentBeatType()} in any other way.${
      story.isMultiplayer()
        ? "- Take the multiplayer coordination for this set of beats into account. If several players are on the same side in a thread, this will ensure that their options are meaningfully different and both consistent and coordinated with each other.\n" +
          "- Never offer options like 'Collaborate with [insert player name].' If the other player doesn't choose a similar option, this can lead to inconsistencies in the story. Instead, offer concrete actions and decisions that can be made independently of the other player's choice but that in a collaborative Challenge thread still constitute a meaningful collaboration. The multiplayer coordination analysis for this set of beats has notes on how to avoid this.\n"
        : ""
    }
- Be specific.
--- Bad: 'Propose a compromise'. Good: Specify what the compromise is.
--- Bad: 'Create a diversion'. Good: 'Divert the guards by throwing some gold coins around.'
- Do NOT include the actual or likely consequences of a decision. (Except for mentioning the stat that is sacrificed or gained as a reward in sacrifice and reward options.)
- Options determine how the story will continue after this beat. Whatever happened in the beat text is already established.
- For each option, set the optionType field:
${
  story.getCurrentBeatType() === "switch"
    ? "--- Use 'exploration' for all options in switches.\n"
    : "--- Use 'exploration' for options in Exploration threads (that don't follow a success/failure or win/lose pattern).\n" +
      "--- Use 'challenge' for options in Challenge threads and Contest threads.\n"
}
- Define if the option is a sacrifice (losing a stat in exchange for a higher chance of success) or a reward (gaining a stat as a reward for choosing a lower chance of success) or normal (neither of the above).
--- You can only define sacrifice and reward options for stats that allow to be sacrificed or gained as a reward in their stat definitions.
--- You can only generate no or exactly 1 sacrifice/reward option per beat. The rest of the options must be normal.
--- Formulate the option with flavor in mind. Bad: 'Take a bold risk, sacrificing 10% emotional stability for a higher chance of catching his attention (-10% emotional stability).'. Good: 'Bite your lips (-10% stability) and intercept Adrian directly.'
${
  story.getCurrentBeatType() === "thread"
    ? "- For challenge options, define how the option affects the likelihood of different resolutions\n" +
      "--- basePoints: for normal resource types: assign a value between +15 to -15 depending on how much sense this option makes for achieving a favorable result / winning the contest (in general, ignoring the specific stats in the current story state). +" +
      POINTS_FOR_SACRIFICE +
      " for sacrifice options. " +
      POINTS_FOR_REWARD +
      " for reward options.\n" +
      "--- modifiers: identify stats (individual and shared) that given their current value have an effect on the likelihood of success. This must be consistent with the stat's 'effects on challenge success' in the story state. Example: if the option is to woo an npc, player1_charisma is 70/100, and the stat defines that 70%+ gives +15 to social interactions, you can award +15. If the stat is at 60%, and the stat defines no bonuses at that level, don't award any modifier for charisma. That said: if it makes sense for a stat to have an influence when the specific situation is not covered in the stat's definition, you can award a modifier. Only assign a modifier if the actual, current value of the stat warrents it, not if the stat in general seems relevant. Don't include bonuses/maluses for sacrificing/gaining stats. These bonuses/maluses are already covered elsewhere.\n" +
      "--- riskType: decide if this option is risky (extreme outcomes are more likely), safe (extreme outcomes become less likely), or normal.\n"
    : ""
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
--- Aim for adding 3 or more new facts per switch and per step in a thread. These are the details that make the world come to life. By recording them, we ensure consistency in future beats.
--- Example categories for new facts: appearance (NPCs, items), history (NPCs, locations), quirks (NPCs), functionality (items), interactions (NPCs, locations), mood (locations), etc.
${
  story.isMultiplayer()
    ? "--- If several players are in the same switch or thread, you only need to add new facts to the story state once. (You can add new facts to the story state once per switch or thread.)\n"
    : ""
}--- Don't add facts for new story elements that you just created.
- The players' decisions are tracked separately and don't have to be tracked.`;
  }
}
