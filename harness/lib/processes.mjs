// Child processes the harness starts: output to a log file under the output
// folder, guard markers parsed from stdout, and a stop that escalates from
// SIGTERM to SIGKILL so nothing outlives the run.

import { spawn } from "node:child_process";
import fs from "node:fs";
import readline from "node:readline";
import { parseMarker } from "./guard.mjs";

/** `promise`, or undefined once `ms` have passed; the timer is cleared either way, so it holds nothing open. */
function within(promise, ms) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** The markers one process printed, and waiting for one of them. */
export function markerLog() {
  const records = [];
  const waiters = new Set();
  return {
    records,
    push(record) {
      records.push(record);
      for (const waiter of waiters) waiter();
    },
    /** The first record `pick` accepts; rejects when `exit` settles first or after `timeoutMs`. */
    waitFor(pick, { exit, timeoutMs, what }) {
      return new Promise((resolve, reject) => {
        const finish = (fn) => {
          clearTimeout(timer);
          waiters.delete(check);
          fn();
        };
        const check = () => {
          const found = records.find(pick);
          if (found) finish(() => resolve(found));
          return Boolean(found);
        };
        const timer = setTimeout(() => finish(() => reject(new Error(`${what}: nothing within ${Math.round(timeoutMs / 1000)}s`))), timeoutMs);
        waiters.add(check);
        if (check()) return;
        exit.then((result) => {
          if (!check()) finish(() => reject(Object.assign(new Error(`${what}: the process exited (code ${result.code})`), { exitResult: result })));
        });
      });
    },
  };
}

/**
 * Starts `command args` in `cwd` with exactly `env`. Every stdout and stderr
 * line goes to `logFile`; marker lines also go to `onMarker`.
 */
export function startChild({ name, command, args, cwd, env, logFile, onMarker = () => undefined }) {
  const log = fs.createWriteStream(logFile, { flags: "a" });
  const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  let exited = false;
  const processExit = new Promise((resolve) => {
    child.once("exit", (code, signal) => {
      exited = true;
      resolve({ code, signal });
    });
    child.once("error", (error) => {
      exited = true;
      log.write(`[harness] ${name} could not start: ${error.message}\n`);
      resolve({ code: -1, signal: null, error });
    });
  });
  // The log closes once both streams have ended, after their last line
  const drained = Promise.all(
    [child.stdout, child.stderr].map(
      (stream) =>
        new Promise((resolve) => {
          const lines = readline.createInterface({ input: stream });
          lines.on("line", (line) => {
            log.write(`${line}\n`);
            const marker = parseMarker(line);
            if (marker) onMarker(marker);
          });
          lines.on("close", resolve);
        })
    )
  ).then(() => new Promise((resolve) => log.end(resolve)));
  // Settles once the process has exited and its output has been read, so a
  // marker it printed just before exiting (a guard refusal) is never missed
  const exit = processExit.then(async (result) => {
    await within(drained, 5_000);
    return result;
  });

  /** SIGTERM, then SIGKILL after `graceMs`; resolves once the process is gone and its log is closed. */
  const stop = async (graceMs = 10_000) => {
    if (!exited) {
      child.kill("SIGTERM");
      const done = await within(processExit, graceMs);
      if (!done) {
        child.kill("SIGKILL");
        await within(processExit, 5_000);
      }
    }
    await within(drained, 5_000);
  };

  return { child, exit, stop, isRunning: () => !exited };
}
