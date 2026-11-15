# File acceptance contract

`yiiya-glb-v1` gates hosted generation and restyle candidates, Blob publication,
proxy delivery and conversion. A rejected candidate continues through the existing
provider policy. Paid providers remain disabled in free-only mode. A failed
restyle preserves the original model.

The gate reads the complete response within 100 MiB before delivery. It checks
GLB framing, embedded resources, Khronos glTF validation errors, decoder support,
finite positions and world transforms, triangle indices, and at least one
non-degenerate triangle after world transforms. Triangle primitives are required.
JSON is capped at 8 MiB, accessor elements at 10 million and declared decoded
buffers at 256 MiB. Draco dependencies remain external server packages so their
WASM decoder ships with the runtime. Validation warnings are counted, not treated
as errors. Degenerate triangles may coexist with useful geometry.

The receipt at `/api/3d/convert?from=<artifact>&to=report` records contract version,
validator version, SHA-256 of inspected input bytes, size, triangle count, warnings
and acceptance. The UI downloads this through the existing credential-isolated
ArtifactDownload component. Receipts are private and not cached. GLB/proxy response
headers expose contract, hash and unassessed fidelity. Converted OBJ/STL files do
not inherit the input GLB hash as their own identity.

This establishes file acceptance, not likeness, topology suitability, physical
scale, watertightness, printability or rig readiness. Those remain unassessed.
On-device Photo Studio exports do not pass through this server gate yet. There is
no new guarantee badge or refund promise. A reference-based evaluator needs
calibrated views, masks and held-back real captures before a fidelity threshold
can block delivery without misleading users.

Implementation uses the [official Khronos validator API](https://github.com/KhronosGroup/glTF-Validator/blob/main/node/module.mjs).
No external resource URL or filesystem path is loaded during inspection.

## Verification

Unit and route tests cover valid, truncated, oversized, NaN, degenerate,
world-collapsed, external-resource and compressed geometry, reproducible receipts,
recovery after rejection and private credential isolation. Provider-policy tests
now feed real GLB bytes instead of mocking geometry inspection. The production
bundle is also exercised locally with fixture-only upstream responses. This is
not a live hosted generation or real-photo fidelity benchmark.

## Photo Studio evidence

The separate on-device `yiiya-photo-evidence-v1` receipt measures orthographic
silhouette overlap against the same front/right/optional-angle cutouts used for
construction. It records every view, the mean and weakest overlap on a 64 by 64
grid. These measurements are not held-out accuracy or a calibrated pass threshold.
It does not use the server Khronos gate. Source positions must be finite complete
triangles and the exported GLB envelope must be complete. Full glTF validation is
explicitly not assessed in this receipt.

GLB bytes are cached for a built mesh and SHA-256 binds the local evidence JSON
to exactly that download. Rebuilding or changing inputs clears the cache and
measurements. Export disables conflicting controls, and stale async results are
rejected. No images, masks or model bytes are uploaded for this report.

Browser verification of the supplied bonsai: 25,068 triangles, 2,708,560 bytes,
SHA-256 `59a0289563720518c523483f4ed61ef03e352541124056450edbf6c547212909`;
front overlap 0.9571651090, right 0.9576271186. The downloaded receipt hash matched
the separately downloaded GLB. Desktop and 390 pixel layout checked. This does
not establish performance on customer photos.
