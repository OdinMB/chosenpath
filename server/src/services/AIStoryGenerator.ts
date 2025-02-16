import { ChatOpenAI } from "@langchain/openai";
import type {
  StoryState,
  StorySetup,
  PlayerStateGeneration,
} from "../../../shared/types/story.js";
import type { Change } from "../../../shared/types/change.js";
import type {
  Beat,
  BeatGeneration,
  SetOfBeatGenerationSchema,
} from "../../../shared/types/beat.js";
import dotenv from "dotenv";
import { createStorySetupSchema } from "../../../shared/types/story.js";
import type { PlayerCount } from "../../../shared/types/players.js";
import { getPlayerSlots } from "../../../shared/utils/playerUtils.js";
import { createSetOfBeatGenerationSchema } from "../../../shared/types/beat.js";
import type { BeatsNeedingImages } from "../../../shared/types/image.js";
import { type GameMode, GameModes } from "../../../shared/types/story.js";
dotenv.config();

export class AIStoryGenerator {
  private model: ChatOpenAI;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }

    this.model = new ChatOpenAI({
      // modelName: "o3-mini",
      // reasoningEffort: "high", // low, medium, high
      modelName: "gpt-4o",
      temperature: 0.4,
    });
  }

  public async createInitialState(
    prompt: string,
    generateImages: boolean,
    playerCount: PlayerCount,
    maxTurns: number,
    gameMode: GameMode
  ): Promise<StoryState> {
    const setup = await this.generateStorySetup(
      prompt,
      playerCount,
      gameMode,
      maxTurns
    );

    // Create a record of all players from the setup.
    const players = Object.fromEntries(
      getPlayerSlots(playerCount).map((slot) => {
        const playerKey = slot as keyof StorySetup<typeof playerCount>;
        const playerData = setup[playerKey] as PlayerStateGeneration;
        return [
          slot,
          {
            character: playerData.character,
            outcomes: playerData.outcomes,
            characterStats: playerData.characterStats,
            beatHistory: [],
          },
        ];
      })
    );

    return {
      guidelines: setup.guidelines,
      sharedStats: setup.sharedStats,
      npcs: setup.npcs,
      players,
      maxTurns,
      establishedFacts: [],
      generateImages,
      images: [],
      playerCodes: {},
      gameMode,
    };
  }

  async generateStorySetup(
    prompt: string,
    playerCount: PlayerCount,
    gameMode: GameMode,
    maxTurns: number
  ): Promise<StorySetup<typeof playerCount>> {
    const schema = createStorySetupSchema(playerCount);
    const structuredModel = this.model.withStructuredOutput(schema);

    try {
      console.log("Generating story setup with playerCount:", playerCount);

      const gameModeInstructions = {
        [GameModes.Competitive]: `\n\nThe players in this game are competing against each other. The players' outcomes should represent at least one competing goal or interest and no shared goals.\n\n`,
        [GameModes.Cooperative]: `\n\nThe players in this game are cooperating with each other. The players' outcomes should include at least one shared goal or interest that requires collaboration to achieve. Individual players may still have personal goals, but these should not conflict with the shared objective.\n\n`,
        [GameModes.CooperativeCompetitive]: `\n\nThe players in this game have a mix of cooperative and competitive elements. Include both shared goals/assets/interests that require collaboration AND individual goals that may put players in competition. Players should need to carefully balance helping others versus pursuing their own interests.\n\n`,
      };

      const response = await structuredModel.invoke(
        `Create a setup for a multiplayer, interactive fiction game for ${playerCount} player${
          playerCount > 1 ? "s" : ""
        } based on this prompt:
        
"${prompt}".${gameModeInstructions[gameMode]}
        
The entire story is supposed to play out over a course of ${maxTurns} beats, with each beat consisting of about three paragraphs of text for each player and a decision by the player.
Generate enough conflicts, types of decisions, outcomes, NPCs, and stats to make the story interesting, but not so many that they cannot be fully developed within the ${maxTurns} beats.

This is how a story with 20 beats could look like:
- 3 overarching conflicts
- 3 types of decisions that the players will be able to make
- 3-4 NPCs (including factions and organizations)
- 3-4 shared stats for things that are not directly linked to one player
--- Things that are shared between players (e.g. group/organization, a spaceship, a flat, a list of collected clues, etc.)
--- Stats about the world (e.g. tension between factions, industry trends, etc.)
- Stats for scoring, pacing, and story flags if you think they are needed (some stories don't need them)
For each player
- 3 outcomes with 4 milestones each towards the outcome's resolution
- 3-4 stats that are linked directly to that player (traits, skills, dispositions, health, personal relationships, personal resources, etc.)

Stat groups
are used to group stats in the UI. Both character and shared stats can be grouped and will be displayed in the UI together.
- Group stats in a way that is flavorful and makes sense for the story.
- Use a maximum of 4 different stat groups. Otherwise, the UI will become too crowded and confusing.
- Keep the group names short.
- Bad: Traits/Skills/Resources/Relationship (too many groups, too generic, focuses on functional aspects of the stats instead of story aspects)
- Good: Character/Empire/Politics (for building a mafia empire), Detective/Investigation/Contacts (for a mystery story), Character/Ship/Crew/Resources (for a space opera)

Stat guidelines
- In general, favor string and string[] over numbers
--- Exception: countable things whose management is central to the story (gold)
--- Exception: percentages/opposites for aspects that must be managed often and granularly (health, fuel)
- Put at least two stats in each stat group.
--- Stat groups represent key areas of the story. By assigning at least two stats to each group, we are making sure that each area gets enough weight.
- Use a variety of stat types.
--- For example, a few percentage/opposites for stats that have to be managed often and granularly, a string[] for a list of items or a list of unmutable skills, and a few string for qualitative aspects that are not supposed to change often and don't have to be managed granularly.
- If players are of the same type (e.g. all are time-traveling spies), use the same character stats for all players.
--- Exception: Stats for relationships or individual side quests can be different for each player.
--- Values for stats should of course be different for each player. This can include lists of items or skills.
- If a stat should be the same for all players, use a shared stat.
--- Example: If the players are all on the same ship, the ship's fuel level is the same for all players.
--- Example: If players maintain a relationship to an NPC as a group, use a shared stat for that relationship. If only one specific player has a relationship with that NPC, use a character stat.
- Use the isVisible attribute to hide stats that the player shouldn't see.
- Don't use stats for things that are covered by other mechanics.
--- Don't track the number of remaining turns or story beats (tracked separately)
--- Don't track qualitative progress towards an outcome (this will instead be tracked via milestones towards outcomes)
--- Don't track ordinary player decisions (tracked separately))
- In multiplayer games, aim for a fair initial distribution of stat values. (Above-average values in one stat should be offset by below-average values in another stat.)
- You can use the stat's grouping to shorten the stat name. For example, if a stat belongs to the group 'Relationships', 'Relationship with Mr. Kline' is unnecessarily long. 'Mr. Kline' is enough.

Type of stats and what they are good for:
- string: Qualitative aspects that don't change often, or that don't have to be tracked granularly.
--- Role that can be filled with the name of an NPC (e.g. Assistant, Mentor)
--- Character conditions (e.g., healthy/injured/critical)
--- Relationship states for specific NPCs(e.g., stranger/acquaintance/friend/confidant)
--- Rank (e.g. Private/Corporal/Captain/General)
--- Equipment status (e.g., pristine/worn/damaged/broken)
--- Faction standings (e.g., hostile/neutral/friendly/allied)
--- Emotional states (e.g., calm/agitated/enraged)
--- Level of influence (e.g. Can ask for favors/Can make decisions/Full control)

- string[]: Lists of traits or collectibles
--- Character traits and abilities that are not supposed to change over the course of the story (e.g., ["Ambitious", "Empathic", "Spontaneous"] in a romance story, ["Telepathy", "Invisibility"] in a superhero story.)
--- Equipment/inventory (e.g., ["Laser sword", "Med kit"])
--- Role that can be filled with the names of several NPCs (e.g. Friends, Love Interests)
--- Collection goals and known information ONLY IF the specifics of what is collected or known are important (e.g., artifacts found, evidence pieces); otherwise, don't use a stat but track progress via milestones towards outcomes
--- Issues (e.g. ["Poisoned", "Bleeding"] if avoiding and dealing with specific ailments is central to the story; otherwise, use a percentage for health)
--- Contacts (e.g., ["Dealers", "Local Newspaper"] if using and building these contacts is central to the story; otherwise, use a string to represent the bredth of contacts)

- percentage: 0-100. Qualitative aspects that will be changed often and granularly over the course of the story.
--- Resources with a capacity limit (e.g. mana, chi, stamina, fuel, energy, oxygen supply)
--- Integrity statuses (e.g. health, spaceship integrity, mental stability)
--- Skills ONLY IF it's a clearly defined skill and developing the skill is central to the story. ("Magic", "Mystic power", etc. are not clearly defined skills and are often better represented as a string[] of abilities.)
--- Relationship strength with NPCs ONLY IF managing that relationship is central; otherwise, use a string.
--- Environmental conditions ONLY IF the condition must be managed often and granularly (e.g., radiation levels); otherwise, use a string.

- opposites: Two percentage stats in one. The second stat is always (100 - first stat). As percentages, only use this for qualitative aspects that will be changed often and granularly over the course of the story.
--- Moral alignments (e.g., good|evil, order|chaos, tradition|progress)
--- Competing influences (e.g., science|magic, empire|rebellion)
--- Character dispositions (e.g., cynicism|idealism, logic|emotion)
--- Devices to keep score for competitive, tug-of-war-like outcomes in multiplayer games(e.g., playerA|playerB territory control)

- number: Only for countable quantities
If it cannot be counted, choose another type of stat.
--- Resources without a maximum capacity (e.g., money, ammunition, army size, cult followers)
--- Counters (e.g., wins in a tournament, number of people saved)
--- Countdowns for pacing the story (e.g. days until deadline, remaining seals that protect a powerful artifact)
--- NOT good for skills. Skills aren't countable. Use percentage if the stat is supposed to be developed granularly and changed often, otherwise use a string, or add the skill as an item in a string[].
--- NOT good for power levels (like mystic power). Use string to describe the power level qualitatively or string[] to list specific abilities.
--- NOT good for things that cannot counted, like influence, experience, level of interest, etc.

Options for using the hint attribute for stats effectively:
- For string stats:
--- List all possible values: "Values: Novice/Apprentice/Master/Grandmaster"
--- Explain transitions: "Can only change one step at a time"
--- Define requirements: "Master requires 3 successful rituals"
- For string[] stats:
--- List all possible values: "Values: Lead Singer/Guitarist/Bassist/Drummer/Keyboardist/Vocalist"
--- Alternatively, describe the category: "Only minor spells"
--- Set limitations: "Maximum 5 items can be carried"
- For percentage stats:
--- Specify thresholds: "Below 30% triggers crisis events"
--- Define value meanings: "75%+ considered mastery level"
--- Indicate change rates: "Changes slowly, -5% to +5% per decision"
- For opposites stats:
--- Explain balance implications: "Values below 25% or above 75% unlock extreme options"
--- Define neutral zones: "40-60% represents balanced approach"
- For number stats:
--- Define critical values: "Minimum 5 required for survival"
--- Explain acquisition: "Typically gained 1-3 per successful mission"

Stat examples for games with 20 beats
Premise: alchemists racing to brew a love potion (competitive)
- groups: Alchemist/Potion/City
- character stats:
--- (Alchemist) Traits (string[]). Value: 2-3 of the options. Hint: Unlock options and make certain actions more likely to succeed. Options: Cautious, Charming, Empathetic, Ruthless, Good reputation.
--- (Alchemist) Gold (number). Value: 100-500. Hint: Can be used to buy ingredients, to hire assistants, or to disturb other alchemists.
--- (Potion) Ingredients (string[]). Value: up to one of the ingredients. Hint: collected ingredients. Requires these three to start brewing: "Frog legs/Dragon scales/Unicorn horn"
--- (Potion) Brewing (percentage). Value: 0. Hint: brewing progress. First player at 100% wins. Brewing undisturbed increases progress by 20%.
--- (City) Contacts (string[]). Value: 2-3 of the 5 options. Hint: Contacts correspond to the NPCs in the city. Options: Assistant, Supplier, Guard, Thief, Thug. Available contacts can be paid to increase brewing progress (Assistant), buy an ingredient (Supplier), steal an ingredient from another player (Thief), disturb an alchemist's shop (Thugs), or guard a player's shop (Guard).
- shared stats:
--- (City) Market (string). Value: "Healer in town". Hint: defines if ingredients can be bought. "No market/Healer in town/Traders coming through"
--- (City) Season (string). Value: "Spring". Hint: defines if ingredients grow in the wild. "Spring/Summer/Autumn/Winter"
--- (City) Rumor (string). Value: "No rumors". Hint: Mention here if an alchemist collected all ingredients or starts brewing.

Premise: nature spirits guard the forest and compete for followers (cooperative-competitive)
- groups: Spirit/Forest/Following
- character stats:
--- (Spirit) Seasonal powers (string[]). Value: 2 special powers (things like "Protecting crops" or "Healing the sick").
--- (Spirit) Energy (percentage). Value: 100. Hint: Energy is used for manifesting in the world. Regeneration rate: 10% per beat.
--- (Following) Followers (number). Value: 20. Hint: amount of energy a spirit gets when it rests. Determines which spirit has the greatest following at the end of the game.
--- (Following) Special followers (string[]). Value: 2 special followers. Hint: special followers can take action on behalf of the spirit without the spirit having to spend energy to manifest in the world.
- shared stats:
--- (Forest) Threats (string[]). Value: 2 threats. Hint: things like tree-eating bugs, drought, etc.
--- (Forest) Health (percentage). Value: 100. Hint: goes down by 5% per beat per threat that hasn't been removed. Cannot be revived if it ever falls to 0.
--- (Forest) Animal cooperation (percentage). Value: 50. Hint: describes how eager animals are to help the spirits. <40 means that animals become less likely to help the spirits. >60 means that they become more likely.
--- (Forest) Human cooperation (percentage). Value: 50. Hint: describes how eager humans are to help the spirits. <40 means that inhabitants become less likely to help the spirits. >60 means that they become more likely.

Premise: The last rock band on Mars tries to make it while following individual dreams (cooperative-competitive)
- groups: Musician/Ambition/Band
- character stats:
--- (Musician) Stage Presence (percentage). Value: 20-40. Hint: Describes how well the musician is able to perform in front of an audience. Can be developed over time.
--- (Musician) Instrument proficiency (percentage). Value: 20-40. Hint: Describes how well the musician is able to play their instrument. Can be developed over time.
--- (Ambition) Band Loyalty|Solo Ambition (opposites). Value: 30-70. Hint: Describes how much the musician is dedicated to the band or to their solo career. <30 means that the musician gets options for activiely promoting their solo career. >60 means that the musician does not actively explore a solo career for now.
--- (Ambition) [Some personal goal, e.g. "Creating a family", different for each player] (percentage). Value: 0-100. Hint: Describes a personal goal of the musician that makes it hard to focus on the band.
- shared stats:
--- (Band) Gear quality (string). Value: "Worn". Hint: Options: Pristine / Worn / Broken. Gear quality influences the success of gigs.
--- (Band) Fans (number). Value: 150. Hint: Increases by ~10%-20% per gig (depending on the quality). Increases by ~25-100% per album (depending on the quality and if the album hits the taste of Mars).
--- (Band) Sound (string[]). Value: 2 aspects. Hint: can hold max 2 aspects. Describes the sound of the band (e.g. upbeat, sad, nostalgic, etc.). Can be changed to match the taste of Mars.
--- (Band) Trends on Mars (string[]). Value: 2 aspects. Hint: Any aspect of music that is currently popular on Mars (e.g. upbeat, sad, nostalgic, etc.).
`
      );

      console.log("Raw response:", response);

      return response as StorySetup<typeof playerCount>;
    } catch (error) {
      console.error("Failed to initialize story:", error);
      throw new Error("Failed to initialize story. Please try again.");
    }
  }

  async addNextSetOfBeats(
    state: StoryState
  ): Promise<[StoryState, Change[], BeatsNeedingImages]> {
    const schema = createSetOfBeatGenerationSchema(
      Object.keys(state.players).length as PlayerCount
    );
    const structuredModel = this.model.withStructuredOutput(schema);

    try {
      console.log(
        "Generating beats for turn:",
        Object.values(state.players)[0].beatHistory.length + 1
      );

      const response = (await structuredModel.invoke(
        this.createBeatPrompt(state)
      )) as SetOfBeatGenerationSchema;

      console.log("Response:\n", response);

      // Create a copy of the state to add new beats
      let updatedState = { ...state };

      // Track beats needing images instead of generating requests
      const beatsNeedingImages: BeatsNeedingImages = {};

      // Add the new beats to each player's history
      Object.entries(response).forEach(([key, value]) => {
        if (key.startsWith("player") && !["changes"].includes(key)) {
          const playerSlot = key.toLowerCase();
          const beatData = value as BeatGeneration;

          if (updatedState.players[playerSlot]) {
            // If no existing imageId is specified, mark for image generation
            if (!beatData.imageId || beatData.imageId === "") {
              beatsNeedingImages[playerSlot] = {
                ...beatData,
                choice: -1,
              };
            }

            const beat: Beat = {
              ...beatData,
              choice: -1,
            };
            updatedState.players[playerSlot].beatHistory.push(beat);
          }
        }
      });

      return [updatedState, response.changes, beatsNeedingImages];
    } catch (error) {
      console.error("Failed to generate next beats:", error);
      throw new Error("Failed to generate next beats. Please try again.");
    }
  }

  private createBeatPrompt(state: StoryState): string {
    const playersSection = Object.entries(state.players)
      .map(([slot, playerState]) => {
        const beatHistorySection = playerState.beatHistory
          .map((beat, index) => {
            const isLastBeat = index === playerState.beatHistory.length - 1;
            const chosenOption =
              beat.choice >= 0 ? beat.options[beat.choice] : null;

            return `Beat ${index + 1}:
Summary: ${beat.summary}${
              isLastBeat
                ? `\n\nFull text (only for the last beat to help with continuity):\n${beat.text}`
                : ""
            }${chosenOption ? `\nPlayer choice: ${chosenOption}` : ""}`;
          })
          .join("\n\n");

        return `#####################################\n######## PLAYER ID: ${slot} ########\n#####################################\n
${playerState.character.name} (${playerState.character.pronouns})
${playerState.character.fluff}

CHARACTER STATS:
${playerState.characterStats
  .map((stat) => {
    const formattedValue = (() => {
      switch (stat.type) {
        case "percentage":
          return `${stat.value}%`;
        case "string[]":
          return Array.isArray(stat.value) ? stat.value.join(", ") : stat.value;
        // case "boolean":
        //   return stat.value.toString();
        default:
          return stat.value;
      }
    })();

    return `- ${stat.name} (id: ${stat.id}, type: ${
      stat.type
    }): ${formattedValue}${
      stat.isVisible === false ? " (not visible to the player)" : ""
    }${stat.hint ? `\nHint: ${stat.hint}` : ""}`;
  })
  .join("\n")}

OUTCOMES that will define this character's story ending:
${playerState.outcomes
  .map(
    (outcome) =>
      `id: ${outcome.id}
${outcome.question}
Possible outcomes: ${outcome.possibleOutcomes.join(" | ")}
Milestones (${outcome.milestones.length} / ${
        outcome.intendedNumberOfMilestones
      } to resolution):
${outcome.milestones.map((milestone) => `- ${milestone}`).join("\n")}`
  )
  .join("\n\n")}

BEAT HISTORY:
${beatHistorySection}
`;
      })
      .join("\n\n" + "=".repeat(80) + "\n\n");

    const prompt = `======= CURRENT GAME STATE =======

${
  Object.keys(state.players).length > 1
    ? `MULTIPLAYER GAME MODE: ${state.gameMode}
${
  state.gameMode === GameModes.Competitive
    ? "Players are competing against each other with conflicting goals and interests."
    : state.gameMode === GameModes.Cooperative
    ? "Players are cooperating with shared goals that require collaboration."
    : "Players have both shared goals requiring collaboration AND individual competitive goals."
}

`
    : ""
}STORY GUIDELINES
- Setting elements: ${state.guidelines.settingElements.join(", ")}
- Rules: ${state.guidelines.rules.join(", ")}
- Tone: ${state.guidelines.tone.join(", ")}
- Core conflicts: ${state.guidelines.conflicts.join(", ")}
- Decision types: ${state.guidelines.decisions.join(", ")}

NPCs:
${state.npcs
  .map(
    (npc) =>
      `- ${npc.name} (${npc.pronouns}, ${npc.role}): ${npc.traits.join(", ")}
${npc.fluff}`
  )
  .join("\n")}

STORY PROGRESS: Turn: ${
      Object.values(state.players)[0].beatHistory.length + 1
    }/${state.maxTurns}

SHARED STATS:
${state.sharedStats
  .map((stat) => {
    const formattedValue = (() => {
      switch (stat.type) {
        case "percentage":
          return `${stat.value}%`;
        case "string[]":
          return Array.isArray(stat.value) ? stat.value.join(", ") : stat.value;
        // case "boolean":
        //   return stat.value.toString();
        default:
          return stat.value;
      }
    })();

    return `- ${stat.name} (id: ${stat.id}, type: ${
      stat.type
    }): ${formattedValue}${
      stat.isVisible === false ? " (not visible to the player)" : ""
    }${stat.hint ? `\nHint: ${stat.hint}` : ""}`;
  })
  .join("\n")}

${
  state.generateImages
    ? `IMAGE LIBRARY:
${
  state.images.length === 0
    ? "No images yet."
    : state.images
        .map((image) => `- ${image.id}: ${image.description}`)
        .join("\n")
}

`
    : ""
}${playersSection}

======= YOUR JOB: IDENTIFY CHANGES TO THE STORY STATE AND GENERATE THE NEXT SET OF STORY BEATS =======

1. Changes to the story state

- Include changes to both the shared stats and the character stats of each player.
- Consider the current value of stats to decide outcomes. For example, if a player character tries to be stealthy, but the character traits indicate more of a brute force approach, the character should fail.
- If an outcome has 0 milestones and was introduced to the player, create a milestone to mark its introduction.
- Use newFact only as a backup. Try to track changes via statChange and newMilestone first.
- The players' decisions are tracked separately and don't have to be tracked via newFact.
- If this is the first set of beats, there should be no changes. Just return an empty list.

2.Story beats

You can use markdown in the text of the beats.

How beats work:
- Players have separate beat histories. No player can see the beats of other players.
- Each beat must flow naturally from the previous beat OF THAT PLAYER.
- If several players encounter something new, you must introduce the new information to all players separately.
- No player can see the decisions of other players. If a player made a decision in the previous beat that affects other players, you must introduce the information to the other players separately.
- Beats for one turn are presented to players at the same time.
- Make sure that the options you give a player in one beat does not contradict any of the options that you gave to other players in the same turn.

For each beat, consider the following points:

a) How should we narrate the changes to the story state and the decisions of other players to this player?
Exclude changes and decisions that this player shouldn't know about.
This step is irrelevant if this is the first beat of the story.

b) Which information from other beats in this turn do we need to consider for this beat?
- Create a bullet list of things that happened other beats in this turn that we should consider for this beat (or even repeat if the player is in the same scene).
--- If the player is in the same scene as other player(s) whose beat you created before, copy those beats here in their entirety (to make sure that the details are consistent).
- Create a bullet list of options that you included in the other beats of this turn so far that we mustn't contradict with the options for this beat?

c) Should we continue the scene or thread of the previous beat or start a new one?
- In your plan, mark down the number of beats that the player has spent in the current scene.
- In most cases, it should take 2-3 beats to establish a milestone toward an outcome's resolution.
- In most cases, players should not spend more than 3 beats in a scene (4 if it's a showdown of some kind).
- If you added the final milestone to an outcome (number of milestones equals intended number of milestones), the outcome is resolved. Use this beat to describe the outcome, its aftermath, and give the resolution some gravity.

d) How should we make progress towards unresolved story outcomes?
- For outcomes without milestones: Consider introducing the outcome through NPCs, events, or initial discoveries.
- For outcomes with milestones: What are options for the next milestone to move the outcome closer to resolution?
Consider how many beats are still to play and how many milestones are still left to bring the outcome from its current status to a resolution.
In the first beat, introduce the core premise, what the player represents in the story, and what this whole story is all about.

e) How should we develop the world, its characters, and the relationships that the player character has with them?

f) How can we reinforce the story's key conflicts and focused types of decisions?
${
  Object.keys(state.players).length > 1
    ? `
- Honor the '${state.gameMode.toLowerCase()}' multiplayer game mode`
    : ""
}

3. Options

- Offer 3 options.
--- 2 can be fine occassionally if you want to force a clear or quick 'left vs. right' kind of choice.
- Be specific and action-oriented.
--- Bad: 'Investigate the artifact'. Good: 'Search the library for clues about the artifact'
--- Bad: 'Confront X physically'. Good: 'Punsh X in the face'.
- Make sure that options allow the story to flow naturally.
--- If the beat ends in the middle of a scene, the player shouldn't be able to just vanish from that scene.
- Stay true to the story's key conflicts and types of decisions that we want players to make
`;

    // console.log(
    //   "\n\n########\nBeat generation prompt\n########\n",
    //   prompt,
    //   "\n\n"
    // );
    return prompt;
  }
}
