import { describe, expect, it } from "vitest";
import { adjustForContrast, checkA11y, contrastRatio } from "./a11y-guard";

describe("a11y-guard / contrast", () => {
  it("computes WCAG contrast correctly for black on white", () => {
    const ratio = contrastRatio("#000000", "#ffffff");
    expect(ratio).toBeCloseTo(21, 0);
  });

  it("rejects low-contrast body text", () => {
    const report = checkA11y([], { bg: "#ffffff", fg: "#cccccc", lang: "en" });
    expect(report.issues.find((i) => i.rule === "contrast")).toBeDefined();
  });

  it("adjusts foreground until contrast passes", () => {
    const adjusted = adjustForContrast("#cccccc", "#ffffff");
    const ratio = contrastRatio(adjusted, "#ffffff");
    expect(ratio).not.toBeNull();
    expect(ratio!).toBeGreaterThanOrEqual(4.5);
  });

  it("flags missing lang", () => {
    const report = checkA11y([], { bg: "#000", fg: "#fff" });
    expect(report.issues.find((i) => i.rule === "missing-lang")).toBeDefined();
  });
});
