/** Runs against a disposable loopback Auth/PostgREST stack. The runner restarts
 * its services between phases and supplies fresh, synthetic test credentials. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { getUserIdFromAuthHeader } from "@/lib/auth/verify-request";
import { saveGeneratedAsset, attachPosterUrl } from "@/lib/assets/persist";
import { readOwnedAsset } from "@/lib/assets/read-owned-asset";
import { POST as savePoster } from "@/app/api/assets/poster/route";
import { buildExportUrls } from "@/lib/scene/export-urls";
import { evaluateQualityReward } from "@/lib/scene/quality-reward";
import { inspectGlbBuffer } from "@/lib/scene/glb-inspect";

const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
assert.equal(url.origin, "http://127.0.0.1:55442");
const phase = process.env.LOCAL_LIBRARY_PHASE;
assert.ok(phase === "save" || phase === "reopen");
const directory = process.env.LOCAL_LIBRARY_CASE!;
const password = process.env.LOCAL_LIBRARY_PASSWORD!;
assert.ok(password && directory && process.env.SUPABASE_SERVICE_ROLE_KEY);
const client = () => createClient(url.origin, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});
const state = join(directory, "asset.json");
const expectedHash = "ee3b0849d9b7f70b85d1d3a6cfa4ba4624e540db155478faf654c9c7b10b7a77";
const artifactUrl = `${url.origin}/artifact/dinosaur.glb`;
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

async function visitor(label: string) {
  const api = client();
  const credentials = { email: `yiiya-${label}@example.test`, password };
  if (phase === "save") {
    const created = await api.auth.signUp(credentials);
    assert.ok(!created.error, `Sign-up failed for ${label}: ${created.error?.code}`);
  }
  const login = await api.auth.signInWithPassword(credentials);
  assert.ok(!login.error && login.data.session, `Sign-in failed for ${label}: ${login.error?.code}`);
  const authorization = `Bearer ${login.data.session.access_token}`;
  const userId = await getUserIdFromAuthHeader(new Request(url, { headers: { authorization } }));
  assert.equal(userId, login.data.user.id);
  return { api, authorization, userId: login.data.user.id };
}
async function run() {
  const owner = await visitor("owner");
  const other = await visitor("other");
  assert.notEqual(owner.userId, other.userId);
  if (phase === "save") {
    const response = await fetch(artifactUrl);
    assert.equal(response.status, 200);
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.equal(digest(bytes), expectedHash);
    const inspection = inspectGlbBuffer(bytes, bytes.byteLength);
    assert.ok(inspection.ok && inspection.geometry);
    const qualityReward = evaluateQualityReward(inspection.geometry, true);
    const id = await saveGeneratedAsset(owner.userId, "Public DinoRing dinosaur", null, {
      id: "dino", name: "DinoRing dinosaur", tier: "library", glbUrl: artifactUrl,
      triangleCount: inspection.geometry.triangles, materialBrief: { baseColor: "#808080",
        metalness: 0, roughness: 0.7, textureStyle: "pbr-realistic" },
      exportUrls: buildExportUrls(artifactUrl), scaleMeters: 1, qualityReward
    });
    assert.ok(id, "YIIYA failed to save the generated asset");
    writeFileSync(state, JSON.stringify({ id, ownerId: owner.userId, otherId: other.userId }));
    console.log("Two users signed in and YIIYA saved the dinosaur to PostgreSQL.");
    return;
  }
  const saved = JSON.parse(readFileSync(state, "utf8"));
  assert.equal(saved.ownerId, owner.userId);
  assert.equal(saved.otherId, other.userId);
  const row = await readOwnedAsset(owner.api, owner.userId, saved.id, AbortSignal.timeout(5000));
  assert.ok(!row.error && row.data, `Owner reopen failed: ${row.error?.code}`);
  assert.equal(row.data.triangle_count, 20620);
  assert.equal(row.data.brief_json.qualityReward.reward, 1);
  assert.equal(row.data.glb_url, artifactUrl);
  const download = await fetch(row.data.glb_url);
  assert.equal(download.status, 200);
  const bytes = new Uint8Array(await download.arrayBuffer());
  assert.equal(digest(bytes), expectedHash);
  for (const api of [other.api, client()]) {
    // Deliberately omit the owner's filter to test the database policy itself.
    const leak = await api.from("assets").select("id").eq("id", saved.id);
    assert.ok(!leak.error); assert.deepEqual(leak.data, []);
  }
  const tamper = await other.api.from("assets").update({ object_name: "changed" }).eq("id", saved.id).select("id");
  assert.ok(!tamper.error); assert.deepEqual(tamper.data, []);
  const forgery = await other.api.from("assets").insert({ owner_id: owner.userId, object_name: "forged", prompt: "test", tier: "library", glb_url: artifactUrl });
  assert.equal(forgery.error?.code, "42501");
  assert.equal(await attachPosterUrl(other.userId, saved.id, "https://example.invalid/other"), false);
  const poster = await savePoster(new NextRequest(new URL("/api/assets/poster", url), {
    method: "POST", headers: { authorization: other.authorization }, body: JSON.stringify({ assetId: saved.id, dataUrl: "data:image/png;base64,aQ==" })
  }));
  assert.equal(poster.status, 404);
  const final = await owner.api.from("assets").select("object_name,poster_url").eq("id", saved.id).single();
  assert.deepEqual(final.data, { object_name: "DinoRing dinosaur", poster_url: null });
  writeFileSync(join(directory, "receipt.json"), JSON.stringify({
    test_accounts: 2, real_auth_password_sign_in: true, database_restarted: true,
    owner_read_after_restart: true, other_account_rows: 0, anonymous_rows: 0,
    other_account_updates: 0, forged_owner_insert_sqlstate: forgery.error.code,
    other_account_thumbnail_http: poster.status, glb_bytes: bytes.byteLength,
    glb_sha256: expectedHash, triangles: row.data.triangle_count, saved_metadata_reward: 1,
    artifact_storage: "local disk served over loopback", production_tested: false,
    browser_render_tested: false, new_model_generated: false, visual_reward: null
  }, null, 2));
  console.log(`Owner downloaded ${bytes.byteLength} matching bytes. Second user and anonymous reads denied. Cross-owner writes denied.`);
}
run().catch(error => { console.error(error instanceof Error ? error.message : "Library test failed"); process.exitCode = 1; });
