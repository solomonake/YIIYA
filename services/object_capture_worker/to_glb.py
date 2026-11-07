"""Convert this worker's trusted local USDZ output with Blender; not an upload endpoint."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--input', required=True)
parser.add_argument('--output-dir', required=True)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
source, output = Path(args.input).resolve(), Path(args.output_dir).resolve()
if source.suffix != '.usdz' or source.stat().st_size > 100_000_000:
    raise ValueError('Expected a trusted generated USDZ under 100MB')
with zipfile.ZipFile(source) as archive:
    entries = archive.infolist()
    if len(entries) > 100 or sum(i.file_size for i in entries) > 100_000_000:
        raise ValueError('Archive limits exceeded')
    if any(Path(i.filename).is_absolute() or '..' in Path(i.filename).parts for i in entries):
        raise ValueError('Unsafe archive paths')
output.mkdir(parents=True, exist_ok=False)
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'blender_worker'))
from process_asset import metrics, validate_input
from quality import evaluate
import bpy
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.usd_import(filepath=str(source))
objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']
if not objects or sum(len(o.data.vertices) for o in objects) > 2_000_000:
    raise ValueError('Missing mesh or vertex limit exceeded')
before = metrics(objects)
images = []
for img in bpy.data.images:
    if img.type != 'IMAGE':
        continue
    images.append(dict(name=img.name, width=img.size[0], height=img.size[1], has_data=img.has_data))
    if img.has_data:
        img.pack()
asset = output / 'model.glb'
bpy.ops.export_scene.gltf(filepath=str(asset), export_format='GLB', export_normals=True)
asset_hash = validate_input(asset)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(asset))
after = metrics([o for o in bpy.context.scene.objects if o.type == 'MESH'])
report = dict(source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(), glb_sha256=asset_hash,
              blender_version=bpy.app.version_string, before=before, after=after,
              imported_images=images, reward=evaluate(after), photo_fidelity='not_evaluated',
              automatic_promotion=False, limitations=['Trusted local generated input only',
              'Topology reward is not measured geometric accuracy or photo fidelity'])
(output / 'report.json').write_text(json.dumps(report, indent=2, allow_nan=False)+'\n')
print(json.dumps(report))
