/**
 * Bridges the SSE event stream emitted by `/api/scene/generate` into the
 * client-side stage machine (lib/scene/stage-state.ts).
 *
 * The server emits events in the shape defined by lib/telemetry/heartbeat.ts:
 *
 *   { kind: "stage_started", stage, t }
 *   { kind: "heartbeat",     stage, t }
 *   { kind: "progress",      stage, pct, eta_ms? }
 *   { kind: "stage_completed", stage, ms }
 *   { kind: "stage_failed",  stage, ms, reason }
 *   { kind: "result",        data: { glbUrl, provider, ... } }
 *   { kind: "error",         code, message }
 *
 * `consumeSceneStream` parses the SSE body, dispatches StageEvents into the
 * Zustand stage slice, and resolves with the final GenerationResult (if any)
 * so the caller can also push the GLB into the SceneObject store.
 *
 * Usage:
 *
 *   const res = await fetch("/api/scene/generate", { method: "POST", body });
 *   const dispatch = useYiiyaStore.getState().stageDispatch;
 *   const result = await consumeSceneStream(res, dispatch);
 *   if (result) {
 *     // result.glbUrl is also already in stage.kind === "READY"
 *     useYiiyaStore.getState().addSceneObject({ modelUrl: result.glbUrl, ... });
 *   }
 */
import type { StageEvent } from "./stage-state";

export type SceneStreamResult = {
  glbUrl: string;
  provider: string;
  meta?: Record<string, unknown>;
};

type RawEvent = {
  kind: string;
  stage?: string;
  t?: number;
  pct?: number;
  eta_ms?: number;
  ms?: number;
  reason?: string;
  code?: string;
  message?: string;
  data?: unknown;
};

/**
 * Stages that should drive the user-visible stage machine. The route also
 * emits events for `firewall` / `interpret` / `critic` etc., but only the
 * actual 3D generation stages are visually meaningful for the placeholder/
 * particle-dissolve crossfade.
 */
const VISIBLE_STAGES = new Set(["generate3d", "render"]);

export async function consumeSceneStream(
  response: Response,
  dispatch: (event: StageEvent) => void
): Promise<SceneStreamResult | null> {
  if (!response.ok || !response.body) {
    dispatch({
      type: "GENERATION_FAILED",
      reason: response.ok ? "empty_body" : `http_${response.status}`
    });
    return null;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: SceneStreamResult | null = null;
  let started = false;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const trimmed = frame.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload) continue;
        let event: RawEvent;
        try {
          event = JSON.parse(payload) as RawEvent;
        } catch {
          continue;
        }

        switch (event.kind) {
          case "stage_started": {
            const stage = event.stage ?? "generate3d";
            if (VISIBLE_STAGES.has(stage) && !started) {
              started = true;
              dispatch({ type: "GENERATION_STARTED", provider: stage });
            }
            break;
          }

          case "progress": {
            const stage = event.stage ?? "generate3d";
            if (!VISIBLE_STAGES.has(stage)) break;
            // Server reports 0..100 for pct; stage machine wants 0..1.
            const raw = typeof event.pct === "number" ? event.pct : 0;
            const progress = raw > 1 ? Math.min(1, raw / 100) : Math.max(0, Math.min(1, raw));
            if (!started) {
              started = true;
              dispatch({ type: "GENERATION_STARTED", provider: stage });
            }
            dispatch({
              type: "GENERATION_PROGRESS",
              progress,
              etaMs: typeof event.eta_ms === "number" ? event.eta_ms : undefined
            });
            break;
          }

          case "heartbeat": {
            // Soft progress nudge so the dissolve animates even when the
            // provider doesn't expose explicit pct telemetry. We bias to
            // ~95% so we never claim "done" before the real result arrives.
            const stage = event.stage ?? "generate3d";
            if (!VISIBLE_STAGES.has(stage)) break;
            if (!started) {
              started = true;
              dispatch({ type: "GENERATION_STARTED", provider: stage });
            }
            break;
          }

          case "stage_failed": {
            dispatch({
              type: "GENERATION_FAILED",
              reason: event.reason ?? "stage_failed"
            });
            break;
          }

          case "result": {
            const data = event.data as { glbUrl?: string; provider?: string; meta?: Record<string, unknown> } | undefined;
            if (data?.glbUrl) {
              finalResult = {
                glbUrl: data.glbUrl,
                provider: data.provider ?? "unknown",
                meta: data.meta
              };
              dispatch({
                type: "GENERATION_READY",
                glbUrl: finalResult.glbUrl,
                provider: finalResult.provider
              });
            }
            break;
          }

          case "error": {
            dispatch({
              type: "GENERATION_FAILED",
              reason: event.message ?? event.code ?? "stream_error"
            });
            break;
          }

          default:
            break;
        }
      }
    }
  } catch (err) {
    dispatch({
      type: "GENERATION_FAILED",
      reason: err instanceof Error ? err.message : "stream_aborted"
    });
    return null;
  }

  // The server may close the stream without sending a final "result" event
  // if the pipeline died silently. Surface that as a soft failure.
  if (!finalResult) {
    dispatch({ type: "GENERATION_FAILED", reason: "no_result_event" });
  }
  return finalResult;
}
