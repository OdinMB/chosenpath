## Deployment & Workspace Dependencies

This monorepo deploys successfully to platforms like Render using workspace isolation:

### Production Build Process

- **Server**: TypeScript compilation resolves `core/*` imports via tsconfig paths, then copies core's built files into `server/dist/core/` making the deployment self-contained
- **Client**: Vite build process bundles core code directly into the client bundle via alias resolution
- **Individual package-lock.json files**: Not needed - workspace dependencies are managed at root level, but build processes copy/bundle core at build time

### Why the server build pins its compiler

Render installs with devDependencies omitted. Its install log matches a `NODE_ENV=production npm install` of this lockfile, not a full install. TypeScript and tsc-alias are devDependencies, so a bare `tsc` in a build script fell through to whatever `tsc` is on Render's PATH. That compiler evidently tracks `typescript@latest`: it was 5.x when the March 2026 deploy succeeded and 7.x by September 2026. TypeScript 7 removed `baseUrl` and `alwaysStrict: false`, so the build failed with `TS5102: Option 'baseUrl' has been removed`.

So the server `build` script:

- runs `npm install --include=dev` in core and server, which overrides `NODE_ENV=production` / `omit=dev`;
- calls the compiler as `node ../node_modules/typescript/bin/tsc` (in core's `build` too), so a global `tsc` can never be picked. A missing local install fails loudly instead;
- prints `Version 5.7.3` before compiling, so the Render log shows which compiler ran.

Keep TypeScript upgrades deliberate: bump it in the lockfile and check the build, not the platform's PATH.

The tsconfigs carry no `baseUrl`, and `paths` are relative to each tsconfig file. tsc-alias only enables its `base-url` replacer when `baseUrl` is set, and that replacer is what rewrites `core/*` imports to the copied `dist/core/`. `server/tsconfig.json` turns it on explicitly (`"tsc-alias": { "replacers": { "base-url": { "enabled": true } } }`). If you remove that, the server's `core/*` imports stay bare in `dist` and the server fails at startup.

### Text-model environment variables

Since the GPT-6 migration (2026-09-27), production text calls run only on `gpt-6-*` models, and the code defaults are the settled ones, so no text-model variable needs to be set. Seven groups can be overridden, each by `<PREFIX>_NAME` and `<PREFIX>_REASONING_EFFORT` (none, low, medium or high): `SETUP_MODEL`, `GENERATION_MODEL`, `TEXT_MODEL`, `MULTIPLAYER_TEXT_MODEL`, `SWITCH_THREAD_MODEL`, `MULTIPLAYER_SWITCH_THREAD_MODEL`, `CONTENT_FILTER_MODEL`. Defaults and rules: `.context/text-model-eval.md`, "Production text calls".

- A leftover gpt-4.x `_NAME` (for example `TEXT_MODEL_NAME=gpt-4.1-mini`), a `_NAME` without its `_REASONING_EFFORT`, or the gpt-4-era effort `minimal` stops the server at startup with the variable and its replacement. Clear these on Render (and in `server/.env`) before deploying a build that includes the migration. Clearing them early is safe: a pre-migration build falls back to its own gpt-4.1 defaults.
- Never set a `gpt-6-*` value while a pre-migration build is live: saving a Render variable redeploys the running build, and that code always sends a temperature and never a reasoning effort; GPT-6 at its default effort rejects a temperature (the eval's probe), so every text call fails and the fail-closed content filter refuses every new story. Explicit GPT-6 values, if any, go in only after the migration has deployed.
- `_TEMPERATURE` variables are ignored with a warning; remove them.
- The template editor's group (`GENERATION_MODEL_*`: AI Draft and AI Iteration) defaults to `gpt-6-sol` at low effort since 2026-09-28 (the owner's templates rating); custom-story setup (`SETUP_MODEL_*`) stays on `gpt-6-luna` low and never follows it. Its call limits (240 s since 2026-09-29, was 150 s; 20,000 output tokens) were sized for Sol, whose AI Drafts took up to 134 s on a slow evening. To roll templates back to Luna without a code change, set `GENERATION_MODEL_NAME=gpt-6-luna` and `GENERATION_MODEL_REASONING_EFFORT=low`.
- After a deploy, the startup log line `[LLM] text models {…}` shows each group's `model@effort`, and each call's `[LLM] {…}` line its model and effort.

### Dependency overrides

The root `package.json` overrides `langsmith` to `^0.6.0`. LangChain 0.3 (`langchain`, `@langchain/core`) still asks for langsmith `^0.3`, and langsmith below 0.6.0 has a high-severity advisory. The server's `ChatOpenAI` + `withStructuredOutput` calls were checked against 0.6.3, with tracing on and off. Drop the override when LangChain moves to 1.x, which accepts langsmith 0.5 and later on its own. The client declares `uuid` itself: it used to get the package and its types from langsmith 0.3 by hoisting.

### Installation

```bash
# Install all workspace dependencies
npm run install:all

# Individual workspace installs
npm run install:core
npm run install:server
npm run install:client
```
