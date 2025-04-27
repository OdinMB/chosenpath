import { z } from "zod";

export const storyElementSchema = z.object({
  id: z
    .string()
    .describe(
      "Unique identifier for the element. Use a short phrase with underscores, like 'mr_x' or 'tour_bus'."
    ),
  name: z.string().describe("The element's name"),
  role: z
    .string()
    .describe(
      "The element's role in the story. Be specific. What can the players do with this element? How does it relate to the outcomes?"
    ),
  instructions: z
    .string()
    .describe(
      "Instructions on how to use the element in the story. Can be related to both narrative and mechanics."
    ),
  appearance: z
    .string()
    .describe(
      "A description of the element's appearance in one sentence. Only for story elements that have a visual representation (e.g. NPCs, locations, items). For abstract elements (e.g. conflicts, mysteries, rumors), leave empty."
    ),
  facts: z
    .array(z.string())
    .describe(
      "Three additional facts about the story element. For NPCs, include their preferred pronouns and motivations."
    ),
});

export const StoryElementsSchema = z
  .array(storyElementSchema)
  .describe(
    "List of important elements in the story, including NPCs, locations, and miscellaneous elements (like items, organizations, mysteries, conflicts, etc.). Add an initial set of facts for each element."
  );

export type StoryElement = z.infer<typeof storyElementSchema>;
