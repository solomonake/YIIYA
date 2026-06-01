/**
 * USDZ export for iOS AR Quick Look.
 *
 * Conversion path: GLB → USDZ via the `usd-core` toolchain. Two strategies,
 * picked by env:
 *
 *   1. Local toolchain (preferred): Apple's `usdpython` (USDZ Tools) on the
 *      host running the worker. We shell out to `usdzconvert` after writing
 *      the GLB to a temp file. Available on macOS via:
 *        https://developer.apple.com/augmented-reality/quick-look/
 *      And in Docker: https://hub.docker.com/r/leon/usd
 *
 *   2. Remote conversion service: a small Modal/Cloud Run worker exposing
 *      POST /usdz-from-glb. Set USDZ_CONVERTER_URL + USDZ_CONVERTER_TOKEN.
 *
 * USDZ from a GLB takes ~1-3s on a modern CPU. Output ships to /p/[slug] as
 * <a rel="ar" href="…usdz">. Android falls back to scene-viewer intent.
 */
import { writeFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

export type UsdzResult = {
  usdz: Buffer;
  source: "local-toolchain" | "remote-converter";
  ms: number;
};

export async function convertGlbToUsdz(glb: Buffer, options: { signal?: AbortSignal } = {}): Promise<UsdzResult> {
  const started = Date.now();
  const remote = process.env.USDZ_CONVERTER_URL;
  if (remote) {
    return convertViaRemote(glb, remote, options.signal).then((r) => ({ ...r, ms: Date.now() - started }));
  }
  if (await hasLocalToolchain()) {
    return convertViaLocal(glb).then((r) => ({ ...r, ms: Date.now() - started }));
  }
  throw new Error(
    "No USDZ converter available. Set USDZ_CONVERTER_URL or install Apple usdpython locally."
  );
}

// -----------------------------------------------------------------------------
// Local toolchain — `usdzconvert input.glb output.usdz`
// -----------------------------------------------------------------------------

async function hasLocalToolchain(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("usdzconvert", ["--help"], { stdio: "ignore" });
    proc.on("error", () => resolve(false));
    proc.on("exit", (code) => resolve(code === 0));
  });
}

async function convertViaLocal(glb: Buffer): Promise<Omit<UsdzResult, "ms">> {
  const dir = await mkdtemp(join(tmpdir(), "yiiya-usdz-"));
  const glbPath = join(dir, "input.glb");
  const usdzPath = join(dir, "output.usdz");
  try {
    await writeFile(glbPath, glb);
    await runCmd("usdzconvert", [glbPath, usdzPath]);
    const usdz = await readFile(usdzPath);
    return { usdz, source: "local-toolchain" };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function runCmd(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}: ${stderr.slice(0, 500)}`));
    });
  });
}

// -----------------------------------------------------------------------------
// Remote converter — POST multipart to USDZ_CONVERTER_URL
// -----------------------------------------------------------------------------

async function convertViaRemote(glb: Buffer, url: string, signal?: AbortSignal): Promise<Omit<UsdzResult, "ms">> {
  const fd = new FormData();
  // Buffer → BlobPart: allocate a fresh ArrayBuffer and copy bytes into it so
  // the TS lib.dom Blob signature accepts it. Newer @types/node typing surfaces
  // ArrayBufferLike (which may be SharedArrayBuffer) on Buffer.buffer; lib.dom
  // requires concrete ArrayBuffer. Copy is O(n) but a USDZ source mesh is small.
  const ab = new ArrayBuffer(glb.byteLength);
  new Uint8Array(ab).set(glb);
  fd.append("file", new Blob([ab], { type: "model/gltf-binary" }), "model.glb");
  const res = await fetch(url, {
    method: "POST",
    body: fd,
    headers: process.env.USDZ_CONVERTER_TOKEN
      ? { Authorization: `Bearer ${process.env.USDZ_CONVERTER_TOKEN}` }
      : undefined,
    signal
  });
  if (!res.ok) throw new Error(`remote USDZ conversion failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return { usdz: buf, source: "remote-converter" };
}
