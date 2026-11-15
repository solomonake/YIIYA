import { describe, expect, it } from "vitest";
import { generationMode, providerOrder } from "./generation-policy";
import { missingProductionRequirements } from "./production-readiness";

describe("3D spending policy", () => {
  it("does not require paid generation credentials for free-only readiness", () => {
    const missing = missingProductionRequirements("lab", {}).map(item => item.name);
    expect(missing).toContain("HUGGINGFACE_TOKEN");
    expect(missing).not.toContain("FAL_KEY");
    expect(missing).not.toContain("TRIPO_API_KEY");
    expect(missing).not.toContain("SCAN_RECONSTRUCTION_ENDPOINT");
    expect(missingProductionRequirements("lab", { YIIYA_3D_MODE: "mixed" }).map(item => item.name)).toContain("FAL_KEY");
  });
  it.each([undefined, "", "free-only", "typo", "MIXED"])("fails closed for mode %s", mode => {
    const env = { YIIYA_3D_MODE: mode, YIIYA_FREE_FIRST: "1" };
    expect(generationMode(env)).toBe("free-only");
    for (const person of [false, true]) {
      expect(providerOrder(person, env)[0]).toBe("hf-trellis2");
      expect(providerOrder(person, env).every(key => key.startsWith("hf-"))).toBe(true);
    }
  });

  it("filters paid, unknown, and duplicate override entries even for faces", () => {
    expect(providerOrder(true, {
      YIIYA_PROVIDER_ORDER: "fal-hunyuan-mv,meshy,tripo,hf-hunyuan,future-paid,hf-hunyuan,hf-trellis2"
    })).toEqual(["hf-hunyuan", "hf-trellis2"]);
  });

  it("does not turn a paid-only override into paid calls or an implicit fallback", () => {
    expect(providerOrder(false, { YIIYA_PROVIDER_ORDER: "meshy,fal-rodin" })).toEqual([]);
  });

  it("requires an explicit server-side mixed mode to enable commercial routes", () => {
    expect(providerOrder(true, { YIIYA_3D_MODE: "mixed" })).toContain("fal-rodin");
    expect(providerOrder(false, {
      YIIYA_3D_MODE: "mixed", YIIYA_PROVIDER_ORDER: "meshy"
    })).toEqual(["meshy"]);
  });
});
