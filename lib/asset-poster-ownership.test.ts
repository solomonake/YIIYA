import { NextRequest } from "next/server";
import { expect, it, vi } from "vitest";
import { POST } from "@/app/api/assets/poster/route";
import { put } from "@vercel/blob";

vi.mock("@/lib/auth/verify-request", () => ({ getUserIdFromAuthHeader: () => "visitor-b" }));
vi.mock("@/lib/vercel-blob", () => ({ isVercelBlobConfigured: () => true }));
vi.mock("@vercel/blob", () => ({ put: vi.fn(async () => ({ url: "https://test.invalid/poster.png" })) }));
vi.mock("@/lib/supabase-server", () => ({ serviceClient: () => ({ from: () => ({
  select() { return this; }, eq() { return this; }, abortSignal() { return this; },
  maybeSingle: async () => ({ data: null, error: null })
}) }) }));
vi.mock("@/lib/assets/persist", () => ({ attachPosterUrl: async () => false }));

it("rejects another visitor's asset before writing a thumbnail to storage", async () => {
  const response = await POST(new NextRequest("http://localhost/api/assets/poster", {
    method: "POST", body: JSON.stringify({
      assetId: "8045ae6f-990d-4908-b17e-a2e21fee587c", dataUrl: "data:image/png;base64,aQ=="
    })
  }));
  expect(response.status).toBe(404);
  expect(put).not.toHaveBeenCalled();
});
