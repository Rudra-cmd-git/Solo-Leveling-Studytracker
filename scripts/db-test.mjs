// Applies the migrations to a throwaway PostgreSQL database and runs the SQL
// test suite. Works against a local Postgres (recommended) or, with care,
// against a disposable Supabase preview branch.
//
//   node scripts/db-test.mjs
//
// Environment (all optional):
//   PGHOST (default 127.0.0.1), PGPORT (default 5432), PGUSER (default postgres)
//   PGPASSWORD, PG_BIN (directory that holds psql), TEST_DB (default hunter_test)

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const host = process.env.PGHOST || "127.0.0.1";
const port = process.env.PGPORT || "5432";
const user = process.env.PGUSER || "postgres";
const testDb = process.env.TEST_DB || "hunter_test";

function resolvePsql() {
  if (process.env.PSQL_PATH && existsSync(process.env.PSQL_PATH)) return process.env.PSQL_PATH;
  if (process.env.PG_BIN) {
    const candidate = join(process.env.PG_BIN, process.platform === "win32" ? "psql.exe" : "psql");
    if (existsSync(candidate)) return candidate;
  }
  return process.platform === "win32" ? "psql.exe" : "psql";
}

const PSQL = resolvePsql();
const env = { ...process.env, PGHOST: host, PGPORT: port, PGUSER: user, PGCLIENTENCODING: "UTF8" };

function run(file, { db = testDb, args = [] } = {}) {
  const result = spawnSync(
    PSQL,
    ["-w", "-v", "ON_ERROR_STOP=1", "-X", "-q", "-d", db, ...args, ...(file ? ["-f", file] : [])],
    { env, encoding: "utf8" },
  );
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  if (result.status !== 0) {
    const error = new Error(`psql exited with ${result.status}`);
    error.detail = output;
    throw error;
  }
  return output;
}

function statement(sql, db = testDb) {
  const result = spawnSync(
    PSQL,
    ["-w", "-v", "ON_ERROR_STOP=1", "-X", "-q", "-tA", "-d", db, "-c", sql],
    { env, encoding: "utf8" },
  );
  if (result.status !== 0) {
    const error = new Error(`psql exited with ${result.status}`);
    error.detail = `${result.stdout || ""}${result.stderr || ""}`;
    throw error;
  }
  return (result.stdout || "").trim();
}

const files = (dir) =>
  readdirSync(join(root, dir))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => join(root, dir, f));

let failures = 0;

function step(label, fn) {
  try {
    fn();
    console.log(`  ok   ${label}`);
  } catch (error) {
    failures += 1;
    console.log(`  FAIL ${label}`);
    const detail = (error.detail || error.stderr || error.stdout || error.message || "").toString().trim();
    if (detail) {
      for (const line of detail.split("\n")) console.log(`       ${line}`);
    }
  }
}

console.log(`\nHunter System - database test suite`);
console.log(`  postgres: ${user}@${host}:${port}\n`);

step("recreate test database", () => {
  statement(`drop database if exists ${testDb}`, "postgres");
  statement(`create database ${testDb}`, "postgres");
});

step("platform stub (auth schema, roles, auth.uid)", () => {
  run(join(root, "supabase/tests/00_platform_stub.sql"));
});

for (const file of files("supabase/migrations")) {
  step(`migration ${file.split(/[\\/]/).pop()}`, () => run(file));
}

step("test helper", () => {
  statement(`
    create or replace function public.tap_ok(p_cond boolean, p_desc text)
    returns void language plpgsql as $fn$
    begin
      if p_cond is distinct from true then
        raise exception 'ASSERTION FAILED: %', p_desc;
      end if;
      raise notice 'ok - %', p_desc;
    end $fn$;
    grant execute on function public.tap_ok(boolean, text) to authenticated, anon;
  `);
});

console.log("");
for (const file of files("supabase/tests")) {
  if (file.includes("00_platform_stub")) continue;
  step(`suite ${file.split(/[\\/]/).pop()}`, () => {
    const out = run(file);
    const passes = out.split("\n").filter((l) => l.includes("NOTICE:  ok -"));
    for (const line of passes) {
      const msg = line.split("NOTICE:")[1] || "";
      console.log(`       ${msg.trim()}`);
    }
    console.log(`       (${passes.length} assertions passed)`);
  });
}

// psql sends NOTICE to stderr; surface those lines too.
console.log("");
if (failures > 0) {
  console.log(`${failures} step(s) failed.\n`);
  process.exit(1);
}
console.log("All database checks passed.\n");
