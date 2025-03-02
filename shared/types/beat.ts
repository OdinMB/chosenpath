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

export const OPTION_TYPES = ["normal", "safe", "risky"] as const;
export type OptionType = (typeof OPTION_TYPES)[number];

export const STEP_RESOLUTION_TYPES = [
  "favorable",
  "mixed",
  "unfavorable",
] as const;
export type StepResolutionType = (typeof STEP_RESOLUTION_TYPES)[number];

const optionBaseSchema = z
  .object({
    optionType: z.literal("basic"),
    text: z.string().describe("Text shown to player for this choice"),
    statConsequences: z
      .string()
      .describe(
        "Instructions for the AI on how to adjust stats just for activating this option. Examples: uses 10 mana, uses a bullet, adjusts logic/empathy toward logic, loses an item, etc. Only describe what choosing this option entails immediately. Don't include the results of the player's choice. (That will be processed later.)"
      ),
  })
  .describe(
    "Choose this type of option for switches and exploratory threads (that don't follow a success/failure or win/lose pattern pattern)"
  );

const optionSuccessFailureSchema = z
  .object({
    optionType: z.literal("successFailure"),
    text: z.string().describe("Text shown to player for this choice"),
    statConsequences: z
      .string()
      .describe(
        "Instructions for the AI on how to adjust individual or shared stats for activating this option. Examples: uses 10 mana (if players have mana for casting spells), uses a bullet (in games where bullets are scarce and tracked by a stat), adjusts logic/empathy toward logic (if that's a tracked disposition and the choice leans toward empathy). Don't include the results of the player's choice. (Those will be processed later.)"
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
    "Choose this type of option for threads that follow a success/failure or win/lose pattern"
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
      "For multiplayer games: Bullet list with information from other beats in this turn that we must consider for this beat. In single-player games, say 'single-player'. In multiplayer games, if this is the beat for player1, say 'player1'."
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
    .string()
    .describe(
      "Answer the following questions:\n- How to reinforce the story's key conflicts and focused types of decisions?\n" +
        "- Which stats (both individual and shared) should affect the design of the options and how?\n" +
        "- What are the requirements from the current switch/thread configuration?\n" +
        "- If these are options for a topic switch, just say 'as in the topic switch configuration'.\n" +
        "The ending doesn't need any options."
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
        "- Write 4-5 paragraphs.\n" +
        "- Use present tense.\n" +
        "- Address the player character directly ('You' instead of the name of the character).\n" +
        "- NEVER introduce, talk about, or even hint at the player's options in the beat text.\n" +
        "- AVOID all of these and similar formulations: 'The path before you ...', 'Will you do X, or will you do Y?', 'You must decide: ...', 'You weigh your options', 'The complexity of your decision ...'\n" +
        "- You can use markdown for formatting."
    ),
  summary: z
    .string()
    .describe(
      "One-sentence summary of the beat. Don't include the options for this beat. The purpose is to provide context for future beat generations, so be specific! Bad: '[player] gets a cryptiv hint from [npc]'. Good: '[npc] tells [player] that [specific thing]'."
    ),
  imageId: z
    .string()
    .describe(
      "Id of an image from the existing list of images. Leave empty if no image is available or fitting. Leave empty if you want the game app to generate a new image for this beat."
    ),
  options: z
    .array(
      z.discriminatedUnion("optionType", [
        optionBaseSchema,
        optionSuccessFailureSchema,
      ])
    )
    .describe(
      "3 choices for the player. Don't allow the player to leave the scene, suddenly do something else, or derail the core theme of the switch/thread. Only mention the action/decision of the player, not the consequences. For the ending, just leave the array empty."
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
        "List of both individual and shared stats that seem relevant for deciding the consequences of player actions in the previous beat. Includes: stats affecting the chance of success, the scope of what is happening, and how the consequences play out."
      ),
    statChanges: z
      .array(statChangeSchema)
      .describe(
        "List of stat changes based on players' decisions in the last beat that will be applied to the story state. If this is the first set of beats, just return an empty list."
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
  resolution: StepResolutionType | null;
};

export type BeatHistory = Array<Beat>;

export type BeatGeneration = z.infer<typeof beatGenerationSchema>;

export type BeatPlan = z.infer<typeof beatPlanSchema>;

export type BaseOption = z.infer<typeof optionBaseSchema>;
export type SuccessFailureOption = z.infer<typeof optionSuccessFailureSchema>;
export type BeatOption = BaseOption | SuccessFailureOption;
