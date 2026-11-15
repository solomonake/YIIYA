import { Document, NodeIO } from "@gltf-transform/core";
import { describe, expect, it } from "vitest";
import { assessGlb, acceptGlbResponse } from "./asset-acceptance";
import { GET as proxy } from "@/app/api/3d/proxy/route";
import { NextRequest } from "next/server";
import { vi } from "vitest";
import { readFileSync } from "node:fs";

async function fixture(points = [0,0,0, 1,0,0, 0,1,0]) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const pos = doc.createAccessor().setType("VEC3").setArray(new Float32Array(points)).setBuffer(buffer);
  const mesh = doc.createMesh().addPrimitive(doc.createPrimitive().setAttribute("POSITION", pos));
  doc.createScene().addChild(doc.createNode().setMesh(mesh));
  return new NodeIO().writeBinary(doc);
}
describe("file acceptance contract", () => {
  it("accepts a real triangle with a reproducible receipt without inventing fidelity", async () => {
    const bytes = await fixture();
    const result = await assessGlb(bytes);
    expect(result).toMatchObject({status:"accepted", triangles:1, fidelity:"not_assessed", printability:"not_assessed"});
    expect((await assessGlb(bytes)).sha256).toBe(result.sha256);
    expect(result.sha256).toHaveLength(64);
  });
  it("decodes Draco-compressed geometry before accepting it", async () => {
    const { KHRDracoMeshCompression } = await import("@gltf-transform/extensions");
    const { draco } = await import("@gltf-transform/functions");
    const draco3d = (await import("draco3dgltf")).default;
    const io = new NodeIO().registerExtensions([KHRDracoMeshCompression]).registerDependencies({
      "draco3d.encoder": await draco3d.createEncoderModule()
    });
    const doc = await io.readBinary(await fixture());
    await doc.transform(draco());
    expect((await assessGlb(await io.writeBinary(doc))).status).toBe("accepted");
  });
  it("rejects corrupt binary positions even with valid metadata", async () => {
    const bytes = await fixture();
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    view.setFloat32(20 + view.getUint32(12, true) + 8, NaN, true);
    expect((await assessGlb(bytes)).status).toBe("rejected");
  });
  it("rejects geometry collapsed by its world transform", async () => {
    const doc = await new NodeIO().readBinary(await fixture());
    doc.getRoot().listNodes()[0].setScale([0,0,0]);
    expect((await assessGlb(await new NodeIO().writeBinary(doc))).status).toBe("rejected");
  });
  it("rejects completely degenerate geometry", async () => {
    expect((await assessGlb(await fixture([0,0,0, 0,0,0, 0,0,0]))).status).toBe("rejected");
  });
  it("rejects external resource links without reading them", async () => {
    const doc = new Document();
    const bytes = await new NodeIO().writeBinary(doc);
    const json = JSON.stringify({asset:{version:"2.0"},buffers:[{uri:"file:///etc/passwd",byteLength:12}]});
    const padded = json.padEnd(Math.ceil(json.length/4)*4);
    const out = Buffer.alloc(20+padded.length);
    out.writeUInt32LE(0x46546c67);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);
    out.writeUInt32LE(padded.length,12);out.writeUInt32LE(0x4e4f534a,16);out.write(padded,20);
    expect((await assessGlb(out)).issues).toContain("External resources must be embedded");
    expect(bytes.length).toBeGreaterThan(0);
  });
  it("rejects excessive declared decoded work before geometry decoding", async () => {
    const json = JSON.stringify({asset:{version:"2.0"},accessors:[{count:10000001}]}).padEnd(92);
    const padded = json.padEnd(Math.ceil(json.length/4)*4);
    const bytes = Buffer.alloc(20+padded.length);
    bytes.writeUInt32LE(0x46546c67);bytes.writeUInt32LE(2,4);bytes.writeUInt32LE(bytes.length,8);
    bytes.writeUInt32LE(padded.length,12);bytes.writeUInt32LE(0x4e4f534a,16);bytes.write(padded,20);
    expect((await assessGlb(bytes)).issues).toContain("Decoded geometry exceeds inspection budget");
  });
  it("rejects truncation before returning accepted bytes", async () => {
    const bytes = await fixture();
    await expect(acceptGlbResponse(new Response(bytes.slice(0,-1)))).rejects.toThrow();
    await expect(acceptGlbResponse(new Response(bytes), 24)).rejects.toThrow();
  });
  it("does not start successful delivery for invalid content and recovers on a valid retry", async () => {
    const bytes = await fixture();
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(bytes.slice(0,-1)))
      .mockResolvedValueOnce(new Response(bytes));
    vi.stubGlobal("fetch", fetcher);
    try {
      const request = () => new NextRequest("https://yiiya.test/api/3d/proxy?src=https://stabilityai-stable-fast-3d.hf.space/model.glb");
      expect((await proxy(request())).status).toBe(502);
      const response = await proxy(request());
      expect(response.status).toBe(200);
      expect(response.headers.get("X-Yiiya-SHA256")).toBe((await assessGlb(bytes)).sha256);
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    } finally { vi.unstubAllGlobals(); }
  });
  it("inspects the shipped mug without provider calls", async () => {
    const bytes = readFileSync("public/photo-lab/mug/baseline.glb");
    expect((await assessGlb(bytes)).status).toBe("accepted");
  });
});
