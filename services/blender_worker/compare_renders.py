"""CPU render comparison of a source GLB and candidate; NOT photo fidelity.

Run with Blender --background --factory-startup --disable-autoexec
--python-exit-code 1 --python this-file -- --before source.glb
--after candidate.glb --output-dir new-directory
"""
import argparse
import json
import math
from pathlib import Path
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parent))
from process_asset import validate_input
from render_quality import assess_views, VERSION


def load(path):
    import bpy
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    objects = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not objects or sum(len(o.data.vertices) for o in objects) > 2_000_000:
        raise ValueError("Expected a mesh below 2M vertices")
    return objects


def render(path, output, center, radius, angle):
    import bpy
    from mathutils import Vector
    load(path)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 16
    scene.cycles.seed = 42
    scene.cycles.use_denoising = False
    scene.render.resolution_x = 256
    scene.render.resolution_y = 256
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.world = bpy.data.worlds.new("evaluation-world")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.65, 0.65, 0.65, 1)
    scene.world.node_tree.nodes["Background"].inputs[1].default_value = 0.7
    camera_data = bpy.data.cameras.new("evaluation-camera")
    camera = bpy.data.objects.new("evaluation-camera", camera_data)
    scene.collection.objects.link(camera)
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = radius * 2.6
    camera_data.clip_start = max(radius / 1000, 0.00001)
    camera_data.clip_end = radius * 100
    camera.location = Vector(center) + Vector((math.cos(angle), math.sin(angle), 0.65)) * radius * 4
    camera.rotation_euler = (Vector(center) - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera
    for i, offset in enumerate(((3, -4, 5), (-3, 2, 2))):
        light_data = bpy.data.lights.new(f"evaluation-light-{i}", "AREA")
        light_data.energy = (350 if i == 0 else 150) * radius * radius
        light_data.shape = "DISK"
        light_data.size = radius * 3
        light = bpy.data.objects.new(light_data.name, light_data)
        scene.collection.objects.link(light)
        light.location = Vector(center) + Vector(offset) * radius
        light.rotation_euler = (Vector(center) - light.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)


def compare_pixels(before, after):
    import bpy
    import numpy as np
    arrays = []
    for path in (before, after):
        img = bpy.data.images.load(str(path), check_existing=False)
        pixels = np.empty(len(img.pixels), dtype=np.float32)
        img.pixels.foreach_get(pixels)
        arrays.append(pixels.reshape((-1, 4)))
        bpy.data.images.remove(img)
    a, b = arrays
    mask_a, mask_b = a[:, 3] > 0.01, b[:, 3] > 0.01
    union = mask_a | mask_b
    overlap = mask_a & mask_b
    if not union.any() or not overlap.any():
        return dict(eligible=False, silhouette_iou=0.0, foreground_rgb_mae=None)
    return dict(eligible=True,
                silhouette_iou=round(float(overlap.sum() / union.sum()), 6),
                foreground_rgb_mae=round(float(np.abs(a[overlap, :3] - b[overlap, :3]).mean()), 6))


def main():
    import bpy
    from mathutils import Vector
    parser = argparse.ArgumentParser()
    parser.add_argument("--before", required=True)
    parser.add_argument("--after", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    before, after = Path(args.before).resolve(), Path(args.after).resolve()
    hashes = [validate_input(p) for p in (before, after)]
    output = Path(args.output_dir).resolve()
    output.mkdir(parents=True, exist_ok=False)
    started = time.monotonic()
    objects = load(before)
    corners = [o.matrix_world @ Vector(c) for o in objects for c in o.bound_box]
    low = Vector(tuple(min(c[i] for c in corners) for i in range(3)))
    high = Vector(tuple(max(c[i] for c in corners) for i in range(3)))
    center, radius = (low + high) / 2, (high - low).length / 2
    if not math.isfinite(radius) or radius <= 0:
        raise ValueError("Invalid bounds")
    views = []
    for index, angle in enumerate((0.3, 2.4, 4.5)):
        a, b = output / f"before-{index}.png", output / f"after-{index}.png"
        render(before, a, center, radius, angle)
        render(after, b, center, radius, angle)
        views.append(dict(view=index, azimuth_radians=angle, **compare_pixels(a, b)))
    report = dict(evaluator=VERSION, source_sha256=hashes[0],
                  candidate_sha256=hashes[1], blender_version=bpy.app.version_string,
                  renderer="Cycles CPU", samples=16, seed=42, resolution=[256, 256],
                  views=views, comparison=assess_views(views), automatic_promotion=False,
                  elapsed_seconds=round(time.monotonic() - started, 3),
                  limitations=["Source preservation only, not photo fidelity", "Three views only",
                               "No proof of unseen surface accuracy or physical scale",
                               "Render noise and color management affect pixel error"])
    (output / "report.json").write_text(json.dumps(report, indent=2, allow_nan=False) + "\n")
    print(json.dumps(report))


if __name__ == "__main__":
    main()
