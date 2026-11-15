import unittest
from run_experiment import combine


class ExperimentTests(unittest.TestCase):
    def test_visual_regression_vetoes_positive_topology_signal(self):
        result = combine(dict(decision="needs_visual_review", reward_signal=0.2),
                         dict(decision="reject", reward_signal=-0.1))
        self.assertEqual(result["decision"], "reject")
        self.assertEqual(result["reward_signals"]["topology"], 0.2)
        self.assertFalse(result["automatic_promotion"])

    def test_both_pass_still_requires_review(self):
        result = combine(dict(decision="needs_visual_review", reward_signal=0),
                         dict(decision="needs_visual_review", reward_signal=0))
        self.assertEqual(result["decision"], "needs_visual_review")
        self.assertEqual(result["photo_fidelity"], "not_evaluated")

    def test_missing_evidence_rejects(self):
        self.assertEqual(combine({}, {})["decision"], "reject")


if __name__ == "__main__":
    unittest.main()
