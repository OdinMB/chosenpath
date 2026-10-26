import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { Response } from "express";
import type { ImageGenerationErrorInfo } from "core/types/index.js";
import { ImageGenerationError } from "../../../src/images/AIImageGenerator.js";
import { sendImageGenerationError } from "../../../src/images/imageGenerationErrorResponse.js";

type Sent = {
  statusCode: number;
  body: { status: string; errorMessage: string; imageGenerationError?: ImageGenerationErrorInfo };
};

function send(error: Error): Sent {
  const sent: Sent[] = [];
  const res = {
    req: { originalUrl: "/image-generation/template/cover" },
    status(statusCode: number) {
      return {
        json(body: Sent["body"]) {
          sent.push({ statusCode, body });
        },
      };
    },
  } as unknown as Response;
  sendImageGenerationError(res, error, "r1");
  if (!sent[0]) throw new Error("nothing was sent");
  return sent[0];
}

let logged: unknown[][];

beforeEach(() => {
  logged = [];
  for (const method of ["log", "error"] as const) {
    jest.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      logged.push(args);
    });
  }
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("sendImageGenerationError", () => {
  it("answers an unexpected error with a plain 500 and keeps the detail in the server log", () => {
    const detail = "ENOENT: no such file or directory, open '/srv/data/templates/t1/cover.jpeg'";

    const sent = send(new Error(detail));

    expect(sent.statusCode).toBe(500);
    expect(sent.body.errorMessage).toBe("Failed to generate image");
    expect(JSON.stringify(sent.body)).not.toContain("ENOENT");
    expect(JSON.stringify(logged)).toContain("ENOENT");
  });

  it("keeps the editor's structured message for an image generation error", () => {
    const info: ImageGenerationErrorInfo = {
      errorCode: "CONTENT_POLICY",
      userFriendlyMessage: "That image request isn't allowed.",
      technicalMessage: "content_policy_violation",
      retryable: false,
    };

    const sent = send(new ImageGenerationError(info.userFriendlyMessage, info));

    expect(sent.statusCode).toBe(400);
    expect(sent.body.errorMessage).toBe("That image request isn't allowed.");
    expect(sent.body.imageGenerationError).toEqual({
      ...info,
      technicalMessage: "",
    });
    expect(JSON.stringify(sent.body)).not.toContain("content_policy_violation");
  });
});
