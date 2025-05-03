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

export const OPTION_RISK_TYPES = ["normal", "safe", "risky"] as const;
export type OptionRiskType = (typeof OPTION_RISK_TYPES)[number];

export const OPTION_RESOURCE_TYPES = ["normal", "sacrifice", "reward"] as const;
export type OptionResourceType = (typeof OPTION_RESOURCE_TYPES)[number];

const optionExplorationSchema = z
  .object({
    optionType: z.literal("exploration"),
    resourceType: z
      .enum(OPTION_RESOURCE_TYPES)
      .describe(
        "Whether this option involves sacrificing a stat to unlock this option ('sacrifice'), gaining a stat as a reward for choosing this option ('reward'), or none of these two ('normal')."
      ),
    text: z.string().describe("Text shown to player for this choice."),
  })
  .describe(
    "Exploration options. Choose this type for switches and exploratory threads (that don't follow a success/failure or win/lose pattern pattern). Options must always work narratively no matter which option the other players choose. (Bad: 'collaborate with [insert player name]', as that can lead to inconsistencies.)"
  );

const optionChallengeSchema = z
  .object({
    optionType: z.literal("challenge"),
    resourceType: z
      .enum(OPTION_RESOURCE_TYPES)
      .describe(
        "Whether this option involves sacrificing a stat in exchange for a higher chance of success ('sacrifice'), gaining a stat as a reward for choosing an option with lower chance of success ('reward'), or none of these two ('normal'). Sacrifice and reward options can only be created for stats that allow for sacrifices and serving as rewards in their stat definitions. Sacrificed stats are always lost, and rewards are always gained (not a matter of chance)."
      ),
    text: z
      .string()
      .describe(
        "Text shown to player for this choice. For sacrifice and reward options, mention the stat that will be sacrificed or gained (regardless of the resolution of this beat) so the player knows what the trade-off is. Prioritize flavor and consistency between beat and option text over mechanical accuracy. Don't use the terms 'sacrifice' or 'reward' in the option text."
      ),
    riskType: z
      .enum(OPTION_RISK_TYPES)
      .describe(
        "How this option skews the probability distribution. Risky means more extreme outcomes. Safe means more mixed and fewer unfavorable outcomes."
      ),
    basePoints: z
      .number()
      .describe(
        "For normal resource types: +15 to -15 depending on how much sense this option makes for achieving a favorable result / winning the contest.\n" +
          "For sacrifice resource types: +20 to +30 depending on how much is sacrificed and how much sense this option makes for achieving a favorable result / winning the contest.\n" +
          "For reward resource types: -20 to -30 depending on how much is gained and how much sense this option makes for achieving a favorable result / winning the contest."
      ),
    modifiersToSuccessRate: z
      .array(
        z
          .object({
            statId: z
              .string()
              .describe(
                "Id of the stat that is affecting the success rate of this option"
              ),
            reason: z
              .string()
              .describe(
                "Reason why this stat with its current value affects the success rate of this option. Must be consistent with the stat's 'effects on challenge success' parameter in the story state."
              ),
            effect: z
              .number()
              .describe(
                "Number of points that this modifier with its current value adds to or substracts from the success rate of this option. Between -15 and +15."
              ),
          })
          .describe(
            "Stat and how they affect the points of this option. Example: 'player1_charisma', 'game mechanics of charisma indicate that 70/100 grants +15 to social interactions' => +15. Must be based on the stat's actual, current value and consistent with the stat's 'effects on challenge success' parameter in the story state."
          )
      )
      .describe(
        "2 most relevant stats (individual and/or shared) that add or substract options from the favorable/mixed/unfavorable probability distribution. Don't include bonuses/maluses for sacrificing/gaining stats. These bonuses/maluses are already covered elsewhere. Only mention stats that with their current value change the success rate of this option and by how much. (Stats that are mentioned here don't change themselves. They just influence the success rate.)"
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
  showDontTellPreviousDecision: z
    .string()
    .describe(
      "The action or actions that the player decided to do at the end of the previous beat, plus a short instruction on how to make sure that these actions are narrated based on the principle of 'show don't tell'. Concrete descriptions, direct speech. (The resolution that this decision will lead to has already been determined, but the action itself must still be narrated.)"
    ),
  showDontTell: z
    .array(z.string())
    .describe(
      "List of points that will be covered in this beat, each with a short instruction on how to make sure that the point is delivered based on the principle of 'show don't tell'. Concrete actions, direct speech."
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
        phaseRequirements: z
          .string()
          .describe(
            "What are the requirements from the current switch/thread configuration?"
          ),
        previousOptionsToAvoid: z
          .array(z.string())
          .describe(
            "Relevant options that were already offered to the player in previous beats in this thread. Make sure that the options for this beat are meaningfully different from these previous options. Just bullet points. Focus on the gist of it. Good: 'sacrifice X', 'watch other guests', etc."
          ),
        statsAffectingOptions: z
          .string()
          .describe(
            "Which stats and their current values (both individual and shared) should affect which options are available to the player narratively? Example: If the player is strong and using strength makes sense in the beat, include an option that uses strength. If a player has a gold stat that can be used to bribe NPCs, add a corresponding option when dealing with NPCs."
          ),
        opportunityForSacrificesOrRewards: z
          .string()
          .describe(
            "Are there any stats that can be sacrificed (spent) in exchange for a higher chance of success that seem relevant for this beat? Any stats that can be gained as a reward for choosing an option with lower chance of success that seem relevant for this beat? Describe how these mechanics can be used in this beat or 'None' if there are no relevant opportunities."
          ),
      }),
    ])
    .describe(
      "Considerations for designing the options for this beat. Can be either a detailed object with considerations or a simple string for special cases like 'as in the topic switch configuration' or 'ending'."
    ),
});

const interludeSchema = z.object({
  imageId: z
    .string()
    .describe(
      "Id of the image to be shown in the interlude. Must be listed in the image library. Leave empty if no image exists for this interlude."
    ),
  imageSource: z
    .enum(["template", "story", "none"])
    .describe("Source of the image."),
  text: z.string().describe("1-2 sentences of flavor text."),
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
        "- Write 5-6 paragraphs with 4-5 sentences each.\n" +
        "- Use present tense.\n" +
        "- Start exactly where the previous beat for this player ended.\n" +
        "- Describe in detail the action that the player decided to do in the previous beat. Which resolution that decision will lead to is already determined, and the text should reflect that. The action itself hasn't been narrated yet, though. That must be done in the first paragraph.\n" +
        "- Follow the 'show don't tell' elements that you generated for the 'plan' attribute. Always be in the action and describe what happens (Good: \"The old sage tells you: 'When the sun sets, the moon will rise.'\"). Never summarize what happens, and never describe what happens in vague or generic terms (Bad: \"The sage gives you a cryptic hint.\" What hint?)\n" +
        "- Address the player character directly ('You' instead of the name of the character).\n" +
        "- If there is an image library with relevant images, add 1 or ideally 2 image tags to the beat text (3 are already too many). Format: '[image id=mrs_sukuhashi source=template desc=\"Mrs. Sukuhashi\" float=right]'. Add the tags at the beginning of the paragraph that you want to show the image in. For player characters, use ids player1, player2, etc. Don't use player images in beats for the player themselves. If there is no image library or if there are no relevant images, don't add any image tags.\n" +
        "- Never introduce, talk about, or even hint at the player's options in the beat text.\n" +
        "- Avoid all of these and similar formulations: 'The path before you ...', 'Will you do X, or will you do Y?', 'You must decide: ...', 'You weigh your options', 'The complexity of your decision ...'"
    ),
  summary: z
    .string()
    .describe(
      "One-sentence summary of the beat. Don't include the options for this beat. The purpose is to provide context for future beat generations, so be specific! Bad: '[insert player name] gets a cryptiv hint from [npc]'. Good: '[npc] tells [insert player name] that [specific thing]'."
    ),
  options: z
    .array(
      z.discriminatedUnion("optionType", [
        optionExplorationSchema,
        optionChallengeSchema,
      ])
    )
    .describe(
      "Exactly 3 choices for the player. Don't allow the player to leave the scene, suddenly do something else, or derail the core theme of the switch/thread. Only mention the action/decision of the player, not the consequences. Remember that both sacrifices and rewards are certain and not just risks or potential rewards. There can only ever be a total of zero or one sacrifice/reward option among the 3 options."
    ),
  interludes: z
    .array(interludeSchema)
    .describe(
      'Will be shown to the player while the new beat is being generated.\n- 1 fact about a story element that is relevant in the beat (imageId = story element id)\nA thought that goes through the mind of the character for whom this beat is written using first-person stream of throught (imageId = player slot)\na general detail about the world (imageId = "cover").'
    ),
});

export const createSetOfBeatGenerationSchema = (
  playerCount: PlayerCount,
  canAddMilestones: boolean = false,
  multiplayerCoordination: boolean = false
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
        "List of stat changes based on players' decisions in the previous beat that will be applied to the story state. Include stat sacrifices and rewards for sacrifice and reward options. If this is the first set of beats, just return an empty list."
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
    ...(multiplayerCoordination
      ? {
          multiplayerCoordination: z
            .string()
            .describe(
              "If several players are in the same switch or thread, how do you ensure that their options are a) meaningfully different from each other, b) consistent with each other, and c) coordinated? Spell out how exactly you ensure that no combination of choices leads to inconsistencies in the story. Example: [insert player name] will get options for proposals in a neogiation, while [player name 2] will get options to shift the atmosphere in the negotiation."
            ),
        }
      : {
          multiplayerCoordination: z.literal(""),
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

/**
 * Default probability distribution (33/34/33)
 */
export const DEFAULT_DISTRIBUTION: ProbabilityDistribution = {
  favorable: 33,
  mixed: 34,
  unfavorable: 33,
};

/**
 * Safe probability distribution (25/50/25)
 * Skewed toward mixed results
 */
export const SAFE_DISTRIBUTION: ProbabilityDistribution = {
  favorable: 25,
  mixed: 50,
  unfavorable: 25,
};

/**
 * Risky probability distribution (40/20/40)
 * Skewed toward extreme results
 */
export const RISKY_DISTRIBUTION: ProbabilityDistribution = {
  favorable: 40,
  mixed: 20,
  unfavorable: 40,
};

export interface ResolutionDetails {
  distribution: ProbabilityDistribution;
  roll?: number;
  points: number;
  readablePointModifiers?: Array<[string, number]>;
}

export type Beat = z.infer<typeof beatGenerationSchema> & {
  choice: number;
  resolution: Resolution | null;
  resolutionDetails?: ResolutionDetails;
};

export type BeatHistory = Array<Beat>;

export type BeatGeneration = z.infer<typeof beatGenerationSchema>;

export type BeatPlan = z.infer<typeof beatPlanSchema>;

export type ExplorationOption = z.infer<typeof optionExplorationSchema>;
export type ChallengeOption = z.infer<typeof optionChallengeSchema>;
export type BeatOption = ExplorationOption | ChallengeOption;
