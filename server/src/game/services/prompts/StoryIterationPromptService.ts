import { type GameMode } from "@core/types/story.js";
import type { PlayerCount } from "@core/types/player.js";
import { StorySetupPromptService } from "./StorySetupPromptService.js";

export class StoryIterationPromptService {
  /**
   * Creates a prompt for iterating on an existing story template
   * @param templateJson The existing story template as a JSON string
   * @param feedback User feedback on what to change/improve
   * @param sections Array of sections to regenerate
   * @param playerCount Player count for the story
   * @param gameMode Game mode for the story
   * @param maxTurns Maximum turns for the story
   * @returns Formatted prompt for the AI model
   */
  public static createIterationPrompt(
    templateJson: string,
    feedback: string,
    sections: string[],
    playerCount: PlayerCount,
    gameMode: GameMode,
    maxTurns: number
  ): string {
    const basePrompt = StorySetupPromptService.createSetupPrompt(
      feedback,
      playerCount,
      gameMode,
      maxTurns
    );

    const sectionsString = sections.join(", ");

    return (
      `${basePrompt}\n\n` +
      `#`.repeat(100) +
      `\n\n` +
      `IMPORTANT: I am providing you with an existing story template that needs to be improved. ` +
      `You must ONLY regenerate the following sections: ${sectionsString}.\n\n` +
      `Maintain consistency with the other parts of the template that you are not changing.\n\n` +
      `Here is the current template:\n\n` +
      `${templateJson}\n\n` +
      `#`.repeat(100) +
      `\n\n` +
      `Based on the feedback: "${feedback}"\n\n` +
      `Generate only the requested sections (${sectionsString}) with improved content, keeping the same structure but enhancing the quality and addressing the feedback.`
    );
  }
}
