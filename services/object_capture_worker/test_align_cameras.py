import unittest
import numpy as np
from align_cameras import fit_similarity, quaternion_matrix

class CameraRegistrationTests(unittest.TestCase):
    def test_recovers_known_similarity(self):
        x=np.random.default_rng(7).normal(size=(24,3))
        r=quaternion_matrix([0,0,np.sin(.3),np.cos(.3)])
        y=2.3*x@r.T+np.array([1,-4,2])
        scale,rotation,translation=fit_similarity(x,y)
        np.testing.assert_allclose(scale,2.3,atol=1e-10)
        np.testing.assert_allclose(rotation,r,atol=1e-10)
        np.testing.assert_allclose(translation,[1,-4,2],atol=1e-10)

    def test_collinear_trajectory_rejected(self):
        x=np.array([[i,0,0] for i in range(8)])
        with self.assertRaises(ValueError):fit_similarity(x,x)

    def test_wrong_correspondence_has_large_residual(self):
        x=np.random.default_rng(7).normal(size=(24,3));y=x[np.random.default_rng(42).permutation(24)]
        scale,r,t=fit_similarity(x,y)
        self.assertGreater(np.sqrt(np.mean(np.sum((scale*x@r.T+t-y)**2,axis=1))),.5)

if __name__=='__main__':unittest.main()
