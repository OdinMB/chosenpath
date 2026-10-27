import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { markerLine } from "../../../../harness/lib/guard.mjs";
import { markerLog, startChild } from "../../../../harness/lib/processes.mjs";

/*
 * The harness's child processes (harness/lib/processes.mjs): a guard's
 * verdict is a marker line the process prints, often right before it exits,
 * so the harness must read it even then. Plain node scripts stand in for the
 * product's processes.
 */

let scratch: string;

beforeAll(() => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "harness-processes-test-"));
});

afterAll(() => {
  fs.rmSync(scratch, { recursive: true, force: true });
});

function script(name: string, source: string) {
  const file = path.join(scratch, name);
  fs.writeFileSync(file, source);
  return file;
}

function run(file: string, logName = path.basename(file)) {
  const markers = markerLog();
  const logFile = path.join(scratch, `${logName}.log`);
  const handle = startChild({
    name: path.basename(file),
    command: process.execPath,
    args: [file],
    cwd: scratch,
    env: { PATH: process.env.PATH ?? "" },
    logFile,
    onMarker: (marker) => markers.push(marker),
  });
  return { handle, markers, logFile };
}

async function waitUntil(condition: () => boolean, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("timed out");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe("the harness's child processes", () => {
  it("reads a refusal printed right before the process exits", async () => {
    const refusal = markerLine({ refused: ["planted variable"] });
    const file = script("refuses.mjs", `import fs from "node:fs";\nfs.writeSync(1, ${JSON.stringify(refusal)});\nprocess.exit(3);\n`);
    for (let attempt = 0; attempt < 5; attempt++) {
      const { handle, markers } = run(file, `refuses-${attempt}`);
      const verdict = await markers.waitFor((marker) => Array.isArray(marker.refused), { exit: handle.exit, timeoutMs: 20_000, what: "the verdict" });
      expect(verdict).toEqual({ refused: ["planted variable"] });
      expect((await handle.exit).code).toBe(3);
    }
  }, 60_000);

  it("rejects when the process exits without the marker", async () => {
    const { handle, markers } = run(script("silent.mjs", "process.exit(1);\n"));
    await expect(markers.waitFor((marker) => marker.ok === "server", { exit: handle.exit, timeoutMs: 20_000, what: "the verdict" })).rejects.toThrow(
      "the verdict: the process exited (code 1)"
    );
  }, 30_000);

  it("stops a process that ignores SIGTERM, after logging its output", async () => {
    const file = script("stubborn.mjs", 'process.on("SIGTERM", () => undefined);\nprocess.stdout.write("started\\n");\nsetInterval(() => undefined, 1000);\n');
    const { handle, logFile } = run(file);
    await waitUntil(() => fs.existsSync(logFile) && fs.readFileSync(logFile, "utf8").includes("started"));
    expect(handle.isRunning()).toBe(true);
    await handle.stop(300);
    expect(handle.isRunning()).toBe(false);
    expect((await handle.exit).signal).toBe("SIGKILL");
  }, 30_000);
});
