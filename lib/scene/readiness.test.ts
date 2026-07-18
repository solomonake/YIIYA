import { describe, expect, it } from "vitest";

import type { GlbGeometry } from "@/lib/scene/glb-inspect";
import {
  destinationForTargetPlatform,
  evaluateReadiness,
  TRIANGLE_BUDGETS
} from "@/lib/scene/readiness";

function geometry(overrides: Partial<GlbGeometry> = {}): GlbGeometry {
  return {
    triangles: 20_000,
    vertices: 60_000,
    meshes: 1,
    primitives: 1,
    nodes: 1,
    materials: 1,
    textures: 1,
    hasUvs: true,
    hasNormals: true,
    hasVertexColors: false,
    bounds: {
      min: [-0.1, 0, -0.1],
      max: [0.1, 0.3, 0.1],
      size: [0.2, 0.3, 0.2],
      center: [0, 0.15, 0],
      maxDimension: 0.3
    },
    pivotOffsetRatio: 0.05,
    restsOnGround: true,
    compression: "none",
    ...overrides
  };
}

const brief = {
  destination: "portfolio" as const,
  qualityTargets: {
    topology: "preview" as const,
    texture: "pbr" as const,
    manufacturable: false,
    riggable: false,
    cadFriendly: false
  },
  dimensions: undefined
};

function find(checks: ReturnType<typeof evaluateReadiness>["checks"], label: string) {
  const check = checks.find((item) => item.label === label);
  if (!check) throw new Error(`missing check: ${label}`);
  return check;
}

describe("evaluateReadiness", () => {
  it("passes a clean mesh within budget", () => {
    const report = evaluateReadiness(geometry(), brief);

    expect(find(report.checks, "Triangle budget").status).toBe("ready");
    expect(find(report.checks, "UV presence").status).toBe("ready");
    expect(find(report.checks, "Shading normals").status).toBe("ready");
    expect(report.label).toBe("handoff");
    expect(report.score).toBeGreaterThanOrEqual(85);
  });

  it("flags a mesh over the destination triangle budget with a concrete fix", () => {
    const report = evaluateReadiness(
      geometry({ triangles: TRIANGLE_BUDGETS.ar * 3 }),
      { ...brief, destination: "ar" }
    );

    const check = find(report.checks, "Triangle budget");
    expect(check.status).toBe("needs-work");
    expect(check.detail).toMatch(/3\.0x over/);
    expect(check.fix).toMatch(/Decimate or remesh/);
  });

  it("applies a stricter budget to AR than to portfolio", () => {
    const tris = TRIANGLE_BUDGETS.ar + 1;

    expect(
      find(evaluateReadiness(geometry({ triangles: tris }), { ...brief, destination: "ar" }).checks, "Triangle budget")
        .status
    ).toBe("needs-work");

    expect(
      find(evaluateReadiness(geometry({ triangles: tris }), brief).checks, "Triangle budget").status
    ).toBe("ready");
  });

  it("flags missing UVs only when the brief wants textures", () => {
    const textured = evaluateReadiness(geometry({ hasUvs: false }), brief);
    expect(find(textured.checks, "UV presence").status).toBe("needs-work");

    const untextured = evaluateReadiness(geometry({ hasUvs: false }), {
      ...brief,
      qualityTargets: { ...brief.qualityTargets, texture: "none" }
    });
    expect(find(untextured.checks, "UV presence").status).toBe("ready");
  });

  it("detects a model authored at the wrong unit scale", () => {
    const tooBig = evaluateReadiness(
      geometry({
        bounds: {
          min: [0, 0, 0],
          max: [300, 300, 300],
          size: [300, 300, 300],
          center: [150, 150, 150],
          maxDimension: 300
        }
      }),
      brief
    );

    const check = find(tooBig.checks, "Unit and scale");
    expect(check.status).toBe("needs-work");
    expect(check.fix).toMatch(/Scale down/);
  });

  it("cross-checks real extents against the brief dimensions", () => {
    // Brief asks for a 34cm lamp; the mesh came back 3.4m tall.
    const report = evaluateReadiness(
      geometry({
        bounds: {
          min: [0, 0, 0],
          max: [1, 3.4, 1],
          size: [1, 3.4, 1],
          center: [0.5, 1.7, 0.5],
          maxDimension: 3.4
        }
      }),
      { ...brief, dimensions: { unit: "cm", height: 34, width: 18, depth: 18 } }
    );

    const check = find(report.checks, "Unit and scale");
    expect(check.status).toBe("needs-work");
    expect(check.detail).toMatch(/3\.400m/);
    expect(check.fix).toMatch(/Rescale/);
  });

  it("accepts a model that matches the brief dimensions", () => {
    const report = evaluateReadiness(
      geometry({
        bounds: {
          min: [0, 0, 0],
          max: [0.18, 0.34, 0.18],
          size: [0.18, 0.34, 0.18],
          center: [0.09, 0.17, 0.09],
          maxDimension: 0.34
        }
      }),
      { ...brief, dimensions: { unit: "cm", height: 34 } }
    );

    expect(find(report.checks, "Unit and scale").status).toBe("ready");
  });

  it("flags an off-centre pivot", () => {
    const report = evaluateReadiness(geometry({ pivotOffsetRatio: 0.8 }), brief);
    const check = find(report.checks, "Pivot and origin");

    expect(check.status).toBe("needs-work");
    expect(check.detail).toMatch(/80%/);
  });

  it("never claims print watertightness it did not verify", () => {
    // Handoff truth: an unverifiable check stays `planned`, never `ready`.
    const report = evaluateReadiness(geometry(), { ...brief, destination: "print" });
    const check = find(report.checks, "Watertight solid");

    expect(check.status).toBe("planned");
    expect(check.detail).toMatch(/full-geometry pass/);
  });

  it("checks ground placement for AR", () => {
    const floating = evaluateReadiness(geometry({ restsOnGround: false }), {
      ...brief,
      destination: "ar"
    });
    const check = find(floating.checks, "Ground placement");

    expect(check.status).toBe("needs-work");
    expect(check.fix).toMatch(/y=0/);
  });

  it("marks a triangle mesh as unsuitable for a CAD destination", () => {
    const report = evaluateReadiness(geometry(), { ...brief, destination: "cad" });

    expect(find(report.checks, "CAD surface topology").status).toBe("needs-work");
  });

  it("fails a collapsed mesh and refuses to label it handoff-ready", () => {
    const report = evaluateReadiness(
      geometry({
        bounds: { min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0], center: [0, 0, 0], maxDimension: 0 }
      }),
      brief
    );

    expect(find(report.checks, "Bounding box").status).toBe("failed");
    expect(report.label).toBe("draft");
  });

  it("maps a print target onto the print destination", () => {
    // A print job must pick up the watertight/wall-thickness checks.
    const report = evaluateReadiness(geometry(), {
      ...brief,
      destination: destinationForTargetPlatform("print")
    });

    expect(destinationForTargetPlatform("print")).toBe("print");
    expect(report.checks.some((check) => check.label === "Watertight solid")).toBe(true);
  });

  it("maps engine and DCC targets onto animation, and unknown onto portfolio", () => {
    expect(destinationForTargetPlatform("unreal")).toBe("animation");
    expect(destinationForTargetPlatform("unity")).toBe("animation");
    expect(destinationForTargetPlatform("blender")).toBe("animation");
    expect(destinationForTargetPlatform("general")).toBe("portfolio");
    expect(destinationForTargetPlatform("something-else")).toBe("portfolio");
  });

  it("excludes unverifiable checks from the score", () => {
    // A print job has two `planned` checks; they must not drag the score down
    // or prop it up, since we never evaluated them.
    const portfolio = evaluateReadiness(geometry(), brief);
    const print = evaluateReadiness(geometry(), { ...brief, destination: "print" });

    expect(print.score).toBe(portfolio.score);
  });
});
