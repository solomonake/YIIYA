import { describe, it, expect } from "vitest";
import { parseLocalEdit, classifyEditIntent } from "./local-edit";

describe("parseLocalEdit — local material fast path", () => {
  it("catches 'make it matte black' as color + finish", () => {
    const r = parseLocalEdit("make it matte black");
    expect(r).not.toBeNull();
    expect(r!.patch.roughness).toBeGreaterThan(0.8);
    expect(r!.patch.metalness).toBe(0);
    expect(r!.patch.color).toBe("#0a0a0a");
  });

  it("treats chrome as a high-metalness low-roughness finish", () => {
    const r = parseLocalEdit("make it chrome");
    expect(r!.patch.metalness).toBe(1);
    expect(r!.patch.roughness).toBeLessThan(0.1);
  });

  it("reads gold as a metal even without a finish word", () => {
    const r = parseLocalEdit("make it gold");
    expect(r!.patch.color).toBe("#d4af37");
    expect(r!.patch.metalness).toBeGreaterThan(0.5);
  });

  it("handles 'make it rusted metal'", () => {
    const r = parseLocalEdit("make it rusted metal");
    expect(r).not.toBeNull();
    expect(r!.patch.roughness).toBeGreaterThan(0.5);
  });

  it("catches terse chip phrases without an opener", () => {
    expect(parseLocalEdit("matte black")).not.toBeNull();
    expect(parseLocalEdit("chrome")).not.toBeNull();
  });

  it("parses relative scale", () => {
    expect(parseLocalEdit("make it bigger")!.scaleFactor).toBeGreaterThan(1);
    expect(parseLocalEdit("make it much smaller")!.scaleFactor).toBeLessThan(0.7);
  });

  it("parses a glow edit into an emissive patch", () => {
    const r = parseLocalEdit("make it glow red");
    expect(r!.patch.emissive).toBeTruthy();
    expect(r!.patch.emissiveIntensity).toBeGreaterThan(0);
    expect(r!.patch.color).toBe("#c0202a");
  });

  // ── Must fall through to the pipeline ──────────────────────────────────────
  it("returns null for structural edits", () => {
    expect(parseLocalEdit("add a convertible top")).toBeNull();
    expect(parseLocalEdit("make it lowpoly")).toBeNull();
    expect(parseLocalEdit("add racing stripes")).toBeNull();
    expect(parseLocalEdit("remove the wheels")).toBeNull();
  });

  it("does not hijack new-object prompts that merely contain a color", () => {
    expect(parseLocalEdit("a red sports car")).toBeNull();
    expect(parseLocalEdit("a small blue ceramic vase on a table")).toBeNull();
  });

  it("returns null for a full restyle it can't do locally", () => {
    expect(parseLocalEdit("make it cyberpunk style")).toBeNull();
    expect(parseLocalEdit("make it a vintage car")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(parseLocalEdit("")).toBeNull();
    expect(parseLocalEdit("   ")).toBeNull();
  });
});

describe("classifyEditIntent — paid-regen guard", () => {
  it("routes free material edits to the local path", () => {
    expect(classifyEditIntent("make it blue").kind).toBe("local");
    expect(classifyEditIntent("make it bigger").kind).toBe("local");
    expect(classifyEditIntent("chrome").kind).toBe("local");
  });

  // The bug that shipped a surprise new lamp: a cut-off voice phrase.
  it("flags contentless edit openers as contentless (never regenerates)", () => {
    expect(classifyEditIntent("make it").kind).toBe("contentless");
    expect(classifyEditIntent("change this").kind).toBe("contentless");
    expect(classifyEditIntent("turn it").kind).toBe("contentless");
    expect(classifyEditIntent("make it a").kind).toBe("contentless");
    expect(classifyEditIntent("").kind).toBe("contentless");
    expect(classifyEditIntent("   ").kind).toBe("contentless");
  });

  it("flags substantive edits of the active object as regen (needs confirm)", () => {
    expect(classifyEditIntent("make it a convertible").kind).toBe("regen");
    expect(classifyEditIntent("add a handle").kind).toBe("regen");
    expect(classifyEditIntent("make it a vintage car").kind).toBe("regen");
    expect(classifyEditIntent("attach a lid").kind).toBe("regen");
    expect(classifyEditIntent("make it cyberpunk style").kind).toBe("regen");
  });

  it("treats a bare noun phrase as a new object, not an edit", () => {
    expect(classifyEditIntent("a red sports car").kind).toBe("new");
    expect(classifyEditIntent("a ceramic coffee mug").kind).toBe("new");
  });
});

describe("classifyEditIntent — restyle keeps the geometry", () => {
  it("routes surface-only material/pattern changes to restyle", () => {
    expect(classifyEditIntent("make it look like walnut wood").kind).toBe("restyle");
    expect(classifyEditIntent("give it a floral pattern").kind).toBe("restyle");
    expect(classifyEditIntent("make it marble").kind).toBe("restyle");
    expect(classifyEditIntent("make it look more realistic").kind).toBe("restyle");
    expect(classifyEditIntent("retexture it as weathered concrete").kind).toBe("restyle");
  });

  it("keeps structural requests as regen even with surface words", () => {
    expect(classifyEditIntent("add a wooden handle").kind).toBe("regen");
    expect(classifyEditIntent("make it a convertible").kind).toBe("regen");
    expect(classifyEditIntent("make it cyberpunk style").kind).toBe("regen");
  });

  it("leaves flat colour/finish edits local and new objects new", () => {
    expect(classifyEditIntent("make it matte black").kind).toBe("local");
    expect(classifyEditIntent("a marble statue").kind).toBe("new");
  });
});

