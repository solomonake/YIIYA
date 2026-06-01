import { describe, expect, it } from "vitest";
import { initialStage, particleDensity, reduceStage, shouldShowTypographic } from "./stage-state";

describe("stage-state", () => {
  it("starts EMPTY", () => {
    expect(initialStage.kind).toBe("EMPTY");
    expect(shouldShowTypographic(initialStage)).toBe(false);
  });

  it("EMPTY → INTENT on typed prompt", () => {
    const s = reduceStage(initialStage, { type: "PROMPT_TYPED", text: "a cup" }, 1000);
    expect(s.kind).toBe("INTENT");
    expect(shouldShowTypographic(s)).toBe(true);
  });

  it("INTENT → GENERATING preserves prompt text", () => {
    const intent = reduceStage(initialStage, { type: "PROMPT_TYPED", text: "a cup" }, 1000);
    const gen = reduceStage(intent, { type: "GENERATION_STARTED", provider: "tripo" }, 1100);
    expect(gen.kind).toBe("GENERATING");
    expect("promptText" in gen && gen.promptText).toBe("a cup");
    expect(particleDensity(gen)).toBe(1);
  });

  it("progress reduces particle density", () => {
    const intent = reduceStage(initialStage, { type: "PROMPT_TYPED", text: "a cup" }, 1000);
    const gen = reduceStage(intent, { type: "GENERATION_STARTED", provider: "tripo" }, 1100);
    const mid = reduceStage(gen, { type: "GENERATION_PROGRESS", progress: 0.6 }, 1200);
    expect(particleDensity(mid)).toBeCloseTo(0.4, 5);
  });

  it("GENERATION_READY → READY", () => {
    const intent = reduceStage(initialStage, { type: "PROMPT_TYPED", text: "x" }, 0);
    const ready = reduceStage(intent, { type: "GENERATION_READY", glbUrl: "/x.glb", provider: "tripo" }, 0);
    expect(ready.kind).toBe("READY");
  });

  it("empty prompt drops back to EMPTY", () => {
    const s = reduceStage(initialStage, { type: "PROMPT_TYPED", text: "   " }, 0);
    expect(s.kind).toBe("EMPTY");
  });
});
