import dotenv from "dotenv";
import { dbConnectionSettings } from "../shared/dbSettings.js";
import { checkDevSeedTarget, refusalMessage, type DevSeedTarget } from "./devSeedGuard.js";
import { buildDevSeedPlan } from "./devSeedData.js";
import { applyDevSeed, writeBlankTemplateFiles } from "./devSeedWriter.js";

/*
 * Fills the local development database with synthetic data (devSeedData.ts).
 * From server/:
 *   npm run seed:dev
 * Steps and checks: .context/storage.md, "Local development database".
 * It refuses, before it connects, unless the target is a local database whose
 * name ends in _dev on a machine that is not production (devSeedGuard.ts).
 * A second run adds nothing; rows it did not create are never changed.
 */

function guard(target: DevSeedTarget): void {
  const verdict = checkDevSeedTarget(process.env, target);
  if (!verdict.ok) {
    throw new Error(refusalMessage(verdict.reasons));
  }
}

async function main(): Promise<void> {
  // The server's own .env (server/.env when run from server/), read before the
  // guard so it checks the settings db.ts will connect with.
  dotenv.config();
  const settings = dbConnectionSettings(process.env);
  guard(settings);
  console.log(
    `Seeding ${settings.database} on ${settings.host}:${settings.port} as ${settings.user}`
  );

  // Imported only now: db.ts builds its pool when it is loaded.
  const { initializeDatabase, closeDatabase, getDb } = await import("../shared/db.js");
  const pool = getDb();
  // The same check on the pool's own settings, before its first query.
  guard({ host: pool.options.host ?? "", database: pool.options.database ?? "" });

  try {
    const { createUser } = await import("../users/userService.js");
    const { userDbService } = await import("../users/UserDbService.js");
    const { getStoragePath } = await import("../shared/storageUtils.js");

    // Creates the tables and roles if they are missing, as the server does at startup.
    await initializeDatabase();

    const now = Date.now();
    const plan = buildDevSeedPlan(now);
    const report = await applyDevSeed(plan, {
      query: (text, values) => pool.query(text, values),
      findUserByEmail: (email) => userDbService.findUserByEmail(email),
      createUser,
      now,
    });
    const files = writeBlankTemplateFiles(
      plan,
      report.accounts,
      getStoragePath("templates")
    );

    for (const email of report.usersCreated) console.log(`created account  ${email}`);
    for (const email of report.usersKept) console.log(`kept account     ${email} (already there, unchanged)`);
    for (const { email, reason } of report.usersSkipped) {
      console.log(`skipped account  ${email} (${reason})`);
    }
    const { inserted, alreadyThere } = report;
    console.log(
      `Added ${inserted.templates} templates, ${inserted.stories} stories, ${inserted.storyPlayers} story players, ${inserted.feedback} feedback rows.`
    );
    console.log(
      `Already there: ${alreadyThere.templates} templates, ${alreadyThere.stories} stories, ${alreadyThere.storyPlayers} story players, ${alreadyThere.feedback} feedback rows.`
    );
    console.log(
      `Template files: ${files.written.length} written, ${files.kept.length} already there.`
    );
    console.log("Done. Log in with a seeded account (.context/storage.md).");
  } finally {
    await closeDatabase();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
