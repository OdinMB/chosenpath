import { jest } from "@jest/globals";
import fs from "fs";
import os from "os";
import path from "path";
import sharp from "sharp";
import type {
  ImageGenerateParamsNonStreaming,
  ImageEditParamsNonStreaming,
  ImagesResponse,
} from "openai/resources/images";
import { IMAGE_QUALITIES, IMAGE_SIZES } from "core/types/index.js";
import type { ImageRequest } from "core/types/index.js";
import type { ImageApiClient } from "../../../src/images/openaiImageClient.js";
import {
  IMAGE_GENERATION_MODEL,
  IMAGE_GENERATION_TEMPLATE_MODEL,
  IMAGE_GENERATION_BEAT_QUALITY,
  IMAGE_GENERATION_TEMPLATE_COVER_QUALITY,
  IMAGE_GENERATION_TEMPLATE_ELEMENT_QUALITY,
  IMAGE_GENERATION_TEMPLATE_PLAYER_QUALITY,
} from "../../../src/config.js";
import { createMockStory } from "../../helpers/testHelpers.js";

// Generated files land in a throwaway directory, never in data/stories
const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-image-gen-"));

jest.unstable_mockModule("../../../src/shared/storageUtils.js", () => ({
  getStoragePath: () => storageRoot,
}));

const { AIImageGenerator, ImageGenerationError } = await import(
  "../../../src/images/AIImageGenerator.js"
);
const { effectiveImageQuality } = await import(
  "../../../src/images/openaiImageClient.js"
);

const {
  DEFAULT_IMAGE_MODERATION,
  KIDS_IMAGE_MODERATION,
  imageModerationForTemplate,
} = await import("../../../src/images/imageSafety.js");

const STORY_ID = "story-under-test";
const TEMPLATE_ID = "template-under-test";
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

/** An image API that succeeds and records the parameters of every request. */
function makeRecordingClient() {
  const response: ImagesResponse = {
    created: 0,
    data: [{ b64_json: IMAGE_BYTES.toString("base64") }],
  };
  const generate =
    jest.fn<(body: ImageGenerateParamsNonStreaming) => Promise<ImagesResponse>>();
  const edit =
    jest.fn<(body: ImageEditParamsNonStreaming) => Promise<ImagesResponse>>();
  generate.mockResolvedValue(response);
  edit.mockResolvedValue(response);
  const client: ImageApiClient = { images: { generate, edit } };
  return { client, generate };
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

// Expected qualities go through effectiveImageQuality so that a local model
// override (server/.env) cannot fail these tests; that the default models take
// the default qualities as is, is pinned in imageGenerationDefaults.test.ts.
describe("AIImageGenerator per-flow defaults", () => {
  it("sends a beat request without size or quality as a square image on the in-game model", async () => {
    const { client, generate } = makeRecordingClient();
    const generator = new AIImageGenerator(client);
    const story = createMockStory({ id: STORY_ID, generateImages: true });

    await generator.generateBeatImage(
      story,
      makeRequest("default_beat_image", "a harbour at dawn")
    );

    expect(generate.mock.calls[0][0]).toMatchObject({
      model: IMAGE_GENERATION_MODEL,
      quality: effectiveImageQuality(
        IMAGE_GENERATION_MODEL,
        IMAGE_GENERATION_BEAT_QUALITY
      ),
      size: IMAGE_SIZES.SQUARE,
    });
  });

  it("keeps the size and quality an in-game request carries", async () => {
    const { client, generate } = makeRecordingClient();
    const generator = new AIImageGenerator(client);
    const story = createMockStory({ id: STORY_ID, generateImages: true });

    await generator.generateBeatImage(story, {
      ...makeRequest("cover", "a harbour town"),
      imageSize: IMAGE_SIZES.PORTRAIT,
      imageQuality: IMAGE_QUALITIES.LOW,
    });

    expect(generate.mock.calls[0][0]).toMatchObject({
      model: IMAGE_GENERATION_MODEL,
      quality: IMAGE_QUALITIES.LOW,
      size: IMAGE_SIZES.PORTRAIT,
    });
  });

  it("sends the template cover on the template model at the template cover quality", async () => {
    const { client, generate } = makeRecordingClient();
    const generator = new AIImageGenerator(client);

    await generator.generateCoverImageForTemplate(
      "template-under-test",
      "a harbour town at dusk",
      DEFAULT_IMAGE_MODERATION
    );

    expect(generate.mock.calls[0][0]).toMatchObject({
      model: IMAGE_GENERATION_TEMPLATE_MODEL,
      quality: effectiveImageQuality(
        IMAGE_GENERATION_TEMPLATE_MODEL,
        IMAGE_GENERATION_TEMPLATE_COVER_QUALITY
      ),
      size: IMAGE_SIZES.PORTRAIT,
    });
  });

  it("sends a template player portrait on the template model at the template player quality", async () => {
    const { client, generate } = makeRecordingClient();
    const generator = new AIImageGenerator(client);

    await generator.generatePlayerImageForTemplate(
      "player1",
      0,
      "template-under-test",
      "a lighthouse keeper with a grey beard",
      DEFAULT_IMAGE_MODERATION
    );

    expect(generate.mock.calls[0][0]).toMatchObject({
      model: IMAGE_GENERATION_TEMPLATE_MODEL,
      quality: effectiveImageQuality(
        IMAGE_GENERATION_TEMPLATE_MODEL,
        IMAGE_GENERATION_TEMPLATE_PLAYER_QUALITY
      ),
      size: IMAGE_SIZES.PORTRAIT,
    });
  });

  it("sends a template element image on the template model at the element quality and size auto", async () => {
    const { client, generate } = makeRecordingClient();
    const generator = new AIImageGenerator(client);

    await generator.generateImageForTemplate(
      "lighthouse",
      "template-under-test",
      "a white lighthouse on a rock",
      DEFAULT_IMAGE_MODERATION
    );

    expect(generate.mock.calls[0][0]).toMatchObject({
      model: IMAGE_GENERATION_TEMPLATE_MODEL,
      quality: effectiveImageQuality(
        IMAGE_GENERATION_TEMPLATE_MODEL,
        IMAGE_GENERATION_TEMPLATE_ELEMENT_QUALITY
      ),
      size: IMAGE_SIZES.AUTO,
    });
  });
});

describe("AIImageGenerator image moderation", () => {
  it("sends in-game images of read-with-kids stories with the stricter moderation", async () => {
    const { client, generate } = makeRecordingClient();
    const generator = new AIImageGenerator(client);
    const story = createMockStory({
      id: STORY_ID,
      generateImages: true,
      category: "read-with-kids",
    });

    await generator.generateBeatImage(
      story,
      makeRequest("kids_beat_image", "a friendly dragon")
    );

    expect(generate.mock.calls[0][0].moderation).toBe(KIDS_IMAGE_MODERATION);
  });

  it("sends in-game images of other stories with the default moderation", async () => {
    const { client, generate } = makeRecordingClient();
    const generator = new AIImageGenerator(client);
    const story = createMockStory({
      id: STORY_ID,
      generateImages: true,
      category: "enjoy-fiction",
    });

    await generator.generateBeatImage(
      story,
      makeRequest("fiction_beat_image", "a friendly dragon")
    );

    expect(generate.mock.calls[0][0].moderation).toBe(DEFAULT_IMAGE_MODERATION);
  });

  // A "Kids" template's editor images end up in read-with-kids stories
  const kidsTemplate = imageModerationForTemplate({
    tags: ["Fantasy", "Kids"],
  });
  const templateFlows: Array<
    [string, (generator: InstanceType<typeof AIImageGenerator>) => Promise<string>]
  > = [
    [
      "element image",
      (generator) =>
        generator.generateImageForTemplate(
          "dragon",
          TEMPLATE_ID,
          "a friendly dragon",
          kidsTemplate
        ),
    ],
    [
      "identity portrait",
      (generator) =>
        generator.generatePlayerImageForTemplate(
          "player1",
          0,
          TEMPLATE_ID,
          "a girl with a red scarf",
          kidsTemplate
        ),
    ],
    [
      "cover",
      (generator) =>
        generator.generateCoverImageForTemplate(
          TEMPLATE_ID,
          "a castle made of cake",
          kidsTemplate
        ),
    ],
  ];

  it.each(templateFlows)(
    "sends the template %s of a Kids-tagged template with the stricter moderation",
    async (_flow, generate) => {
      const recording = makeRecordingClient();

      await generate(new AIImageGenerator(recording.client));

      expect(recording.generate.mock.calls[0][0].moderation).toBe(
        KIDS_IMAGE_MODERATION
      );
    }
  );
});

describe("AIImageGenerator.generateCoverImageForTemplate", () => {
  it("stores the cover byte for byte as the image API returned it, so its content credentials survive", async () => {
    // A real full-size cover: a resize or re-encode would change these bytes
    const cover = await sharp({
      create: {
        width: 1024,
        height: 1536,
        channels: 3,
        background: { r: 40, g: 90, b: 160 },
      },
    })
      .jpeg()
      .toBuffer();
    const generate =
      jest.fn<(body: ImageGenerateParamsNonStreaming) => Promise<ImagesResponse>>();
    generate.mockResolvedValue({
      created: 0,
      data: [{ b64_json: cover.toString("base64") }],
    });
    const edit =
      jest.fn<(body: ImageEditParamsNonStreaming) => Promise<ImagesResponse>>();
    const generator = new AIImageGenerator({ images: { generate, edit } });

    const imagePath = await generator.generateCoverImageForTemplate(
      TEMPLATE_ID,
      "a harbour town at dusk",
      DEFAULT_IMAGE_MODERATION
    );

    expect(imagePath).toBe(`/images/templates/${TEMPLATE_ID}/cover.jpeg`);
    const stored = fs.readFileSync(
      path.join(storageRoot, TEMPLATE_ID, "images", "cover.jpeg")
    );
    expect(stored.equals(cover)).toBe(true);
  });
});
