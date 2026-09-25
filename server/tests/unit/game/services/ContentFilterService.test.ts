import { jest } from "@jest/globals";
import {
  CONTENT_FILTER_ATTEMPTS,
  ContentFilterService,
  ContentFilterUnavailableError,
} from "../../../../src/game/services/ContentFilterService.js";
import type {
  ContentClassifier,
  ContentFilterVerdict,
} from "../../../../src/game/services/ContentFilterService.js";
import { PROHIBITED_CONTENT_RULES } from "../../../../src/shared/contentSafetyRules.js";

const ALLOWED: ContentFilterVerdict = { isAppropriate: true, reason: "" };
const BLOCKED: ContentFilterVerdict = {
  isAppropriate: false,
  reason: "Real person in an intimate context",
};

function classifierAnswering(...answers: Array<ContentFilterVerdict | Error>) {
  const classify = jest.fn<ContentClassifier>();
  for (const answer of answers) {
    if (answer instanceof Error) {
      classify.mockRejectedValueOnce(answer);
    } else {
      classify.mockResolvedValueOnce(answer);
    }
  }
  return classify;
}

beforeEach(() => {
  // The filter logs every prompt and every failure; keep test output readable
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("ContentFilterService.isAppropriatePrompt", () => {
  it("passes on the classifier's verdict", async () => {
    const filter = new ContentFilterService(classifierAnswering(BLOCKED));

    await expect(filter.isAppropriatePrompt("a premise")).resolves.toEqual(
      BLOCKED
    );
  });

  it("asks once more when the first attempt fails", async () => {
    const classify = classifierAnswering(new Error("timeout"), ALLOWED);
    const filter = new ContentFilterService(classify);

    await expect(filter.isAppropriatePrompt("a premise")).resolves.toEqual(
      ALLOWED
    );
    expect(classify).toHaveBeenCalledTimes(2);
  });

  it("fails closed when every attempt fails", async () => {
    const classify = classifierAnswering(
      new Error("timeout"),
      new Error("rate limited"),
      ALLOWED
    );
    const filter = new ContentFilterService(classify);

    await expect(filter.isAppropriatePrompt("a premise")).rejects.toBeInstanceOf(
      ContentFilterUnavailableError
    );
    expect(classify).toHaveBeenCalledTimes(CONTENT_FILTER_ATTEMPTS);
  });

  it("screens the premise for every prohibited-content rule", async () => {
    const classify = classifierAnswering(ALLOWED);
    const filter = new ContentFilterService(classify);

    await filter.isAppropriatePrompt("a premise");

    const filterPrompt = classify.mock.calls[0][0];
    expect(filterPrompt).toContain("a premise");
    for (const rule of PROHIBITED_CONTENT_RULES) {
      expect(filterPrompt).toContain(rule);
    }
  });
});

describe("ContentFilterService.isAppropriateImageRequest", () => {
  it("screens the image request for every prohibited-content rule", async () => {
    const classify = classifierAnswering(ALLOWED);
    const filter = new ContentFilterService(classify);

    await filter.isAppropriateImageRequest("a portrait of the innkeeper", 0);

    const filterPrompt = classify.mock.calls[0][0];
    expect(filterPrompt).toContain("a portrait of the innkeeper");
    for (const rule of PROHIBITED_CONTENT_RULES) {
      expect(filterPrompt).toContain(rule);
    }
  });

  it("tells the classifier when reference images come with the request", async () => {
    const classify = classifierAnswering(ALLOWED, ALLOWED);
    const filter = new ContentFilterService(classify);

    await filter.isAppropriateImageRequest("the same person, at the beach", 2);
    await filter.isAppropriateImageRequest("the same person, at the beach", 0);

    const [withReferences, withoutReferences] = classify.mock.calls.map(
      (call) => call[0]
    );
    expect(withReferences).not.toEqual(withoutReferences);
  });

  it("fails closed when every attempt fails", async () => {
    const filter = new ContentFilterService(
      classifierAnswering(new Error("timeout"), new Error("timeout"))
    );

    await expect(
      filter.isAppropriateImageRequest("a portrait", 1)
    ).rejects.toBeInstanceOf(ContentFilterUnavailableError);
  });
});
