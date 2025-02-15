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
      modelName: "o3-mini", // o3-mini, gpt-4o
      // temperature: 0.4,
      reasoningEffort: "medium",
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
      worldStats: setup.worldStats,
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
        } based on this prompt: "${prompt}".${gameModeInstructions[gameMode]}
        
        The entire story is supposed to play out over a course of ${maxTurns} beats, with each beat consisting of about three paragraphs of text for each player and a decision by the player.
        Generate enough conflicts, types of decisions, outcomes, NPCs, and stats to make the story interesting, but not so many that they cannot be fully developed within the ${maxTurns} beats.

        Here are guidelines for a story with 20 beats:
        - 3 overarching conflicts
        - 3 types of decisions that the players will be able to make
        - 5-6 NPCs / factions / organizations
        - 2-3 stats for world elements that can be influenced by the players (e.g. tension between factions) (if relevant)
        - 1-2 stats for pacing vehicles (if relevant) (e.g. number of remaining leads that can be investigated, invisible proximity of a bounty hunter, etc.)
        For each player:
        - 3 outcomes with 4 milestones each towards the outcome's resolution
        - 4-6 stats for traits/skills/powers/dispositions
        - 3-5 stats for relationships with NPCs/factions (if relevant)
        - 1-3 stats for resources (if relevant)

        Important: You must generate exactly ${playerCount} player character${
          playerCount > 1 ? "s" : ""
        } with their respective outcomes and stats.
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

WORLD STATS:
${state.worldStats
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

- Include changes to both the world stats and the character stats of each player.
- Take stats into account. For example, if a player character tries to be stealthy, but the character traits indicate more of a brute force approach, the character will not be stealthy.
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
- Make the world and player stats relevant${
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
