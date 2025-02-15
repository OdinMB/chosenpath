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
      modelName: "o3-mini",
      reasoningEffort: "medium",
      // modelName: "gpt-4o",
      // temperature: 0.4,
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
        [GameModes.CooperativeCompetitive]: `\n\nThe players in this game have a mix of cooperative and competitive elements. Include both shared goals that require collaboration AND individual goals that may put players in competition. Players should need to carefully balance helping others versus pursuing their own interests.\n\n`,
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
- 4-6 NPCs / factions / organizations
- 4-5 shared stats for things that are not directly linked to one player
--- Things that are shared between players (e.g. group/organization, a spaceship, a flat, a list of collected clues, etc.)
--- Stats about the world (e.g. tension between factions, industry trends, etc.)
- Stats for scoring, pacing, and story flags if you think they are needed (some stories don't need them)
For each player
- 3 outcomes with 4 milestones each towards the outcome's resolution
- 4-5 stats that are linked directly to that player (traits, skills, dispositions, health, companions, individual relationships, individual resources, etc.)

Stat groups
are used to group stats in the UI. Both character and shared stats can be grouped and will be displayed in the UI together.
- Group stats in a way that is flavorful and makes sense for the story.
- Use a maximum of 4 different stat groups. Otherwise, the UI will become too crowded and confusing.
- Keep the group names short.
- Bad: Traits/Skills/Resources/Relationship (too many groups, too generic, focuses on functional aspects of the stats instead of story aspects)
- Good: Character/Empire/Politics (for building a mafia empire), Detective/Investigation/Contacts (for a mystery story), Character/Ship/Crew/Resources (for a space opera)

How to define stats
- Be specific and flavorful given the context of the story.
--- Story about an adventuring mystic. Bad: Mystic power (number) set to 5. Too abstract and not flavorful. Doesn't flesh out the character. Good: Mystic abilities (string[]) set to ["Levitation", "Summoning frogs"]
--- Story about a band leader balancing a career and a personal life. Bad: Personal Life (string) set to "Content". Doesn't do justice to the core conflict. Doesn't inspire story elements. Good: Close relationships (string[]) set to ["Parents", "Pete"]
- Put at least two stats in each stat group.
--- Stat groups represent key areas of the story. By assigning at least two stats to each group, we are making sure that each area gets enough weight.
- Use a variety of stat types.
--- For example, a few percentage/opposites for stats that have to be managed often and granularly and a few string and string[] stats for qualitative aspects that are not supposed to change often and don't have to be managed granularly.
- If players are of the same type (e.g. all are time-traveling spies), use the same character stats for all players.
--- Exception: Stats for relationships or individual side quests can be different for each player.
--- Exception: If you want some asymmetry to make the setup more interesting, go for it!
--- Values for stats should of course be different for each player.
- If a stat should be the same for all players, use a shared stat.
--- Example: If the players are all on the same ship, the ship's fuel level is the same for all players.
--- Example: If players maintain a relationship to an NPC as a group, use a shared stat for that relationship. If only one specific player has a relationship with that NPC, use a character stat.
- Use the isVisible attribute to hide stats that the player shouldn't see.
--- Example: The stat serves as a pacing vehicle under the hood
--- Example: The stat is a flag to highlight a particular milestone or development for the AI when it continues the story
- Don't use stats for things that are covered by other mechanics.
--- Don't track the number of remaining turns or story beats (tracked separately)
--- Don't track qualitative progress towards an outcome (tracked via milestones)
--- Don't track ordinary player decisions (tracked separately)
- In multiplayer games with a competitive element, aim for a balanced initial distribution of stat values.
--- Better values in one stat should be offset by worse values in another stat.
- If a stat belongs to a group 'Relationships', 'Relationship with Mr. Kline' is unnecessarily long. 'Mr. Kline' is enough in that case.

Type of stats and what they are good for:
- percentage: 0-100. Qualitative aspects that will be changed often and granularly over the course of the story.
--- Resources with a capacity limit (e.g. mana, chi, stamina, fuel, energy, oxygen supply)
--- Statuses (e.g. health, spaceship integrity, mental stability)
--- Skills ONLY IF developing the skill is central to the story (e.g., illusions/summoning/potions for a student magician who must decide which skills to develop)
--- Relationship strength with NPCs or factions ONLY IF the relationship is central to the story and must be tracked granularly. Otherwise, use string.
--- Environmental conditions ONLY IF the conditions change often and granularly (e.g., radiation levels)
--- Progress trackers ONLY IF the progress is granular (e.g., corruption level, suspicion meter, faction influence)

- opposites: Two percentage stats in one. The second stat is always (100 - first stat). Only for qualitative aspects that will be changed often and granularly over the course of the story.
--- Moral alignments (e.g., good|evil, order|chaos, tradition|progress)
--- Competing influences (e.g., science|magic, empire|rebellion)
--- Character development axes (e.g., cynicism|idealism, logic|emotion)
--- Resource allocation (e.g., offense|defense, mind|body)
--- Faction control (e.g., playerA|playerB territory control)

- number: Countable quantities
If it cannot be counted, choose another type of stat. Number is NOT GOOD for things like influence, experience, level of interest, etc.
--- Resources without a maximum capacity (e.g., money, ammunition, army size, cult followers)
--- Collection goals ONLY IF the nature of the items is not important (e.g., artifacts found, evidence pieces); otherwise, use a string[].
--- Counters (e.g., wins in a tournament, number of people saved)
--- Countdowns for pacing the story (e.g. days until deadline, remaining seals that protect a powerful artifact)
--- NOT good for skills. They aren't countable. Use percentage if the stat is supposed to be changed often, otherwise use a string or an item in a string[].
--- NOT good for power levels (like mystic power). Use string to describe the power level qualitatively or string[] to list specific abilities.

- string: Status descriptions for qualitative aspects that aren't as central to the story, that don't change often, or that don't have to be tracked granularly.
--- Character conditions (e.g., healthy/injured/critical)
--- Relationship states (e.g., stranger/acquaintance/friend/confidant)
--- Rank (e.g. Private/Corporal/Captain/General)
--- Equipment status (e.g., pristine/worn/damaged/broken)
--- Faction standings (e.g., hostile/neutral/friendly/allied)
--- Emotional states (e.g., calm/agitated/enraged)
--- Level of influence (e.g. Can ask for favors/Can make decisions/Full control)

- string[]: Lists of traits or collectibles
--- Character traits and abilities that are not supposed to change over the course of the story (e.g., ["Ambitious", "Empathic", "Spontaneous"] in a romance story, ["Telepathy", "Invisibility"] in a superhero story.)
--- Equipment/inventory (e.g., ["Laser sword", "Med kit"])
--- Known information (e.g., ["Suspect's alibi", "Murder weapon location"])
--- Issues (e.g. ["Poisoned", "Bleeding"] if avoiding and dealing with specific ailments is central to the story; otherwise, use a percentage for health)
--- Contacts (e.g., ["Dealers", "Local Newspaper"] if using and building these contacts is central to the story; otherwise, use a string to represent the bredth of contacts)

- boolean: Important story flags and conditions.
--- Story-changing decisions (e.g., betrayed the alliance)
--- Discovered secrets (e.g., learned about the conspiracy)
--- Unlocked abilities (e.g., gained access to restricted area)
--- Relationship markers (e.g., romantic interest revealed)
--- Quest availability (e.g., side mission unlocked)

Using the hint attribute for stats effectively:
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
- For string stats:
--- List all possible values: "Values: novice/apprentice/master/grandmaster"
--- Explain transitions: "Can only change one step at a time"
--- Define requirements: "Master requires 3 successful rituals"
- For string[] stats:
--- Set limitations: "Maximum 5 items can be carried"
--- Define categories: "Can include weapons, tools, and artifacts"
--- Specify uniqueness: "No duplicate abilities allowed"
- For boolean stats:
--- Explain permanence: "Cannot be reversed once true"
--- Define triggers: "Set to true when player discovers the ancient tomb"
--- Specify implications: "When true, unlocks new dialogue options"
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
        case "boolean":
          return stat.value.toString();
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
      `- ${npc.name} (${npc.pronouns}, ${npc.role}): ${npc.traits.join(", ")}`
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
        case "boolean":
          return stat.value.toString();
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

2. Beat generation

For each beat, consider the following points:

a) How should we narrate the changes to the story state to this player?
Exclude changes to stats that are not visible to the player.
This step is irrelevant if this is the first beat of the story.

b) Should we continue the scene or thread of the previous beat or start a new one?
- In most cases, it should take several beats to establish a milestone toward an outcome's resolution.
- If you added the final milestone to an outcome (number of milestones equals intended number of milestones), the outcome is resolved. Use this beat to give the resolution some gravity.

c) How should we make progress towards unresolved story outcomes?
- For outcomes without milestones: Consider introducing the outcome through NPCs, events, or initial discoveries.
- For outcomes with milestones: What are options for the next milestone to move the outcome closer to resolution?
Consider how many milestones are left to bring the outcome from its current status to a resolution.
Don't favor one option over others. Which option ends up as the outcome's resolution should be dictated by players' choices.
That said, if the players' early choices make an option unlikely or even impossible, it's OK to no longer consider milestones toward it.

d) How should we develop the world, its characters, and the relationships that the player character has with them?

e) How can we best stay true to the game's overall setup?
- Stay with the story's key conflicts and types of decisions
- Make the shared stats and player stats relevant${
      Object.keys(state.players).length > 1
        ? `
- Honor the ${state.gameMode.toLowerCase()} multiplayer game mode for the general feel and in how characters interact`
        : ""
    }`;

    console.log(
      "\n\n########\nBeat generation prompt\n########\n",
      prompt,
      "\n\n"
    );
    return prompt;
  }
}
