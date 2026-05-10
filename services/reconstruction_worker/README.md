# Yiiya Reconstruction Worker

This service is the dedicated home for Yiiya's real-object reconstruction pipeline.
Vercel remains the product shell; Modal runs the heavy 3D job stages off-request.

## What it does

- Accepts queued scan dispatches from the Next.js app.
- Downloads the uploaded video and keyframes for a scan job.
- Emits stage-by-stage webhook updates back to `/api/scan/webhooks/reconstruction`.
- Provides the place where FFmpeg, segmentation, COLMAP, dense reconstruction,
  cleanup, UV, and appearance baking should run.

## Current state

The scaffold is intentionally honest:

- It can receive a dispatch payload.
- It can download inputs and extract frames with FFmpeg.
- It can emit progress updates through the same webhook contract the web app now expects.
- It does **not** yet run the full COLMAP/Open3D/PyMeshLab/xatlas stack.

If you wire `SCAN_RECONSTRUCTION_ENDPOINT` to this worker today, jobs will progress
through the planned stages and then fail with a clear placeholder error instead of hanging.

## Modal setup

1. Create a Modal secret named `yiiya-scan-worker`.
2. Put these values into that secret:
   - `SCAN_RECONSTRUCTION_WEBHOOK_URL`
   - `SCAN_RECONSTRUCTION_WEBHOOK_SECRET`
3. Deploy the worker:

```bash
modal deploy services/reconstruction_worker/modal_app.py
```

4. Copy the exposed web endpoint into the Vercel app as:

```bash
SCAN_RECONSTRUCTION_ENDPOINT=https://<your-modal-endpoint>
```

## Next backend steps

- Add real keyframe culling and masking before solve.
- Install and wire `pycolmap` or a COLMAP wrapper for camera poses.
- Add dense geometry plus mesh extraction.
- Add Open3D / PyMeshLab cleanup.
- Add UV unwrap and decimation.
- Upload packaged artifacts to durable storage, then send final export URLs in the webhook.
