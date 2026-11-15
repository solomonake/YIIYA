"""Registered training-view diagnostic for trusted local GLB; never auto-promotes.

Blender --background --factory-startup --disable-autoexec --python-exit-code 1
--python render_registered.py -- --model ... --calibration ... --registration ...
--photos ... --output-dir NEW_DIRECTORY
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import time
import bpy
import numpy as np
from mathutils import Matrix, Vector
from bpy_extras.object_utils import world_to_camera_view


def main():
    p = argparse.ArgumentParser()
    for key in ('model', 'calibration', 'registration', 'photos', 'output-dir'):
        p.add_argument('--'+key, type=Path, required=True)
    args = p.parse_args(sys.argv[sys.argv.index('--')+1:])
    started = time.monotonic()
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent/'blender_worker'))
    from process_asset import validate_input
    digest = validate_input(args.model)
    reg = json.loads(args.registration.read_text())
    scale, rot, trans = float(reg['scale']), np.array(reg['rotation']), np.array(reg['translation'])
    if scale <= 0 or not np.isfinite(scale) or rot.shape != (3,3) or trans.shape != (3,):
        raise ValueError('Invalid registration')
    if not np.allclose(rot.T@rot, np.eye(3), atol=1e-6) or not np.isclose(np.linalg.det(rot), 1):
        raise ValueError('Registration must be proper rotation')
    # USD/glTF Y-up -> Blender Z-up, applied equally to model and camera frames.
    basis = np.array([[1.,0,0],[0,0,-1],[0,1,0]])
    cv_to_blender = np.diag([1.,-1,-1])
    rows = {}
    for line in args.calibration.read_text().splitlines()[1:]:
        a = line.split()
        if not a: continue
        if len(a) != 22 or Path(a[0]).name != a[0]: raise ValueError('Invalid calibration')
        v = np.array([float(x) for x in a[1:]])
        if not np.isfinite(v).all(): raise ValueError('Nonfinite calibration')
        rows[a[0]] = (v[:9].reshape(3,3),v[9:18].reshape(3,3),v[18:])
    args.output_dir.mkdir(parents=True, exist_ok=False)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.model.resolve()))
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if not meshes or sum(len(o.data.vertices) for o in meshes)>2_000_000: raise ValueError('Invalid mesh')
    # Unlit texture avoids judging arbitrary evaluation lights as reconstruction error.
    for material in bpy.data.materials:
        if not material.use_nodes: continue
        nodes, links = material.node_tree.nodes, material.node_tree.links
        bsdf = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
        out = next((n for n in nodes if n.type == 'OUTPUT_MATERIAL'), None)
        if bsdf is None or out is None: continue
        emission = nodes.new('ShaderNodeEmission')
        color = bsdf.inputs['Base Color']
        if color.is_linked: links.new(color.links[0].from_socket, emission.inputs['Color'])
        else: emission.inputs['Color'].default_value = color.default_value
        links.new(emission.outputs[0], out.inputs['Surface'])
    scene = bpy.context.scene
    scene.render.engine='CYCLES'; scene.cycles.device='CPU'; scene.cycles.samples=8
    scene.cycles.seed=42; scene.cycles.use_denoising=False
    scene.render.threads_mode='FIXED'; scene.render.threads=2
    scene.render.film_transparent=True
    scene.view_settings.view_transform='Standard'; scene.view_settings.look='None'
    scene.render.resolution_percentage=100
    camdata=bpy.data.cameras.new('calibrated'); cam=bpy.data.objects.new('calibrated',camdata)
    scene.collection.objects.link(cam); scene.camera=cam
    camdata.sensor_fit='HORIZONTAL'; camdata.sensor_width=36
    camdata.clip_start=0.0001;camdata.clip_end=100
    points=np.array([list(o.matrix_world@v.co) for o in meshes for v in list(o.data.vertices)[::max(1,len(o.data.vertices)//100)]])
    results=[]
    for name in ('dinoR0001.png','dinoR0017.png','dinoR0033.png'):
        k,r,t=rows[name]
        photo=bpy.data.images.load(str((args.photos/name).resolve()),check_existing=False)
        w,h=photo.size
        if (w,h)!=(640,480): raise ValueError('Calibration expects original640x480 photos')
        if abs(k[0,1])>1e-9: raise ValueError('Skew unsupported')
        scene.render.resolution_x=w;scene.render.resolution_y=h
        aspect=float(k[0,0]/k[1,1])
        scene.render.pixel_aspect_x=max(1.,1/aspect);scene.render.pixel_aspect_y=max(1.,aspect)
        camdata.lens=float(k[0,0]*36/w)
        camdata.shift_x=float((w/2-k[0,2])/w)
        camdata.shift_y=float((k[1,2]-h/2)*aspect/w)
        center=-r.T@t
        native_center=rot.T@(center-trans)/scale
        matrix=np.eye(4);matrix[:3,:3]=basis@rot.T@r.T@cv_to_blender
        matrix[:3,3]=basis@native_center
        cam.matrix_world=Matrix(matrix.tolist());bpy.context.view_layer.update()
        target=scale*((points@basis)@rot.T)+trans
        projected=(target@r.T+t)@k.T
        expected=projected[:,:2]/projected[:,2:]
        actual=np.array([[q.x*w,(1-q.y)*h] for q in [world_to_camera_view(scene,cam,Vector(x)) for x in points]])
        residual=float(np.max(np.linalg.norm(actual-expected,axis=1)))
        if not np.isfinite(residual) or residual>0.02: raise ValueError(f'Projection mismatch {residual}px')
        scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
        scene.render.filepath=str((args.output_dir/name).resolve())
        bpy.ops.render.render(write_still=True)
        results.append(dict(source_file=name,projection_max_error_pixels=residual,
                            source_sha256=hashlib.sha256((args.photos/name).read_bytes()).hexdigest()))
        bpy.data.images.remove(photo)
    report=dict(evaluator='registered-render-v1',model_sha256=digest,views=results,
                elapsed_seconds=round(time.monotonic()-started,3),automatic_promotion=False,
                photo_fidelity='pending_visual_alignment_and_reference_masks',
                limitation='Training views; all48 photos used in reconstruction. Registration residual affects alignment.',
                rendering='Unlit texture, Cycles CPU8samples,640x480; no target-pixel fitting')
    (args.output_dir/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report))

if __name__=='__main__': main()
