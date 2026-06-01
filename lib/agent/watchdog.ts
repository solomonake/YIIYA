/**
 * Client-side watchdog. Polls the agent state every 500ms; if a stage hasn't
 * heartbeat'd within its deadline, dispatches a WATCHDOG_TIMEOUT event.
 *
 * Hook it up to your Zustand store:
 *
 *   const stopWatchdog = startWatchdog({
 *     getState: () => useYiiyaStore.getState().agentState,
 *     dispatch: (e) => useYiiyaStore.getState().dispatchAgentEvent(e)
 *   });
 *   // call stopWatchdog() on unmount
 */
import { isStalled, type AgentEvent, type AgentState } from "./state-machine";

export type WatchdogOptions = {
  getState: () => AgentState;
  dispatch: (event: AgentEvent) => void;
  pollIntervalMs?: number;
};

export function startWatchdog(opts: WatchdogOptions): () => void {
  const interval = opts.pollIntervalMs ?? 500;
  let lastFiredFor: string | null = null;
  const id = setInterval(() => {
    const state = opts.getState();
    if (state.kind !== "RUNNING") {
      lastFiredFor = null;
      return;
    }
    if (isStalled(state, Date.now())) {
      const tag = `${state.stage}:${state.startedAt}`;
      if (tag !== lastFiredFor) {
        lastFiredFor = tag;
        opts.dispatch({ type: "WATCHDOG_TIMEOUT", stage: state.stage });
      }
    }
  }, interval);
  return () => clearInterval(id);
}

/**
 * Parse a Server-Sent-Events stream into agent events.
 * Returns an async generator so callers can `for await` and dispatch.
 */
export async function* parseAgentStream(
  response: Response
): AsyncGenerator<AgentEvent> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const json = trimmed.slice(5).trim();
      try {
        const event = JSON.parse(json) as {
          kind: string;
          stage?: string;
          t?: number;
          pct?: number;
          eta_ms?: number;
          ms?: number;
          reason?: string;
        };
        switch (event.kind) {
          case "stage_started":
            yield { type: "STAGE_STARTED", stage: event.stage as never, t: event.t ?? Date.now() };
            break;
          case "heartbeat":
            yield { type: "HEARTBEAT", stage: event.stage as never, t: event.t ?? Date.now() };
            break;
          case "progress":
            yield {
              type: "PROGRESS",
              stage: event.stage as never,
              pct: event.pct ?? 0,
              etaMs: event.eta_ms
            };
            break;
          case "stage_completed":
            yield { type: "STAGE_COMPLETED", stage: event.stage as never, ms: event.ms ?? 0 };
            break;
          case "stage_failed":
            yield {
              type: "STAGE_FAILED",
              stage: event.stage as never,
              reason: event.reason ?? "unknown"
            };
            break;
        }
      } catch {
        // ignore malformed events
      }
    }
  }
}
