import type { CharacterIdentity, ImageInstructions } from "core/types/index.js";

/*
 * Composes the text prompt sent to the image model for each flow.
 * The image-model eval (server/src/evals/imageModelEval) builds its prompts
 * with these same functions, so wording changes here change what it measures.
 */

/**
 * Prompt for beat illustrations, custom-story covers, custom-story player
 * portraits and template element images.
 */
export function getImagePrompt(
  description: string,
  imageInstructions?: ImageInstructions
): string {
  let prompt: string = "";
  prompt += `Generate an image that can accompany the following scene or story element\n\n`;
  prompt += `==========\n${description}\n==========`;
  if (imageInstructions) {
    prompt += `\n\n${getPromptSectionFromImageInstructions(imageInstructions)}`;
  }
  return prompt;
}

/**
 * Prompt for a player identity portrait generated in the template editor.
 */
export function getTemplatePlayerPortraitPrompt(
  appearance: string,
  imageInstructions?: ImageInstructions
): string {
  let prompt = `Generate a portrait image of a character with the following appearance:\n\n${appearance}`;

  if (imageInstructions) {
    prompt += `\n\n${getPromptSectionFromImageInstructions(imageInstructions)}`;
  }
  return prompt;
}

/**
 * Prompt for a template cover generated in the template editor.
 */
export function getTemplateCoverPrompt(
  coverPrompt: string,
  imageInstructions?: ImageInstructions
): string {
  let prompt = `Generate a cover image for a story with the following description:\n\n${coverPrompt}`;

  if (imageInstructions) {
    prompt += `\n\n${getPromptSectionFromImageInstructions(imageInstructions)}`;
  }
  return prompt;
}

/**
 * Description of a custom-story player character, used as the request prompt
 * for the player portrait (which then goes through getImagePrompt).
 */
export function getStoryPlayerPortraitDescription(
  identity: CharacterIdentity
): string {
  return (
    "Pronouns: " +
    identity.pronouns.personal +
    "/" +
    identity.pronouns.possessive +
    "\n" +
    identity.appearance
  );
}

function getPromptSectionFromImageInstructions(
  imageInstructions: ImageInstructions
): string {
  let prompt = "=======\n\n";

  // Format each instruction with its key
  const instructionMap: Record<string, string> = {
    visualStyle: "Visual Style",
    atmosphere: "Atmosphere",
    colorPalette: "Color Palette",
    settingDetails: "Setting Details",
    characterStyle: "Character Style",
    artInfluences: "Art Influences",
  };

  // Add each non-empty instruction to the formatted string
  Object.entries(imageInstructions).forEach(([key, value]) => {
    // Skip the coverPrompt itself since we're already using it
    if (key !== "coverPrompt" && value) {
      const label = instructionMap[key] || key;
      prompt += `${label}: ${value}\n`;
    }
  });
  prompt += `Text: Don't include any title or caption texts in the image.`;

  return prompt;
}
