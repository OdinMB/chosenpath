import { jest } from "@jest/globals";
import fs from "fs";
import os from "os";
import path from "path";
import type {
  ImageGenerateParamsNonStreaming,
  ImageEditParamsNonStreaming,
  ImagesResponse,
} from "openai/resources/images";
import type { ImageRequest } from "core/types/index.js";
import type { ImageApiClient } from "../../../src/images/openaiImageClient.js";
import { createMockStory } from "../../helpers/testHelpers.js";

// Generated files land in a throwaway directory, never in data/stories
const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-image-gen-"));

jest.unstable_mockModule("../../../src/shared/storageUtils.js", () => ({
  getStoragePath: () => storageRoot,
}));

const { AIImageGenerator, ImageGenerationError } = await import(
  "../../../src/images/AIImageGenerator.js"
);

const STORY_ID = "story-under-test";
const IMAGE_BYTES = Buffer.from("fake-jpeg-bytes");

function makeRequest(id: string, prompt: string): ImageRequest {
  return { id, caption: id, prompt, referenceImageIds: [] };
}

/** An image API that fails every request whose prompt mentions "unlucky". */
function makeClient(): ImageApiClient {
  const answer = async (body: { prompt: string }): Promise<ImagesResponse> => {
    if (body.prompt.includes("unlucky")) {
      throw new Error("Image API unavailable");
    }
    return { created: 0, data: [{ b64_json: IMAGE_BYTES.toString("base64") }] };
  };
  return {
    images: {
      generate: (body: ImageGenerateParamsNonStreaming) => answer(body),
      edit: (body: ImageEditParamsNonStreaming) => answer(body),
    },
  };
}

function storedImagePath(imageId: string): string {
  return path.join(storageRoot, STORY_ID, "images", `${imageId}.jpeg`);
}

beforeEach(() => {
  // The generator logs every prompt and failure; keep test output readable
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(() => {
  fs.rmSync(storageRoot, { recursive: true, force: true });
});

describe("AIImageGenerator.generateBeatImage", () => {
  it("rejects and stores nothing when the image API fails", async () => {
    const generator = new AIImageGenerator(makeClient());
    const story = createMockStory({ id: STORY_ID, generateImages: true });

    await expect(
      generator.generateBeatImage(
        story,
        makeRequest("failed_beat_image", "an unlucky harbour")
      )
    ).rejects.toBeInstanceOf(ImageGenerationError);
    expect(fs.existsSync(storedImagePath("failed_beat_image"))).toBe(false);
  });

  it("stores the image when the image API succeeds", async () => {
    const generator = new AIImageGenerator(makeClient());
    const story = createMockStory({ id: STORY_ID, generateImages: true });

    await generator.generateBeatImage(
      story,
      makeRequest("generated_beat_image", "a quiet harbour")
    );

    expect(fs.readFileSync(storedImagePath("generated_beat_image"))).toEqual(
      IMAGE_BYTES
    );
  });
});

describe("AIImageGenerator.generateImagesForBeats", () => {
  it("adds only the images that were generated to the image library", async () => {
    const generator = new AIImageGenerator(makeClient());
    const story = createMockStory({ id: STORY_ID, generateImages: true });

    const updated = await generator.generateImagesForBeats(story, [
      makeRequest("library_ok", "a lighthouse"),
      makeRequest("library_failed", "an unlucky lighthouse"),
    ]);

    expect(updated.getState().images.map((image) => image.id)).toEqual([
      "library_ok",
    ]);
  });
});
