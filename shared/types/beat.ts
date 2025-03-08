import { z } from "zod";
import { PlayerCount } from "./player.js";
import {
  type Change,
  newFactSchema,
  statChangeSchema,
  newStoryElementSchema,
  addIntroductionOfStoryElementSchema,
  newMilestoneSchema,
} from "./change.js";
import { Resolution } from "./thread.js";

export const OPTION_TYPES = ["normal", "safe", "risky"] as const;
export type OptionType = (typeof OPTION_TYPES)[number];

const optionExplorationSchema = z
  .object({
    optionType: z.literal("exploration"),
    text: z.string().describe("Text shown to player for this choice"),
    statConsequences: z
      .string()
      .describe(
        "Instructions for the AI on how to adjust stats just for activating this option. Examples: uses 10 mana, uses a bullet, adjusts logic/empathy toward logic, loses an item, etc. Only describe what choosing this option entails immediately. Don't include the results of the player's choice. (That will be processed later.)"
      ),
  })
  .describe(
    "Exploration options. Choose this type for switches and exploratory threads (that don't follow a success/failure or win/lose pattern pattern)"
  );

const optionChallengeSchema = z
  .object({
    optionType: z.literal("challenge"),
    text: z.string().describe("Text shown to player for this choice"),
    statConsequences: z
      .string()
      .describe(
        "Instructions for the AI on how to adjust individual or shared stats for activating this option. Examples: uses 10 mana (if players have mana for casting spells), uses a bullet (in games where bullets are scarce and tracked by a stat), adjusts logic/empathy toward logic (if that's a player stat). Don't include the results of the player's choice. (Those will be processed later.)"
      ),
    riskType: z
      .enum(OPTION_TYPES)
      .describe(
        "How this option skews the probability distribution. Risky means more extreme outcomes. Safe means more mixed and fewer unfavorable outcomes."
      ),
    basePoints: z
      .number()
      .describe(
        "Base points for this option (+25 to -25) depending on how much sense this option makes for achieving a favorable result / winning the contest."
      ),
    modifiers: z
      .array(
        z
          .object({
            stat: z.string().describe("Stat and why it affects the points"),
            effect: z
              .number()
              .describe(
                "How this stat affects the points. +20 to -20 for minor influences, +40 to -40 for major influences."
              ),
          })
          .describe(
            "Stat and how they affect the points of this option. Example: 'player1_charisma is 70/100, indicating that they are good at wooing [npc]' => +20)"
          )
      )
      .describe(
        "Individual and shared stats that affect how many points this options adds or substracts from the favorable/mixed/unfavorable probability distribution. List the 1-2 most relevant stats and their effects on the chances of success. (The stats you mention here don't change. They just influence how likely it is that this option leads to success.)"
      ),
  })
  .describe(
    "Challenge options. Choose this type for Challenge and Contest threads (with a success/failure or win/lose pattern)"
  );

export const beatTypeSchema = z.enum(["intro", "switch", "thread", "ending"]);

export const beatPlanSchema = z.object({
  developmentsToNarrate: z
    .string()
    .describe(
      "Bullet list with changes to the story state and the decisions of other players (if relevant) and how we should narrate them to this player. Ignore this if this is the first beat (no changes yet)."
    ),
  beatTypeConsiderations: z
    .string()
    .describe(
      "Considerations based on the current switch/thread that this beat is implementing. For threads: mention the step in the thread progression that this beat is supposed to implement."
    ),
  otherBeats: z
    .string()
    .describe(
      "For multiplayer games: Bullet list with specific facts and events that occurred in other beats for this turn that you created before this one and that we must consider for this beat. This is important for consistency. In single-player games, say 'single-player'. In multiplayer games, if this is the beat for player1, say 'player1'."
    ),
  worldBuilding: z
    .string()
    .describe(
      "Decide how you want to flesh out the game world to make it more immersive. List new story elements that you want to add to the story state. Check if you should add a new story element to the story state that are likely to be used in later beats. List new details about existing story elements that you want to introduce in this beat. Don't create duplicate story elements or facts."
    ),
  newGameElements: z
    .array(newStoryElementSchema)
    .describe(
      "List of new story elements to add to the story state. Leave this empty if no new story elements are to be created in this beat. Only use this if a new story element is to be created in this beat that is likely to be used in later beats."
    ),
  newIntroductionsOfStoryElements: z
    .array(addIntroductionOfStoryElementSchema)
    .describe(
      "List of story elements that are going to be introduced to the player in this beat for the first time. Leave this empty if the player doesn't encounter any new story elements."
    ),
  establishedFacts: z
    .array(newFactSchema)
    .describe(
      "List of facts about existing story elements that this beat is going to establish. Include every new detail about NPCs, locations, important item, rumor, mystery, etc. If you want to add a fact to a story element that isn't registered yet, chances are that you should create it. Use 'world' as the story element if you want to add a fact that doesn't belong to any specific story element."
    ),
  optionConsiderations: z
    .union([
      z
        .string()
        .describe(
          "Simple string response for special cases. Use 'as in the topic switch configuration' for topic switches or 'ending' for the ending."
        ),
      z.object({
        keyConflictsAndDecisions: z
          .string()
          .describe(
            "How to reinforce the story's key conflicts and focused types of decisions?"
          ),
        statsAffectingOptions: z
          .string()
          .describe(
            "Which stats (both individual and shared) should affect the design of the options and how?"
          ),
        phaseRequirements: z
          .string()
          .describe(
            "What are the requirements from the current switch/thread configuration?"
          ),
        multiplayerCoordination: z
          .string()
          .describe(
            "In multiplayer games: If several players are on the same side, how do you ensure that their options are a) different from each other, b) consistent, and c) coordinated with each other? Spell out how exactly you ensure that no combination of choices leads to inconsistencies in the story. Example: [player name] will lead the neogiation, while [player name 2] will be offered supporting actions."
          ),
      }),
    ])
    .describe(
      "Considerations for designing the options for this beat. Can be either a detailed object with considerations or a simple string for special cases like 'as in the topic switch configuration' or 'ending'."
    ),
});

export const beatGenerationSchema = z.object({
  plan: beatPlanSchema,
  title: z
    .string()
    .describe(
      "If a switch: [title of the switch]. If part of a thread: '[title for the thread] ([current beat number within the thread]/[total number of beats in the thread])'. If it's the ending, simple 'The End'."
    ),
  text: z
    .string()
    .describe(
      "Main narrative text for this player.\n" +
        "- Write 5-6 paragraphs.\n" +
        "- Use present tense.\n" +
        "- Start exactly where the previous beat for this player ended.\n" +
        "- Describe the player's actions and the following events. Don't skip over actions or events. Example: If the player decided to organize a vote, describe how the vote is conducted and what the outcome is.\n" +
        "- Address the player character directly ('You' instead of the name of the character).\n" +
        "- NEVER introduce, talk about, or even hint at the player's options in the beat text.\n" +
        "- AVOID all of these and similar formulations: 'The path before you ...', 'Will you do X, or will you do Y?', 'You must decide: ...', 'You weigh your options', 'The complexity of your decision ...'\n" +
        "- You can use markdown for formatting."
    ),
  summary: z
    .string()
    .describe(
      "One-sentence summary of the beat. Don't include the options for this beat. The purpose is to provide context for future beat generations, so be specific! Bad: '[player name] gets a cryptiv hint from [npc]'. Good: '[npc] tells [player name] that [specific thing]'."
    ),
  imageId: z
    .string()
    .describe(
      "Id of an image from the existing list of images. Leave empty if no image is available or fitting. Leave empty if you want the game app to generate a new image for this beat."
    ),
  options: z
    .array(
      z.discriminatedUnion("optionType", [
        optionExplorationSchema,
        optionChallengeSchema,
      ])
    )
    .describe(
      "3 choices for the player. Don't allow the player to leave the scene, suddenly do something else, or derail the core theme of the switch/thread. Only mention the action/decision of the player, not the consequences."
    ),
});

export const createSetOfBeatGenerationSchema = (
  playerCount: PlayerCount,
  canAddMilestones: boolean = false
) => {
  const beatSchemas = Object.fromEntries(
    Array.from({ length: playerCount }, (_, i) => [
      `player${i + 1}`,
      beatGenerationSchema,
    ])
  ) as Record<`player${number}`, typeof beatGenerationSchema>;

  const baseSchema = {
    statsAffectingDecisionConsequences: z
      .array(z.string())
      .describe(
        "List of stats (individual and shared) that are relevant for deciding the consequences of player actions in the previous beat. Whether actions were successful or not (if that's relevant) has already been determined. This is about a) any costs involved in making a choice, b) any dispositions or alignments that might change in virtue of the player's choice, c) any consequences that happen because of players' choices. For each item, list the stat id and its effect on the consequences of players' decisions."
      ),
    statChanges: z
      .array(statChangeSchema)
      .describe(
        "List of stat changes based on players' decisions in the previous beat that will be applied to the story state. If this is the first set of beats, just return an empty list."
      ),
    ...(canAddMilestones
      ? {
          newMilestones: z
            .array(newMilestoneSchema)
            .describe(
              "List of milestones to be added based on the resolution of threads. Create one item for each outcome of each thread that has been concluded."
            ),
        }
      : {
          newMilestones: z.literal(""),
        }),
    ...beatSchemas,
  };

  return z.object(baseSchema);
};

export type BeatType = z.infer<typeof beatTypeSchema>;

export type SetOfBeatGenerationSchema = {
  statsAffectingDecisionConsequences: string[];
  statChanges: Change[];
  newMilestones: Change[] | "";
} & Record<`player${number}`, BeatGeneration>;

export interface ProbabilityDistribution {
  favorable: number;
  mixed: number;
  unfavorable: number;
}

export type Beat = z.infer<typeof beatGenerationSchema> & {
  choice: number;
  resolution: Resolution | null;
};

export type BeatHistory = Array<Beat>;

export type BeatGeneration = z.infer<typeof beatGenerationSchema>;

export type BeatPlan = z.infer<typeof beatPlanSchema>;

export type ExplorationOption = z.infer<typeof optionExplorationSchema>;
export type ChallengeOption = z.infer<typeof optionChallengeSchema>;
export type BeatOption = ExplorationOption | ChallengeOption;
