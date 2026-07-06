import { describe, expect, it } from "vitest";
import { compileLocalIntent } from "./local-intent-compiler";

describe("compileLocalIntent object wording", () => {
  it("routes 'A car' to the car object rather than 3D text", () => {
    const actions = compileLocalIntent({
      transcript: "A car",
      activeElementId: null,
      cursorTarget: null
    });

    expect(actions).toEqual([
      expect.objectContaining({
        type: "ADD_3D_OBJECT",
        payload: expect.objectContaining({
          resolvedName: "car",
          modelUrl: "library://car",
          semanticFamily: "vehicle",
          prompt: expect.stringContaining("not letters")
        })
      })
    ]);
  });

  it("preserves explicit typography requests as prompt intent", () => {
    const actions = compileLocalIntent({
      transcript: 'Make a 3D image of the word "A car"',
      activeElementId: null,
      cursorTarget: null
    });

    expect(actions.some((action) => action.type === "ADD_3D_OBJECT")).toBe(true);
    expect(actions[0]?.payload.prompt).toBe('Make a 3D image of the word "A car"');
  });
});
