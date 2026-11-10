"""Trusted local USD ASCII/GLB coordinate audit; not an untrusted upload parser."""
import argparse
import ast
import hashlib
import json
from pathlib import Path
import re
import struct
import numpy as np
from align_cameras import quaternion_matrix


def glb_world_positions(path):
    raw=path.read_bytes()
    magic,version,length=struct.unpack_from('<4sII',raw)
    if magic!=b'glTF' or version!=2 or length!=len(raw): raise ValueError('Invalid GLB')
    offset=12; doc=None; binary=None
    while offset<len(raw):
        size,kind=struct.unpack_from('<II',raw,offset);offset+=8
        chunk=raw[offset:offset+size];offset+=size
        if kind==0x4e4f534a:doc=json.loads(chunk)
        elif kind==0x004e4942:binary=chunk
    if doc is None or binary is None:raise ValueError('Missing GLB chunks')
    output=[]; visited=set()
    def visit(index,parent):
        if index in visited:raise ValueError('Repeated/cyclic scene node')
        visited.add(index);node=doc['nodes'][index]
        if 'matrix' in node:local=np.array(node['matrix']).reshape(4,4).T
        else:
            local=np.eye(4)
            local[:3,:3]=quaternion_matrix(node.get('rotation',[0,0,0,1]))@np.diag(node.get('scale',[1,1,1]))
            local[:3,3]=node.get('translation',[0,0,0])
        world=parent@local
        if 'skin' in node:raise ValueError('Skin unsupported')
        if 'mesh' in node:
            for primitive in doc['meshes'][node['mesh']]['primitives']:
                if 'targets' in primitive or primitive.get('extensions'):raise ValueError('Morph/compression unsupported')
                a=doc['accessors'][primitive['attributes']['POSITION']]
                if a['componentType']!=5126 or a['type']!='VEC3' or 'sparse' in a:raise ValueError('Unsupported position accessor')
                v=doc['bufferViews'][a['bufferView']]
                if v.get('buffer',0)!=0:raise ValueError('External buffer unsupported')
                stride=v.get('byteStride',12);start=v.get('byteOffset',0)+a.get('byteOffset',0)
                points=np.ndarray((a['count'],3),dtype='<f4',buffer=binary,offset=start,strides=(stride,4)).astype(float)
                output.append(points@world[:3,:3].T+world[:3,3])
        for child in node.get('children',[]):visit(child,world)
    for index in doc['scenes'][doc.get('scene',0)]['nodes']:visit(index,np.eye(4))
    if not output:raise ValueError('No positions')
    return np.concatenate(output)


def nearest_errors(a,b):
    return np.concatenate([np.sqrt(np.min(np.sum((a[i:i+128,None,:]-b[None,:,:])**2,axis=2),axis=1)) for i in range(0,len(a),128)])


def main():
    p=argparse.ArgumentParser();p.add_argument('--usd-ascii',type=Path,required=True);p.add_argument('--glb',type=Path,required=True);p.add_argument('--output',type=Path,required=True);args=p.parse_args()
    text=args.usd_ascii.read_text()
    if 'upAxis = "Y"' not in text or 'metersPerUnit = 1' not in text or 'xformOp:' in text:raise ValueError('Audit requires untransformed meter/Y-up USD')
    arrays=re.findall(r'point3f\[\] points = (\[[^\n]+\])',text)
    if len(arrays)!=1:raise ValueError('Audit requires one USD mesh')
    source=np.array(ast.literal_eval(arrays[0]),dtype=float);target=glb_world_positions(args.glb)
    if any(not np.isfinite(x).all() or len(x)>100000 for x in [source,target]):raise ValueError('Nonfinite/oversize data')
    forward,reverse=nearest_errors(source,target),nearest_errors(target,source)
    extent=float(np.linalg.norm(np.ptp(source,axis=0))); error=float(max(forward.max(),reverse.max()))
    result={'metric':'format-coordinate-preservation-v1','usd_vertex_count':len(source),'glb_vertex_count':len(target),
      'usd_bounds':[source.min(0).tolist(),source.max(0).tolist()],'glb_world_bounds':[target.min(0).tolist(),target.max(0).tolist()],
      'bidirectional_max_error_m':error,'error_fraction_diagonal':error/extent,'coordinate_preservation_pass':error/extent<1e-5,
      'glb_sha256':hashlib.sha256(args.glb.read_bytes()).hexdigest(),'usd_ascii_sha256':hashlib.sha256(args.usd_ascii.read_bytes()).hexdigest(),
      'fidelity_reward':None,'automatic_promotion':False,'limitation':'Checks conversion geometry only; does not establish mesh-to-pose alignment or photogrammetric accuracy.'}
    with args.output.open('x') as f:json.dump(result,f,indent=2,allow_nan=False)
    print(json.dumps(result,indent=2))

if __name__=='__main__':main()
