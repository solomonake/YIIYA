import { describe, expect, it } from "vitest";
import { CursorTrack } from "./cursor-track";
import { resolveDeictic, resolveSpan } from "./deictic-resolver";

function trackWithHover(componentId: string, t: number): CursorTrack {
  const track = new CursorTrack();
  track.push({ t: t - 100, x: 0, y: 0, componentId });
  track.push({ t, x: 0, y: 0, componentId });
  track.push({ t: t + 100, x: 0, y: 0, componentId });
  return track;
}

describe("deictic-resolver", () => {
  it('binds "this" to the hovered component', () => {
    const track = trackWithHover("hero-title", 1000);
    const out = resolveDeictic(
      "make this red",
      [
        { word: "make", t: 900 },
        { word: "this", t: 1000 },
        { word: "red", t: 1100 }
      ],
      { track }
    );
    expect(out.rewritten).toContain("[hero-title]");
    expect(out.unresolved).toBe(0);
  });

  it('binds "these" to the lasso selection set', () => {
    const track = new CursorTrack();
    const out = resolveDeictic("make these bigger", [{ word: "these", t: 0 }], {
      track,
      selectionIds: ["card-1", "card-2", "card-3"]
    });
    expect(out.rewritten).toMatch(/\[card-1, card-2, card-3\]/);
  });

  it("falls back to span resolution when word timings unavailable", () => {
    const track = trackWithHover("button-primary", 500);
    const out = resolveSpan("change it to teal", 0, 1000, { track });
    expect(out.rewritten).toMatch(/\[button-primary\]/);
  });

  it("leaves unresolved pronouns alone", () => {
    const track = new CursorTrack();
    const out = resolveDeictic(
      "make this red",
      [{ word: "this", t: 1000 }],
      { track }
    );
    expect(out.rewritten).toBe("make this red");
    expect(out.unresolved).toBe(1);
  });
});
