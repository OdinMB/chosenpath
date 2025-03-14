import { Story } from "../Story.js";
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
    stats: true,
    detailedStats: false,
    outcomes: true,
    players: true,
    // storyProgress: true,
  } as const;

  private static readonly SECTIONS_SWITCH: SectionConfig = {
    switchWithDecisionsConfiguration: true,
  } as const;

  static createThreadPrompt(story: Story): string {
    const prompt =
      this.createContextSection() +
      "\n\n" +
      "======= CURRENT GAME STATE =======\n" +
      StoryStatePromptService.createStoryStatePrompt(story, this.SECTIONS) +
      "\n\n" +
      this.createInstructionsSection(story) +
      "\n\n" +
      StoryStatePromptService.createStoryStatePrompt(
        story,
        this.SECTIONS_SWITCH
      );
    console.log("\x1b[36m%s\x1b[0m", prompt);
    return prompt;
  }

  private static createContextSection(): string {
    return `CONTEXT

Outcomes
pose questions that define the ending of the story. ("Will [insert player names] unravel the mystery of the dark forest?")
Outcomes can be individual or shared between players.
Each outcome has 3 possible resolutions.

Milestones
are added to outcomes at the end of threads. Milestones mark progress toward the outcome's resolution and make some resolutions more likely.

Beats
are a narrative structure of 5-6 paragraphs of text followed by a decision that the player must make.
Beats are the smallest narrative unit in the game.

Switches
are a narrative structure of exactly 1 beat. Their purpose is to give the player agency over the direction of the story. How players should be allocated to threads depends on the switches that precede them.

Threads
are a narrative structure of 2-4 beats that push one or more story outcomes closer to their resolution.
They do this by adding a milestone to an outcome. Which milestone is added depends on how the thread unfolds.

Story structure
A story follows the following structure: Switch, Thread, Switch, Thread, ..., Ending.
It is time to create the next thread to this sequence for all players.`;
  }

  private static createInstructionsSection(story: Story): string {
    let instructions = `======= YOUR JOB: GENERATE THE NEXT THREAD (OR SET OF THREADS) TO MOVE THE STORY FORWARD =======

OUTPUT FORMAT

A duration for this thread (or set of threads) between 2-4 beats.
- 2 beats: interludes, breathers, and simple transactions (~30% of all threads)
--- Simple transactions (e.g. buying an artifact, meeting a friendly npc to get information)
--- Reflections (e.g. a moment of realization, a moment of doubt)
--- Resource gathering and management (e.g. gathering materials, buying supplies, finding a place to sleep, sending armies around)
--- Maintenance (e.g. healing, repairing a ship, taking care of a pet)
--- Quick decisions (e.g. deciding whether to trust someone, choosing a contract with the crew)
--- Information exchange (e.g. interviewing a witness, consulting an expert, sharing intel)
- 3 beats: drama and challenges (~50% of all threads)
--- Encounters (e.g. a fight, an escape)
--- Investigations (e.g. crime scene, tracking someone)
--- Social challenges (e.g. navigating a social event, building alliances, resolving conflicts)
--- Skill challenges (e.g. climbing a mountain, crafting a special item, performing a ritual)
--- Journeys (e.g. traveling through dangerous territory, navigating obstacles)
--- Character development (building a relationship, facing a fear)
- 4 beats: showdowns and transformations (~20% of all threads)
--- Showdowns (e.g. a epic battle, the make-or-break concert of the band, the council session to become the new king)
--- Transformative events (e.g. ascension ceremonies, magical transformations, a coronation)
- The duration is the same for all threads in this batch
- Choose a duration that works for all threads`;

    if (story.isMultiplayer()) {
      instructions += `

A summary of how you want to set up the threads based on the switch configuration and player choices.

Possible player configurations:
- Independent threads: Each player gets their own standard thread
- Shared threads: All players are in the same thread
- Mixed setup: Some players are in a joint thread while others are in independent threads.`;
    } else {
      instructions += `

For single-player games, there is always only one thread.`;
    }

    instructions += `

Types of Threads:
1. Challenge Threads
- One or several players work towards a goal
- Resolutions are favorable/mixed/unfavorable
- Example milestones (one will be added to the outcome at the end of the thread): "The group finds the artifact", "The group finds a clue about the artifact's location", "The group fails to find any trace of the artifact"
- This is the default type of thread. You must have good reasons to use a different type of thread.`;

    if (story.isMultiplayer()) {
      instructions += `
2. Contest Threads
- Players are split into Side A and Side B, competing over an outcome
- Resolutions are "Side A wins"/"Mixed result"/"Side B wins"
- Example milestones (one will be added to the outcome at the end of the thread): "Side A convinces the council", "Both sides reach a compromise", "Side B convinces the council"
- Only relevant for multiplayer games with a competitive element (game mode is "competitive" or "cooperative-competitive")`;
    }

    instructions += `
${story.isMultiplayer() ? "3" : "2"}. Exploration Threads
- Players explore their characters (preferences, morality, etc.) or choose among equally valid narrative paths
- Exploration Threads should not include any challenges or contests.
- Steps in Exploration Threads should never be about succeeding or failing at something.
- Resolutions are "Resolution 1"/"Resolution 2"/"Resolution 3" representing different choices or directions
- Example milestones (one will be added to the outcome at the end of the thread): "[insert player name] takes over the family hotel", "[insert player name] helps at the family hotel while doing occassional photography jobs", "[insert player name] is no longer engaged in the family business"
- Use for character development, or when multiple valid paths exist without clear "better" or "worse" options
- Whenever some resolutions are more desirable than others, use a Challenge or Contest thread instead.

Create a list of threads, each with:
1. Players involved (Side A and, if it's a Contest thread, Side B)
2. The outcome ID this thread will add a milestone to (to drive the outcome closer to resolution)
3. Possible milestones that might be added to that outcome
   - Remember that it takes several milestones to resolve an outcome. The milestone options should only establish one step toward the outcome's resolution.
   - Be very specific. Bad: "The familiar fails." Good: "The familiar fails to stop the dark stone's influence over Layla." (At the end of the game, when we read the milestones, we should be able to determine the outcome's overall resolution.)
4. A progression of 2-4 beats (matching the duration) that:
   - Builds dramatic tension toward the thread's climax on the last beat
   - For Challenge ${
     story.isMultiplayer() ? " and Contest" : ""
   }threads: Has each beat establish advantages/disadvantages for the next beat, without making the next beat impossible to reach or resolve. Example: Failing to be stealthy in the first beat must only give a disadvantage on the second beat, not have the players be carried away by the police.
   - For Exploration threads: Has each beat explore different paths, while still making sure that the following steps in the beat progression can be reached.
   - Each progression step is defined by a question about how the players are acting to deal with this step's challenge or decision. Bad: "What do [insert player names] find in the cellar?" Good: "How do [insert player names] search for clues in the cellar?"
   - Always gets through the entire beat progression. Specifically, no step should preempt the final resolution of the thread. (That will be decided with the player decision on the last beat.) Players should not be able to leave the thread or derail it.

EXAMPLE 1: 3-BEAT CHALLENGE THREAD
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
Question: How do [insert player names] approach the manor's security?
- Favorable: The guards are distracted, giving easy access to the manor
- Mixed: [insert player names] find a way in but the guards are on higher alert
- Unfavorable: The guards are suspicious and increase their patrols
(Note how the beat progression can continue no matter the resolution of step 1.)

2. Searching the Study
Question: How do [insert player names] search the study without leaving traces?
- Favorable: [insert player names] find promising leads and the study remains undisturbed
- Mixed: [insert player names] find some leads but leave signs of searching
- Unfavorable: The study is a mess and [insert player names] alert the household

3. Final Confrontation
Question: The noble returns early! How do [insert player names] handle the situation?
Since this is the final beat of the thread, the possible results are the list of possible milestones that can be added to the outcome.`;

    if (story.isMultiplayer()) {
      instructions += `

EXAMPLE 2: 2-BEAT CONTEST THREAD
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
Question: How do [insert player names] present their initial cases to the council?
- Side A Wins: Military urgency resonates with the council
- Mixed: The council remains divided and uncertain
- Side B Wins: Diplomatic opportunities capture the council's interest
(Leads to the climax in beat 2 witout preempting the council's final vote.)

2. Final Deliberation
Question: How do [insert player names] address the council's key concerns?
Since this is the final beat of the thread, the possible results are the list of possible milestones that can be added to the outcome.`;
    }

    instructions += `

EXAMPLE ${story.isMultiplayer() ? "3" : "2"}: 2-BEAT EXPLORATORY THREAD
Title: Personal Crossroads
Players: player1
Outcome: Will Alex choose family or ambition? (with ID player1_family_vs_ambition)
Possible Milestones:
- Resolution 1: "Alex prioritizes family obligations over the job opportunity"
- Resolution 2: "Alex finds a compromise that partially satisfies both family and career"
- Resolution 3: "Alex pursues the career opportunity despite family disapproval"

Beat Progression:
1. Weighing the Options
Question: How does Alex approach the difficult conversation with family?
- Resolution 1: Alex tries to find out what is important to his family
- Resolution 2: Alex tries to convince his family that following the job opportunity is a good idea
- Resolution 3: Alex lies about the job opportunity to make it seem more appealing
(Each resolution provides different context for the final decision without avoiding it or forcing any particular final resolution.
Each resolution says something about Alex's character and motivations.
The beat is not about succeeding or failing, but about exploring Alex's character.)

2. Making the Choice
Question: What does Alex ultimately prioritize when forced to choose?
Since this is the final beat of the thread, the possible results are the list of possible milestones that can be added to the outcome.
`;

    return instructions;
  }
}
