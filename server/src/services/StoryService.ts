import { ChatOpenAI } from "@langchain/openai";
import OpenAI from "openai";
import type { StoryState, StorySetup } from "../../../shared/types/story.js";
import { storySetupSchema } from "../../../shared/types/story.js";
import type { Beat } from "../../../shared/types/beat.js";
import { beatGenerationSchema } from "../../../shared/types/beat.js";
import type { Image } from "../../../shared/types/image.js";
import { ChangeService } from "./ChangeService.js";
import dotenv from 'dotenv';
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

  async initializeStory(prompt: string): Promise<StorySetup> {
    const structuredModel = this.model.withStructuredOutput(storySetupSchema);

    try {
      const response = await structuredModel.invoke(
        `Create a setup for an interactive story based on this prompt: "${prompt}".
        
        The entire story is supposed to play out over a course of 30 beats, with each beat consisting of about three paragraphs of text and a decision by the player.
        Generate enough conflicts, types of decisions, outcomes, NPCs, and stats to make the story interesting, but not so many that they cannot be fully developed within the 30 beats.
        Here are guidelines for a story with 30 beats:
        - 3 conflicts
        - 3 types of decisions
        - 3 outcomes with 4 intended milestones each for resolution
        - 5-6 NPCs / factions / organizations
        - 4-6 stats for traits/skills/powers/dispositions of the player character. 
        - 3-5 stats for relationships between the player character and the NPCs / factions / organizations (if relevant) (often strings work better for this than numbers)
        - 1-3 stats for resources (if relevant)
        - 2-3 stats for world elements that can be influenced by the player (e.g. tension between factions) (if relevant)
        - 1-2 stats for pacing vehicles (if relevant) (e.g. number of remaining leads that can be investigated, invisible proximity of a bounty hunter, etc.)
        `
      );

      // Create initial story state
      const initialState: StorySetup = {
        ...response,
      };

      console.log("Story setup generated:", initialState);
      return initialState;
    } catch (error) {
      console.error("Failed to initialize story:", error);
      throw new Error("Failed to initialize story. Please try again.");
    }
  }

  async generateNextBeat(state: StoryState): Promise<Beat & { image?: Image }> {
    const structuredModel =
      this.model.withStructuredOutput(beatGenerationSchema);

    try {
      console.log("Generating beat for turn:", state.currentTurn);
      const response = await structuredModel.invoke(
        this.createBeatPrompt(state)
      );

      console.log("Plan:", response.plan);
      console.log("Image generation:", response.imageGeneration);

      let image: Image | undefined;
      if (state.generateImages && response.imageGeneration) {
        try {
          const imageResponse = await this.openai.images.generate({
            model: "dall-e-3",
            prompt: response.imageGeneration.prompt,
            n: 1,
            size: "1792x1024",
          });

          if (imageResponse.data[0].url) {
            image = {
              ...response.imageGeneration,
              url: imageResponse.data[0].url,
            };
          }
          console.log("Image URL:", image?.url);
        } catch (error) {
          console.error("Failed to generate image:", error);
        }
      }

      // Construct a proper Beat object with the choice field
      const beatWithChoice: Beat = {
        title: response.beat.title,
        text: response.beat.text,
        summary: response.beat.summary,
        imageId: response.beat.imageId,
        options: response.beat.options,
        changes: response.beat.changes,
        choice: -1,
      };

      return { ...beatWithChoice, image };
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
        currentTurn: state.currentTurn + 1,
        beatHistory: [...state.beatHistory.slice(0, -1), updatedBeat],
      };

      // Apply changes if the beat has them
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
        const beatWithChoice = beat as Beat; // Cast to Beat type to access choice
        const isLastBeat = index === state.beatHistory.length - 1;
        const chosenOption =
          beatWithChoice.choice >= 0
            ? beatWithChoice.options[beatWithChoice.choice]
            : null;

        const formattedChanges = beat.changes
          .map((change) => `- ${JSON.stringify(change)}`)
          .join("\n");

        return `Beat ${index + 1}:
Applied changes:\n${formattedChanges}
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

STORY PROGRESS: Turn: ${state.currentTurn}/${state.maxTurns}

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
