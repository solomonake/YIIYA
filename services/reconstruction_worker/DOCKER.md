# Docker & the reconstruction worker — what runs where

## What Docker is (30 seconds)

A **Docker image** is a frozen, self-contained snapshot of an operating system +
all the software your program needs (here: Ubuntu + CUDA + COLMAP + Python +
your worker code). A **container** is a running copy of that image.

The point: the image runs *identically* on any machine with Docker — your
laptop, a Google Cloud server, a teammate's PC — because everything it depends on
is baked in. No "works on my machine" surprises.

Three verbs:
- **build** — bake the image from `Dockerfile.colmap` (done once; ~15-25 min).
- **push** — upload the image to a registry (Google Artifact Registry).
- **run** — a host starts a container from the image and serves requests.

## Does this run on my computer or the cloud?

**The cloud.** The flow is:

```
  You (once):   build image  →  push to registry
  Cloud (per request):        pull image  →  run container on a GPU  →  reconstruct
```

- **Building** on your laptop only bakes the environment. It does NOT run any
  reconstruction on your machine — no user's capture ever touches your computer.
- **Running** happens on the cloud GPU host (Cloud Run, GKE, or a GPU VM) that
  pulled the image. That's where every user's orbit is actually processed.

You *can* run the container locally to test (`docker run`), but you'd need an
NVIDIA GPU + drivers, and it's only for your own debugging — never the path real
users hit.

## Two ways to host the worker

| | Modal (current) | This Dockerfile (Cloud Run / GKE) |
|---|---|---|
| Image | Built by `modal_app.py` (`modal.Image`), no Dockerfile needed | `Dockerfile.colmap` |
| You manage | Almost nothing | The container + registry + service |
| Best when | Default; spiky, low volume | You have GCP credits or steady high volume |
| GPU | `gpu="T4"` in the decorator | Cloud Run `--gpu 1 --gpu-type nvidia-l4` |

You do **not** need both. Modal is the simpler default; the Dockerfile exists so
you can move to Google Cloud later without a rewrite (the earlier GCP question).

## Deploy to Google Cloud Run (GPU), start to finish

```bash
# 0. One-time: install gcloud, pick a project, enable services
gcloud services enable run.googleapis.com artifactregistry.googleapis.com
gcloud artifacts repositories create yiiya --repository-format=docker --location=us-central1

# 1. Build for the Cloud Run GPU (L4 → CUDA arch 89)
docker build -f Dockerfile.colmap --build-arg CUDA_ARCH=89 -t yiiya-reconstruction:colmap .

# 2. Tag + push to Artifact Registry
HOST=us-central1-docker.pkg.dev/$(gcloud config get-value project)/yiiya
docker tag yiiya-reconstruction:colmap $HOST/reconstruction:colmap
docker push $HOST/reconstruction:colmap

# 3. Deploy with a GPU, long timeout, and the worker secrets as env vars
gcloud run deploy yiiya-reconstruction \
  --image $HOST/reconstruction:colmap \
  --region us-central1 \
  --gpu 1 --gpu-type nvidia-l4 --no-cpu-throttling \
  --memory 16Gi --cpu 4 --timeout 3600 \
  --set-env-vars YIIYA_ENABLE_COLMAP=1,SCAN_RECONSTRUCTION_WEBHOOK_URL=...,SCAN_RECONSTRUCTION_WEBHOOK_SECRET=...
```

Then point the app's `SCAN_RECONSTRUCTION_ENDPOINT` at the Cloud Run URL's
`/reconstruct` route and you're done.

## Cost note

A container only bills while it runs. Cloud Run GPU scales to zero between jobs,
so you pay for GPU-seconds per orbit, not a 24/7 GPU. That's the same "pay per
use" posture as Modal — just on Google's infrastructure.
