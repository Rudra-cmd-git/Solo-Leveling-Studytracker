#!/usr/bin/env node
/**
 * Post-setup check for a real Supabase project.
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY from the
 * environment or .env.local, then verifies that the migrations were applied and
 * that Row Level Security is actually blocking anonymous access.
 *
 * Usage:
 *   npm run verify:supabase
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, raw] = match;
    if (process.env[key]) continue;
    process.env[key] = raw.replace(/^["']|["']$/g, "");
  }
}

loadEnvFile();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (.env.local).");
  process.exit(2);
}

const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const results = [];

function record(ok, label, detail) {
  results.push({ ok, label, detail });
  console.log(`${ok ? " ok " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

async function call(path, init = {}) {
  const response = await fetch(`${url.replace(/\/$/, "")}${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

const missingFunction = (result) => {
  const message = JSON.stringify(result.body ?? "");
  return result.status === 404 || /Could not find the function|does not exist/i.test(message);
};

console.log(`Checking ${url}\n`);

// 1. Project reachable + auth settings
const settings = await call("/auth/v1/settings");
if (settings.status === 200) {
  const confirm = settings.body?.mailer_autoconfirm;
  record(
    true,
    "Auth service reachable",
    confirm === true
      ? "email confirmation is DISABLED (instant sign-in)"
      : "email confirmation is ENABLED (owner must confirm or disable it)",
  );
} else {
  record(false, "Auth service reachable", `status ${settings.status}`);
}

// 2. Catalog seeded (requires 0006)
const catalog = await call("/rest/v1/achievements?select=code&limit=1");
if (catalog.status === 200 && Array.isArray(catalog.body)) {
  record(catalog.body.length > 0, "Achievement catalog seeded", `${catalog.body.length} row(s) readable`);
} else {
  record(false, "Achievement catalog seeded", `status ${catalog.status} — apply supabase/migrations/0006_catalog_seed.sql`);
}

// 3. Configuration readable
const ranks = await call("/rest/v1/rank_thresholds?select=code,min_xp&order=min_xp");
record(
  ranks.status === 200 && Array.isArray(ranks.body) && ranks.body.length === 7,
  "Rank thresholds present",
  ranks.status === 200 ? `${ranks.body?.length ?? 0} ranks` : `status ${ranks.status}`,
);

// 4. Public leaderboard RPC exists and is callable by anon
const board = await call("/rest/v1/rpc/leaderboard", {
  method: "POST",
  body: JSON.stringify({ p_period: "all", p_limit: 5, p_offset: 0, p_search: null }),
});
if (missingFunction(board)) {
  record(false, "leaderboard() function", "missing — apply 0005_leaderboard.sql");
} else {
  record(board.status === 200, "leaderboard() callable by anon", `status ${board.status}`);
}

// 5. Private surfaces must be closed to anon
const sessions = await call("/rest/v1/study_sessions?select=id&limit=1");
record(
  sessions.status !== 200 || (Array.isArray(sessions.body) && sessions.body.length === 0),
  "study_sessions hidden from anon",
  `status ${sessions.status}`,
);

const overview = await call("/rest/v1/rpc/hunter_overview", { method: "POST", body: "{}" });
record(
  overview.status >= 400 || missingFunction(overview),
  "hunter_overview() requires auth",
  `status ${overview.status}`,
);

const insertAttempt = await call("/rest/v1/xp_transactions", {
  method: "POST",
  body: JSON.stringify({ amount: 99999, source: "hack" }),
});
record(insertAttempt.status >= 400, "direct XP writes rejected", `status ${insertAttempt.status}`);

// 6. Avatar storage (requires 0008)
const avatarRpc = await call("/rest/v1/rpc/set_my_avatar", {
  method: "POST",
  body: JSON.stringify({ p_avatar_url: null }),
});
if (missingFunction(avatarRpc)) {
  record(false, "set_my_avatar() function", "missing - apply 0008_avatar_storage.sql");
} else {
  record(avatarRpc.status >= 400, "set_my_avatar() requires auth", `status ${avatarRpc.status}`);
}

// A missing bucket answers 404; an existing bucket answers 400 for a missing object.
const bucketProbe = await fetch(
  `${url.replace(/\/$/, "")}/storage/v1/object/public/avatars/__verify_probe__.png`,
);
record(
  bucketProbe.status !== 404,
  "avatars bucket exists and is public",
  `status ${bucketProbe.status}`,
);

// 7. Social surfaces (requires 0009 / 0010)
const friendships = await call("/rest/v1/friendships?select=requester_id&limit=1");
record(
  friendships.status >= 400 || (Array.isArray(friendships.body) && friendships.body.length === 0),
  "friendships hidden from anon",
  `status ${friendships.status}`,
);

const guildBoard = await call("/rest/v1/rpc/guild_leaderboard", {
  method: "POST",
  body: JSON.stringify({ p_period: "week", p_limit: 5, p_search: null }),
});
if (missingFunction(guildBoard)) {
  record(false, "guild_leaderboard() function", "missing - apply 0010_guilds.sql");
} else {
  record(guildBoard.status === 200, "guild_leaderboard() callable by anon", `status ${guildBoard.status}`);
}

const friendRequest = await call("/rest/v1/rpc/send_friend_request", {
  method: "POST",
  body: JSON.stringify({ p_username: "nobody" }),
});
if (missingFunction(friendRequest)) {
  record(false, "send_friend_request() function", "missing - apply 0009_social_friends.sql");
} else {
  record(friendRequest.status >= 400, "send_friend_request() requires auth", `status ${friendRequest.status}`);
}

const failed = results.filter((result) => !result.ok);
console.log(
  failed.length === 0
    ? `\nAll ${results.length} checks passed. The database layer is ready.`
    : `\n${failed.length} check(s) failed. See supabase/migrations and README step 3.`,
);
process.exit(failed.length === 0 ? 0 : 1);
