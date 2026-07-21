"""Thin HTTP wrapper so the reconstruction worker runs on a plain container host
(Google Cloud Run GPU, GKE, a GPU VM) instead of Modal.

The Modal entrypoints in modal_app.py stay the source of truth for the pipeline;
this only exposes them over HTTP. The job runs in the background and reports
progress through the same webhook the Modal path uses, so /reconstruct returns
immediately (Cloud Run request timeouts do not bound the reconstruction).

Run locally for a smoke test:
    uvicorn server:app --port 8080
    curl -X POST localhost:8080/reconstruct -d @payload.json -H 'content-type: application/json'
"""
from __future__ import annotations

from typing import Any

from fastapi import BackgroundTasks, FastAPI

from modal_app import DispatchPayload, run_worker_pipeline

app = FastAPI(title="yiiya-reconstruction")


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/reconstruct")
def reconstruct(payload: dict[str, Any], background: BackgroundTasks) -> dict[str, Any]:
    job = DispatchPayload.from_payload(payload)
    # Fire-and-forget: progress + final assets are delivered via the webhook the
    # pipeline already emits, exactly like the Modal `dispatch` spawn.
    background.add_task(run_worker_pipeline, job)
    return {"accepted": True, "scanId": job.scan_id}
