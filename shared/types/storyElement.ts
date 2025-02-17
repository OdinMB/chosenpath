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
  facts: z
    .array(z.string())
    .describe(
      "Three facts about the element that can be used to introduce the element to the player. For NPCs, include their preferred pronouns and motivations."
    ),
});

export const StoryElementsSchema = z
  .array(storyElementSchema)
  .describe(
    "List of important elements in the story, including NPCs, locations, and miscellaneous elements (like items, organizations, mysteries, conflicts, etc.)"
  );

export type StoryElement = z.infer<typeof storyElementSchema>;
