import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

/*
 * Every sign-in opens a session of its own, keyed by its token: two sign-ins
 * to one account in the same second both succeed, and each session signs its
 * holder in until it ends. The token's lifetime is the session's.
 */

type Session = { token: string; userId: string; expiresAt: number; isRemembered: boolean; createdAt: number };
type Account = {
  id: string;
  email: string;
  username: string;
  roleId: string;
  passwordHash: string;
  createdAt: number;
  lastLoginAt: number | null;
};

const PASSPHRASE = "a-local-test-passphrase";
const ACCOUNT: Account = {
  id: "reader-1",
  email: "reader@example.test",
  username: "reader",
  roleId: "role_user",
  passwordHash: "",
  createdAt: 1_700_000_000_000,
  lastLoginAt: null,
};

/** The sessions table: its primary key is the token, so a second insert of one token is refused, as Postgres refuses it. */
const sessions = new Map<string, Session>();

jest.unstable_mockModule("../../../src/users/UserDbService.js", () => ({
  userDbService: {
    findUserByEmail: jest.fn(async (email: string) => (email === ACCOUNT.email ? ACCOUNT : undefined)),
    findUserById: jest.fn(async (id: string) => (id === ACCOUNT.id ? ACCOUNT : undefined)),
    getUserPermissions: jest.fn(async () => ["templates_create"]),
    updateUserLastLogin: jest.fn(async () => undefined),
    createSessionEntry: jest.fn(async (token: string, userId: string, expiresAt: number, isRemembered: boolean) => {
      if (sessions.has(token)) {
        throw new Error('duplicate key value violates unique constraint "sessions_pkey"');
      }
      sessions.set(token, { token, userId, expiresAt, isRemembered, createdAt: Date.now() });
    }),
    findSessionByToken: jest.fn(async (token: string) => {
      const session = sessions.get(token);
      return session && session.expiresAt > Date.now() ? session : undefined;
    }),
    deleteSessionByToken: jest.fn(async (token: string) => sessions.delete(token)),
  },
}));
jest.unstable_mockModule("../../../src/stories/storyOrigins.js", () => ({
  forgetStoriesOfCreator: jest.fn(),
}));

const { authenticateUser, verifyToken, logoutUser, refreshTokenPermissions } = await import(
  "../../../src/users/userService.js"
);

/** Early in a second, so everything a test does lands within it. */
const NOW = 1_800_000_000_100;
const DAY_MS = 24 * 60 * 60 * 1000;

beforeAll(async () => {
  ACCOUNT.passwordHash = await bcrypt.hash(PASSPHRASE, 4);
});

beforeEach(() => {
  for (const method of ["log", "warn", "error"] as const) {
    jest.spyOn(console, method).mockImplementation(() => undefined);
  }
  jest.spyOn(Date, "now").mockReturnValue(NOW);
  sessions.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

const signIn = (remember = false) => authenticateUser(ACCOUNT.email, PASSPHRASE, remember);
const claimsOf = (token: string) => jwt.decode(token) as Record<string, unknown>;

describe("two sign-ins to one account in the same second", () => {
  it("both succeed, one after the other, each with a token of its own", async () => {
    const first = await signIn();
    const second = await signIn();

    expect(claimsOf(first.token).iat).toBe(claimsOf(second.token).iat);
    expect(second.token).not.toBe(first.token);
    expect(sessions.size).toBe(2);
  });

  it("both succeed when they arrive at once", async () => {
    const [first, second] = await Promise.all([signIn(), signIn()]);

    expect(second.token).not.toBe(first.token);
    expect(sessions.size).toBe(2);
  });

  it("each session signs its holder in, and signing out of one keeps the other", async () => {
    const first = await signIn();
    const second = await signIn();

    expect((await verifyToken(first.token))?.id).toBe(ACCOUNT.id);
    expect((await verifyToken(second.token))?.id).toBe(ACCOUNT.id);

    await logoutUser(first.token);

    expect(await verifyToken(first.token)).toBeNull();
    expect((await verifyToken(second.token))?.id).toBe(ACCOUNT.id);
  });
});

describe("a sign-in's token", () => {
  it.each([
    ["a sign-in", false, DAY_MS],
    ["a remembered sign-in", true, 30 * DAY_MS],
  ])("lives as long as %s's session", async (_what, remember, lifetime) => {
    const { token, expiresAt } = await signIn(remember);

    expect(expiresAt).toBe(NOW + lifetime);
    expect(claimsOf(token)).toMatchObject({
      userId: ACCOUNT.id,
      username: ACCOUNT.username,
      roleId: ACCOUNT.roleId,
      permissions: ["templates_create"],
      iat: Math.floor(NOW / 1000),
      exp: Math.floor((NOW + lifetime) / 1000),
    });
    expect(sessions.get(token)?.expiresAt).toBe(NOW + lifetime);
  });

  it("is refused once its session is gone", async () => {
    const { token } = await signIn();
    sessions.clear();

    expect(await verifyToken(token)).toBeNull();
  });
});

describe("a permissions refresh", () => {
  it("in the same second as the sign-in, gives the session a token of its own with the same expiry, and the old one stops working", async () => {
    const signedIn = await signIn();

    const refreshed = await refreshTokenPermissions(signedIn.token);

    expect(refreshed?.token).toBeDefined();
    expect(refreshed?.token).not.toBe(signedIn.token);
    expect(claimsOf(refreshed!.token).exp).toBe(claimsOf(signedIn.token).exp);
    expect(refreshed?.expiresAt).toBe(signedIn.expiresAt);
    expect(await verifyToken(signedIn.token)).toBeNull();
    expect((await verifyToken(refreshed!.token))?.id).toBe(ACCOUNT.id);
  });
});
