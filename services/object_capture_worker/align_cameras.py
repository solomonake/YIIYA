"""Register estimated camera centers to published calibration; not mesh fidelity."""
import argparse
import json
from pathlib import Path
import numpy as np


def fit_similarity(source, target):
    source, target = np.asarray(source, dtype=float), np.asarray(target, dtype=float)
    if source.shape != target.shape or source.ndim != 2 or source.shape[1] != 3 or len(source) < 4:
        raise ValueError('Need at least four corresponding 3D centers')
    if not np.isfinite(source).all() or not np.isfinite(target).all():
        raise ValueError('Nonfinite centers')
    x, y = source-source.mean(0), target-target.mean(0)
    if np.linalg.matrix_rank(x) < 2 or np.linalg.matrix_rank(y) < 2:
        raise ValueError('Degenerate camera trajectory')
    u, singular, vt = np.linalg.svd(x.T@y)
    signs = np.ones(3);signs[-1] = np.linalg.det(vt.T@u.T)
    rotation = vt.T@np.diag(signs)@u.T
    scale = float(np.dot(singular, signs)/np.sum(x*x))
    if not np.isfinite(scale) or scale <= 0:
        raise ValueError('Invalid scale')
    translation = target.mean(0)-scale*rotation@source.mean(0)
    return scale, rotation, translation


def quaternion_matrix(q):
    q=np.asarray(q,dtype=float)
    if q.shape != (4,) or not np.isfinite(q).all() or abs(np.linalg.norm(q)-1)>0.01:
        raise ValueError('Invalid quaternion')
    x,y,z,w=q/np.linalg.norm(q)
    return np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
                     [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
                     [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--poses',type=Path,required=True)
    parser.add_argument('--calibration',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    calibration={}
    for line in args.calibration.read_text().splitlines()[1:]:
        parts=line.split()
        if not parts:continue
        if len(parts)!=22:raise ValueError('Unexpected calibration row')
        values=np.array([float(v) for v in parts[1:]])
        k,r,t=values[:9].reshape(3,3),values[9:18].reshape(3,3),values[18:]
        calibration[parts[0]]={'center':-r.T@t,'rotation':r,'intrinsics':k}
    records=json.loads(args.poses.read_text())['poses']
    names=[p['source_file'] for p in records]
    if len(set(names))!=len(names) or any(n not in calibration for n in names):
        raise ValueError('Missing or duplicate source mapping')
    source=np.array([p['translation'] for p in records]);target=np.array([calibration[n]['center'] for n in names])
    validation=np.arange(len(names))%4==0;fit=~validation
    scale,rotation,translation=fit_similarity(source[fit],target[fit])
    errors=np.linalg.norm(scale*(source@rotation.T)+translation-target,axis=1)
    spread=float(np.sqrt(np.mean(np.sum((target-target.mean(0))**2,axis=1))))
    angular=[]
    for p in records:
        estimated=rotation@quaternion_matrix(p['quaternion_xyzw'])@np.array([0,0,-1.])
        actual=calibration[p['source_file']]['rotation'].T@np.array([0,0,1.])
        angular.append(float(np.degrees(np.arccos(np.clip(np.dot(estimated,actual),-1,1)))))
    result={'metric':'camera-registration-v1','source_count':len(names),'fit_count':int(fit.sum()),
            'validation_count':int(validation.sum()),'scale':scale,'rotation':rotation.tolist(),'translation':translation.tolist(),
            'center_rmse':float(np.sqrt(np.mean(errors**2))),
            'validation_center_rmse':float(np.sqrt(np.mean(errors[validation]**2))),
            'validation_rmse_fraction_camera_spread':float(np.sqrt(np.mean(errors[validation]**2))/spread),
            'mean_optical_axis_error_degrees':float(np.mean(angular)),
            'max_optical_axis_error_degrees':float(max(angular)),
            'photo_fidelity':'not_evaluated','automatic_promotion':False,
            'limitation':'Validation cameras excluded from registration fit only; all photos used in reconstruction. Not held-out reconstruction accuracy.',
            'per_view':[{'source_file':n,'center_error':float(e),'axis_error_degrees':a} for n,e,a in zip(names,errors,angular)]}
    with args.output.open('x') as f:json.dump(result,f,indent=2,allow_nan=False)
    print(json.dumps({k:v for k,v in result.items() if k not in ['per_view','rotation','translation']}))

if __name__=='__main__':main()
