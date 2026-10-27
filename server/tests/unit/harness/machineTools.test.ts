import { describe, expect, it } from "@jest/globals";
import path from "node:path";
import { PLAYWRIGHT_MISSING, globalModuleRoots, loadPlaywright } from "../../../../harness/lib/browser.mjs";
import { findPgBin, namespaceUser, pgInvocation, socketDirectory } from "../../../../harness/lib/postgres.mjs";

/*
 * How the harness finds what it needs outside the project: PostgreSQL's
 * server binaries and the global Playwright. Pure lookups, on invented
 * folders; nothing here starts a database or a browser.
 */

describe("finding PostgreSQL's binaries", () => {
  const installed = new Set([
    path.join("/usr/lib/postgresql/14/bin", "initdb"),
    path.join("/usr/lib/postgresql/14/bin", "postgres"),
    path.join("/usr/lib/postgresql/16/bin", "initdb"),
    path.join("/usr/lib/postgresql/16/bin", "postgres"),
    path.join("/opt/pg/bin", "initdb"),
    path.join("/opt/pg/bin", "postgres"),
    path.join("/only-client/bin", "psql"),
  ]);
  const exists = (file: string) => installed.has(file);
  const readdir = () => ["9.6", "14", "16", "README"];

  it("takes --pg-bin when it holds initdb and postgres, and nothing else when it doesn't", () => {
    expect(findPgBin({ pgBin: "/opt/pg/bin", env: {}, platform: "linux", exists, readdir })).toBe(path.resolve("/opt/pg/bin"));
    expect(findPgBin({ pgBin: "/only-client/bin", env: { PATH: "/opt/pg/bin" }, platform: "linux", exists, readdir })).toBeUndefined();
  });

  it("prefers PATH, then the newest /usr/lib/postgresql version", () => {
    const pathDirs = ["/only-client/bin", "/opt/pg/bin"].join(path.delimiter);
    expect(findPgBin({ env: { PATH: pathDirs }, platform: "linux", exists, readdir })).toBe("/opt/pg/bin");
    expect(findPgBin({ env: { PATH: "/only-client/bin" }, platform: "linux", exists, readdir })).toBe(path.join("/usr/lib/postgresql", "16", "bin"));
  });

  it("finds none when no folder has both binaries", () => {
    expect(findPgBin({ env: { PATH: "/only-client/bin" }, platform: "linux", exists: () => false, readdir })).toBeUndefined();
    expect(
      findPgBin({
        env: {},
        platform: "linux",
        exists,
        readdir: () => {
          throw new Error("no such folder");
        },
      })
    ).toBeUndefined();
  });
});

describe("the database's unix socket", () => {
  it("lives under the output folder, in a shorter folder when the path would be too long, else nowhere", () => {
    const short = "/tmp/h";
    expect(socketDirectory({ out: short, pg: path.join(short, "pg") }, 54321, "linux")).toBe(path.join(short, "pg", "socket"));
    const longer = `/${"a".repeat(85)}`;
    expect(socketDirectory({ out: longer, pg: path.join(longer, "pg") }, 54321, "linux")).toBe(path.join(longer, "s"));
    const tooLong = `/${"a".repeat(94)}`;
    expect(socketDirectory({ out: tooLong, pg: path.join(tooLong, "pg") }, 54321, "linux")).toBe("");
    expect(socketDirectory({ out: short, pg: path.join(short, "pg") }, 54321, "win32")).toBe("");
  });
});

describe("running PostgreSQL as root", () => {
  const passwd = ["root:x:0:0:root:/root:/bin/bash", "daemon:x:1:1::/usr/sbin:/usr/sbin/nologin", "nobody:x:65534:65534::/nonexistent:/usr/sbin/nologin", "postgres:x:102:104::/var/lib/postgresql:/bin/bash", ""].join("\n");

  it("maps root to the postgres user, else nobody, else the first ordinary entry", () => {
    expect(namespaceUser(passwd)).toEqual({ name: "postgres", uid: "102", gid: "104" });
    expect(namespaceUser(passwd.replace(/^postgres.*$/m, ""))).toEqual({ name: "nobody", uid: "65534", gid: "65534" });
    expect(namespaceUser("root:x:0:0::/root:/bin/sh\ndaemon:x:1:1::/:/bin/false")).toEqual({ name: "daemon", uid: "1", gid: "1" });
    expect(namespaceUser("root:x:0:0::/root:/bin/sh")).toEqual({ name: "", uid: "1000", gid: "1000" });
  });

  it("wraps the tool in a user namespace for root on Linux only", () => {
    const bin = "/usr/lib/postgresql/16/bin";
    expect(pgInvocation(bin, "initdb", ["-D", "data"], { platform: "linux", uid: 0, mapTo: { uid: "102", gid: "104" } })).toEqual({
      command: "unshare",
      args: ["--user", "--map-user=102", "--map-group=104", path.join(bin, "initdb"), "-D", "data"],
    });
    expect(pgInvocation(bin, "initdb", ["-D", "data"], { platform: "linux", uid: 1000 })).toEqual({ command: path.join(bin, "initdb"), args: ["-D", "data"] });
    expect(pgInvocation(bin, "postgres", [], { platform: "darwin", uid: 0 })).toEqual({ command: path.join(bin, "postgres"), args: [] });
    expect(pgInvocation(bin, "initdb", [], { platform: "win32", uid: undefined }).command).toBe(path.join(bin, "initdb.exe"));
  });
});

describe("finding the global Playwright", () => {
  it("looks in NODE_PATH, then this Node's global folder, then npm's prefix", () => {
    expect(
      globalModuleRoots({
        execPath: "/opt/node22/bin/node",
        platform: "linux",
        env: { NODE_PATH: ["/extra/modules", ""].join(path.delimiter), npm_config_prefix: "/home/someone/.npm-global" },
      })
    ).toEqual(["/extra/modules", path.join("/opt/node22", "lib", "node_modules"), path.join("/home/someone/.npm-global", "lib", "node_modules")]);
    expect(globalModuleRoots({ execPath: "/usr/bin/node", platform: "linux", env: { npm_config_prefix: "/usr" } })).toEqual([path.join("/usr", "lib", "node_modules")]);
  });

  it("says how to install it, outside the project, when it is missing", async () => {
    await expect(loadPlaywright(["/nowhere/lib/node_modules"], () => false)).rejects.toThrow(PLAYWRIGHT_MISSING);
    expect(PLAYWRIGHT_MISSING).toContain("never installs it");
  });
});
