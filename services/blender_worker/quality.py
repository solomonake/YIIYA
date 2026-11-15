"""Versioned technical reward; deliberately independent of Blender for tests."""
import math

VERSION = "blender-topology-v1"


def evaluate(metrics):
    counts = [metrics.get(k) for k in (
        "vertices", "faces", "triangles", "degenerate_faces", "loose_vertices",
        "inconsistent_edges", "manifold_edges")]
    valid = all(isinstance(n, int) and not isinstance(n, bool) and n >= 0 for n in counts)
    valid = valid and metrics.get("finite_coordinates") is True
    valid = valid and metrics.get("vertices", 0) > 0 and metrics.get("faces", 0) > 0
    if not valid:
        return {"evaluator": VERSION, "reward": 0.0, "eligible": False,
                "unknown": ["photo_fidelity", "physical_scale", "unseen_surfaces"]}
    faces = metrics["faces"]
    vertices = metrics["vertices"]
    manifold = metrics["manifold_edges"]
    reward = (0.3 + 0.3 * (1 - min(1, metrics["degenerate_faces"] / faces))
              + 0.1 * (1 - min(1, metrics["loose_vertices"] / vertices))
              + 0.1 * (1 - min(1, metrics["inconsistent_edges"] / max(1, manifold)))
              + 0.1 * int(metrics["triangles"] <= 500_000)
              + 0.1 * int(metrics.get("has_appearance") is True))
    return {"evaluator": VERSION, "reward": round(reward, 6), "eligible": True,
            "unknown": ["photo_fidelity", "physical_scale", "unseen_surfaces",
                        "self_intersections", "printability"]}


def compare(before, after):
    a, b = evaluate(before), evaluate(after)
    delta = round(b["reward"] - a["reward"], 6)
    preserved = all(before.get(k) == after.get(k) for k in ("vertices", "faces", "triangles"))
    return {"before": a, "after": b, "reward_signal": delta,
            "decision": "needs_visual_review" if b["eligible"] and delta >= 0 and preserved else "reject",
            "automatic_promotion": False, "geometry_counts_preserved": preserved}
