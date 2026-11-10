import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  auth: { user: null as { id: string } | null, loading: true, isConfigured: true },
  addGeneratedAsset: vi.fn(), addLog: vi.fn(), client: null as unknown,
  effect: null as null | { run: () => void | (() => void); deps: unknown[] }
}));
vi.mock("react", () => ({
  useEffect: (run: () => void | (() => void), deps: unknown[]) => { state.effect = { run, deps }; }
}));
vi.mock("@/lib/auth/use-session", () => ({ useSupabaseSession: () => state.auth }));
vi.mock("@/lib/supabase-client", () => ({ getSupabaseBrowserClient: () => state.client }));
vi.mock("@/lib/store", () => ({ useYiiyaStore: (selector: (value: typeof state) => unknown) => selector(state) }));
import { useOpenAssetFromLibrary } from "./open-from-library";

const row = { id: "asset-a", object_name: "Dinosaur", tier: "trellis",
  glb_url: "https://store.public.blob.vercel-storage.com/dino.glb",
  triangle_count: 20620, scale_meters: 1, brief_json: null };
let previous: unknown[] | undefined;
let cleanup: void | (() => void);
let replaceState: ReturnType<typeof vi.fn>;

// Runs the real hook effect when its declared dependencies change. Database,
// auth and browser are controlled; this does not claim a React DOM or live RLS test.
function LibraryReopenHarness() {
  useOpenAssetFromLibrary();
  const effect = state.effect!;
  if (!previous || effect.deps.some((value, i) => !Object.is(value, previous![i]))) {
    cleanup?.();
    cleanup = effect.run();
    previous = effect.deps;
  }
}
function database(result: Promise<unknown>) {
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    abortSignal: vi.fn().mockReturnThis(), maybeSingle: vi.fn(() => result) };
  const from = vi.fn(() => query);
  state.client = { from };
  return { query, from };
}
const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
beforeEach(() => {
  cleanup?.(); cleanup = undefined; previous = undefined;
  state.auth = { user: null, loading: true, isConfigured: true };
  state.addGeneratedAsset.mockReset(); state.addLog.mockReset();
  replaceState = vi.fn();
  vi.stubGlobal("window", { location: { search: "?assetId=asset-a", href: "https://yiiya.test/app?assetId=asset-a" }, history: { replaceState } });
});
afterEach(() => { cleanup?.(); cleanup = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("library reopen lifecycle", () => {
  it("waits for sign-in, then loads under the signed-in owner", async () => {
    const db = database(Promise.resolve({ data: row, error: null }));
    LibraryReopenHarness();
    expect(db.from).not.toHaveBeenCalled();
    state.auth = { user: null, loading: false, isConfigured: true }; LibraryReopenHarness();
    expect(db.from).not.toHaveBeenCalled();
    state.auth = { ...state.auth, user: { id: "owner-a" } }; LibraryReopenHarness(); await settle();
    expect(db.query.eq).toHaveBeenCalledWith("owner_id", "owner-a");
    expect(state.addGeneratedAsset).toHaveBeenCalledWith(expect.objectContaining({ dbId: "asset-a", triangleCount: 20620 }));
    expect(replaceState).toHaveBeenCalledOnce();
  });

  it("drops a late response after sign-out", async () => {
    let resolve!: (value: unknown) => void;
    database(new Promise(done => { resolve = done; }));
    state.auth = { ...state.auth, user: { id: "owner-a" }, loading: false }; LibraryReopenHarness();
    state.auth = { ...state.auth, user: null }; LibraryReopenHarness();
    resolve({ data: row, error: null }); await settle();
    expect(state.addGeneratedAsset).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("ignores the old account's late result when the new account has no access", async () => {
    let oldResponse!: (value: unknown) => void;
    const old = database(new Promise(done => { oldResponse = done; }));
    state.auth = { ...state.auth, user: { id: "owner-a" }, loading: false }; LibraryReopenHarness();
    const next = database(Promise.resolve({ data: null, error: null }));
    state.auth = { ...state.auth, user: { id: "owner-b" } }; LibraryReopenHarness(); await settle();
    oldResponse({ data: row, error: null }); await settle();
    expect(old.query.abortSignal.mock.calls[0][0].aborted).toBe(true);
    expect(next.query.eq).toHaveBeenCalledWith("owner_id", "owner-b");
    expect(state.addGeneratedAsset).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("bounds an unresponsive read and ignores its late result", async () => {
    vi.useFakeTimers();
    let resolve!: (value: unknown) => void;
    const db = database(new Promise(done => { resolve = done; }));
    state.auth = { ...state.auth, user: { id: "owner-a" }, loading: false }; LibraryReopenHarness();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(db.query.abortSignal.mock.calls[0][0].aborted).toBe(true);
    expect(state.addLog).toHaveBeenCalledWith(expect.stringMatching(/timed out/i));
    resolve({ data: row, error: null }); await settle();
    expect(state.addGeneratedAsset).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it.each(["query-error", "missing", "rejection"])("reports %s without losing the reopen request", async kind => {
    database(kind === "rejection" ? Promise.reject(new Error("private database details"))
      : Promise.resolve(kind === "missing" ? { data: null, error: null }
        : { data: null, error: { message: "private database details" } }));
    state.auth = { ...state.auth, user: { id: "owner-a" }, loading: false }; LibraryReopenHarness(); await settle();
    expect(state.addGeneratedAsset).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
    expect(state.addLog).toHaveBeenCalledWith(expect.stringMatching(/could not|not available/i));
    expect(JSON.stringify(state.addLog.mock.calls)).not.toContain("private database details");
  });
});
