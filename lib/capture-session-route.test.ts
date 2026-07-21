import { beforeEach, describe, expect, it } from "vitest";

import { POST as createSessionRoute } from "@/app/api/capture-session/route";
import {
  GET as getSessionRoute,
  POST as submitSessionRoute
} from "@/app/api/capture-session/[id]/route";

function resetStore() {
  (
    globalThis as typeof globalThis & { __yiiyaCaptureSessions?: Map<string, unknown> }
  ).__yiiyaCaptureSessions = new Map();
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
}

function jsonRequest(url: string, body?: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

describe("capture-session API routes", () => {
  beforeEach(resetStore);

  it("create → poll(pending) → submit(views) → poll(ready)", async () => {
    // Create
    const createRes = await createSessionRoute(
      jsonRequest("https://yiiya.app/api/capture-session")
    );
    expect(createRes.status).toBe(200);
    const { id, captureUrl } = (await createRes.json()) as {
      id: string;
      captureUrl: string;
    };
    expect(id).toBeTruthy();
    expect(captureUrl).toBe(`https://yiiya.app/capture?session=${id}`);

    // Poll: pending, no views yet
    const poll1 = await getSessionRoute(new Request("https://yiiya.app/x"), {
      params: { id }
    });
    expect(poll1.status).toBe(200);
    expect(await poll1.json()).toEqual({ status: "pending", views: [] });

    // Submit hosted URLs (phone path that already has Blob URLs)
    const views = [
      "https://blob.example/front.png",
      "https://blob.example/left.png",
      "https://blob.example/back.png"
    ];
    const submitRes = await submitSessionRoute(
      jsonRequest(`https://yiiya.app/api/capture-session/${id}`, { views }),
      { params: { id } }
    );
    expect(submitRes.status).toBe(200);
    expect(await submitRes.json()).toEqual({ status: "ready", views });

    // Poll: ready with views
    const poll2 = await getSessionRoute(new Request("https://yiiya.app/x"), {
      params: { id }
    });
    expect(await poll2.json()).toEqual({ status: "ready", views });
  });

  it("GET returns 404 for an unknown/expired session", async () => {
    const res = await getSessionRoute(new Request("https://yiiya.app/x"), {
      params: { id: "nope" }
    });
    expect(res.status).toBe(404);
  });

  it("POST returns 404 when submitting to an unknown session", async () => {
    const res = await submitSessionRoute(
      jsonRequest("https://yiiya.app/api/capture-session/nope", {
        views: ["https://blob.example/a.png"]
      }),
      { params: { id: "nope" } }
    );
    expect(res.status).toBe(404);
  });

  it("POST returns 400 on a malformed body", async () => {
    const createRes = await createSessionRoute(
      jsonRequest("https://yiiya.app/api/capture-session")
    );
    const { id } = (await createRes.json()) as { id: string };

    const res = await submitSessionRoute(
      jsonRequest(`https://yiiya.app/api/capture-session/${id}`, { junk: true }),
      { params: { id } }
    );
    expect(res.status).toBe(400);
  });

  it("POST rejects non-URL view strings", async () => {
    const createRes = await createSessionRoute(
      jsonRequest("https://yiiya.app/api/capture-session")
    );
    const { id } = (await createRes.json()) as { id: string };

    const res = await submitSessionRoute(
      jsonRequest(`https://yiiya.app/api/capture-session/${id}`, {
        views: ["not-a-url"]
      }),
      { params: { id } }
    );
    expect(res.status).toBe(400);
  });
});
