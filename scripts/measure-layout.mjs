#!/usr/bin/env node
/**
 * Responsive layout check using the Chrome DevTools Protocol.
 *
 * Launches a headless Chromium-based browser (Edge or Chrome), loads each route
 * at several viewport widths and reports any element that sticks out past the
 * viewport. Horizontal overflow is a hard requirement for this project, so this
 * runs as part of the verification steps.
 *
 * Usage:
 *   node scripts/measure-layout.mjs                 # checks http://localhost:3100
 *   node scripts/measure-layout.mjs http://localhost:3000 /login /leaderboard
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BROWSER_CANDIDATES = [
  process.env.BROWSER_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

const browserPath = BROWSER_CANDIDATES.find((candidate) => existsSync(candidate));
if (!browserPath) {
  console.error("No Chromium-based browser found. Set BROWSER_PATH.");
  process.exit(2);
}

const args = process.argv.slice(2);
const base = args[0]?.startsWith("http") ? args[0] : "http://localhost:3100";
const routes = args.filter((arg) => arg.startsWith("/"));
const targets = routes.length > 0 ? routes : ["/", "/login", "/signup", "/leaderboard", "/dashboard"];
const widths = [
  { label: "mobile", width: 390, height: 844, mobile: true },
  { label: "tablet", width: 834, height: 1112, mobile: true },
  { label: "laptop", width: 1280, height: 800, mobile: false },
  { label: "desktop", width: 1600, height: 1000, mobile: false },
];

const profileDir = join(tmpdir(), `pi-layout-${Date.now()}`);
const port = 9333;

const browser = spawn(
  browserPath,
  [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    "about:blank",
  ],
  { stdio: "ignore" },
);

let socket;
let nextId = 1;
const waiting = new Map();
const events = new Map();

function send(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    setTimeout(() => {
      if (waiting.has(id)) {
        waiting.delete(id);
        reject(new Error(`timeout: ${method}`));
      }
    }, 30_000);
  });
}

function once(eventName, timeoutMs = 20_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${eventName}`)), timeoutMs);
    events.set(eventName, () => {
      clearTimeout(timer);
      events.delete(eventName);
      resolve();
    });
  });
}

async function connect() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const pages = await response.json();
      const page = pages.find((target) => target.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      /* browser still starting */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Could not reach the browser debugging port");
}

const EXPRESSION = `(() => {
  const doc = document.documentElement;
  const width = doc.clientWidth;
  const offenders = [];
  for (const el of document.querySelectorAll("body *")) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const style = getComputedStyle(el);
    if (style.position === "fixed" || style.visibility === "hidden") continue;
    if (rect.right > width + 1 || rect.left < -1) {
      offenders.push(el.tagName.toLowerCase() + (el.className ? "." + String(el.className).split(" ").slice(0, 2).join(".") : "") + " [" + Math.round(rect.left) + ".." + Math.round(rect.right) + "]");
      if (offenders.length >= 6) break;
    }
  }
  return JSON.stringify({
    viewport: width,
    scrollWidth: doc.scrollWidth,
    overflow: doc.scrollWidth > width + 1,
    offenders,
  });
})()`;

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  return result.result?.value;
}

async function main() {
  const wsUrl = await connect();
  socket = new WebSocket(wsUrl);

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && waiting.has(message.id)) {
      const { resolve, reject } = waiting.get(message.id);
      waiting.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
      return;
    }
    if (message.method && events.has(message.method)) events.get(message.method)();
  });

  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  await send("Page.enable");
  await send("Runtime.enable");

  let failures = 0;
  for (const route of targets) {
    for (const view of widths) {
      await send("Emulation.setDeviceMetricsOverride", {
        width: view.width,
        height: view.height,
        deviceScaleFactor: 1,
        mobile: view.mobile,
      });

      const loaded = once("Page.loadEventFired");
      await send("Page.navigate", { url: `${base}${route}` });
      await loaded.catch(() => null);
      await new Promise((resolve) => setTimeout(resolve, 700));

      const raw = await evaluate(EXPRESSION);
      const data = raw ? JSON.parse(raw) : null;
      if (!data) {
        console.log(`  ?  ${route} @ ${view.label} — could not measure`);
        continue;
      }

      const bad = data.overflow || data.offenders.length > 0;
      if (bad) failures += 1;
      console.log(
        `${bad ? "FAIL" : " ok "}  ${route.padEnd(14)} ${view.label.padEnd(8)} ${String(view.width).padStart(5)}px  ` +
          `scrollWidth=${data.scrollWidth}` +
          (data.offenders.length ? `  offenders: ${data.offenders.join(", ")}` : ""),
      );
    }
  }

  socket.close();
  console.log(failures === 0 ? "\nNo horizontal overflow at any tested width." : `\n${failures} viewport(s) overflow.`);
  process.exit(failures === 0 ? 0 : 1);
}

try {
  await main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  browser.kill();
}
