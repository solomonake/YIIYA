import unittest
from quality import compare, evaluate


class QualityTests(unittest.TestCase):
    def setUp(self):
        self.metrics = dict(vertices=100, faces=100, triangles=100,
                            degenerate_faces=0, loose_vertices=0,
                            inconsistent_edges=20, manifold_edges=100,
                            finite_coordinates=True, has_appearance=True)

    def test_normal_repair_signal_never_promotes(self):
        result = compare(self.metrics, dict(self.metrics, inconsistent_edges=0))
        self.assertEqual(result["reward_signal"], 0.02)
        self.assertEqual(result["decision"], "needs_visual_review")
        self.assertFalse(result["automatic_promotion"])

    def test_missing_and_invalid_metrics_get_zero(self):
        for metrics in ({}, dict(self.metrics, finite_coordinates=False),
                        dict(self.metrics, faces=float("nan")), dict(self.metrics, faces=True)):
            self.assertEqual(evaluate(metrics)["reward"], 0)

    def test_geometry_loss_rejects_even_if_score_increases(self):
        result = compare(self.metrics, dict(self.metrics, faces=90, inconsistent_edges=0))
        self.assertGreater(result["reward_signal"], 0)
        self.assertEqual(result["decision"], "reject")

    def test_fidelity_stays_unknown(self):
        self.assertIn("photo_fidelity", evaluate(self.metrics)["unknown"])


if __name__ == "__main__":
    unittest.main()
