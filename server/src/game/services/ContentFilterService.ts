import { z } from "zod";
import { Logger } from "shared/logger.js";
import { TEXT_MODEL_CONFIG } from "server/config.js";
import {
  createChatModel,
  PRODUCTION_MAX_RETRIES,
  PRODUCTION_TIMEOUT_MS,
} from "shared/llm/chatModel.js";
import { settingsFor } from "shared/llm/textModelSettings.js";
import { llmCallLogger } from "shared/llm/usageRecorder.js";
import { PROHIBITED_CONTENT_RULES } from "shared/contentSafetyRules.js";
import dotenv from "dotenv";

dotenv.config();

/*
 * Screens user-written text (story premises, AI Draft and Iteration requests,
 * template-editor image requests) before it reaches generation. Fails closed:
 * when the classifier cannot answer after one retry, it throws rather than let
 * the text through. Background: .context/content-safety.md.
 */

export const contentFilterSchema = z.object({
  isAppropriate: z.boolean(),
  reason: z.string(),
});

export type ContentFilterVerdict = z.infer<typeof contentFilterSchema>;

/** Sends one filter prompt to the classifier model and returns its verdict. */
export type ContentClassifier = (
  filterPrompt: string
) => Promise<ContentFilterVerdict>;

export type ContentCheck = { isAppropriate: boolean; reason?: string };

/** How often the classifier is asked before the filter gives up: one retry. */
export const CONTENT_FILTER_ATTEMPTS = 2;

/**
 * The filter could not reach a verdict. Callers must refuse the request; the
 * routes' existing error handling does that with its generic failure message.
 */
export class ContentFilterUnavailableError extends Error {
  readonly lastError: unknown;

  constructor(lastError: unknown) {
    super("The content filter is unavailable");
    this.name = "ContentFilterUnavailableError";
    this.lastError = lastError;
  }
}

function numberedRules(): string {
  return PROHIBITED_CONTENT_RULES.map(
    (rule, index) => `${index + 1}. ${rule}`
  ).join("\n");
}

function premiseFilterPrompt(prompt: string): string {
  return `You are a content moderation system. Your task is to determine if the following prompt for generating an interactive fiction story is appropriate for a general audience game.

Always mark the prompt as inappropriate if it asks for any of the following, even as fiction, satire or role-play:
${numberedRules()}

The prompt should also NOT contain:
- Inappropriate content: hardcore erotic, abuse, violence, gore, hate speech, illegal activities, self-harm, or other objectionable content
- Copyright infringement: characters, settings, or lore directly stolen from copyrighted works (e.g., Harry Potter characters, Marvel superheroes, Disney properties, specific Game of Thrones characters, etc.)

Note: Light fantasy violence like "killing a rival knight with a bow" is acceptable, as are romantic elements between fictional adults like "a steamy novella with vampires."
Generic fantasy/sci-fi elements (wizards, elves, space travel) are fine, but specific copyrighted characters and worlds are not.

Your response must be structured as follows:
- isAppropriate: A boolean indicating if the content is appropriate (true) or inappropriate (false)
- reason: If inappropriate, a brief explanation of why (specify if it's content policy violation or copyright concern)

Respond with true for isAppropriate ONLY if the content is clearly safe, appropriate, and doesn't infringe on copyrights.
Be conservative - if you have any doubt, mark it as inappropriate.

Prompt to evaluate: "${prompt}"`;
}

function imageRequestFilterPrompt(
  request: string,
  referenceImageCount: number
): string {
  const references =
    referenceImageCount > 0
      ? `\nThe request comes with ${referenceImageCount} reference image(s) that the image model will edit or copy from. You cannot see them: assume they may show real people, and judge what the request asks the model to do with them.\n`
      : "";
  return `You are a content moderation system for an image generator. Your task is to determine if the following image request may be sent to the image model.
${references}
Mark the request as inappropriate if it asks for any of the following, even as fiction, art or satire:
${numberedRules()}

This check is only about the rules above. Anything else, including stylised violence, fantasy creatures and dark themes, is appropriate here.

Your response must be structured as follows:
- isAppropriate: A boolean indicating if the request is appropriate (true) or inappropriate (false)
- reason: If inappropriate, a brief explanation of which rule it breaks

If you have any doubt whether a rule is broken, mark the request as inappropriate.

Request to evaluate: "${request}"`;
}

export class ContentFilterService {
  private classify: ContentClassifier;

  /** Uses the configured OpenAI model unless a classifier is passed in (tests). */
  constructor(classify?: ContentClassifier) {
    if (classify) {
      this.classify = classify;
      return;
    }
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }
    const structuredModel = createChatModel({
      role: "contentFilter",
      settings: settingsFor(TEXT_MODEL_CONFIG, "contentFilter"),
      maxRetries: PRODUCTION_MAX_RETRIES,
      timeoutMs: PRODUCTION_TIMEOUT_MS.contentFilter,
      callbacks: [llmCallLogger],
    }).withStructuredOutput(contentFilterSchema);
    this.classify = (filterPrompt) => structuredModel.invoke(filterPrompt);
  }

  /**
   * Checks a story premise or an AI Draft/Iteration request.
   * @throws ContentFilterUnavailableError when no verdict could be obtained
   */
  async isAppropriatePrompt(prompt: string): Promise<ContentCheck> {
    Logger.Story.log("Checking if prompt is appropriate:", prompt);
    return this.classifyWithRetry(premiseFilterPrompt(prompt));
  }

  /**
   * Checks the text of a template-editor image request against the
   * prohibited-content rules only (no copyright or general-audience rules).
   * @throws ContentFilterUnavailableError when no verdict could be obtained
   */
  async isAppropriateImageRequest(
    request: string,
    referenceImageCount: number
  ): Promise<ContentCheck> {
    Logger.Story.log("Checking if image request is appropriate:", request);
    return this.classifyWithRetry(
      imageRequestFilterPrompt(request, referenceImageCount)
    );
  }

  private async classifyWithRetry(filterPrompt: string): Promise<ContentCheck> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= CONTENT_FILTER_ATTEMPTS; attempt++) {
      try {
        const result = await this.classify(filterPrompt);
        Logger.Story.log(
          `Content filter result: isAppropriate=${result.isAppropriate}${
            result.reason ? `, reason=${result.reason}` : ""
          }`
        );
        return result;
      } catch (error) {
        lastError = error;
        Logger.Story.error(
          `Content filter attempt ${attempt} of ${CONTENT_FILTER_ATTEMPTS} failed:`,
          error
        );
      }
    }
    // Fail closed: without a verdict, nothing is let through
    throw new ContentFilterUnavailableError(lastError);
  }
}
