"""Three fixed CPU preview views for trusted local reconstructed GLB output."""
import argparse
import json
import math
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'blender_worker'))
from process_asset import validate_input
from compare_renders import load, render
from mathutils import Vector
parser = argparse.ArgumentParser()
parser.add_argument('--input', required=True)
parser.add_argument('--output-dir', required=True)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
source, output = Path(args.input).resolve(), Path(args.output_dir).resolve()
source_hash = validate_input(source)
output.mkdir(parents=True, exist_ok=False)
objects = load(source)
corners = [o.matrix_world @ Vector(c) for o in objects for c in o.bound_box]
low = Vector(tuple(min(c[i] for c in corners) for i in range(3)))
high = Vector(tuple(max(c[i] for c in corners) for i in range(3)))
center, radius = (low + high) / 2, (high - low).length / 2
if not math.isfinite(radius) or radius <= 0:
    raise ValueError('Invalid geometry bounds')
for i, angle in enumerate((0.3, 2.4, 4.5)):
    render(source, output / f'view-{i}.png', center, radius, angle)
(output / 'preview.json').write_text(json.dumps(dict(source_sha256=source_hash,
    bounds=[list(low), list(high)], views=3, renderer='Cycles CPU', samples=16,
    resolution=[256,256], note='Unregistered previews, not photo-fidelity measurement'), indent=2)+'\n')
