### PostgreSQL Tables

- **users**: Authentication, roles, preferences
- **stories**: Metadata, sharing settings, AI generation logs
- **story_players**: One row per seat in a story: its join code, the account that claimed it, active or archived
- **templates**: Public library entries, tags, ratings
- **feedback**: User feedback and content moderation
- **spend_daily**: AI spend per UTC day and bucket (`anonymous`, `account` or `other`, by who started the story): `day`, `bucket`, `usd`, `text_calls`, `image_calls`, `updated_at`. Totals only, with no user id, address, story id or text. Every AI call adds to its row (`server/src/spend/`); the daily spend ceilings and `/admin/system` read it

The server creates the tables at startup (`initializeDatabase` in `server/src/shared/db.ts`). It connects with `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USER` and `DB_PASSWORD`; unset ones fall back to the docker-compose database (`server/src/shared/dbSettings.ts`).

### File Storage

- **Story data**: JSON files in `/data/stories/[uuid]/`
- **Template data**: JSON files in `/data/templates/[uuid]/`
- **Images**: Generated/uploaded images organized by story/template ID

Optional fields, added without a migration (a file without one reads as before):

- `reflectionQuestions` (since 2026-10-27), by outcome id, at most 5 strings of at most 300 characters each (`core/types/reflectionQuestions.ts`): in a template's `template.json`, the author's, kept only for outcomes it holds; in a story's state, those of the outcomes it plays, from its several-stories start or its World. Absent where there are none. Export and import carry the template's in `template.json`.

### Local development database

A local Postgres in Docker, filled with synthetic (made-up) data, so the app runs on your machine and logged-in flows can be tried without production data.

1. Start Postgres (repo root): `docker compose up -d postgres_dev`. This is container `chosenpath_postgres_dev` with database `chosenpath_dev` on `localhost:5432`.
2. Point the server at it. In `server/.env`, either leave `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USER` and `DB_PASSWORD` unset (the defaults are the `docker-compose.yml` values) or set them to the values in `docker-compose.yml`. Set `NODE_ENV=development` (with it unset the server only accepts the production origin, so the client on localhost can't log in), and set no `DATABASE_URL` and no `RENDER*` variable.
3. Seed it (from `server/`): `npm run seed:dev`. Its first line names the target: `Seeding chosenpath_dev on localhost:5432 as devuser`. It creates any missing tables and roles the way the server does at startup, then adds the rows.
4. Start the app (repo root): `npm run dev`. The client is on http://localhost:5173 and the server on :3000.
5. Check that the app reads the dev database. Log in at http://localhost:5173 as `claude@localdevelopment.com` with password `asdF!234`. `/users/my-stories` lists the "Dev sample story" entries (`/users/archive` the finished one), `/library` shows the published "Dev sample" templates, and `/admin/feedback` the "Synthetic" rows. The server reads the same `DB_*` variables the seed checked, so seeing these rows means it is on the dev database. To look in the database itself: `docker compose exec postgres_dev psql -U devuser -d chosenpath_dev -c "SELECT email, role_id FROM users ORDER BY email;"`.

**The guard.** The seed exits with code 1 and lists every reason, before it connects, if any of these holds: `NODE_ENV` is `production`; a Render variable is set (`RENDER`, `RENDER_SERVICE_ID`, `RENDER_SERVICE_NAME`, `RENDER_INSTANCE_ID`, `RENDER_EXTERNAL_HOSTNAME`, `RENDER_EXTERNAL_URL`); `DATABASE_URL` names a host other than this machine; the database host is not `localhost`, `127.0.0.1`, `::1` or `postgres_dev` (the compose service); or the database name does not end in `_dev`. It runs the same check again on the connection pool's own settings before the first query. It reads `server/.env` itself, so it checks what the server would connect to.

**What it adds.**

- Accounts, all with the password `asdF!234`: `claude@localdevelopment.com` (admin, the local test login), `dev-admin@example.com` (admin), `dev-worldbuilder@example.com` (worldbuilder), `dev-player@example.com` and `dev-player2@example.com` (user). They are created through the app's own sign-up code (`createUser`, bcrypt). An account that already exists is used as it is, with its password and role unchanged.
- 4 templates (2 published, 1 in review, 1 draft), 5 stories with their `story_players` rows (codes `DEV001` to `DEV008`, one story archived, one seat unclaimed), and 5 feedback rows.
- For each template, a blank `template.json` in `data/templates/<id>/`: the empty template the editor starts from, with the sample's title and settings. It is written only where no file exists yet.

**Running it again adds nothing.** Ids are fixed UUIDs, every insert is `ON CONFLICT DO NOTHING`, and the only `UPDATE` sets the role of an account that the same run has just created. It never deletes anything. To start over, `docker compose down -v` removes the dev volume and everything in it.

**Limits.** The synthetic stories have no story file, so opening one does not load. The templates hold no story content, so starting a story from one is not supported, and it would call OpenAI with the server's key.

Code: `server/src/scripts/seedDevDatabase.ts` (the command), `devSeedGuard.ts`, `devSeedData.ts` and `devSeedWriter.ts`. Their tests are in `server/tests/unit/scripts/`.
