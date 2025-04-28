import { getThreadType, GameModes } from "core/types/index.js";
import type { Stat, StatValueEntry, Thread, Beat } from "core/types/index.js";
import { Story } from "core/models/Story.js";

export interface SectionConfig {
  gameMode?: boolean;
  guidelines?: boolean;
  storyElements?: boolean;
  worldFacts?: boolean;
  stats?: boolean;
  detailedStats?: boolean;
  outcomes?: boolean;
  imageLibrary?: boolean;
  players?: boolean;
  previousThreads?: boolean;
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
    if (sections.outcomes) {
      promptSections.push(this.createOutcomesSection(story));
    }
    if (sections.stats) {
      promptSections.push(
        this.createStatsSection(story, sections.detailedStats)
      );
    }
    if (sections.imageLibrary) {
      promptSections.push(this.createImageLibrarySection(story));
    }
    if (sections.players) {
      promptSections.push(this.createPlayersSection(story, sections));
    }
    if (sections.storyProgress) {
      promptSections.push(this.createStoryProgressSection(story));
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
    if (sections.switchConfiguration) {
      promptSections.push(this.getSwitchConfiguration(story, false));
    }
    if (sections.switchWithDecisionsConfiguration) {
      promptSections.push(this.getSwitchConfiguration(story, true));
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
    const guidelines = story.getGuidelines();
    return [
      "STORY GUIDELINES",
      guidelines.world ? `- World: ${guidelines.world}` : "",
      guidelines.rules ? `- Rules: ${guidelines.rules.join(", ")}` : "",
      guidelines.tone ? `- Tone: ${guidelines.tone.join(", ")}` : "",
      guidelines.conflicts
        ? `- Core conflicts: ${guidelines.conflicts.join(", ")}`
        : "",
      guidelines.decisions
        ? `- Types of decisions that players will make: ${guidelines.decisions.join(
            ", "
          )}`
        : "",
      guidelines.typesOfThreads
        ? `- Types of threads that should be considered for the story (if and when appropriate): ${guidelines.typesOfThreads.join(
            ", "
          )}`
        : "",
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

          const appearance = element.appearance
            ? `\nAppearance: ${element.appearance}`
            : "";

          return [
            `${element.name} (id: ${element.id})`,
            `Role: ${element.role}`,
            `Instructions: ${element.instructions}${appearance}${facts}`,
          ].join("\n");
        })
        .join("\n\n"),
      "",
    ].join("\n");
  }

  private static createImageLibrarySection(story: Story): string {
    if (!story.includesImages()) return "";

    let text = "IMAGE LIBRARY:";
    if (!story.hasImages()) {
      text += "No images yet.";
    } else {
      text += story
        .getImages()
        .map(
          (image) =>
            `- ${image.id} (${image.source})${
              image.description ? `: ${image.description}` : ""
            }`
        )
        .join("\n");
      text +=
        "\nFor images of player characters, use ids player1, player2, etc. and source ";
      if (story.isBasedOnTemplate()) {
        text += "template";
      } else {
        text += "story";
      }
    }

    return text;
  }

  private static formatStatValue(stat: { type?: string; value?: any }): string {
    if (!stat.type || stat.value === undefined) return "";

    switch (stat.type) {
      case "percentage":
        return `${stat.value}%`;
      case "opposite":
        return `${stat.value}|${100 - stat.value}`;
      case "string[]":
        return Array.isArray(stat.value) ? stat.value.join(", ") : stat.value;
      default:
        return stat.value;
    }
  }

  private static formatStatDisplay(
    stat: Stat,
    statValue: StatValueEntry | undefined,
    detailed: boolean = true
  ): string {
    const formattedValue = statValue
      ? this.formatStatValue({ type: stat.type, value: statValue.value })
      : "Values in player sections below";

    // Basic stat information
    const basicInfo = `- ${stat.name.toUpperCase()} (id: ${stat.id}, type: ${
      stat.type
    }): ${formattedValue}`;

    if (!detailed) {
      // Only include narrative implications for non-detailed view
      const narrativeImplications = stat.narrativeImplications?.length
        ? `\n${
            detailed ? "  - Narrative: " : ""
          }${stat.narrativeImplications.join(", ")}`
        : "";
      return basicInfo + narrativeImplications;
    }

    // Detailed stat information
    const visibility =
      stat.isVisible === false ? " (not visible to the player)" : "";
    const narrativeImplications = stat.narrativeImplications?.length
      ? `\n  - Narrative: ${stat.narrativeImplications.join(", ")}`
      : "";
    const effectOnPoints = stat.effectOnPoints?.length
      ? `\n  - Effects on challenge success: ${stat.effectOnPoints.join(", ")}`
      : "";
    const optionsToSacrifice =
      stat.optionsToSacrifice && stat.optionsToSacrifice !== "None"
        ? `\n  - As sacrifice: ${stat.optionsToSacrifice}`
        : "";
    const optionsToGainAsReward =
      stat.optionsToGainAsReward && stat.optionsToGainAsReward !== "None"
        ? `\n  - As a reward: ${stat.optionsToGainAsReward}`
        : "";
    const adjustmentsAfterThreads = stat.adjustmentsAfterThreads?.length
      ? `\n  - Adjustments after threads: ${stat.adjustmentsAfterThreads.join(
          ", "
        )}`
      : "";
    const canBeChangedInBeatResolutions = stat.canBeChangedInBeatResolutions
      ? `\n  - Can be adjusted anytime`
      : "\n  - Can only be changed when a thread gets resolved or through sacrifice/reward options";

    return `${basicInfo}${visibility}${narrativeImplications}${effectOnPoints}${optionsToSacrifice}${optionsToGainAsReward}${adjustmentsAfterThreads}${canBeChangedInBeatResolutions}`;
  }

  private static createOutcomesSection(story: Story): string {
    // Only display shared outcomes
    return [
      "SHARED OUTCOMES that will affect all players:",
      this.createOutcomesListSection(story.getSharedOutcomes()),
      "",
    ].join("\n");
  }

  private static createOutcomesListSection(outcomes: any[]): string {
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

  private static createPlayersSection(
    story: Story,
    sections?: SectionConfig
  ): string {
    const state = story.getState();

    return Object.entries(story.getPlayers())
      .map(([slot, playerState]) => {
        const beatHistorySection = this.createBeatHistorySection(
          playerState.beatHistory
        );
        const separator = "#####################################";

        const playerSections = [
          separator,
          `######## PLAYER ID: ${slot} ########`,
          separator,
          "",
          `${playerState.name} (${playerState.pronouns.personal}/${playerState.pronouns.possessive})`,
          playerState.appearance + " " + playerState.fluff,
          "",
        ];

        // Include previous thread types if requested
        if (sections?.previousThreads) {
          playerSections.push(
            "PREVIOUS THREAD TYPES (to be avoided for upcoming threads):\n- ",
            playerState.previousTypesOfThreads?.length
              ? playerState.previousTypesOfThreads.join("\n- ")
              : "None",
            ""
          );
        }

        // Only include character stats if the stats setting is true
        if (sections?.stats) {
          playerSections.push(
            "CHARACTER STAT VALUES:",
            playerState.statValues
              .map((statValue) => {
                const statDef = state.playerStats.find(
                  (s) => s.id === statValue.statId
                );
                if (!statDef)
                  return `- ${statValue.statId}: ${statValue.value} (definition not found)`;
                return `- ${statDef.name.toUpperCase()}: ${this.formatStatValue(
                  { type: statDef.type, value: statValue.value }
                )}`;
              })
              .join("\n"),
            ""
          );
        }

        // Only include outcomes if the setting is true
        if (sections?.outcomes) {
          playerSections.push(
            "OUTCOMES that will define this character's story ending:",
            this.createOutcomesListSection(playerState.outcomes),
            ""
          );
        }

        playerSections.push(
          "STORY ELEMENTS THAT THIS CHARACTER HAS BEEN INTRODUCED TO: ",
          playerState.knownStoryElements.join(", "),
          "",
          "BEAT HISTORY:",
          beatHistorySection
        );

        return playerSections.join("\n");
      })
      .join("\n\n" + "=".repeat(80) + "\n\n");
  }

  private static createBeatHistorySection(beatHistory: any[]): string {
    if (!beatHistory || beatHistory.length === 0) {
      return "No beats yet.";
    }

    return beatHistory
      .map((beat, index) => {
        const isLastBeat = index === beatHistory.length - 1;

        // Only show choice details for the last beat
        let choiceSection = "";
        if (isLastBeat && beat.choice !== undefined) {
          const choiceText = beat.options[beat.choice].text;

          // Add resource type indicator
          const resourceTypeIndicator =
            beat.options[beat.choice].resourceType !== "normal"
              ? ` [${beat.options[beat.choice].resourceType}]`
              : "";

          const resultText = beat.resolution
            ? ` (Result: ${
                beat.resolution.charAt(0).toUpperCase() +
                beat.resolution.slice(1).toLowerCase()
              })`
            : "";

          choiceSection = `\n  Chosen option: ${choiceText}${resourceTypeIndicator}${resultText}`;
        }

        return `- Beat ${index + 1}: ${beat.title}
  Summary: ${beat.summary}${choiceSection}`;
      })
      .join("\n");
  }

  private static createStoryProgressSection(story: Story): string {
    const turnsDone = story.getCurrentTurn();
    const turnsLeft = story.getMaxTurns() - turnsDone;
    return `\n======= STORY PROGRESS =======\n\nCurrent turn: ${
      turnsDone + 1
    }/${story.getMaxTurns()}\nTurns left (including this one): ${turnsLeft}\n`;
  }

  public static getSwitchConfiguration(
    story: Story,
    withDecisions: boolean
  ): string {
    const switchAnalysis = story.getCurrentSwitchAnalysis();
    if (!switchAnalysis) {
      console.log(
        "[StoryStatePromptService] ERROR: No switch analysis found for story " +
          story.getTitle()
      );
      return "";
    }

    const { switches, coordinationPatternSummary } = switchAnalysis;

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
            ? `\n- Outcome ID: ${singleSwitch.outcomeId}\n- Question: ${singleSwitch.question}`
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
      "======= CURRENT SWITCH CONFIGURATION =======",
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
      if (story.getCurrentTurn() === 0) {
        console.log(
          "[StoryStatePromptService] ERROR: No " +
            type +
            " thread analysis found"
        );
      }
      return "";
    }

    const { threads } = threadAnalysis;

    const threadConfigs = threads
      .map((thread: Thread) => {
        const threadType = getThreadType(thread);

        // Determine thread type
        let threadTypeString = getThreadType(thread).toUpperCase() + " THREAD";

        // Get the outcome that will receive a milestone
        let outcome = story.getOutcomeById(thread.outcomeId);
        if (!outcome) {
          console.log(
            "[StoryStatePromptService] ERROR: Outcome not found for thread " +
              thread.id
          );
        }
        const outcomeInfo = outcome
          ? `\nRelated Outcome: ${outcome.question} (${outcome.id})`
          : `\nRelated Outcome: Unknown (ID: ${thread.outcomeId})`;

        const milestonesSection =
          threadType === "exploration"
            ? [
                `Players: ${thread.playersSideA.join(", ")}`,
                outcomeInfo,
                `Possible milestones:`,
                `1. ${thread.possibleMilestones["resolution1"]}`,
                `2. ${thread.possibleMilestones["resolution2"]}`,
                `3. ${thread.possibleMilestones["resolution3"]}`,
              ].join("\n")
            : threadType === "contest"
            ? [
                `Side A (${thread.playersSideA.join(", ")})`,
                `Side B (${thread.playersSideB.join(", ")})`,
                outcomeInfo,
                `Possible milestones:`,
                `- If Side A wins: ${thread.possibleMilestones["sideAWins"]}`,
                `- Mixed result: ${thread.possibleMilestones["mixed"]}`,
                `- If Side B wins: ${thread.possibleMilestones["sideBWins"]}`,
              ].join("\n")
            : [
                `Players: ${thread.playersSideA.join(", ")}`,
                outcomeInfo,
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

    // Format the beat progression overview
    const beatProgressionOverview = this.formatBeatProgressionOverview(thread);

    // Switch prompts only need the last beat's text for each player
    if (lastBeatOnly) {
      const lastBeatIndex = thread.progression.length - 1;
      const playerTexts = this.formatPlayerBeatTexts(
        thread,
        story,
        lastBeatIndex,
        lastBeatIndex
      );
      return `${beatProgressionOverview}\n\nPREVIOUS BEAT TEXT:\n${playerTexts}`;
    }

    // For current threads, include all previous beat texts but only show special options for the last completed beat
    const playerBeatTexts = this.formatPlayerBeatTexts(
      thread,
      story,
      0,
      beatsCompleted - 1
    );

    // Combine the beat progression overview with the beat texts
    return `\nFor the remainder of this thread, don't offer any options that are similar to the ones that were already offered (both chosen and not chosen).\n\nBeat progression:\n${beatProgressionOverview}\n\n${playerBeatTexts}`;
  }

  /**
   * Format beat texts for all players in a thread
   * @param thread The thread to format beat texts for
   * @param story The story instance
   * @param startIndex The start index of beats to include
   * @param endIndex The end index of beats to include (inclusive)
   * @returns Formatted beat texts for all players
   */
  private static formatPlayerBeatTexts(
    thread: Thread,
    story: Story,
    startIndex: number,
    endIndex: number
  ): string {
    return [...thread.playersSideA, ...thread.playersSideB]
      .map((playerSlot) => {
        // Get the beat texts for this player from the player's beat history
        const threadBeatTexts = story.getThreadBeatTexts(thread);
        const playerBeats = threadBeatTexts[playerSlot] || [];
        const player = story.getPlayer(playerSlot);

        // Format each beat in the requested range
        const formattedBeats = playerBeats
          .slice(startIndex, endIndex + 1)
          .map((beatText, relativeIndex) => {
            const absoluteIndex = startIndex + relativeIndex;
            const beat = thread.progression[absoluteIndex];

            if (!beat) return "";

            const beatNumber = absoluteIndex + 1;
            const totalBeats = thread.duration;

            // Get the corresponding beat from the player's history
            const playerBeatIndex = thread.firstBeatIndex + absoluteIndex;
            const playerBeat = player?.beatHistory?.[playerBeatIndex];

            // List options, highlighting the chosen option
            let optionsText = "";
            if (beat.resolution !== null && playerBeat?.choice !== undefined) {
              optionsText = this.listBeatOptionsFromPastBeat(playerBeat);
            }

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

            return `Beat ${beatNumber}/${totalBeats}: ${beat.title}\n\n${
              beatText?.text || "No text available"
            }\n\n${
              optionsText ? optionsText + "\n" : ""
            }RESOLUTION: ${resolution.toUpperCase()}. ${resolutionDescription}`;
          })
          .join("\n\n");

        return `BEAT TEXTS for ${playerSlot}:\n${formattedBeats}`;
      })
      .join("\n\n");
  }

  /**
   * Returns a list of all options from a past beat, highlighting the chosen option
   * @param beat The player's beat
   * @returns Formatted list of all options from a past beat, highlighting the chosen option
   */
  private static listBeatOptionsFromPastBeat(beat: Beat): string {
    if (beat.choice === undefined || !beat.options) return "";

    const chosenOption = beat.options[beat.choice];
    if (!chosenOption) return "";

    const resourceType =
      chosenOption.resourceType !== "normal"
        ? `[${chosenOption.resourceType.toUpperCase()}] `
        : "";

    // Start with the chosen option
    const result = [`CHOSEN OPTION: ${resourceType}${chosenOption.text}`];
    result.push("NOT CHOSEN:");

    // Add non-chosen options
    beat.options.forEach((option, index) => {
      if (index !== beat.choice) {
        result.push(`- ${option.text}`);
      }
    });

    return result.join("\n");
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

  private static createStatsSection(
    story: Story,
    detailed: boolean = true
  ): string {
    const state = story.getState();
    const sharedStats = story.getSharedStats();
    const sharedStatValues = state.sharedStatValues;
    const playerStats = state.playerStats;

    const sections: string[] = [];

    // Shared stats with values
    sections.push(
      "SHARED STATS:",
      sharedStats
        .map((stat) => {
          const statValue = sharedStatValues.find(
            (sv) => sv.statId === stat.id
          );
          return this.formatStatDisplay(stat, statValue, detailed);
        })
        .join("\n\n"),
      ""
    );

    // Player stat definitions (without values)
    sections.push(
      "PLAYER STAT DEFINITIONS:",
      playerStats
        .map((stat) => this.formatStatDisplay(stat, undefined, detailed))
        .join("\n\n"),
      ""
    );

    return sections.join("\n");
  }
}
