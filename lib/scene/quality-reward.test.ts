import { describe, expect, it } from "vitest";
import type { GlbGeometry } from "./glb-inspect";
import { compareQualityRewards, evaluateQualityReward, parseQualityReward } from "./quality-reward";

const mesh: GlbGeometry = {
  triangles: 1000, vertices: 600, meshes: 1, primitives: 1, nodes: 1,
  materials: 1, textures: 1, hasUvs: true, hasNormals: true, hasVertexColors: false,
  bounds: { min: [0, 0, 0], max: [1, 1, 1], size: [1, 1, 1], center: [0.5, 0.5, 0.5], maxDimension: 1 },
  pivotOffsetRatio: 0.5, restsOnGround: true, compression: "none"
};

describe("quality reward", () => {
  it("roundtrips current reports and ignores legacy or malformed persisted values", () => {
    const report = evaluateQualityReward(mesh, true);
    expect(parseQualityReward(JSON.parse(JSON.stringify(report)))).toEqual(report);
    for (const value of [undefined, null, {}, { ...report, reward: 200 }, { ...report, evaluator: "unknown" }]) {
      expect(parseQualityReward(value)).toBeUndefined();
    }
  });
  it("keeps unmeasured likeness unknown even at maximum metadata reward", () => {
    const result = evaluateQualityReward(mesh, true);
    expect(result.reward).toBe(1);
    expect(result.unknown).toContain("photo_fidelity");
    expect(compareQualityRewards(result, result).automaticallyPromote).toBe(false);
  });
  it.each([undefined, null, { ...mesh, triangles: 0 }, { ...mesh, vertices: NaN },
    { ...mesh, bounds: null }, { ...mesh, bounds: { ...mesh.bounds!, maxDimension: Infinity } }])(
    "assigns zero to missing or invalid geometry", value => {
      expect(evaluateQualityReward(value, true).reward).toBe(0);
    });
  it("never rewards a failed generation even with convincing metadata", () => {
    expect(evaluateQualityReward(mesh, false).reward).toBe(0);
  });
  it("records improvements without pretending they prove better reconstruction", () => {
    const before = evaluateQualityReward({ ...mesh, hasNormals: false }, true);
    const after = evaluateQualityReward(mesh, true);
    expect(compareQualityRewards(before, after)).toMatchObject({
      rewardSignal: 0.2, decision: "needs_visual_review", automaticallyPromote: false
    });
    expect(compareQualityRewards(after, before).decision).toBe("reject");
  });
  it("does not reward polygon inflation", () => {
    expect(evaluateQualityReward({ ...mesh, triangles: 1_000_000 }, true).reward)
      .toBeLessThan(evaluateQualityReward(mesh, true).reward);
  });
});
