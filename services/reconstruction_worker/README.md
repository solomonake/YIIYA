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
   - `SCAN_RECONSTRUCTION_API_KEY` (required shared dispatch credential; same value in the app, stored through secret management)
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


## HTTP dispatch authorization (local change, not deployed)

Both Modal dispatch and container `/reconstruct` require exactly one
`Authorization: Bearer <SCAN_RECONSTRUCTION_API_KEY>` header. Missing/blank worker
configuration returns503; absent, duplicate or incorrect credentials return401
before JSON is read. Rejection happens before GPU spawn/background enqueue.
The webhook secret is separate and must not be substituted for the dispatch key.
Configure matching values in the app and worker using secret management; never
put real values in command history, source files or screenshots.

This is caller authentication, not a per-job budget, durable queue or exactly-once
execution guarantee. The worker authenticates before reading a streamed JSON body capped at256KiB.
It validates scan IDs, hints, warnings,1–12 uploads, supported kinds, safe unique
basenames and public Vercel Blob URLs before enqueue. Duplicate filenames are
rejected rather than overwriting an earlier file. Other storage sources require
an explicit reviewed allowlist change.
A health response does not prove GPU readiness or completed reconstruction.

Local verification:13 tests across actual FastAPI routing and bounded downloads, with Modal provisioning and
GPU execution stubbed. Missing/wrong/duplicate credentials allocate zero jobs;
valid credentials enqueue once per tested request. Tests used Python3.14 and
FastAPI0.162.0, not the Python3.11 GPU container. Container build and live Modal
routing remain unverified. Run with FastAPI, HTTPX and Requests installed:

```bash
python -m unittest discover -s services/reconstruction_worker -p 'test_*.py' -v
```


## Download bounds

Input uploads: HTTPS public Vercel Blob hosts only,3MiB per file. Generated mesh
artifacts: public Blob or fal.media/fal.run subdomains,64MiB per file. URL userinfo,
non443 ports, fragments, control characters and backslashes are rejected.
Redirects are rejected rather than followed. Content-Length is checked when
present, and streamed bytes remain bounded without it. Connect/read timeouts and
an elapsed-time check constrain reads; this is not a strict whole-job deadline.
Empty/failed/oversized downloads remove their partial file and cannot overwrite an
existing file. No production network requests were used in these tests.

Still open: aggregate per-job download budgeting, decoder/frame-extraction resource
limits, durable queue/idempotency, storage ownership attestation, cloud deployment
and cost controls. Host allowlisting does not establish ownership of a Blob URL.


## Video extraction limits (local verification)

Input must fit3MiB and report a finite duration in(0,30] seconds. Probe timeout10s;
first video stream must have dimensions no larger than4096 per edge or8,388,608
pixels. Only MOV/MP4 and Matroska/WebM demuxers and local-file protocol are allowed.
Extraction uses two decoder/encoder threads, one filter thread,3fps,90 frames max,
outputs within1024px per edge and a45s subprocess timeout. A failed extraction
removes its newly created frame directory; existing directories are not overwritten.
These constraints are not an OS memory sandbox; codec allocations and changing
stream metadata still need container resource isolation. Videos with missing reported duration receive one bounded stream-copy remux
into temporary Matroska (15s timeout,3MiB cap), then re-probe. Complete packet
counts must match; no time truncation is used. Missing/invalid duration after
normalization or packet loss fails closed. Original media remains unchanged and
temporary normalization is removed. No real-phone capture was tested.

18 local worker tests pass. The real FFmpeg integration generates a1536×1024,
two-second fixture, exercises prepare_workspace, produces six frames, verifies
output dimensions<=1024 and a source ZIP. Negative tests reject invalid duration/
dimensions and clean partial output on timeout. Live-WebM fixtures verify
missing-duration2s video yields6 frames while31s rejects, and packet loss denies
normalization. Modal/network execution remains
stubbed. Source: https://www.ffmpeg.org/ffmpeg.html . No live cloud deployment.
