// Runs one CSS snippet through Vite's CSS pipeline with the client's own
// vite.config.ts and client/ as Vite's root, the way `vite build` does,
// from whatever folder this process was started in. Prints the result.
//
//   node cssThroughViteConfig.mjs <vite.config.ts> <empty env folder> <css>
//
// The env folder stands in for client/, so no .env file is read. Nothing is
// built or written, apart from the temporary copy of the config that Vite's
// config loader keeps in node_modules/.vite-temp while it loads it.

import path from "node:path";
import { preprocessCSS, resolveConfig } from "vite";

const [configFile, envDir, css] = process.argv.slice(2);
const root = path.dirname(configFile);

const config = await resolveConfig({ configFile, root, envDir, logLevel: "silent" }, "build", "production");
const { code } = await preprocessCSS(css, path.join(root, "src", "probe.css"), config);
process.stdout.write(code);
