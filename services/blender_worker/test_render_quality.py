import unittest
from render_quality import assess_views


class RenderQualityTests(unittest.TestCase):
    def test_identical_renders_do_not_claim_improvement(self):
        result = assess_views([dict(eligible=True, silhouette_iou=1, foreground_rgb_mae=0)])
        self.assertEqual(result["reward_signal"], 0)
        self.assertEqual(result["decision"], "needs_visual_review")
        self.assertFalse(result["automatic_promotion"])

    def test_color_regression_rejects_with_unchanged_silhouette(self):
        result = assess_views([dict(eligible=True, silhouette_iou=1, foreground_rgb_mae=0.2)])
        self.assertEqual(result["reward_signal"], -0.2)
        self.assertEqual(result["decision"], "reject")

    def test_one_bad_view_cannot_be_averaged_away(self):
        views = [dict(eligible=True, silhouette_iou=1, foreground_rgb_mae=0)] * 99
        result = assess_views(views + [dict(eligible=True, silhouette_iou=0.9, foreground_rgb_mae=0)])
        self.assertGreater(result["reward"], 0.99)
        self.assertEqual(result["decision"], "reject")

    def test_missing_or_nonfinite_metrics_fail(self):
        for views in ([], [{}], [dict(eligible=True, silhouette_iou=1, foreground_rgb_mae=float("nan"))]):
            self.assertFalse(assess_views(views)["eligible"])


if __name__ == "__main__":
    unittest.main()
