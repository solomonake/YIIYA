import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Document, NodeIO } from "@gltf-transform/core";
import { GET } from "@/app/api/3d/convert/route";

const source = "https://stabilityai-stable-fast-3d.hf.space/output.glb";
let artifact: Buffer;
// CI is self-contained. A separate recorded run can exercise the real model.
const realArtifactPath = process.env.YIIYA_TEST_GLB_PATH;
beforeAll(async () => {
  if (realArtifactPath) { artifact = readFileSync(realArtifactPath); return; }
  const doc = new Document();
  const buffer = doc.createBuffer();
  const position = doc.createAccessor().setType("VEC3")
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])).setBuffer(buffer);
  const mesh = doc.createMesh().addPrimitive(doc.createPrimitive().setAttribute("POSITION", position));
  doc.createScene().addChild(doc.createNode().setMesh(mesh));
  artifact = Buffer.from(await new NodeIO().writeBinary(doc));
});
const fetcher = vi.fn();
function request(from = source, to = "glb") {
  return new NextRequest(`https://yiiya.test/api/3d/convert?from=${encodeURIComponent(from)}&to=${to}`);
}
beforeEach(() => { vi.stubGlobal("fetch", fetcher); fetcher.mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("download delivery through the actual conversion route", () => {
  it("does not download an upstream HTML error page as a successful GLB", async () => {
    fetcher.mockResolvedValue(new Response("<!DOCTYPE html><html>Expired model</html>"));
    const response = await GET(request());
    expect(response.status).toBe(502);
    expect(response.headers.get("content-disposition")).toBeNull();
  });
  it("does not download a truncated generated mesh as a successful GLB", async () => {
    fetcher.mockResolvedValue(new Response(new Uint8Array(artifact.subarray(0, artifact.length - 1))));
    expect((await GET(request())).status).toBe(502);
  });
  it.each(["/api/status", "/api/3d/convert?from=x", "/api/3d/proxy?src=https%3A%2F%2Fevil.test%2Fx", "/api/../api/status"])(
    "rejects non-artifact local source %s before network access", async from => {
      fetcher.mockResolvedValue(new Response(new Uint8Array(artifact)));
      expect((await GET(request(from))).status).toBe(400);
      expect(fetcher).not.toHaveBeenCalled();
    }
  );
  it("rejects unsupported output formats before downloading a large model", async () => {
    fetcher.mockResolvedValue(new Response(new Uint8Array(artifact)));
    expect((await GET(request(source, "zip"))).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("preserves every byte of the valid GLB artifact", async () => {
    fetcher.mockResolvedValue(new Response(new Uint8Array(artifact)));
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).equals(artifact)).toBe(true);
    expect(response.headers.get("content-disposition")).toContain("model.glb");
  });
  it.each(["obj", "stl"])("converts the artifact via its proxy link to %s", async format => {
    fetcher.mockResolvedValue(new Response(new Uint8Array(artifact)));
    const response = await GET(request(`/api/3d/proxy?src=${encodeURIComponent(source)}`, format));
    expect(fetcher).toHaveBeenCalledWith(source, expect.anything());
    expect(response.status).toBe(200);
    const triangles = realArtifactPath ? 20620 : 1;
    expect(response.headers.get("X-Yiiya-Triangles")).toBe(String(triangles));
    const body = Buffer.from(await response.arrayBuffer());
    if (format === "obj") {
      expect(body.toString("utf8").split("\n").filter(line => line.startsWith("f "))).toHaveLength(triangles);
    } else {
      expect(body.readUInt32LE(80)).toBe(triangles);
      expect(body.length).toBe(84 + 50 * triangles);
    }
  });
});
