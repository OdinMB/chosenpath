# Follow-up: classroom limits, step 1 (2026-10-26)

Branch: `claude/project-thread-aki27k`. Plan: `.plans/2026-10-26_classroom-limits-step1.md`. Commits: `60def87` (core and server), `9f40925` (client), `14d05fb` (docs, by the coordinator), `a4484a2` (the review's eight findings), all unpushed.

The owner, Odin, approved step 1's scope in the project thread ("go for step 1") and settled its behaviour beforehand (who may run a class, no email confirmation, anonymous use no easier to abuse). The planner's implementation decisions in the plan's `## Approach` were not shown to him item by item before implementation.

ashoka-engineering not loaded: plan-decisions, adr, project-context, arch-overview. So the implementer wrote no ADR, did not change the plan's header or archive it, and edited neither `CLAUDE.md` nor `.context/`. What those documents owe is listed under **Records to Refresh** below.

## Decisions to Review

- No ADR entries: the `adr` skill was not loaded, so no decision went into the log. The implementer's choices beyond the plan are under **Controversial Decisions**. Each one is small and none changes the product behaviour the owner settled.

## Controversial Decisions

Choices the implementer made where the plan said something else, or nothing:

- **`trustProxyHops()` lives in `server/src/shared/clientAddress.ts`, not `server/src/config.ts`.** `config.ts` placement would create an import cycle (`config.ts` ↔ `clientAddress.ts`). It is still lazy, resolved once, warns once in legacy mode, and `index.ts` calls it before listening.
- **`websocket.ts`'s `checkAndHandleRateLimit(socket, key, action, requestId)` stayed synchronous.** Callers resolve the key first (`await this.choiceKey(socket)`). The plan said "async"; the behaviour is the same, and a sync check can't interleave between check and increment.
- **`AIImageGenerator` has no constructor-injected recorder.** `generateImage` calls `recordImageCall` from `spend/spendLedger.ts` directly, and its tests mock that module (`jest.unstable_mockModule`). That gives one fewer constructor parameter on a class built in several places.
- **`spendStore.test.ts` uses its own local `mockQuery`** instead of `tests/__mocks__/shared/db.ts`, so the upsert's parameters can be asserted without the shared mock's other behaviour.
- **The home-page join check moved into `client/src/page/utils/joinByCode.ts`** (`joinByCode`, `isStoryCodeFormat`), tested in `client/tests/unit/page/joinByCode.test.ts`. That file replaces the plan's `Page.test.tsx` extension, because the static render can't drive the form's `code` state. The server's `generatePlayerCodes` NOTE now points to `isStoryCodeFormat`. A failed check (a 429, an outage) reads "Unable to validate code" under the field, beside the API client's pop-up.
- **The tests in `server/tests/unit/stories/storyRoutes.test.ts` go beyond the plan (6 tests).** They cover the ceiling's 503 with nothing created or counted, the account bucket, a start under the ceiling, `exists` answering 200 true/false without the story id, and repeated misses limited to 429.
- **Both start routes pass `Boolean(body.generateImages)` to `storyStartLimit`**, which matches how creation reads the flag (any truthy value asks for images).
- **An unknown image model is booked at the highest known image rates.** The plan defined the fallback for missing usage ($0.25) but not for an unknown model. `imageCallCostUsd` never throws and warns once per model.
- **In legacy mode (`TRUST_PROXY` unset), a leftmost entry that isn't an address falls back to the socket address**, as today's code effectively did, rather than UNKNOWN.
- **The text eval now imports `db.ts` transitively**, through `ContentFilterService` → `spendLedger` → `spendStore`. `db.ts` creates its `Pool` at import but never connects without a query, and the eval passes its own classifier, so it records no spend. `usageRecorder.ts` stays free of database imports, as the plan required.
- **The admin spend panel shows the `other` bucket's ceiling as "never limited"**, not "not set (recording only)", because that bucket can't take a ceiling.
- **The group start's partial result** ("Started k of N groups") is a warning that stays until it is closed. It sits beside whatever pop-up the API client already showed for the refusal.
- **The seat-card page preselects nothing without `?stories=`.** From "Print seat cards" on My Stories, the teacher ticks the stories. Groups are numbered among the selected stories only, oldest first, as the plan says.
- **`SeatCard.tsx` re-types `QRCodeSVG`.** `qrcode.react` is hoisted to the workspace root, where its types resolve the root's `@types/react` 19.0.8. The client's own types are `@types/react` 18.3.18, and its JSX types reject a React 19 `ForwardRefExoticComponent` (`tsc -p tests/tsconfig.json` failed with TS2786). The fix restates the props type in one place; the component itself is the library's. The systemic fix is under **Suggested Follow-Up Work**.
- **"Print seat cards" on My Stories is an `<a href>` with `navigate()`**, the codebase's pattern. React Router's `Link` hits the same React 18/19 type clash, and nothing in the client uses it.
- **`qrcode.react` is ISC-licensed, not MIT as the plan says.** ISC is equally permissive (MIT-equivalent), and the package has no dependencies of its own (v4.2.0).

### Review fixes (`a4484a2`)

How the implementer settled the independent review's eight findings:

- **Claim, then refund** (findings 1, 2, 4, 8). `claimRateLimit` checks and counts in one synchronous step, before any await; `refund()` hands the count back once, and only while the window it was counted in still runs (a later window never pays back an earlier one). `limitFailures` claims up front and refunds on success. **It also refunds when the attempt throws** (a database outage), so an outage doesn't lock out a class; a guesser gains nothing from that, since a throw answers no guess.
- **Story starts check their limit before the spend ceiling.** A `429` now comes before a `503`, and an over-limit start never reads the ledger. A start the ceiling refuses is refunded.
- **`/stories` (from a prompt) keeps the count when the content filter refuses the premise**: that refusal is an AI call. Only World starts refund on a creation refusal (`404`, both `400`s, and the `500` after a failed write); `createStoryFromTemplate` now resolves `true` only when the story was created.
- **Login: 20 failed logins per address per 15 minutes; a successful login doesn't count** (was 50 per 24 h, counting only successes, so guessing was unlimited). Twenty leaves room for a staff room's teachers mistyping behind one school address; a guesser gets 80 tries an hour per address. Over the limit the password isn't checked.
- **Story origin cache** (`server/src/stories/storyOrigins.ts`, finding 3). It holds the lookup's promise, so concurrent choices share one query; entries live 10 minutes, at most 10,000, oldest dropped first. A story without a row and a failed lookup are not remembered. A story's `creator_id` only ever changes to NULL (account deleted, `ON DELETE SET NULL`), so a remembered answer can be stale only towards "account". `deleteUserById` drops that account's stories and every lookup still running at once. **Not covered:** an account deleted outside this server process (another instance, SQL by hand) keeps its stories' account allowance for up to 10 minutes. The spend ledger reads the same cache.
- **IPv6 counts by its /64 network** (finding 5): `address:2001:db8:abcd:12::/64`. IPv4 stays whole; IPv4-mapped IPv6 was already read as IPv4.
- **Unreadable addresses** (finding 6, `server/src/shared/unreadableAddresses.ts`). Every address read counts, and how many found none, since start and per minute over the last hour (at most 61 minute tallies). They are served by a separate admin route, `GET /admin/system/addresses` (no-store, counts only), rather than added to the connection report, whose seven keys stay as they were. `/admin/system` shows them as a row beside the verdict and adds "TRUST_PROXY is likely higher than the proxy chain" once more than half the last hour's reads found none. The log warns on the first unreadable read and then at most every ten minutes, with the last hour's counts and no address. This replaces the once-per-process note.
- **Billed failures are booked at an estimate** (finding 7). A text call cut off at its output cap (`length`) or stopped by the content filter (`content_filter`) is booked at its whole output cap, plus the prompt at 3 characters a token (English runs about 4, so this errs high). Where the cap wasn't seen, 20,000 output tokens are booked, the largest production cap. The recorder now keeps the call's output cap and the prompt's length in characters, never its text. An image the Images API's moderation refused (`400` with `moderation_blocked` or `content_policy_violation`) is booked at US$0.25, the costliest image. **Whether OpenAI bills a refused image is not verified**, so this may overstate.

## Implementation Issues

- **Environment:** no local Postgres and no app on :3000 or :5173 were reachable in this container, so none of the plan's checks against a running system could run. The visual checks and the migration run are owed (below). `npm ci` warned EBADENGINE (node 22.22.0 against `>=22.23.4 <23`) but succeeded.
- **Reviewers:** this run had no tool for starting sub-agents. The `feature-dev:code-reviewer` pass and the isolated check worker were replaced by the implementer's own review of the diff and by checks run directly. Each new guard was proven by disabling it and watching its test go red, then restoring it. That holds for `a4484a2` too: 26 tests were each seen red with their guard disabled, in four rounds, and green with it restored. 24 of them are new; the other two are the existing `503` tests, which now also guard the refund when the ceiling refuses a start.
- **The client's `tsc --noEmit` checks nothing.** In `npm run lint` (and `tsc && vite build`), `client/tsconfig.json` has `"files": []` plus project references, and plain `tsc` doesn't follow references. Only `test:lint` (`tests/tsconfig.json`) type-checks the source files the tests import. `tsc -p client/tsconfig.app.json` shows four errors this branch didn't cause (verbatim):
  - `client/src/game/GameSessionProvider.tsx(188,41): error TS2345: Argument of type 'WSRateLimitedResponse | WSErrorResponse | GameErrorNotification' is not assignable to parameter of type 'GameErrorNotification'.`
  - `client/src/game/GameSessionProvider.tsx(191,56): error TS2339: Property 'operationType' does not exist on type 'WSRateLimitedResponse | WSErrorResponse | GameErrorNotification'.`
  - `client/src/game/GameSessionProvider.tsx(192,18): error TS2339: Property 'error' does not exist on type 'WSRateLimitedResponse | WSErrorResponse | GameErrorNotification'.`
  - `client/src/page/components/Carousel.tsx(1,8): error TS6133: 'React' is declared but its value is never read.`

## DB Migrations

- **`spend_daily`**: `CREATE TABLE IF NOT EXISTS` in `initializeDatabase` (`server/src/shared/db.ts`). It is created on the next server start in each environment, production included, with no manual step. It was **not run here** (no database reachable). Check it locally after a start or `npm run seed:dev` (from `server/`): `psql -h localhost -U devuser -d chosenpath_dev -c '\d spend_daily'`.

## User Input Needed

- **Visual checks, owed** (CLAUDE.md "Quick Visual Check", desktop and mobile):
  - The template configure page, signed out (no group option) and signed in (tick "Start several groups": count field 2–12, images unticked and disabled with its line, button "Start N stories").
  - A group start of 2 or 3, which should land on `/users/seat-cards?stories=…` with those stories ticked.
  - The seat-card page on screen and in the browser's print preview: only the cards print, two per row, none split across pages, and the QR codes scan.
  - `/admin/system`: the address verdict, the new row "Requests without a readable address" beneath it, and the spend table.
  - The login form after a 429 (21 wrong passwords from one address within 15 minutes): what the pop-up says.
  - The home page's join form: a real code opens the game, a wrong one shows "Story code not found".
  - The Educators FAQ and the Privacy page.
- **Production settings for Odin** (none are set by this branch, and production behaves as before until they are):
  - `TRUST_PROXY`: measure it on `/admin/system` from chosenpath.ai, from home and from a phone on mobile data, and set the number on Render's Environment page. Unset, limits keep using the forgeable leftmost entry and the server logs a warning at startup. A value other than 0–10 refuses startup.
  - `SPEND_CEILING_ANONYMOUS_USD_PER_DAY` and `SPEND_CEILING_ACCOUNT_USD_PER_DAY`: US$ per UTC day. Unset means the totals are only recorded; 0 refuses every start of that kind. A non-number refuses startup.

## Records to Refresh

- **The plan file** keeps its `status: approved` header and stays in `.plans/` (uncommitted), since `plan-decisions` wasn't loaded to move it.

## Suggested Follow-Up Work

- **Deduplicate `@types/react`.** The workspace root has 19.0.8, pulled in by a `>=18` peer range, while the client pins 18.3.18. Any root-hoisted library that ships React types (`qrcode.react`, `react-router-dom`'s `Link`) then fails the client's JSX types. Pinning one version through `overrides`, or a `paths` entry for `react` in the client's two tsconfigs, would let `SeatCard.tsx` drop its re-typing.
- **Make the client's `tsc --noEmit` check the app** (`tsc -p tsconfig.app.json`, or `tsc -b`), and fix the four errors listed under **Implementation Issues** first.
- **Split `websocket.ts`'s `setupSocketServer`** into per-event handlers. This is the debt the plan named; this branch only changed the rate-limit lines of five handlers.
- **Do the privacy pass the plan left out:** `Login failed for email: …` in `userRoutes.ts`, and the code and `userId` in `websocket.ts`'s `verify_code` log line.
- **`getStoryFeed`** now has a `createdOnly` variant. A third variant should split it into a query builder and a row mapper (the plan's named debt).
- **The template editor's AI and image routes still check, then count after the call** (`server/src/templates/templateRoutes.ts` `templateGeneration` and `templateIteration`; `server/src/images/imageGenerationRoutes.ts`, three routes). That is the race the review fixed elsewhere: parallel requests all pass the check. They are worldbuilder-only and their spend is booked to `other`, so the review didn't name them. The fix is `claimRateLimitForRequest` before the call and `refund()` where the call creates nothing, as in `storyRoutes.ts`. `checkRateLimitForRequest` and `incrementRateLimitForRequest` can then go.
- **Sign-ups: 3 per address per 24 hours** may stop a school whose teachers all sign up on one day from one network. Watch for it; raising it, or counting by email domain, would be the owner's call.
- **Story origins across server processes.** With more than one server instance, an account deleted on one keeps its stories' account allowance on the others for up to ten minutes (`storyOrigins.ts`). The in-memory rate limits have the same single-process assumption. How many instances Render runs was not checked.

## Landing Queue

- Not queued: the owner is present in the session; landing (push of the branch, then merge to main, which deploys) is asked of him there.
