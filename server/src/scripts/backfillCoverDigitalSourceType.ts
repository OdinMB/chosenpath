import { getStoragePath } from "shared/storageUtils.js";
import { backfillCoverDigitalSourceType } from "./coverDigitalSourceTypeBackfill.js";

/*
 * CLI for the one-off template cover backfill (coverDigitalSourceTypeBackfill.ts).
 * The owner runs it once on the host that holds the template files; the app
 * never runs it. Dry run by default. From server/:
 *   npm run backfill:cover-dst                      lists the covers it would mark
 *   npm run backfill:cover-dst -- --write           marks them
 *   npm run backfill:cover-dst -- --dir <path>      another templates directory
 * On the production host, NODE_ENV=production resolves the default directory
 * to the persistent disk (server/src/config.ts STORAGE_PATHS).
 */

class UsageError extends Error {}

function parseArgs(argv: string[]): { write: boolean; dir: string } {
  let write = false;
  let dir = getStoragePath("templates");
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--write") {
      write = true;
    } else if (arg === "--dry-run") {
      write = false;
    } else if (arg === "--dir") {
      const value = argv[++i];
      if (!value) {
        throw new UsageError("--dir needs a path");
      }
      dir = value;
    } else {
      throw new UsageError(`Unknown argument: ${arg}`);
    }
  }
  return { write, dir };
}

function main(): void {
  const { write, dir } = parseArgs(process.argv.slice(2));
  console.log(`${write ? "Marking" : "Dry run over"} template covers in ${dir}`);
  const report = backfillCoverDigitalSourceType(dir, { write });
  for (const file of report.marked) {
    console.log(`${write ? "marked" : "would mark"}  ${file}`);
  }
  for (const { file, reason } of report.skipped) {
    console.log(`skipped (${reason})  ${file}`);
  }
  console.log(
    `${report.marked.length} ${write ? "marked" : "to mark"}, ${report.skipped.length} skipped.${
      write || report.marked.length === 0 ? "" : " Re-run with --write to apply."
    }`
  );
}

try {
  main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
