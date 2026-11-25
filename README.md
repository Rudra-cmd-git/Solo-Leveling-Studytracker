# Hunter System

A multiplayer study tracker built as a progression RPG. Focused study time is
verified on the server, converted into XP, and turned into levels, ranks, quests,
achievements and a global leaderboard.

Everything here runs on free tiers: **Next.js on Vercel Hobby + Supabase Free**.
No paid APIs, no AI services, no paid UI kits, no paid fonts, no domain required.

> Original design, inspired by progression-RPG "system window" interfaces.
> Not affiliated with, endorsed by, or containing assets from any published work.

---

## What it does

| Area | Behaviour |
| --- | --- |
| Accounts | Email + password auth through Supabase Auth. Signup creates a Hunter profile (ID, level 1, F-Rank) via a database trigger. |
| Focus timer | Start / pause / resume / complete / discard. Credited time is derived from **server** timestamps and heartbeats, never from the device clock. |
| XP | 1 credited minute = 1 XP. Written by a single server-side function, recorded in an append-only ledger with a unique source key, so a session can never pay out twice. |
| Levels | `need(level) = 100 + (level - 1) × 25`, computed in SQL (and mirrored in `src/lib/progression.ts` for rendering). |
| Ranks | F 0 · E 500 · D 1 500 · C 3 000 · B 6 000 · A 10 000 · S 15 000 lifetime XP. |
| Quests | Daily, weekly and one-off objectives materialised from a template catalog, progress evaluated from recorded sessions only. |
| Achievements | 15 seeded achievements across four rarities, unlocked by server evaluation, never assignable by the client. |
| Analytics | Daily series, XP curve, consistency grid, subject split, streaks — all computed in Postgres. |
| Leaderboard | All-time / monthly / weekly boards with search, your own standing, and privacy opt-out. |
| Avatars | Uploaded to a public `avatars` Storage bucket (PNG/JPEG/WebP, 2 MB). Writes are pinned to `avatars/<your user id>/` by storage RLS, and `profiles.avatar_url` rejects any URL outside that folder. No avatar falls back to a generated glyph. |
| Friends | Request by handle, accept or decline, one row per pair. Only public level, rank and XP are shared. The friends board ranks you and your roster even when a member opted out of the global board (private hunters stay excluded). |
| Guilds | One guild per hunter (enforced by a unique index, not by convention). Leader / officer / member roles, join and leave RPCs, leadership hand-over on departure, dissolution when empty. Guild score is the sum of members' verified XP — a guild has no XP path of its own. |
| Seasons | Monthly competition. The catalog is generated from the database clock (no cron, no manual seeding), standings count only XP earned inside the window, and the previous season's top three stay on display. Season XP never touches lifetime XP or rank. |
| Privacy | Public profile toggle, leaderboard opt-out, email never exposed, private notes never published. |
| Mobile | Responsive from 390 px to 1600 px with zero horizontal overflow (verified by script). |

---

## Stack

- **Next.js 16** (App Router, Server Components, Server Actions, Turbopack)
- **React 19** + **TypeScript**
- **Tailwind CSS v4** with a hand-written design system in `src/app/globals.css`
- **Supabase** — Postgres, Auth, Row Level Security (no ORM, no custom server)
- **Recharts** for charts, **Lucide** for icons, **Zod** for validation
- **date-fns**, `clsx`, `tailwind-merge`, `class-variance-authority`

Total dependency footprint is small on purpose: everything else is project code.

---

## Quick start

### 1. Install

```powershell
npm install
```

### 2. Create the Supabase project (free)

1. Sign in at <https://supabase.com> → **New project** (free plan, 2 projects max).
2. Choose a region close to you and save the database password somewhere safe.
3. Open **Project Settings → API** and copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / publishable key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 3. Apply the migrations

Open **SQL Editor** in the Supabase dashboard and run each file in
`supabase/migrations/` **in order**, one at a time:

| File | Contents |
| --- | --- |
| `0001_core_schema.sql` | Enums, config tables, profiles, subjects, topics, sessions, pauses, heartbeats, XP ledger, quests, achievements, notifications, rate limits |
| `0002_progression.sql` | Level curve + inverse, rank lookup, metrics, triggers for level/rank/session aggregates/streaks, signup trigger, rate limiting |
| `0003_engine.sql` | Credited-time maths, session lifecycle RPCs, quest + achievement evaluation, `complete_study_session` (the only XP path), profile updates, account deletion |
| `0004_rls.sql` | Row Level Security on every table, default-grant revocation, per-role function grants |
| `0005_leaderboard.sql` | `leaderboard()`, `leaderboard_size()`, `my_leaderboard_standing()`, `public_hunter_profile()` |
| `0006_catalog_seed.sql` | 13 quest templates and 15 achievements |
| `0007_analytics.sql` | `hunter_overview()`, daily series, subject breakdown, history, subject summary |
| `0008_avatar_storage.sql` | `avatars` Storage bucket + storage RLS, `avatar_url_allowed()`, avatar URL guard trigger on `profiles`, `set_my_avatar()` |
| `0009_social_friends.sql` | `friendships` table + RLS, request/accept/decline/remove RPCs, hunter search, `friend_leaderboard()` |
| `0010_guilds.sql` | `guilds` + `guild_members` tables + RLS, create/join/leave/role RPCs, `guild_leaderboard()`, `guild_detail()` |
| `0011_seasons.sql` | `seasons` catalog (generated), `current_season()`, `season_leaderboard()`, `previous_season_summary()`, `my_season_standing()`, PUBLIC-execute hardening |
| `0012_public_profile_columns.sql` | Column-level grants on `profiles`: anonymous readers get the public hunter card only, not `timezone`, `daily_goal_minutes`, `role` or `last_study_date` |

With the Supabase CLI instead:

```powershell
npx supabase link --project-ref <your-ref>
npx supabase db push
```

### 4. Environment

```powershell
Copy-Item .env.example .env.local
```

Fill in:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

The service-role key is **not** required and is never read by the app. If you
add it for your own scripts, keep it server-side only.

### 5. Auth settings (one-time, in the dashboard)

- **Authentication → Providers → Email**: enable email/password.
- **Authentication → Sign In / Up**: either disable *Confirm email* for instant
  sign-in, or keep it and add your own SMTP (free tiers exist) so confirmation
  mails actually arrive.
- **Authentication → URL Configuration**: set *Site URL* to `http://localhost:3000`
  for local work and add `https://<your-app>.vercel.app/auth/callback` as a
  redirect URL when you deploy.

### 6. Run

```powershell
npm run dev
```

Open <http://localhost:3000>. If credentials are missing the app shows an
explicit "System offline" screen instead of failing silently.

### 7. Verify the project is wired correctly

```powershell
npm run verify:supabase
```

This is the gate before any further development: it exits non-zero if anything
is wrong, and it refuses to run at all when credentials are missing rather than
assuming the project is configured.

What it checks against **your** project:

| # | Check |
| --- | --- |
| 1 | Project reachable, auth settings readable |
| 2 | Catalog seeded (`sets` / quests / achievements from `0006`) |
| 3 | `progression_config` readable |
| 4 | `leaderboard()` callable by an anonymous visitor |
| 5 | Private surfaces closed to anon: `study_sessions`, `xp_transactions`, `subjects`, `notifications` |
| 6 | `avatars` bucket exists and is public-read (`0008`) |
| 7 | Guild board callable by anon; `friendships` hidden from anon; `send_friend_request` refuses anon (`0009`/`0010`) |
| 8 | Anonymous readers cannot select behavioural `profiles` columns (`0012`) |
| 9 | **Live cross-user isolation**: signs up two throwaway hunters, then proves B cannot read A's session by id, cannot read A's XP ledger, cannot complete A's session, cannot raise its own XP/level/rank, and cannot insert XP rows; finally checks that leaderboard rows carry only public fields and deletes both accounts |

Check 9 needs *Confirm email* switched off (or you will see a `skip` line with
instructions, not a failure). The throwaway accounts are named
`verify-*@hunter-verify.test` and are self-deleted at the end; if deletion is
blocked, the script prints the address to remove by hand.

If you only want to test the database without a live project, `npm run db:test`
does the same at the SQL level against a local Postgres.

---

## How the anti-cheat model works

There is exactly one function that can award progression XP, and it runs inside
Postgres with `SECURITY DEFINER` privileges that the browser cannot obtain.

```
Browser                       Next.js (server)                 Postgres
───────                       ────────────────                 ────────
Start focus  ──────────────▶  startSessionAction ───────────▶  start_study_session()
  (server generates token)                                     · one active session per hunter

Every ~20 s   ─────────────▶  heartbeatSessionAction ─────────▶  heartbeat_study_session()
                                                               · writes a heartbeat row

Pause/resume  ─────────────▶  pause/resumeSessionAction ──────▶  pause_study_session()
                                                               · pause window recorded

Complete      ─────────────▶  completeSessionAction ──────────▶  complete_study_session()
                                                               · credited = Σ clipped gaps
                                                               · XP = minutes × rate (daily cap)
                                                               · ledger insert (unique source)
                                                               · level/rank triggers fire
                                                               · quests + achievements evaluated
```

Properties that fall out of this design:

- **No doorbell for cheaters.** The client cannot call `INSERT` on
  `xp_transactions`, `study_sessions`, `quests` or `user_achievements` at all —
  RLS grants are read-only for those tables, and only `subjects` / `topics` are
  writable directly.
- **Idle time is worthless.** Credited seconds are the sum of heartbeat gaps,
  each clipped to `max_heartbeat_gap`, minus pause overlaps. A closed tab stops
  heartbeating, so it stops earning.
- **Duplicate completion is harmless.** `complete_study_session` is idempotent:
  it returns `already_completed: true` and awards nothing the second time, and
  the ledger has a unique `(user_id, source, source_id)` key as a second lock.
- **Daily caps never destroy data.** If the daily XP cap is hit, XP stops but the
  session is still stored with its full credited minutes.
- **Ranks cannot be bought or edited.** `profiles` has no client write grant for
  `xp_total`, `level` or `rank`, and the triggers ignore client values.
- **Admins cannot self-promote.** `profiles.role` is only writable by the
  database owner, never through an RPC.

### Row Level Security summary

| Table | anon | authenticated |
| --- | --- | --- |
| `profiles` | read public rows | read public rows + own row |
| `rank_thresholds`, `progression_config`, `achievements`, `quest_templates` | read | read |
| `subjects`, `topics` | — | full CRUD on own rows |
| `study_sessions`, `study_session_pauses`, `study_session_heartbeats`, `xp_transactions`, `quests`, `user_achievements`, `notifications` | — | read own rows |
| `rate_limit_events` | — | — (service role only) |
| `storage.objects` (`avatars` bucket) | read | read + write inside `avatars/<own id>/` only |
| `friendships` | — | read own rows only (all writes via RPCs) |
| `guilds` | read | read (all writes via RPCs) |
| `guild_members` | — | read (all writes via RPCs) |
| `seasons` | read | read (catalog is generated by the migration) |

All mutations flow through `SECURITY DEFINER` functions that re-check
`auth.uid()` on every call.

---

## Progression tuning

The numbers live in two places that must agree:

1. **Database (authority)** — `progression_config` and `rank_thresholds` tables.
2. **TypeScript (rendering only)** — `PROGRESSION` and `RANKS` in
   `src/lib/progression.ts`.

`progression_config` keys: `xp_per_minute`, `daily_xp_cap`,
`min_session_seconds`, `max_session_seconds`, `max_heartbeat_gap`. Rebalancing
XP is an `UPDATE` on that table — no redeploy, no migration, no lost history.

If you change ranks, update the `rank_thresholds` rows **and** the `RANKS` array,
then run `npm run typecheck` to catch drift on the UI side.

---

## Verification

Everything below was run on this codebase.

```powershell
npm run typecheck      # strict TypeScript, no emit
npm run lint           # ESLint (next/core-web-vitals)
npm run build          # production build, 17 routes
```

### Database test suite (247 assertions)

`scripts/db-test.mjs` recreates a scratch database, applies all migrations and
runs `supabase/tests/10_engine_tests.sql`, which exercises the real logic:
session lifecycle, heartbeat gap clipping, pause exclusion, duplicate
completion, daily cap, level and rank transitions, streak rollover, quest
materialisation and evaluation, achievement unlocks, RLS isolation between two
hunters, leaderboard privacy, analytics shapes, rate limiting and account
deletion.

It needs any Postgres 14+ instance (no Docker required):

```powershell
$env:PGHOST="127.0.0.1"; $env:PGPORT="5433"; $env:PGUSER="postgres"
$env:PG_BIN="C:\Users\<you>\scoop\apps\postgresql\current\bin"
npm run db:test
```

### App ↔ database contract

`npm run db:contract` parses every `supabase.rpc(...)`, `.from(...)` and
`.select(...)` in `src/` and checks the names, argument names, tables and
columns against the live schema and function grants. Current result:

```
Contract check passed: 46 RPC calls, 19 table references, 51 columns verified.
```

### Responsive layout

`npm run check:layout -- http://localhost:3100 / /login /leaderboard` drives a
headless Edge/Chrome over the DevTools protocol at 390 / 834 / 1280 / 1600 px and
fails if any element extends past the viewport.

```
No horizontal overflow at any tested width.
```

`npm run shots` saves full-page screenshots to `screenshots/` (git-ignored) if
you want to eyeball a change.

---

## Deploy: GitHub → Vercel Hobby → Supabase Free (₹0)

1. Push this repo to GitHub.
2. In Vercel: **Add New → Project → Import** the repo. Framework is detected as
   Next.js; keep the default build settings.
3. Add the two environment variables (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`) for Production, Preview and Development.
4. Deploy, then add `https://<your-app>.vercel.app/auth/callback` to Supabase
   **Authentication → URL Configuration → Redirect URLs**.
5. Run `npm run verify:supabase` locally against the same project to confirm the
   database layer.

### Free-tier limits you should know about

**Supabase Free** — $0: 500 MB database, 50 000 monthly active users, 5 GB
bandwidth, 2 active projects. Projects are **paused after ~1 week of low
activity** and can be restored from the dashboard for up to a year. A few
requests a day is enough to stay awake. (<https://supabase.com/pricing>,
<https://supabase.com/docs/guides/platform/free-project-pausing>)

**Vercel Hobby** — $0: 100 GB fast data transfer, 1 000 000 function
invocations, 4 CPU-hours of active CPU, 300 s function duration cap, 100
deployments/day. Hobby is intended for **personal, non-commercial** projects; if
this ever becomes a commercial product you are expected to move to Pro.
(<https://vercel.com/docs/plans/hobby>,
<https://vercel.com/docs/functions/limitations>)

What that means for a study tracker: a few hundred hunters recording a few
sessions a day is nowhere near any of these ceilings. The realistic risks are
(a) the Supabase project pausing after a quiet week, and (b) free-tier email
sending limits — which is why disabling *Confirm email* (or bringing your own
SMTP) is the recommended setup for a personal instance.

**Nothing in this repo requires a paid dependency.** If you add one later, add a
row to `docs/free-tier.md`.

---

## Project layout

```
src/app
  page.tsx                     landing page (live top-5 board)
  login/ signup/ auth/callback/ awakening/
  (app)/                       authenticated shell: dashboard, study, subjects,
                               quests, achievements, analytics, history,
                               friends, guilds, guilds/[slug], seasons,
                               profile, settings
  (public)/                    leaderboard + /hunters/[username]
  actions/                     server actions (auth, study, subjects, profile)
src/components
  app/        shell, sidebar, notification centre, setup notice
  auth/       sign-in, sign-up, awakening cinematic
  charts/     recharts wrappers + consistency grid
  social/     friends manager, guild forms and roster controls
  study/      focus runner (timer finite-state machine)
  subjects/   subject + topic manager
  system/     panel, rank badge, meters, avatar, System notifications
src/lib
  progression.ts  XP/level/rank maths (mirror of SQL)
  auth.ts         cached session helpers
  data/           typed read models over RPCs
  supabase/       browser + server clients, env guards
  validation.ts   zod schemas + database error mapping
supabase/migrations   the entire backend
supabase/tests        SQL test suite
scripts               db tests, contract check, layout check, screenshots
```

---

## Not built (deliberately)

These are the phase-8 items that are **not** in this codebase. Nothing in the UI
pretends otherwise — there are no stubs or dead buttons for them:

- Direct messages (explicitly out of scope for the MVP)
- Email digests or push notifications (in-app notifications only)
- Realtime multiplayer presence
- Admin moderation console

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| "System offline" screen | env vars missing | fill `.env.local`, restart `npm run dev` |
| Redirect loop to `/login` | Supabase URL/keys wrong or session cookies blocked | re-check keys, hard-refresh, ensure you use `localhost` (not `127.0.0.1`) to match the auth cookie |
| Signup succeeds but no email | confirmation enabled without SMTP | disable *Confirm email* or configure SMTP |
| `row-level security` error on a simple read | migrations applied out of order, or a client tried to write a protected table | re-apply `0001` → `0007` in order; writes must go through the server actions |
| XP not awarded on completion | session under `min_session_seconds`, or daily cap reached | the UI states both cases explicitly |
| Quest board empty | no completed session yet | `refresh_quests()` materialises on first completion |
| Avatar upload says “bucket not found” | `0008_avatar_storage.sql` was not applied | run that migration (or `supabase db push`) and retry |
| Avatar upload succeeds but the image is not saved | storage RLS on `storage.objects` is missing | re-apply `0008`; it recreates the four `avatars_*` policies |

---

## License / attribution

Original work. The interface deliberately echoes the *idea* of a floating
"system window" from progression fiction; no characters, names, logos, artwork
or text from any published work are used.


---

## Social layer (friends, guilds, seasons)

Three systems sit on top of the XP engine and share one rule: **they never write
XP**. Everything they rank is read from `xp_transactions`, so a guild or season
score cannot be inflated by calling an RPC.

| System | Tables | Write path | Score source |
| --- | --- | --- | --- |
| Friends | `friendships` | `send_friend_request`, `respond_friend_request`, `remove_friend` | `xp_transactions` per member |
| Guilds | `guilds`, `guild_members` | `create_guild`, `join_guild`, `leave_guild`, `update_my_guild`, `set_guild_member_role`, `remove_guild_member` | sum of members' `xp_transactions` |
| Seasons | `seasons` | none at runtime (generated by migration 0011) | `xp_transactions` inside the month |

Routes: `/friends` (roster + private friends board), `/guilds` (registry +
founding form), `/guilds/[slug]` (guild hall), `/seasons` (current month + last
season winners).

Rules that the database enforces rather than the UI:

- a friendship has exactly one row per pair, and both sides must agree;
- one guild per hunter (unique index on `guild_members.user_id`);
- the guild owner is moved automatically when a leader leaves, and the guild is
  deleted when its last member goes;
- private hunters are excluded from every board, including the friends one;
- opting out of the leaderboard also removes you from season standings.
