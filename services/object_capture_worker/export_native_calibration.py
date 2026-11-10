"""Trusted local estimated pinhole cameras; ignores radial distortion, not ground truth."""
import json,sys
from pathlib import Path
import numpy as np
sys.path.insert(0,'services/object_capture_worker')
from align_cameras import quaternion_matrix
p=Path(sys.argv[1]);poses=json.loads((p/'camera-poses.json').read_text())['poses'];lines=[str(len(poses))]
for pose in poses:
 k=np.array(pose['intrinsics_columns']).T;r=np.diag([1.,-1,-1])@quaternion_matrix(pose['quaternion_xyzw']).T;t=-r@np.array(pose['translation'])
 lines.append(pose['source_file']+' '+' '.join(map(str,np.concatenate([k.flatten(),r.flatten(),t]))))
(p/'native-pinhole-calibration.txt').write_text('\n'.join(lines)+'\n')
(p/'native-identity-registration.json').write_text(json.dumps({'scale':1,'rotation':np.eye(3).tolist(),'translation':[0,0,0],'source':'native estimated poses and intrinsics; distortion ignored; not ground truth'}))
