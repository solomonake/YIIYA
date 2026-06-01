/**
 * Agent state machine.
 *
 * Client-side Zustand-friendly reducer that tracks where the pipeline is.
 * Pairs with the SSE event stream emitted by lib/telemetry/heartbeat.ts —
 * each event drives a deterministic state transition. The LLM is never
 * trusted to decide "am I still working" — the state machine is.
 *
 * Research basis:
 *   https://voxam.hashnode.dev/stop-letting-llm-drive-voice-agent-state-machine
 */

export type StageKind =
  | "idle"
  | "firewall"
  | "interpret"
  | "critic"
  | "generate3d"
  | "render"
  | "publish";

export type AgentState =
  | { kind: "IDLE" }
  | { kind: "RUNNING"; stage: StageKind; startedAt: number; lastHeartbeat: number; progress?: number; etaMs?: number }
  | { kind: "TIMED_OUT"; stage: StageKind; lastError?: string }
  | { kind: "FAILED"; stage: StageKind; reason: string }
  | { kind: "DONE"; ms: number };

export const STAGE_TIMEOUTS_MS: Record<StageKind, number> = {
  idle: 0,
  firewall: 4_000,
  interpret: 12_000,
  critic: 6_000,
  generate3d: 180_000,
  render: 5_000,
  publish: 10_000
};

/** Heartbeat must arrive at least this often or the watchdog stalls. */
export const HEARTBEAT_DEADLINE_MS = 3_000;

export type AgentEvent =
  | { type: "RESET" }
  | { type: "STAGE_STARTED"; stage: StageKind; t: number }
  | { type: "HEARTBEAT"; stage: StageKind; t: number }
  | { type: "PROGRESS"; stage: StageKind; pct: number; etaMs?: number }
  | { type: "STAGE_COMPLETED"; stage: StageKind; ms: number }
  | { type: "STAGE_FAILED"; stage: StageKind; reason: string }
  | { type: "WATCHDOG_TIMEOUT"; stage: StageKind };

export function reduce(state: AgentState, event: AgentEvent): AgentState {
  switch (event.type) {
    case "RESET":
      return { kind: "IDLE" };
    case "STAGE_STARTED":
      return {
        kind: "RUNNING",
        stage: event.stage,
        startedAt: event.t,
        lastHeartbeat: event.t
      };
    case "HEARTBEAT":
      if (state.kind !== "RUNNING") return state;
      return { ...state, lastHeartbeat: event.t };
    case "PROGRESS":
      if (state.kind !== "RUNNING") return state;
      return { ...state, progress: event.pct, etaMs: event.etaMs ?? state.etaMs };
    case "STAGE_COMPLETED":
      // The final stage marks the run done; otherwise stay RUNNING.
      if (event.stage === "render" || event.stage === "publish") {
        return { kind: "DONE", ms: event.ms };
      }
      return state;
    case "STAGE_FAILED":
      return { kind: "FAILED", stage: event.stage, reason: event.reason };
    case "WATCHDOG_TIMEOUT":
      return { kind: "TIMED_OUT", stage: event.stage };
    default:
      return state;
  }
}

export function isRunning(state: AgentState): boolean {
  return state.kind === "RUNNING";
}

export function isStalled(state: AgentState, now: number): boolean {
  if (state.kind !== "RUNNING") return false;
  const sinceHeartbeat = now - state.lastHeartbeat;
  const sinceStart = now - state.startedAt;
  return (
    sinceHeartbeat > HEARTBEAT_DEADLINE_MS || sinceStart > STAGE_TIMEOUTS_MS[state.stage]
  );
}
