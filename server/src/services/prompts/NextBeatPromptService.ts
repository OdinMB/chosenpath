import { type StoryState, GameModes } from "../../../../shared/types/story.js";

export class StoryPromptService {
  static createBeatPrompt(state: StoryState): string {
    const playersSection = this.createPlayersSection(state);
    const prompt = [
      "======= CURRENT GAME STATE =======",
      "",
      this.createGameModeSection(state),
      this.createGuidelinesSection(state),
      this.createStoryElementsSection(state),
      this.createWorldFactsSection(state),
      this.createSharedStatsSection(state),
      this.createImageLibrarySection(state),
      playersSection,
      "",
      `STORY PROGRESS: Turn: ${
        Object.values(state.players)[0].beatHistory.length + 1
      }/${state.maxTurns}`,
      "",
    ].join("\n");

    console.log(prompt);

    return prompt + this.createInstructionsSection();
  }

  private static createInstructionsSection(): string {
    return `======= YOUR JOB: IDENTIFY CHANGES TO THE STORY STATE AND GENERATE THE NEXT SET OF STORY BEATS =======

1. Changes to the story state: statChanges based on players' decisions in the last beat

Guidelines
- Include changes to the shared stats and the character stats of each player.
- Consider the current value of stats to decide outcomes. For example, if a player character tries to be stealthy, but the character traits indicate more of a brute force approach, the character should fail.
- If this is the first set of beats, there should be no changes. Just return an empty list.

2. One story beat for each player

How beats work:
- Players have separate beat histories. No player can see the beats of other players.
- Each beat must flow naturally from the previous beat OF THAT PLAYER.
- If several players encounter something new, you must introduce the new information to all players separately.
- No player can see the decisions of other players. If a player made a decision in the previous beat that affects other players, you must introduce the information to the other players separately.
- Beats for one turn are presented to players at the same time.
- Make sure that the options you give a player in one beat does not contradict any of the options that you gave to other players in the same turn.

For each beat, lay out a detailed plan covering the following points:

a) Developments to narrate
- Create a bullet list of all players' decisions in the last beat and the statChanges you just applied as a result.
- For each item: mention how we should narrate the item to this player (if at all).
- If a player chose to perform an action in the last beat, mention what happened as a result of that action (even if you then switch scenes).
- There should always be clear narrative feedback for players' decisions.
- This step is irrelevant if this is the first beat of the story.

b) Which information from other beats in this turn do we need to consider for this beat?
- Create a bullet list of things that happened other beats in this turn that we should consider for this beat (or even repeat if the player is in the same scene).
--- If the player is in the same scene as other player(s) whose beat you created before, copy those beats here in their entirety (to make sure that the details are consistent).
- Create a bullet list of options that you included in the other beats of this turn so far that we mustn't contradict with the options for this beat?

c) Should we continue the scene or thread of the previous beat or start a new one?
- In your plan, mark down the number of beats that the player has spent in the current scene.
- In most cases, it should take 2-3 beats to establish a milestone toward an outcome's resolution.
- In most cases, players should not spend more than 3 beats in a scene (4 if it's a showdown of some kind).
- If you added the final milestone to an outcome (number of milestones equals intended number of milestones), the outcome is resolved. Use this beat to describe the outcome, its aftermath, and give the resolution some gravity.

d) How should we make progress towards unresolved story outcomes?
- For outcomes without milestones: Consider introducing the outcome through NPCs, events, or initial discoveries.
- For outcomes with milestones: What are options for the next milestone to move the outcome closer to resolution?
Consider how many beats are still to play and how many milestones are still left to bring the outcome from its current status to a resolution.
In the first beat, introduce the core premise, what the player represents in the story, and what this whole story is all about.

e) How should we flesh out the game world to make it more immersive?
- Check if you should add a new story element to the story state.
--- Do this whenever a new element is introduced that is likely to be used in later beats.
--- In most beats, you don't have to add a new story element.
--- While NPCs and locations are the most common elements to add, you can also add items, organizations, mysteries, conflicts, rumors, projects, etc.
- For existing story elements, use newFact to add new details about them.
--- Only mention NEW information that is not yet recorded in the story state.
--- Try to link new facts to story elements (using their id). Only use 'world' if the fact doesn't fit anywhere else.
--- Aim for adding 3 or more new facts per beat. These are the details that make the world come to life. By recording them, we ensure consistency in future beats.
--- Example categories for new facts: appearance (NPCs, items), history (NPCs, locations), quirks (NPCs), functionality (items), interactions (NPCs, locations), mood (locations), etc.
--- Don't add facts for new story elements that you just created.
- The players' decisions are tracked separately and don't have to be tracked.

f) How can we reinforce the story's key conflicts and focused types of decisions?

Beat text
- The first paragraph should continue exactly where the previous beat for this player ended and describe the immediate consequences of the player's decision.
--- The goal is create a natural flow from one beat to the next.
--- Don't reintroduce the scene or situation if that has already happened. Just continue the story.
--- Sometimes, this can be as simple as "You leave X and go to Y."
- Never just mention the player's options. They will be listed in the options sections later.
--- Bad: "The path before you is fraught with choices ..."
--- Bad: "Will you seek X, or will you seek Y?"
--- Bad: "You must decide: ..."
--- Good: Just write a strong beat that pushes the story forward and then mention the options in the options section.

3. Options

- Offer 3 options.
--- 2 can be fine occassionally if you want to force a clear or quick 'left vs. right' kind of choice.
- Be specific and action-oriented.
--- Bad: 'Investigate the artifact'. Good: 'Search the library for clues about the artifact'
--- Bad: 'Confront X physically'. Good: 'Punsh X in the face'.
- Make sure that options allow the story to flow naturally.
--- If the beat ends in the middle of a scene, the player shouldn't be able to just vanish from that scene.
- Stay true to the story's key conflicts and types of decisions that we want players to make`;
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
            `Beat ${index + 1} (previous beat) - full text for continuity:`,
            beat.text,
            chosenOption ? `Player choice: ${chosenOption}` : "",
          ]
            .filter(Boolean)
            .join("\n\n");
        }

        return `Beat ${index + 1}: ${beat.summary}`;
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
        return [
          `id: ${outcome.id}`,
          outcome.question,
          `Possible outcomes: ${outcome.possibleOutcomes.join(" | ")}`,
          `Milestones (${outcome.milestones.length} / ${outcome.intendedNumberOfMilestones} to resolution):`,
          outcome.milestones
            .map((milestone: string) => `- ${milestone}`)
            .join("\n"),
        ].join("\n");
      })
      .join("\n\n");
  }
}
