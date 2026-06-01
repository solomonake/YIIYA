import { describe, expect, it, vi } from "vitest";
import { consumeSceneStream } from "./stream-consumer";
import type { StageEvent } from "./stage-state";

function sseResponse(frames: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) {
        controller.enqueue(encoder.encode(`data: ${frame}\n\n`));
      }
      controller.close();
    }
  });
  return new Response(stream, { status: 200 });
}

describe("consumeSceneStream", () => {
  it("dispatches STARTED, PROGRESS, and READY for a happy-path stream", async () => {
    const events: StageEvent[] = [];
    const dispatch = vi.fn((e: StageEvent) => events.push(e));

    const res = sseResponse([
      JSON.stringify({ kind: "stage_started", stage: "generate3d", t: 1 }),
      JSON.stringify({ kind: "progress", stage: "generate3d", pct: 25 }),
      JSON.stringify({ kind: "progress", stage: "generate3d", pct: 70, eta_ms: 4000 }),
      JSON.stringify({
        kind: "result",
        data: { glbUrl: "https://cdn.example/scene.glb", provider: "tripo" }
      }),
      JSON.stringify({ kind: "stage_completed", stage: "generate3d", ms: 5000 })
    ]);

    const result = await consumeSceneStream(res, dispatch);

    expect(result).toEqual({
      glbUrl: "https://cdn.example/scene.glb",
      provider: "tripo",
      meta: undefined
    });

    const types = events.map((e) => e.type);
    expect(types).toEqual([
      "GENERATION_STARTED",
      "GENERATION_PROGRESS",
      "GENERATION_PROGRESS",
      "GENERATION_READY"
    ]);

    // 25/100 and 70/100 should be normalized to 0..1.
    const progresses = events
      .filter((e): e is Extract<StageEvent, { type: "GENERATION_PROGRESS" }> => e.type === "GENERATION_PROGRESS")
      .map((e) => e.progress);
    expect(progresses).toEqual([0.25, 0.7]);
  });

  it("emits FAILED when the stream reports stage_failed", async () => {
    const events: StageEvent[] = [];
    const res = sseResponse([
      JSON.stringify({ kind: "stage_started", stage: "generate3d", t: 1 }),
      JSON.stringify({ kind: "stage_failed", stage: "generate3d", ms: 200, reason: "provider_timeout" })
    ]);

    const result = await consumeSceneStream(res, (e) => events.push(e));
    expect(result).toBeNull();
    expect(events.some((e) => e.type === "GENERATION_FAILED" && e.reason === "provider_timeout")).toBe(true);
  });

  it("ignores progress events from non-visible stages (firewall/interpret)", async () => {
    const events: StageEvent[] = [];
    const res = sseResponse([
      JSON.stringify({ kind: "stage_started", stage: "firewall", t: 1 }),
      JSON.stringify({ kind: "progress", stage: "firewall", pct: 50 }),
      JSON.stringify({ kind: "stage_started", stage: "generate3d", t: 2 }),
      JSON.stringify({ kind: "progress", stage: "generate3d", pct: 30 }),
      JSON.stringify({ kind: "result", data: { glbUrl: "x.glb", provider: "p" } })
    ]);

    await consumeSceneStream(res, (e) => events.push(e));
    // Should not dispatch STARTED for firewall, only for generate3d.
    const starts = events.filter((e) => e.type === "GENERATION_STARTED");
    expect(starts).toHaveLength(1);
  });

  it("falls back to FAILED when the stream ends without a result", async () => {
    const events: StageEvent[] = [];
    const res = sseResponse([
      JSON.stringify({ kind: "stage_started", stage: "generate3d", t: 1 })
    ]);

    const result = await consumeSceneStream(res, (e) => events.push(e));
    expect(result).toBeNull();
    expect(events[events.length - 1]?.type).toBe("GENERATION_FAILED");
  });
});
