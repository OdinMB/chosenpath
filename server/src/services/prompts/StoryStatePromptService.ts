import { type StoryState, GameModes } from "shared/types/story.js";

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
        ? this.createThreadConfigurationSection("current", state) +
          `\n\nCURRENT THREAD PROGRESSION: Turn ${
            state.currentThreadBeatsCompleted + 1
          }/${state.currentThreadMaxBeats}\n`
        : "",
      sections.previousThreadConfiguration
        ? this.createThreadConfigurationSection("previous", state)
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

  private static formatStatValue(stat: { type?: string; value?: any }): string {
    if (!stat.type || stat.value === undefined) return "";

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
          playerState.beatHistory,
          state.currentThreadBeatsCompleted
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

  private static createBeatHistorySection(
    beatHistory: any[],
    currentThreadBeatsCompleted?: number
  ): string {
    if (beatHistory.length === 0) {
      return "No beats yet.";
    }

    return beatHistory
      .map((beat, index) => {
        const choiceInfo =
          beat.choice !== undefined
            ? `\nChosen option: ${beat.options[beat.choice].text}`
            : "\nNo choice made yet.";

        const outcomeInfo = beat.resolution
          ? `\nOutcome: ${beat.resolution.toUpperCase()}`
          : "";

        const distributionInfo = beat.outcomeResult?.distribution
          ? `\nProbability distribution: Favorable ${beat.outcomeResult.distribution.favorable}% / Mixed ${beat.outcomeResult.distribution.mixed}% / Unfavorable ${beat.outcomeResult.distribution.unfavorable}%`
          : "";

        const pointsInfo =
          beat.outcomeResult?.points !== undefined
            ? `\nPoints: ${beat.outcomeResult.points > 0 ? "+" : ""}${
                beat.outcomeResult.points
              }`
            : "";

        const optionTypeInfo = beat.outcomeResult?.optionType
          ? `\nOption type: ${beat.outcomeResult.optionType.toUpperCase()}`
          : "";

        const outcomeDetails = beat.outcomeResult
          ? `${distributionInfo}${pointsInfo}${optionTypeInfo}`
          : "";

        return `Beat ${index + 1}: ${beat.title}
Summary: ${beat.summary}${choiceInfo}${outcomeInfo}${outcomeDetails}`;
      })
      .join("\n\n");
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
        const resolutions = this.formatResolutions(outcome.possibleResolutions);
        return [
          `Question: ${outcome.question} (${outcome.id})`,
          "Possible resolutions:\n" + resolutions,
          `Resonance: ${outcome.resonance}`,
          `Milestones (${outcome.milestones.length} / ${outcome.intendedNumberOfMilestones} to resolution):`,
          outcome.milestones
            .map((milestone: string) => `- ${milestone}`)
            .join("\n"),
        ].join("\n");
      })
      .join("\n");
  }

  private static formatResolutions(resolutions: any): string {
    // Standard resolutions (favorable/unfavorable/mixed)
    if ("favorable" in resolutions) {
      return [
        `- Favorable: ${resolutions.favorable}`,
        `- Mixed: ${resolutions.mixed}`,
        `- Unfavorable: ${resolutions.unfavorable}`,
      ].join("\n");
    }

    // Contested resolutions (sideAWins/sideBWins/mixed)
    if ("sideAWins" in resolutions) {
      return [
        `- Side A wins: ${resolutions.sideAWins}`,
        `- Mixed: ${resolutions.mixed}`,
        `- Side B wins: ${resolutions.sideBWins}`,
      ].join("\n");
    }

    // Exploratory resolutions (resolution1/2/3)
    if ("resolution1" in resolutions) {
      return [
        `- ${resolutions.resolution1}`,
        `- ${resolutions.resolution2}`,
        `- ${resolutions.resolution3}`,
      ].join("\n");
    }

    return "No resolutions defined";
  }

  private static createStoryProgressSection(state: StoryState): string {
    const turnsDone = Object.values(state.players)[0].beatHistory.length;
    const turnsLeft = state.maxTurns - turnsDone;
    return `\n======= STORY PROGRESS =======\n\nCurrent turn: ${
      turnsDone + 1
    }/${state.maxTurns}\nTurns left (including this one): ${turnsLeft}\n`;
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

    // Get last decisions for each player
    const lastDecisions = Object.entries(state.players)
      .map(([slot, playerState]) => {
        const lastBeat =
          playerState.beatHistory[playerState.beatHistory.length - 1];
        const choice =
          lastBeat?.options?.[lastBeat?.choice] || "No decision made";
        return `${slot}: ${choice}`;
      })
      .join("\n");

    const switchConfigs = switches
      .map((singleSwitch) => {
        const baseLine = `${singleSwitch.title} (${singleSwitch.id})\n- Type: ${
          singleSwitch.type
        }\n- Players: ${singleSwitch.players.join(", ")}`;

        const flavorLine =
          singleSwitch.type === "flavor"
            ? `\n- Outcome: ${singleSwitch.outcome}\n- Question: ${singleSwitch.question}`
            : "";

        const topicLine =
          singleSwitch.type === "topic" && singleSwitch.topicChoices?.length
            ? "\n- Topic choices:\n" +
              singleSwitch.topicChoices
                .map((choice) => `  • ${choice}`)
                .join("\n")
            : "";

        const relationshipLine = `\n- Relationship to other switches: ${singleSwitch.relationshipToOtherSwitches}`;

        return baseLine + flavorLine + topicLine + relationshipLine;
      })
      .join("\n\n");

    return [
      "CURRENT SWITCH CONFIGURATION:",
      coordinationPatternSummary,
      "\nConfiguration:",
      switchConfigs,
      "\nPlayers' last decisions:",
      lastDecisions,
    ].join("\n");
  }

  private static createThreadConfigurationSection(
    type: "current" | "previous",
    state: StoryState
  ): string {
    const threadAnalysis =
      type === "current"
        ? state.currentThreadAnalysis
        : state.previousThreadAnalysis;

    if (!threadAnalysis) {
      return "";
    }

    const { threads } = threadAnalysis;

    const threadConfigs = threads
      .map((thread) => {
        const isContested = thread.playersSideB.length > 0;
        const hasExploratoryMilestones =
          "resolution1" in thread.possibleMilestones;

        const milestonesSection = hasExploratoryMilestones
          ? [
              `Players: ${thread.playersSideA.join(", ")}`,
              `\nPossible milestones:`,
              `- Option 1: ${thread.possibleMilestones["resolution1"]}`,
              `- Option 2: ${thread.possibleMilestones["resolution2"]}`,
              `- Option 3: ${thread.possibleMilestones["resolution3"]}`,
            ].join("\n")
          : isContested
          ? [
              `Side A (${thread.playersSideA.join(", ")})`,
              `Side B (${thread.playersSideB.join(", ")})`,
              `\nPossible milestones:`,
              `- If Side A wins: ${thread.possibleMilestones["sideAWins"]}`,
              `- Mixed result: ${thread.possibleMilestones["mixed"]}`,
              `- If Side B wins: ${thread.possibleMilestones["sideBWins"]}`,
            ].join("\n")
          : [
              `Players: ${thread.playersSideA.join(", ")}`,
              `\nPossible milestones:`,
              `- Favorable: ${thread.possibleMilestones["favorable"]}`,
              `- Mixed: ${thread.possibleMilestones["mixed"]}`,
              `- Unfavorable: ${thread.possibleMilestones["unfavorable"]}`,
            ].join("\n");

        const numberedProgression = thread.progression
          .map((step, idx) => `(${idx + 1}) ${step.title}`)
          .join(" → ");

        // Get previous beat choices for this thread
        const previousBeatChoices = [];
        if (state.currentThreadBeatsCompleted > 0 && type === "current") {
          // Find players in this thread
          const threadPlayers = [
            ...thread.playersSideA,
            ...thread.playersSideB,
          ];

          // For each player, get their choices in the current thread
          for (const playerId of threadPlayers) {
            const player = state.players[playerId];
            if (!player) continue;

            // Calculate the starting index for the current thread in the beat history
            const threadStartIndex =
              player.beatHistory.length - state.currentThreadBeatsCompleted;

            // Loop through all completed beats in the current thread
            for (let i = 0; i < state.currentThreadBeatsCompleted; i++) {
              const beatIndex = threadStartIndex + i;
              if (beatIndex >= 0 && beatIndex < player.beatHistory.length) {
                const beat = player.beatHistory[beatIndex];
                if (beat && beat.options && beat.choice !== undefined) {
                  previousBeatChoices.push(
                    `- Beat ${i + 1}: (${playerId}) chose "${
                      beat.options[beat.choice].text
                    }"`
                  );
                }
              }
            }
          }
        }

        const currentBeatInfo = (beatsCompleted: number | undefined) => {
          // Only show current beat info for current thread configuration
          if (type !== "current") return "";

          if (beatsCompleted === undefined) return "";
          const currentBeat = thread.progression[beatsCompleted];
          if (!currentBeat) return "";

          // Determine outcome type
          const hasContestedOutcomes =
            "sideAWins" in currentBeat.possibleOutcomes;
          const hasStandardOutcomes =
            "favorable" in currentBeat.possibleOutcomes;
          const hasExploratoryOutcomes =
            "resolution1" in currentBeat.possibleOutcomes;

          let outcomes: string[] = [];

          if (hasContestedOutcomes) {
            outcomes = [
              `- If Side A wins: ${currentBeat.possibleOutcomes["sideAWins"]}`,
              `- Mixed result: ${currentBeat.possibleOutcomes["mixed"]}`,
              `- If Side B wins: ${currentBeat.possibleOutcomes["sideBWins"]}`,
            ];
          } else if (hasStandardOutcomes) {
            outcomes = [
              `- Favorable: ${currentBeat.possibleOutcomes["favorable"]}`,
              `- Mixed: ${currentBeat.possibleOutcomes["mixed"]}`,
              `- Unfavorable: ${currentBeat.possibleOutcomes["unfavorable"]}`,
            ];
          } else if (hasExploratoryOutcomes) {
            outcomes = [
              `- Option 1: ${currentBeat.possibleOutcomes["resolution1"]}`,
              `- Option 2: ${currentBeat.possibleOutcomes["resolution2"]}`,
              `- Option 3: ${currentBeat.possibleOutcomes["resolution3"]}`,
            ];
          } else {
            outcomes = ["- No outcomes defined"];
          }

          return [
            `\nCurrent beat (${beatsCompleted + 1}/${
              state.currentThreadMaxBeats
            }): ${currentBeat.title}`,
            `Question: ${currentBeat.question}`,
            `Possible outcomes:`,
            outcomes.join("\n"),
          ].join("\n");
        };

        return [
          `==== THREAD: ${thread.title} (${thread.id}) ====`,
          isContested
            ? "Contested thread between:"
            : hasExploratoryMilestones
            ? "Exploratory thread:"
            : "",
          milestonesSection,
          `\nBeat progression`,
          `- Plan: ${numberedProgression}`,
          previousBeatChoices.length > 0 ? previousBeatChoices.join("\n") : "",
          currentBeatInfo(state.currentThreadBeatsCompleted),
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n\n" + "-".repeat(40) + "\n\n");

    return `\n======= ${type.toUpperCase()} THREAD CONFIGURATION =======\n\n${threadConfigs}`;
  }
}
