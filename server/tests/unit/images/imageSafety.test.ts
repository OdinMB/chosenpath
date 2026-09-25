import {
  DEFAULT_IMAGE_MODERATION,
  KIDS_IMAGE_MODERATION,
  imageModerationFor,
  imageModerationForTemplate,
  withImageSafetyConstraints,
} from "../../../src/images/imageSafety.js";
import { PROHIBITED_CONTENT_RULES } from "../../../src/shared/contentSafetyRules.js";
import { STORY_CATEGORIES } from "core/types/index.js";
import { createMockStory } from "../../helpers/testHelpers.js";

describe("withImageSafetyConstraints", () => {
  it("keeps the prompt and adds every prohibited-content rule", () => {
    const prompt = withImageSafetyConstraints("A lighthouse at dusk", false);

    expect(prompt.startsWith("A lighthouse at dusk")).toBe(true);
    for (const rule of PROHIBITED_CONTENT_RULES) {
      expect(prompt).toContain(rule);
    }
  });

  it("adds rules about the input images only when reference images are sent", () => {
    const generate = withImageSafetyConstraints("A lighthouse at dusk", false);
    const edit = withImageSafetyConstraints("A lighthouse at dusk", true);

    expect(edit.startsWith(generate)).toBe(true);
    expect(edit.length).toBeGreaterThan(generate.length);
  });
});

describe("imageModerationFor", () => {
  it("uses the stricter moderation for read-with-kids stories", () => {
    const story = createMockStory({ category: "read-with-kids" });

    expect(imageModerationFor(story)).toBe(KIDS_IMAGE_MODERATION);
    expect(KIDS_IMAGE_MODERATION).not.toBe(DEFAULT_IMAGE_MODERATION);
  });

  it("keeps the default moderation for every other category and for stories without one", () => {
    const others = STORY_CATEGORIES.filter((c) => c !== "read-with-kids");

    for (const category of others) {
      expect(imageModerationFor(createMockStory({ category }))).toBe(
        DEFAULT_IMAGE_MODERATION
      );
    }
    expect(imageModerationFor(createMockStory())).toBe(
      DEFAULT_IMAGE_MODERATION
    );
  });
});

describe("imageModerationForTemplate", () => {
  it("uses the stricter moderation for templates tagged Kids, however the tag is written", () => {
    for (const tags of [["Kids"], ["Fantasy", "kids"], [" KIDS "]]) {
      expect(imageModerationForTemplate({ tags })).toBe(KIDS_IMAGE_MODERATION);
    }
  });

  it("keeps the default moderation for other templates and for templates not saved yet", () => {
    expect(imageModerationForTemplate({ tags: ["Fantasy", "Satire"] })).toBe(
      DEFAULT_IMAGE_MODERATION
    );
    expect(imageModerationForTemplate({ tags: [] })).toBe(
      DEFAULT_IMAGE_MODERATION
    );
    expect(imageModerationForTemplate(null)).toBe(DEFAULT_IMAGE_MODERATION);
  });
});
