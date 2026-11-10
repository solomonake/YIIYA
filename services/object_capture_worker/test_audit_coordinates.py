import json
import math
from pathlib import Path
import struct
import tempfile
import unittest
import numpy as np
from audit_coordinates import glb_world_positions, nearest_errors


class CoordinateAuditTests(unittest.TestCase):
    def load(self,nodes):
        points=np.array([[1,0,0],[0,1,0],[0,0,1]],dtype='<f4')
        doc={'asset':{'version':'2.0'},'buffers':[{'byteLength':points.nbytes}],
             'bufferViews':[{'buffer':0,'byteLength':points.nbytes}],
             'accessors':[{'bufferView':0,'componentType':5126,'count':3,'type':'VEC3'}],
             'meshes':[{'primitives':[{'attributes':{'POSITION':0}}]}],
             'nodes':nodes,'scenes':[{'nodes':[0]}],'scene':0}
        data=json.dumps(doc).encode();data+=b' '*((-len(data))%4)
        body=struct.pack('<II',len(data),0x4e4f534a)+data+struct.pack('<II',points.nbytes,0x004e4942)+points.tobytes()
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'test.glb';path.write_bytes(struct.pack('<4sII',b'glTF',2,12+len(body))+body)
            return glb_world_positions(path)

    def test_nested_trs_applies_scale_rotation_and_translation(self):
        points=self.load([{'translation':[10,20,30],'children':[1]},
                          {'mesh':0,'scale':[2,3,4],'rotation':[0,0,math.sqrt(.5),math.sqrt(.5)]}])
        np.testing.assert_allclose(points,[[10,22,30],[7,20,30],[10,20,34]],atol=1e-12)

    def test_column_major_matrix(self):
        points=self.load([{'mesh':0,'matrix':[1,0,0,0,0,1,0,0,0,0,1,0,4,5,6,1]}])
        np.testing.assert_allclose(points,[[5,5,6],[4,6,6],[4,5,7]])

    def test_uv_duplicates_do_not_hide_displaced_geometry(self):
        a=np.array([[0,0,0],[1,0,0]],dtype=float)
        b=np.array([[0,0,0],[0,0,0],[1,0,0]],dtype=float)
        self.assertEqual(nearest_errors(a,b).max(),0)
        self.assertEqual(nearest_errors(b,a).max(),0)
        b=np.vstack([b,[0,2,0]])
        self.assertEqual(nearest_errors(a,b).max(),0)
        self.assertEqual(nearest_errors(b,a).max(),2)

    def test_cycles_rejected(self):
        with self.assertRaisesRegex(ValueError,'Repeated/cyclic'):
            self.load([{'mesh':0,'children':[0]}])

if __name__=='__main__':unittest.main()
