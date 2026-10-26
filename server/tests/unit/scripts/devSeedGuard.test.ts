import {
  checkDevSeedTarget,
  isDevDatabaseName,
  isLocalDbHost,
  PRODUCTION_MARKERS,
  refusalMessage,
} from "../../../src/scripts/devSeedGuard.js";
import { dbConnectionSettings } from "../../../src/shared/dbSettings.js";

const local = { host: "localhost", database: "chosenpath_dev" };

function reasonsFor(
  env: NodeJS.ProcessEnv,
  target: { host: string; database: string } = local
): string[] {
  const verdict = checkDevSeedTarget(env, target);
  return verdict.ok ? [] : verdict.reasons;
}

describe("dbConnectionSettings", () => {
  it("falls back to the docker-compose database when nothing is set", () => {
    expect(dbConnectionSettings({})).toEqual({
      user: "devuser",
      host: "localhost",
      database: "chosenpath_dev",
      password: "devpassword",
      port: 5432,
    });
  });

  it("reads DB_HOST, DB_DATABASE, DB_USER, DB_PASSWORD and DB_PORT", () => {
    expect(
      dbConnectionSettings({
        DB_HOST: "db.internal",
        DB_DATABASE: "chosenpath",
        DB_USER: "app",
        DB_PASSWORD: "secret",
        DB_PORT: "6543",
      })
    ).toEqual({
      user: "app",
      host: "db.internal",
      database: "chosenpath",
      password: "secret",
      port: 6543,
    });
  });
});

describe("checkDevSeedTarget", () => {
  it("accepts the docker-compose defaults with no NODE_ENV", () => {
    expect(checkDevSeedTarget({}, dbConnectionSettings({}))).toEqual({ ok: true });
  });

  it("accepts development and test NODE_ENV values", () => {
    expect(reasonsFor({ NODE_ENV: "development" })).toEqual([]);
    expect(reasonsFor({ NODE_ENV: "test" })).toEqual([]);
  });

  it.each(["localhost", "LOCALHOST", "127.0.0.1", "::1", "[::1]", "postgres_dev", " localhost "])(
    "accepts the local host %p",
    (host) => {
      expect(reasonsFor({}, { host, database: "chosenpath_dev" })).toEqual([]);
    }
  );

  it("accepts any database name ending in _dev", () => {
    expect(reasonsFor({}, { host: "localhost", database: "other_dev" })).toEqual([]);
  });

  it.each(["production", "Production", " PRODUCTION "])(
    "refuses NODE_ENV %p",
    (nodeEnv) => {
      expect(reasonsFor({ NODE_ENV: nodeEnv })).toEqual(['NODE_ENV is "production".']);
    }
  );

  it.each([...PRODUCTION_MARKERS])("refuses when %s is set", (name) => {
    const reasons = reasonsFor({ [name]: "true" });
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toContain(name);
  });

  it("ignores an empty Render variable", () => {
    expect(reasonsFor({ RENDER: "" })).toEqual([]);
  });

  it("refuses a database host that is not this machine", () => {
    const reasons = reasonsFor({}, { host: "dpg-abc123.frankfurt-postgres.render.com", database: "chosenpath_dev" });
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toContain("dpg-abc123.frankfurt-postgres.render.com");
    expect(reasons[0]).toContain("DB_HOST");
  });

  it("refuses a socket path or an address that only looks local", () => {
    expect(reasonsFor({}, { host: "/var/run/postgresql", database: "chosenpath_dev" })).toHaveLength(1);
    expect(reasonsFor({}, { host: "localhost.example.com", database: "chosenpath_dev" })).toHaveLength(1);
    expect(reasonsFor({}, { host: "10.0.0.5", database: "chosenpath_dev" })).toHaveLength(1);
  });

  it.each(["chosenpath", "chosenpath_dev_backup", "_dev", "chosenpath-dev", ""])(
    "refuses the database name %p",
    (database) => {
      const reasons = reasonsFor({}, { host: "localhost", database });
      expect(reasons).toHaveLength(1);
      expect(reasons[0]).toContain("DB_DATABASE");
    }
  );

  it("refuses a DATABASE_URL on another host, without printing its credentials", () => {
    const reasons = reasonsFor({
      DATABASE_URL: "postgres://app:s3cret@dpg-abc123.oregon-postgres.render.com:5432/chosenpath",
    });
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toContain("dpg-abc123.oregon-postgres.render.com");
    expect(reasons[0]).not.toContain("s3cret");
  });

  it("accepts a DATABASE_URL on this machine", () => {
    expect(
      reasonsFor({ DATABASE_URL: "postgres://devuser:devpassword@localhost:5432/chosenpath_dev" })
    ).toEqual([]);
    expect(reasonsFor({ DATABASE_URL: "postgresql://devuser@[::1]:5432/chosenpath_dev" })).toEqual([]);
  });

  it("refuses a DATABASE_URL whose host cannot be read", () => {
    expect(reasonsFor({ DATABASE_URL: "not a url" })).toEqual([
      "DATABASE_URL points at a host that cannot be read, not this machine.",
    ]);
    expect(reasonsFor({ DATABASE_URL: "postgres:///chosenpath_dev" })).toHaveLength(1);
  });

  it("reports every failed check at once", () => {
    const reasons = reasonsFor(
      { NODE_ENV: "production", RENDER: "true", RENDER_SERVICE_ID: "srv-123" },
      { host: "db.example.net", database: "chosenpath" }
    );
    expect(reasons).toHaveLength(5);
  });
});

describe("isLocalDbHost and isDevDatabaseName", () => {
  it("match only the listed hosts and _dev names", () => {
    expect(isLocalDbHost("127.0.0.1")).toBe(true);
    expect(isLocalDbHost("127.0.0.2")).toBe(false);
    expect(isDevDatabaseName("chosenpath_dev")).toBe(true);
    expect(isDevDatabaseName("chosenpath_DEV")).toBe(false);
  });
});

describe("refusalMessage", () => {
  it("says nothing was written and lists each reason", () => {
    const message = refusalMessage(["first reason", "second reason"]);
    expect(message).toContain("Refusing to seed");
    expect(message).toContain("Nothing was connected to or written");
    expect(message).toContain("  - first reason");
    expect(message).toContain("  - second reason");
  });
});
