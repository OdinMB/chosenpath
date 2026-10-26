---
status: approved
type: feature
complexity: complex
---

# Classroom access, step 1: trustworthy addresses, per-account and per-seat limits, a spend ledger with ceilings, multi-group starts and seat cards

Design source: `chosenpath-pm/artifacts/specs/classroom-facilitator-access.md`, "Step 1" under Recommendation and "Hard rule: anonymous use is no easier to abuse than today". Product behaviour is the owner's (Odin, 2026-10-26); implementation details are settled here.

Planning note: the `ashoka-engineering` plugin (`plan-decisions`) was not loaded in the planning run, so this plan has no handbook header and no decision stubs. Every decision is recorded in `## Approach` with its alternatives and its reason; the planner made them all.

## Problem

Every limit counts per network address (`RATE_LIMITS` in `core/config.ts`, `server/src/shared/rateLimiter.ts`), so a class behind one school address can start 2 stories and then stalls; 30 students verifying codes and making choices from one address hit the same buckets. The address itself is forgeable: `app.set("trust proxy", true)` and `getClientIP` take the leftmost `X-Forwarded-For` entry, which the client writes, so the anonymous limits can already be walked around. There is no record of AI spend and no ceiling, sign-up has no limit, the home page's join form calls a route that does not exist, and the limiter logs client IPs although the privacy page says they are kept only in memory.

## Approach

### Environment for the implementer (not verified by the planner)

The planning run had no shell, so whether a database or app is reachable in this container is **unknown**. Before starting, run `pg_isready -h localhost -p 5432`, `curl -s localhost:3000/health` and `curl -sI localhost:5173`. CLAUDE.md says the client and server are already running; in a cloud container that may not hold.

- **Database reachable** (`chosenpath_dev`): the new table appears when the server starts (`initializeDatabase`) or when `npm run seed:dev` runs from `server/` (it calls `initializeDatabase` and is guarded to local `*_dev` databases). Check it with `psql -h localhost -U devuser -d chosenpath_dev -c '\d spend_daily'`.
- **App reachable**: do the visual checks CLAUDE.md asks for, on the template configure page (signed in and signed out), the seat-card print view, `/admin/system`, the home join form, and the Educators and Privacy pages. Use desktop and mobile widths, and keep Playwright output out of the repo.
- **Neither reachable**: the migration is checked only through the unit tests on its SQL. Record the visual checks and a migration run as owed in the implementer's report; don't start `npm run dev` to get around it.

### 1. Client address (`server/src/shared/clientAddress.ts`)

One framework-neutral function, from `render-side-project/references/client-ip.md`, serves both HTTP and Socket.IO. It is `clientAddress(peer, xffHeader, hops)`: at 0 hops it returns the socket peer; otherwise it returns the Nth entry from the right, or UNKNOWN. It never falls back to the leftmost entry or the socket. It strips ports (`1.2.3.4:5678`, `[::1]:80`), turns IPv4-mapped IPv6 into IPv4, and checks the result with `net.isIP`.

- **`TRUST_PROXY`** is parsed by `parseTrustProxy` (regex `^(\d|10)$`). Unset or empty means legacy mode; anything else that doesn't match (`true`, `11`, `-1`, an address list) throws, naming the setting. It is resolved once by `trustProxyHops()` in `server/config.ts`, lazily like `productionTextModels()`, and `index.ts` calls it before the server listens, so a bad value refuses startup.
- **Legacy mode (unset)**, because production is live with the count never measured. Limits use the leftmost `X-Forwarded-For` entry, else the socket peer: today's behaviour, now one function for HTTP and Socket.IO. Socket.IO's extra `X-Real-IP` fallback is dropped, since Render always sends `X-Forwarded-For`. A one-time startup warning says the address can be forged and points to `/admin/system` and `.context/deployment.md`.
- **Express:** `app.set("trust proxy", hops ?? true)`, moved above the routes. When a count is set, this governs only `req.protocol`. Limits never read `req.ip` again.
- **UNKNOWN:** all such requests share one `address:unknown` bucket, and the first one per process is logged once. It is never replaced by the socket address, which on Render is the proxy.
- **`describeConnection(peer, xffHeader, hops, host, protocol)`** returns exactly the reference's keys: `address`, `trustProxy` (`number | null`), `connectionAddress`, `forwardedFor`, `candidates`, `host`, `protocol`. It lives in the same module, because the candidates are the same chain arithmetic.
- **Diagnostic route** `GET /admin/system/connection` (`verifyAdmin`), with `Cache-Control: private, no-store`. It reads, stores and logs nothing.
- **Admin page check:** a new "System" tab, `/admin/system`. It requests the route twice, the second time with `X-Forwarded-For: 203.0.113.7`, and a pure verdict function (`client/src/admin/system/clientAddressVerdict.ts`) returns right / too high (n → m) / too low (n → m) / not set (correct m) / header removed. The tab shows the derived address beside the verdict. To let the browser send that header cross-origin, `X-Forwarded-For` joins the CORS `allowedHeaders` in `index.ts`. That adds nothing a non-browser client couldn't already send.
- **`.context/deployment.md`** gets a "Client address (`TRUST_PROXY`)" section:
  - Why the count matters: too low puts every visitor in one bucket; too high lets anyone forge their address.
  - The procedure: deploy unset, sign in as admin, open `/admin/system` on `chosenpath.ai` (which calls `api.chosenpath.ai`), from home and again from a phone on mobile data. Set the number it names on Render's Environment page. There is no `render.yaml` in the repo, so the dashboard holds the value.
  - The second path: the service's `*.onrender.com` address bypasses any proxy on the custom domain. The browser check can't reach it, because the auth cookie is scoped to `.chosenpath.ai`. Measure it with `curl` and the same forged header, read `candidates` by the rule given in the doc, then sign out to invalidate that session. Disabling the default `onrender.com` domain is an option, `not verified`.
  - If the two paths differ, the rule from the reference applies.
  - Record the measured counts with the date.

Alternative rejected: Express `trust proxy N` with `req.ip` for limits. On a shorter path Express falls back to the leftmost entry, which the client wrote, and Socket.IO would still need its own code. The neutral function gives one code path and UNKNOWN instead.

### 2–5. Limits

**The store** (`server/src/shared/rateLimiter.ts`) becomes a generic keyed counter. Keys are strings with a kind prefix, built by `addressKey(ip)`, `accountKey(userId)` and `seatKey(storyId, slot)`; the API is `checkRateLimit(key, action)` and `incrementRateLimit(key, action)`.

- The address-keyed wrappers `checkRateLimitForRequest` and `incrementRateLimitForRequest` keep their callers (login, template editor, image routes) and now read `requestAddress(req)` from `clientAddress.ts`.
- `limitFailures(key, action, attempt)` runs an attempt that returns success or failure. It refuses when the key is already limited and counts only failures. It is shared by three call sites: `verify_code`, `rejoin_session` and the home-page code check.
- `getClientIP` moves to `clientAddress.ts` as `socketAddress(socket)`. `normalizeIP` is replaced by the neutral function's normalisation. `getRateLimitInfo` and `getRateLimitConfig` are deleted: they have no caller and they log IPs.
- Log lines name the key kind and the action, never the key value.

**The policy** gets its own module (`server/src/shared/limitPolicy.ts`), because the owner's "who is counted for what" decisions have a separate reason to change from the counter. Two pure functions:

- **`storyStartLimit(userId, generateImages, address)`** decides who a story start counts against:
  - Anonymous starts count against the address under `initialize_story`, 2 per 30 min, images or not (unchanged).
  - Signed-in text-only starts count against the account under `initialize_story_text`, 15 per hour.
  - Signed-in starts with images count against the account under `initialize_story_images`, 2 per 30 min.
- **`choiceLimitKey(origin, seat, address)`** keys a choice (`make_choice`, `select_character`, `retry_turn`, all under `make_choice`, 4 per 30 s):
  - In an account-created story, the seat's key.
  - In an anonymous story, the address (unchanged).
  - With no seat, or an unknown origin, the address (the stricter side).

**`core/config.ts`** gains three entries in `RATE_LIMITS` and `RATE_LIMITED_ACTIONS`:

- `register`: 24 h, 3.
- `initialize_story_text`: 1 h, 15.
- `initialize_story_images`: 30 min, 2.

**Sign-up** (`userRoutes.ts`, `/auth/register`): it checks the address limit before `createUser` and increments only after an account was actually created. Rejected attempts (email in use, weak password) create nothing, so they don't count.

**Story origin.** `storyDbService.getStoryOrigin(storyId)` returns `"account" | "anonymous"` from `stories.creator_id`. A missing row reads as anonymous, the stricter side. It is a primary-key lookup per call with no cache: a few queries per turn don't justify cache invalidation (YAGNI).

**Websocket** (`websocket.ts`): `checkAndHandleRateLimit` becomes async and takes the key; a private `choiceKey(socket)` resolves the seat through `connectionManager.getPlayerBySocket` and the origin, and falls back to the address on a DB error. `verify_code` counts a failure when `connectionManager.verifyCode` returns no state; `rejoin_session` counts one when a code was sent and `rejoinGame` returns null. Rate-limited responses keep their current types (`${action}_response`). All IP logging goes: the `clientIP` / `ip` fields and `getClientIP`'s `console.log`s.

Alternative rejected: separate limiter instances per key kind. They would triplicate the window logic, and string-prefixed keys in one store already keep the kinds apart.

### 6. Spend ledger and ceilings (`server/src/spend/`)

**Buckets.** A story's bucket is its origin: `anonymous` for stories created without an account, `account` for stories created by a signed-in user. Calls not tied to a story (the template editor's AI Draft, Iteration and images, and the content filter on premises and editor prompts) go to a third bucket, **`other`**. It is recorded and shown, but never ceilinged. It is recorded so the totals can be compared with the OpenAI bill: the Sol editor calls are the costliest per call. It has no ceiling because those calls need a login and already have per-address limits.

**Prices** (`spend/prices.ts`) become the one price table.

- **Text:** the per-1M-token table and `costFromUsage` move here from `evals/textModelEval/pricing.ts`.
- **Images:** the per-1M-token image rates and the usage-based `costFromUsage` move here from `evals/imageModelEval/arms.ts`.
- Both evals import them back (re-exported under their old names), so eval callers and tests don't change. App code may not import `src/evals/` (ESLint), so moving the tables is the only way to share them without a second table that drifts.
- **Production wrappers never throw.** `textCallCostUsd(model, metrics)` prices an unknown model at the most expensive known rate and warns once. `imageCallCostUsd(model, usage)` uses reported usage tokens (the Images API returns them; `mapImageUsage`), with a flat worst-case estimate (`IMAGE_CALL_FALLBACK_USD`, $0.25) and a one-time warning when usage is missing.

**Table** (`initializeDatabase` in `server/src/shared/db.ts`, `CREATE TABLE IF NOT EXISTS`, the repo's convention):

```sql
CREATE TABLE IF NOT EXISTS spend_daily (
  day DATE NOT NULL,                -- UTC
  bucket TEXT NOT NULL CHECK (bucket IN ('anonymous', 'account', 'other')),
  usd NUMERIC(12, 6) NOT NULL DEFAULT 0,
  text_calls INTEGER NOT NULL DEFAULT 0,
  image_calls INTEGER NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (day, bucket)
)
```

It holds totals only: no user ids, IPs, story ids or text. `.context/storage.md` lists it.

**Store** (`spend/spendStore.ts`): `addSpend(day, bucket, usd, kind)` is one `INSERT … ON CONFLICT (day, bucket) DO UPDATE SET usd = spend_daily.usd + EXCLUDED.usd, …` per call. `bucketTotalOn(day, bucket)` and `totalsSince(firstDay)` read the totals. Each call writes straight to the database, so the totals survive restarts.

**Ledger** (`spend/spendLedger.ts`):

- `recordTextCall(record)` takes `LlmCallRecord`. Calls without `metrics` (failed calls) are skipped: their cost isn't reported. A call with `storyId` takes its story's bucket; one without goes to `other`. It is fire-and-forget and never throws into LangChain.
- `textSpendCallback = new LlmCallLogger(recordTextCall)` reuses the existing callback class with a second sink. It is added beside `llmCallLogger` in `AIStoryGenerator.modelFor` and `ContentFilterService`. `usageRecorder.ts` stays free of database imports, which matters because the evals import it through `chatModel.ts`.
- `recordImageCall(charge, model, usage)` takes a charge of either `{ storyId }` or `{ bucket: "other" }`.
- `isOverCeiling(bucket)`: an unset ceiling means `false`, so the ledger only records. Otherwise it returns today's total ≥ the ceiling. On a database error it fails open with an error log: a database outage blocks starts anyway, and a ledger hiccup must not.
- `imagesAllowedFor(storyId)` returns `!isOverCeiling(origin)`.
- `spendTotals()` returns today's and this month's totals per bucket (UTC), plus the ceilings.
- `resolveSpendCeilings(env)` reads `SPEND_CEILING_ANONYMOUS_USD_PER_DAY` and `SPEND_CEILING_ACCOUNT_USD_PER_DAY`. Unset means `null` (record only); a finite number ≥ 0 is the ceiling, and 0 refuses everything in that bucket. Anything else throws. `index.ts` calls it at startup, like `TRUST_PROXY`.
- `AIStoryGenerator.generateStorySetup` adds `storyId` to its call metadata (it is the only story call that lacks it), so custom-story setup lands in its story's bucket. Only invoke metadata changes; prompts and schemas stay as they are, so the text eval's byte-for-byte replay is unaffected.

**Enforcement:**

- **Starts:** `storyRoutes.ts`, both routes, check the ceiling *before* the rate limit. The bucket is `account` if `req.user`, else `anonymous`. When it is over, the route answers 503 with a plain `errorMessage` (`SPEND_CEILING_MESSAGE` in `core/types/api.ts`): "New stories are paused until tomorrow: today's budget is used up. Stories already running continue, without new images." Nothing is incremented.
- **Images:** `StoryImageJobDeps` gets `mayGenerate(gameId): Promise<boolean>`. When it returns false, `startBackgroundImageGeneration` skips the generation and records a `recordImageFailure` for each request, so the reader hides the slot, as for a refused image. The story text goes on. Both construction sites (`GameQueueProcessor`, `StoryCreationService`) pass `imagesAllowedFor`. All in-game images (beats, cover, portraits) go through this one function.
- **Image recording:** `AIImageGenerator.generateImage` takes a charge. `generateBeatImage` passes `{ storyId }` and the template-editor methods pass `{ bucket: "other" }`. It records after success with the reported usage. The recorder is a constructor-injected dependency defaulting to `recordImageCall`, so the existing tests pass a stub.

**Admin:** `GET /admin/system/spend` (`verifyAdmin`) returns `spendTotals()`. The "System" tab shows today's and this month's totals per bucket, the call counts, and each ceiling as "not set (recording only)" or "$X a day, today: under / reached".

Alternatives rejected:

- An in-memory accumulator flushed periodically: it loses spend on restart or crash and is wrong with two instances.
- Excluding the editor and filter calls: the totals would then understate the bill by the most expensive calls.
- A flat price per image: the API reports usage tokens and the image eval already holds the rates, so the reported cost is more accurate at no extra cost.

### 7. "Start several groups" (client only)

On `TemplateConfigurator.tsx`, signed-in users (`useAuth`) see a "Start several groups" checkbox with a number field, 2–12, default 2 (`page/components/GroupStartField.tsx`). While it is on:

- The images checkbox is unchecked and disabled, with the line "Several groups start without unique images." The AI notice shows its existing no-images line, because it receives `images={false}`.
- The submit button reads "Start N stories".
- `page/hooks/useGroupStoryCreation.ts` sends N sequential `storyApi.createStoryFromTemplate` calls with the same settings and `generateImages: false`, forced in the request builder. Each counts as one text-only start on the server, through the ordinary route. Each one's codes go to local storage as today.
- It stops at the first failure: the rate limit, the ceiling or an error, which `apiClient` has already announced. If any stories were created it navigates to the seat-card view for them (`/users/seat-cards?stories=<ids>`), with a notification "Started k of N groups" when k < N. If none were, it stays on the form.

Alternative rejected: a server batch endpoint. `createStoryFromTemplate` writes the response itself, so a batch would mean refactoring it, plus a new route and a new rate-limit path. The loop reuses the existing route, and template starts are fast: no AI call, and images are off.

### 8. Printable seat cards

- **Server:** `GET /users/stories/created` (`verifyUser`, in `userRoutes.ts`) returns the signed-in user's newest 50 created stories with every seat code. It is a `createdOnly` option on `getStoryFeed` in `userStoryService.ts`, whose relevant-stories CTE becomes `SELECT id AS story_id FROM stories WHERE creator_id = $1 ORDER BY created_at DESC LIMIT 50`. The existing row mapping already includes codes for the creator. The existing feed lists only stories in which the user holds a seat or has local codes, so a teacher printing on another device would miss their class without this option.
- **Client:**
  - `client/src/users/stories/SeatCardsPage.tsx` is a standalone route, `/users/seat-cards`, wrapped in `UserRouteGuard` but outside `UsersLayout`, so nothing but the cards prints.
  - A screen-only toolbar (`print:hidden`) lists the created stories with checkboxes, preselecting `?stories=`, and has a Print button (`window.print()`).
  - `users/stories/seatCards.ts` turns the selected stories into cards. Groups are numbered 1..n in creation order (oldest first). There is one card per seat that has a code, carrying story title, "Group n", seat code, join link (`generateJoinLink`) and a QR of that link.
  - `users/stories/SeatCard.tsx` renders one card with `break-inside-avoid`.
  - `UsersStories.tsx` gets a "Print seat cards" link to the page.
- **QR library:** `qrcode.react` (`QRCodeSVG`), a new client dependency, MIT, with no dependencies of its own. It renders inline SVG, which prints sharply and works in the static-markup tests. It runs in the browser on a join link only, so it sees no personal data and sends nothing to a third party. The commit message must say so.

### 9. Joining by code on the home page

Verified broken. No server route matches `/stories/:code/exists` (`server/src/routes.ts` and `storyRoutes.ts`; the catch-all answers 404). `Page.tsx` also calls it with a bare `fetch("/api/…")`, which only the Vite dev proxy rewrites. In development every code therefore reads "Story code not found". In production the request goes to the static site, not `api.chosenpath.ai`, and only the static host decides what comes back (likely the SPA's index.html with a 200, so every code would pass). That is not verified.

The fix:

- Add `GET /stories/:code/exists` in `storyRoutes.ts`. It returns `200 { exists: boolean }`, so `apiClient` raises no pop-up on a miss, and never the story id. It is guarded by `limitFailures(addressKey, "verify_code", …)`, so a miss counts as a failed verification.
- In `Page.tsx`, call it through `storyApi.checkCodeExists(code)` in `apiClient.ts`, whose base URL is the API, and show the existing inline message when `exists` is false.

Alternative rejected: dropping the pre-check and navigating straight to `/game/:code`. The game page has no clear invalid-code message, and the inline error is better for a student typing a code.

### 10. Privacy

The limiter and the websocket stop logging addresses (above). `Privacy.tsx`'s "IP Address" card stays true and gains one sentence: for signed-in users, story starts are counted against the account instead of the address, also only in memory, and dropped when the limit's window ends (24 hours at most). A new card, "Usage totals", says the cost of AI calls is recorded as daily totals per kind of story (with or without an account) and contains no account, address or story content.

`.context/ai-transparency.md`, row #3 (in-game images), gets one line: a daily spend ceiling can stop new images, which are then hidden like failed ones. No model, label or marking changes.

### 11. Educators page

`ForEducators.tsx`'s `faqs` gain "Can I run this with a whole class?" The answer says: sign in, open a World from the library, choose "Start several groups" (up to 12 group stories of up to 3 players with the same settings), and print the seat cards (one per student, with the group number, a seat code, a join link and a QR code). Students need no account: they scan the card or type the code on the home page. Multi-group starts are text-only.

### Docs touched

- `.context/deployment.md`: `TRUST_PROXY` and the spend-ceiling variables.
- `.context/security.md`: the client address, the limits table by key kind, failed-only verification, the ceilings.
- `.context/storage.md`: `spend_daily`.
- `.context/api.md`: `/stories/:code/exists`, `/users/stories/created`, `/admin/system/*`, and the updated rate-limit lines for register, starts and choices.
- `.context/ai-transparency.md`: row #3.

### Debt named, not paid here

- `websocket.ts` keeps one large `setupSocketServer` with every handler inline. This plan changes the rate-limit lines of five handlers but doesn't split it: that is a separate refactor.
- `getStoryFeed` takes one more option. If a third variant ever comes, it should be split into a query builder and a row mapper.

## Changes

| File | Change |
|------|--------|
| `server/src/shared/clientAddress.ts` | **New.** The neutral hop-count function, legacy leftmost mode, `parseTrustProxy`, `describeConnection`, `requestAddress(req)` / `socketAddress(socket)` reading the configured hops. |
| `server/src/shared/rateLimiter.ts` | Generic keyed store (`addressKey`, `accountKey`, `seatKey`, `checkRateLimit`, `incrementRateLimit`), the address wrappers reading `requestAddress`, new `limitFailures`. `getClientIP`, `normalizeIP`, `getRateLimitInfo` and `getRateLimitConfig` are removed, and no log line carries a key value. |
| `server/src/shared/limitPolicy.ts` | **New.** `storyStartLimit`, `choiceLimitKey`. |
| `core/config.ts` | `RATE_LIMITED_ACTIONS` and `RATE_LIMITS` gain `register`, `initialize_story_text`, `initialize_story_images`. |
| `core/types/api.ts` | `ConnectionReport`, `SpendTotals` and `CodeExistsResponse` types; `SPEND_CEILING_MESSAGE`. |
| `server/src/config.ts` | `trustProxyHops()`: lazy, resolved once, one-time legacy warning. |
| `server/src/index.ts` | Calls `trustProxyHops()` and `resolveSpendCeilings()` before listening; `trust proxy` set to `hops ?? true` above the routes; `X-Forwarded-For` added to CORS `allowedHeaders`. |
| `server/src/game/websocket.ts` | Async `checkAndHandleRateLimit(socket, key, action, requestId)`; private `choiceKey(socket)`; `verify_code` and `rejoin_session` through `limitFailures`; IP logging removed. |
| `server/src/stories/StoryDbService.ts` | New `getStoryOrigin(storyId)`. |
| `server/src/stories/storyRoutes.ts` | Both start routes: ceiling check, then `storyStartLimit` key and action. New `GET /stories/:code/exists`. |
| `server/src/users/userRoutes.ts` | `/auth/register`: address limit, incremented after a created account. New `GET /users/stories/created`. |
| `server/src/stories/userStoryService.ts` | `getStoryFeed` gains a `createdOnly` option: a creator-id CTE, newest 50. |
| `server/src/spend/prices.ts` | **New.** Responsibility: what an AI call costs. The text and image price tables and usage-cost functions move here from the evals; never-throwing `textCallCostUsd` and `imageCallCostUsd` for production. |
| `server/src/spend/spendStore.ts` | **New.** Responsibility: the `spend_daily` SQL. Exports `addSpend`, `bucketTotalOn`, `totalsSince`, `utcDay`. |
| `server/src/spend/spendLedger.ts` | **New.** Responsibility: buckets, recording, ceilings and totals. Exports `recordTextCall`, `textSpendCallback`, `recordImageCall`, `imagesAllowedFor`, `isOverCeiling`, `spendTotals`, `resolveSpendCeilings`. |
| `server/src/system/adminSystemRoutes.ts` | **New.** Responsibility: the admin "System" page's two read-only routes, `GET /admin/system/connection` (no-store) and `GET /admin/system/spend`. Exports the router. |
| `server/src/routes.ts` | Mounts `adminSystemRoutes`. |
| `server/src/shared/db.ts` | `CREATE TABLE IF NOT EXISTS spend_daily` in `initializeDatabase`. |
| `server/src/evals/textModelEval/pricing.ts` | Imports the price table and `costFromUsage` from `spend/prices.ts`; behaviour unchanged. |
| `server/src/evals/imageModelEval/arms.ts` | Imports the image rates, `pricesFor` and `costFromUsage` from `spend/prices.ts`; behaviour unchanged. |
| `server/src/game/services/AIStoryGenerator.ts` | `modelFor` adds `textSpendCallback` to the callbacks; the setup call passes `storyId` in its metadata. |
| `server/src/game/services/ContentFilterService.ts` | Adds `textSpendCallback` to its callbacks. |
| `server/src/images/AIImageGenerator.ts` | `generateImage` takes a spend charge and records after success; the recorder is constructor-injected. |
| `server/src/game/services/StoryImageJobs.ts` | `StoryImageJobDeps.mayGenerate`; when false, failures are recorded and nothing is generated. |
| `server/src/game/services/GameQueueProcessor.ts`, `server/src/stories/StoryCreationService.ts` | Pass `mayGenerate: imagesAllowedFor` in their image-job deps. |
| `client/src/shared/apiClient.ts` | `storyApi.checkCodeExists`, `userStoriesApi.getCreatedStories`. |
| `client/src/page/Page.tsx` | The join check goes through `storyApi.checkCodeExists`. |
| `client/src/page/components/TemplateConfigurator.tsx` | Signed-in group option; image toggle disabled while it is on; submit goes to the group hook when on. |
| `client/src/page/components/GroupStartField.tsx` | **New.** Responsibility: the checkbox plus the 2–12 number field. Exports `GroupStartField`. |
| `client/src/page/hooks/useGroupStoryCreation.ts` | **New.** Responsibility: start N copies sequentially and hand over the created ids. Exports `useGroupStoryCreation`, `startSequentially`, `groupStartRequest`. |
| `client/src/users/stories/seatCards.ts` | **New.** Responsibility: selected stories into numbered seat cards. Exports `seatCardsFor`. |
| `client/src/users/stories/SeatCard.tsx` | **New.** One printable card with a QR. Exports `SeatCard`. |
| `client/src/users/stories/SeatCardsPage.tsx` | **New.** Selection toolbar, print button, cards grid. Exports `SeatCardsPage`. |
| `client/src/users/usersRoutes.tsx` | `/users/seat-cards` route, guarded, outside `UsersLayout`. |
| `client/src/users/stories/UsersStories.tsx` | "Print seat cards" link. |
| `client/src/admin/system/AdminSystemPage.tsx` | **New.** Address check panel and spend totals panel. Exports `AdminSystemPage`. |
| `client/src/admin/system/clientAddressVerdict.ts` | **New.** Responsibility: the forged-header verdict (pure). Exports `clientAddressVerdict`. |
| `client/src/admin/adminApi.ts`, `adminRoutes.tsx`, `components/AdminHeader.tsx` | `adminSystemApi` (two GETs, the second with the forged header); route `system`; tab "System". |
| `client/package.json` | `qrcode.react` dependency. |
| `client/src/page/static/Privacy.tsx` | Account-keyed limits sentence; "Usage totals" card. |
| `client/src/page/static/ForEducators.tsx` | FAQ "Can I run this with a whole class?" |
| `.context/deployment.md`, `security.md`, `storage.md`, `api.md`, `ai-transparency.md` | As listed under "Docs touched". |

## Tests

Server (`server/tests/unit/`, ESM Jest; database through `tests/__mocks__/shared/db.ts`'s `mockQuery`):

- `shared/clientAddress.test.ts`, the reference's cases:
  - Fixture: visitor `198.51.100.23`, chain `198.51.100.23, 172.16.0.2, 10.0.0.3`.
  - At 0 hops the address is the socket's, at 1 it is `10.0.0.3`, at 3 the visitor.
  - With `203.0.113.7` prepended: 3 still gives the visitor and 4 gives the forged entry. Without it, 4 gives UNKNOWN.
  - No header, or garbage at position N, gives UNKNOWN. `::ffff:198.51.100.23` gives `198.51.100.23`, and so do `198.51.100.23:5678` and `[::1]:80` → `::1`. Repeated header lines join in order.
  - `describeConnection`: `forwardedFor` is the chain as sent; the candidates are socket, `10.0.0.3`, `172.16.0.2`, visitor at hops 0–3, and the candidate at each count equals `address` at that count. With no header, the only candidate is the socket. The answer has exactly the seven keys.
  - Legacy mode returns the leftmost entry, else the socket.
  - `parseTrustProxy` accepts 0–10, returns null for unset or empty, and throws for `true`, `11`, `-1`, `1,2` and `10.0.0.0/8`.
- `system/adminSystemRoutes.test.ts`: the connection handler sets `Cache-Control: private, no-store`, returns only the report (nothing of `req.user`), and touches no database (`mockQuery` not called).
- `shared/rateLimiter.test.ts`:
  - Address, account and seat keys with the same suffix don't share counts.
  - The limit is reached at `maxRequests`, and the window resets (fake timers).
  - `limitFailures`: 15 failures limit the key; successes never count; a limited key refuses even an attempt that would succeed, and doesn't run it.
  - No logged line contains the address or account id (spy on `Logger.Route`).
- `shared/limitPolicy.test.ts`:
  - Anonymous starts, with or without images, go to address + `initialize_story`.
  - A signed-in text start goes to account + `initialize_story_text`; a signed-in start with images to account + `initialize_story_images`.
  - A choice in an account story with a seat gets the seat key; in an anonymous story, the address; with no seat or an unknown origin, the address.
- `spend/prices.test.ts`:
  - Text cost for a known model, cached tokens included.
  - An unknown model is priced at the highest rate, without throwing.
  - Image cost comes from reported usage; missing usage uses the fallback.
  - The eval's own pricing and arms tests keep passing unchanged.
- `spend/spendLedger.test.ts` (store and `getStoryOrigin` mocked):
  - A text record with `storyId` lands in its origin's bucket; without one, in `other`; without metrics, it isn't recorded; a store error doesn't throw.
  - `isOverCeiling`: an unset ceiling gives false; under gives false; at or over gives true; a store error gives false.
  - `resolveSpendCeilings`: unset gives null; `"5"` gives 5; `"0"` gives 0; `"abc"` and `"-1"` throw.
  - `spendTotals` sums today and the month per bucket.
- `spend/spendStore.test.ts`:
  - `utcDay` at 23:59:59.999 and 00:00 UTC.
  - `addSpend` sends the upsert with the increment and the right kind counter (assert the parameters on `mockQuery`).
- `game/services/StoryImageJobs.test.ts` (extend): with `mayGenerate` false, `generate` is never called and one `recordImageFailure` is enqueued per request; with true, behaviour is unchanged.
- `images/AIImageGenerator.test.ts` (extend): a written beat image records once with `{ storyId }`; a template image records with `other`; a failed image records nothing.

Client (`client/tests/unit/`, static render per `.context/testing.md`):

- `admin/clientAddressVerdict.test.ts`, the reference's verdict cases:
  - Chain `203.0.113.7, 198.51.100.23, 172.16.0.2, 10.0.0.3`: 3 is right; 4 and 7 are too high, correct 3; 2 and 0 are too low, correct 3.
  - No proxy: 0 is right; 1 is too high, correct 0.
  - No forged entry, or no chain: header removed.
  - The forged entry twice: the rightmost decides.
  - An unset count gives "not set, correct 3".
- `users/seatCards.test.ts`:
  - Only selected stories, numbered by creation order.
  - One card per seat with a code; seats without codes are skipped.
  - The join link comes from `generateJoinLink`.
- `page/useGroupStoryCreation.test.ts`:
  - `startSequentially` creates N in order, stops at the first rejection and returns the ids created so far.
  - `groupStartRequest` forces `generateImages: false` and clamps the count to 2–12.
- `page/TemplateConfigurator.test.tsx` (extend; mock `useAuth`): signed out shows no group option; signed in shows it.
- `page/Page.test.tsx` (extend): with `JoinGameForm` mocked to keep `onSubmit`, an existing code navigates to `/game/CODE`, and `exists: false` doesn't navigate.

No tests for the FAQ copy, the privacy wording or the `RATE_LIMITS` values: they are static content.

## Out of Scope

- Step 2 of the spec: facilitator role, class codes, lobby and grouping, per-teacher allowances, the application form, invitation codes.
- Email verification and password reset.
- Per-teacher budgets. The `account` ceiling is shared by all signed-in users, as the spec's variation 5 accepts.
- Splitting `websocket.ts` into per-event handlers (named debt above).
- Other personal data in logs: `Login failed for email: …` (`userRoutes.ts`) and the `userId` in the `verify_code` log line. Worth a separate privacy pass.
- Measuring and setting `TRUST_PROXY` and the ceilings in production: Odin's steps, documented in `.context/deployment.md`.
- An `env.example` for the server (none exists today).
