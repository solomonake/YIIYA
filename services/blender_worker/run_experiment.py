"""One bounded offline experiment: process, render, combine evidence, never promote.

python3 services/blender_worker/run_experiment.py --blender /path/to/blender
  --input capture.glb --output-dir new-run-directory [--repair-normals]
"""
import argparse
import json
from pathlib import Path
import subprocess
import time

from process_asset import validate_input


def combine(topology, visual):
    decisions = [topology.get("decision"), visual.get("decision")]
    return dict(decision="needs_visual_review" if all(d == "needs_visual_review" for d in decisions) else "reject",
                automatic_promotion=False,
                reward_signals=dict(topology=topology.get("reward_signal"),
                                    source_preservation=visual.get("reward_signal")),
                photo_fidelity="not_evaluated")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--blender", required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--repair-normals", action="store_true")
    parser.add_argument("--timeout", type=int, default=300)
    args = parser.parse_args()
    if not 1 <= args.timeout <= 1800:
        parser.error("timeout must be 1–1800 seconds")
    binary, source, output = (Path(p).resolve() for p in (args.blender, args.input, args.output_dir))
    if not binary.is_file():
        parser.error("Blender executable not found")
    source_hash = validate_input(source)
    output.mkdir(parents=True, exist_ok=False)
    scripts = Path(__file__).resolve().parent
    started = time.monotonic()
    report = dict(source_sha256=source_hash, status="running", automatic_promotion=False,
                  operation="recalculate_normals" if args.repair_normals else "roundtrip_only",
                  provider_calls=0, provider_spend_usd=0,
                  cost_note="Local compute and engineering costs are not estimated")
    def run(script, arguments, log_name):
        remaining = args.timeout - (time.monotonic() - started)
        if remaining <= 0:
            raise TimeoutError("Experiment time budget exhausted")
        command = [str(binary), "--background", "--factory-startup", "--disable-autoexec",
                   "--threads", "2", "--python-exit-code", "1", "--python", str(scripts / script),
                   "--", *arguments]
        with (output / log_name).open("w") as log:
            subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, timeout=remaining, check=True)
    try:
        process_args = ["--input", str(source), "--output-dir", str(output / "mesh")]
        if args.repair_normals:
            process_args.append("--repair-normals")
        run("process_asset.py", process_args, "process.log")
        run("compare_renders.py", ["--before", str(source), "--after", str(output / "mesh/candidate.glb"),
                                  "--output-dir", str(output / "renders")], "renders.log")
        mesh = json.loads((output / "mesh/report.json").read_text())
        render = json.loads((output / "renders/report.json").read_text())
        report.update(status="completed", candidate_sha256=mesh["candidate_sha256"],
                      comparison=combine(mesh["comparison"], render["comparison"]),
                      evaluators=[mesh["comparison"]["after"]["evaluator"], render["evaluator"]])
    except (subprocess.SubprocessError, TimeoutError, OSError, ValueError, KeyError) as error:
        report.update(status="failed", error=str(error),
                      comparison=dict(decision="reject", reward_signals=None,
                                      automatic_promotion=False, photo_fidelity="not_evaluated"))
    finally:
        report["elapsed_seconds"] = round(time.monotonic() - started, 3)
        (output / "experiment.json").write_text(json.dumps(report, indent=2, allow_nan=False) + "\n")
    print(json.dumps(report))
    if report["status"] != "completed":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
