from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import modal
import requests


APP_NAME = "yiiya-scan-reconstruction"
GPU_TYPE = os.getenv("YIIYA_MODAL_GPU", "T4")
STAGE_ORDER = [
    ("ingesting", "ingest", 0.08),
    ("selecting", "keyframe_select", 0.2),
    ("solving", "segment", 0.34),
    ("solving", "camera_solve", 0.48),
    ("meshing", "dense_reconstruct", 0.62),
    ("cleaning", "mesh_cleanup", 0.76),
    ("cleaning", "retopo_uv", 0.86),
    ("texturing", "appearance_bake", 0.93),
    ("packaging", "package_exports", 0.97),
]

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install_from_requirements("requirements.txt")
)
app = modal.App(APP_NAME)


@dataclass
class ScanUpload:
    kind: str
    url: str
    file_name: str

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "ScanUpload":
        return cls(
            kind=str(payload.get("kind", "")),
            url=str(payload.get("url", "")),
            file_name=str(payload.get("fileName", "upload.bin")),
        )


@dataclass
class DispatchPayload:
    scan_id: str
    prompt_hint: str | None
    object_hint: str | None
    uploads: list[ScanUpload]
    warnings: list[dict[str, Any]]

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "DispatchPayload":
        uploads = [
            ScanUpload.from_payload(item)
            for item in payload.get("uploads", [])
            if isinstance(item, dict)
        ]
        warnings = [
            item for item in payload.get("warnings", []) if isinstance(item, dict)
        ]
        return cls(
            scan_id=str(payload.get("scanId", "")),
            prompt_hint=payload.get("promptHint"),
            object_hint=payload.get("objectHint"),
            uploads=uploads,
            warnings=warnings,
        )


class WebhookClient:
    def __init__(self) -> None:
        self.url = os.getenv("SCAN_RECONSTRUCTION_WEBHOOK_URL", "").strip()
        self.secret = os.getenv("SCAN_RECONSTRUCTION_WEBHOOK_SECRET", "").strip()

    def emit(self, payload: dict[str, Any]) -> None:
        if not self.url:
            print(f"[worker] webhook skipped: {json.dumps(payload)}")
            return

        headers = {"Content-Type": "application/json"}
        if self.secret:
            headers["x-yiiya-webhook-secret"] = self.secret

        response = requests.post(
            self.url, json=payload, headers=headers, timeout=30
        )
        response.raise_for_status()


def run_cmd(command: list[str], cwd: Path | None = None) -> None:
    subprocess.run(command, cwd=cwd, check=True)


def download_file(url: str, destination: Path) -> None:
    response = requests.get(url, stream=True, timeout=90)
    response.raise_for_status()

    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("wb") as handle:
        for chunk in response.iter_content(chunk_size=1024 * 1024):
            if chunk:
                handle.write(chunk)


def extract_ffmpeg_keyframes(video_path: Path, frames_dir: Path) -> list[Path]:
    frames_dir.mkdir(parents=True, exist_ok=True)
    output_pattern = frames_dir / "frame-%04d.jpg"
    run_cmd(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(video_path),
            "-vf",
            "fps=3",
            str(output_pattern),
        ]
    )
    return sorted(frames_dir.glob("frame-*.jpg"))


def stage_payload(
    job: DispatchPayload,
    state: str,
    stage: str,
    progress: float,
    **extra: Any,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "scanId": job.scan_id,
        "state": state,
        "stage": stage,
        "progress": progress,
        "worker": "modal",
    }
    payload.update(extra)
    return payload


def prepare_workspace(job: DispatchPayload, workspace: Path) -> dict[str, Any]:
    uploads_dir = workspace / "uploads"
    frames_dir = workspace / "frames"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    frames_dir.mkdir(parents=True, exist_ok=True)

    downloaded_uploads: list[dict[str, str]] = []
    video_path: Path | None = None

    for upload in job.uploads:
        if not upload.url:
            continue

        destination = uploads_dir / upload.file_name
        download_file(upload.url, destination)
        downloaded_uploads.append(
            {
                "kind": upload.kind,
                "file_name": upload.file_name,
                "local_path": str(destination),
            }
        )

        if upload.kind == "video" and video_path is None:
            video_path = destination

    extracted_frames: list[str] = []
    if video_path:
        extracted_frames = [str(path) for path in extract_ffmpeg_keyframes(video_path, frames_dir)]

    manifest = {
        "scan_id": job.scan_id,
        "prompt_hint": job.prompt_hint,
        "object_hint": job.object_hint,
        "downloaded_uploads": downloaded_uploads,
        "extracted_frames": extracted_frames,
    }
    manifest_path = workspace / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))

    source_pack_path = workspace / f"{job.scan_id}-source-pack.zip"
    with zipfile.ZipFile(source_pack_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.write(manifest_path, arcname="manifest.json")
        for item in downloads_to_paths(downloaded_uploads):
            archive.write(item, arcname=f"uploads/{Path(item).name}")
        for frame_path in extracted_frames:
            archive.write(frame_path, arcname=f"frames/{Path(frame_path).name}")

    return {
        "manifest_path": str(manifest_path),
        "source_pack_path": str(source_pack_path),
        "extracted_frame_count": len(extracted_frames),
    }


def downloads_to_paths(downloaded_uploads: list[dict[str, str]]) -> list[str]:
    return [
        item["local_path"]
        for item in downloaded_uploads
        if item.get("local_path")
    ]


def run_placeholder_pipeline(job: DispatchPayload) -> dict[str, Any]:
    if not job.scan_id:
        raise ValueError("Dispatch payload is missing scanId.")

    webhook = WebhookClient()
    workspace = Path(tempfile.mkdtemp(prefix=f"{job.scan_id}-"))

    try:
        webhook.emit(
            stage_payload(
                job,
                "ingesting",
                "ingest",
                0.04,
                warnings=job.warnings,
            )
        )

        prepared = prepare_workspace(job, workspace)

        for state, stage, progress in STAGE_ORDER[1:]:
            webhook.emit(stage_payload(job, state, stage, progress))

        placeholder_error = (
            "Modal worker scaffold received the scan and prepared the source pack, "
            "but the COLMAP/Open3D/PyMeshLab/xatlas execution stages are still placeholders."
        )
        webhook.emit(
            stage_payload(
                job,
                "failed",
                "package_exports",
                0.97,
                lastError=placeholder_error,
                warnings=[
                    *job.warnings,
                    {
                        "code": "worker-scaffold-only",
                        "label": "The dedicated Modal worker is scaffolded, but the full reconstruction executors still need to be connected.",
                        "severity": "warning",
                    },
                ],
            )
        )

        return {
            "scanId": job.scan_id,
            "workspace": str(workspace),
            "prepared": prepared,
            "status": "placeholder-failed",
        }
    finally:
        shutil.rmtree(workspace, ignore_errors=True)


@app.function(
    image=image,
    gpu=GPU_TYPE,
    cpu=4,
    memory=16384,
    timeout=60 * 60,
    secrets=[modal.Secret.from_name("yiiya-scan-worker")],
)
def reconstruct_job(payload: dict[str, Any]) -> dict[str, Any]:
    job = DispatchPayload.from_payload(payload)
    return run_placeholder_pipeline(job)


@app.function(
    image=image,
    cpu=1,
    memory=1024,
    secrets=[modal.Secret.from_name("yiiya-scan-worker")],
)
@modal.web_endpoint(method="POST")
def dispatch(payload: dict[str, Any]) -> dict[str, Any]:
    call = reconstruct_job.spawn(payload)
    return {
        "accepted": True,
        "scanId": payload.get("scanId"),
        "callId": getattr(call, "object_id", None),
    }


@app.local_entrypoint()
def main(payload_path: str) -> None:
    payload = json.loads(Path(payload_path).read_text())
    result = reconstruct_job.remote(payload)
    print(json.dumps(result, indent=2))
