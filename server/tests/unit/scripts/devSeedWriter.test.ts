import fs from "fs";
import os from "os";
import path from "path";
import {
  buildDevSeedPlan,
  DEV_LOGIN_EMAIL,
  DEV_SEED_PASSWORD,
} from "../../../src/scripts/devSeedData.js";
import {
  applyDevSeed,
  writeBlankTemplateFiles,
  type DevSeedDeps,
  type SeedAccount,
} from "../../../src/scripts/devSeedWriter.js";

const NOW = Date.UTC(2026, 9, 26, 12, 0, 0);
const plan = buildDevSeedPlan(NOW);

type Call = { text: string; values: unknown[] };

/**
 * A stand-in for the database: accounts by email, and the keys of rows already
 * inserted, so a second run sees what the first one wrote.
 */
function fakeDatabase(existingAccounts: Record<string, SeedAccount> = {}) {
  const accounts = new Map(Object.entries(existingAccounts));
  const rows = new Set<string>();
  const calls: Call[] = [];
  const created: Array<{ email: string; username: string; password: string }> = [];
  let nextId = 1;

  const deps: DevSeedDeps = {
    now: NOW,
    query: async (text, values) => {
      calls.push({ text, values });
      if (!text.trimStart().startsWith("INSERT")) {
        return { rowCount: 1 };
      }
      const table = /INSERT INTO (\w+)/.exec(text)![1];
      const key =
        table === "story_players" ? `${table}:${values[0]}:${values[1]}` : `${table}:${values[0]}`;
      if (rows.has(key)) {
        return { rowCount: 0 };
      }
      rows.add(key);
      return { rowCount: 1 };
    },
    findUserByEmail: async (email) => accounts.get(email),
    createUser: async (email, username, password) => {
      if ([...accounts.values()].some((a) => a.username === username)) {
        throw new Error("Username already taken");
      }
      const account = { id: `new-${nextId++}`, username };
      accounts.set(email, account);
      created.push({ email, username, password });
      return account;
    },
  };
  return { deps, calls, created };
}

function insertsInto(calls: Call[], table: string): Call[] {
  return calls.filter((c) => new RegExp(`INSERT INTO ${table} `).test(c.text));
}

describe("applyDevSeed", () => {
  it("creates every account through sign-up with the dev password, and inserts every row", async () => {
    const { deps, calls, created } = fakeDatabase();
    const report = await applyDevSeed(plan, deps);

    expect(created.map((c) => c.email)).toEqual(plan.users.map((u) => u.email));
    expect(created.every((c) => c.password === DEV_SEED_PASSWORD)).toBe(true);
    expect(report.usersCreated).toEqual(plan.users.map((u) => u.email));
    expect(report.usersKept).toEqual([]);
    expect(report.inserted).toEqual({
      templates: plan.templates.length,
      stories: plan.stories.length,
      storyPlayers: plan.stories.reduce((n, s) => n + s.players.length, 0),
      feedback: plan.feedback.length,
    });
    expect(insertsInto(calls, "templates")).toHaveLength(plan.templates.length);
    expect(insertsInto(calls, "feedback")).toHaveLength(plan.feedback.length);
  });

  it("only inserts with ON CONFLICT DO NOTHING, and never deletes", async () => {
    const { deps, calls } = fakeDatabase();
    await applyDevSeed(plan, deps);
    for (const { text } of calls) {
      expect(text).not.toMatch(/\bDELETE\b|\bTRUNCATE\b|\bDROP\b/i);
      if (/\bINSERT\b/.test(text)) {
        expect(text).toMatch(/ON CONFLICT DO NOTHING/);
      }
    }
  });

  it("changes only the role of accounts it has just created", async () => {
    const { deps, calls } = fakeDatabase();
    const report = await applyDevSeed(plan, deps);
    const updates = calls.filter((c) => /^\s*UPDATE/.test(c.text));

    const raised = plan.users.filter((u) => u.roleId !== "role_user");
    expect(updates).toHaveLength(raised.length);
    for (const update of updates) {
      expect(update.text).toMatch(/^UPDATE users SET role_id = \$1, updated_at = \$2 WHERE id = \$3$/);
    }
    expect(updates.map((u) => [u.values[0], u.values[2]])).toEqual(
      raised.map((u) => [u.roleId, report.accounts.get(u.key)!.id])
    );
  });

  it("keeps an existing account as it is and links the synthetic rows to it", async () => {
    const existing = { id: "existing-login", username: "claude" };
    const { deps, calls, created } = fakeDatabase({ [DEV_LOGIN_EMAIL]: existing });
    const report = await applyDevSeed(plan, deps);

    expect(created.map((c) => c.email)).not.toContain(DEV_LOGIN_EMAIL);
    expect(report.usersKept).toEqual([DEV_LOGIN_EMAIL]);
    expect(calls.some((c) => /^\s*UPDATE/.test(c.text) && c.values.includes("existing-login"))).toBe(false);

    const loginSeats = insertsInto(calls, "story_players").filter((c) => c.values[3] === "existing-login");
    const loginKey = plan.users.find((u) => u.email === DEV_LOGIN_EMAIL)!.key;
    expect(loginSeats).toHaveLength(
      plan.stories.flatMap((s) => s.players).filter((p) => p.userKey === loginKey).length
    );
  });

  it("skips an account it cannot create and leaves its rows without a user", async () => {
    const { deps, calls } = fakeDatabase({ "someone@example.org": { id: "other", username: "dev_player2" } });
    const report = await applyDevSeed(plan, deps);

    expect(report.usersSkipped).toEqual([
      { email: "dev-player2@example.com", reason: "Username already taken" },
    ]);
    expect(report.accounts.has("player2")).toBe(false);
    const customStory = plan.stories.find((s) => s.creatorKey === "player2")!;
    const storyInsert = insertsInto(calls, "stories").find((c) => c.values[0] === customStory.id)!;
    expect(storyInsert.values[8]).toBeNull();
    for (const call of insertsInto(calls, "story_players")) {
      expect(call.values[3]).not.toBe("other");
    }
  });

  it("adds nothing on a second run", async () => {
    const { deps, calls, created } = fakeDatabase();
    await applyDevSeed(plan, deps);
    const firstRunCalls = calls.length;
    const createdFirst = created.length;

    const second = await applyDevSeed(buildDevSeedPlan(NOW + 60_000), deps);
    expect(created).toHaveLength(createdFirst);
    expect(second.usersCreated).toEqual([]);
    expect(second.usersKept).toEqual(plan.users.map((u) => u.email));
    expect(second.inserted).toEqual({ templates: 0, stories: 0, storyPlayers: 0, feedback: 0 });
    expect(calls.slice(firstRunCalls).some((c) => /^\s*UPDATE/.test(c.text))).toBe(false);
  });

  it("writes template rows the way the app stores them", async () => {
    const { deps, calls } = fakeDatabase();
    const report = await applyDevSeed(plan, deps);
    const template = plan.templates[0]!;
    const call = insertsInto(calls, "templates").find((c) => c.values[0] === template.id)!;
    expect(call.values).toEqual([
      template.id,
      report.accounts.get(template.creatorKey)!.id,
      template.publicationStatus,
      null,
      false,
      template.title,
      template.teaser,
      template.gameMode,
      template.tags.join(","),
      template.playerCountMin,
      template.playerCountMax,
      template.maxTurnsMin,
      template.maxTurnsMax,
      JSON.stringify(template.difficultyLevels),
      false,
      template.orderValue,
      template.createdAt,
      template.updatedAt,
    ]);
  });
});

describe("writeBlankTemplateFiles", () => {
  let templatesDir: string;

  beforeEach(() => {
    templatesDir = fs.mkdtempSync(path.join(os.tmpdir(), "dev-seed-templates-"));
  });

  afterEach(() => {
    fs.rmSync(templatesDir, { recursive: true, force: true });
  });

  it("writes one template.json per synthetic template", () => {
    const accounts = new Map([["worldbuilder", { id: "user-wb", username: "dev_worldbuilder" }]]);
    const result = writeBlankTemplateFiles(plan, accounts, templatesDir);

    expect(result.kept).toEqual([]);
    expect(result.written).toEqual(
      plan.templates.map((t) => path.join(templatesDir, t.id, "template.json"))
    );
    const first = JSON.parse(fs.readFileSync(result.written[0]!, "utf-8"));
    expect(first).toMatchObject({
      id: plan.templates[0]!.id,
      title: plan.templates[0]!.title,
      creatorId: "user-wb",
    });
  });

  it("leaves files that are already there untouched", () => {
    const template = plan.templates[0]!;
    const file = path.join(templatesDir, template.id, "template.json");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{"edited":true}');

    const result = writeBlankTemplateFiles(plan, new Map(), templatesDir);
    expect(result.kept).toEqual([file]);
    expect(result.written).toHaveLength(plan.templates.length - 1);
    expect(fs.readFileSync(file, "utf-8")).toBe('{"edited":true}');

    const again = writeBlankTemplateFiles(plan, new Map(), templatesDir);
    expect(again.written).toEqual([]);
    expect(again.kept).toHaveLength(plan.templates.length);
  });
});
