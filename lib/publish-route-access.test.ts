import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth/verify-request", () => ({ getVerifiedUser: vi.fn() }));
vi.mock("@/lib/security/rate-limit", () => ({ checkLimit: vi.fn(), rateLimitHeaders: () => ({}) }));
import { getVerifiedUser } from "@/lib/auth/verify-request";
import { checkLimit } from "@/lib/security/rate-limit";
import { POST as publish } from "@/app/api/publish/route";
import { POST as autosave } from "@/app/api/projects/autosave/route";

const project = {
  slug: "abcd1234",
  userId: "someone-else",
  htmlSnapshot: "<main>hi</main>",
  htmlCanvasImage: "",
  sceneState: { projectName: "p", sections: [], sceneObjects: [], themeState: {}, layers: [] },
  createdAt: "2026-11-22T00:00:00.000Z"
};

function post(body: unknown) {
  return new Request("https://yiiya.test/api/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.yiiya.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  vi.mocked(checkLimit).mockResolvedValue({ success: true, remaining: 19, limit: 20, reset: Date.now() + 1000, unavailable: false });
});

describe.each([
  ["publish", publish],
  ["autosave", autosave]
] as const)("%s route", (_name, handler) => {
  it("refuses anonymous callers before reading the body or writing", async () => {
    vi.mocked(getVerifiedUser).mockResolvedValue(null);
    const request = post(project);

    const response = await handler(request);

    expect(response.status).toBe(401);
    expect(request.bodyUsed).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses when the owner is over the publish quota", async () => {
    vi.mocked(getVerifiedUser).mockResolvedValue({ userId: "owner-a", accessToken: "token-a" });
    vi.mocked(checkLimit).mockResolvedValue({ success: false, remaining: 0, limit: 20, reset: Date.now() + 1000, unavailable: false });

    expect((await handler(post(project))).status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("writes as the verified owner with their own token, never the service role or the body's userId", async () => {
    vi.mocked(getVerifiedUser).mockResolvedValue({ userId: "owner-a", accessToken: "token-a" });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([{
      slug: project.slug, user_id: "owner-a", canvas_json: {}, html_snapshot: project.htmlSnapshot,
      scene_json: project.sceneState, theme_json: {}, react_export: "", created_at: project.createdAt
    }]), { status: 200 }));

    expect((await handler(post(project))).status).toBe(200);

    const [, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer token-a");
    expect(JSON.stringify(init)).not.toContain("service-role-key");
    expect(JSON.parse(init.body as string).user_id).toBe("owner-a");
  });

  it("refuses to take over a slug that another account owns", async () => {
    vi.mocked(getVerifiedUser).mockResolvedValue({ userId: "owner-b", accessToken: "token-b" });
    fetchMock
      .mockResolvedValueOnce(new Response("[]", { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "23505" }), { status: 409 }));

    const response = await handler(post(project));

    expect(response.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
