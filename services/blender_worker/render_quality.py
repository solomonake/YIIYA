"""Fixed source-preservation screen. Thresholds are not photo-fidelity calibration."""
import math

VERSION = "render-preservation-v1"


def assess_views(views):
    valid = bool(views) and all(
        view.get("eligible") is True
        and all(isinstance(view.get(key), (int, float))
                and not isinstance(view.get(key), bool)
                and math.isfinite(view[key]) and 0 <= view[key] <= 1
                for key in ("silhouette_iou", "foreground_rgb_mae"))
        for view in views)
    if not valid:
        return dict(evaluator=VERSION, eligible=False, reward=0.0, reward_signal=-1.0,
                    decision="reject", automatic_promotion=False)
    reward = sum(v["silhouette_iou"] * (1 - v["foreground_rgb_mae"]) for v in views) / len(views)
    passed = all(v["silhouette_iou"] >= 0.995 and v["foreground_rgb_mae"] <= 0.02 for v in views)
    return dict(evaluator=VERSION, eligible=True, reward=round(reward, 6),
                reward_signal=round(reward - 1, 6),
                decision="needs_visual_review" if passed else "reject",
                thresholds=dict(min_silhouette_iou=0.995, max_foreground_rgb_mae=0.02),
                automatic_promotion=False)
