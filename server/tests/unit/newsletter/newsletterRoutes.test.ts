import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { Request, Response } from "express";

const INTERNAL_DETAIL = "connect ECONNREFUSED 10.0.0.7:443 (mailjet key mj-secret-123)";

const subscribeToNewsletter =
  jest.fn<(email: string) => Promise<{ success: boolean; message: string }>>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockModule = (jest as any).unstable_mockModule;
await mockModule("../../../src/newsletter/newsletterService.js", () => ({
  __esModule: true,
  subscribeToNewsletter,
}));

const { default: router } = await import("../../../src/newsletter/newsletterRoutes.js");

type Sent = { statusCode: number; body: { status: string; errorMessage?: string } };

async function subscribe(email: string): Promise<Sent> {
  const layer = router.stack.find((entry) => entry.route?.path === "/newsletter/subscribe");
  const handle = layer?.route?.stack[0]?.handle;
  if (!handle) throw new Error("the subscribe route is missing");

  const sent: Sent[] = [];
  const res = {
    req: { originalUrl: "/newsletter/subscribe" },
    status(statusCode: number) {
      return {
        json(body: Sent["body"]) {
          sent.push({ statusCode, body });
        },
      };
    },
  } as unknown as Response;
  const req = { query: {}, body: { email, requestId: "r1" } } as unknown as Request;
  await handle(req, res, jest.fn<() => void>());
  if (!sent[0]) throw new Error("the route sent nothing");
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
  subscribeToNewsletter.mockReset();
});

describe("POST /newsletter/subscribe", () => {
  it("answers an unexpected failure with a plain 500 and keeps the detail in the server log", async () => {
    subscribeToNewsletter.mockRejectedValue(new Error(INTERNAL_DETAIL));

    const sent = await subscribe("reader@example.com");

    expect(sent.statusCode).toBe(500);
    expect(sent.body.errorMessage).toBe("Failed to subscribe to newsletter");
    expect(JSON.stringify(sent.body)).not.toContain("ECONNREFUSED");
    expect(JSON.stringify(logged)).toContain("ECONNREFUSED");
  });

  it("keeps the service's own message for a declined subscription", async () => {
    subscribeToNewsletter.mockResolvedValue({
      success: false,
      message: "Failed to subscribe to newsletter",
    });

    const sent = await subscribe("reader@example.com");

    expect(sent.statusCode).toBe(400);
    expect(sent.body.errorMessage).toBe("Failed to subscribe to newsletter");
  });
});
