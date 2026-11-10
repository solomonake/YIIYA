const baseUrl = process.env.YIIYA_BASE_URL ?? "http://127.0.0.1:3000";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// The capability token returned when the scan is created. Every later call
// must carry it: a scan id alone is a locator, not a credential.
let scanToken = null;

async function request(path, init = {}) {
  const headers = { ...init.headers, ...(scanToken ? { "x-yiiya-scan-token": scanToken } : {}) };
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
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

  assert(/^[A-Za-z0-9_-]{43}$/.test(created?.accessToken ?? ""), "accessToken missing from create response");

  const scanId = created.scanId;
  console.log(`[smoke] created ${scanId}`);

  const anonymous = await fetch(`${baseUrl}/api/scan/jobs/${scanId}`);
  assert(anonymous.status === 401, `lookup without a token returned ${anonymous.status}, expected 401`);
  const stranger = await fetch(`${baseUrl}/api/scan/jobs/${scanId}`, {
    headers: { "x-yiiya-scan-token": "A".repeat(43) },
  });
  assert(stranger.status === 403, `lookup with another token returned ${stranger.status}, expected 403`);
  scanToken = created.accessToken;

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
  // Free-only is the default 3D mode: uploads are kept, and no reconstruction
  // or export is promised. Mixed mode queues the export tiers.
  const freeOnly = completed.warnings?.some((warning) => warning.code === "free-only-reconstruction");
  if (freeOnly) {
    assert(completed.state === "failed", "free-only scan should end as failed, not queued for a worker");
    assert(completed.exports.length === 0, "free-only scan should not promise exports");
  } else {
    assert(completed.exports.length >= 6, "pending export tiers were not created");
  }

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
