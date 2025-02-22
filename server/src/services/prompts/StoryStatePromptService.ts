import { type StoryState, GameModes } from "../../../../shared/types/story.js";
import { ThreadAnalysis } from "../../../../shared/types/thread.js";

export interface SectionConfig {
  gameMode?: boolean;
  guidelines?: boolean;
  storyElements?: boolean;
  worldFacts?: boolean;
  sharedStats?: boolean;
  sharedOutcomes?: boolean;
  imageLibrary?: boolean;
  players?: boolean;
  storyProgress?: boolean;
  switchConfiguration?: boolean;
  threadConfiguration?: boolean;
  previousThreadConfiguration?: boolean;
}

export const DEFAULT_SECTION_CONFIG: SectionConfig = {
  gameMode: true,
  guidelines: true,
  storyElements: true,
  worldFacts: true,
  sharedStats: true,
  sharedOutcomes: true,
  imageLibrary: true,
  players: true,
  storyProgress: true,
  switchConfiguration: true,
  threadConfiguration: true,
  previousThreadConfiguration: false,
} as const;

export class StoryStatePromptService {
  static createStoryStatePrompt(
    state: StoryState,
    sections: SectionConfig = DEFAULT_SECTION_CONFIG
  ): string {
    const prompt = [
      "======= CURRENT GAME STATE =======\n",
      sections.gameMode ? this.createGameModeSection(state) : "",
      sections.guidelines ? this.createGuidelinesSection(state) : "",
      sections.storyElements ? this.createStoryElementsSection(state) : "",
      sections.worldFacts ? this.createWorldFactsSection(state) : "",
      sections.sharedOutcomes ? this.createSharedOutcomesSection(state) : "",
      sections.sharedStats ? this.createSharedStatsSection(state) : "",
      sections.imageLibrary ? this.createImageLibrarySection(state) : "",
      sections.players ? this.createPlayersSection(state) : "",
      sections.storyProgress ? this.createStoryProgressSection(state) : "",
      sections.switchConfiguration ? this.getSwitchConfiguration(state) : "",
      sections.threadConfiguration
        ? this.createThreadConfigurationSection(
            state.currentThreadAnalysis,
            "current"
          ) +
          `\n\nCURRENT THREAD PROGRESSION: Turn ${
            state.currentThreadBeatsCompleted + 1
          }/${state.currentThreadMaxBeats}\n`
        : "",
      sections.previousThreadConfiguration
        ? this.createThreadConfigurationSection(
            state.previousThreadAnalysis,
            "previous"
          )
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    return prompt;
  }

  private static createGameModeSection(state: StoryState): string {
    if (Object.keys(state.players).length <= 1) return "";

    const modeDescriptions: Record<GameModes, string> = {
      [GameModes.Competitive]:
        "Players are competing against each other with conflicting goals and interests.",
      [GameModes.Cooperative]:
        "Players are cooperating with shared goals that require collaboration.",
      [GameModes.CooperativeCompetitive]:
        "Players have both shared goals requiring collaboration AND individual competitive goals.",
      [GameModes.SinglePlayer]: "Single player story mode.",
    };

    return `MULTIPLAYER GAME MODE: ${state.gameMode}
${modeDescriptions[state.gameMode]}

`;
  }

  private static createGuidelinesSection(state: StoryState): string {
    return [
      "STORY GUIDELINES",
      `- World: ${state.guidelines.world}`,
      `- Rules: ${state.guidelines.rules.join(", ")}`,
      `- Tone: ${state.guidelines.tone.join(", ")}`,
      `- Core conflicts: ${state.guidelines.conflicts.join(", ")}`,
      `- Types of decisions that players will make: ${state.guidelines.decisions.join(
        ", "
      )}`,
      "",
    ].join("\n");
  }

  private static createWorldFactsSection(state: StoryState): string {
    if (state.worldFacts.length === 0) return "";

    return [
      "GENERAL FACTS:",
      state.worldFacts.map((fact) => `- ${fact}`).join("\n"),
      "",
    ].join("\n");
  }

  private static createStoryElementsSection(state: StoryState): string {
    return [
      "STORY ELEMENTS:",
      state.storyElements
        .map((element) => {
          const facts =
            element.facts && element.facts.length > 0
              ? "\nFacts:\n" +
                element.facts.map((fact) => `- ${fact}`).join("\n")
              : "";

          return [
            `${element.name} (id: ${element.id})`,
            `Role: ${element.role}`,
            `Instructions: ${element.instructions}${facts}`,
          ].join("\n");
        })
        .join("\n\n"),
      "",
    ].join("\n");
  }

  private static createSharedStatsSection(state: StoryState): string {
    return [
      "SHARED STATS:",
      state.sharedStats
        .map((stat) => {
          const formattedValue = this.formatStatValue(stat);
          const visibility =
            stat.isVisible === false ? " (not visible to the player)" : "";
          const hint = stat.hint ? `\nHint: ${stat.hint}` : "";

          return `- ${stat.name} (id: ${stat.id}, type: ${stat.type}): ${formattedValue}${visibility}${hint}`;
        })
        .join("\n"),
      "",
    ].join("\n");
  }

  private static formatStatValue(stat: { type: string; value: any }): string {
    switch (stat.type) {
      case "percentage":
        return `${stat.value}%`;
      case "string[]":
        return Array.isArray(stat.value) ? stat.value.join(", ") : stat.value;
      default:
        return stat.value;
    }
  }

  private static createImageLibrarySection(state: StoryState): string {
    if (!state.generateImages) return "";

    return [
      "IMAGE LIBRARY:",
      state.images.length === 0
        ? "No images yet."
        : state.images
            .map((image) => `- ${image.id}: ${image.description}`)
            .join("\n"),
      "",
    ].join("\n");
  }

  private static createPlayersSection(state: StoryState): string {
    return Object.entries(state.players)
      .map(([slot, playerState]) => {
        const beatHistorySection = this.createBeatHistorySection(
          playerState.beatHistory
        );
        const separator = "#####################################";

        return [
          separator,
          `######## PLAYER ID: ${slot} ########`,
          separator,
          "",
          `${playerState.character.name} (${playerState.character.pronouns})`,
          playerState.character.fluff,
          "",
          "CHARACTER STATS:",
          this.createCharacterStatsSection(playerState.characterStats),
          "",
          "OUTCOMES that will define this character's story ending:",
          this.createOutcomesSection(playerState.outcomes),
          "",
          "STORY ELEMENTS THAT THIS CHARACTER HAS BEEN INTRODUCED TO: ",
          playerState.knownStoryElements.join(", "),
          "",
          "BEAT HISTORY:",
          beatHistorySection,
        ].join("\n");
      })
      .join("\n\n" + "=".repeat(80) + "\n\n");
  }

  private static createBeatHistorySection(beatHistory: any[]): string {
    return beatHistory
      .map((beat, index) => {
        const isLastBeat = index === beatHistory.length - 1;
        const chosenOption =
          beat.choice >= 0 ? beat.options[beat.choice] : null;

        if (isLastBeat) {
          return [
            `- Beat ${index + 1} (previous beat) - full text for continuity:`,
            beat.text,
            chosenOption ? `Player choice: ${chosenOption}` : "",
          ]
            .filter(Boolean)
            .join("\n\n");
        }

        return `- ${beat.summary}`;
      })
      .join("\n");
  }

  private static createCharacterStatsSection(stats: any[]): string {
    return stats
      .map((stat) => {
        const formattedValue = this.formatStatValue(stat);
        return `- ${stat.name} (id: ${stat.id}, type: ${
          stat.type
        }): ${formattedValue}${
          stat.isVisible === false ? " (not visible to the player)" : ""
        }${stat.hint ? `\nHint: ${stat.hint}` : ""}`;
      })
      .join("\n");
  }

  private static createOutcomesSection(outcomes: any[]): string {
    return outcomes
      .map((outcome) => {
        return [
          `id: ${outcome.id}`,
          outcome.question,
          `Possible resolutions: ${outcome.possibleResolutions.join(" | ")}`,
          `Resonance: ${outcome.resonance}`,
          `Milestones (${outcome.milestones.length} / ${outcome.intendedNumberOfMilestones} to resolution):`,
          outcome.milestones
            .map((milestone: string) => `- ${milestone}`)
            .join("\n"),
        ].join("\n");
      })
      .join("\n");
  }

  private static createStoryProgressSection(state: StoryState): string {
    const turn = Object.values(state.players)[0].beatHistory.length + 1;
    return `\nSTORY PROGRESS: Turn: ${turn}/${state.maxTurns}\n`;
  }

  private static createSharedOutcomesSection(state: StoryState): string {
    return [
      "SHARED OUTCOMES that will affect all players:",
      this.createOutcomesSection(state.sharedOutcomes),
      "",
    ].join("\n");
  }

  public static getSwitchConfiguration(state: StoryState): string {
    if (!state.currentSwitchAnalysis) {
      return "";
    }

    const { switches, coordinationPatternSummary } =
      state.currentSwitchAnalysis;

    const switchConfigs = switches
      .map((singleSwitch) => {
        const baseLine = `${singleSwitch.title} (${singleSwitch.id})\n- Type: ${
          singleSwitch.type
        }\n- Players: ${singleSwitch.players.join(", ")}`;
        const flavorLine =
          singleSwitch.type === "flavor"
            ? `\n- Outcome: ${singleSwitch.outcome}\n- Question: ${singleSwitch.question}`
            : "";
        const relationshipLine = `\n- Relationship to other switches: ${singleSwitch.relationshipToOtherSwitches}`;
        return baseLine + flavorLine + relationshipLine;
      })
      .join("\n\n");

    return (
      "CURRENT SWITCH CONFIGURATION:\n" +
      coordinationPatternSummary +
      "\n\n" +
      "Configuration:\n" +
      switchConfigs
    );
  }

  private static createThreadConfigurationSection(
    threadAnalysis: ThreadAnalysis | null,
    type: "current" | "previous"
  ): string {
    if (!threadAnalysis) {
      return "";
    }

    const { threads } = threadAnalysis;

    const threadConfigs = threads
      .map((thread) => {
        const outcomesSection = thread.outcomes
          .map((outcome) => {
            return [
              `  Outcome ID: ${outcome.outcomeId}`,
              `  Question: ${outcome.question}`,
              `  Possible Milestones:`,
              outcome.possibleMilestones.map((m) => `    - ${m}`).join("\n"),
            ].join("\n");
          })
          .join("\n\n");

        return [
          `Thread: ${thread.title} (${thread.id})`,
          `Players: ${thread.players.join(", ")}`,
          `Beat progression plan: ${thread.beatProgression}`,
          `Multiplayer notes: ${thread.multiplayerNotes}`,
          `Relationship to other threads: ${thread.relationshipToOtherThreads}`,
          "\nOutcomes that will get a milestone after this thread:",
          outcomesSection,
        ].join("\n");
      })
      .join("\n\n" + "-".repeat(40) + "\n\n");

    return `\n${type.toUpperCase()} THREAD CONFIGURATION:\n\n${threadConfigs}`;
  }
}
