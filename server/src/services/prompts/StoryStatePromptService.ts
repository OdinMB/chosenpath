import { type StoryState, GameModes } from "shared/types/story.js";
import { Story } from "../Story.js";

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
    story: Story,
    sections: SectionConfig = DEFAULT_SECTION_CONFIG
  ): string {
    const prompt = [
      "======= CURRENT GAME STATE =======\n",
      sections.gameMode ? this.createGameModeSection(story) : "",
      sections.guidelines ? this.createGuidelinesSection(story) : "",
      sections.storyElements ? this.createStoryElementsSection(story) : "",
      sections.worldFacts ? this.createWorldFactsSection(story) : "",
      sections.sharedOutcomes ? this.createSharedOutcomesSection(story) : "",
      sections.sharedStats ? this.createSharedStatsSection(story) : "",
      sections.imageLibrary ? this.createImageLibrarySection(story) : "",
      sections.players ? this.createPlayersSection(story) : "",
      sections.storyProgress ? this.createStoryProgressSection(story) : "",
      sections.switchConfiguration ? this.getSwitchConfiguration(story) : "",
      sections.threadConfiguration
        ? this.createThreadConfigurationSection("current", story) +
          `\n\nCURRENT THREAD PROGRESSION: Turn ${
            story.getCurrentThreadBeatsCompleted() + 1
          }/${story.getCurrentThreadDuration()}\n`
        : "",
      sections.previousThreadConfiguration
        ? this.createThreadConfigurationSection("previous", story)
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    return prompt;
  }

  private static createGameModeSection(story: Story): string {
    if (!story.isMultiplayer()) return "";

    const modeDescriptions: Record<GameModes, string> = {
      [GameModes.Competitive]:
        "Players are competing against each other with conflicting goals and interests.",
      [GameModes.Cooperative]:
        "Players are cooperating with shared goals that require collaboration.",
      [GameModes.CooperativeCompetitive]:
        "Players have both shared goals requiring collaboration AND individual competitive goals.",
      [GameModes.SinglePlayer]: "Single player story mode.",
    };

    return `MULTIPLAYER GAME MODE: ${story.getGameMode()}
${modeDescriptions[story.getGameMode()]}

`;
  }

  private static createGuidelinesSection(story: Story): string {
    return [
      "STORY GUIDELINES",
      `- World: ${story.getGuidelines().world}`,
      `- Rules: ${story.getGuidelines().rules.join(", ")}`,
      `- Tone: ${story.getGuidelines().tone.join(", ")}`,
      `- Core conflicts: ${story.getGuidelines().conflicts.join(", ")}`,
      `- Types of decisions that players will make: ${story
        .getGuidelines()
        .decisions.join(", ")}`,
      "",
    ].join("\n");
  }

  private static createWorldFactsSection(story: Story): string {
    if (story.getWorldFacts().length === 0) return "";

    return [
      "GENERAL FACTS:",
      story
        .getWorldFacts()
        .map((fact) => `- ${fact}`)
        .join("\n"),
      "",
    ].join("\n");
  }

  private static createStoryElementsSection(story: Story): string {
    const storyElements = story.getStoryElements();

    if (!storyElements || storyElements.length === 0) {
      console.log("[StoryStatePromptService] No story elements found");
      return "";
    }

    return [
      "STORY ELEMENTS:",
      storyElements
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

  private static createSharedStatsSection(story: Story): string {
    return [
      "SHARED STATS:",
      story
        .getSharedStats()
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

  private static createImageLibrarySection(story: Story): string {
    if (!story.includesImages()) return "";

    return [
      "IMAGE LIBRARY:",
      story.getImages().length === 0
        ? "No images yet."
        : story
            .getImages()
            .map((image) => `- ${image.id}: ${image.description}`)
            .join("\n"),
      "",
    ].join("\n");
  }

  private static createPlayersSection(story: Story): string {
    return Object.entries(story.getPlayers())
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
    if (!beatHistory || beatHistory.length === 0) {
      return "No beats yet.";
    }

    return beatHistory
      .map((beat, index) => {
        const choiceText =
          beat.choice !== undefined
            ? `${beat.options[beat.choice].text}`
            : "No choice made yet";

        const resultText = beat.resolution
          ? ` (Result: ${
              beat.resolution.charAt(0).toUpperCase() +
              beat.resolution.slice(1).toLowerCase()
            })`
          : "";

        return `Beat ${index + 1}: ${beat.title}
Summary: ${beat.summary}
Chosen option: ${choiceText}${resultText}`;
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
          `ID: ${outcome.id}`,
          `Question: ${outcome.question}`,
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

  private static createStoryProgressSection(story: Story): string {
    const turnsDone = story.getCurrentTurn();
    const turnsLeft = story.getMaxTurns() - turnsDone;
    return `\n======= STORY PROGRESS =======\n\nCurrent turn: ${
      turnsDone + 1
    }/${story.getMaxTurns()}\nTurns left (including this one): ${turnsLeft}\n`;
  }

  private static createSharedOutcomesSection(story: Story): string {
    return [
      "SHARED OUTCOMES that will affect all players:",
      this.createOutcomesSection(story.getSharedOutcomes()),
      "",
    ].join("\n");
  }

  public static getSwitchConfiguration(story: Story): string {
    if (!story.getCurrentSwitchAnalysis()) {
      return "";
    }

    const { switches, coordinationPatternSummary } =
      story.getCurrentSwitchAnalysis();

    const lastDecisions = story
      .getPlayerSlots()
      .map((slot) => {
        const lastBeat = story.getCurrentBeat(slot);
        const choice =
          lastBeat?.options?.[lastBeat?.choice]?.text || "No decision made";
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
    story: Story
  ): string {
    const threadAnalysis =
      type === "current"
        ? story.getCurrentThreadAnalysis()
        : story.getPreviousThreadAnalysis();

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

        // Create a detailed beat progression plan that includes questions
        const detailedProgression = thread.progression
          .map(
            (step, idx) => `- Beat ${idx + 1}: ${step.title} - ${step.question}`
          )
          .join("\n");

        // Get beat choices for this thread
        const beatChoices = [];

        // For previous threads, we need to get the beat history from a different location
        const getThreadBeats = () => {
          if (type === "current") {
            return this.getCurrentThreadBeatChoices(thread, story);
          } else {
            return this.getPreviousThreadBeatChoices(thread, story);
          }
        };

        const beatChoicesResult = getThreadBeats();

        const currentBeatInfo = (beatsCompleted: number | undefined) => {
          // Only show current beat info for current thread configuration
          if (type !== "current") return "";

          if (beatsCompleted === undefined) return "";
          const currentBeat = thread.progression[beatsCompleted];
          if (!currentBeat) return "";

          // Determine outcome type
          const hasContestedOutcomes =
            "sideAWins" in currentBeat.possibleResolutions;
          const hasStandardOutcomes =
            "favorable" in currentBeat.possibleResolutions;
          const hasExploratoryOutcomes =
            "resolution1" in currentBeat.possibleResolutions;

          let outcomes: string[] = [];

          if (hasContestedOutcomes) {
            outcomes = [
              `- If Side A wins: ${currentBeat.possibleResolutions["sideAWins"]}`,
              `- Mixed result: ${currentBeat.possibleResolutions["mixed"]}`,
              `- If Side B wins: ${currentBeat.possibleResolutions["sideBWins"]}`,
            ];
          } else if (hasStandardOutcomes) {
            outcomes = [
              `- Favorable: ${currentBeat.possibleResolutions["favorable"]}`,
              `- Mixed: ${currentBeat.possibleResolutions["mixed"]}`,
              `- Unfavorable: ${currentBeat.possibleResolutions["unfavorable"]}`,
            ];
          } else if (hasExploratoryOutcomes) {
            outcomes = [
              `- Option 1: ${currentBeat.possibleResolutions["resolution1"]}`,
              `- Option 2: ${currentBeat.possibleResolutions["resolution2"]}`,
              `- Option 3: ${currentBeat.possibleResolutions["resolution3"]}`,
            ];
          } else {
            outcomes = ["- No outcomes defined"];
          }

          return [
            `\nCurrent beat (${
              beatsCompleted + 1
            }/${story.getCurrentThreadDuration()}): ${currentBeat.title}`,
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
          // Only show beat progression plan for current threads
          type === "current" ? `\nPlan for beat progression` : "",
          type === "current" ? detailedProgression : "",
          beatChoicesResult.length > 0
            ? `\nBeat progression${
                type === "previous" ? "" : " so far"
              }:\n${beatChoicesResult.join("\n")}`
            : "",
          currentBeatInfo(story.getCurrentThreadBeatsCompleted()),
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n\n" + "-".repeat(40) + "\n\n");

    return `\n======= ${type.toUpperCase()} THREAD CONFIGURATION =======\n\n${threadConfigs}`;
  }

  private static getCurrentThreadBeatChoices(
    thread: any,
    story: Story
  ): string[] {
    const previousBeatChoices: string[] = [];

    if (story.getCurrentThreadBeatsCompleted() <= 0) {
      return previousBeatChoices;
    }

    // Find players in this thread
    const threadPlayers = [...thread.playersSideA, ...thread.playersSideB];

    // Create a map to organize choices by beat number
    const beatChoicesMap: Record<number, string[]> = {};

    // For each player, get their choices in the current thread
    for (const playerId of threadPlayers) {
      const player = story.getPlayer(playerId);
      if (!player) continue;

      // Calculate the starting index for the current thread in the beat history
      const threadStartIndex =
        player.beatHistory.length - story.getCurrentThreadBeatsCompleted();

      // Loop through all completed beats in the current thread
      for (let i = 0; i < story.getCurrentThreadBeatsCompleted(); i++) {
        const beatIndex = threadStartIndex + i;
        if (beatIndex >= 0 && beatIndex < player.beatHistory.length) {
          const beat = player.beatHistory[beatIndex];
          if (beat && beat.options && beat.choice !== undefined) {
            const resultText = beat.resolution
              ? ` Result: ${
                  beat.resolution.charAt(0).toUpperCase() +
                  beat.resolution.slice(1).toLowerCase()
                }.`
              : "";

            // Initialize the array for this beat if it doesn't exist
            if (!beatChoicesMap[i]) {
              beatChoicesMap[i] = [];
            }

            // Add this player's choice to the appropriate beat
            beatChoicesMap[i].push(
              `--- (${playerId}) chose "${
                beat.options[beat.choice].text
              }"${resultText}`
            );
          }
        }
      }
    }

    // Convert the map to the format we want
    for (let i = 0; i < story.getCurrentThreadBeatsCompleted(); i++) {
      if (beatChoicesMap[i] && beatChoicesMap[i].length > 0) {
        previousBeatChoices.push(
          `- Beat ${i + 1}\n${beatChoicesMap[i].join("\n")}`
        );
      }
    }

    return previousBeatChoices;
  }

  private static getPreviousThreadBeatChoices(
    thread: any,
    story: Story
  ): string[] {
    const beatChoices: string[] = [];

    if (!story.getPreviousThreadAnalysis()) {
      return beatChoices;
    }

    // Find players in this thread
    const threadPlayers = [...thread.playersSideA, ...thread.playersSideB];

    // Create a map to organize choices by beat number
    const beatChoicesMap: Record<number, string[]> = {};

    // Get the number of beats from the thread's progression attribute
    const previousThreadBeatsCount = thread.progression
      ? thread.progression.length
      : 0;

    if (previousThreadBeatsCount <= 0) {
      return beatChoices;
    }

    // For each player, find their choices from the previous thread
    for (const playerId of threadPlayers) {
      const player = story.getPlayer(playerId);
      if (!player) continue;

      // Calculate where the previous thread starts in the beat history
      // It should be before the current thread
      const currentThreadStartIndex =
        player.beatHistory.length -
        (story.getCurrentThreadBeatsCompleted() || 0);
      const previousThreadStartIndex =
        currentThreadStartIndex - previousThreadBeatsCount;

      // Loop through all beats in the previous thread
      for (let i = 0; i < previousThreadBeatsCount; i++) {
        const beatIndex = previousThreadStartIndex + i;
        if (beatIndex >= 0 && beatIndex < player.beatHistory.length) {
          const beat = player.beatHistory[beatIndex];
          if (beat && beat.options && beat.choice !== undefined) {
            const resultText = beat.resolution
              ? ` Result: ${
                  beat.resolution.charAt(0).toUpperCase() +
                  beat.resolution.slice(1).toLowerCase()
                }.`
              : "";

            // Initialize the array for this beat if it doesn't exist
            if (!beatChoicesMap[i]) {
              beatChoicesMap[i] = [];
            }

            // Add this player's choice to the appropriate beat
            beatChoicesMap[i].push(
              `--- (${playerId}) chose "${
                beat.options[beat.choice].text
              }"${resultText}`
            );
          }
        }
      }
    }

    // Convert the map to the format we want
    for (let i = 0; i < previousThreadBeatsCount; i++) {
      if (beatChoicesMap[i] && beatChoicesMap[i].length > 0) {
        beatChoices.push(`- Beat ${i + 1}\n${beatChoicesMap[i].join("\n")}`);
      }
    }

    return beatChoices;
  }
}
