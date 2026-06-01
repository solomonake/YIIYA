import { describe, expect, it } from "vitest";
import { checkSlop } from "./slop-guard";

const STAKE = {
  typographyVoice: "editorial-serif" as const,
  colorStory: "editorial-cream" as const,
  motionPersonality: "considered" as const
};

describe("slop-guard", () => {
  it("flags Inter as the default font", () => {
    const out = checkSlop([{ type: "HERO", theme: { fontFamily: "Inter" } }], STAKE);
    expect(out.ok).toBe(false);
    expect(out.rewrites[0].reason).toMatch(/inter/i);
  });

  it("flags purple→blue gradients", () => {
    const out = checkSlop(
      [{ type: "HERO", style: { background: "linear-gradient(135deg, #7c3aed, #3b82f6)" } }],
      STAKE
    );
    expect(out.ok).toBe(false);
  });

  it("flags generic slop copy", () => {
    const out = checkSlop([{ type: "HERO", title: "Build the future of work" }], STAKE);
    expect(out.warnings.join(" ")).toMatch(/slop opener/i);
  });

  it("passes clean editorial copy", () => {
    const out = checkSlop(
      [{ type: "HERO", title: "A century-old watchmaker, reborn in glass.", theme: { fontFamily: "Fraunces" } }],
      STAKE
    );
    expect(out.ok).toBe(true);
  });
});
