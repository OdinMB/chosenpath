# Local harness

Runs Chosen Path in a real browser on a hermetic local copy: a throwaway database with the dev seed's synthetic data, a fake OpenAI-compatible API, the real server and a production build of the real client, all on 127.0.0.1 and all writing under one output folder. A browser journey signs in as a seed account, starts a story and plays a turn, taking screenshots as it goes.

## Run it

```bash
node harness/run.mjs --out <folder> [--steps <module>] [--viewport desktop|mobile] [--timeout <seconds>] [--pg-bin <folder>] [--guard-test=<case>]
```

| Parameter | |
| --- | --- |
| `--out <folder>` | Required. A new or empty folder outside the repository. Everything the run writes goes here. |
| `--steps <module>` | The browser journey: a module whose default export is `async ({ page, baseUrl, login, shot, log, newPage, fixture, viewport }) => {}`. Defaults to `harness/steps/smoke.mjs`. |
| `--viewport <name>` | `desktop` (1440x900, the default) or `mobile` (390x844, touch). |
| `--timeout <seconds>` | Stops everything and fails after this long. Defaults to 600. |
| `--pg-bin <folder>` | The folder holding `initdb` and `postgres`. Defaults to the first on `PATH`, then the newest `/usr/lib/postgresql/*/bin`. |
| `--guard-test=<case>` | A negative test. It must exit non-zero; see below. |

In a journey:

- `login(page?, account?)` signs in, by default as the fixture player.
- `shot(name, page?)` saves a full-page screenshot.
- `newPage()` opens another browser context, for a second player in the same browser.
- `fixture.template` is the published template that the run provisioned.

## Needs outside the project

The harness installs nothing and adds nothing to this repository.

- **Node 22**, with the repository's dependencies installed (`npm ci`). The harness uses the repository's `tsx`, `vite` and `esbuild`.
- **PostgreSQL server binaries** (`initdb`, `postgres`, `createdb`). Built against 16.
- **Playwright installed globally**, with its Chromium. Built against 1.63:

  ```bash
  npm install -g playwright@1.63.0
  npx -y playwright@1.63.0 install chromium
  ```

  If it is missing, the run stops before starting anything and says so.
- **As root on Linux:** `unshare` from util-linux. PostgreSQL refuses to run as root, so `initdb` and `postgres` run in a user namespace as an ordinary user.

## What a run does

1. Starts the fake model API on a port the system picks.
2. Creates a database cluster under `--out` with `initdb`. It listens on 127.0.0.1 only, on a port it picked, and its unix socket also lives under `--out`.
3. Builds the client from `client/vite.config.ts` into `--out`. Its API calls point at the front door's `/__api`.
4. Runs the product's dev seed (`server/src/scripts/seedDevDatabase.ts`), then the server (`server/src/index.ts`). Each runs as its own process with the guard loaded first.
5. Starts the front door: one origin that serves the client and passes `/__api` and `/socket.io` to the server.
6. Prints `hermetic-guard: ok port <n>`, where `<n>` is the front door's port.
7. Drafts and publishes a template through the product's API, as the seed's admin account and with the fake model.
8. Runs the journey.
9. Stops and deletes everything it started, checks its ports are free and `git status --porcelain --ignored` is unchanged, and writes `run.json`.

The model's text is placeholder text that fits each response schema, and its images are small placeholders. Moderation and the content filter always answer "safe".

## The output folder

| Path | |
| --- | --- |
| `run.json` | Exit code, ports, the guard line, the template, screenshots, blocked requests, versions. |
| `shots/` | `NN-<name>-<viewport>.png`. |
| `logs/` | `harness.log`, plus `seed.log`, `server.log`, `client-build.log` and `postgres.log`. `fake-openai.jsonl` holds one line per model call. `journey.log`, `browser-console.log`, `blocked-requests.log` and `front-door.log` cover the browser side. |
| `server/data/` | The server's story, template and image files. |
| `client/dist/` | The client build. |
| `home/`, `tmp/`, `browser/` | The temporary home, temp and cache folders of every process. |
| `guard/` | The guard's manifests. |
| `pg/` | The database cluster. It is deleted on exit. |

## The guard

Every product process (the seed and the server) starts as `node --import tsx --import harness/lib/server-preload.mjs <entry>`. The preload loads the product's own configuration code and checks it before the entry runs, and so before any migration or listen. Any problem prints `hermetic-guard: refused` with the reasons, exits non-zero, and the run stops. The guard covers these points:

1. **Environment.**
   - Each process starts from an empty environment, plus an allowlist:
     - `PATH`, plus `SYSTEMROOT` and `COMSPEC` on Windows;
     - a temporary home, XDG and temp folders under `--out`;
     - the proxy variables below;
     - the fixtures in `harness/fixture-vars.json`;
     - the targets the harness created.
   - The preload asserts that, once the configuration has loaded, the environment is exactly that.
   - Every variable the server's configuration reads is either unset or holds its fixture value.
   - No `.env` file can load: the processes run in `--out/server/work`, which has none.
2. **Targets.**
   - The settings the product computes must name only what the harness started:
     - the database host and port;
     - the model API's base URL (`OPENAI_BASE_URL`, which the OpenAI client under both the text and the image calls reads);
     - the CORS origins;
     - the storage folder (under `--out`);
     - the client's API URL (checked in the built bundle).
   - Mail and tracing stay unconfigured, and the client's analytics script is blocked in the browser.
   - In every process of the run, `run.mjs` itself included, a TCP connection to any port the harness didn't start, and any unix socket or named pipe, is refused before any name lookup. The run then stops and exits 3.
3. **Proxy.** `HTTP_PROXY`, `HTTPS_PROXY` and `ALL_PROXY` point at a closed port on 127.0.0.1. `NO_PROXY=127.0.0.1,localhost` and `NODE_USE_ENV_PROXY=1` are set. Chromium uses the same closed proxy and resolves no names. The browser contexts abort every request and WebSocket that isn't to the front door's port; `logs/blocked-requests.log` lists them.
4. **Listening.** Every listen, the server's port 3000 included, goes to 127.0.0.1 on a port the system picks.
5. **Stopping.** On exit, error, timeout or Ctrl-C, everything started is stopped and the cluster is deleted. Then the run checks that its ports are free and that `git status --porcelain --ignored` gained nothing.

### Negative tests

| Case | Plants, after the environment is cleared | Must |
| --- | --- | --- |
| `--guard-test=env` | an unlisted variable | exit non-zero |
| `--guard-test=target` | `postgres://guard-test.invalid/x` where the server reads its database target | exit non-zero |
| `--guard-test=target-loopback` | `postgres://127.0.0.1:9/x` in the same place | exit non-zero |

A refused guard test exits 2. A guard test that is not refused exits 70: the guard is broken, so treat this way as broken.

### Exit codes

| Code | Meaning |
| --- | --- |
| 0 | ok |
| 1 | setup failed (missing tool, failed build or seed, a process that stopped before its guard reported) |
| 2 | the guard refused a product process or the client bundle, or a guard test was refused as it must be |
| 3 | a guard violation: a refused connection in any process of the run, a port still held, or a path added to `git status --porcelain --ignored`. It replaces every other code but 70 |
| 4 | the journey failed |
| 70 | a guard test was not refused |
| 124 | timeout |
| 130 | interrupted |

## What it can't show

- Real story quality. The text is schema-shaped placeholder text, not a model's writing.
- Real images, real moderation or the real content filter.
- Multiplayer across devices. One browser with several contexts (`newPage()`) is as far as it goes.
- Mail, analytics, payments and anything else hosted.
- Production settings. The server runs with `NODE_ENV=development` behind a same-origin front door.

## Code and tests

- `harness/run.mjs` runs everything.
- `harness/lib/` holds:
  - the guard (`guard.mjs`, `net-guard.mjs`, `server-preload.mjs`);
  - the fake API (`fake-openai.mjs`);
  - the database (`postgres.mjs`);
  - the client build (`client-build.mjs`, `vite-config.mjs`);
  - the front door (`front-door.mjs`);
  - the browser (`browser.mjs`);
  - template provisioning (`provision.mjs`);
  - process handling (`processes.mjs`).
- `harness/steps/smoke.mjs` is the default journey.
- The tests live in `server/tests/unit/harness/` and `server/tests/integration/harness/`, and run with the server's tests (`npm test` in `server/`). They show that the guard refuses each negative case in a real process with a stub in place of the product's entry, without starting a database, the server or a browser.
