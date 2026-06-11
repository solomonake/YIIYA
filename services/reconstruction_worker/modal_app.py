from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import time
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import modal
import requests


APP_NAME = "yiiya-scan-reconstruction"
GPU_TYPE = os.getenv("YIIYA_MODAL_GPU", "T4")
FAL_MODEL = os.getenv("FAL_TRELLIS_MODEL", "fal-ai/trellis-2")
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

        response = requests.post(self.url, json=payload, headers=headers, timeout=30)
        response.raise_for_status()


class ArtifactClient:
    def __init__(self) -> None:
        explicit_base = os.getenv("SCAN_RECONSTRUCTION_APP_URL", "").strip().rstrip("/")
        webhook_url = os.getenv("SCAN_RECONSTRUCTION_WEBHOOK_URL", "").strip()
        self.secret = os.getenv("SCAN_RECONSTRUCTION_WEBHOOK_SECRET", "").strip()
        self.base_url = explicit_base or self._derive_base_url(webhook_url)

    def _derive_base_url(self, webhook_url: str) -> str:
        if not webhook_url:
            return ""

        parsed = urlparse(webhook_url)
        if not parsed.scheme or not parsed.netloc:
            return ""

        return f"{parsed.scheme}://{parsed.netloc}"

    def upload(
        self,
        scan_id: str,
        file_path: Path,
        *,
        target: str,
        label: str,
        asset_kind: str | None = None,
        tier: str | None = None,
        file_format: str | None = None,
        status: str | None = None,
        metadata: dict[str, Any] | None = None,
        mime_type: str = "application/octet-stream",
    ) -> str | None:
        if not self.base_url:
            return None

        endpoint = f"{self.base_url}/api/scan/jobs/{scan_id}/worker-artifact"
        headers: dict[str, str] = {}
        if self.secret:
            headers["x-yiiya-worker-secret"] = self.secret

        form_data = {
            "target": target,
            "label": label,
            "metadata": json.dumps(metadata or {}),
        }
        if asset_kind:
            form_data["assetKind"] = asset_kind
        if tier:
            form_data["tier"] = tier
        if file_format:
            form_data["format"] = file_format
        if status:
            form_data["status"] = status

        with file_path.open("rb") as handle:
            response = requests.post(
                endpoint,
                headers=headers,
                data=form_data,
                files={
                    "file": (
                        file_path.name,
                        handle,
                        mime_type,
                    )
                },
                timeout=120,
            )

        if not response.ok:
            print(
                f"[worker] artifact upload failed for {file_path.name}: {response.status_code} {response.text}"
            )
            return None

        payload = response.json()
        return payload.get("url")


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


def downloads_to_paths(downloaded_uploads: list[dict[str, str]]) -> list[str]:
    return [
        item["local_path"] for item in downloaded_uploads if item.get("local_path")
    ]


def choose_reference_image(
    uploads: list[ScanUpload], extracted_frames: list[str]
) -> str | None:
    preview_upload = next(
        (item.url for item in uploads if item.kind == "preview" and item.url), None
    )
    if preview_upload:
        return preview_upload

    keyframe_upload = next(
        (item.url for item in uploads if item.kind == "keyframe" and item.url), None
    )
    if keyframe_upload:
        return keyframe_upload

    if extracted_frames:
        return extracted_frames[0]

    return None


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
        extracted_frames = [
            str(path) for path in extract_ffmpeg_keyframes(video_path, frames_dir)
        ]

    manifest = {
        "scan_id": job.scan_id,
        "prompt_hint": job.prompt_hint,
        "object_hint": job.object_hint,
        "downloaded_uploads": downloaded_uploads,
        "extracted_frames": extracted_frames,
        "reference_image": choose_reference_image(job.uploads, extracted_frames),
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
        "downloaded_uploads": downloaded_uploads,
        "extracted_frames": extracted_frames,
        "reference_image": manifest["reference_image"],
    }


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2))


def convert_mesh_exports(glb_url: str, workspace: Path) -> dict[str, Any]:
    import trimesh

    glb_path = workspace / "creator.glb"
    obj_path = workspace / "creator.obj"
    stl_path = workspace / "print.stl"
    geometry_report_path = workspace / "geometry-report.json"

    download_file(glb_url, glb_path)

    mesh = trimesh.load_mesh(str(glb_path), force="mesh")
    if mesh.is_empty:
        raise ValueError("Loaded fallback GLB did not contain mesh geometry.")

    obj_export = mesh.export(file_type="obj")
    if isinstance(obj_export, bytes):
        obj_export = obj_export.decode("utf-8")
    obj_path.write_text(obj_export)

    stl_export = mesh.export(file_type="stl")
    if isinstance(stl_export, str):
        stl_export = stl_export.encode("utf-8")
    stl_path.write_bytes(stl_export)

    geometry_report = {
        "triangleCount": int(len(mesh.faces)),
        "vertexCount": int(len(mesh.vertices)),
        "watertight": bool(mesh.is_watertight),
        "bounds": mesh.bounds.tolist(),
        "extents": mesh.extents.tolist(),
        "volume": float(mesh.volume) if mesh.is_volume else None,
    }
    write_json(geometry_report_path, geometry_report)

    return {
        "glb_path": str(glb_path),
        "obj_path": str(obj_path),
        "stl_path": str(stl_path),
        "geometry_report_path": str(geometry_report_path),
        "geometry_report": geometry_report,
    }


def run_fal_mesh_fallback(image_url: str) -> tuple[str | None, list[str]]:
    fal_key = os.getenv("FAL_KEY", "").strip()
    warnings: list[str] = []

    if not fal_key:
        return None, ["FAL fallback is unavailable because FAL_KEY is not configured."]

    response = requests.post(
        f"https://queue.fal.run/{FAL_MODEL}",
        headers={
            "Authorization": f"Key {fal_key}",
            "Content-Type": "application/json",
        },
        json={
            "image_url": image_url,
            "resolution": 1024,
            "texture_size": 2048,
            "decimation_target": 50000,
            "remesh": True,
        },
        timeout=60,
    )
    response.raise_for_status()
    request_id = response.json().get("request_id")

    if not request_id:
        return None, ["FAL fallback did not return a request id."]

    status_url = f"https://queue.fal.run/{FAL_MODEL}/requests/{request_id}/status?logs=1"
    result_url = f"https://queue.fal.run/{FAL_MODEL}/requests/{request_id}"

    for _ in range(90):
        status_response = requests.get(
            status_url,
            headers={"Authorization": f"Key {fal_key}"},
            timeout=30,
        )
        status_response.raise_for_status()
        status_payload = status_response.json()
        status = status_payload.get("status")

        if status == "COMPLETED":
            result_response = requests.get(
                result_url,
                headers={"Authorization": f"Key {fal_key}"},
                timeout=60,
            )
            result_response.raise_for_status()
            result_payload = result_response.json()
            glb = (
                result_payload.get("model_glb")
                or result_payload.get("data", {}).get("model_glb")
            )
            if glb and glb.get("url"):
                warnings.append(
                    "Scan was completed with a single-image mesh fallback instead of a full multi-view reconstruction stack."
                )
                return str(glb["url"]), warnings

            return None, ["FAL fallback completed without a GLB url."]

        if status in {"FAILED", "CANCELLED"}:
            return None, [f"FAL fallback ended with status {status}."]

        time.sleep(5)

    return None, ["FAL fallback timed out before a GLB export was ready."]


def run_worker_pipeline(job: DispatchPayload) -> dict[str, Any]:
    if not job.scan_id:
        raise ValueError("Dispatch payload is missing scanId.")

    webhook = WebhookClient()
    artifact_client = ArtifactClient()
    workspace = Path(tempfile.mkdtemp(prefix=f"{job.scan_id}-"))

    try:
        webhook.emit(stage_payload(job, "ingesting", "ingest", 0.04, warnings=job.warnings))
        prepared = prepare_workspace(job, workspace)

        manifest_path = Path(prepared["manifest_path"])
        source_pack_path = Path(prepared["source_pack_path"])
        extracted_frames = list(prepared["extracted_frames"])
        reference_image = prepared["reference_image"]

        uploaded_manifest_url = artifact_client.upload(
            job.scan_id,
            manifest_path,
            target="asset",
            label="Capture Manifest",
            asset_kind="metadata",
            mime_type="application/json",
            metadata={"stage": "ingest"},
        )
        uploaded_source_pack_url = artifact_client.upload(
            job.scan_id,
            source_pack_path,
            target="export",
            label="Source Pack",
            tier="source-pack",
            file_format="zip",
            status="ready",
            mime_type="application/zip",
            metadata={"stage": "source-pack"},
        )

        stage_reports: list[dict[str, Any]] = [
            {
                "stage": "ingest",
                "status": "ready",
                "metrics": {
                    "downloaded_upload_count": len(prepared["downloaded_uploads"]),
                    "extracted_frame_count": len(extracted_frames),
                },
            },
            {
                "stage": "keyframe_select",
                "status": "ready" if extracted_frames else "needs-input",
                "detail": "Frames extracted from upload." if extracted_frames else "No video frames were available for extraction.",
            },
            {
                "stage": "segment",
                "status": "heuristic",
                "detail": "Segmentation masks are not generated in this worker build yet.",
            },
            {
                "stage": "camera_solve",
                "status": "fallback",
                "detail": "COLMAP/pycolmap are not wired in this worker build yet.",
            },
            {
                "stage": "dense_reconstruct",
                "status": "fallback",
                "detail": "Using a single-image mesh fallback when available.",
            },
            {
                "stage": "mesh_cleanup",
                "status": "deferred",
                "detail": "PyMeshLab/Open3D cleanup is not wired in this worker build yet.",
            },
            {
                "stage": "retopo_uv",
                "status": "deferred",
                "detail": "xatlas unwrap/retopo is not wired in this worker build yet.",
            },
            {
                "stage": "package_exports",
                "status": "running",
                "detail": "Preparing portable exports for downstream DCC and print tools.",
            },
        ]

        for state, stage, progress in STAGE_ORDER[1:7]:
            webhook.emit(stage_payload(job, state, stage, progress))

        glb_url: str | None = None
        fallback_warnings: list[str] = []
        converted_exports: dict[str, Any] | None = None
        if reference_image:
            webhook.emit(stage_payload(job, "texturing", "appearance_bake", 0.93))
            glb_url, fallback_warnings = run_fal_mesh_fallback(reference_image)
        else:
            fallback_warnings = [
                "No preview image or extracted frame was available for the mesh fallback."
            ]

        if glb_url:
            try:
                converted_exports = convert_mesh_exports(glb_url, workspace)
                stage_reports[-1] = {
                    "stage": "package_exports",
                    "status": "ready",
                    "detail": "Generated creator OBJ, print STL, and geometry diagnostics from the mesh output.",
                    "metrics": {
                        "triangleCount": converted_exports["geometry_report"]["triangleCount"],
                        "vertexCount": converted_exports["geometry_report"]["vertexCount"],
                        "watertight": converted_exports["geometry_report"]["watertight"],
                    },
                }
            except Exception as error:
                fallback_warnings.append(
                    f"Mesh conversion succeeded only partially: {error}"
                )
                stage_reports[-1] = {
                    "stage": "package_exports",
                    "status": "fallback",
                    "detail": "The GLB is available, but OBJ/STL packaging did not complete cleanly.",
                }

        repair_log_path = workspace / "repair-log.json"
        repair_log = {
            "scanId": job.scan_id,
            "promptHint": job.prompt_hint,
            "objectHint": job.object_hint,
            "sourcePackUrl": uploaded_source_pack_url,
            "manifestUrl": uploaded_manifest_url,
            "usedFallbackMesh": bool(glb_url),
            "geometryReport": converted_exports["geometry_report"] if converted_exports else None,
            "warnings": [*job.warnings, *[
                {
                    "code": "single-image-fallback" if glb_url else "reconstruction-incomplete",
                    "label": warning,
                    "severity": "warning",
                }
                for warning in fallback_warnings
            ]],
            "stageReports": stage_reports,
        }
        write_json(repair_log_path, repair_log)
        repair_log_url = artifact_client.upload(
            job.scan_id,
            repair_log_path,
            target="asset",
            label="Repair Log",
            asset_kind="metadata",
            mime_type="application/json",
            metadata={"stage": "package_exports"},
        )

        warnings = [
            *job.warnings,
            *[
                {
                    "code": "single-image-fallback" if glb_url else "reconstruction-incomplete",
                    "label": warning,
                    "severity": "warning",
                }
                for warning in fallback_warnings
            ],
        ]
        repair_summary = {
            "fallbackMode": "single-image" if glb_url else "none",
            "usedFallbackMesh": bool(glb_url),
            "manifestUrl": uploaded_manifest_url,
            "repairLogUrl": repair_log_url,
            "sourcePackUrl": uploaded_source_pack_url,
        }

        uploaded_creator_obj_url = None
        uploaded_print_stl_url = None
        uploaded_geometry_report_url = None
        if converted_exports:
            uploaded_creator_obj_url = artifact_client.upload(
                job.scan_id,
                Path(converted_exports["obj_path"]),
                target="export",
                label="Creator OBJ",
                tier="creator",
                file_format="obj",
                status="ready",
                mime_type="model/obj",
                metadata={"stage": "creator"},
            )
            uploaded_print_stl_url = artifact_client.upload(
                job.scan_id,
                Path(converted_exports["stl_path"]),
                target="export",
                label="Print STL",
                tier="print",
                file_format="stl",
                status="ready",
                mime_type="model/stl",
                metadata={
                    "stage": "print",
                    "watertight": converted_exports["geometry_report"]["watertight"],
                },
            )
            uploaded_geometry_report_url = artifact_client.upload(
                job.scan_id,
                Path(converted_exports["geometry_report_path"]),
                target="asset",
                label="Geometry Report",
                asset_kind="metadata",
                mime_type="application/json",
                metadata={"stage": "package_exports"},
            )

        if not glb_url:
            webhook.emit(
                stage_payload(
                    job,
                    "failed",
                    "package_exports",
                    0.97,
                    lastError="Worker finished packaging inputs, but no mesh export could be produced.",
                    warnings=warnings,
                    stageReports=stage_reports,
                    repairSummary=repair_summary,
                    assets=[
                        *(
                            [
                                {
                                    "kind": "metadata",
                                    "label": "Capture Manifest",
                                    "url": uploaded_manifest_url,
                                    "fileName": "manifest.json",
                                    "mimeType": "application/json",
                                }
                            ]
                            if uploaded_manifest_url
                            else []
                        ),
                        *(
                            [
                                {
                                    "kind": "metadata",
                                    "label": "Repair Log",
                                    "url": repair_log_url,
                                    "fileName": "repair-log.json",
                                    "mimeType": "application/json",
                                }
                            ]
                            if repair_log_url
                            else []
                        ),
                        *(
                            [
                                {
                                    "kind": "metadata",
                                    "label": "Geometry Report",
                                    "url": uploaded_geometry_report_url,
                                    "fileName": "geometry-report.json",
                                    "mimeType": "application/json",
                                }
                            ]
                            if uploaded_geometry_report_url
                            else []
                        ),
                    ],
                )
            )
            return {
                "scanId": job.scan_id,
                "workspace": str(workspace),
                "prepared": prepared,
                "status": "artifact-only-failed",
            }

        webhook.emit(
            stage_payload(
                job,
                "complete",
                "package_exports",
                1.0,
                warnings=warnings,
                stageReports=stage_reports,
                repairSummary=repair_summary,
                assets=[
                    *(
                        [
                            {
                                "kind": "metadata",
                                "label": "Capture Manifest",
                                "url": uploaded_manifest_url,
                                "fileName": "manifest.json",
                                "mimeType": "application/json",
                            }
                        ]
                        if uploaded_manifest_url
                        else []
                    ),
                    *(
                        [
                            {
                                "kind": "metadata",
                                "label": "Repair Log",
                                "url": repair_log_url,
                                "fileName": "repair-log.json",
                                "mimeType": "application/json",
                            }
                        ]
                        if repair_log_url
                        else []
                    ),
                    *(
                        [
                            {
                                "kind": "metadata",
                                "label": "Geometry Report",
                                "url": uploaded_geometry_report_url,
                                "fileName": "geometry-report.json",
                                "mimeType": "application/json",
                            }
                        ]
                        if uploaded_geometry_report_url
                        else []
                    ),
                    {
                        "kind": "preview-mesh",
                        "label": "Fallback preview mesh",
                        "url": glb_url,
                        "fileName": "preview.glb",
                        "mimeType": "model/gltf-binary",
                    },
                    {
                        "kind": "textured-mesh",
                        "label": "Creator mesh",
                        "url": glb_url,
                        "fileName": "creator.glb",
                        "mimeType": "model/gltf-binary",
                    },
                ],
                exports=[
                    {
                        "tier": "mobile-preview",
                        "format": "glb",
                        "status": "ready",
                        "url": glb_url,
                        "fileName": "preview.glb",
                        "metadata": {"fallbackMode": "single-image"},
                    },
                    {
                        "tier": "creator",
                        "format": "glb",
                        "status": "ready",
                        "url": glb_url,
                        "fileName": "creator.glb",
                        "metadata": {"fallbackMode": "single-image"},
                    },
                    *(
                        [
                            {
                                "tier": "creator",
                                "format": "obj",
                                "status": "ready",
                                "url": uploaded_creator_obj_url,
                                "fileName": "creator.obj",
                                "metadata": {"stage": "creator"},
                            }
                        ]
                        if uploaded_creator_obj_url
                        else []
                    ),
                    *(
                        [
                            {
                                "tier": "print",
                                "format": "stl",
                                "status": "ready",
                                "url": uploaded_print_stl_url,
                                "fileName": "print.stl",
                                "metadata": {
                                    "stage": "print",
                                    "watertight": converted_exports["geometry_report"]["watertight"]
                                    if converted_exports
                                    else None,
                                },
                            }
                        ]
                        if uploaded_print_stl_url
                        else []
                    ),
                    *(
                        [
                            {
                                "tier": "source-pack",
                                "format": "zip",
                                "status": "ready",
                                "url": uploaded_source_pack_url,
                                "fileName": source_pack_path.name,
                                "metadata": {"stage": "source-pack"},
                            }
                        ]
                        if uploaded_source_pack_url
                        else []
                    ),
                ],
            )
        )

        return {
            "scanId": job.scan_id,
            "workspace": str(workspace),
            "prepared": prepared,
            "status": "complete-with-fallback",
            "glbUrl": glb_url,
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
    return run_worker_pipeline(job)


@app.function(
    image=image,
    cpu=1,
    memory=1024,
    secrets=[modal.Secret.from_name("yiiya-scan-worker")],
)
@modal.fastapi_endpoint(method="POST")
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
