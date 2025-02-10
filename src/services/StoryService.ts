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

  async generateNextBeat(state: StoryState): Promise<Beat> {
    const structuredModel =
      this.model.withStructuredOutput(beatGenerationSchema);

    try {
      console.log("Generating beat for turn:", state.currentTurn);
      const response = await structuredModel.invoke(
        this.createBeatPrompt(state)
      );
      console.log("Plan:\n", response.plan);
      return response.beat;
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
        ? "\n\nNote: If an outcome has 0 milestones, it means that it hasn't yet been introduced to the player. When you introduce it, create a milestone to mark its introduction."
        : ""
    }


STORY PROGRESS
- Turn: ${state.currentTurn}/${state.maxTurns}
    
CURRENT STATS:
${state.stats
  .map(
    (stat) =>
      `- ${stat.name} (id: ${stat.id}, type: ${stat.type}): ${stat.value}${
        stat.isVisible === false ? " (not visible to the player)" : ""
      }`
  )
  .join("\n")}

BEAT HISTORY:
${beatHistorySection}

INSTRUCTIONS FOR NEXT BEAT:
Each beat must do five things:

1. Define changes to the story state based on the player's choice in the previous beat.

2. Give narrative feedback so the player understands these changes (except when the affected stats are not visible to the player).

3. Decide to continue the scene or thread of the previous beat or to start a new one.
- If you added the final milestone to an outcome (number of milestones equals intended number of milestones), the outcome is resolved. Use this beat to give the resolution some gravity.

4. Make Progress Towards Story Outcomes:
- For 'not_introduced' outcomes: Consider introducing them through NPCs, events, or discoveries
- For 'introduced' or 'in_progress' outcomes: Move them closer to resolution by creating scenes that lead to new milestones toward that outcome's resolution
- Ensure progression feels natural within the story's context and pacing

5. Develop World and Characters:
- Reveal new information about the world or NPCs
- Deepen relationships between the player character and other characters
- Provide opportunities for meaningful stat changes
- Reference and build upon previous story elements and choices

Consider the following:
- the story's key conflicts and types of decisions
- the status of outcomes, especially how many milestones are still missing for their resolution and the number of remaining beats
- the player's stats and relationships
- the previous beat to continue the story naturally

Create an engaging beat with:
- A descriptive title
- 3-4 paragraphs of narrative text
- 3 meaningful choices`;

    console.log("Beat generation prompt:\n", prompt);
    return prompt;
  }
}

export const storyService = new StoryService();
