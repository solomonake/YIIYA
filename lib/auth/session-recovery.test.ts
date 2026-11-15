import { createElement, Fragment } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createClient,
  type AuthChangeEvent,
  type Session,
} from "@supabase/supabase-js";
import {
  SupabaseSessionProvider,
  useSupabaseSession,
  type SessionState,
} from "./use-session";
import {
  getSupabaseBrowserClient,
  isSupabaseConfigured,
} from "@/lib/supabase-client";
import LibraryPage from "@/app/library/page";

vi.mock("@/lib/supabase-client", () => ({
  getSupabaseBrowserClient: vi.fn(),
  isSupabaseConfigured: vi.fn(),
}));
vi.mock("@/components/auth/auth-sheet", () => ({ AuthSheet: () => null }));
vi.mock("next/link", () => ({
  default: ({ children }: { children: string }) =>
    createElement("span", null, children),
}));
vi.mock("@/lib/auth/actions", () => ({ signOut: vi.fn() }));

type Result = { data: { session: Session | null }; error: Error | null };
function pending() {
  let resolve!: (value: Result) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Result>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const signed = (id: string) =>
  ({ user: { id, last_sign_in_at: "2026-11-15" } }) as Session;
let view: ReactTestRenderer | undefined;
let reads: ReturnType<typeof pending>[];
let callbacks: ((event: AuthChangeEvent, session: Session | null) => void)[];
let unsubscribes: ReturnType<typeof vi.fn>[];
let states: Record<string, SessionState>;
function Probe({ name }: { name: string }) {
  states[name] = useSupabaseSession();
  return createElement("span", null, states[name].user?.id ?? "no-user");
}
async function mount() {
  await act(async () => {
    view = create(
      createElement(
        SupabaseSessionProvider,
        null,
        createElement(
          Fragment,
          null,
          createElement(Probe, { name: "one" }),
          createElement(Probe, { name: "two" }),
        ),
      ),
    );
  });
}
async function resolve(
  index: number,
  session: Session | null,
  error: Error | null = null,
) {
  await act(async () => {
    reads[index].resolve({ data: { session }, error });
  });
}
async function event(
  index: number,
  event: AuthChangeEvent,
  session: Session | null,
) {
  await act(async () => {
    callbacks[index](event, session);
  });
}
beforeEach(() => {
  reads = [];
  callbacks = [];
  unsubscribes = [];
  states = {};
  vi.mocked(isSupabaseConfigured).mockReturnValue(true);
  const auth = {
    getSession: vi.fn(() => {
      const read = pending();
      reads.push(read);
      return read.promise;
    }),
    onAuthStateChange: vi.fn(
      (cb: (event: AuthChangeEvent, session: Session | null) => void) => {
        callbacks.push(cb);
        const unsubscribe = vi.fn();
        unsubscribes.push(unsubscribe);
        return { data: { subscription: { unsubscribe } } };
      },
    ),
  };
  vi.mocked(getSupabaseBrowserClient).mockReturnValue({
    auth,
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            abortSignal: async () => ({ data: [], error: null }),
          }),
        }),
      }),
    }),
  } as unknown as ReturnType<typeof getSupabaseBrowserClient>);
});
afterEach(() => {
  if (view) act(() => view!.unmount());
  view = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("shared sign-in initialization", () => {
  it("shares one read/subscription and current events between consumers", async () => {
    await mount();
    expect(reads).toHaveLength(1);
    expect(callbacks).toHaveLength(1);
    await resolve(0, signed("a"));
    expect(states.one.user?.id).toBe("a");
    expect(states.two).toBe(states.one);
    await event(0, "SIGNED_OUT", null);
    expect(states.one.user).toBeNull();
    expect(states.two.loading).toBe(false);
  });
  it("does not restore an old user after a newer sign-out", async () => {
    await mount();
    await event(0, "SIGNED_OUT", null);
    await resolve(0, signed("old"));
    expect(states.one.user).toBeNull();
    expect(states.one.loading).toBe(false);
    expect(states.one.error).toBe(false);
  });
  it("lets a new sign-in win over an older snapshot error", async () => {
    await mount();
    await event(0, "SIGNED_IN", signed("new"));
    await resolve(0, null, new Error("old error"));
    expect(states.one.user?.id).toBe("new");
    expect(states.one.error).toBe(false);
  });
  it.each(["returned", "rejected"])(
    "ends loading on %s error and recovers on shared retry",
    async (kind) => {
      await mount();
      if (kind === "returned")
        await resolve(0, null, new Error("private auth details"));
      else
        await act(async () => {
          reads[0].reject(new Error("private auth details"));
        });
      expect(states.one.loading).toBe(false);
      expect(states.one.error).toBe(true);
      expect(states.one.user).toBeNull();
      await act(async () => {
        states.one.retry();
      });
      expect(unsubscribes[0]).toHaveBeenCalledTimes(1);
      expect(states.two.loading).toBe(true);
      await resolve(1, signed("recovered"));
      expect(states.two.user?.id).toBe("recovered");
      expect(states.one.error).toBe(false);
    },
  );
  it("bounds a hung read, ignores late snapshot/initial event, and accepts a real auth event", async () => {
    vi.useFakeTimers();
    await mount();
    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });
    expect(states.one.loading).toBe(false);
    expect(states.one.error).toBe(true);
    await resolve(0, signed("late"));
    await event(0, "INITIAL_SESSION", signed("late"));
    expect(states.one.user).toBeNull();
    await event(0, "SIGNED_IN", signed("current"));
    expect(states.two.user?.id).toBe("current");
    expect(states.one.error).toBe(false);
  });
  it("ignores old attempt completions and callbacks after retry", async () => {
    vi.useFakeTimers();
    await mount();
    await act(async () => {
      vi.advanceTimersByTime(15_000);
      states.one.retry();
    });
    await event(0, "SIGNED_IN", signed("old"));
    await resolve(0, signed("old"));
    expect(states.one.loading).toBe(true);
    await resolve(1, signed("latest"));
    expect(states.two.user?.id).toBe("latest");
  });
  it("cleans up the listener and timer on unmount", async () => {
    vi.useFakeTimers();
    await mount();
    act(() => view!.unmount());
    view = undefined;
    expect(unsubscribes[0]).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    await event(0, "SIGNED_IN", signed("ignored"));
    await resolve(0, signed("ignored"));
    expect(states.one.loading).toBe(true);
  });
  it("does not report an error when auth is unconfigured", async () => {
    vi.mocked(getSupabaseBrowserClient).mockReturnValue(null);
    vi.mocked(isSupabaseConfigured).mockReturnValue(false);
    await mount();
    expect(states.one).toMatchObject({
      loading: false,
      error: false,
      user: null,
      isConfigured: false,
    });
    expect(reads).toHaveLength(0);
  });
  it("ends loading when client construction throws without exposing its error", async () => {
    vi.mocked(getSupabaseBrowserClient).mockImplementation(() => {
      throw Error("private config");
    });
    await mount();
    expect(states.one).toMatchObject({
      loading: false,
      error: true,
      user: null,
    });
    expect(JSON.stringify(view!.toJSON())).not.toContain("private config");
  });
  it("shows safe Library recovery and retries without losing the shared provider", async () => {
    await act(async () => {
      view = create(createElement(LibraryPage));
    });
    await resolve(0, null, new Error("private upstream detail"));
    const text = () => JSON.stringify(view!.toJSON());
    expect(text()).toContain("Sign-in check unavailable");
    expect(text()).not.toContain("private upstream");
    const button = view!.root
      .findAllByType("button")
      .find((b) => b.children.join("") === "Retry sign-in check")!;
    expect(button.props.className).toContain("min-h-11");
    await act(async () => {
      button.props.onClick();
    });
    await resolve(1, signed("a"));
    expect(text()).toContain("Nothing here yet");
    expect(text()).not.toContain("Sign-in check unavailable");
  });
  it("reads a signed-out session through the installed SDK without live credentials", async () => {
    const client = createClient(
      "https://example.supabase.co",
      "test-anon-key",
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );
    vi.mocked(getSupabaseBrowserClient).mockReturnValue(client);
    await mount();
    expect(states.one).toMatchObject({
      loading: false,
      error: false,
      user: null,
    });
  });
});
