import { jest } from "@jest/globals";
import { toFile } from "openai";
import type {
  ImageEditParamsNonStreaming,
  ImageGenerateParamsNonStreaming,
  ImagesResponse,
} from "openai/resources/images";
import type { Uploadable } from "openai/uploads";
import {
  requestImage,
  analyzeImageGenerationError,
  MAX_REFERENCE_IMAGES,
} from "../../../src/images/openaiImageClient.js";
import type { ImageApiClient } from "../../../src/images/openaiImageClient.js";

const IMAGE_BYTES = Buffer.from("fake-jpeg-bytes");

function makeResponse(usage?: ImagesResponse.Usage): ImagesResponse {
  return {
    created: 0,
    data: [{ b64_json: IMAGE_BYTES.toString("base64") }],
    ...(usage ? { usage } : {}),
  };
}

function makeClient(response: ImagesResponse = makeResponse()) {
  const generate =
    jest.fn<(body: ImageGenerateParamsNonStreaming) => Promise<ImagesResponse>>();
  const edit =
    jest.fn<(body: ImageEditParamsNonStreaming) => Promise<ImagesResponse>>();
  generate.mockResolvedValue(response);
  edit.mockResolvedValue(response);
  const client: ImageApiClient = { images: { generate, edit } };
  return { client, generate, edit };
}

async function makeImages(count: number): Promise<Uploadable[]> {
  const images: Uploadable[] = [];
  for (let i = 0; i < count; i++) {
    images.push(
      await toFile(Buffer.from(`ref-${i}`), `ref-${i}.jpeg`, {
        type: "image/jpeg",
      })
    );
  }
  return images;
}

beforeEach(() => {
  // The cap and downgrade paths log warnings; keep test output readable
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const baseRequest = {
  prompt: "A lighthouse at dusk",
  model: "gpt-image-2.5-flare",
  quality: "medium" as const,
  size: "1024x1024" as const,
};

describe("requestImage", () => {
  it("calls generate when no images are supplied", async () => {
    const { client, generate, edit } = makeClient();

    const result = await requestImage(client, baseRequest);

    expect(generate).toHaveBeenCalledTimes(1);
    expect(edit).not.toHaveBeenCalled();
    expect(result.buffer.equals(IMAGE_BYTES)).toBe(true);
    expect(result.imagesSent).toBe(0);
  });

  it("calls generate when the images array is empty", async () => {
    const { client, generate, edit } = makeClient();

    await requestImage(client, { ...baseRequest, images: [] });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(edit).not.toHaveBeenCalled();
  });

  it("calls edit with the image array when images are supplied", async () => {
    const { client, generate, edit } = makeClient();
    const images = await makeImages(2);

    const result = await requestImage(client, { ...baseRequest, images });

    expect(generate).not.toHaveBeenCalled();
    expect(edit).toHaveBeenCalledTimes(1);
    expect(edit.mock.calls[0][0].image).toEqual(images);
    expect(result.imagesSent).toBe(2);
  });

  it(`sends at most ${MAX_REFERENCE_IMAGES} reference images`, async () => {
    const { client, edit } = makeClient();
    const images = await makeImages(20);

    const result = await requestImage(client, { ...baseRequest, images });

    const sent = edit.mock.calls[0][0].image;
    expect(Array.isArray(sent) ? sent.length : 1).toBe(16);
    expect(result.imagesSent).toBe(16);
  });

  it("sends exactly the expected parameters and never input_fidelity", async () => {
    const { client, generate, edit } = makeClient();

    await requestImage(client, baseRequest);
    await requestImage(client, { ...baseRequest, images: await makeImages(1) });

    const common = [
      "model",
      "moderation",
      "n",
      "output_compression",
      "output_format",
      "prompt",
      "quality",
      "size",
    ];
    expect(Object.keys(generate.mock.calls[0][0]).sort()).toEqual(common);
    expect(Object.keys(edit.mock.calls[0][0]).sort()).toEqual(
      [...common, "image"].sort()
    );
    expect(generate.mock.calls[0][0].model).toBe("gpt-image-2.5-flare");
    expect(edit.mock.calls[0][0]).not.toHaveProperty("input_fidelity");
  });

  it.each(["xhigh", "max"] as const)(
    "passes %s through for gpt-image-2.5 models",
    async (quality) => {
      const { client, generate } = makeClient();

      const result = await requestImage(client, { ...baseRequest, quality });

      expect(generate.mock.calls[0][0].quality).toBe(quality);
      expect(result.quality).toBe(quality);
    }
  );

  it.each(["xhigh", "max"] as const)(
    "downgrades %s to high on gpt-image-1.5",
    async (quality) => {
      const { client, generate } = makeClient();

      const result = await requestImage(client, {
        ...baseRequest,
        model: "gpt-image-1.5",
        quality,
      });

      expect(generate.mock.calls[0][0].quality).toBe("high");
      expect(result.quality).toBe("high");
    }
  );

  it("maps usage to input text, input image and output tokens", async () => {
    const { client } = makeClient(
      makeResponse({
        input_tokens: 1600,
        input_tokens_details: { image_tokens: 1500, text_tokens: 100 },
        output_tokens: 439,
        total_tokens: 2039,
      })
    );

    const result = await requestImage(client, baseRequest);

    expect(result.usage).toEqual({
      inputTextTokens: 100,
      inputImageTokens: 1500,
      outputTokens: 439,
    });
  });

  it("returns undefined usage when the response has none", async () => {
    const { client } = makeClient(makeResponse());

    const result = await requestImage(client, baseRequest);

    expect(result.usage).toBeUndefined();
  });

  it("throws when the response has no image data", async () => {
    const { client } = makeClient({ created: 0, data: [{}] });

    await expect(requestImage(client, baseRequest)).rejects.toThrow(
      "No image data"
    );
  });
});

describe("analyzeImageGenerationError", () => {
  const userError = () =>
    Object.assign(new Error("400 The request could not be completed"), {
      status: 400,
      type: "image_generation_user_error",
    });

  it("treats image_generation_user_error as a non-retryable content policy error", () => {
    const info = analyzeImageGenerationError(userError(), "A quiet harbour");

    expect(info.errorCode).toBe("CONTENT_POLICY");
    expect(info.retryable).toBe(false);
  });

  it("treats image_generation_user_error with a copyrighted prompt as non-retryable copyright", () => {
    const info = analyzeImageGenerationError(
      userError(),
      "A castle from Disney"
    );

    expect(info.errorCode).toBe("COPYRIGHT");
    expect(info.retryable).toBe(false);
  });

  it("still classifies a 429 as a rate limit", () => {
    const error = Object.assign(new Error("429 Slow down"), { status: 429 });

    const info = analyzeImageGenerationError(error, "A quiet harbour");

    expect(info.errorCode).toBe("RATE_LIMIT");
    expect(info.retryable).toBe(true);
  });
});
