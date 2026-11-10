/** Bounded research pilot; anonymous public Spaces only. No .env, account or paid fallback. */
import { Client } from "@gradio/client";
import { generateStableFast3d } from "../lib/providers/stable-fast-3d";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { predictGradio, withProviderDeadline, ProviderDeadlineError } from "../lib/provider-deadline";
import { hfFailureMessage } from "../lib/huggingface-access";
import { readBoundedResponse } from "../lib/bounded-response";
import { inspectGlbBuffer } from "../lib/scene/glb-inspect";
import { evaluateQualityReward } from "../lib/scene/quality-reward";

const input = "/tmp/yiiya-dinoRing-photos/dinoRing/dinoR0001.png";
const expectedHash = "563f5da21b7914f80d3ba0413d27870159ca0d6ea5e9c2d5cfa1ad17a8f16797";
const specs = [
  { id: "trellis2", space: "microsoft/TRELLIS.2", host: "microsoft-trellis-2.hf.space" },
  { id: "hunyuan2", space: "tencent/Hunyuan3D-2", host: "tencent-hunyuan3d-2.hf.space" },
  { id: "sf3d", space: "stabilityai/stable-fast-3d", host: "stabilityai-stable-fast-3d.hf.space" },
  { id: "instantmesh", space: "TencentARC/InstantMesh", host: "tencentarc-instantmesh.hf.space" },
] as const;
const settings = {
  trellis2: { image_to_3d: { seed: 42, resolution: "1024", ss_guidance_strength: 7.5, ss_guidance_rescale: 0.7, ss_sampling_steps: 12, ss_rescale_t: 5, shape_slat_guidance_strength: 7.5, shape_slat_guidance_rescale: 0.5, shape_slat_sampling_steps: 12, shape_slat_rescale_t: 3, tex_slat_guidance_strength: 1, tex_slat_guidance_rescale: 0, tex_slat_sampling_steps: 12, tex_slat_rescale_t: 3 }, extract_glb: { decimation_target: 100000, texture_size: 1024 } },
  hunyuan2: { caption: "", mv_image_front: null, mv_image_back: null, mv_image_left: null, mv_image_right: null, steps: 30, guidance_scale: 5, seed: 42, octree_resolution: 256, check_box_rembg: true, num_chunks: 8000, randomize_seed: false },
  sf3d: { fr: 0.85 }, instantmesh: { do_remove_background: true, sample_steps: 75, sample_seed: 42 },
};

function fileUrl(data: unknown, host: string): string | null {
  // Accept only an explicit HTTPS artifact URL on this candidate's own host.
  if (typeof data === "string") {
    try { const u = new URL(data); return u.protocol === "https:" && u.hostname === host && !u.username && !u.password && (!u.port || u.port === "443") && u.pathname.toLowerCase().endsWith(".glb") ? u.href : null; } catch { return null; }
  }
  if (Array.isArray(data)) {
    const order = data.length > 1 ? [data[1], data[0], ...data.slice(2)] : data;
    for (const item of order) { const url = fileUrl(item, host); if (url) return url; }
  } else if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of ["url", "value", "path"]) { const url = fileUrl(obj[key], host); if (url) return url; }
  }
  return null;
}

async function main() {
  const [mode, output] = process.argv.slice(2);
  if (!["--anonymous-public-pilot", "--sf3d-workflow-diagnostic", "--sf3d-foreground-diagnostic"].includes(mode) || !output) throw new Error("Explicit anonymous pilot mode and NEW output directory required");
  const bytes = await readFile(input);
  if (createHash("sha256").update(bytes).digest("hex") !== expectedHash) throw new Error("Public benchmark hash mismatch");
  await mkdir(output, { recursive: false });
  const ratio = mode === "--sf3d-foreground-diagnostic" ? 0.65 : 0.85;
  const selected = mode !== "--anonymous-public-pilot" ? specs.filter(s => s.id === "sf3d") : specs;
  const manifest = { race_id: mode === "--sf3d-foreground-diagnostic" ? "diagnostic-003" : mode === "--sf3d-workflow-diagnostic" ? "diagnostic-002" : "race-001", foreground_ratio: ratio, runner_sha256: createHash("sha256").update(await readFile("scripts/run-model-race.ts")).digest("hex"), started_at: new Date().toISOString(), input_sha256: expectedHash, provenance: "Public Middlebury DinoRing dinoR0001.png", authentication: "anonymous, no credentials loaded", settings: { ...settings, sf3d: { fr: ratio } }, specs: selected, sf3d_workflow: "prepare-remove-if-needed-generate-v2", provider_deadline_ms: 180000, artifact_fetch_deadline_ms: 30000, retries: 0, automatic_promotion: false };
  await writeFile(path.join(output, "manifest.json"), JSON.stringify(manifest, null, 2));
  const results = await Promise.all(selected.map(async spec => {
    const started = performance.now();
    let stage = "connect"; let attempted = false; let receiptSeconds: number | null = null;
    const events: { stage: string; seconds: number }[] = [];
    const elapsed = () => Number(((performance.now() - started) / 1000).toFixed(3));
    const base = { candidate: spec.id, artifact_success_reward: null as number | null, visual_reward: null, cost_usd: null, automatic_promotion: false, events };
    let result: Record<string, unknown>;
    try {
      const url = await withProviderDeadline(async signal => {
        const client = await Client.connect(spec.space); signal.throwIfAborted();
        stage = "schema";
        const api = await client.view_api(); signal.throwIfAborted();
        const schema = api as unknown as { named_endpoints?: Record<string, { parameters?: { parameter_name?: string; parameter_has_default?: boolean }[] }> };
        // Persist endpoint parameter names only, never arbitrary upstream descriptions or examples.
        await writeFile(path.join(output, spec.id + "-schema.json"), JSON.stringify(Object.fromEntries(Object.entries(schema.named_endpoints ?? {}).map(([name, e]) => [name, e.parameters?.map(p => ({ name: p.parameter_name, has_default: p.parameter_has_default }))])), null, 2));
        const step = async (endpoint: string, payload: Record<string, unknown> | unknown[]) => {
          signal.throwIfAborted(); stage = endpoint;
          const params = schema.named_endpoints?.[endpoint]?.parameters;
          if (!params || (!Array.isArray(payload) && Object.keys(payload).some(key => !params.some(p => p.parameter_name === key)))) throw new Error("schema_mismatch");
          if (!Array.isArray(payload) && params.some(p => p.parameter_name && !p.parameter_has_default && !(p.parameter_name in payload))) throw new Error("schema_mismatch");
          attempted = true; events.push({ stage: "submit " + endpoint, seconds: elapsed() });
          const response = await predictGradio(client, signal, endpoint, payload);
          events.push({ stage: "complete " + endpoint, seconds: elapsed() });
          return response.data as unknown[];
        };
        const image = new Blob([bytes], { type: "image/png" });
        let data: unknown;
        if (spec.id === "hunyuan2") data = await step("/generation_all", { ...settings.hunyuan2, image });
        else if (spec.id === "sf3d") data = (await generateStableFast3d(async (endpoint, payload) => ({ data: await step(endpoint, payload) }), image, ratio)).data;
        else if (spec.id === "instantmesh") {
          const pre = await step("/preprocess", { input_image: image, do_remove_background: true });
          if (!pre?.[0]) throw new Error("missing_preprocess_result");
          await step("/generate_mvs", { input_image: pre[0], sample_steps: 75, sample_seed: 42 });
          data = await step("/make3d", {});
        } else {
          await step("/start_session", {});
          const pre = await step("/preprocess_image", { input: image });
          if (!pre?.[0]) throw new Error("missing_preprocess_result");
          await step("/image_to_3d", { image: pre[0], ...settings.trellis2.image_to_3d });
          data = await step("/extract_glb", settings.trellis2.extract_glb);
        }
        const artifact = fileUrl(data, spec.host);
        if (!artifact) throw new Error("missing_safe_artifact_url");
        receiptSeconds = elapsed(); return artifact;
      }, 180000, spec.id);
      stage = "download";
      const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(30000) });
      if (!response.ok) { await response.body?.cancel(); throw new Error("artifact_download_failed"); }
      const asset = await readBoundedResponse(response, 100 * 1024 * 1024);
      stage = "inspect";
      const inspection = inspectGlbBuffer(asset);
      const metadata = evaluateQualityReward(inspection.geometry, inspection.ok);
      if (!inspection.ok || !metadata.eligible) throw new Error("invalid_artifact_metadata");
      await writeFile(path.join(output, spec.id + ".glb"), asset, { flag: "wx" });
      result = { ...base, status: "downloaded_pending_import", attempted, elapsed_seconds: elapsed(), artifact_receipt_seconds: receiptSeconds, artifact_sha256: createHash("sha256").update(asset).digest("hex"), metadata, inspection, import_verified: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const ownCodes = ["schema_mismatch", "missing_preprocess_result", "missing_safe_artifact_url", "artifact_download_failed", "invalid_artifact_metadata"];
      result = { ...base, status: error instanceof ProviderDeadlineError ? "timeout" : "failed", attempted, failed_stage: stage, elapsed_seconds: elapsed(), artifact_receipt_seconds: receiptSeconds, artifact_success_reward: attempted ? 0 : null, error: ownCodes.includes(message) ? message : hfFailureMessage(error), remote_completion: "unknown" };
    }
    await writeFile(path.join(output, spec.id + "-result.json"), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
    return result;
  }));
  await writeFile(path.join(output, "results.json"), JSON.stringify({ ...manifest, results, visual_winner: null, decision: "inspect artifacts before ranking; failures are not visual scores" }, null, 2));
}
main().then(() => process.exit(0)).catch(() => { console.error("Race setup failed; no further attempts. Inspect existing output before retrying."); process.exit(1); });
