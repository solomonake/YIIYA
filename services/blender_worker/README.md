# Offline Blender experiment worker

This is a local research harness, not a deployed or hardened multi-user service.
It makes no provider calls, never replaces the source and never promotes output.

Run a self-contained GLB through processing, reimport validation and three-view
render comparison:

```sh
python3 services/blender_worker/run_experiment.py \
  --blender /absolute/path/to/blender \
  --input /absolute/path/to/source.glb \
  --output-dir /absolute/path/to/new-run \
  --repair-normals --timeout 300
```

Omit `--repair-normals` for an export/reimport baseline. Each output directory must
be new. The runner limits each experiment's total wall time, uses two Blender CPU
threads, disables automatic script execution, keeps process logs and records a
failure report on subprocess failure/timeouts. A valid GLB envelope, 100 MiB input
limit and no external glTF resources are checked before import. The post-import
2M vertex cap is NOT a pre-allocation memory limit. Compressed images/geometry can
consume much more memory than file size; untrusted visitor uploads require an
isolated worker with enforced RAM/CPU/disk/network limits before deployment.

## Evidence and reward signals

- `mesh/report.json`: `blender-topology-v1` technical rubric before and after
  export/reimport. Counts must remain unchanged for review eligibility. Split
  UV/normal vertices affect topology diagnostics; these are not a watertightness
  proof. Normals repair is optional and can harm intentional custom shading.
- `renders/report.json`: `render-preservation-v1`, fixed cameras/lighting/seed,
  256px CPU renders at 16 samples. Measures silhouette IoU and foreground RGB MAE
  against the source model, not against photographs. Screening thresholds are
  explicit and provisional, not calibrated quality or perception guarantees.
- `experiment.json`: separate topology and source-preservation reward signals;
  either evaluator can reject. Successful checks still require visual review.
  Photo fidelity always remains unmeasured in this harness.

Current negative control: replacing the Avocado texture with magenta leaves its
silhouette intact but yields source-preservation reward signal -0.506543 and
`reject`. Normal repair/export of the original yields topology delta 0 and source
preservation about -0.000004: no reconstruction improvement demonstrated.

Public fixture provenance: Khronos glTF Sample Assets Avocado, CC0 asset with
hand-painted texture; not a freshly reconstructed object. See research log for
source URL, SHA256 and exact output reports. Blender 4.5.15 ARM64 was downloaded
from the official vendor and checksum verified. Mac sandbox GPU detection failed;
approved native execution succeeded. No VM guest modification was needed.

Tests: `python3 -m unittest discover -s services/blender_worker -p 'test_*.py'`.

## Production work still required

Durable owner-scoped job records, queue leases/retries, authenticated dispatch,
bounded artifact upload, isolation, cancellation, retention and real photo-based
benchmarks are required before making this a visitor-facing service. Never expose
this script directly as an unauthenticated web endpoint. Do not train on visitor
images or treat a consumer scanning subscription as backend API entitlement.
