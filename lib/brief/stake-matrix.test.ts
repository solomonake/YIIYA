import { describe, expect, it } from "vitest";
import { compileStake, pickStakeFromVibe, COLOR_STORIES, TYPOGRAPHY } from "./stake-matrix";

describe("stake-matrix", () => {
  it("maps luxury vibe to editorial stake", () => {
    const s = pickStakeFromVibe(["luxury", "premium"], "luxury goods");
    expect(s.typographyVoice).toBe("editorial-serif");
    expect(s.colorStory).toBe("editorial-cream");
    expect(s.motionPersonality).toBe("still");
  });

  it("maps software to mono terminal midnight", () => {
    const s = pickStakeFromVibe(["minimal"], "software");
    expect(s.typographyVoice).toBe("mono-terminal");
    expect(s.colorStory).toBe("midnight");
  });

  it("compiled stake emits CSS variables + font packages", () => {
    const s = pickStakeFromVibe(["luxury"], "luxury goods");
    const compiled = compileStake(s);
    expect(compiled.cssVars["--yiiya-bg"]).toBe(COLOR_STORIES["editorial-cream"].bg);
    expect(compiled.cssVars["--yiiya-font-heading"]).toContain(TYPOGRAPHY[s.typographyVoice].heading.family);
    expect(compiled.fontPackages.length).toBeGreaterThan(0);
    for (const pkg of compiled.fontPackages) {
      expect(pkg.startsWith("@fontsource")).toBe(true);
    }
  });

  it("never picks Inter as default headline", () => {
    for (const voice of Object.keys(TYPOGRAPHY)) {
      const heading = TYPOGRAPHY[voice as keyof typeof TYPOGRAPHY].heading.family.toLowerCase();
      expect(heading).not.toBe("inter");
    }
  });
});
