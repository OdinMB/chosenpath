import { jest } from "@jest/globals";
import { screenImageRequest } from "../../../src/images/imageRequestScreening.js";
import type { ImageRequestFilter } from "../../../src/images/imageRequestScreening.js";
import { ImageGenerationError } from "../../../src/images/AIImageGenerator.js";
import { ContentFilterUnavailableError } from "../../../src/game/services/ContentFilterService.js";
import type { ContentCheck } from "../../../src/game/services/ContentFilterService.js";
import type { ImageInstructions } from "core/types/index.js";

const INSTRUCTIONS: ImageInstructions = {
  visualStyle: "watercolour",
  atmosphere: "calm",
  colorPalette: "muted",
  settingDetails: "harbour town",
  characterStyle: "soft lines",
  artInfluences: "impressionism",
  coverPrompt: "the harbour at dawn",
};

function filterAnswering(answer: ContentCheck | Error) {
  const isAppropriateImageRequest =
    jest.fn<ImageRequestFilter["isAppropriateImageRequest"]>();
  if (answer instanceof Error) {
    isAppropriateImageRequest.mockRejectedValue(answer);
  } else {
    isAppropriateImageRequest.mockResolvedValue(answer);
  }
  const filter: ImageRequestFilter = { isAppropriateImageRequest };
  return { filter, isAppropriateImageRequest };
}

async function errorFrom(promise: Promise<void>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected the screening to reject");
}

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("screenImageRequest", () => {
  it("lets an allowed request through and screens its description, style text and references", async () => {
    const { filter, isAppropriateImageRequest } = filterAnswering({
      isAppropriate: true,
    });

    await screenImageRequest(filter, "the innkeeper", INSTRUCTIONS, 2);

    const [text, referenceCount] = isAppropriateImageRequest.mock.calls[0];
    expect(text).toContain("the innkeeper");
    expect(text).toContain("watercolour");
    expect(referenceCount).toBe(2);
  });

  it("refuses a request that breaks a rule as a non-technical content policy error", async () => {
    const { filter } = filterAnswering({
      isAppropriate: false,
      reason: "asks to undress the person in the reference image",
    });

    const error = await errorFrom(
      screenImageRequest(filter, "same person, no clothes", undefined, 1)
    );

    expect(error).toBeInstanceOf(ImageGenerationError);
    expect((error as ImageGenerationError).imageGenerationError.errorCode).toBe(
      "CONTENT_POLICY"
    );
  });

  it("fails closed when the filter is unavailable", async () => {
    const { filter } = filterAnswering(
      new ContentFilterUnavailableError(new Error("timeout"))
    );

    const error = await errorFrom(
      screenImageRequest(filter, "the innkeeper", undefined, 0)
    );

    expect(error).toBeInstanceOf(ImageGenerationError);
    expect((error as ImageGenerationError).imageGenerationError.errorCode).toBe(
      "TECHNICAL"
    );
  });
});
