import { type GameMode } from "@core/types/story.js";
import type { PlayerCount } from "@core/types/player.js";
import type { TemplateIterationSections } from "@core/types/admin.js";
import { StorySetupPromptService } from "./StorySetupPromptService.js";
import { Logger } from "@common/logger.js";

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
    sections: TemplateIterationSections[],
    playerCount: PlayerCount,
    gameMode: GameMode,
    maxTurns: number
  ): string {
    const basePrompt = StorySetupPromptService.createSetupPrompt(
      "These instructions are the default instructions for creating a full story template based on a prompt. Your job is to adjust an existing story template based on feedback that will be provided below.",
      playerCount,
      gameMode,
      maxTurns
    );

    const sectionsString = sections.join(", ");

    const prompt =
      `${basePrompt}\n\n` +
      `#`.repeat(100) +
      `\n\nIMPORTANT: I am providing you with an existing story template that needs to be improved. ` +
      `You must ONLY regenerate the following sections: ${sectionsString}.` +
      `\n\nMaintain consistency with the other parts of the template that you are not changing.` +
      `\n\nHere is the current template:\n\n` +
      `${templateJson}\n\n` +
      `#`.repeat(100) +
      `\n\nHere is the feedback from the user on the existing story template:\n\n"${feedback.toUpperCase()}"` +
      `\n\nGenerate only the following requested sections with improved content, keeping the same structure but enhancing the quality and addressing the feedback: ${sectionsString}` +
      `\nThe user can only accept entire sections. If you make changes to the guidelines, provide a fully generated guidelines section. Same for stats, players, etc. Don't just generate additional elements that the user asked for, or make changes to a few specific items. We always need the full, updated section.`;

    // Logger.Admin.log(`Story iteration prompt: ${prompt}`);

    return prompt;
  }
}
