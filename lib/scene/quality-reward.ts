import type { GlbGeometry } from "./glb-inspect";
import { z } from "zod";

/** A fixed engineering rubric, NOT a trained visual reward model. */
export const QUALITY_EVALUATOR_VERSION = "mesh-metadata-v1";

export type QualityReward = {
  evaluator: typeof QUALITY_EVALUATOR_VERSION;
  reward: number;
  eligible: boolean;
  checks: Array<{ name: string; passed: boolean; weight: number }>;
  unknown: string[];
};

export function parseQualityReward(value: unknown): QualityReward | undefined {
  const parsed = z.object({
    evaluator: z.literal(QUALITY_EVALUATOR_VERSION),
    reward: z.number().finite().min(0).max(1), eligible: z.boolean(),
    checks: z.array(z.object({ name: z.string().max(80), passed: z.boolean(),
      weight: z.number().finite().min(0).max(1) })).max(8),
    unknown: z.array(z.string().max(80)).max(20)
  }).safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/** Metadata can establish basic usability, never photo likeness or manifoldness. */
export function evaluateQualityReward(
  geometry: GlbGeometry | null | undefined,
  success: boolean
): QualityReward {
  const finiteBounds = Boolean(geometry?.bounds &&
    [...geometry.bounds.min, ...geometry.bounds.max, ...geometry.bounds.size].every(Number.isFinite) &&
    geometry.bounds.size.every(n => n >= 0) &&
    Number.isFinite(geometry.bounds.maxDimension) && geometry.bounds.maxDimension > 0);
  const eligible = Boolean(success && geometry &&
    Number.isSafeInteger(geometry.triangles) && geometry.triangles > 0 &&
    Number.isSafeInteger(geometry.vertices) && geometry.vertices > 0 && finiteBounds);
  const checks = [
    { name: "usable_geometry_metadata", passed: eligible, weight: 0.5 },
    { name: "normal_attribute_present", passed: Boolean(geometry?.hasNormals), weight: 0.2 },
    { name: "appearance_metadata_present", passed: Boolean(geometry &&
      (geometry.hasVertexColors || (geometry.materials > 0 && geometry.textures > 0 && geometry.hasUvs))), weight: 0.2 },
    { name: "bounded_preview_complexity", passed: Boolean(geometry && geometry.triangles <= 500_000), weight: 0.1 }
  ];
  return {
    evaluator: QUALITY_EVALUATOR_VERSION,
    reward: eligible ? Number(checks.reduce((sum, c) => sum + (c.passed ? c.weight : 0), 0).toFixed(4)) : 0,
    eligible,
    checks,
    unknown: ["photo_fidelity", "unseen_surface_accuracy", "watertightness", "texture_quality", "physical_scale", "full_binary_validity"]
  };
}

/** No automatic promotion from a score alone: more attractive metadata can be fabricated. */
export function compareQualityRewards(before: QualityReward, after: QualityReward) {
  const comparable = before.evaluator === after.evaluator;
  return {
    comparable,
    rewardSignal: comparable ? Number((after.reward - before.reward).toFixed(4)) : null,
    decision: !comparable ? "incomparable" : !after.eligible || after.reward < before.reward
      ? "reject" : "needs_visual_review",
    automaticallyPromote: false as const
  };
}
