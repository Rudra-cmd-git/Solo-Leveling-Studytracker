# Free-tier budget

The brief for this project was **₹0 to run**. This file records every service the
app touches, what the free tier actually allows, and what we would switch to if a
limit were ever hit.

Last checked: 2026-11.

## 1. Hosting — Vercel Hobby ($0)

| Resource | Hobby allowance |
| --- | --- |
| Fast data transfer | 100 GB / month |
| Function invocations | 1 000 000 / month |
| Active CPU | 4 CPU-hours / month |
| Provisioned memory | 360 GB-hours / month |
| Max function duration | 300 s |
| Deployments | 100 / day |
| Projects | 200 |

Sources: <https://vercel.com/docs/plans/hobby>, <https://vercel.com/docs/functions/limitations>

**Caveats**

- Hobby is for personal, non-commercial use. A commercial launch needs Pro ($20/month).
- Usage above an included amount pauses that feature until the cycle resets; it
  does not silently bill you.
- Server Actions and Server Components are billed as function invocations, so a
  page with several RPCs costs one invocation — not one per query.

**If it ever overflows:** Cloudflare Pages/Workers free tier, Netlify free tier,
or self-host `next build && next start` on a machine you already own.

## 2. Database, Auth, API — Supabase Free ($0)

| Resource | Free allowance |
| --- | --- |
| Database size | 500 MB |
| Monthly active users | 50 000 |
| Egress | 5 GB / month |
| Active projects | 2 |
| File storage | 1 GB (unused here — no uploads) |
| Backups | none on free (data export via `pg_dump` is your responsibility) |
| Inactivity pausing | project pauses after ~1 week of low activity; restorable for 1 year |

Sources: <https://supabase.com/pricing>, <https://supabase.com/docs/guides/platform/free-project-pausing>

**Sizing sanity check:** one session row is ~200 bytes, one XP ledger row ~120
bytes, one heartbeat ~100 bytes. A hunter studying 3 sessions a day for a year
produces roughly 1 MB including heartbeats — so 500 MB holds on the order of
hundreds of long-term hunters. Heartbeat rows are the only table that grows fast;
if you ever get close, add a nightly `DELETE FROM study_session_heartbeats WHERE
created_at < now() - interval '30 days'` job inside the database (free).

**Anti-pause trick:** any request to the database counts as activity. Opening the
app a few times a week is enough. If you want to be certain, add a free
`cron`-style ping from GitHub Actions (public repo minutes are free) that calls
`/rest/v1/rpc/leaderboard_size` once a day with the anon key.

## 3. Fonts — Google Fonts via `next/font` ($0)

Geist, Geist Mono and Rajdhani are downloaded at build time and self-hosted by
Vercel. No runtime request to Google, no licence fee, works offline.

## 4. Icons & UI — Lucide + hand-written CSS ($0)

Lucide is ISC licensed. There is no paid UI kit: the panels, meters, rank badges,
glows and animations are project CSS in `src/app/globals.css`.

## 5. Charts — Recharts ($0)

MIT licensed, bundled, no hosted analytics service.

## 6. Email (optional, $0)

Supabase's built-in sender is rate limited and only meant for testing. Two free
options:

1. **Turn email confirmation off** (recommended for a personal instance) — no mail
   is needed at all.
2. Bring your own SMTP: Resend free tier (3 000/month), Brevo free tier
   (300/day), or Gmail app-password SMTP for a single-user instance.

## 7. Domain ($0)

Use the `*.vercel.app` subdomain that comes with the project. A custom domain is
the only thing in this stack that would genuinely cost money (~₹900/year).

## 8. Nothing else

No AI API, no payment provider, no error-tracking SaaS, no image CDN, no
third-party analytics. Errors are logged to the platform's own function logs,
which are included in both free tiers.
