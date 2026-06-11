from __future__ import annotations

import base64
import faulthandler
import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

PNG_1X1_BASE64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sotWZ8AAAAASUVORK5CYII="
)


def write_file(path: Path, data: bytes) -> None:
    path.write_bytes(data)


def main() -> None:
    faulthandler.dump_traceback_later(90, repeat=False)
    print("smoke: importing workers", flush=True)
    from services.cad_worker import modal_app as cad_worker
    from services.reconstruction_worker import modal_app as scan_worker
    print("smoke: workers imported", flush=True)

    emitted_payloads: list[dict] = []

    cad_payload = {
        "prompt": "Design a compact desk lamp with a round base and tapered shade",
        "brief": {
            "dimensions": {"unit": "cm", "width": 18, "depth": 18, "height": 34},
            "partSemantics": ["base", "stem", "shade"],
        },
    }
    print("smoke: starting CAD worker", flush=True)
    cad_result = cad_worker.generate(cad_payload)
    print("smoke: CAD worker finished", flush=True)

    assert cad_result["previewGlbBase64"], "CAD worker did not produce previewGlbBase64"
    assert cad_result["stepText"], "CAD worker did not produce STEP text"
    assert cad_result["stlBase64"], "CAD worker did not produce STL base64"

    with tempfile.TemporaryDirectory(prefix="yiiya-worker-smoke-") as tmp:
        tmpdir = Path(tmp)
        preview_glb_path = tmpdir / "preview.glb"
        preview_png_path = tmpdir / "preview.png"

        write_file(preview_glb_path, base64.b64decode(cad_result["previewGlbBase64"]))
        write_file(preview_png_path, base64.b64decode(PNG_1X1_BASE64))

        glb_url = "local://preview.glb"
        png_url = "local://preview.png"
        print("smoke: prepared local preview files", flush=True)

        original_emit = scan_worker.WebhookClient.emit
        original_upload = scan_worker.ArtifactClient.upload
        original_fallback = scan_worker.run_fal_mesh_fallback
        original_requests_get = scan_worker.requests.get

        class LocalResponse:
            def __init__(self, path: Path):
                self._content = path.read_bytes()

            @property
            def content(self) -> bytes:
                return self._content

            def raise_for_status(self) -> None:
                return None

            def iter_content(self, chunk_size: int = 8192):
                for index in range(0, len(self._content), chunk_size):
                    yield self._content[index : index + chunk_size]

        def fake_emit(self, payload):
            emitted_payloads.append(payload)

        def fake_upload(self, scan_id, file_path, **_kwargs):
            return f"http://local-artifacts/{scan_id}/{Path(file_path).name}"

        def fake_fallback(_image_url):
            return glb_url, [
                "Local smoke fallback used the CAD-generated preview GLB instead of a remote mesh service."
            ]

        def fake_requests_get(url, *args, **kwargs):
            if url == glb_url:
                return LocalResponse(preview_glb_path)
            if url == png_url:
                return LocalResponse(preview_png_path)
            return original_requests_get(url, *args, **kwargs)

        scan_worker.WebhookClient.emit = fake_emit
        scan_worker.ArtifactClient.upload = fake_upload
        scan_worker.run_fal_mesh_fallback = fake_fallback
        scan_worker.requests.get = fake_requests_get

        try:
            dispatch = scan_worker.DispatchPayload(
                scan_id="scan-local-smoke",
                prompt_hint="Local smoke tabletop object",
                object_hint="Desk Lamp",
                uploads=[
                    scan_worker.ScanUpload(
                        kind="preview",
                        url=png_url,
                        file_name="preview.png",
                    )
                ],
                warnings=[],
            )
            print("smoke: starting scan worker", flush=True)
            scan_result = scan_worker.run_worker_pipeline(dispatch)
            print("smoke: scan worker finished", flush=True)
        finally:
            scan_worker.WebhookClient.emit = original_emit
            scan_worker.ArtifactClient.upload = original_upload
            scan_worker.run_fal_mesh_fallback = original_fallback
            scan_worker.requests.get = original_requests_get

    complete_payload = emitted_payloads[-1]

    summary = {
        "cad": {
            "provider": cad_result["provider"],
            "previewStats": cad_result.get("previewStats"),
            "validation": cad_result["validation"],
        },
        "scan": {
            "status": scan_result["status"],
            "glbUrl": scan_result.get("glbUrl"),
            "finalStage": complete_payload.get("stage"),
            "finalState": complete_payload.get("state"),
            "exportFormats": [
                f'{item["tier"]}:{item["format"]}:{item["status"]}'
                for item in complete_payload.get("exports", [])
            ],
            "metadataAssets": [
                item["fileName"]
                for item in complete_payload.get("assets", [])
                if item.get("kind") == "metadata"
            ],
            "warnings": [warning["label"] for warning in complete_payload.get("warnings", [])],
            "stageReports": complete_payload.get("stageReports"),
        },
    }

    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
