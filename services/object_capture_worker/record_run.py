"""Record local worker evidence; technical validity is never a fidelity score."""
import argparse
import hashlib
import json
import math
from pathlib import Path


def summarize(events, exit_code, artifact_exists):
    starts = [e for e in events if e.get('event') == 'started']
    ends = [e for e in events if e.get('event') == 'completed']
    errors = [e for e in events if e.get('event') in {'error', 'request_error', 'timeout', 'cancelled'}]
    success = (exit_code == 0 and artifact_exists and len(starts) == 1
               and len(ends) == 1 and ends[0].get('artifact_exists') is True and not errors)
    duration = None
    if len(starts) == 1 and len(ends) == 1:
        a, b = starts[0].get('timestamp'), ends[0].get('timestamp')
        if all(type(t) in (int, float) and math.isfinite(t) for t in (a, b)) and b >= a:
            duration = round(b - a, 3)
    start = starts[0] if len(starts) == 1 else {}
    return dict(status='reconstructed_usdz' if success else 'failed_or_incomplete',
                exit_code=exit_code, artifact_success_reward=int(success),
                elapsed_seconds=duration,
                configuration=dict(feature_sensitivity=start.get('sensitivity'),
                                   object_masking=start.get('masking') == 'masked' if 'masking' in start else None,
                                   detail=start.get('detail')),
                input_count=start.get('input_count'), photo_fidelity='not_evaluated',
                technical_mesh_reward='not_evaluated', automatic_promotion=False,
                errors=errors)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--log', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--exit-code', type=int, required=True)
    args = parser.parse_args()
    events = []
    for line in args.log.read_text().splitlines():
        try:
            value = json.loads(line)
            if isinstance(value, dict):
                events.append(value)
        except json.JSONDecodeError:
            pass  # Preserve non-JSON native diagnostics in original log.
    artifact = args.output_dir / 'model.usdz'
    result = summarize(events, args.exit_code, artifact.is_file() and artifact.stat().st_size > 0)
    result.update(engine='Apple RealityKit Object Capture', provider_calls=0, provider_spend_usd=0)
    if artifact.is_file():
        result.update(artifact_sha256=hashlib.sha256(artifact.read_bytes()).hexdigest(), artifact_bytes=artifact.stat().st_size)
    destination = args.output_dir / 'experiment.json'
    if destination.exists():
        raise FileExistsError('Preserve prior assessment; choose a fresh run directory')
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / 'events.json').write_text(json.dumps(events, indent=2, allow_nan=False)+'\n')
    destination.write_text(json.dumps(result, indent=2, allow_nan=False)+'\n')
    print(json.dumps(result, allow_nan=False))


if __name__ == '__main__':
    main()
