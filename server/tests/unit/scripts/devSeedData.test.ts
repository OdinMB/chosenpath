import {
  blankTemplateDocument,
  buildDevSeedPlan,
  DEV_LOGIN_EMAIL,
  DEV_SEED_PASSWORD,
  devSeedId,
} from "../../../src/scripts/devSeedData.js";

const NOW = Date.UTC(2026, 9, 26, 12, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

describe("buildDevSeedPlan", () => {
  const plan = buildDevSeedPlan(NOW);

  it("is deterministic", () => {
    expect(buildDevSeedPlan(NOW)).toEqual(plan);
  });

  it("keeps every id when built at another time, so a later run finds the same rows", () => {
    const later = buildDevSeedPlan(NOW + 7 * DAY_MS);
    expect(later.templates.map((t) => t.id)).toEqual(plan.templates.map((t) => t.id));
    expect(later.stories.map((s) => s.id)).toEqual(plan.stories.map((s) => s.id));
    expect(later.feedback.map((f) => f.id)).toEqual(plan.feedback.map((f) => f.id));
    expect(later.stories.flatMap((s) => s.players.map((p) => p.code))).toEqual(
      plan.stories.flatMap((s) => s.players.map((p) => p.code))
    );
  });

  it("dates every row in the past month before now", () => {
    const times = [
      ...plan.templates.flatMap((t) => [t.createdAt, t.updatedAt]),
      ...plan.stories.flatMap((s) => [s.createdAt, s.updatedAt]),
      ...plan.feedback.map((f) => f.createdAt),
    ];
    for (const time of times) {
      expect(time).toBeLessThan(NOW);
      expect(time).toBeGreaterThanOrEqual(NOW - 31 * DAY_MS);
    }
  });

  it("uses only example.com addresses besides the local test login", () => {
    const emails = plan.users.map((u) => u.email);
    expect(emails).toContain(DEV_LOGIN_EMAIL);
    for (const email of emails.filter((e) => e !== DEV_LOGIN_EMAIL)) {
      expect(email).toMatch(/^[a-z0-9-]+@example\.com$/);
    }
    for (const item of plan.feedback) {
      if (item.contactInfo !== null) {
        expect(item.contactInfo).toMatch(/@example\.com$/);
      }
    }
  });

  it("labels everything as synthetic", () => {
    for (const user of plan.users.filter((u) => u.email !== DEV_LOGIN_EMAIL)) {
      expect(user.username).toMatch(/^dev_/);
    }
    for (const template of plan.templates) {
      expect(template.title).toMatch(/^Dev sample: /);
      expect(template.teaser).toMatch(/^Synthetic /);
    }
    for (const story of plan.stories) {
      expect(story.title).toMatch(/^Dev sample story: /);
    }
    for (const item of plan.feedback) {
      expect(item.comment).toMatch(/^Synthetic /);
      if (item.storyText !== null) {
        expect(item.storyText).toMatch(/^Synthetic /);
      }
    }
  });

  it("covers the admin, worldbuilder and ordinary user roles", () => {
    const roles = plan.users.map((u) => u.roleId);
    expect(roles).toEqual(
      expect.arrayContaining(["role_admin", "role_worldbuilder", "role_user"])
    );
    expect(plan.users.find((u) => u.email === DEV_LOGIN_EMAIL)?.roleId).toBe("role_admin");
  });

  it("uses unique keys, emails, usernames, ids and player codes", () => {
    const unique = (values: string[]) => expect(new Set(values).size).toBe(values.length);
    unique(plan.users.map((u) => u.key));
    unique(plan.users.map((u) => u.email));
    unique(plan.users.map((u) => u.username));
    unique([
      ...plan.templates.map((t) => t.id),
      ...plan.stories.map((s) => s.id),
      ...plan.feedback.map((f) => f.id),
    ]);
    unique(plan.stories.flatMap((s) => s.players.map((p) => p.code)));
  });

  it("gives player codes the app's format (6 letters or digits)", () => {
    for (const code of plan.stories.flatMap((s) => s.players.map((p) => p.code))) {
      expect(code).toMatch(/^[A-Z0-9]{6}$/);
    }
  });

  it("gives feedback ids the app's feedback_ prefix and the rest UUIDs", () => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    for (const item of plan.feedback) {
      expect(item.id.replace(/^feedback_/, "")).toMatch(uuid);
      expect(item.id).toMatch(/^feedback_/);
    }
    for (const id of [...plan.templates.map((t) => t.id), ...plan.stories.map((s) => s.id)]) {
      expect(id).toMatch(uuid);
    }
  });

  it("refers only to users, templates and stories in the plan", () => {
    const userKeys = new Set(plan.users.map((u) => u.key));
    const templateIds = new Set(plan.templates.map((t) => t.id));
    const storyIds = new Set(plan.stories.map((s) => s.id));
    for (const template of plan.templates) {
      expect(userKeys.has(template.creatorKey)).toBe(true);
    }
    for (const story of plan.stories) {
      expect(userKeys.has(story.creatorKey)).toBe(true);
      if (story.templateId !== null) {
        expect(templateIds.has(story.templateId)).toBe(true);
      }
      for (const player of story.players) {
        if (player.userKey !== null) {
          expect(userKeys.has(player.userKey)).toBe(true);
        }
      }
    }
    for (const item of plan.feedback) {
      if (item.userKey !== null) {
        expect(userKeys.has(item.userKey)).toBe(true);
      }
      if (item.storyId !== null) {
        expect(storyIds.has(item.storyId)).toBe(true);
        expect(item.storyTitle).toBe(plan.stories.find((s) => s.id === item.storyId)?.title);
      }
    }
  });

  it("fits each story's players into its template's player count and its beat into its turns", () => {
    for (const story of plan.stories) {
      expect(story.currentBeat).toBeLessThanOrEqual(story.maxTurns);
      expect(story.players.map((p) => p.slot)).toEqual(
        story.players.map((_, i) => `player${i + 1}`)
      );
      const template = plan.templates.find((t) => t.id === story.templateId);
      if (template) {
        expect(story.players.length).toBeGreaterThanOrEqual(template.playerCountMin);
        expect(story.players.length).toBeLessThanOrEqual(template.playerCountMax);
        expect(story.maxTurns).toBeGreaterThanOrEqual(template.maxTurnsMin);
        expect(story.maxTurns).toBeLessThanOrEqual(template.maxTurnsMax);
      }
    }
  });

  it("gives the local test login stories in progress and an archived one", () => {
    const login = plan.users.find((u) => u.email === DEV_LOGIN_EMAIL)!;
    const seats = plan.stories.flatMap((s) => s.players.filter((p) => p.userKey === login.key));
    expect(seats.filter((p) => p.status === "active").length).toBeGreaterThanOrEqual(2);
    expect(seats.some((p) => p.status === "archived")).toBe(true);
  });

  it("has published templates for the library", () => {
    expect(plan.templates.filter((t) => t.publicationStatus === "published").length).toBeGreaterThanOrEqual(2);
  });
});

describe("devSeedId", () => {
  it("is stable and distinct per kind and key", () => {
    expect(devSeedId("story", "a")).toBe(devSeedId("story", "a"));
    expect(devSeedId("story", "a")).not.toBe(devSeedId("template", "a"));
    expect(devSeedId("story", "a")).not.toBe(devSeedId("story", "b"));
  });
});

describe("DEV_SEED_PASSWORD", () => {
  it("is the local test password CLAUDE.md gives", () => {
    expect(DEV_SEED_PASSWORD).toBe("asdF!234");
  });
});

describe("blankTemplateDocument", () => {
  const plan = buildDevSeedPlan(NOW);
  const template = plan.templates[0]!;

  it("carries the template row's settings and a blank story setup", () => {
    const document = blankTemplateDocument(template, { id: "user-1", username: "dev_worldbuilder" });
    expect(document).toMatchObject({
      id: template.id,
      creatorId: "user-1",
      creatorUsername: "dev_worldbuilder",
      title: template.title,
      teaser: template.teaser,
      gameMode: template.gameMode,
      tags: template.tags,
      difficultyLevels: template.difficultyLevels,
      playerCountMin: template.playerCountMin,
      playerCountMax: template.playerCountMax,
      maxTurnsMin: template.maxTurnsMin,
      maxTurnsMax: template.maxTurnsMax,
      publicationStatus: template.publicationStatus,
      order: template.orderValue,
      containsImages: false,
      createdAt: new Date(template.createdAt).toISOString(),
      updatedAt: new Date(template.updatedAt).toISOString(),
      storyElements: [],
      sharedOutcomes: [],
      sharedStats: [],
      playerStats: [],
    });
    for (const slot of ["player1", "player2", "player3"] as const) {
      expect(document[slot]).toEqual({
        outcomes: [],
        possibleCharacterIdentities: [],
        possibleCharacterBackgrounds: [],
      });
    }
  });

  it("leaves the creator out when the account is missing", () => {
    const document = blankTemplateDocument(template, undefined);
    expect(document).not.toHaveProperty("creatorId");
    expect(document).not.toHaveProperty("creatorUsername");
  });

  it("does not share arrays with the plan", () => {
    const document = blankTemplateDocument(template, undefined);
    document.tags.push("Changed");
    document.difficultyLevels[0]!.title = "Changed";
    expect(template.tags).not.toContain("Changed");
    expect(template.difficultyLevels[0]!.title).not.toBe("Changed");
  });
});
