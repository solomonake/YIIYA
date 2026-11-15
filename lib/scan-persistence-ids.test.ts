import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { rest, rows } = vi.hoisted(() => ({rest: vi.fn(), rows: [] as Record<string, unknown>[]}));
vi.mock("@/lib/supabase-rest", () => ({isSupabaseRestConfigured: () => true, supabaseRestFetch: rest}));
import { createScanJob } from "./scan-job-store";
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
beforeEach(() => {
  rows.length = 0;
  rest.mockImplementation(async (table: string, options: RequestInit) => {
    const row = JSON.parse(options.body as string);
    if (!uuid.test(row.id) || (row.session_id && !uuid.test(row.session_id))) {
      return new Response(JSON.stringify({code:"22P02",message:"invalid input syntax for type uuid"}),{status:400});
    }
    rows.push({...row,table});
    return Response.json([row]);
  });
});
afterEach(() => vi.unstubAllGlobals());
it.each([false,true])("creates schema-compatible session/job IDs without browser crypto=%s", async missing => {
  if (missing) vi.stubGlobal("crypto",undefined);
  const access={ownerId:null,tokenHash:"a".repeat(64),expiresAt:Date.now()+60000};
  const created=await createScanJob("https://yiiya.test","mug",access);
  expect(created.scanId).toMatch(uuid);
  expect(created.job.storageMode).toBe("supabase");
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({table:"scan_sessions",id:created.scanId,metadata_json:{accessTokenHash:access.tokenHash}});
  expect(rows[1]).toMatchObject({table:"scan_jobs",session_id:created.scanId});
  expect(rows[1].id).not.toBe(created.scanId);
  expect(created.mobileUrl).toContain(created.scanId);
});
