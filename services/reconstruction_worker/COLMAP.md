# COLMAP multi-view reconstruction (Phase 5)

This is the "real" reconstruction path: instead of guessing the unseen sides of
an object from one photo, it recovers the actual geometry from an **orbit clip**
(walking around the subject). It is **flag-gated and off by default** — the code
ships inert and falls back to the single-image fal path until you build the
image and enable it.

## What it does (the pipeline)

For an orbit capture, the Modal worker already extracts frames with ffmpeg
(`fps=3`). `run_colmap_reconstruction()` then:

1. **Sparse SfM** (`pycolmap`, CPU-ok): feature extraction → exhaustive matching
   → incremental mapping. Recovers where the camera was for each frame.
2. **Dense MVS** (COLMAP, **CUDA required**): undistort → patch-match stereo →
   stereo fusion → a dense point cloud (`fused.ply`).
3. **Surface reconstruction** (`Open3D`): estimate normals → Poisson meshing →
   a watertight-ish triangle mesh → export `colmap.glb`.
4. **Upload**: the GLB is uploaded as the creator mesh, so all downstream
   packaging (OBJ/STL, the Phase 4 repair pass, readiness scoring) works
   unchanged.

Every stage is wrapped: too few registered views, no CUDA, or a sparse cloud all
return a clear reason and fall back — never a silent failure.

## Why it's off by default

- **Image weight**: COLMAP + Open3D add ~1 GB and a slow image build.
- **CUDA**: the apt `colmap` package is **CPU-only**. SfM (camera poses) runs on
  CPU, but *dense* patch-match stereo needs a CUDA COLMAP build. On the CPU image
  the dense stage raises and we fall back — useful only to validate the wiring.
- **Segmentation**: reconstruction degrades with cluttered backgrounds. Best
  results need each frame segmented to the subject (the on-device mask, or a
  worker-side `rembg`/SAM pass) before SfM. Track this as a follow-up.

## How to enable

### Option A — CPU smoke test (validate wiring, no dense mesh)

1. In the Modal secret `yiiya-scan-worker`, set `YIIYA_ENABLE_COLMAP=1`.
2. Redeploy: `modal deploy modal_app.py`. The image layers on apt `colmap` +
   `pycolmap` + `open3d`.
3. Run an orbit capture. Expect the logs to show SfM registering views, then the
   **dense stage failing on CUDA** and falling back. This proves steps 1 and the
   fallback are correct before you invest in the CUDA build.

### Option B — full dense reconstruction (production)

The apt package won't do dense. Build COLMAP with CUDA in the image instead:

```python
image = (
    modal.Image.from_registry("nvidia/cuda:12.4.1-devel-ubuntu22.04", add_python="3.11")
    .apt_install(
        "git", "cmake", "ninja-build", "build-essential", "ffmpeg",
        "libboost-program-options-dev", "libboost-graph-dev", "libboost-system-dev",
        "libeigen3-dev", "libflann-dev", "libfreeimage-dev", "libmetis-dev",
        "libgoogle-glog-dev", "libgtest-dev", "libsqlite3-dev", "libglew-dev",
        "libcgal-dev", "libceres-dev", "qtbase5-dev", "libqt5opengl5-dev",
    )
    .run_commands(
        "git clone https://github.com/colmap/colmap.git /colmap",
        "cmake -S /colmap -B /colmap/build -GNinja "
        "-DCMAKE_CUDA_ARCHITECTURES=75 -DCMAKE_INSTALL_PREFIX=/usr/local",
        "cmake --build /colmap/build --target install",
    )
    .pip_install_from_requirements("requirements.txt")
    .pip_install("pycolmap>=3.10", "open3d>=0.18")
)
```

- `CMAKE_CUDA_ARCHITECTURES=75` matches the T4 (`YIIYA_MODAL_GPU=T4`). Use `86`
  for A10G, `89` for L4/L40S — match your `YIIYA_MODAL_GPU`.
- First build is slow (~15–25 min) but cached afterward.
- Keep `gpu=` on `reconstruct_job` (already set) so the dense stage sees the GPU.

## Cost & quality expectations

- **Cost**: no API dollars — it's your own compute. A dense run on a T4 is
  roughly a few GPU-minutes per orbit (longer than a ~$0.2 fal call, but $0 in
  provider fees).
- **Quality**: with a clean, well-lit orbit of a matte object, dense MVS beats any
  single-image guess on geometry — real sides and back, correct proportions.
  Faces and shiny/transparent objects remain hard; segmentation is the next lever.

## Verification checklist (when you build it)

- [ ] `modal deploy` builds the COLMAP image without error.
- [ ] An orbit job logs SfM registering ≥ half the frames.
- [ ] Dense stage produces `fused.ply` with > 1000 points (CUDA build only).
- [ ] `colmap.glb` uploads and appears as the creator mesh.
- [ ] Geometry Report shows the Phase 4 repair ran and reports watertight state.
- [ ] A low-texture / cluttered clip falls back cleanly with a logged reason.
