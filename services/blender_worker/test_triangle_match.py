import unittest
from triangle_match import match_triangles

TRI = ((0.123444999, 0., 0.), (1., 0., 0.), (0., 1., 0.))


class TriangleMatchTests(unittest.TestCase):
    def test_rounding_boundary_jitter_preserves_geometry(self):
        moved = ((0.123445001, 0., 0.), TRI[1], TRI[2])
        self.assertTrue(match_triangles([TRI], [moved])["geometry_equal"])

    def test_cyclic_vertex_and_triangle_order(self):
        other = tuple((x, y, z + 2) for x, y, z in TRI)
        self.assertTrue(match_triangles([TRI, other], [other[1:] + other[:1], TRI])["geometry_equal"])

    def test_winding_reversal_rejected(self):
        self.assertFalse(match_triangles([TRI], [TRI[::-1]])["geometry_equal"])

    def test_missing_and_duplicate_face_rejected(self):
        other = tuple((x, y, z + 2) for x, y, z in TRI)
        self.assertFalse(match_triangles([TRI, other], [TRI])["geometry_equal"])
        self.assertFalse(match_triangles([TRI, other], [TRI, TRI])["geometry_equal"])

    def test_deformation_rejected(self):
        moved = ((TRI[0][0] + 1e-4, 0., 0.), TRI[1], TRI[2])
        self.assertFalse(match_triangles([TRI], [moved])["geometry_equal"])

    def test_invalid_and_empty_fail_closed(self):
        for source in ([], [((float("nan"), 0, 0), TRI[1], TRI[2])]):
            with self.assertRaises(ValueError):
                match_triangles(source, source)

    def test_ambiguous_matching_uses_each_triangle_once(self):
        def shift(amount):
            return tuple((x + amount, y, z) for x, y, z in TRI)
        self.assertTrue(match_triangles([TRI, shift(0.9e-6)],
                                       [shift(0.4e-6), shift(-0.6e-6)])["geometry_equal"])

    def test_identical_duplicate_faces_preserved(self):
        self.assertTrue(match_triangles([TRI, TRI], [TRI, TRI])["geometry_equal"])


if __name__ == "__main__":
    unittest.main()
