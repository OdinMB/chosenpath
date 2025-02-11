import { ChatOpenAI } from "@langchain/openai";
import { StoryState, storySetupSchema } from "../types/story";
import { beatGenerationSchema, Beat } from "../types/beat";
import { Image } from "../types/image";
import OpenAI from "openai";

export class StoryService {
  private model: ChatOpenAI;
  private openai: OpenAI;

  constructor() {
    this.model = new ChatOpenAI({
      modelName: "gpt-4o",
      temperature: 0.5,
    });

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      dangerouslyAllowBrowser: true, // Only for development!
    });
  }

  async initializeStory(prompt: string) {
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
      console.log(response);
      return response;
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

      console.log("Plan:\n", response.plan);
      console.log("Image generation:\n", response.imageGeneration);

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
          console.log("Image URL:\n", image?.url);
        } catch (error) {
          console.error("Failed to generate image:", error);
        }
      }

      return { ...response.beat, image };
    } catch (error) {
      console.error("Failed to generate next beat:", error);
      throw new Error("Failed to generate next beat. Please try again.");
    }
  }

  private createBeatPrompt(state: StoryState): string {
    const beatHistorySection = state.beatHistory
      .map((beat, index) => {
        const isLastBeat = index === state.beatHistory.length - 1;
        const chosenOption =
          beat.choice >= 0 ? beat.options[beat.choice] : null;

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

    console.log("Beat generation prompt:\n", prompt);
    return prompt;
  }
}

export const storyService = new StoryService();
