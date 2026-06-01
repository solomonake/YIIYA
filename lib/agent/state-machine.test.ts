import { describe, expect, it } from "vitest";
import { HEARTBEAT_DEADLINE_MS, isStalled, reduce } from "./state-machine";

describe("agent state-machine", () => {
  it("transitions IDLE → RUNNING on STAGE_STARTED", () => {
    const state = reduce({ kind: "IDLE" }, { type: "STAGE_STARTED", stage: "interpret", t: 1000 });
    expect(state.kind).toBe("RUNNING");
  });

  it("treats missing heartbeats as stalled", () => {
    const running = reduce({ kind: "IDLE" }, { type: "STAGE_STARTED", stage: "interpret", t: 0 });
    expect(isStalled(running, HEARTBEAT_DEADLINE_MS + 100)).toBe(true);
  });

  it("does not stall with recent heartbeats", () => {
    const start = reduce({ kind: "IDLE" }, { type: "STAGE_STARTED", stage: "interpret", t: 0 });
    const beat = reduce(start, { type: "HEARTBEAT", stage: "interpret", t: 500 });
    expect(isStalled(beat, 500 + HEARTBEAT_DEADLINE_MS - 100)).toBe(false);
  });

  it("transitions to DONE on render complete", () => {
    const start = reduce({ kind: "IDLE" }, { type: "STAGE_STARTED", stage: "render", t: 0 });
    const done = reduce(start, { type: "STAGE_COMPLETED", stage: "render", ms: 100 });
    expect(done.kind).toBe("DONE");
  });
});
