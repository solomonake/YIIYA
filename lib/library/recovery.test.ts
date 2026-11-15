import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import LibraryPage from "@/app/library/page";
import { useSupabaseSession } from "@/lib/auth/use-session";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";

vi.mock("@/lib/auth/use-session", () => ({
  useSupabaseSession: vi.fn(),
  SupabaseSessionProvider: ({
    children,
  }: {
    children: import("react").ReactNode;
  }) => children,
}));
vi.mock("@/lib/supabase-client", () => ({ getSupabaseBrowserClient: vi.fn() }));
vi.mock("@/components/auth/auth-sheet", () => ({ AuthSheet: () => null }));
vi.mock("@/lib/auth/actions", () => ({ signOut: vi.fn() }));
vi.mock("@/components/artifact-download", () => ({
  ArtifactDownload: ({ children }: { children: string }) =>
    createElement("span", null, children),
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: string; href: string }) =>
    createElement("a", { href }, children),
}));

type Result = { data: unknown[] | null; error: { message: string } | null };
function deferred() {
  let resolve!: (result: Result) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<Result>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject, signal: null as AbortSignal | null };
}
const asset = (name: string) => ({
  id: name,
  object_name: name,
  tier: "trellis",
  glb_url: "https://example.hf.space/model.glb",
  poster_url: null,
  created_at: "2026-11-14",
});
let view: ReactTestRenderer;
let queries: ReturnType<typeof deferred>[];
let filters: unknown[][];
function session(id: string | null) {
  vi.mocked(useSupabaseSession).mockReturnValue({
    user: id ? { id } : null,
    session: null,
    loading: false,
    isConfigured: true,
  } as ReturnType<typeof useSupabaseSession>);
}
async function mount() {
  await act(async () => {
    view = create(createElement(LibraryPage));
  });
}
async function account(id: string | null) {
  session(id);
  await act(async () => {
    view.update(createElement(LibraryPage));
  });
}
function text() {
  return JSON.stringify(view.toJSON());
}
async function finish(index: number, result: Result) {
  await act(async () => {
    queries[index].resolve(result);
  });
}
async function retry() {
  await act(async () => {
    view.root
      .findAllByType("button")
      .find((b) => b.children.join("") === "Try again")!
      .props.onClick();
  });
}

beforeEach(() => {
  session("user-a");
  queries = [];
  filters = [];
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn((...args: unknown[]) => {
      filters.push(args);
      return builder;
    }),
    order: vi.fn(() => builder),
    abortSignal: vi.fn((signal: AbortSignal) => {
      const q = deferred();
      q.signal = signal;
      queries.push(q);
      return q.promise;
    }),
  };
  vi.mocked(getSupabaseBrowserClient).mockReturnValue({
    from: () => builder,
  } as unknown as ReturnType<typeof getSupabaseBrowserClient>);
});
afterEach(() => {
  if (view) act(() => view.unmount());
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Library recovery through the actual page", () => {
  it("clears a private backend error and displays assets after retry", async () => {
    await mount();
    await finish(0, {
      data: null,
      error: { message: "private SQL upstream detail" },
    });
    expect(text()).toContain("Library unavailable");
    expect(text()).not.toContain("private SQL");
    expect(view.root.findByProps({ role: "alert" })).toBeTruthy();
    const button = view.root
      .findAllByType("button")
      .find((b) => b.children.join("") === "Try again")!;
    expect(button.props.type).toBe("button");
    expect(button.props.className).toContain("min-h-11");
    await retry();
    expect(text()).toContain("Loading your assets");
    expect(text()).not.toContain("Library unavailable");
    await finish(1, { data: [asset("Recovered lamp")], error: null });
    expect(text()).toContain("Recovered lamp");
    expect(text()).not.toContain("Library unavailable");
    expect(filters).toEqual([
      ["owner_id", "user-a"],
      ["owner_id", "user-a"],
    ]);
  });
  it("discards loaded assets immediately when the account changes", async () => {
    await mount();
    await finish(0, { data: [asset("Account A secret")], error: null });
    await account("user-b");
    expect(text()).not.toContain("Account A secret");
    expect(text()).toContain("Loading your assets");
    await finish(1, { data: [asset("Account B lamp")], error: null });
    expect(text()).toContain("Account B lamp");
  });
  it("aborts pending work and ignores late success or failure after account changes", async () => {
    await mount();
    await account("user-b");
    expect(queries[0].signal?.aborted).toBe(true);
    await finish(1, { data: [asset("B only")], error: null });
    await finish(0, {
      data: [asset("A late")],
      error: { message: "A private error" },
    });
    expect(text()).toContain("B only");
    expect(text()).not.toContain("A late");
    expect(text()).not.toContain("Library unavailable");
  });
  it("drops an old error on sign-out and sign-in to the same account", async () => {
    await mount();
    await finish(0, { data: null, error: { message: "bad" } });
    await account(null);
    expect(text()).toContain("Sign in to see");
    expect(text()).not.toContain("Library unavailable");
    await account("user-a");
    expect(text()).toContain("Loading your assets");
    await finish(1, { data: [], error: null });
    expect(text()).toContain("Nothing here yet");
  });
  it("resets on a fresh sign-in even when the same user stays rendered", async () => {
    await mount();
    await finish(0, { data: null, error: { message: "old session failure" } });
    vi.mocked(useSupabaseSession).mockReturnValue({
      ...useSupabaseSession(),
      user: { id: "user-a", last_sign_in_at: "2026-11-15T04:00:00Z" },
    } as ReturnType<typeof useSupabaseSession>);
    await act(async () => {
      view.update(createElement(LibraryPage));
    });
    expect(text()).not.toContain("Library unavailable");
    expect(text()).toContain("Loading your assets");
    await finish(1, { data: [asset("Fresh session lamp")], error: null });
    expect(text()).toContain("Fresh session lamp");
  });

  it("ignores a rejected old request after sign-out", async () => {
    await mount();
    await account(null);
    expect(queries[0].signal?.aborted).toBe(true);
    await act(async () => {
      queries[0].reject(new Error("old request"));
    });
    expect(text()).toContain("Sign in to see");
    expect(text()).not.toContain("Library unavailable");
  });

  it("cancels the deadline after a successful response", async () => {
    vi.useFakeTimers();
    await mount();
    await finish(0, { data: [asset("Completed lamp")], error: null });
    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });
    expect(text()).toContain("Completed lamp");
    expect(text()).not.toContain("Library unavailable");
  });

  it("handles rejected transports and missing clients with retry", async () => {
    await mount();
    await act(async () => {
      queries[0].reject(new Error("private network failure"));
    });
    expect(text()).toContain("Library unavailable");
    expect(text()).not.toContain("private network");
    vi.mocked(getSupabaseBrowserClient).mockReturnValue(null);
    await retry();
    expect(text()).toContain("Library unavailable");
  });
  it("bounds stalled loads and ignores completion after timeout/retry", async () => {
    vi.useFakeTimers();
    await mount();
    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });
    expect(text()).toContain("Library unavailable");
    expect(queries[0].signal?.aborted).toBe(true);
    await retry();
    await finish(1, { data: [asset("Retry result")], error: null });
    await finish(0, { data: [asset("Expired result")], error: null });
    expect(text()).toContain("Retry result");
    expect(text()).not.toContain("Expired result");
  });
  it("does not query while signed out or while the session is loading", async () => {
    session(null);
    await mount();
    expect(queries).toHaveLength(0);
    session("user-a");
    vi.mocked(useSupabaseSession).mockReturnValue({
      ...useSupabaseSession(),
      loading: true,
    });
    await act(async () => {
      view.update(createElement(LibraryPage));
    });
    expect(queries).toHaveLength(0);
  });
  it("runs the real Supabase query builder against a stub transport with owner filtering", async () => {
    const transport = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify([asset("SDK lamp")]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const client = createClient(
      "https://example.supabase.co",
      "test-anon-key",
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: { fetch: transport },
      },
    );
    vi.mocked(getSupabaseBrowserClient).mockReturnValue(client);
    await mount();
    expect(text()).toContain("SDK lamp");
    const url = new URL(String(transport.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/rest/v1/assets");
    expect(url.searchParams.get("owner_id")).toBe("eq.user-a");
  });
});
