import type { DbConnectionSettings } from "../shared/dbSettings.js";

/*
 * The dev seed's guard (seedDevDatabase.ts): it writes synthetic rows, so it
 * runs only against a local development database on a developer's machine.
 * Checked before anything connects; every failed check is reported at once.
 */

/** Hosts that are this machine: loopback, or the docker-compose service name. */
export const LOCAL_DB_HOSTS: readonly string[] = [
  "localhost",
  "127.0.0.1",
  "::1",
  "postgres_dev",
];

/** Variables a Render service sets. Any of them means this is not a developer's machine. */
export const PRODUCTION_MARKERS: readonly string[] = [
  "RENDER",
  "RENDER_SERVICE_ID",
  "RENDER_SERVICE_NAME",
  "RENDER_INSTANCE_ID",
  "RENDER_EXTERNAL_HOSTNAME",
  "RENDER_EXTERNAL_URL",
];

/** A dev database's name ends in this (docker-compose.yml's is chosenpath_dev). */
export const DEV_DATABASE_SUFFIX = "_dev";

export type DevSeedTarget = Pick<DbConnectionSettings, "host" | "database">;

export type DevSeedVerdict = { ok: true } | { ok: false; reasons: string[] };

export function isLocalDbHost(host: string): boolean {
  const bare = host.trim().toLowerCase().replace(/^\[(.*)\]$/, "$1");
  return LOCAL_DB_HOSTS.includes(bare);
}

export function isDevDatabaseName(database: string): boolean {
  return (
    database.length > DEV_DATABASE_SUFFIX.length &&
    database.endsWith(DEV_DATABASE_SUFFIX)
  );
}

function urlHost(url: string): string | undefined {
  try {
    return new URL(url).hostname || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Whether the seed may write to `target`: NODE_ENV is not production, no
 * Render variable is set, DATABASE_URL (if set) names this machine, and the
 * database is a local one whose name ends in _dev.
 */
export function checkDevSeedTarget(
  env: NodeJS.ProcessEnv,
  target: DevSeedTarget
): DevSeedVerdict {
  const reasons: string[] = [];

  if ((env.NODE_ENV ?? "").trim().toLowerCase() === "production") {
    reasons.push('NODE_ENV is "production".');
  }

  for (const name of PRODUCTION_MARKERS) {
    if (env[name]?.trim()) {
      reasons.push(`${name} is set, as it is on a Render service.`);
    }
  }

  const databaseUrl = env.DATABASE_URL?.trim();
  if (databaseUrl) {
    const host = urlHost(databaseUrl);
    if (!host || !isLocalDbHost(host)) {
      reasons.push(
        `DATABASE_URL points at ${
          host ? `host "${host}"` : "a host that cannot be read"
        }, not this machine.`
      );
    }
  }

  if (!isLocalDbHost(target.host)) {
    reasons.push(
      `The database host "${target.host}" (DB_HOST) is not this machine; allowed: ${LOCAL_DB_HOSTS.join(
        ", "
      )}.`
    );
  }

  if (!isDevDatabaseName(target.database)) {
    reasons.push(
      `The database "${target.database}" (DB_DATABASE) is not a dev database; its name must end in "${DEV_DATABASE_SUFFIX}".`
    );
  }

  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

export function refusalMessage(reasons: string[]): string {
  return [
    "Refusing to seed: this does not look like a local development database. Nothing was connected to or written.",
    ...reasons.map((reason) => `  - ${reason}`),
    "See .context/storage.md, \"Local development database\".",
  ].join("\n");
}
