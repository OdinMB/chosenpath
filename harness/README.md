# Local harness

Runs Chosen Path in a real browser on a hermetic local copy: a throwaway database with the dev seed's synthetic data, a fake OpenAI-compatible API, the real server and a production build of the real client, all on 127.0.0.1 and all writing under one output folder. The run publishes two Worlds: one for a single player and one for a group of two or three. A browser journey signs in as a seed account, starts a story and plays some turns, or the whole story to its ending, taking screenshots as it goes.

## Run it

```bash
node harness/run.mjs --out <folder> [--steps <module>] [--group-mode <mode>] [--story-length <turns>] [--seed <n>] [--viewport desktop|mobile] [--timeout <seconds>] [--pg-bin <folder>] [--guard-test=<case>]
```

For example, a single-player story to its ending in three choices:

```bash
node harness/run.mjs --out <folder> --steps harness/steps/ending.mjs --story-length 3
```

| Parameter | |
| --- | --- |
| `--out <folder>` | Required. A new or empty folder outside the repository. Everything the run writes goes here. |
| `--steps <module>` | The browser journey: a module whose default export is `async ({ page, baseUrl, login, shot, log, finding, newPage, fixture, viewport }) => {}`. Defaults to `harness/steps/smoke.mjs`. `harness/steps/group.mjs` plays a group story, and `harness/steps/ending.mjs` plays a single-player story to its ending. |
| `--group-mode <mode>` | The group World's game mode: `cooperative` (the default, from `fixture-vars.json`), `cooperative-competitive` or `competitive`. |
| `--story-length <turns>` | Both Worlds' length, from 3 to 25 turns. Defaults to `fixture-vars.json`'s 5. A story ends on the beat after its last turn, so a 3-turn World ends after three choices. |
| `--seed <n>` | Seeds the fake model's variety: the options' risks, points and stat bonuses, where stats start, and how they move. A whole number from 0 to 2147483647; defaults to 1. Two runs with the same seed get the same variety on every turn: it is drawn from the seed and what each request is (its turn, the beat it writes and the kind of reply), never from the order requests arrive in, which pregeneration changes from run to run. |
| `--viewport <name>` | `desktop` (1440x900, the default) or `mobile` (390x844, touch). |
| `--timeout <seconds>` | Stops everything and fails after this long. Defaults to 600. |
| `--pg-bin <folder>` | The folder holding `initdb` and `postgres`. Defaults to the first on `PATH`, then the newest `/usr/lib/postgresql/*/bin`. |
| `--guard-test=<case>` | A negative test. It must exit non-zero; see below. |

In a journey:

- `login(page?, account?)` signs in, by default as the fixture player.
- `shot(name, page?)` saves a full-page screenshot.
- `newPage()` opens another browser context: another player, on a device of their own, with no account and nothing stored.
- `finding(text)` records something the product did that it should not have, where the journey can go on. It goes to `logs/journey.log` and to `findings` in `run.json`.
- `fixture.template` is the single-player World: its `id`, `title`, `playerCountMin`, `playerCountMax`, `gameMode` and `maxTurns`.
- `fixture.groupTemplate` is the group World, in the same form. It is drafted for three seats and starts stories of two or three.
- `baseUrl` is the front door's origin. The client's join links, on seat cards, in their QR codes and in the copied invite link, point there too.
- `harness/steps/smoke.mjs` exports its steps (`openFromLibrary`, `startStory`, `pickFirstCharacter`, `waitForTurn` and more) for other journeys to import.
- `harness/steps/ending.mjs` exports `playToEnd({ pages, shot, log, finding, maxChoices, pacers })`. From the turn on screen, it plays to the story's ending: every turn, each page takes a screenshot and a choice, a different option each turn. A turn that offers other than 3 choices goes to `finding`. `pages` is one player's page, or a page per seat for a group. It resolves with the number of choices, the ending's beat and each page's ending once every page shows a beat with no choices. It throws when that takes more than `maxChoices`, or when some seats end and others don't. `endingProblems` checks the result against the World's turns and the ending's title. `beatOnScreen` and `nextBeat` read the beat a page shows: its counter, title, text and choices.
- **Choices are paced.** The server allows 4 counted events in 30 seconds (`RATE_LIMITS.make_choice` in `core/config.ts`). A character pick, a choice and a turn retry each count. Past the limit it turns the event away, and the game page shows nothing, so a journey that clicks faster waits for a beat that never comes.
  - **Who shares a count** (`choiceLimitKey` in `server/src/shared/limitPolicy.ts`). Each seat counts on its own only in a story an account started, from a socket that holds a seat. Everything else counts per address: an anonymous story, a socket with no seat, a story whose origin can't be read. In the harness every page comes from 127.0.0.1, so in those cases all seats share one count.
  - **Pacing.** `harness/lib/choice-pace.mjs` reads the limit from `core/config.ts`. Its `choicePacer()` sends the next event under a count only once that count's last 4 lie more than the window plus 2 seconds back. `playToEnd` sends page i's choices through `pacers[i]`. Pace the character pick through the same pacer (`await pacer.pace(() => confirm.click())`) and pass it on.
  - **One pacer or several.** For a story an account started, give each seat a pacer of its own. Where the seats share a count, give every page the same pacer (`pacers: pages.map(() => shared)`) and pace every seat's character pick through it. Without `pacers`, each page gets a pacer of its own that counts one event, its character pick, as sent just before the first turn: right only for a story an account started.

The built-in journeys:

- `smoke.mjs` opens the single-player World with its library card's Play button, starts a story and plays two turns. If the card has no Play button, or it does not open the World's page, that is a finding and the page opens by its address.
- `group.mjs` opens the group World, starts a story for three, opens its seat cards and reads each card's link and QR code. Then each seat joins from its card's link in a context of its own, chooses a character, and plays two turns. A card that links anywhere but the front door is a finding, and its seat joins by its code.
- `ending.mjs` opens the single-player World as `smoke.mjs` does, starts a story and plays every turn to the ending, with a screenshot of each turn and of the ending (`ending`). Each of these is a finding:
  - a turn with other than 3 choices;
  - an ending after another number of choices than the World has turns, or on another beat than the one after its last turn;
  - an ending not titled "The End".

  Then it opens My Stories, where the finished story is (`my-stories`). Use it with `--story-length 3` for a short run. Pacing sets the pace of longer runs: the character pick and the first 3 choices go at once, then about 4 choices every 32 seconds. A 25-turn story's whole run takes about 3½ minutes, well within the default `--timeout` of 600 seconds.

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
3. Starts the front door on a port the system picks: one origin that serves the client and passes `/__api` and `/socket.io` to the server. Until both are ready it answers 503.
4. Builds the client from `client/vite.config.ts` into `--out`. Its API calls point at the front door's `/__api`, and its join links at the front door's origin.
5. Runs the product's dev seed (`server/src/scripts/seedDevDatabase.ts`), then the server (`server/src/index.ts`). Each runs as its own process with the guard loaded first.
6. Prints `hermetic-guard: ok port <n>`, where `<n>` is the front door's port.
7. Drafts and publishes the two Worlds in `fixture-vars.json` through the product's API, as the seed's admin account and with the fake model. The group World is drafted for three seats and published for two to three.
8. Runs the journey.
9. Stops and deletes everything it started, checks its ports are free and `git status --porcelain --ignored` is unchanged, and writes `run.json`.

The model's text is placeholder text that fits each response schema, and its images are small placeholders. A list of player seats holds each seat once per reply, so the planners group every player, as a group story's first thread must. Moderation and the content filter always answer "safe".

Beyond the schema, the fake reads a few lines of each request (`harness/lib/fake-story.mjs`), so that a story moves and ends:

- **Length.** The chapter planner writes the length PACING gives: the last chapter's exact length, otherwise the shortest allowed. A story of any length then ends on the beat after its last turn, as soon as the engine allows.
- **Options.** At a switch, the options are ways to explore. In a chapter they are challenges, each with its own risk (safe, normal, risky), base points from +5 to -15, and one or two bonuses on the story's number stats.
- **Stats.** Each stat starts at its own value. Every turn after the first moves one or two of them up or down, each under "shared" or a seat, as the stat is.
- **The ending.** The ending's beats are titled "The End".

All of it is drawn from `--seed` and the request's turn and kind, so it doesn't depend on the order requests arrive in. The ids and placeholder lines around it do: they stay unique in a run but differ between runs. Every option's text stays a marked placeholder line, which the journeys find the choices by.

## The output folder

| Path | |
| --- | --- |
| `run.json` | Exit code, ports, the guard line, the seed and story length, the two Worlds, screenshots, the journey's findings, blocked requests, versions. |
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
     - the client's API URL (checked in the built bundle);
     - the site origin the client builds its join links and QR codes from. Checked in the built bundle: the front door's host is there, and the development site's host appears nowhere.
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
- Multiplayer across devices. Several seats in one browser, each in a context of its own (`newPage()`), is as far as it goes. A phone scanning a seat card's QR code can't reach the front door.
- Contests. The fake model writes every outcome as a challenge, so a competitive or cooperative-competitive group story never holds a contest.
- A repeatable roll. `--seed` fixes the options and stat moves the fake writes, but each choice's result (favorable, mixed or unfavorable) is the product's own roll, which no seed fixes. The result shown, and the thread progress it makes, differ from run to run, as do the placeholder texts' numbers.
- Choices that steer the fake. All the pregenerated branches of a turn get the same variety, so what the fake writes next never depends on the option chosen; only the product's roll does.
- Sacrifice and reward options. Every option the fake writes is a normal one.
- The story arc's pacing. The fake ignores which outcomes still need milestones, so the switch planner's PACING check asks it once more and keeps the plan. Where the milestones the fake writes name no outcome the story knows, the product drops them and records each finished thread's planned one instead.
- Short Worlds the editor offers. Its shortest is 5 turns; `--story-length 3` or 4 makes a World the editor couldn't, through the same API.
- The dev seed's finished story. It belongs to a seed account the journeys don't sign in as, so `ending.mjs` finishes a story of the fixture player's own.
- Server limits counted per address. Every context comes from 127.0.0.1, so a journey that joins or signs in many times a minute meets them sooner than real players would.
- Mail, analytics, payments and anything else hosted.
- Production settings. The server runs with `NODE_ENV=development` behind a same-origin front door.

## Code and tests

- `harness/run.mjs` runs everything.
- `harness/lib/` holds:
  - the guard (`guard.mjs`, `net-guard.mjs`, `server-preload.mjs`);
  - the fake API (`fake-openai.mjs`), with what it reads in a story's requests and the variety it writes (`fake-story.mjs`);
  - the database (`postgres.mjs`);
  - the client build (`client-build.mjs`, `vite-config.mjs`);
  - the front door (`front-door.mjs`);
  - the browser (`browser.mjs`);
  - template provisioning (`provision.mjs`);
  - process handling (`processes.mjs`);
  - the limit on a seat's choices, read from `core/config.ts`, and the pacing under it (`choice-pace.mjs`).
- `harness/steps/smoke.mjs` is the default journey, `harness/steps/group.mjs` the group one, and `harness/steps/ending.mjs` plays to the ending.
- The tests live in `server/tests/unit/harness/` and `server/tests/integration/harness/`, and run with the server's tests (`npm test` in `server/`). They show that the guard refuses each negative case in a real process with a stub in place of the product's entry, without starting a database, the server or a browser. `fakeModel.test.ts` plays whole stories of 3, 4, 5 and 25 turns, and a group's of 3, on the fake with the product's own services, to their ending. It also plays one story twice, with every request numbered differently, and gets the same choices and stat moves. `ending.test.ts` and `choicePace.test.ts` play stub pages on a fake clock: a seat's character pick and choices stay under the limit `core/config.ts` sets, without waiting for real.
