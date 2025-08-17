import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { Logger } from "shared/logger.js";
import {
  CONTENT_FILTER_MODEL_NAME,
  CONTENT_FILTER_MODEL_TEMPERATURE,
} from "server/config.js";
import dotenv from "dotenv";

dotenv.config();

const contentFilterSchema = z.object({
  isAppropriate: z.boolean(),
  reason: z.string(),
});

export class ContentFilterService {
  private model: ChatOpenAI;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }

    // Use configured model settings for content filtering
    this.model = new ChatOpenAI({
      modelName: CONTENT_FILTER_MODEL_NAME,
      temperature: Number(CONTENT_FILTER_MODEL_TEMPERATURE),
    });
  }

  /**
   * Check if the prompt contains inappropriate content
   * @param prompt The user's story prompt to check
   * @returns True if content is appropriate, false otherwise with reason
   */
  async isAppropriatePrompt(prompt: string): Promise<{
    isAppropriate: boolean;
    reason?: string;
  }> {
    try {
      Logger.Story.log("Checking if prompt is appropriate:", prompt);

      const structuredModel =
        this.model.withStructuredOutput(contentFilterSchema);

      const filterPrompt = `You are a content moderation system. Your task is to determine if the following prompt for generating an interactive fiction story is appropriate 
        for a general audience game. The prompt should NOT contain:
        
        1. Inappropriate content: hardcore erotic, abuse, violence, gore, hate speech, illegal activities, self-harm, or other objectionable content
        2. Copyright infringement: characters, settings, or lore directly stolen from copyrighted works (e.g., Harry Potter characters, Marvel superheroes, Disney properties, specific Game of Thrones characters, etc.)
        
        Note: Light fantasy violence like "killing a rival knight with a bow" is acceptable, as are romantic elements like "a steamy novella with vampires." 
        Generic fantasy/sci-fi elements (wizards, elves, space travel) are fine, but specific copyrighted characters and worlds are not.
        
        Your response must be structured as follows:
        - isAppropriate: A boolean indicating if the content is appropriate (true) or inappropriate (false)
        - reason: If inappropriate, a brief explanation of why (specify if it's content policy violation or copyright concern)

        Respond with true for isAppropriate ONLY if the content is clearly safe, appropriate, and doesn't infringe on copyrights.
        Be conservative - if you have any doubt, mark it as inappropriate.
        
        Prompt to evaluate: "${prompt}"`;

      const result = await structuredModel.invoke(filterPrompt);

      Logger.Story.log(
        `Content filter result for prompt: isAppropriate=${
          result.isAppropriate
        }${result.reason ? `, reason=${result.reason}` : ""}`
      );

      return result;
    } catch (error) {
      Logger.Story.error("Error in content filtering:", error);
      // In case of error, default to allowing content but log the issue
      return { isAppropriate: true };
    }
  }
}
