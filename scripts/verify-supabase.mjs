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

// A placeholder is worse than an empty value: it looks configured and turns into
// a DNS failure deep inside a request. Reject it before touching the network.
const PLACEHOLDER = /YOUR_PROJECT_REF|your-project|placeholder|changeme|<.*>/i;
if (PLACEHOLDER.test(url) || PLACEHOLDER.test(key)) {
  console.error(
    `.env.local still contains the .env.example placeholder values.\n` +
      `  URL reads: ${url.replace(/[a-z0-9_-]{4,}/gi, (m) => m.slice(0, 4) + "...")}\n` +
      `Fill in the real values from Supabase > Project Settings > API:\n` +
      `  NEXT_PUBLIC_SUPABASE_URL=https://<20-char-project-ref>.supabase.co\n` +
      `  NEXT_PUBLIC_SUPABASE_ANON_KEY=<the anon or sb_publishable_ key>\n` +
      `The project ref is lowercase letters and digits only - no underscores.`,
  );
  process.exit(2);
}

if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(url.replace(/\/$/, ""))) {
  console.error(`NEXT_PUBLIC_SUPABASE_URL does not look like a Supabase project URL: ${url}`);
  console.error("Expected something like https://abcdefghijklmnopqrst.supabase.co");
  process.exit(2);
}

const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const results = [];

function record(ok, label, detail) {
  results.push({ ok, label, detail });
  console.log(`${ok ? " ok " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

async function call(path, init = {}) {
  let response;
  try {
    response = await fetch(`${url.replace(/\/$/, "")}${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
  } catch (error) {
    // Network-level failure: report it once, clearly, instead of an unhandled
    // rejection halfway through the checklist.
    record(false, `cannot reach ${url}`, error?.cause?.code ?? error?.message ?? "network error");
    return { status: 0, body: null };
  }
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

// Provider status is reported, not asserted: enabling OAuth needs the project
// owner's Google Cloud credentials, so a missing provider is advice, not a bug.
if (settings.status === 200) {
  const enabled = Object.entries(settings.body?.external ?? {})
    .filter(([, on]) => on === true)
    .map(([name]) => name);
  console.log(`note  sign-in providers enabled: ${enabled.join(", ") || "none"}`);
  if (!enabled.includes("google")) {
    console.log(
      "note  Google sign-in is off. Enable it in Authentication > Providers > Google;" +
        " see README step 5. The button already exists and will report a clear error until then.",
    );
  }
}

// 2. Catalog seeded (requires 0006)
const catalog = await call("/rest/v1/achievements?select=code&limit=1");
if (catalog.status === 200 && Array.isArray(catalog.body)) {
  record(catalog.body.length > 0, "Achievement catalog seeded", `${catalog.body.length} row(s) readable`);
} else {
  record(false, "Achievement catalog seeded", `status ${catalog.status} — apply supabase/migrations/0006_catalog_seed.sql`);
}

// 3. Configuration readable
const ranks = await call("/rest/v1/rank_thresholds?select=rank,min_xp&order=min_xp");
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

// 8. Column-level exposure (requires 0012)
const tzProbe = await call("/rest/v1/profiles?select=timezone&limit=1");
record(
  tzProbe.status >= 400,
  "anon cannot read behavioural profile columns",
  `status ${tzProbe.status}`,
);

// 9. Live cross-user isolation
//    Two throwaway accounts prove that RLS blocks cross-user reads on the
//    real project, not just in the local Postgres test harness.
function authHeaders(token) {
  return { apikey: key, Authorization: `Bearer ${token}` };
}

async function api(path, { token, method = "GET", body } = {}) {
  const response = await fetch(`${url.replace(/\/$/, "")}${path}`, {
    method,
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  return { status: response.status, body: payload };
}

async function makeHunter(label) {
  const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  const email = `verify-${label}-${stamp}@hunter-verify.test`;
  const password = `Verify-${stamp}-Aa1`;
  const response = await fetch(`${url.replace(/\/$/, "")}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const payload = await response.json().catch(() => null);
  return {
    email,
    password,
    token: payload?.access_token ?? payload?.session?.access_token ?? null,
    userId: payload?.user?.id ?? payload?.id ?? null,
  };
}

const hunterA = await makeHunter("a");
const hunterB = await makeHunter("b");

if (!hunterA.token || !hunterB.token) {
  console.log(
    "skip  live cross-user isolation - signup returned no session.\n" +
      "      Turn off Authentication > Providers > Email > Confirm email, then rerun,\n" +
      "      or run the local suite instead: npm run db:test",
  );
} else {
  const randomToken = crypto.randomUUID();
  const started = await api("/rest/v1/rpc/start_study_session", {
    token: hunterA.token,
    method: "POST",
    body: { p_planned_seconds: 600, p_client_token: randomToken },
  });
  const sessionId = started.body?.session?.id ?? started.body?.session_id ?? started.body?.id ?? null;
  record(Boolean(sessionId), "hunter A can start a study session", `status ${started.status}`);

  const peekAll = await api("/rest/v1/study_sessions?select=id", { token: hunterB.token });
  record(
    Array.isArray(peekAll.body) && peekAll.body.length === 0,
    "hunter B sees no study sessions at all",
    `${Array.isArray(peekAll.body) ? peekAll.body.length : "?"} rows`,
  );

  if (sessionId) {
    const peekOne = await api(`/rest/v1/study_sessions?select=id&id=eq.${sessionId}`, { token: hunterB.token });
    record(
      Array.isArray(peekOne.body) && peekOne.body.length === 0,
      "hunter B cannot read hunter A's session by id",
      `${Array.isArray(peekOne.body) ? peekOne.body.length : "?"} rows`,
    );

    const hijack = await api("/rest/v1/rpc/complete_study_session", {
      token: hunterB.token,
      method: "POST",
      body: { p_session: sessionId },
    });
    record(hijack.status >= 400, "hunter B cannot complete hunter A's session", `status ${hijack.status}`);
  }

  const ledgerPeek = await api(`/rest/v1/xp_transactions?select=amount&user_id=eq.${hunterA.userId}`, {
    token: hunterB.token,
  });
  record(
    Array.isArray(ledgerPeek.body) && ledgerPeek.body.length === 0,
    "hunter B cannot read hunter A's XP ledger",
    `${Array.isArray(ledgerPeek.body) ? ledgerPeek.body.length : "?"} rows`,
  );

  const forgeXp = await api("/rest/v1/rpc/update_my_profile", {
    token: hunterB.token,
    method: "POST",
    body: { p_display_name: "forged" },
  });
  const selfPatch = await api(`/rest/v1/profiles?id=eq.${hunterB.userId}`, {
    token: hunterB.token,
    method: "PATCH",
    body: { xp_total: 999999, level: 99, rank: "S" },
  });
  const afterPatch = await api("/rest/v1/rpc/hunter_overview", {
    token: hunterB.token,
    method: "POST",
    body: {},
  });
  const overview = afterPatch.body?.profile ?? afterPatch.body?.hunter ?? afterPatch.body ?? {};
  record(
    Number(overview?.xp_total ?? -1) === 0 && String(overview?.rank ?? "") !== "S",
    "a hunter cannot raise their own XP, level or rank",
    `patch ${selfPatch.status}, profile edit ${forgeXp.status}`,
  );

  const forgeLedger = await api("/rest/v1/xp_transactions", {
    token: hunterB.token,
    method: "POST",
    body: { user_id: hunterB.userId, source_type: "bonus", amount: 5000 },
  });
  record(forgeLedger.status >= 400, "a hunter cannot insert XP rows directly", `status ${forgeLedger.status}`);

  const board = await call("/rest/v1/rpc/leaderboard", {
    method: "POST",
    body: JSON.stringify({ p_period: "all", p_limit: 5, p_offset: 0, p_search: null }),
  });
  const allowed = new Set([
    "rank_position",
    "user_id",
    "username",
    "display_name",
    "avatar_url",
    "hunter_rank",
    "level",
    "period_xp",
    "is_me",
  ]);
  const leaked = Array.isArray(board.body)
    ? [...new Set(board.body.flatMap((row) => Object.keys(row)))].filter((field) => !allowed.has(field))
    : [];
  record(leaked.length === 0, "leaderboard rows carry only public fields", leaked.join(", ") || "no extra fields");

  for (const hunter of [hunterA, hunterB]) {
    const cleaned = await api("/rest/v1/rpc/delete_my_account", {
      token: hunter.token,
      method: "POST",
      body: {},
    });
    if (cleaned.status >= 400) {
      console.log(`note  remove the throwaway account manually: ${hunter.email}`);
    }
  }
}

// 10. Moderation console (requires 0013)
for (const [fn, body] of [
  ["admin_overview", {}],
  ["admin_hunters", { p_limit: 5, p_search: null }],
]) {
  const probe = await call(`/rest/v1/rpc/${fn}`, { method: "POST", body: JSON.stringify(body) });
  if (missingFunction(probe)) {
    record(false, `${fn}() function`, "missing - apply 0013_admin_console.sql");
  } else {
    record(probe.status >= 400, `${fn}() refuses anonymous callers`, `status ${probe.status}`);
  }
}

const failed = results.filter((result) => !result.ok);
console.log(
  failed.length === 0
    ? `\nAll ${results.length} checks passed. The database layer is ready.`
    : `\n${failed.length} check(s) failed. See supabase/migrations and README step 3.`,
);
process.exit(failed.length === 0 ? 0 : 1);
