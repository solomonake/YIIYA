"""Run only inside a bounded Blender process. No HTTP server or remote fetching.

blender --background --factory-startup --disable-autoexec --python-exit-code 1 \
  --python services/blender_worker/process_asset.py -- --input capture.glb \
  --output-dir /tmp/yiiya-blender-run --repair-normals
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import struct
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parent))
from quality import compare

MAX_BYTES = 100 * 1024 * 1024


def validate_input(source):
    if source.suffix.lower() != ".glb" or not source.is_file():
        raise ValueError("Input must be a local GLB file")
    if source.stat().st_size > MAX_BYTES:
        raise ValueError("GLB exceeds 100 MiB limit")
    data = source.read_bytes()
    if len(data) < 20:
        raise ValueError("Truncated GLB")
    magic, version, length, json_length, chunk_type = struct.unpack("<5I", data[:20])
    if magic != 0x46546C67 or version != 2 or length != len(data) or chunk_type != 0x4E4F534A:
        raise ValueError("Invalid GLB header")
    if json_length > 8 * 1024 * 1024 or json_length + 20 > len(data):
        raise ValueError("Invalid GLB JSON length")
    model = json.loads(data[20:20 + json_length])
    # A local job must not read unrelated host files or fetch remote resources.
    for item in model.get("buffers", []) + model.get("images", []):
        uri = item.get("uri")
        if uri and not uri.startswith("data:"):
            raise ValueError("External GLB resources are not allowed; export a self-contained GLB")
    return hashlib.sha256(data).hexdigest()


def metrics(objects):
    import bmesh
    result = dict(vertices=0, faces=0, triangles=0, degenerate_faces=0,
                  loose_vertices=0, inconsistent_edges=0, manifold_edges=0,
                  boundary_edges=0, nonmanifold_edges=0,
                  finite_coordinates=True, has_appearance=False)
    for obj in objects:
        mesh = obj.data
        result["has_appearance"] |= bool(mesh.materials or mesh.color_attributes)
        bm = bmesh.new()
        try:
            bm.from_mesh(mesh)
            result["vertices"] += len(bm.verts)
            result["faces"] += len(bm.faces)
            result["triangles"] += sum(max(0, len(f.verts) - 2) for f in bm.faces)
            result["finite_coordinates"] &= all(math.isfinite(v) for vert in bm.verts for v in vert.co)
            result["degenerate_faces"] += sum(f.calc_area() <= 1e-15 for f in bm.faces)
            result["loose_vertices"] += sum(not v.link_faces for v in bm.verts)
            result["manifold_edges"] += sum(e.is_manifold for e in bm.edges)
            result["inconsistent_edges"] += sum(e.is_manifold and not e.is_contiguous for e in bm.edges)
            result["boundary_edges"] += sum(e.is_boundary for e in bm.edges)
            result["nonmanifold_edges"] += sum(not e.is_manifold for e in bm.edges)
        finally:
            bm.free()
    return result


def main():
    import bpy
    import bmesh
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--repair-normals", action="store_true")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    source = Path(args.input).resolve()
    source_hash = validate_input(source)
    output = Path(args.output_dir).resolve()
    output.mkdir(parents=True, exist_ok=False)  # Never overwrite an earlier run.
    started = time.monotonic()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not objects or sum(len(o.data.vertices) for o in objects) > 2_000_000:
        raise ValueError("Expected mesh geometry within the 2M vertex limit")
    before = metrics(objects)
    if args.repair_normals:
        seen = set()
        for obj in objects:
            if obj.data.as_pointer() in seen:
                continue
            seen.add(obj.data.as_pointer())
            bm = bmesh.new()
            try:
                bm.from_mesh(obj.data)
                bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
                bm.to_mesh(obj.data)
                obj.data.update()
            finally:
                bm.free()
    processed = metrics(objects)
    candidate = output / "candidate.glb"
    bpy.ops.export_scene.gltf(filepath=str(candidate), export_format="GLB", export_normals=True)
    candidate_hash = validate_input(candidate)
    # Score the delivered artifact, not just Blender's in-memory intermediate.
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(candidate))
    exported_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    after = metrics(exported_objects)
    report = dict(source_sha256=source_hash, candidate_sha256=candidate_hash,
                  blender_version=bpy.app.version_string, before=before, processed=processed, after=after,
                  comparison=compare(before, after), elapsed_seconds=round(time.monotonic() - started, 3),
                  operation="recalculate_normals" if args.repair_normals else "roundtrip_only",
                  limitations=["No photo comparison", "Not CAD conversion", "No guaranteed reconstruction improvement"])
    (output / "report.json").write_text(json.dumps(report, indent=2, allow_nan=False) + "\n")
    print(json.dumps(report["comparison"]))


if __name__ == "__main__":
    main()
