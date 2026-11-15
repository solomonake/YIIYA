/** Public metadata GETs only: no credentials, uploads or generation submissions. */
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const candidates = [
  { id: 'trellis2', space: 'microsoft/TRELLIS.2', host: 'microsoft-trellis-2.hf.space', endpoints: ['start_session', 'preprocess_image', 'image_to_3d', 'extract_glb'] },
  { id: 'hunyuan2', space: 'tencent/Hunyuan3D-2', host: 'tencent-hunyuan3d-2.hf.space', endpoints: ['generation_all'] },
  { id: 'sf3d', space: 'stabilityai/stable-fast-3d', host: 'stabilityai-stable-fast-3d.hf.space', endpoints: ['requires_bg_remove'] },
  { id: 'instantmesh', space: 'TencentARC/InstantMesh', host: 'tencentarc-instantmesh.hf.space', endpoints: ['preprocess', 'generate_mvs', 'make3d'] },
];

async function getJson(url) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (!response.ok) { await response.body?.cancel(); throw new Error('http_' + response.status); }
  if (!response.body) throw new Error('empty_body');
  const reader = response.body.getReader();
  const parts = []; let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 2 * 1024 * 1024) throw new Error('metadata_too_large');
      parts.push(value);
    }
    return JSON.parse(Buffer.concat(parts).toString('utf8'));
  } finally { void reader.cancel().catch(() => undefined); }
}

async function inspect(candidate) {
  const started = performance.now();
  const results = await Promise.allSettled([
    getJson('https://huggingface.co/api/spaces/' + candidate.space),
    getJson('https://' + candidate.host + '/config'),
  ]);
  const [hub, config] = results.map(r => r.status === 'fulfilled' ? r.value : null);
  const exposed = Array.isArray(config?.dependencies)
    ? config.dependencies.map(d => d.api_name).filter(n => typeof n === 'string') : null;
  const missing = exposed ? candidate.endpoints.filter(n => !exposed.includes(n)) : null;
  return {
    ...candidate, checked_at: new Date().toISOString(),
    metadata_elapsed_seconds: Number(((performance.now() - started) / 1000).toFixed(3)),
    hub_metadata_read: results[0].status === 'fulfilled', config_read: results[1].status === 'fulfilled',
    space_revision: typeof hub?.sha === 'string' ? hub.sha : null,
    advertised_runtime: typeof hub?.runtime?.stage === 'string' ? hub.runtime.stage : null,
    gradio_version: typeof config?.version === 'string' ? config.version : null,
    missing_endpoints: missing,
    endpoint_names_match: missing !== null && missing.length === 0,
    // Do not save arbitrary page text/errors or equate endpoint names with a validated schema.
    parameter_schema_verified: false, token_acceptance_verified: false,
    generation_attempted: false, artifact_reward: null, visual_reward: null,
  };
}

async function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error('Usage: node scripts/preflight-model-race.mjs input.png NEW-output-directory');
  const info = await stat(input);
  if (!info.isFile() || info.size > 10 * 1024 * 1024) throw new Error('Input must be a file <=10 MiB');
  const image = await readFile(input);
  if (image.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Expected PNG input');
  await mkdir(output, { recursive: false });
  const report = {
    race_id: 'race-001', phase: 'metadata_preflight', generation_status: 'not_started',
    recorded_at: new Date().toISOString(), input_filename: path.basename(input),
    input_sha256: createHash('sha256').update(image).digest('hex'),
    input_uploaded: false, credentials_loaded: false, candidates: await Promise.all(candidates.map(inspect)),
    winner: null, automatic_promotion: false,
    limitations: 'Reachable metadata does not establish accepted credentials, quota, model execution, output quality or production readiness.',
  };
  await writeFile(path.join(output, 'preflight.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(report, null, 2));
  if (report.candidates.some(c => !c.endpoint_names_match)) process.exitCode = 2;
}
main().catch(() => { console.error('Preflight failed; check local input/output paths and network access. No generation was submitted.'); process.exitCode = 1; });
