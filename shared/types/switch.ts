import { z } from "zod";
import { PLAYER_SLOTS, PlayerCount } from "./players.js";

export const switchTypeSchema = z
  .enum(["topic", "flavor"])
  .describe(
    "The type of switch - topic: player chooses which outcome/question to focus on next, flavor: player chooses how to approach a thread for a predetermined outcome/question"
  );

export const switchPlayerAnalysisSchema = z
  .object({
    continuity: z
      .string()
      .describe(
        "Continuity. Based on the last thread (or story setup, if this is the first switch), is there any outcome/question pair that is forced or at least strongly suggested as the focus of the next thread?\n" +
          "Consider immediate consequences, time-sensitive events, consistent actions, dramatic timing, and narrative momentum.\n" +
          "Remember that this factor must be strong to justify a flavor switch."
      ),
    priority: z
      .string()
      .describe(
        "Priority. Is there any outcome/question pair that must be addressed now to allow all outcomes to be resolved before the story ends?\n" +
          "Consider story duration and dependencies.\n" +
          "Remember that this factor must be strong to justify a flavor switch."
      ),
    decision: z
      .string()
      .describe(
        "Decision. Justify your choice of using a flavor switch or a topic switch.\n" +
          "Consider if continuity or priority dictate a flavor switch, or if the player can have more agency with a topic switch."
      ),
    switchType: switchTypeSchema,
  })
  .describe(
    "Analysis of the current story situation of a player resulting in a decision for either a flavor switch or a topic switch"
  );

export const switchSchema = z.object({
  players: z
    .array(z.enum(PLAYER_SLOTS as [string, ...string[]]))
    .describe(
      "List of players who are involved in this switch and will be part of the resulting thread"
    ),
  type: switchTypeSchema,
  outcome: z
    .string()
    .describe(
      "If this is a flavor switch: The story outcome that this switch relates to. (Leave empty for topic switches)"
    ),
  question: z
    .string()
    .describe(
      "If this is a flavor switch: The question that will be explored in the next thread to push the outcome forward. (Leave empty for topic switches)"
    ),
  relationshipToOtherSwitches: z
    .string()
    .describe(
      "How this switch relates to other switches (any other switch that allows a player to join the thread, fully independent, etc.)"
    ),
  title: z
    .string()
    .describe(
      "Title for the switch. Will be used as the beat title. Think book ochapter or TV series episode."
    ),
  id: z
    .string()
    .describe(
      "Unique identifier for the switch. Use a short phrase with underscores, like 'left_or_right'."
    ),
});

export const createSwitchAnalysisSchema = (playerCount: PlayerCount) => {
  // Create a record of required beat generation schemas based on player count
  const switchPlayerAnalysisSchemas = Object.fromEntries(
    Array.from({ length: playerCount }, (_, i) => [
      `player${i + 1}`,
      switchPlayerAnalysisSchema,
    ])
  ) as Record<`player${number}`, typeof switchPlayerAnalysisSchema>;

  return z
    .object({
      ...switchPlayerAnalysisSchemas,
      coordinationPatternAnalysis: z
        .string()
        .describe(
          "For multiplayer games, write a list of bullet points how the game mode and the current story situation should affect how players will be distributed between one or several switches."
        ),
      coordinationPatternSummary: z
        .string()
        .describe(
          "For multiplayer games, write a summary of how the switches relate to each other (grouped thread, opt-in grouping, parallel threads with intersection, independent threads, and combinations thereof)."
        ),
      switches: z
        .array(switchSchema)
        .describe(
          "Overview of all switches and how players will be allocated to them."
        ),
    })
    .strict()
    .describe("Set of switches for all players");
};

export type Switch = z.infer<typeof switchSchema>;
export type SwitchType = z.infer<typeof switchTypeSchema>;
export type SwitchAnalysis = z.infer<
  ReturnType<typeof createSwitchAnalysisSchema>
>;
