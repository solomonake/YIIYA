import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/security/scan-access", () => ({ authorizeScanAccess: vi.fn() }));
import type { AssetJob } from "@/lib/asset-jobs";
import { authorizeScanAccess } from "@/lib/security/scan-access";
import { GET } from "@/app/api/asset-jobs/[id]/artifacts/[artifactId]/route";
import { GET as getJob } from "@/app/api/asset-jobs/[id]/route";

function makeJob(overrides: Partial<AssetJob> = {}): AssetJob {
  const now = new Date().toISOString();

  return {
    id: "assetjob-test",
    lane: "cad",
    destination: "cad",
    state: "complete",
    phase: "package",
    progress: 1,
    summary: {
      rawTranscript: "Design a compact desk lamp",
      normalizedPrompt: "Design a compact desk lamp",
      concise: "Compact desk lamp",
      userVisible: "Desk lamp",
      warnings: []
    },
    brief: {
      sourceKind: "text",
      lane: "cad",
      destination: "cad",
      objectName: "Desk Lamp",
      summary: "Compact desk lamp",
      functionalIntent: "Create an importable hard-surface asset.",
      dimensions: {
        unit: "cm",
        width: 18,
        depth: 18,
        height: 34
      },
      constraints: [],
      partSemantics: ["base", "stem", "shade"],
      materialTargets: [],
      motionTargets: [],
      exportTargets: ["glb", "step", "stl"],
      qualityTargets: {
        topology: "cad_surface",
        texture: "none",
        manufacturable: true,
        riggable: false,
        cadFriendly: true
      },
      readiness: {
        score: 80,
        label: "handoff",
        checks: []
      },
      fallbackPolicy: {
        rerouteTo: "mesh",
        reason: "Fallback to mesh if the CAD worker cannot compile a closed solid.",
        maxRepairAttempts: 2
      }
    },
    routePlan: {
      lane: "cad",
      destination: "cad",
      preview: {
        label: "CAD preview",
        provider: "cadquery-worker",
        detail: "Compile a tessellated preview."
      },
      final: {
        label: "CAD final",
        provider: "cadquery-worker",
        detail: "Compile STEP, STL, and CadQuery outputs."
      },
      validation: [],
      exportPack: ["glb", "step", "stl"],
      qaFocus: [],
      boundedAgents: ["summarizer", "router", "planner", "qa"],
      confidence: 0.8
    },
    inputs: {
      prompt: "Design a compact desk lamp",
      sourceKind: "text",
      referenceImage: false,
      scanId: "scan-owned"
    },
    artifacts: [],
    validation: [],
    handoff: {
      headline: "Desk lamp ready",
      notes: []
    },
    warnings: [],
    error: null,
    provider: "cadquery-worker",
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

describe("asset artifact route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(authorizeScanAccess).mockResolvedValue(null);
    (globalThis as typeof globalThis & { __yiiyaAssetJobs?: Map<string, AssetJob> }).__yiiyaAssetJobs =
      new Map();
  });

  function store(job: AssetJob) {
    (globalThis as typeof globalThis & { __yiiyaAssetJobs?: Map<string, AssetJob> }).__yiiyaAssetJobs?.set(
      job.id,
      job
    );
  }

  it("refuses a caller who is not the scan's owner on both job routes", async () => {
    const job = makeJob({
      artifacts: [
        {
          id: "print-stl",
          label: "Print STL",
          kind: "stl",
          format: "stl",
          mimeType: "model/stl",
          status: "ready",
          inlineBase64: Buffer.from("solid x\nendsolid x\n").toString("base64"),
          fileName: "model.stl"
        }
      ]
    });
    store(job);
    vi.mocked(authorizeScanAccess).mockResolvedValue(new Response("denied", { status: 403 }));

    const artifact = await GET(new Request("http://localhost/test"), {
      params: { id: job.id, artifactId: "print-stl" }
    });
    const detail = await getJob(new Request("http://localhost/test"), { params: { id: job.id } });

    expect(artifact.status).toBe(403);
    expect(detail.status).toBe(403);
    expect(vi.mocked(authorizeScanAccess)).toHaveBeenCalledWith(expect.any(Request), "scan-owned");
  });

  it("treats a job with no scan behind it as not found", async () => {
    const job = makeJob({ inputs: { ...makeJob().inputs, scanId: null } });
    store(job);

    const detail = await getJob(new Request("http://localhost/test"), { params: { id: job.id } });

    expect(detail.status).toBe(404);
    expect(vi.mocked(authorizeScanAccess)).not.toHaveBeenCalled();
  });

  it("serves inline glb bytes without attachment headers", async () => {
    const body = Buffer.from([0x67, 0x6c, 0x54, 0x46]);
    const job = makeJob({
      artifacts: [
        {
          id: "preview-glb",
          label: "Preview GLB",
          kind: "preview",
          format: "glb",
          mimeType: "model/gltf-binary",
          status: "ready",
          inlineBase64: body.toString("base64"),
          fileName: "preview.glb"
        }
      ]
    });

    (globalThis as typeof globalThis & { __yiiyaAssetJobs?: Map<string, AssetJob> }).__yiiyaAssetJobs?.set(
      job.id,
      job
    );

    const response = await GET(new Request("http://localhost/test"), {
      params: { id: job.id, artifactId: "preview-glb" }
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("model/gltf-binary");
    expect(response.headers.get("Content-Length")).toBe(String(body.byteLength));
    expect(response.headers.get("Content-Disposition")).toBeNull();
    expect(Buffer.from(await response.arrayBuffer())).toEqual(body);
  });

  it("serves inline STL bytes as an attachment", async () => {
    const body = Buffer.from("solid lamp\nendsolid lamp\n", "utf8");
    const job = makeJob({
      artifacts: [
        {
          id: "print-stl",
          label: "Print STL",
          kind: "stl",
          format: "stl",
          mimeType: "model/stl",
          status: "ready",
          inlineBase64: body.toString("base64"),
          fileName: "model.stl"
        }
      ]
    });

    (globalThis as typeof globalThis & { __yiiyaAssetJobs?: Map<string, AssetJob> }).__yiiyaAssetJobs?.set(
      job.id,
      job
    );

    const response = await GET(new Request("http://localhost/test"), {
      params: { id: job.id, artifactId: "print-stl" }
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("model/stl");
    expect(response.headers.get("Content-Disposition")).toContain('filename="model.stl"');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(body);
  });
});
