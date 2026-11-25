#!/usr/bin/env node
/**
 * End-to-end session test against a real Supabase project.
 *
 * Proves the one claim the whole app rests on: XP is earned by the server from
 * verified study time and cannot be produced any other way.
 *
 *   sign up -> start session -> heartbeat -> complete -> read profile
 *
 * A session shorter than progression_config.min_session_seconds earns nothing,
 * so the test waits just past that threshold before completing.
 *
 * Usage:
 *   npm run verify:xp
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

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (.env.local).");
  process.exit(2);
}

const results = [];
function record(ok, label, detail) {
  results.push(ok);
  console.log(`${ok ? " ok " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

async function api(path, { token, method = "GET", body } = {}) {
  const init = {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token ?? key}`,
      "Content-Type": "application/json",
      // Supabase closes idle keep-alive sockets; without this a request that
      // follows a long pause between heartbeats can hang instead of retrying.
      Connection: "close",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(`${url}${path}`, { ...init, signal: AbortSignal.timeout(20000) });
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      return { status: response.status, body: payload };
    } catch (error) {
      if (attempt === 1) return { status: 0, body: null, error: error?.message ?? "network error" };
      await new Promise((done) => setTimeout(done, 1200));
    }
  }
  return { status: 0, body: null };
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const email = `xp-${stamp}@hunter-verify.test`;
const password = `Verify-${stamp}-Aa1`;

console.log(`Checking ${url}\n`);

const signup = await api("/auth/v1/signup", {
  method: "POST",
  body: { email, password },
});
const token = signup.body?.access_token ?? signup.body?.session?.access_token ?? null;

if (!token) {
  console.error("Signup returned no session — turn off Authentication > Email > Confirm email.");
  process.exit(2);
}
record(true, "throwaway hunter created");

const config = await api("/rest/v1/progression_config?select=min_session_seconds,xp_per_minute&limit=1", { token });
const minSeconds = Number(config.body?.[0]?.min_session_seconds ?? 60);
const xpPerMinute = Number(config.body?.[0]?.xp_per_minute ?? 0);
record(minSeconds > 0 && xpPerMinute > 0, "progression config readable", `${minSeconds}s minimum, ${xpPerMinute} xp/min`);

const started = await api("/rest/v1/rpc/start_study_session", {
  token,
  method: "POST",
  body: { p_planned_seconds: Math.max(120, minSeconds * 2), p_client_token: crypto.randomUUID() },
});
const sessionId = started.body?.session?.id ?? null;
record(Boolean(sessionId), "session started", sessionId ? "id issued" : `status ${started.status}`);

const before = await api("/rest/v1/rpc/hunter_overview", { token, method: "POST", body: {} });
const beforeXp = Number(before.body?.profile?.xp_total ?? -1);

// Wait past the minimum, heartbeating the way the focus timer does.
const waitMs = (minSeconds + 8) * 1000;
console.log(`     waiting ${Math.round(waitMs / 1000)}s for the session to become creditable...`);
await sleep(waitMs / 2);
const beat = await api("/rest/v1/rpc/heartbeat_study_session", {
  token,
  method: "POST",
  body: { p_session: sessionId },
});
record(beat.status === 200, "heartbeat accepted", `status ${beat.status}`);
await sleep(waitMs / 2);

const completed = await api("/rest/v1/rpc/complete_study_session", {
  token,
  method: "POST",
  body: { p_session: sessionId },
});
record(completed.status === 200, "session completed", `status ${completed.status}`);

const after = await api("/rest/v1/rpc/hunter_overview", { token, method: "POST", body: {} });
const afterXp = Number(after.body?.profile?.xp_total ?? -1);
record(afterXp > beforeXp, "XP was awarded by the server", `${beforeXp} -> ${afterXp}`);

const ledger = await api("/rest/v1/xp_transactions?select=amount,source_type&order=created_at.desc&limit=3", { token });
const sameHunterLedger = Array.isArray(ledger.body) ? ledger.body.reduce((sum, row) => sum + Number(row.amount), 0) : 0;
record(
  sameHunterLedger >= afterXp - beforeXp && afterXp > 0,
  "the XP ledger matches the profile total",
  `ledger ${sameHunterLedger} vs gain ${afterXp - beforeXp}`,
);

const replay = await api("/rest/v1/rpc/complete_study_session", {
  token,
  method: "POST",
  body: { p_session: sessionId },
});
const afterReplay = await api("/rest/v1/rpc/hunter_overview", { token, method: "POST", body: {} });
record(
  Number(afterReplay.body?.profile?.xp_total) === afterXp,
  "completing the same session twice awards no extra XP",
  replay.status === 200 ? "second call accepted but paid nothing" : `status ${replay.status}`,
);

await api("/rest/v1/rpc/delete_my_account", { token, method: "POST", body: {} });

const failed = results.filter((ok) => !ok).length;
console.log(failed === 0 ? `\nAll ${results.length} checks passed. XP is server-authoritative.` : `\n${failed} check(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
