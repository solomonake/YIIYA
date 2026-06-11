# Yiiya CAD Worker

This service is the dedicated home for Yiiya's bounded CAD lane.

It takes a structured CAD request from the Next.js app, builds a constrained
CadQuery model, and returns real CAD handoff artifacts plus a worker-built
preview mesh:

- `preview.glb`
- `model.step`
- `model.stl`
- `cadquery.py`
- `dimensions.json`
- validation and handoff notes

The preview GLB is tessellated from the same worker-side CAD geometry, so the
scene preview and the CAD exports now come from the same bounded model path.

## Modal setup

1. Create a Modal secret named `yiiya-cad-worker` if you want private env vars.
2. Deploy the worker:

```bash
modal deploy services/cad_worker/modal_app.py
```

3. Point the app to the deployed endpoint:

```bash
CAD_WORKER_ENDPOINT=https://<your-cad-worker>.modal.run
CAD_WORKER_API_KEY=optional_shared_secret
```

## Scope

This worker is intentionally bounded to hard-surface/product-style geometry:

- single-body objects
- simple stools, lamps, boxes, cylinders, housings
- simple feature-oriented shapes

It is not meant for characters, cloth, or sculptural organic forms.
