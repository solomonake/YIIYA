#!/usr/bin/env node
// Captures every prototype scenario at its listed breakpoints with headless
// Chrome (SwiftShader WebGL), writing screens/png/<scenario>--<bp>.png and
// screens/manifest.json. Requires the static server:
//   python3 -m http.server 4310 --bind 127.0.0.1 --directory design/yiiya-v2
// Usage: node design/yiiya-v2/scripts/capture-screens.mjs [--only id1,id2] [--theme light]
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import os from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.PROTO_URL || "http://127.0.0.1:4310/prototype/index.html";
const FRAME = process.env.FRAME_URL || "http://127.0.0.1:4310/screens/frame.html";
const SIZES = { d: [1440, 900], t: [768, 1024], p: [390, 844], n: [320, 640] };
const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;
const theme = args.includes("--theme") ? args[args.indexOf("--theme") + 1] : null;
const extraBp = args.includes("--bp") ? args[args.indexOf("--bp") + 1] : null;
const missingOnly = args.includes("--missing");
const direction = args.includes("--direction") ? args[args.indexOf("--direction") + 1] : null;

// Load scenario metadata without a browser: stub just what definitions touch.
const sandbox = { window: {}, Date, Math, JSON };
sandbox.window.YI = { STEP_LABELS: new Proxy({}, { get: (_, k) => String(k) }), FAILURES: {}, PART_LABEL: {} };
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(root, "prototype/scenarios.js"), "utf8"), sandbox);
const scenarios = sandbox.window.YI.SCENARIOS.map(({ id, surface, state, route, bp, notes }) => ({ id, surface, state, route, bp, notes }));

const outDir = join(root, "screens/png");
mkdirSync(outDir, { recursive: true });
const jobs = [];
for (const sc of scenarios) {
  if (only && !only.includes(sc.id)) continue;
  const bps = (extraBp || sc.bp).split("");
  for (const bp of bps) {
    const suffix = (theme ? `--${theme}` : "") + (direction ? `--${direction}` : "");
    if (missingOnly && existsSync(join(outDir, `${sc.id}--${bp}${suffix}.png`))) continue;
    jobs.push({ sc, bp });
  }
}

function shoot({ sc, bp }) {
  const [w, h] = SIZES[bp];
  const suffix = (theme ? `--${theme}` : "") + (direction ? `--${direction}` : "");
  const file = join(outDir, `${sc.id}--${bp}${suffix}.png`);
  const proto = `${BASE}#/${sc.route}?scenario=${sc.id}&frame=1${theme ? `&theme=${theme}` : ""}${direction ? `&direction=${direction}` : ""}`;
  const url = `${FRAME}?w=${w}&h=${h}&src=${encodeURIComponent(proto)}`;
  const winW = Math.max(w, 600), winH = h;
  const profile = join(os.tmpdir(), `yiiya-cap-${process.pid}-${sc.id}-${bp}`);
  return new Promise((resolve) => {
    const p = spawn(CHROME, [
      "--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--hide-scrollbars",
      "--force-device-scale-factor=1", `--user-data-dir=${profile}`, `--window-size=${winW},${winH}`,
      "--virtual-time-budget=5000", `--screenshot=${file}`, url
    ], { stdio: "ignore" });
    const kill = setTimeout(() => p.kill("SIGKILL"), Number(process.env.CAPTURE_TIMEOUT_MS || 90000));
    p.on("exit", () => {
      clearTimeout(kill);
      if (existsSync(file) && winW !== w) spawnSync("sips", ["--cropToHeightWidth", String(h), String(w), file], { stdio: "ignore" });
      try { rmSync(profile, { recursive: true, force: true }); } catch {}
      resolve({ id: sc.id, bp, ok: existsSync(file), file: `png/${sc.id}--${bp}${suffix}.png` });
    });
  });
}

const results = [];
const CONCURRENCY = Number(process.env.CAPTURE_CONCURRENCY || 2);
let i = 0;
async function worker() {
  while (i < jobs.length) {
    const job = jobs[i++];
    const r = await shoot(job);
    results.push(r);
    process.stdout.write(`${r.ok ? "ok  " : "FAIL"} ${r.id} ${r.bp}\n`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

if (!only && !theme && !extraBp && !direction) {
  // Manifest lists every expected shot and whether it exists on disk.
  writeFileSync(join(root, "screens/manifest.json"), JSON.stringify({ generated: new Date().toISOString(), sizes: SIZES, scenarios, shots: scenarios.flatMap((sc) => sc.bp.split("").map((bp) => ({ id: sc.id, bp, file: `png/${sc.id}--${bp}.png`, ok: existsSync(join(outDir, `${sc.id}--${bp}.png`)) }))) }, null, 2));
}
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} captured.`);
process.exit(failed ? 1 : 0);
