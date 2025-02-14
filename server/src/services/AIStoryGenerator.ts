import { ChatOpenAI } from "@langchain/openai";
import type {
  StoryState,
  StorySetup,
  PlayerStateGeneration,
} from "../../../shared/types/story.js";
import type { Change } from "../../../shared/types/change.js";
import type { Beat } from "../../../shared/types/beat.js";
import dotenv from "dotenv";
import { createStorySetupSchema } from "../../../shared/types/story.js";
import type { PlayerCount } from "../../../shared/types/players.js";
import { getPlayerSlots } from "../../../shared/utils/playerUtils.js";
import { createSetOfBeatPlanGenerationSchema } from "../../../shared/types/beat.js";
dotenv.config();

export class AIStoryGenerator {
  private model: ChatOpenAI;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }

    this.model = new ChatOpenAI({
      modelName: "gpt-4o",
      temperature: 0.4,
    });
  }

  public async createInitialState(
    prompt: string,
    generateImages: boolean,
    playerCount: PlayerCount
  ): Promise<StoryState> {
    const setup = await this.generateStorySetup(prompt, playerCount);

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
      maxTurns: 30,
      establishedFacts: [],
      generateImages,
      images: [],
      playerCodes: {},
    };
  }

  async generateStorySetup(
    prompt: string,
    playerCount: PlayerCount
  ): Promise<StorySetup<typeof playerCount>> {
    const schema = createStorySetupSchema(playerCount);
    const structuredModel = this.model.withStructuredOutput(schema);

    try {
      console.log("Generating story setup with playerCount:", playerCount);

      const response = await structuredModel.invoke(
        `Create a setup for a multiplayer, interactive fiction game for ${playerCount} player${
          playerCount > 1 ? "s" : ""
        } based on this prompt: "${prompt}".
        
        The entire story is supposed to play out over a course of 30 beats, with each beat consisting of about three paragraphs of text for each player and a decision by the player.
        Generate enough conflicts, types of decisions, outcomes, NPCs, and stats to make the story interesting, but not so many that they cannot be fully developed within the 30 beats.
        Here are guidelines for a story with 30 beats:
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

  async addNextSetOfBeats(state: StoryState): Promise<[StoryState, Change[]]> {
    const schema = createSetOfBeatPlanGenerationSchema(
      Object.keys(state.players).length as PlayerCount
    );
    const structuredModel = this.model.withStructuredOutput(schema);

    try {
      console.log(
        "Generating beats for turn:",
        Object.values(state.players)[0].beatHistory.length + 1
      );

      const response = await structuredModel.invoke(
        this.createBeatPrompt(state)
      );

      console.log("Response:\n", response);

      // Create a copy of the state to add new beats
      let updatedState = { ...state };

      // Add the new beats to each player's history
      Object.entries(response).forEach(([key, value]) => {
        if (
          key.startsWith("player") &&
          typeof value === "object" &&
          value !== null &&
          "title" in value &&
          "options" in value &&
          "text" in value &&
          "summary" in value &&
          "imageId" in value
        ) {
          const playerSlot = key.toLowerCase();
          if (updatedState.players[playerSlot]) {
            const beat: Beat = {
              title: value.title as string,
              options: value.options as string[],
              text: value.text as string,
              summary: value.summary as string,
              imageId: value.imageId as string,
              choice: -1,
            };
            updatedState.players[playerSlot].beatHistory.push(beat);
          }
        }
      });

      return [updatedState, response.changes || []];
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
                ? `\n\nFull text (only for the last beat to improve continuity):\n${beat.text}`
                : ""
            }${chosenOption ? `\nPlayer choice: ${chosenOption}` : ""}`;
          })
          .join("\n\n");

        const hasUnintroducedOutcomes = playerState.outcomes.some(
          (outcome) => outcome.milestones.length === 0
        );

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

STORY GUIDELINES
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

IMAGES: ${
      state.generateImages
        ? "Are to be generated (or chosen from the library)"
        : "Are NOT to be generated"
    }

${
  state.generateImages
    ? `IMAGE LIBRARY:
${state.images.map((image) => `- ${image.id}: ${image.description}`).join("\n")}

`
    : ""
}${playersSection}

======= YOUR JOB: GENERATE THE NEXT SET OF STORY BEATS =======

Each beat must do five things:

1. Define changes to the story state based on the players' choices in the previous beats.
2. Give narrative feedback so the players understand these changes (except when the affected stats are not visible to the player).
Skip steps 1+2 if this is the first set of beats in the game.
3. Decide to continue the scene or thread of the previous beats or to start new ones.
4. Make Progress Towards Story Outcomes
Note: If an outcome has 0 milestones, it means that it hasn't yet been introduced to the player. When you introduce it, create a milestone to mark its introduction.
5. Develop World and Characters

Consider the following:
- the story's key conflicts and types of decisions
- the status of outcomes for each player, especially how many milestones are still missing for their resolution and the number of remaining beats
- each player's stats and relationships
- the previous beats to continue the story naturally

CREATE ENGAGING BEATS for each player with:
- a descriptive title
- 3-4 paragraphs of narrative text
- 3 meaningful options for the player to choose from`;

    console.log(
      "\n\n########\nBeat generation prompt\n########\n",
      prompt,
      "\n\n"
    );
    return prompt;
  }
}
