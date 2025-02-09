import { ChatOpenAI } from "@langchain/openai";
import { StoryState, storySetupSchema } from "../types/story";

import { beatGenerationSchema, Beat } from "../types/beat";

export class StoryService {
  private model: ChatOpenAI;

  constructor() {
    this.model = new ChatOpenAI({
      modelName: "gpt-4o",
      temperature: 0.5,
    });
  }

  async initializeStory(prompt: string) {
    const structuredModel = this.model.withStructuredOutput(storySetupSchema);

    try {
      const response = await structuredModel.invoke(
        `Create a setup for an interactive story based on this prompt: "${prompt}".
        The entire story is supposed to play out over a course of 30 beats, with each beat consisting of about three paragraphs of text and a decision by the player.
        Make sure that conflicts and outcomes can be explored in a satisfactory way within these 30 beats.
        Generate enough locations and NPCs to make the story interesting, but not so many that they cannot be introduced and developed within the 30 beats.
        `
      );
      console.log(response);
      return response;
    } catch (error) {
      console.error("Failed to initialize story:", error);
      throw new Error("Failed to initialize story. Please try again.");
    }
  }

  async generateNextBeat(state: StoryState): Promise<Beat> {
    const structuredModel =
      this.model.withStructuredOutput(beatGenerationSchema);

    try {
      console.log("Generating beat for turn:", state.currentTurn);
      const response = await structuredModel.invoke(
        this.createBeatPrompt(state)
      );
      console.log("Generated beat:", JSON.stringify(response, null, 2));
      return response.beat;
    } catch (error) {
      console.error("Failed to generate next beat:", error);
      throw new Error("Failed to generate next beat. Please try again.");
    }
  }

  private createBeatPrompt(state: StoryState): string {
    const prompt = `Game state:

STORY GUIDELINES
- Setting elements: ${state.guidelines.settingElements.join(", ")}
- Rules: ${state.guidelines.rules.join(", ")}
- Tone: ${state.guidelines.tone.join(", ")}
- Core conflicts: ${state.guidelines.conflicts.join(", ")}
- Decision types: ${state.guidelines.decisions.join(", ")}

CHARACTERS
Player Character (${state.player.name}):
${state.player.fluff}

NPCs:
${state.npcs
  .map((npc) => `- ${npc.name} (${npc.role}): ${npc.traits.join(", ")}`)
  .join("\n")}

OUTCOMES that will define the story's ending:
${state.outcomes
  .map(
    (outcome) =>
      `- id: ${outcome.id} (${outcome.status})
${outcome.question}
Possible outcomes: ${outcome.possibleOutcomes.join(" | ")}`
  )
  .join("\n")}

STORY PROGRESS
- Turn: ${state.currentTurn}/${state.maxTurns}
    
CURRENT STATS:
${state.stats
  .map((stat) => `- ${stat.name} (id: ${stat.id}): ${stat.value}`)
  .join("\n")}

STORY HISTORY:
${state.beatArchive
  .map(
    (beat, index) =>
      `Beat ${index + 1}: Summary: ${beat.summary}
Choice: ${JSON.stringify(beat.choice)}`
  )
  .join("\n\n")}

PREVIOUS BEAT (for continuity):
${state.previousBeat?.text}

INSTRUCTIONS FOR NEXT BEAT:
Each beat should do three things:

1. Give narrative feedback on the decisions made in the previous beat (except for the first beat).
- Stat changes are already incorporated in the story state at this point but still have to be mentioned in the narrative.
- If the player decided to meet someone, go to a location, etc., and the outcome of this decision is not yet clear, this next beat should be about that.

2. Make Progress Towards Story Outcomes:
- For 'not_introduced' outcomes: Consider introducing them through NPCs, events, or discoveries
- For 'introduced' or 'in_progress' outcomes: Move them closer to resolution
- Ensure progression feels natural within the story's context and pacing

3. Develop World and Characters:
- Reveal new information about the world or NPCs
- Deepen relationships between characters
- Provide opportunities for meaningful stat changes
- Reference and build upon previous story elements and choices

Consider
- the previous beat to continue the story naturally
- the story's key conflicts and types of decisions to shape the beat accordingly
- the player's stats and relationships to influence the beat, the choices and their consequences

Create an engaging beat with:
- A descriptive title
- 2-3 paragraphs of narrative text
- 2-3 meaningful choices that affect:
  * Story progression
  * Character relationships
  * Stats
  * Outcome progression`;

    console.log("Beat generation prompt:\n", prompt);
    return prompt;
  }
}

export const storyService = new StoryService();
