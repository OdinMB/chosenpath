import { GameModes } from "shared/types/story.js";
import { Story } from "../Story.js";
import { Thread } from "shared/types/thread.js";
import { getThreadType } from "shared/types/thread.js";
import { Stat } from "shared/types/stat.js";

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
  switchWithDecisionsConfiguration?: boolean;
  threadConfigurationForSwitches?: boolean;
  threadConfigurationForThreadBeats?: boolean;
  threadConfigurationForSwitchBeats?: boolean;
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
      promptSections.push(
        [
          "SHARED STATS:",
          story
            .getSharedStats()
            .map((stat) => this.formatStatDisplay(stat))
            .join("\n"),
          "",
        ].join("\n")
      );
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
      promptSections.push(this.getSwitchConfiguration(story, false));
    }
    if (sections.switchWithDecisionsConfiguration) {
      promptSections.push(this.getSwitchConfiguration(story, true));
    }
    if (sections.threadConfigurationForThreadBeats) {
      promptSections.push(
        this.createThreadConfigurationSection("current", false, story) +
          `\n\nCURRENT STEP IN THREAD PROGRESSION: Turn ${
            story.getCurrentThreadBeatsCompleted() + 1
          }/${story.getCurrentThreadDuration()}\n`
      );
    }
    if (sections.threadConfigurationForSwitchBeats) {
      promptSections.push(
        this.createThreadConfigurationSection("previous", true, story)
      );
    }
    if (sections.threadConfigurationForSwitches) {
      promptSections.push(
        this.createThreadConfigurationSection("current", true, story)
      );
    }

    return promptSections.filter(Boolean).join("\n");
  }

  private static createGameModeSection(story: Story): string {
    if (!story.isMultiplayer()) return "";

    const modeDescriptions: Record<GameModes, string> = {
      [GameModes.Competitive]:
        "Players are competing against each other with conflicting goals and interests. The shared outcomes do not include any shared goals.",
      [GameModes.Cooperative]:
        "Players are cooperating with shared goals that require collaboration. They do not have individual goals that can interfere with shared goals.",
      [GameModes.CooperativeCompetitive]:
        "Shared outcomes include shared goals requiring collaboration between players, but players also have individual goals that are competitive with each other or conflicting with shared goals.",
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

  private static formatStatDisplay(stat: Stat): string {
    const formattedValue = this.formatStatValue(stat);
    const visibility =
      stat.isVisible === false ? " (not visible to the player)" : "";
    const narrativeImplications = stat.narrativeImplications?.length
      ? `\nNarrative: ${stat.narrativeImplications.join(", ")}`
      : "";
    const effectOnPoints = stat.effectOnPoints?.length
      ? `\nChallenges: ${stat.effectOnPoints.join(", ")}`
      : "";
    const optionsToSacrifice = stat.optionsToSacrifice
      ? `\nAs sacrifice: ${stat.optionsToSacrifice}`
      : "";
    const optionsToGainAsReward = stat.optionsToGainAsReward
      ? `\nAs reward: ${stat.optionsToGainAsReward}`
      : "";
    const adjustmentsAfterThreads = stat.adjustmentsAfterThreads?.length
      ? `\nAdjustments after threads: ${stat.adjustmentsAfterThreads.join(
          ", "
        )}`
      : "";

    return `- ${stat.name} (id: ${stat.id}, type: ${stat.type}): ${formattedValue}${visibility}${narrativeImplications}${effectOnPoints}${optionsToSacrifice}${optionsToGainAsReward}${adjustmentsAfterThreads}`;
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
          playerState.characterStats
            .map((stat) => this.formatStatDisplay(stat))
            .join("\n"),
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

  public static getSwitchConfiguration(
    story: Story,
    withDecisions: boolean
  ): string {
    if (!story.getCurrentSwitchAnalysis()) {
      return "";
    }

    const { switches, coordinationPatternSummary } =
      story.getCurrentSwitchAnalysis();

    // Get player decisions if needed
    const playerDecisionsSection = withDecisions
      ? [
          "\nPLAYER DECISIONS:",
          story
            .getPlayerSlots()
            .map((slot) => {
              const lastBeat = story.getCurrentBeat(slot);
              const choice =
                lastBeat?.options?.[lastBeat?.choice]?.text ||
                "No decision made";
              return `${slot}: ${choice}`;
            })
            .join("\n"),
        ].join("\n")
      : "";

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

        // Only add beat texts if we're showing decisions (meaning we're past the switch phase)
        let beatTextSection = "";
        if (withDecisions) {
          const switchBeatTexts = singleSwitch.players
            .map((playerSlot) => {
              const playerBeat = story.getCurrentBeat(playerSlot);
              const beatText = playerBeat?.text || "No text available";
              return `Player ${playerSlot}:\n${beatText}`;
            })
            .join("\n\n");

          beatTextSection = "\n\nBEAT TEXT:\n" + switchBeatTexts;
        }

        return (
          baseLine + flavorLine + topicLine + relationshipLine + beatTextSection
        );
      })
      .join("\n\n");

    return [
      "CURRENT SWITCH CONFIGURATION:",
      coordinationPatternSummary,
      "\nConfiguration:",
      switchConfigs,
      playerDecisionsSection,
    ].join("\n");
  }

  private static createThreadConfigurationSection(
    type: "current" | "previous",
    lastBeatOnly: boolean,
    story: Story
  ): string {
    let threadAnalysis;
    if (type === "current") {
      threadAnalysis = story.getCurrentThreadAnalysis();
    } else {
      threadAnalysis = story.getPreviousThreadAnalysis();
    }

    if (!threadAnalysis) {
      console.log(
        "[StoryStatePromptService] ERROR: No " + type + " thread analysis found"
      );
      return "";
    }

    const { threads } = threadAnalysis;

    const threadConfigs = threads
      .map((thread: Thread) => {
        const threadType = getThreadType(thread);

        // Determine thread type
        let threadTypeString = getThreadType(thread).toUpperCase() + " THREAD";

        // Get the outcome that will receive a milestone
        const outcome = story.getOutcomeById(thread.outcomeId);

        const milestonesSection =
          threadType === "exploration"
            ? [
                `Players: ${thread.playersSideA.join(", ")}`,
                `\nRelated Outcome: ${outcome.question} (${outcome.id})`,
                `Possible milestones:`,
                `- Option 1: ${thread.possibleMilestones["resolution1"]}`,
                `- Option 2: ${thread.possibleMilestones["resolution2"]}`,
                `- Option 3: ${thread.possibleMilestones["resolution3"]}`,
              ].join("\n")
            : threadType === "contest"
            ? [
                `Side A (${thread.playersSideA.join(", ")})`,
                `Side B (${thread.playersSideB.join(", ")})`,
                `\nRelated Outcome: ${outcome.question} (${outcome.id})`,
                `Possible milestones:`,
                `- If Side A wins: ${thread.possibleMilestones["sideAWins"]}`,
                `- Mixed result: ${thread.possibleMilestones["mixed"]}`,
                `- If Side B wins: ${thread.possibleMilestones["sideBWins"]}`,
              ].join("\n")
            : [
                `Players: ${thread.playersSideA.join(", ")}`,
                `\nRelated Outcome: ${outcome.question} (${outcome.id})`,
                `Possible milestones:`,
                `- Favorable: ${thread.possibleMilestones["favorable"]}`,
                `- Mixed: ${thread.possibleMilestones["mixed"]}`,
                `- Unfavorable: ${thread.possibleMilestones["unfavorable"]}`,
              ].join("\n");

        // Add thread resolution and milestone if available
        const threadResolutionSection = thread.resolution
          ? [
              `\nThread Resolution: ${thread.resolution.toUpperCase()}`,
              thread.milestone ? `Milestone: ${thread.milestone}\n` : "",
            ]
              .filter(Boolean)
              .join("\n")
          : "";

        // Get beat choices for this thread
        const beatProgressionItems = this.formatBeatProgression(
          thread,
          lastBeatOnly,
          story
        );

        return [
          `==== ${threadTypeString}: ${thread.title} (${thread.id}) ====`,
          milestonesSection,
          threadResolutionSection,
          beatProgressionItems,
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n\n" + "-".repeat(40) + "\n\n");

    return `\n======= ${type.toUpperCase()} THREAD CONFIGURATION =======\n\n${threadConfigs}`;
  }

  private static formatBeatProgression(
    thread: Thread,
    lastBeatOnly: boolean,
    story: Story
  ): string {
    const beatsCompleted = thread.progression.filter(
      (beat) => beat.resolution !== null
    ).length;

    if (!thread.progression || thread.progression.length === 0) {
      return "";
    }

    // Switch prompts only need the last beat's text for each player
    if (lastBeatOnly) {
      const lastBeatIndex = thread.progression.length - 1;

      // Format the last beat with its text for each player
      const playerTexts = [...thread.playersSideA, ...thread.playersSideB]
        .map((playerSlot) => {
          // Get the beat text for this player from the player's beat history
          const threadBeatTexts = story.getThreadBeatTexts(thread);
          const playerBeats = threadBeatTexts[playerSlot] || [];
          const lastBeatText =
            playerBeats[lastBeatIndex]?.text || "No text available";

          return `Player ${playerSlot}:\n${lastBeatText}`;
        })
        .join("\n\n");

      // Format the beat progression as before
      const beatProgressionItems = this.formatBeatProgressionOverview(thread);

      // Combine the beat progression with the last beat text
      return `${beatProgressionItems}\n\PREVIOUS BEAT TEXT:\n${playerTexts}`;
    }

    // For current threads, include all previous beat texts and player choices
    const playerBeatTexts = [...thread.playersSideA, ...thread.playersSideB]
      .map((playerSlot) => {
        // Get the beat texts for this player from the player's beat history
        const threadBeatTexts = story.getThreadBeatTexts(thread);
        const playerBeats = threadBeatTexts[playerSlot] || [];

        // Only include completed beats
        const completedBeats = thread.progression
          .slice(0, beatsCompleted)
          .map((beat, index) => {
            const beatNumber = index + 1;
            const totalBeats = thread.duration;
            const beatText = playerBeats[index]?.text || "No text available";

            const resolution = beat.resolution
              ? `${
                  beat.resolution.charAt(0).toUpperCase() +
                  beat.resolution.slice(1)
                }`
              : "No resolution";

            const resolutionDescription =
              beat.resolution &&
              beat.possibleResolutions &&
              beat.resolution in beat.possibleResolutions
                ? beat.possibleResolutions[beat.resolution]
                : "";

            return `Beat ${beatNumber}/${totalBeats}: ${
              beat.title
            }\n\n${beatText}\n\nResolution: ${resolution.toUpperCase()}. ${resolutionDescription}`;
          })
          .join("\n\n");

        return `BEAT TEXTS for Player ${playerSlot}:\n${completedBeats}`;
      })
      .join("\n\n");

    // Format the beat progression overview (simplified to only show overall resolutions)
    const beatProgressionOverview = this.formatBeatProgressionOverview(thread);

    // Combine the beat progression overview with the beat texts
    return `\nBeat progression:\n${beatProgressionOverview}\n\n${playerBeatTexts}`;
  }

  /**
   * Helper method to format the beat progression overview
   * Extracted to reduce code duplication between current and previous thread formatting
   */
  private static formatBeatProgressionOverview(thread: Thread): string {
    const beatsCompleted = thread.progression.filter(
      (beat) => beat.resolution !== null
    ).length;

    return thread.progression
      .map((beat, index) => {
        const beatNumber = index + 1;
        const totalBeats = thread.duration;
        const beatLabel = `Beat ${beatNumber}/${totalBeats}`;

        // Determine if this is the current or previous beat
        let beatStatus = "";
        if (index === beatsCompleted) {
          beatStatus = " (CURRENT BEAT)";
        } else if (index === beatsCompleted - 1) {
          beatStatus = " (PREVIOUS BEAT)";
        }

        // Get resolution text if available
        const resolutionText = beat.resolution
          ? `  Resolution: ${beat.resolution.toUpperCase()}.`
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
        if (index === beatsCompleted) {
          const hasContestedOutcomes = "sideAWins" in beat.possibleResolutions;
          const hasStandardOutcomes = "favorable" in beat.possibleResolutions;
          const hasExploratoryOutcomes =
            "resolution1" in beat.possibleResolutions;

          let outcomes: string[] = [];

          if (hasContestedOutcomes) {
            outcomes = [
              `  - If Side A wins: ${beat.possibleResolutions["sideAWins"]}`,
              `  - Mixed result: ${beat.possibleResolutions["mixed"]}`,
              `  - If Side B wins: ${beat.possibleResolutions["sideBWins"]}`,
            ];
          } else if (hasStandardOutcomes) {
            outcomes = [
              `  - Favorable: ${beat.possibleResolutions["favorable"]}`,
              `  - Mixed: ${beat.possibleResolutions["mixed"]}`,
              `  - Unfavorable: ${beat.possibleResolutions["unfavorable"]}`,
            ];
          } else if (hasExploratoryOutcomes) {
            outcomes = [
              `  - Resolution 1: ${beat.possibleResolutions["resolution1"]}`,
              `  - Resolution 2: ${beat.possibleResolutions["resolution2"]}`,
              `  - Resolution 3: ${beat.possibleResolutions["resolution3"]}`,
            ];
          }

          if (outcomes.length > 0) {
            outcomesSection = `  Possible outcomes:\n${outcomes.join("\n")}`;
          }
        }

        // Combine all parts
        return [
          `- ${beatLabel}${beatStatus}: ${beat.title}`,
          `  Question: ${beat.question}`,
          resolutionText ? `${resolutionText}${resolutionDescription}` : "",
          outcomesSection,
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n");
  }
}
