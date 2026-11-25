#!/usr/bin/env node
/**
 * Full-page screenshots of running routes via the Chrome DevTools Protocol.
 *
 * Usage:
 *   node scripts/screenshots.mjs                       # default set, 1440 + 390
 *   node scripts/screenshots.mjs http://localhost:3100 /dashboard
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const BROWSERS = [
  process.env.BROWSER_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

const browserPath = BROWSERS.find((candidate) => existsSync(candidate));
if (!browserPath) {
  console.error("No Chromium-based browser found. Set BROWSER_PATH.");
  process.exit(2);
}

const OUT_DIR = resolve(process.cwd(), "screenshots");
mkdirSync(OUT_DIR, { recursive: true });

const args = process.argv.slice(2);
const base = args[0]?.startsWith("http") ? args[0] : "http://localhost:3100";
const routes = args.filter((arg) => arg.startsWith("/"));
const targets = routes.length > 0 ? routes : ["/", "/login", "/signup", "/leaderboard"];
const viewports = [
  { name: "desktop", width: 1440, height: 900, mobile: false },
  { name: "mobile", width: 390, height: 844, mobile: true },
];

const port = 9334;
const browser = spawn(
  browserPath,
  [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${join(tmpdir(), `pi-shots-${Date.now()}`)}`,
    "--disable-gpu",
    "--no-first-run",
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
    const timer = setTimeout(() => reject(new Error(`timeout ${eventName}`)), timeoutMs);
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
      const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = pages.find((target) => target.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      /* starting */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("browser debugging port unreachable");
}

try {
  socket = new WebSocket(await connect());
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

  for (const route of targets) {
    for (const view of viewports) {
      await send("Emulation.setDeviceMetricsOverride", {
        width: view.width,
        height: view.height,
        deviceScaleFactor: 1,
        mobile: view.mobile,
      });

      const loaded = once("Page.loadEventFired");
      await send("Page.navigate", { url: `${base}${route}` });
      await loaded.catch(() => null);
      await new Promise((resolve) => setTimeout(resolve, 900));

      const metrics = await send("Page.getLayoutMetrics");
      const size = metrics.cssContentSize ?? metrics.contentSize;

      const shot = await send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
        clip: {
          x: 0,
          y: 0,
          width: view.width,
          height: Math.min(size.height, 4000),
          scale: 1,
        },
      });

      const name = `${route === "/" ? "landing" : route.replace(/^\//, "").replace(/\//g, "-")}-${view.name}.png`;
      writeFileSync(join(OUT_DIR, name), Buffer.from(shot.data, "base64"));
      console.log(`saved screenshots/${name} (${view.width}px, ${Math.round(size.height)}px tall)`);
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  socket?.close();
  browser.kill();
}
