import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { Request, Response } from "express";

/*
 * The admin "System" page's diagnostic: it describes the caller's own request
 * and nothing else. It is admin only, reads and stores nothing, and its
 * answer must not be cached.
 */

const mockQuery =
  jest.fn<(query: string, params?: unknown[]) => Promise<{ rows: unknown[] }>>();
jest.unstable_mockModule("../../../src/shared/db.js", () => ({
  getDb: () => ({ query: mockQuery }),
}));

const { default: router } = await import("../../../src/system/adminSystemRoutes.js");

type Sent = { statusCode: number; body: Record<string, unknown>; headers: Record<string, string> };
type Handler = (req: Request, res: Response, next: () => void) => unknown;

function handlersOf(path: string): Handler[] {
  const layer = router.stack.find((entry) => entry.route?.path === path);
  const stack = layer?.route?.stack.map((entry) => entry.handle as Handler);
  if (!stack || stack.length === 0) throw new Error(`the route ${path} is missing`);
  return stack;
}

function fakeResponse(sent: Sent[], path: string): Response {
  const headers: Record<string, string> = {};
  return {
    req: { originalUrl: path },
    set(name: string, value: string) {
      headers[name.toLowerCase()] = value;
      return this;
    },
    status(statusCode: number) {
      return {
        json(body: Record<string, unknown>) {
          sent.push({ statusCode, body, headers });
        },
      };
    },
  } as unknown as Response;
}

const ADMIN = { id: "admin-user-id", username: "odin", email: "admin@example.org", roleId: "role_admin" };

function adminRequest(): Request {
  return {
    query: { requestId: "r1" },
    body: {},
    cookies: {},
    headers: { "x-forwarded-for": "203.0.113.7, 198.51.100.23", host: "api.example.org" },
    socket: { remoteAddress: "10.0.0.3" },
    protocol: "https",
    method: "GET",
    path: "/admin/system/connection",
    user: ADMIN,
  } as unknown as Request;
}

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({ rows: [] });
  for (const method of ["log", "warn", "error"] as const) {
    jest.spyOn(console, method).mockImplementation(() => undefined);
  }
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("GET /admin/system/connection", () => {
  it("refuses a caller without a session before the handler runs", async () => {
    const [guard] = handlersOf("/admin/system/connection");
    const sent: Sent[] = [];
    const next = jest.fn();
    const res = {
      status(statusCode: number) {
        return { json: (body: Record<string, unknown>) => sent.push({ statusCode, body, headers: {} }) };
      },
    } as unknown as Response;

    await guard!({ ...adminRequest(), user: undefined, cookies: {} } as unknown as Request, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(sent[0]?.statusCode).toBe(401);
  });

  it("answers with the caller's own connection report only, uncached, touching no database", async () => {
    const handlers = handlersOf("/admin/system/connection");
    const handler = handlers[handlers.length - 1]!;
    const sent: Sent[] = [];

    await handler(adminRequest(), fakeResponse(sent, "/admin/system/connection"), jest.fn());

    expect(sent).toHaveLength(1);
    expect(sent[0]!.statusCode).toBe(200);
    expect(sent[0]!.headers["cache-control"]).toBe("private, no-store");
    const data = sent[0]!.body.data as Record<string, unknown>;
    expect(Object.keys(data).sort()).toEqual(
      ["address", "candidates", "connectionAddress", "forwardedFor", "host", "protocol", "trustProxy"].sort()
    );
    expect(data.forwardedFor).toEqual(["203.0.113.7", "198.51.100.23"]);
    const answer = JSON.stringify(sent[0]!.body);
    for (const value of Object.values(ADMIN)) {
      expect(answer).not.toContain(value);
    }
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
