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

### Node version

`server/package.json` `engines` is the only Node pin (no `.nvmrc`, `.node-version`, Dockerfile or CI), and Render picks its Node from it unless a `NODE_VERSION` variable is set in the dashboard. The floor is `>=22.23.4 <23` since 2026-10-23: Node carries its own root CA list, and 22.23.4 is the first 22.x without "emSign ECC Root CA - G3", removed after the October 2026 eMudhra key compromise (checked: `tls.rootCertificates` holds it in 20.20.2 and 22.22.0, not in 22.23.4). Node 20 is end-of-life and still carries it. Moving to 24.x needs 24.22.1 or later for the same reason.

### Text-model environment variables

Since the GPT-6 migration (2026-09-27), production text calls run only on `gpt-6-*` models, and the code defaults are the settled ones, so no text-model variable needs to be set. Seven groups can be overridden, each by `<PREFIX>_NAME` and `<PREFIX>_REASONING_EFFORT` (none, low, medium or high): `SETUP_MODEL`, `GENERATION_MODEL`, `TEXT_MODEL`, `MULTIPLAYER_TEXT_MODEL`, `SWITCH_THREAD_MODEL`, `MULTIPLAYER_SWITCH_THREAD_MODEL`, `CONTENT_FILTER_MODEL`. Defaults and rules: `.context/text-model-eval.md`, "Production text calls".

- A leftover gpt-4.x `_NAME` (for example `TEXT_MODEL_NAME=gpt-4.1-mini`), a `_NAME` without its `_REASONING_EFFORT`, or the gpt-4-era effort `minimal` stops the server at startup with the variable and its replacement. Clear these on Render (and in `server/.env`) before deploying a build that includes the migration. Clearing them early is safe: a pre-migration build falls back to its own gpt-4.1 defaults.
- Never set a `gpt-6-*` value while a pre-migration build is live: saving a Render variable redeploys the running build, and that code always sends a temperature and never a reasoning effort; GPT-6 at its default effort rejects a temperature (the eval's probe), so every text call fails and the fail-closed content filter refuses every new story. Explicit GPT-6 values, if any, go in only after the migration has deployed.
- `_TEMPERATURE` variables are ignored with a warning; remove them.
- The template editor's group (`GENERATION_MODEL_*`: AI Draft and AI Iteration) defaults to `gpt-6.1-sol` at low effort since 2026-10-02 (`gpt-6-sol` low from 2026-09-28, the owner's templates rating); custom-story setup (`SETUP_MODEL_*`) stays on `gpt-6-luna` low and never follows it. The Render key's OpenAI project must be allowed `gpt-6.1-sol`. `gpt-6.1-sol` takes no effort `none`, so `GENERATION_MODEL_REASONING_EFFORT=none` now stops the server at startup. Its call limits are 360 s since 2026-10-02 (150 s, then 240 s from 2026-09-29) and 20,000 output tokens: 240 s was sized for today's Sol, whose AI Drafts took up to 134 s on a slow evening, and 6.1's one measured draft took 202 s, so the timeout went to 360 s; at that draft's pace the cap is reached around 540 s, so the timeout binds first (`.context/text-model-eval.md`, "Timeouts and output caps"). To roll templates back without a code change, set `GENERATION_MODEL_NAME=gpt-6-sol` (or `gpt-6-luna`) and `GENERATION_MODEL_REASONING_EFFORT=low`.
- After a deploy, the startup log line `[LLM] text models {…}` shows each group's `model@effort`, and each call's `[LLM] {…}` line its model and effort.

### Client address (`TRUST_PROXY`)

Every per-address limit (anonymous story starts, sign-ups, logins, code checks, choices outside account stories, the editor's AI and image routes) counts by the visitor's address. `server/src/shared/clientAddress.ts` reads it for HTTP and Socket.IO alike: each proxy in front of the app appends to `X-Forwarded-For` the address it received the request from, so with `TRUST_PROXY=N` the visitor is the Nth entry from the right. The count has to be right:

- Too low, and the entry read is a proxy's: every visitor lands in one bucket, and one class can lock out everyone.
- Too high, and the entry read is one the visitor wrote: anyone can forge their address and step around the limits.
- Unset (legacy mode), limits use the leftmost entry, which a visitor can forge, and the server logs a warning at startup pointing here. Anything other than a whole number from 0 to 10 (`true`, an address list) refuses startup. 0 means nothing in front: the socket is the visitor (local runs).

Express's `trust proxy` gets the same count (`true` when unset), which now governs only `req.protocol`: limits never read `req.ip`.

To measure it:

- Deploy with it unset, sign in as an admin and open `/admin/system` on chosenpath.ai (which calls api.chosenpath.ai), once from home and once from a phone on mobile data. The page sends a second request with the forged entry `203.0.113.7` and names the count it reaches (`client/src/admin/system/clientAddressVerdict.ts`). Set that number on Render's Environment page. There is no `render.yaml`, so the dashboard holds the value, and saving it redeploys.
- The second path: the service's own `*.onrender.com` address bypasses any proxy on the custom domain. The browser check can't reach it, because the auth cookie is scoped to `.chosenpath.ai`. Measure it with `curl`: `GET /admin/system/connection` on the `onrender.com` address with an admin's `authToken` cookie and `X-Forwarded-For: 203.0.113.7`, then read `candidates`: the lowest `hops` whose `address` is `203.0.113.7`, minus one, is that path's count. Sign out afterwards to invalidate that session.
- If the two paths give different counts, no single count is right for both: the higher lets a caller on the shorter path forge their address, the lower puts every visitor on the longer path in one bucket. Remove the extra path (disabling the default `onrender.com` domain is an option, not verified), or use the lower count only where the longer path carries no real visitors.

Measured counts: none yet. Record each path's count here with its date.

### Daily spend ceilings

`SPEND_CEILING_ANONYMOUS_USD_PER_DAY` and `SPEND_CEILING_ACCOUNT_USD_PER_DAY` cap the AI spend per UTC day, in US$, of stories started without and with an account (`server/src/spend/spendLedger.ts`). Unset, the totals are only recorded; 0 refuses every new story of that kind; anything but a number of 0 or more refuses startup. The startup log line `daily spend ceilings (US$, null records only) {…}` shows what the server read. Once a bucket reaches its ceiling, new stories of that kind get a 503 and running ones get no new images; their text goes on. Calls tied to no story (the template editor, the content filter) are booked to `other`, which takes no ceiling. Today's and this month's totals and the ceilings are on `/admin/system`; the costs come from the price table in `server/src/spend/prices.ts`, so compare them with the OpenAI bill.

### Dependency overrides

The root `package.json` overrides `langsmith` to `^0.6.0`. LangChain 0.3 (`@langchain/core`) still asks for langsmith `^0.3`, and langsmith below 0.6.0 has a high-severity advisory. The server's `ChatOpenAI` + `withStructuredOutput` calls were checked against 0.6.3, with tracing on and off. Drop the override when LangChain moves to 1.x, which accepts langsmith 0.5 and later on its own. The client declares `uuid` itself: it used to get the package and its types from langsmith 0.3 by hoisting.

### Known npm audit findings

Since 2026-10-26 `npm audit` reports no critical finding. The high findings left all come from one advisory, zod's GHSA-mrhx-c7xc-m3w5: an array, map or set with a size limit has every element parsed before the limit is checked. They are zod itself plus `openai`, `@langchain/openai` and `@langchain/core`, which are flagged only because they depend on zod 3. The fix exists only in zod 4.6.6 and later. Moving to it means migrating every schema in core, server and client to zod 4, and with them the structured-output JSON schemas sent to OpenAI, which the text-model eval measures byte for byte. It also needs LangChain 1.x. Importing `zod/v3` from a zod 4 package clears the audit but not the issue: the 4.6.6 fix touches only zod 4's core, so `zod/v3` is unchanged. Exposure is small: the only untrusted input zod parses is the feedback body (no arrays, under `express.json()`'s 100 kB limit); everything else zod parses is a model reply. The moderate findings also wait on major upgrades: `uuid` below 11.1.1 (only `v4()` is used, and the advisory concerns v3/v5/v6 with a buffer) and `postcss-selector-parser` through Tailwind 3 (build time only). CSRF protection is hand-written in `server/src/index.ts`; the unused `csurf` package, which kept an old `cookie` installed, was removed.

### Installation

```bash
# Install all workspace dependencies
npm run install:all

# Individual workspace installs
npm run install:core
npm run install:server
npm run install:client
```
