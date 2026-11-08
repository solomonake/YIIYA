import { afterEach, expect, it, vi } from "vitest";
import { runInterpretPipeline, type PipelineEvent } from "./interpret-pipeline";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("returns a failure instead of delivering a placeholder when providers cannot return a model", async () => {
  for (const key of ["GOOGLE_GENERATIVE_AI_API_KEY","GEMINI_API_KEY","GOOGLE_API_KEY","FAL_KEY","TRIPO_API_KEY","MESHY_API_KEY","HUGGINGFACE_TOKEN"]) vi.stubEnv(key, "");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  const events: PipelineEvent[] = [];
  for await (const event of runInterpretPipeline({ transcript: "make a mug", forceGenerate: true,
    referenceImage: { name: "mug.png", mediaType: "image/png", base64: "AAAA" }
  })) events.push(event);
  expect(events.at(-1)).toMatchObject({type:"error", code:"no_mesh"});
  expect(events.some(event => event.type === "asset_ready" || event.type === "done")).toBe(false);
});
