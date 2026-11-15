import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/app/api/interpret/guard", () => ({ guardRequest: vi.fn() }));
vi.mock("@/lib/interpret-pipeline", () => ({
  isInterpretRequest: (value: unknown) => !!value && typeof (value as { transcript?: unknown }).transcript === "string",
  runInterpretOnce: vi.fn(), runInterpretPipeline: vi.fn()
}));
vi.mock("@/lib/assets/persist", () => ({ findCachedAsset: vi.fn(), saveGeneratedAsset: vi.fn() }));
import { guardRequest, type GuardOk } from "@/app/api/interpret/guard";
import { runInterpretOnce, runInterpretPipeline } from "@/lib/interpret-pipeline";
import { findCachedAsset, saveGeneratedAsset } from "@/lib/assets/persist";
import { POST as jsonPost } from "@/app/api/interpret/route";
import { POST as streamPost } from "@/app/api/interpret/stream/route";

const request = (body: unknown) => new NextRequest("https://yiiya.test/api/interpret", {
  method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" }
});
function approved(): GuardOk {
  return { ok: true, body: { transcript: "approved mug" },
    identity: { identityKey: "user:a", userId: "owner-a", isExempt: false },
    stake: {} as GuardOk["stake"], traceId: "trace-test" };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(guardRequest).mockResolvedValue(approved());
  vi.mocked(findCachedAsset).mockResolvedValue(null);
  vi.mocked(runInterpretOnce).mockResolvedValue({} as Awaited<ReturnType<typeof runInterpretOnce>>);
  vi.mocked(runInterpretPipeline).mockImplementation(async function* () {});
});

describe.each([["JSON", jsonPost], ["stream", streamPost]] as const)("%s generation guard", (_name, post) => {
  it("rejects an oversized envelope before guard/provider work", async () => {
    const response = await post(request({ transcript: "mug", extra: "x".repeat(4_250_000) }));
    await response.text();
    expect(response.status).toBe(413);
    expect(guardRequest).not.toHaveBeenCalled();
    expect(runInterpretOnce).not.toHaveBeenCalled();
    expect(runInterpretPipeline).not.toHaveBeenCalled();
  });
  it.each([429, 503, 451])("does not dispatch generation after a %s guard denial", async status => {
    vi.mocked(guardRequest).mockResolvedValue({ ok: false, error: "denied", message: "Try later",
      response: new Response("denied", { status, headers: { "Retry-After": "60" } }) });
    const response = await post(request({ transcript: "mug" }));
    await response.text();
    expect(response.status).toBe(status);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(guardRequest).toHaveBeenCalledOnce();
    expect(runInterpretOnce).not.toHaveBeenCalled();
    expect(runInterpretPipeline).not.toHaveBeenCalled();
    expect(findCachedAsset).not.toHaveBeenCalled();
  });
  it("passes the approved transcript and retains image/options", async () => {
    const image = { base64: "test", mediaType: "image/png", name: "mug.png" };
    const response = await post(request({ transcript: "original mug", referenceImage: image, forceGenerate: true }));
    await response.text();
    expect(response.status).toBe(200);
    const dispatched = _name === "JSON" ? vi.mocked(runInterpretOnce) : vi.mocked(runInterpretPipeline);
    expect(dispatched).toHaveBeenCalledWith({ transcript: "approved mug", referenceImage: image, forceGenerate: true });
  });
});

it("stream cache and saved asset use the same approved transcript", async () => {
  const asset = { id: "asset-1" } as Parameters<typeof saveGeneratedAsset>[3];
  vi.mocked(runInterpretPipeline).mockImplementation(async function* () {
    yield { type: "asset_ready", asset, log: "ready" };
  });
  vi.mocked(saveGeneratedAsset).mockResolvedValue("saved-id");
  const response = await streamPost(request({ transcript: "original mug" }));
  await response.text();
  expect(findCachedAsset).toHaveBeenCalledWith("owner-a", "approved mug", expect.stringMatching(/^[a-f0-9]{64}$/));
  expect(saveGeneratedAsset).toHaveBeenCalledWith("owner-a", "approved mug", null, asset, vi.mocked(findCachedAsset).mock.calls[0][2]);
});

it("separates identical prompts with changed style or conversation context", async () => {
  const a = await streamPost(request({ transcript: "mug", sessionStyleDNA: { styleLabel: "ceramic" } }));
  await a.text();
  const b = await streamPost(request({ transcript: "mug", sessionStyleDNA: { styleLabel: "wireframe" } }));
  await b.text();
  const calls = vi.mocked(findCachedAsset).mock.calls as unknown as unknown[][];
  expect(calls[0][2]).toEqual(expect.stringMatching(/^[a-f0-9]{64}$/));
  expect(calls[1][2]).not.toEqual(calls[0][2]);
});
