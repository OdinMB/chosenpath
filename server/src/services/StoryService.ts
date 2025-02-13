import { ChatOpenAI } from "@langchain/openai";
import OpenAI from "openai";
import type { StoryState, StorySetup } from "../../../shared/types/story.js";
import type { Beat } from "../../../shared/types/beat.js";
import { beatGenerationSchema } from "../../../shared/types/beat.js";
import { ChangeService } from "./ChangeService.js";
import dotenv from 'dotenv';
import type { ImageGeneration } from "../../../shared/types/image.js";
import { createStorySetupSchema } from "../../../shared/types/story.js";
import { PlayerCount } from "../../../shared/types/players.js";
import { getPlayerNumbers } from "../../../shared/utils/playerUtils.js";
dotenv.config();

export class StoryService {
  private model: ChatOpenAI;
  private openai: OpenAI;
  private changeService: ChangeService;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }

    this.model = new ChatOpenAI({
      modelName: "gpt-4o",
      temperature: 0.4
    });

    this.openai = new OpenAI();

    this.changeService = new ChangeService();
  }

  public async createInitialState(
    prompt: string, 
    generateImages: boolean, 
    playerCount: PlayerCount
  ): Promise<StoryState> {
    const setup = await this.initializeStory(prompt, playerCount);
    
    return {
      guidelines: setup.guidelines,
      outcomes: setup.player1.outcomes,
      stats: setup.worldStats,
      npcs: setup.npcs,
      player: setup.player1.character,
      maxTurns: 30,
      beatHistory: [],
      establishedFacts: [],
      generateImages,
      images: [],
    };
  }

  async initializeStory(prompt: string, playerCount: PlayerCount): Promise<StorySetup<typeof playerCount>> {
    const schema = createStorySetupSchema(playerCount);
    const structuredModel = this.model.withStructuredOutput(schema);

    try {
      console.log("Initializing story with playerCount:", playerCount);

      const response = await structuredModel.invoke(
        `Create a setup for a multiplayer, interactive fiction game for ${playerCount} player${playerCount > 1 ? 's' : ''} based on this prompt: "${prompt}".
        
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

        Important: You must generate exactly ${playerCount} player character${playerCount > 1 ? 's' : ''} with their respective outcomes and stats.
        `
      );

      console.log("Raw response:", response);
      console.log("Player keys:", Object.keys(response).filter(key => key.startsWith('player')));

      const playerKeys = Object.keys(response).filter(key => key.startsWith('player'));
      if (playerKeys.length !== playerCount) {
        throw new Error(`Expected ${playerCount} players but got ${playerKeys.length}`);
      }

      const validated = schema.parse(response);
      console.log("Validated response:", validated);
      
      return validated as StorySetup<typeof playerCount>;
    } catch (error) {
      console.error("Failed to initialize story:", error);
      throw new Error("Failed to initialize story. Please try again.");
    }
  }

  async generateNextBeat(state: StoryState): Promise<Beat & { imageGeneration?: ImageGeneration }> {
    const structuredModel = this.model.withStructuredOutput(beatGenerationSchema);

    try {
      console.log("Generating beat for turn:", state.beatHistory.length + 1);
      const response = await structuredModel.invoke(
        this.createBeatPrompt(state)
      );

      console.log("Plan:", response.plan);
      console.log("Image generation:", response.imageGeneration);

      const beatWithImageGen: Beat & { imageGeneration?: ImageGeneration } = {
        title: response.beat.title,
        text: response.beat.text,
        summary: response.beat.summary,
        imageId: response.beat.imageId,
        options: response.beat.options,
        changes: response.beat.changes,
        choice: -1,
        imageGeneration: response.imageGeneration
      };

      return beatWithImageGen;
    } catch (error) {
      console.error("Failed to generate next beat:", error);
      throw new Error("Failed to generate next beat. Please try again.");
    }
  }

  async processPlayerChoice(
    state: StoryState,
    optionIndex: number
  ): Promise<StoryState> {
    try {
      if (!state.beatHistory.length) return state;

      const currentBeat = state.beatHistory[state.beatHistory.length - 1];
      const updatedBeat = { ...currentBeat, choice: optionIndex };

      let updatedState = {
        ...state,
        beatHistory: [...state.beatHistory.slice(0, -1), updatedBeat],
      };

      if (updatedBeat.changes.length > 0) {
        updatedState = this.changeService.applyChanges(
          updatedState,
          updatedBeat.changes
        );
      }

      return updatedState;
    } catch (error) {
      console.error("Error in processPlayerChoice:", error);
      throw error;
    }
  }

  private createBeatPrompt(state: StoryState): string {
    const beatHistorySection = state.beatHistory
      .map((beat, index) => {
        const beatWithChoice = beat as Beat;
        const isLastBeat = index === state.beatHistory.length - 1;
        const chosenOption =
          beatWithChoice.choice >= 0
            ? beatWithChoice.options[beatWithChoice.choice]
            : null;

        return `Beat ${index + 1}:
Summary: ${beat.summary}${
          isLastBeat
            ? `\n\nFull text (only for the last beat to improve continuity):\n${beat.text}`
            : ""
        }${chosenOption ? `\nChosen option: ${chosenOption.text}` : ""}`;
      })
      .join("\n\n");

    const hasUnintroducedOutcomes = state.outcomes.some(
      (outcome) => outcome.milestones.length === 0
    );

    const prompt = `Game state:

STORY GUIDELINES
- Setting elements: ${state.guidelines.settingElements.join(", ")}
- Rules: ${state.guidelines.rules.join(", ")}
- Tone: ${state.guidelines.tone.join(", ")}
- Core conflicts: ${state.guidelines.conflicts.join(", ")}
- Decision types: ${state.guidelines.decisions.join(", ")}

PLAYER CHARACTER: ${state.player.name} (${state.player.pronouns})
${state.player.fluff}

NPCs:
${state.npcs
  .map(
    (npc) =>
      `- ${npc.name} (${npc.pronouns}, ${npc.role}): ${npc.traits.join(", ")}`
  )
  .join("\n")}

OUTCOMES that will define the story's ending:
${state.outcomes
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
  .join("\n\n")}${
      hasUnintroducedOutcomes
        ? "\nNote: If an outcome has 0 milestones, it means that it hasn't yet been introduced to the player. When you introduce it, create a milestone to mark its introduction."
        : ""
    }

STORY PROGRESS: Turn: ${state.beatHistory.length + 1}/${state.maxTurns}

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
}CURRENT STATS:

${state.stats
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

BEAT HISTORY:
${beatHistorySection}

PLAN THE NEXT BEAT:
Each beat must do five things:

1. Define changes to the story state based on the player's choice in the previous beat.
2. Give narrative feedback so the player understands these changes (except when the affected stats are not visible to the player).
3. Decide to continue the scene or thread of the previous beat or to start a new one.
4. Make Progress Towards Story Outcomes:
5. Develop World and Characters:

Consider the following:
- the story's key conflicts and types of decisions
- the status of outcomes, especially how many milestones are still missing for their resolution and the number of remaining beats
- the player's stats and relationships
- the previous beat to continue the story naturally

CREATE AN ENGAGING BEAT with:
- a descriptive title
- 3-4 paragraphs of narrative text
- 3 meaningful options for the player to choose from`;

    console.log("Beat generation prompt:", prompt);
    return prompt;
  }

}
