# Follow-up: classroom limits, step 1 (2026-10-26)

Branch: `claude/project-thread-aki27k`. Plan: `.plans/2026-10-26_classroom-limits-step1.md`. Commits: `60def87` (core and server), `9f40925` (client), `14d05fb` (docs, by the coordinator), `a4484a2` (the review's eight findings), all unpushed.

The owner, Odin, approved step 1's scope in the project thread ("go for step 1") and settled its behaviour beforehand (who may run a class, no email confirmation, anonymous use no easier to abuse). The planner's implementation decisions in the plan's `## Approach` were not shown to him item by item before implementation.

ashoka-engineering not loaded: plan-decisions, adr, project-context, arch-overview. So the implementer wrote no ADR, did not change the plan's header or archive it, and edited neither `CLAUDE.md` nor `.context/`. What those documents owe is listed under **Records to Refresh** below.

## Decisions to Review

- No ADR entries: the `adr` skill was not loaded, so no decision went into the log. The implementer's choices beyond the plan are under **Controversial Decisions**. Each one is small and none changes the product behaviour the owner settled.
- **Generic wording and the several-stories mode** (the owner's feedback, a direct task with no plan): no ADR either. ashoka-engineering not loaded: plan-decisions, adr, project-context, arch-overview. The implementer's choices are under **Controversial Decisions**, "Generic wording and the several-stories mode".

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

### Generic wording and the several-stories mode (owner's feedback, 2026-10-26)

Odin's feedback settled the wording, the mode switch and the audience pages. These are the implementer's own choices within that:

- **The code's names changed with the wording.** `GroupStartField` became `MultiStoryStartField`, and `useGroupStoryCreation` became `useMultiStoryCreation` (`STORY_COUNT_MIN`/`MAX`, `clampStoryCount`, `multiStoryRequest`, `startStories`). The seat card's `groupNumber` is now `storyNumber`, and the DOM ids are `start-several-stories` and `story-count`. A copy can be a single-player story, so "group" in the code would mislead. The alternative was to change only the copy, for a smaller diff.
- **The control has its own panel, right below Settings** and above the AI notice and the start button. Unticked, it looks like the Settings panel. Ticked, it turns into an accent panel (left accent border, `accent-50` background). Centred in it are a heading "You're starting N stories at once" (announced as it changes) and the count as a large number field between − and + buttons (48 px; − is disabled at 2, + at 12). Below them come "2 to 12 stories" and one line about seat codes and printable cards. While the box is ticked, the Settings heading reads "Settings for each story". The panel stays the same element in both states, so ticking the box by keyboard keeps focus on it.
- **Leaving the count field snaps it to the number that will start** (1 → 2, 40 → 12, empty → 2). The field, the heading and the button then show the same number.
- **The audience links are a visible line under the checkbox** ("See how educators, coaches, therapists and storytellers use it."), not part of the tooltip. The tooltip opens only on hover, and its icon can't take keyboard focus, so links inside it would be out of reach. They follow `Page.tsx`'s in-app pattern (`href` plus `navigate`, `text-link`) and add `underline`, because in a muted line colour alone doesn't set them apart (WCAG 1.4.1). They open in the same tab, so the form's settings are lost; Back returns to a fresh form. The alternative is a new tab.
- **Seats are numbered among the cards a story prints**, not by slot. A three-seat story whose third seat has no code prints "Seat 1 of 2" and "Seat 2 of 2". A card for a one-seat story names no seat.
- **A test guards the wording** (`client/tests/helpers/genericWording.ts`, `AUDIENCE_WORDS`). The signed-in configure page, the several-stories panel (ticked and unticked), the seat card and the seat-card page as first painted must not say group, class, classroom, facilitator, student or teacher. It encodes the owner's rule rather than mirroring copy. It went red when the old label was put back.
- **The Multiplayer lecture changed too, though the task didn't list it.** Its paragraph "Small groups, not whole classes" (under "Plan for Waiting") said to plan for one group at a time because of per-address limits. That no longer holds for stories started while signed in, whose choices count per seat (`limitPolicy.ts`), and it contradicted the new Educators FAQ. It is now "Several stories at once": it points to the feature and keeps the per-address caveat for stories started without an account. The Key Concepts line "one small group at a time" changed with it. No new lecture, so `sitemap.xml` is unchanged.
- **Landing pages, each in its own structure:**
  - Educators: the FAQ was rewritten. Number of players 1 means a story per student; 2 or 3, where the World allows it, means small teams.
  - Coaches: a new FAQ, "Can I use it in a workshop or team session?". It carries the existing FAQ's one-hour note and a line on comparing paths in the debrief.
  - Storytellers: a new FAQ, "Can I run my World at a game night or event?" (one story per table; the card's story number tells tables apart). It says "open your World from the library or its share link", because a user's own World reaches the configure page through `ShareLink` in the template editor. Not tried in a browser.
  - Therapists: a fourth card under "What the platform can do", "Several stories at once". It ends "Whether this fits group work in therapy is for practitioners to judge", with no clinical claim.
- **The partial-start warning** reads "Not every story started" / "Started k of N stories".
- **"Print seat cards" on My Stories** was already generic and stays as it was.

Polish after the coordinator's visual check:

- **The panel is a plain `div` now, not `ColoredBox`.** `ColoredBox` always adds `bg-white`, which the built CSS places after every tint class, so its active background never shows. Ticked, the panel is `bg-accent-100`, one step above `-50` so the tint is plain to see. Unticked, it is `bg-white`; the two never sit side by side.
- **The 8 px left bar is there in both states**, transparent when unticked, so ticking moves nothing. Unticked, the panel therefore shows no 1 px line on its left edge (the shadow marks it), and its content sits 7 px further in than the Settings panel's. A grey 8 px bar (`ColoredBox`'s grey look) was the alternative.
- **The −/+ buttons are their own small buttons, not `PrimaryButton`** (against `ui.md`'s "PrimaryButton for all buttons"). `PrimaryButton` can't drop its hover look on an `aria-disabled` button, and it shows its focus ring on a mouse click too. At 2 or 12 the button is `aria-disabled` rather than `disabled`, so a keyboard user stepping to the limit keeps focus on it. Unavailable means 40 % opacity, a not-allowed cursor and no hover style. While stories are starting, the buttons are `disabled` outright. The focus ring shows for keyboard focus only (`focus-visible`).
- **The tooltip is at most `min(20rem, 100vw − 1rem)` wide** (InfoIcon's `contentClassName`), so the Tooltip's existing `shift` keeps it within a 390 px screen. Placement stays `top`, and its `flip` moves it below only when there's no room above.

## Implementation Issues

- **Generic wording run, sub-agents:** again no tool for starting sub-agents, so there was no `tdd-guide`, no `feature-dev:code-reviewer` and no check worker. The tests were written first and seen red. The review was the implementer's own read of the diff, and the checks ran directly with their output filtered to failures and summaries. `tsc -p client/tsconfig.app.json` still shows only the four errors listed below, and `vite build` succeeds.
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
  - The template configure page, signed out (no several-stories option) and signed in. Ticking "Start several stories at once" should give:
    - the panel below Settings turning accent, with "You're starting N stories at once" and the count centred between − and + (2 to 12);
    - the Settings heading reading "Settings for each story";
    - images unticked and disabled, with their line;
    - the button reading "Start N stories".
    Check it at 390 px and by keyboard: Tab to − and +, type a number, and leave the field to see it snap. The links under the checkbox should open the four audience pages. The coordinator checked 0643bf3 visually; the polish commit after it (tint, fixed left bar, −/+ disabled look, tooltip width) wants one more look.
  - A start of 2 or 3 stories, which should land on `/users/seat-cards?stories=…` with those stories ticked. Each card should read "Story N · Seat k of m", with no seat on a one-seat story.
  - The seat-card page on screen and in the browser's print preview: only the cards print, two per row, none split across pages, and the QR codes scan.
  - `/admin/system`: the address verdict, the new row "Requests without a readable address" beneath it, and the spend table.
  - The login form after a 429 (21 wrong passwords from one address within 15 minutes): what the pop-up says.
  - The home page's join form: a real code opens the game, a wrong one shows "Story code not found".
  - The Educators FAQ and the Privacy page.
  - The new several-stories entries on the Coaches and Storytellers FAQs and the Therapists card, and the Multiplayer lecture's "Several stories at once" paragraph.
- **Production settings for Odin** (none are set by this branch, and production behaves as before until they are):
  - `TRUST_PROXY`: measure it on `/admin/system` from chosenpath.ai, from home and from a phone on mobile data, and set the number on Render's Environment page. Unset, limits keep using the forgeable leftmost entry and the server logs a warning at startup. A value other than 0–10 refuses startup.
  - `SPEND_CEILING_ANONYMOUS_USD_PER_DAY` and `SPEND_CEILING_ACCOUNT_USD_PER_DAY`: US$ per UTC day. Unset means the totals are only recorded; 0 refuses every start of that kind. A non-number refuses startup.

## Records to Refresh

- **The plan file** keeps its `status: approved` header and stays in `.plans/` (uncommitted), since `plan-decisions` wasn't loaded to move it.
- **Generic wording run:** no record touched. It changed no AI feature, model, label, stored data, outbound host or disclosure: checked against `.context/ai-transparency.md` and `Privacy.tsx`.

## Suggested Follow-Up Work

- **Deduplicate `@types/react`.** The workspace root has 19.0.8, pulled in by a `>=18` peer range, while the client pins 18.3.18. Any root-hoisted library that ships React types (`qrcode.react`, `react-router-dom`'s `Link`) then fails the client's JSX types. Pinning one version through `overrides`, or a `paths` entry for `react` in the client's two tsconfigs, would let `SeatCard.tsx` drop its re-typing.
- **Make the client's `tsc --noEmit` check the app** (`tsc -p tsconfig.app.json`, or `tsc -b`), and fix the four errors listed under **Implementation Issues** first.
- **Split `websocket.ts`'s `setupSocketServer`** into per-event handlers. This is the debt the plan named; this branch only changed the rate-limit lines of five handlers.
- **Do the privacy pass the plan left out:** `Login failed for email: …` in `userRoutes.ts`, and the code and `userId` in `websocket.ts`'s `verify_code` log line.
- **`getStoryFeed`** now has a `createdOnly` variant. A third variant should split it into a query builder and a row mapper (the plan's named debt).
- **The template editor's AI and image routes still check, then count after the call** (`server/src/templates/templateRoutes.ts` `templateGeneration` and `templateIteration`; `server/src/images/imageGenerationRoutes.ts`, three routes). That is the race the review fixed elsewhere: parallel requests all pass the check. They are worldbuilder-only and their spend is booked to `other`, so the review didn't name them. The fix is `claimRateLimitForRequest` before the call and `refund()` where the call creates nothing, as in `storyRoutes.ts`. `checkRateLimitForRequest` and `incrementRateLimitForRequest` can then go.
- **Sign-ups: 3 per address per 24 hours** may stop a school whose teachers all sign up on one day from one network. Watch for it; raising it, or counting by email domain, would be the owner's call.
- **Story origins across server processes.** With more than one server instance, an account deleted on one keeps its stories' account allowance on the others for up to ten minutes (`storyOrigins.ts`). The in-memory rate limits have the same single-process assumption. How many instances Render runs was not checked.

- **`ColoredBox`'s active tints never show, anywhere in the app.** Its base classes include `bg-white`, and the built CSS puts `.bg-white` after `.bg-accent-50`, `.bg-secondary-50` and the other tints. Every primary `PrimaryButton`, and every active `ColoredBox`, is white where a tint was meant. Applying the tint instead of `bg-white` (not beside it) would fix that, but it changes how every primary button looks: a visual review first.
- **The other InfoIcon tooltips have no width limit either.** On the configure page that includes the images and pregeneration ones. On a phone they can run to the screen's edge, as the several-stories one did. A default `max-w` in `InfoIcon` or `Tooltip` would fix them all.
- **InfoIcon tooltips can't be reached by keyboard anywhere.** `Tooltip`'s trigger is a `div` with no `tabIndex`, so keyboard and screen-reader users get none of the configure page's option explanations. Making `InfoIcon` a focusable button whose tip is its `aria-describedby` would fix every option at once.
- **15 text starts per account per hour** (`initialize_story_text`) means a second start of 12 stories within the hour stops after 3, with the partial-start warning. If teachers run classes back to back, raise the allowance or say so on the Educators page. That's the owner's call.
- **The configure page's mode switch is only partly tested.** The heading "Settings for each story" and the "Start N stories" label depend on the checkbox's state, which a static render can't tick. Only `MultiStoryStartField` is tested in its ticked state. A DOM test environment (jsdom plus Testing Library) would close that gap.
- **Write the wording rule down for future sessions?** The app's wording for starting several stories names no audience, and the audience pages explain it. Today only `client/tests/helpers/genericWording.ts` says so. A line in `.context/` could be added once `project-context` is loaded (borderline insight).
- **Server comment** `server/src/users/userRoutes.ts:316` still says a "teacher" prints seat cards. It is a comment only.

## Landing Queue

- Not queued: the owner is present in the session; landing (push of the branch, then merge to main, which deploys) is asked of him there.
