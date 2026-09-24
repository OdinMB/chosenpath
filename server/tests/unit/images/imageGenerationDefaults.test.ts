import type { ImageQuality } from "core/types/index.js";
import {
  DEFAULT_IMAGE_GENERATION_MODEL,
  DEFAULT_IMAGE_GENERATION_TEMPLATE_MODEL,
  IMAGE_GENERATION_BEAT_QUALITY,
  IMAGE_GENERATION_STORY_COVER_QUALITY,
  IMAGE_GENERATION_STORY_PLAYER_QUALITY,
  IMAGE_GENERATION_TEMPLATE_COVER_QUALITY,
  IMAGE_GENERATION_TEMPLATE_ELEMENT_QUALITY,
  IMAGE_GENERATION_TEMPLATE_PLAYER_QUALITY,
} from "../../../src/config.js";
import { effectiveImageQuality } from "../../../src/images/openaiImageClient.js";

// Each flow's default quality with the default model of its side: in-game
// flows use IMAGE_GENERATION_MODEL, template-editor flows
// IMAGE_GENERATION_TEMPLATE_MODEL (see AIImageGenerator).
const FLOW_DEFAULTS: [string, string, ImageQuality][] = [
  ["beat illustration", DEFAULT_IMAGE_GENERATION_MODEL, IMAGE_GENERATION_BEAT_QUALITY],
  ["custom-story cover", DEFAULT_IMAGE_GENERATION_MODEL, IMAGE_GENERATION_STORY_COVER_QUALITY],
  ["custom-story player portrait", DEFAULT_IMAGE_GENERATION_MODEL, IMAGE_GENERATION_STORY_PLAYER_QUALITY],
  ["template cover", DEFAULT_IMAGE_GENERATION_TEMPLATE_MODEL, IMAGE_GENERATION_TEMPLATE_COVER_QUALITY],
  ["template player portrait", DEFAULT_IMAGE_GENERATION_TEMPLATE_MODEL, IMAGE_GENERATION_TEMPLATE_PLAYER_QUALITY],
  ["template element image", DEFAULT_IMAGE_GENERATION_TEMPLATE_MODEL, IMAGE_GENERATION_TEMPLATE_ELEMENT_QUALITY],
];

describe("image generation defaults", () => {
  it.each(FLOW_DEFAULTS)(
    "%s: the default model takes the default quality without a downgrade",
    (_flow, model, quality) => {
      expect(effectiveImageQuality(model, quality)).toBe(quality);
    }
  );
});
