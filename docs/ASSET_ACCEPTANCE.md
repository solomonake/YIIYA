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
