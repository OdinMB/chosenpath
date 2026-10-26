import fs from "fs";
import path from "path";
import {
  DEV_SEED_PASSWORD,
  blankTemplateDocument,
  type DevSeedPlan,
} from "./devSeedData.js";

/*
 * Writes a dev seed plan (devSeedData.ts). Insert-only: accounts go through the
 * app's own sign-up (createUser), an existing account is used as it is, and
 * every other row is inserted with ON CONFLICT DO NOTHING. The one UPDATE sets
 * the role of an account this run has just created. The database calls are
 * passed in, so the CLI (seedDevDatabase.ts) connects only after its guard.
 */

export type SeedAccount = { id: string; username: string };

export type DevSeedDeps = {
  query: (text: string, values: unknown[]) => Promise<{ rowCount: number | null }>;
  findUserByEmail: (email: string) => Promise<SeedAccount | undefined>;
  createUser: (email: string, username: string, password: string) => Promise<SeedAccount>;
  now: number;
};

type TableCounts = { templates: number; stories: number; storyPlayers: number; feedback: number };

export type DevSeedReport = {
  /** The account each seed user key stands for; missing where one could not be created. */
  accounts: Map<string, SeedAccount>;
  usersCreated: string[];
  usersKept: string[];
  usersSkipped: Array<{ email: string; reason: string }>;
  inserted: TableCounts;
  alreadyThere: TableCounts;
};

const INSERT_TEMPLATE = `
  INSERT INTO templates (
    id, creator_id, publication_status, carousel_order, contains_images,
    title, teaser, game_mode, tags, player_count_min, player_count_max,
    max_turns_min, max_turns_max, difficulty_levels, show_on_welcome_screen, order_value,
    created_at, updated_at
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
  ON CONFLICT DO NOTHING
`;

const INSERT_STORY = `
  INSERT INTO stories (id, title, template_id, created_at, updated_at, max_turns, generate_images, pregenerate_beats, creator_id, current_beat, difficulty_title, difficulty_modifier)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  ON CONFLICT DO NOTHING
`;

const INSERT_STORY_PLAYER = `
  INSERT INTO story_players (story_id, player_slot, code, user_id, last_played_at, is_pending, status)
  VALUES ($1, $2, $3, $4, $5, $6, $7)
  ON CONFLICT DO NOTHING
`;

const INSERT_FEEDBACK = `
  INSERT INTO feedback (id, type, rating, comment, story_id, story_title, contact_info, story_text, user_id, created_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  ON CONFLICT DO NOTHING
`;

const SET_NEW_USER_ROLE = "UPDATE users SET role_id = $1, updated_at = $2 WHERE id = $3";

export async function applyDevSeed(
  plan: DevSeedPlan,
  deps: DevSeedDeps
): Promise<DevSeedReport> {
  const report: DevSeedReport = {
    accounts: new Map(),
    usersCreated: [],
    usersKept: [],
    usersSkipped: [],
    inserted: { templates: 0, stories: 0, storyPlayers: 0, feedback: 0 },
    alreadyThere: { templates: 0, stories: 0, storyPlayers: 0, feedback: 0 },
  };

  for (const user of plan.users) {
    const existing = await deps.findUserByEmail(user.email);
    if (existing) {
      report.accounts.set(user.key, existing);
      report.usersKept.push(user.email);
      continue;
    }
    let created: SeedAccount;
    try {
      created = await deps.createUser(user.email, user.username, DEV_SEED_PASSWORD);
    } catch (error: unknown) {
      report.usersSkipped.push({
        email: user.email,
        reason: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    if (user.roleId !== "role_user") {
      await deps.query(SET_NEW_USER_ROLE, [user.roleId, deps.now, created.id]);
    }
    report.accounts.set(user.key, created);
    report.usersCreated.push(user.email);
  }

  const idOf = (key: string | null): string | null =>
    key === null ? null : report.accounts.get(key)?.id ?? null;

  const insert = async (table: keyof TableCounts, text: string, values: unknown[]) => {
    const result = await deps.query(text, values);
    if ((result.rowCount ?? 0) > 0) {
      report.inserted[table] += 1;
    } else {
      report.alreadyThere[table] += 1;
    }
  };

  for (const template of plan.templates) {
    await insert("templates", INSERT_TEMPLATE, [
      template.id,
      idOf(template.creatorKey),
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
  }

  for (const story of plan.stories) {
    await insert("stories", INSERT_STORY, [
      story.id,
      story.title,
      story.templateId,
      story.createdAt,
      story.updatedAt,
      story.maxTurns,
      false,
      false,
      idOf(story.creatorKey),
      story.currentBeat,
      story.difficulty.title,
      story.difficulty.modifier,
    ]);
    for (const player of story.players) {
      await insert("storyPlayers", INSERT_STORY_PLAYER, [
        story.id,
        player.slot,
        player.code,
        idOf(player.userKey),
        player.lastPlayedAt,
        player.isPending,
        player.status,
      ]);
    }
  }

  for (const item of plan.feedback) {
    await insert("feedback", INSERT_FEEDBACK, [
      item.id,
      item.type,
      item.rating,
      item.comment,
      item.storyId,
      item.storyTitle,
      item.contactInfo,
      item.storyText,
      idOf(item.userKey),
      item.createdAt,
    ]);
  }

  return report;
}

/**
 * Writes each synthetic template's template.json under `templatesDir`, where
 * the app reads templates (storageUtils' getStoragePath("templates")). A file
 * that is already there is left as it is.
 */
export function writeBlankTemplateFiles(
  plan: DevSeedPlan,
  accounts: Map<string, SeedAccount>,
  templatesDir: string
): { written: string[]; kept: string[] } {
  const written: string[] = [];
  const kept: string[] = [];
  for (const template of plan.templates) {
    const file = path.join(templatesDir, template.id, "template.json");
    if (fs.existsSync(file)) {
      kept.push(file);
      continue;
    }
    const document = blankTemplateDocument(template, accounts.get(template.creatorKey));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(document, null, 2), { flag: "wx" });
    written.push(file);
  }
  return { written, kept };
}
