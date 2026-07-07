import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase-server", () => ({
  serviceClient: vi.fn()
}));

import { serviceClient } from "@/lib/supabase-server";
import { saveGeneratedAsset, attachPosterUrl } from "./persist";
import type { GeneratedAsset } from "@/lib/interpret-pipeline";

const baseAsset: GeneratedAsset = {
  id: "asset-1",
  name: "red apple",
  glbUrl: "https://blob.example.com/apple.glb",
  tier: "trellis",
  materialBrief: { baseColor: "#ff0000", metalness: 0, roughness: 0.5, textureStyle: "pbr" },
  exportUrls: { glb: "https://blob.example.com/apple.glb" },
  scaleMeters: 0.1
};

describe("saveGeneratedAsset", () => {
  beforeEach(() => {
    vi.mocked(serviceClient).mockReset();
  });

  it("never persists a failed (fallback tier) generation", async () => {
    const id = await saveGeneratedAsset("user-1", "a red apple", null, {
      ...baseAsset,
      tier: "fallback"
    });
    expect(id).toBeNull();
    expect(serviceClient).not.toHaveBeenCalled();
  });

  it("returns null when Supabase isn't configured", async () => {
    vi.mocked(serviceClient).mockReturnValue(null);
    const id = await saveGeneratedAsset("user-1", "a red apple", null, baseAsset);
    expect(id).toBeNull();
  });

  it("inserts a row scoped to the owner and returns its id", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: "db-asset-1" }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });
    vi.mocked(serviceClient).mockReturnValue({ from } as never);

    const id = await saveGeneratedAsset("user-1", "a red apple", "session-1", baseAsset);

    expect(id).toBe("db-asset-1");
    expect(from).toHaveBeenCalledWith("assets");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ owner_id: "user-1", session_id: "session-1", tier: "trellis" })
    );
  });
});

describe("attachPosterUrl", () => {
  beforeEach(() => {
    vi.mocked(serviceClient).mockReset();
  });

  it("returns false when no row matched (wrong owner or missing asset)", async () => {
    const eq2 = vi.fn().mockResolvedValue({ error: null, count: 0 });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const update = vi.fn().mockReturnValue({ eq: eq1 });
    const from = vi.fn().mockReturnValue({ update });
    vi.mocked(serviceClient).mockReturnValue({ from } as never);

    const ok = await attachPosterUrl("user-1", "not-mine", "https://blob.example.com/poster.png");
    expect(ok).toBe(false);
  });

  it("returns true when the update matched a row", async () => {
    const eq2 = vi.fn().mockResolvedValue({ error: null, count: 1 });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const update = vi.fn().mockReturnValue({ eq: eq1 });
    const from = vi.fn().mockReturnValue({ update });
    vi.mocked(serviceClient).mockReturnValue({ from } as never);

    const ok = await attachPosterUrl("user-1", "asset-1", "https://blob.example.com/poster.png");
    expect(ok).toBe(true);
  });
});
