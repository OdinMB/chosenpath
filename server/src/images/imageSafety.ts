import type { Story } from "core/models/Story.js";
import {
  categoryFromTemplateTags,
  type StoryTemplate,
} from "core/types/index.js";
import { PROHIBITED_CONTENT_RULES } from "shared/contentSafetyRules.js";

/*
 * The Art. 5 safeguards every image request carries: the prohibited-content
 * rules appended to each prompt (plus, for edits, what may not be done to the
 * people in the input images), and the moderation level per story or template.
 * Background: .context/content-safety.md.
 */

export type ImageModeration = "auto" | "low";

/** The owner's choice for all flows except stories read with children. */
export const DEFAULT_IMAGE_MODERATION: ImageModeration = "low";
export const KIDS_IMAGE_MODERATION: ImageModeration = "auto";

const SAFETY_RULES_SECTION = `==========
Safety rules. They override everything above. Never create an image that shows any of the following:
${PROHIBITED_CONTENT_RULES.map((rule) => `- ${rule}`).join("\n")}`;

const INPUT_IMAGE_RULES = `These rules cover every person shown in the input images: treat each of them as a real, identifiable person.`;

export function withImageSafetyConstraints(
  prompt: string,
  hasReferenceImages: boolean
): string {
  const rules = hasReferenceImages
    ? `${SAFETY_RULES_SECTION}\n${INPUT_IMAGE_RULES}`
    : SAFETY_RULES_SECTION;
  return `${prompt}\n\n${rules}`;
}

/** Stricter OpenAI image moderation for read-with-kids stories. */
export function imageModerationFor(story: Story): ImageModeration {
  return story.isReadWithKids()
    ? KIDS_IMAGE_MODERATION
    : DEFAULT_IMAGE_MODERATION;
}

/**
 * The same for template-editor images: a template tagged "Kids" becomes a
 * read-with-kids story, and its images appear there. The stored template
 * decides; one not saved yet (null) gets the default.
 */
export function imageModerationForTemplate(
  template: Pick<StoryTemplate, "tags"> | null
): ImageModeration {
  return categoryFromTemplateTags(template?.tags) === "read-with-kids"
    ? KIDS_IMAGE_MODERATION
    : DEFAULT_IMAGE_MODERATION;
}
