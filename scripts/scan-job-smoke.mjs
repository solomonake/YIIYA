const baseUrl = process.env.YIIYA_BASE_URL ?? "http://127.0.0.1:3000";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function request(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      `Request failed for ${path} with ${response.status}: ${JSON.stringify(payload)}`
    );
  }

  return payload;
}

const coverage = Array.from({ length: 12 }, (_, index) => ({
  id: `coverage-${index}`,
  label:
    index < 9
      ? [
          "top-left",
          "top-center",
          "top-right",
          "mid-left",
          "mid-center",
          "mid-right",
          "bottom-left",
          "bottom-center",
          "bottom-right",
        ][index]
      : ["front-depth", "mid-depth", "rear-depth"][index - 9],
  covered: index < 8,
  confidence: index < 8 ? 0.8 : 0.2,
}));

async function main() {
  console.log(`[smoke] using ${baseUrl}`);

  const created = await request("/api/scan/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      promptHint: "Smoke test tabletop object",
    }),
  });

  assert(created?.scanId, "scanId missing from create response");
  assert(created?.job?.id === created.scanId, "job payload missing or mismatched");

  const scanId = created.scanId;
  console.log(`[smoke] created ${scanId}`);

  const initial = await request(`/api/scan/jobs/${scanId}`);
  assert(initial.id === scanId, "initial job lookup failed");
  assert(initial.captureStatus === "waiting", "expected waiting capture status");

  const updated = await request(`/api/scan/jobs/${scanId}/capture`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      objectHint: "smoke-object",
      captureStatus: "capturing",
      frame: {
        coverage,
        confidence: 0.81,
        depthScore: 0.67,
        guidance: "smoke capture frame",
        silhouette: { x: 0.18, y: 0.12, width: 0.58, height: 0.66 },
        updatedAt: new Date().toISOString(),
      },
    }),
  });
  assert(updated.captureStatus === "capturing", "capture update did not persist");

  const completed = await request(`/api/scan/jobs/${scanId}/complete-upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      objectHint: "smoke-object",
      durationMs: 42000,
      keyframeCount: 4,
    }),
  });
  assert(completed.captureStatus === "uploaded", "complete-upload did not mark uploaded");
  assert(Array.isArray(completed.exports), "exports missing from completed job");
  assert(completed.exports.length >= 6, "pending export tiers were not created");

  const reloaded = await request(`/api/scan/jobs/${scanId}`);
  assert(reloaded.id === scanId, "reloaded job missing");
  assert(reloaded.captureStatus === "uploaded", "reloaded job lost upload state");

  console.log(
    JSON.stringify(
      {
        scanId,
        state: reloaded.state,
        stage: reloaded.stage,
        exports: reloaded.exports.map((item) => ({
          tier: item.tier,
          format: item.format,
          status: item.status,
        })),
        warnings: reloaded.warnings,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(`[smoke] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
