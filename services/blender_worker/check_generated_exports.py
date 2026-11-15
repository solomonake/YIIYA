"""Reopen known local research exports; compare triangle geometry and bounds.
Run in Blender --background --factory-startup --disable-autoexec --python-exit-code 1.
No rendering, uploads, repair, or source mutation.
"""
import hashlib
import json
from pathlib import Path
import sys
from collections import Counter
import numpy as np
import bpy
from mathutils import Vector
sys.path.insert(0, str(Path(__file__).parent))
from triangle_match import match_triangles

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "outputs/delivery-round-005"
DIAGNOSE = "--diagnose" in sys.argv
manifest = json.loads((OUT / "export.json").read_text())
sources = {
    "glb": ROOT / manifest["source"],
    "obj": OUT / "dinosaur.obj",
    "stl": OUT / "dinosaur.stl",
}


def inspect(kind, source):
    raw = source.read_bytes()
    expected = manifest["source_sha256"] if kind == "glb" else manifest[kind]["sha256"]
    if hashlib.sha256(raw).hexdigest() != expected:
        raise ValueError("Artifact hash mismatch")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if kind == "glb":
        # Existing validator rejects external resources before Blender import.
        sys.path.insert(0, str(Path(__file__).parent))
        from process_asset import validate_input
        validate_input(source)
        bpy.ops.import_scene.gltf(filepath=str(source))
    elif kind == "obj":
        # This converter intentionally emits geometry only, without MTL/file references.
        if any(line.startswith(("mtllib ", "call ")) for line in raw.decode().splitlines()):
            raise ValueError("Unexpected external OBJ resource")
        bpy.ops.wm.obj_import(filepath=str(source), forward_axis="NEGATIVE_Z", up_axis="Y")
    else:
        bpy.ops.wm.stl_import(filepath=str(source), forward_axis="NEGATIVE_Z", up_axis="Y")
    objects = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    triangles = []
    for obj in objects:
        obj.data.calc_loop_triangles()
        world = [obj.matrix_world @ v.co for v in obj.data.vertices]
        for tri in obj.data.loop_triangles:
            triangles.append([list(world[i]) for i in tri.vertices])
    values = np.array(triangles, dtype=np.float64)
    if not len(triangles) or not np.isfinite(values).all():
        raise ValueError("Missing or nonfinite triangle geometry")
    if DIAGNOSE:
        with (OUT / (kind + "-triangles.npy")).open("xb") as file:
            np.save(file, values)
    # Cyclic rotation preserves winding. Quantization is explicit, not a visual score.
    fingerprints = Counter()
    for tri in values:
        vertices = [tuple(float(n) for n in row) for row in np.round(tri, 5)]
        fingerprints[min(tuple(vertices[i:] + vertices[:i]) for i in range(3))] += 1
    return {
        "file": source.name, "sha256": hashlib.sha256(raw).hexdigest(),
        "triangles": len(triangles), "finite_coordinates": True,
        "bounds": [values.min(axis=(0, 1)).tolist(), values.max(axis=(0, 1)).tolist()],
        "material_slots": sum(len(o.data.materials) for o in objects),
        "uv_layers": sum(len(o.data.uv_layers) for o in objects),
    }, fingerprints, values


records = {}
fingerprints = {}
coordinates = {}
for kind, source in sources.items():
    records[kind], fingerprints[kind], coordinates[kind] = inspect(kind, source)
comparisons = {}
for kind in ("obj", "stl"):
    delta = float(np.max(np.abs(np.array(records[kind]["bounds"]) - np.array(records["glb"]["bounds"]))))
    matching = fingerprints[kind] == fingerprints["glb"]
    oriented = match_triangles(coordinates["glb"], coordinates[kind], tolerance=1e-6)
    comparisons[kind] = {
        "triangle_count_equal": records[kind]["triangles"] == records["glb"]["triangles"],
        "oriented_triangles_equal_at_5_decimal_places": matching,
        "bounds_max_absolute_error": delta,
        "oriented_triangle_comparison": oriented,
        "geometry_gate": oriented["geometry_equal"] and delta <= 1e-6,
    }
report = {
    "round": "delivery-005", "blender_version": bpy.app.version_string,
    "coordinate_convention": "GLB Y-up; OBJ/STL imported with forward -Z, up Y",
    "records": records, "comparisons": comparisons,
    "export_reward": int(all(c["geometry_gate"] for c in comparisons.values())),
    "photo_fidelity_reward": None,
    "limitations": "One real generated asset. OBJ has UVs/normals but no material package; STL is geometry only with implicit units. No CAD, printability or live route claim.",
}
with (OUT / ("reimport-diagnostic-v2.json" if DIAGNOSE else "reimport-v2.json")).open("x") as file:
    json.dump(report, file, indent=2, allow_nan=False)
print(json.dumps(report))
if not report["export_reward"]:
    raise RuntimeError("Export geometry gate failed; inspect evidence before changing conversion")
