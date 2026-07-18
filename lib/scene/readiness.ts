/**
 * Destination-aware readiness scoring.
 *
 * Converts raw GLB geometry facts into the validation checks the handoff layer
 * shows the user. The guiding rule from YIIYA.md is "handoff truth matters":
 * a check only reports `ready` when we actually verified it. Anything we cannot
 * determine from the glTF JSON chunk stays `planned` with a reason, rather than
 * being dressed up as a pass.
 */
import type { AssetBrief } from "@/lib/asset-compiler";
import type { GlbGeometry } from "@/lib/scene/glb-inspect";

export type ReadinessStatus = "ready" | "needs-work" | "planned" | "failed";

export type ReadinessCheck = {
  label: string;
  status: ReadinessStatus;
  detail?: string;
  /** Concrete next step when the check is not `ready`. */
  fix?: string;
};

export type ReadinessReport = {
  /** 0-100, weighted over the checks we could actually evaluate. */
  score: number;
  label: "draft" | "preview" | "handoff";
  checks: ReadinessCheck[];
};

export type AssetDestination = AssetBrief["destination"];

/**
 * Triangle ceilings per destination.
 *
 * `ar` follows Apple's AR Quick Look guidance (~100k triangles for smooth
 * mobile playback). The others are practical working limits before a
 * downstream decimate/remesh pass becomes necessary.
 */
export const TRIANGLE_BUDGETS: Record<AssetDestination, number> = {
  ar: 100_000,
  animation: 500_000,
  print: 1_000_000,
  cad: 250_000,
  portfolio: 1_000_000
};

/** Pivot further than this fraction of the model size reads as off-centre. */
const PIVOT_TOLERANCE = 0.12;

/** glTF units are metres. Outside this range the authoring scale is suspect. */
const PLAUSIBLE_MIN_METRES = 0.005;
const PLAUSIBLE_MAX_METRES = 50;

/**
 * Map a ThreeDBrief `targetPlatform` onto a readiness destination.
 *
 * Takes a plain string rather than importing the pipeline's type, so this
 * module stays free of a dependency on its own caller.
 */
export function destinationForTargetPlatform(platform: string): AssetDestination {
  switch (platform) {
    case "print":
      return "print";
    // Realtime engines and DCC tools all care about rig/animation readiness.
    case "unreal":
    case "unity":
    case "blender":
      return "animation";
    default:
      return "portfolio";
  }
}

export function evaluateReadiness(
  geometry: GlbGeometry,
  brief: Pick<AssetBrief, "destination" | "qualityTargets" | "dimensions">
): ReadinessReport {
  const checks: ReadinessCheck[] = [
    triangleBudgetCheck(geometry, brief.destination),
    boundsCheck(geometry),
    unitScaleCheck(geometry, brief),
    uvCheck(geometry, brief),
    normalsCheck(geometry),
    pivotCheck(geometry),
    materialCheck(geometry),
    ...destinationChecks(geometry, brief.destination)
  ];

  return { ...scoreOf(checks), checks };
}

function triangleBudgetCheck(geometry: GlbGeometry, destination: AssetDestination): ReadinessCheck {
  const budget = TRIANGLE_BUDGETS[destination] ?? TRIANGLE_BUDGETS.portfolio;
  const tris = geometry.triangles;
  const pretty = `${tris.toLocaleString()} tris`;

  if (tris > budget) {
    const factor = (tris / budget).toFixed(1);
    return {
      label: "Triangle budget",
      status: "needs-work",
      detail: `${pretty}, ${factor}x over the ${budget.toLocaleString()} budget for ${destination}.`,
      fix: `Decimate or remesh to about ${budget.toLocaleString()} triangles before handoff.`
    };
  }

  return {
    label: "Triangle budget",
    status: "ready",
    detail: `${pretty}, within the ${budget.toLocaleString()} budget for ${destination}.`
  };
}

function boundsCheck(geometry: GlbGeometry): ReadinessCheck {
  if (!geometry.bounds) {
    return {
      label: "Bounding box",
      status: "planned",
      detail: "POSITION accessors did not expose min/max, so extents are unknown.",
      fix: "Re-export with accessor bounds, or run a full-geometry pass."
    };
  }

  const [w, h, d] = geometry.bounds.size;
  const fmt = (n: number) => `${n.toFixed(3)}m`;

  if (geometry.bounds.maxDimension <= 0) {
    return {
      label: "Bounding box",
      status: "failed",
      detail: "Model has zero extent.",
      fix: "Regenerate: the provider returned collapsed geometry."
    };
  }

  return {
    label: "Bounding box",
    status: "ready",
    detail: `${fmt(w)} x ${fmt(h)} x ${fmt(d)}`
  };
}

/**
 * Cross-check the model's real extents against the brief's stated dimensions.
 * Catches the classic "model is 1000x too large because the provider authored
 * in millimetres" failure before it reaches a slicer or CAD import.
 */
function unitScaleCheck(
  geometry: GlbGeometry,
  brief: Pick<AssetBrief, "dimensions">
): ReadinessCheck {
  const bounds = geometry.bounds;
  if (!bounds) {
    return {
      label: "Unit and scale",
      status: "planned",
      detail: "Needs a bounding box to infer units."
    };
  }

  const max = bounds.maxDimension;

  if (max < PLAUSIBLE_MIN_METRES) {
    return {
      label: "Unit and scale",
      status: "needs-work",
      detail: `Largest dimension is ${max.toFixed(4)}m, smaller than a plausible object.`,
      fix: "Model may be authored in metres but exported at millimetre scale. Scale up before import."
    };
  }

  if (max > PLAUSIBLE_MAX_METRES) {
    return {
      label: "Unit and scale",
      status: "needs-work",
      detail: `Largest dimension is ${max.toFixed(1)}m, larger than a plausible object.`,
      fix: "Model is likely authored in millimetres or centimetres. Scale down before import."
    };
  }

  const expected = expectedMetres(brief.dimensions);
  if (expected !== null && expected > 0) {
    const ratio = max / expected;
    if (ratio > 4 || ratio < 0.25) {
      return {
        label: "Unit and scale",
        status: "needs-work",
        detail: `Model measures ${max.toFixed(3)}m but the brief asked for about ${expected.toFixed(3)}m.`,
        fix: `Rescale by roughly ${(1 / ratio).toFixed(2)}x to match the requested dimensions.`
      };
    }
    return {
      label: "Unit and scale",
      status: "ready",
      detail: `${max.toFixed(3)}m, consistent with the requested ${expected.toFixed(3)}m.`
    };
  }

  return {
    label: "Unit and scale",
    status: "ready",
    detail: `${max.toFixed(3)}m, a plausible real-world scale.`
  };
}

/** Largest brief dimension, normalised to metres. */
function expectedMetres(dimensions: AssetBrief["dimensions"]): number | null {
  if (!dimensions) return null;

  const factor = dimensions.unit === "mm" ? 0.001 : dimensions.unit === "cm" ? 0.01 : 0.0254;
  const candidates = [
    dimensions.width,
    dimensions.height,
    dimensions.depth,
    dimensions.diameter
  ].filter((value): value is number => typeof value === "number" && value > 0);

  if (candidates.length === 0) return null;
  return Math.max(...candidates) * factor;
}

function uvCheck(
  geometry: GlbGeometry,
  brief: Pick<AssetBrief, "qualityTargets">
): ReadinessCheck {
  const wantsTexture = brief.qualityTargets?.texture !== "none";

  if (geometry.hasUvs) {
    return { label: "UV presence", status: "ready", detail: "TEXCOORD_0 present on mesh primitives." };
  }

  if (!wantsTexture) {
    return {
      label: "UV presence",
      status: "ready",
      detail: "No UVs, which matches the untextured quality target."
    };
  }

  return {
    label: "UV presence",
    status: "needs-work",
    detail: "No TEXCOORD_0 attribute, so textures cannot bind.",
    fix: "Run a UV unwrap before texturing, or request a textured provider tier."
  };
}

function normalsCheck(geometry: GlbGeometry): ReadinessCheck {
  return geometry.hasNormals
    ? { label: "Shading normals", status: "ready", detail: "NORMAL attribute present." }
    : {
        label: "Shading normals",
        status: "needs-work",
        detail: "No NORMAL attribute; renderers will fall back to flat shading.",
        fix: "Generate smooth normals on import."
      };
}

function pivotCheck(geometry: GlbGeometry): ReadinessCheck {
  if (geometry.pivotOffsetRatio === null) {
    return { label: "Pivot and origin", status: "planned", detail: "Needs a bounding box." };
  }

  if (geometry.pivotOffsetRatio <= PIVOT_TOLERANCE) {
    return {
      label: "Pivot and origin",
      status: "ready",
      detail: "Origin sits near the model centre."
    };
  }

  return {
    label: "Pivot and origin",
    status: "needs-work",
    detail: `Origin is offset by ${(geometry.pivotOffsetRatio * 100).toFixed(0)}% of the model size.`,
    fix: "Recentre the origin, or set it to the base for turntable and placement work."
  };
}

function materialCheck(geometry: GlbGeometry): ReadinessCheck {
  if (geometry.materials === 0) {
    return {
      label: "Materials",
      status: "needs-work",
      detail: "Mesh has no materials; it will render untextured.",
      fix: "Assign a standard material, or use the vertex colours if present."
    };
  }

  return {
    label: "Materials",
    status: "ready",
    detail: `${geometry.materials} material${geometry.materials === 1 ? "" : "s"}, ${geometry.textures} texture${geometry.textures === 1 ? "" : "s"}.`
  };
}

function destinationChecks(
  geometry: GlbGeometry,
  destination: AssetDestination
): ReadinessCheck[] {
  switch (destination) {
    case "print":
      return [
        {
          // Manifold/watertight testing needs the full binary chunk, not the
          // JSON header. Saying "ready" here would be exactly the kind of
          // false handoff signal the product promises to avoid.
          label: "Watertight solid",
          status: "planned",
          detail: "Manifold testing requires a full-geometry pass, which has not run.",
          fix: "Run a mesh-repair pass before slicing."
        },
        {
          label: "Wall thickness",
          status: "planned",
          detail: "Not measurable from mesh headers."
        }
      ];

    case "animation":
      return [
        {
          label: "Rig readiness",
          status: geometry.nodes > 1 ? "needs-work" : "planned",
          detail:
            geometry.nodes > 1
              ? `${geometry.nodes} nodes present, but no skinning data was found.`
              : "Single-node mesh; rigging has not been attempted.",
          fix: "Split parts and add an armature in Blender before animating."
        }
      ];

    case "cad":
      return [
        {
          label: "CAD surface topology",
          status: "needs-work",
          detail: "This is a triangle mesh, not a parametric solid.",
          fix: "Use the CAD lane for STEP output, or retopologise before a CAD import."
        }
      ];

    case "ar":
      return [
        {
          label: "Ground placement",
          status:
            geometry.restsOnGround === null
              ? "planned"
              : geometry.restsOnGround
                ? "ready"
                : "needs-work",
          detail:
            geometry.restsOnGround === false
              ? "Model does not rest on the y=0 plane; it will float or sink when placed."
              : undefined,
          fix: geometry.restsOnGround === false ? "Translate the mesh so its base sits at y=0." : undefined
        }
      ];

    default:
      return [];
  }
}

function scoreOf(checks: ReadinessCheck[]): { score: number; label: ReadinessReport["label"] } {
  // Only checks we could actually evaluate count toward the score. `planned`
  // checks are excluded so unverifiable work never inflates the number.
  const scored = checks.filter((check) => check.status !== "planned");

  if (scored.length === 0) {
    return { score: 0, label: "draft" };
  }

  const earned = scored.reduce((total, check) => {
    if (check.status === "ready") return total + 1;
    if (check.status === "needs-work") return total + 0.4;
    return total; // failed
  }, 0);

  const score = Math.round((earned / scored.length) * 100);
  const hasFailure = checks.some((check) => check.status === "failed");

  const label: ReadinessReport["label"] = hasFailure
    ? "draft"
    : score >= 85
      ? "handoff"
      : score >= 55
        ? "preview"
        : "draft";

  return { score, label };
}
