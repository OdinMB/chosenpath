import { GameModes } from "shared/types/story.js";
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

export class StoryStatePromptService {
  static createStoryStatePrompt(story: Story, sections: SectionConfig): string {
    const promptSections: string[] = [];

    if (sections.gameMode) {
      promptSections.push(this.createGameModeSection(story));
    }
    if (sections.guidelines) {
      promptSections.push(this.createGuidelinesSection(story));
    }
    if (sections.storyElements) {
      promptSections.push(this.createStoryElementsSection(story));
    }
    if (sections.worldFacts) {
      promptSections.push(this.createWorldFactsSection(story));
    }
    if (sections.sharedOutcomes) {
      promptSections.push(this.createSharedOutcomesSection(story));
    }
    if (sections.sharedStats) {
      promptSections.push(this.createSharedStatsSection(story));
    }
    if (sections.imageLibrary) {
      promptSections.push(this.createImageLibrarySection(story));
    }
    if (sections.players) {
      promptSections.push(this.createPlayersSection(story));
    }
    if (sections.storyProgress) {
      promptSections.push(this.createStoryProgressSection(story));
    }
    if (sections.switchConfiguration) {
      promptSections.push(this.getSwitchConfiguration(story));
    }
    if (sections.threadConfiguration) {
      promptSections.push(
        this.createThreadConfigurationSection("current", story) +
          `\n\nCURRENT THREAD PROGRESSION: Turn ${
            story.getCurrentThreadBeatsCompleted() + 1
          }/${story.getCurrentThreadDuration()}\n`
      );
    }
    if (sections.previousThreadConfiguration) {
      promptSections.push(
        this.createThreadConfigurationSection("previous", story)
      );
    }

    return promptSections.filter(Boolean).join("\n");
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

        // Add thread resolution and milestone if available
        const threadResolutionSection = thread.resolution
          ? [
              `\nThread Resolution: ${
                thread.resolution.charAt(0).toUpperCase() +
                thread.resolution.slice(1)
              }`,
              thread.milestone ? `Milestone: ${thread.milestone}` : "",
            ]
              .filter(Boolean)
              .join("\n")
          : "";

        // Get beat choices for this thread
        const beatProgressionItems = this.formatBeatProgression(thread, type);

        return [
          `==== THREAD: ${thread.title} (${thread.id}) ====`,
          isContested
            ? "Contested thread between:"
            : hasExploratoryMilestones
            ? "Exploratory thread:"
            : "",
          milestonesSection,
          threadResolutionSection,
          type === "current" ? `\nBeat progression` : "",
          beatProgressionItems,
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n\n" + "-".repeat(40) + "\n\n");

    return `\n======= ${type.toUpperCase()} THREAD CONFIGURATION =======\n\n${threadConfigs}`;
  }

  private static formatBeatProgression(
    thread: any,
    type: "current" | "previous"
  ): string {
    const beatsCompleted = thread.progression.filter(
      (beat: any) => beat.resolution !== null
    ).length;

    if (!thread.progression || thread.progression.length === 0) {
      return "";
    }

    // Format each beat in the progression
    return thread.progression
      .map((beat: any, index: number) => {
        const beatNumber = index + 1;
        const totalBeats = thread.duration;
        const beatLabel = `Beat ${beatNumber}/${totalBeats}`;

        // Determine if this is the current or previous beat
        let beatStatus = "";
        if (type === "current") {
          if (index === beatsCompleted) {
            beatStatus = " (CURRENT BEAT)";
          } else if (index === beatsCompleted - 1) {
            beatStatus = " (PREVIOUS BEAT)";
          }
        }

        // Get resolution text if available
        const resolutionText = beat.resolution
          ? `Resolution: ${
              beat.resolution.charAt(0).toUpperCase() + beat.resolution.slice(1)
            }.`
          : "";

        // For completed beats, include the resolution description if available
        let resolutionDescription = "";
        if (
          beat.resolution &&
          beat.possibleResolutions &&
          beat.resolution in beat.possibleResolutions
        ) {
          resolutionDescription = ` ${
            beat.possibleResolutions[beat.resolution]
          }`;
        }

        // For the current beat, show possible outcomes
        let outcomesSection = "";
        if (type === "current" && index === beatsCompleted) {
          const hasContestedOutcomes = "sideAWins" in beat.possibleResolutions;
          const hasStandardOutcomes = "favorable" in beat.possibleResolutions;
          const hasExploratoryOutcomes =
            "resolution1" in beat.possibleResolutions;

          let outcomes: string[] = [];

          if (hasContestedOutcomes) {
            outcomes = [
              `- If Side A wins: ${beat.possibleResolutions["sideAWins"]}`,
              `- Mixed result: ${beat.possibleResolutions["mixed"]}`,
              `- If Side B wins: ${beat.possibleResolutions["sideBWins"]}`,
            ];
          } else if (hasStandardOutcomes) {
            outcomes = [
              `- Favorable: ${beat.possibleResolutions["favorable"]}`,
              `- Mixed: ${beat.possibleResolutions["mixed"]}`,
              `- Unfavorable: ${beat.possibleResolutions["unfavorable"]}`,
            ];
          } else if (hasExploratoryOutcomes) {
            outcomes = [
              `- Option 1: ${beat.possibleResolutions["resolution1"]}`,
              `- Option 2: ${beat.possibleResolutions["resolution2"]}`,
              `- Option 3: ${beat.possibleResolutions["resolution3"]}`,
            ];
          }

          if (outcomes.length > 0) {
            outcomesSection = `\nPossible outcomes:\n${outcomes.join("\n")}`;
          }
        }

        // Combine all parts
        return [
          `- ${beatLabel}${beatStatus}: ${beat.title}`,
          `Question: ${beat.question}`,
          resolutionText ? `${resolutionText}${resolutionDescription}` : "",
          outcomesSection,
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n");
  }
}
