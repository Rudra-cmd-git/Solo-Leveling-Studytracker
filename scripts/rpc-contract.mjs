#!/usr/bin/env node
/**
 * Contract check between the TypeScript app and the SQL schema.
 *
 * The app never builds SQL itself — it calls PostgREST RPCs and a handful of
 * tables. A typo in an RPC name, an argument name or a column name only shows
 * up at runtime, so this script compares the code against a live database.
 *
 * Usage (local Postgres):
 *   $env:PGHOST="127.0.0.1"; $env:PGPORT="5433"; $env:PGUSER="postgres"
 *   $env:PG_BIN="C:\Users\rudra\scoop\apps\postgresql\current\bin"
 *   node scripts/rpc-contract.mjs
 */

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const DB = process.env.PGDATABASE || "hunter_test";
const PSQL = process.env.PG_BIN ? join(process.env.PG_BIN, "psql.exe") : "psql";

if (!process.env.PGHOST || !process.env.PGPORT) {
  console.error("Set PGHOST/PGPORT (the test database is created by scripts/db-test.mjs).");
  process.exit(2);
}

function query(sql) {
  const result = spawnSync(PSQL, ["-U", process.env.PGUSER || "postgres", "-d", DB, "-tAF", "\u0001", "-c", sql], {
    encoding: "utf8",
    env: { ...process.env, PGCLIENTENCODING: "UTF8" },
  });
  if (result.status !== 0) {
    throw new Error(`psql failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => line.split("\u0001"));
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      walk(full, files);
    } else if (/\.tsx?$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

// --- database truth --------------------------------------------------------
const functions = new Map();
for (const [name, args] of query(
  "select p.proname, pg_get_function_arguments(p.oid) from pg_proc p where p.pronamespace = 'public'::regnamespace",
)) {
  const params = args
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.split(/\s+/)[0].replace(/^"/, "").replace(/"$/, ""));
  functions.set(name, (functions.get(name) ?? []).concat([params]));
}

const tables = new Map();
for (const [table, column] of query(
  "select table_name, column_name from information_schema.columns where table_schema = 'public'",
)) {
  tables.set(table, (tables.get(table) ?? []).concat([column]));
}

const grantedToAuthenticated = new Set(
  query(
    `select distinct p.proname
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and has_function_privilege('authenticated', p.oid, 'execute')`,
  ).map(([name]) => name),
);

// --- code under test -------------------------------------------------------
const problems = [];
const checked = { rpc: 0, table: 0, column: 0 };

for (const file of walk(join(ROOT, "src"))) {
  const source = readFileSync(file, "utf8");
  const rel = file.slice(ROOT.length + 1);

  // supabase.rpc("name", { p_arg: ... })
  // A call may be terminated by `;` (a statement) or `,` (an element of an
  // array passed to Promise.all), so both are accepted as the end boundary.
  for (const match of source.matchAll(/\.rpc\(\s*"([a-z0-9_]+)"([\s\S]{0,400}?)(?:\)\s*[;,]|\)\s*$)/g)) {
    const [, name, rest] = match;
    checked.rpc += 1;

    if (!functions.has(name)) {
      problems.push(`${rel}: RPC "${name}" does not exist in the database`);
      continue;
    }
    if (!grantedToAuthenticated.has(name)) {
      problems.push(`${rel}: RPC "${name}" is not executable by the authenticated role`);
    }

    const usedArgs = [...rest.matchAll(/\b(p_[a-z0-9_]+)\s*:/g)].map((m) => m[1]);
    if (usedArgs.length === 0) continue;

    const signatures = functions.get(name);
    const ok = signatures.some((params) => usedArgs.every((arg) => params.includes(arg)));
    if (!ok) {
      problems.push(
        `${rel}: RPC "${name}" called with [${usedArgs.join(", ")}] but the database expects ${signatures
          .map((params) => `[${params.join(", ")}]`)
          .join(" or ")}`,
      );
    }
  }

  // supabase.from("table")
  for (const match of source.matchAll(/\.from\(\s*"([a-z0-9_]+)"\s*\)/g)) {
    const name = match[1];
    checked.table += 1;
    if (!tables.has(name)) problems.push(`${rel}: table "${name}" does not exist`);
  }

  // .select("a, b, c") / .insert({ a, b })
  for (const match of source.matchAll(/\.select\(\s*"([a-z0-9_,\s*]+)"\s*[,)]/g)) {
    const list = match[1];
    if (list.includes("*")) continue;

    // Only validate when the same expression names a table we know.
    const nearby = source.slice(Math.max(0, match.index - 200), match.index);
    const fromMatch = [...nearby.matchAll(/\.from\(\s*"([a-z0-9_]+)"\s*\)/g)].pop();
    if (!fromMatch) continue;
    const table = fromMatch[1];
    const columns = tables.get(table);
    if (!columns) continue;

    for (const column of list.split(",").map((value) => value.trim()).filter(Boolean)) {
      checked.column += 1;
      if (!columns.includes(column)) {
        problems.push(`${rel}: column "${column}" does not exist on table "${table}"`);
      }
    }
  }
}

if (problems.length > 0) {
  console.error(`\n${problems.length} contract problem(s):`);
  for (const problem of problems) console.error(` - ${problem}`);
  process.exit(1);
}

console.log(
  `Contract check passed: ${checked.rpc} RPC calls, ${checked.table} table references, ${checked.column} columns verified.`,
);
