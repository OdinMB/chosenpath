import { z } from "zod";
import { beatHistorySchema } from "./beat";
import { outcomesSchema } from "./outcome";

export const statSchema = z
  .object({
    id: z
      .string()
      .describe(
        "Unique identifier for the stat. Use a short phrase with underscores, like 'relationship_x'."
      ),
    name: z
      .string()
      .describe("Name of the variable that will be displayed to the player."),
    type: z
      .enum(["number", "boolean", "string", "string[]"])
      .describe("Data type of the variable"),
    value: z
      .union([z.number(), z.boolean(), z.string(), z.array(z.string())])
      .describe("Current value of the variable"),
    isVisible: z
      .boolean()
      .describe("Whether this stat should be visible to the player")
      .optional(),
  })
  .describe(
    "A variable that is tracked in the game state.\n" +
      "Don't use stats to track progress toward outcomes. That will be done with narrative milestones."
  );

export const statsSchema = z
  .array(statSchema)
  .describe(
    "Stats to be tracked in the game state. Stats define how the story progresses, which choices the player has, and how outcomes can be tracked. Can include\n" +
      "- Skills, areas of expertise, dispositions, health, special powers, etc. of the player character\n" +
      "- Resources that the character can acquire and allocate, e.g. money, time, mental energy, fuel, bullets, etc.\n" +
      "- Aspects of the world that can be influenced by the player, e.g. level of tension between factions, status of a spaceship, etc.\n" +
      "- Relationships to NPCs, factions, organizations, or general reputation. (Important NPCs often deserve their own stat.)\n" +
      "- Inventory, e.g. for special items, clues, or pieces of knowledge\n" +
      "Only include stats that are relevant to the story. E.g. don't include 'age' or 'height' of the player character if they don't play a role in the story.\n" +
      "Use numbers(0 - 100) for traits that can change granually over the course of the story, strings for qualitative summaries of statuses, or bools and lists of strings for traits that can be either true or false or that can be chosen from a list.\n" +
      "Hide stats that the player shouldn't be able to see."
  );

export const pronounSchema = z
  .object({
    subject: z.string().describe("Subject pronoun (e.g., 'he', 'she', 'they')"),
    object: z.string().describe("Object pronoun (e.g., 'him', 'her', 'them')"),
    possessive: z
      .string()
      .describe("Possessive pronoun (e.g., 'his', 'her', 'their')"),
  })
  .describe("Character's preferred pronouns");

export const guidelinesSchema = z
  .object({
    settingElements: z
      .array(z.string())
      .describe("Required characters, locations, and story elements"),
    rules: z
      .array(z.string())
      .describe("Fundamental rules governing the story world"),
    tone: z
      .array(z.string())
      .describe("Emotional and narrative tone guidelines"),
    conflicts: z
      .array(z.string())
      .describe(
        "Major conflicts driving the narrative. E.g. needs of superhero vs personal identity, confrontation with the nemesis"
      ),
    decisions: z
      .array(z.string())
      .describe(
        "Types of decisions that should occur in the game. E.g. prioritizing investigation leads given limited amount of time, following common sense morals vs. speeding up the investigation"
      ),
  })
  .describe("Story guidelines and parameters");

export const NPCSchema = z
  .object({
    name: z.string().describe("NPC's name"),
    role: z.string().describe("NPC's role in the story"),
    pronouns: pronounSchema,
    traits: z.array(z.string()).describe("NPC's defining traits"),
  })
  .describe("Important NPCs in the story.");

export const NPCsSchema = z
  .array(NPCSchema)
  .describe(
    "List of important NPCs in the story. Don't include the player character (main protagonist) in this list."
  );

export const PCSchema = z
  .object({
    name: z.string().describe("Player character's name"),
    pronouns: pronounSchema,
    fluff: z
      .string()
      .describe(
        "Fluff text about the player character that will be referenced in the story. Make sure that this works for any gender and pronouns."
      ),
  })
  .describe(
    "Player character. Note that the player will be able to change the name and pronouns before the story begins."
  );

export const storyStateSchema = z.object({
  guidelines: guidelinesSchema,
  stats: statsSchema,
  npcs: NPCsSchema,
  player: PCSchema,
  outcomes: outcomesSchema,
  establishedFacts: z.array(z.string()),
  beatHistory: beatHistorySchema,
  currentTurn: z.number(),
  maxTurns: z.number(),
});

export type StoryState = z.infer<typeof storyStateSchema>;

export const storySetupSchema = z
  .object({
    guidelines: guidelinesSchema,
    pc: PCSchema,
    npcs: NPCsSchema,
    outcomes: outcomesSchema,
    stats: statsSchema,
  })
  .describe("Initial setup for the story");

export type StorySetup = z.infer<typeof storySetupSchema>;
