# Native local reconstruction benchmark

This macOS RealityKit worker is a local benchmark, not a deployed NVIDIA service.
Use bounded10–100 inputs/100MB, five-minute timeout and fresh run directories.
`reconstruct INPUT NEW_OUTPUT normal|high masked|unmasked [reduced|medium] [poses]`
Optional poses request writes48 mapped poses for the tested DinoRing sample.
No personal images or camera were used. Public dataset provenance/input hashes:
outputs/image-3d-evaluations/dinoring/input-manifest.json.

Compile with installed Swift SDK (`-parse-as-library`); supported GPU access was
required outside the execution sandbox. Blender import/export/render scripts use
trusted generated local artifacts, not arbitrary public uploads. record_run.py
requires successful exit, completion marker and existing artifact; topology reward
is not fidelity. See the experiment directories and RESULTS.md for timings.

## Camera evaluation

align_cameras.py uses NumPy and published DinoRing camera calibration. It fits a
proper similarity from estimated camera centers to reference centers using36
cameras, evaluates12 excluded from the fit, and checks estimated camera -Z against
reference OpenCV +Z directions. Native poses use translation and xyzw quaternion;
source names map all48 views. This is camera registration, NOT mesh fidelity.
All48 images were used in reconstruction, so the12-camera split is NOT a held-out
reconstruction evaluation. Native mesh/model coordinate registration and image
intrinsics still need rendered validation before photometric/silhouette scores.

Latest run high-masked-poses:25.645s, export success,48 poses. Normalized validation
center RMSE0.0179454, average optical-axis error2.9032deg (max4.3843). Shuffled
correspondence seed42 gives normalized validation RMSE1.0516468. Residual camera
error matters for a narrow-FOV object and prevents treating mismatched renders
as proof of geometry errors. Eight evaluator/recording unit tests pass using
Blender's bundled Python/NumPy. No automatic promotion or learned reward model.

Next: render known calibration views through the registered transform, inspect
alignment against original photos, then design an independent reconstruction
holdout. Do not train or benchmark a learned preference model on fabricated labels.

## Registered-render experiment — 2026-11-06

Added services/object_capture_worker/render_registered.py. Three original calibrated
training views rendered with fixed camera-registration transform, unlit textures,
Cycles CPU8samples/two threads,640x480. Runtime7.897s (render evaluation, NOT new
reconstruction speed). Independent K[R|t] versus Blender projection maximum error
0.0018274px. Initial check rejected1.793px caused by Blender clamping pixel aspect
below1; corrected with equivalent aspect ratio whose components both meet minimum1.
Sandbox Blender startup crashed; normal application execution completed exit0.
Python compilation and diff whitespace checks pass.

Visual inspection of source/render0001 FAILS framing: mesh too large and clipped.
Camera projection math alone does not prove model/pose coordinate normalization.
Fidelity reward null, scoring eligible false, automatic promotion false. Do not
call this a model-quality improvement or held-out evaluation. All48 photos used
in original reconstruction. No new provider generation, deployment or spending.
Evidence: outputs/image-3d-evaluations/dinoring/high-masked-poses/registered-v2/.
Next exact action: inspect USD stage/model transforms versus native pose coordinate
normalization before fitting any target pixels or scoring silhouettes. GLB root
ObjectCapture contains+90deg X rotation; retain this evidence, do not assume its
meaning without inspecting importer/stage transform. Analytics ingestion remains
unverified; existing deployment READY, test consent off.

Sources: https://vision.middlebury.edu/mview/data/ specifies K[R|t], top-left image
origin and corrected radial distortion. https://docs.blender.org/api/5.0/bpy.types.Camera.html
for camera parameters; executable projection check validates installed4.5 behavior.


## Native-bounds diagnostic — 2026-11-06

Native reconstruct.swift diagnostic poses option now requests both poses and bounds,
writes native-bounds.json, and requires both before reporting successful completion.
Compiled installed Swift SDK. Public DinoRing48inputs, high/masked/reduced completed
exit0 in19.889s; model.usdz1,812,718bytes,48mapped poses, bounds persisted. Artifact
success reward1; mesh/fidelity rewards unknown, automatic promotionfalse. No new
Blender render or provider/cloud calls. Eight existing evaluator/recorder tests pass.
Native USD export emitted texture-reference localization warnings; do not claim
Blender/material validation until importer verifies archive texture data.

Bounds in shared pose frame: min[-0.2342024,-0.0698152,-0.2016008],
max[0.2402289,0.2678436,0.1946780]. This is diagnostic evidence, not proof of model
registration or visual improvement. Previous high-masked-poses registration cannot
be reused across this new stochastic reconstruction without recomputing it.
Next exact action: inspect this run's USD/model transforms and native bounds,
recompute registration using its own camera-poses.json, and validate projection
before a new registered render. Never fit target pixels just to inflate fidelity.

Apple docs state bounds and poses share estimated coordinates:
https://developer.apple.com/documentation/realitykit/photogrammetrysession/request/poses
Installed SDK Pose exposes translation/rotation/transform, but not newer web-doc
intrinsics; avoid relying on unavailable API. Evidence directory:
outputs/image-3d-evaluations/dinoring/high-masked-bounds/.
