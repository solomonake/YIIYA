# Yiiya Reconstruction Worker

This service is the dedicated home for Yiiya's real-object reconstruction pipeline.
Vercel remains the product shell; Modal runs the heavy 3D job stages off-request.

## What it does

- Accepts queued scan dispatches from the Next.js app.
- Downloads the uploaded video and keyframes for a scan job.
- Emits stage-by-stage webhook updates back to `/api/scan/webhooks/reconstruction`.
- Uploads worker-produced artifacts back into the app through the internal
  `worker-artifact` route.
- Packages a durable source pack and repair log even when full reconstruction
  backends are not available.
- Converts completed mesh output into `creator.obj`, `print.stl`, and geometry
  diagnostics when mesh conversion succeeds.
- Can finish with a single-image GLB fallback through fal when the full
  multi-view stack is still unavailable.

## Current state

The worker is now more truthful end to end:

- It receives dispatch payloads and downloads inputs.
- It extracts keyframes with FFmpeg.
- It uploads `source-pack.zip`, `manifest.json`, and `repair-log.json` back into
  the app when Blob is configured.
- It can promote completed mesh output into real downstream exports:
  `creator.glb`, `creator.obj`, `print.stl`, and `geometry-report.json`.
- It emits the same staged webhook payloads the product already understands.
- It can complete with a usable GLB export by using the configured fal fallback.

What still is **not** complete:

- True COLMAP / pycolmap camera solving
- Dense multi-view reconstruction
- Open3D / PyMeshLab cleanup
- xatlas UV unwrap and proper texturing

Those stages are still represented honestly in the repair log and warnings.

## Modal setup

1. Create a Modal secret named `yiiya-scan-worker`.
2. Put these values into that secret:
   - `SCAN_RECONSTRUCTION_WEBHOOK_URL`
   - `SCAN_RECONSTRUCTION_WEBHOOK_SECRET`
   - `SCAN_RECONSTRUCTION_APP_URL`
   - `FAL_KEY` (optional, but enables worker-side GLB completion)
   - `FAL_TRELLIS_MODEL` (optional)
3. Deploy the worker:

```bash
modal deploy services/reconstruction_worker/modal_app.py
```

4. Copy the exposed web endpoint into the Vercel app as:

```bash
SCAN_RECONSTRUCTION_ENDPOINT=https://<your-modal-endpoint>
```

## Next backend steps

- Replace the single-image fallback with true multi-view camera solve.
- Install and wire `pycolmap` or a COLMAP wrapper for camera poses.
- Add dense geometry plus mesh extraction.
- Add Open3D / PyMeshLab cleanup.
- Add UV unwrap and decimation.
- Replace the single-image fallback with a true multi-view solve so the mesh
  conversion/export path is fed by reconstruction instead of fallback-only mesh.
