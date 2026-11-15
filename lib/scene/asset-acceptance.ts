import { createHash } from "node:crypto";
import { validateBytes, version } from "gltf-validator";
import { readGlb } from "./mesh-export";
import { openGlbStream } from "./glb-stream";
import { readBoundedResponse } from "@/lib/bounded-response";

export const ACCEPTANCE_CONTRACT = "yiiya-glb-v1";
export type AcceptanceReceipt = {
  contract: typeof ACCEPTANCE_CONTRACT;
  sha256: string;
  sizeBytes: number;
  status: "accepted" | "rejected";
  issues: string[];
  warnings: number;
  validator: string;
  triangles: number;
  fidelity: "not_assessed";
  printability: "not_assessed";
  animationReadiness: "not_assessed";
};

/** Objective file acceptance only. A valid file is not evidence of reference fidelity. */
export async function assessGlb(bytes: Uint8Array): Promise<AcceptanceReceipt> {
  const receipt: AcceptanceReceipt = {
    contract: ACCEPTANCE_CONTRACT, sha256: createHash("sha256").update(bytes).digest("hex"),
    sizeBytes: bytes.byteLength, status: "rejected", issues: [], warnings: 0,
    validator: version(), triangles: 0, fidelity: "not_assessed",
    printability: "not_assessed", animationReadiness: "not_assessed"
  };
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length < 20 || view.getUint32(0, true) !== 0x46546c67 ||
        view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.length ||
        view.getUint32(16, true) !== 0x4e4f534a) throw new Error("Invalid GLB envelope");
    const length = view.getUint32(12, true);
    if (length > 8 * 1024 * 1024 || length + 20 > bytes.length) throw new Error("Invalid GLB JSON length");
    const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));
    // Never resolve a provider-controlled URL or filesystem path during inspection.
    for (const resource of [...(json.buffers ?? []), ...(json.images ?? [])]) {
      if (resource.uri && !String(resource.uri).startsWith("data:")) throw new Error("External resources must be embedded");
    }
    // Bound declared decoded work before invoking native/WASM geometry decoders.
    const accessors = json.accessors ?? [];
    const elementCount = accessors.reduce((sum: number, accessor: { count?: number }) => sum + (accessor.count ?? 0), 0);
    const bufferBytes = (json.buffers ?? []).reduce((sum: number, buffer: { byteLength?: number }) => sum + (buffer.byteLength ?? 0), 0);
    if (!Number.isSafeInteger(elementCount) || elementCount > 10_000_000 ||
        !Number.isSafeInteger(bufferBytes) || bufferBytes > 256 * 1024 * 1024) throw new Error("Decoded geometry exceeds inspection budget");
    const result = await validateBytes(bytes, { format: "glb", maxIssues: 32, writeTimestamp: false,
      externalResourceFunction: async () => { throw new Error("External resources are disabled"); } });
    receipt.warnings = result.issues.numWarnings;
    if (result.issues.truncated) {
      receipt.issues = ["Validation issue limit reached; acceptance is incomplete"];
      return receipt;
    }
    if (result.issues.numErrors > 0) {
      receipt.issues = result.issues.messages.filter(m => m.severity === 0).map(m => m.code);
      return receipt;
    }
    // Decode compressed geometry too: metadata bounds alone can hide NaN or empty meshes.
    const doc = await readGlb(bytes);
    const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
    if (!scene) throw new Error("No renderable scene");
    let useful = 0;
    scene.traverse(node => {
      const world = node.getWorldMatrix();
      if (!world.every(Number.isFinite)) throw new Error("Non-finite world transform");
      for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
        if (primitive.getMode() !== 4) throw new Error("Triangle primitives are required");
        const position = primitive.getAttribute("POSITION");
        if (!position || position.getElementSize() !== 3) throw new Error("Missing triangle positions");
        const indices = primitive.getIndices();
        const count = indices?.getCount() ?? position.getCount();
        if (count % 3) throw new Error("Incomplete triangle");

        for (let i = 0; i < position.getCount(); i++) {
          const point = position.getElement(i, []);
          if (!point.every(Number.isFinite)) throw new Error("Non-finite geometry");

        }
        for (let i = 0; i < count; i += 3) {
          const ids = [0, 1, 2].map(k => indices ? indices.getScalar(i + k) : i + k);
          if (ids.some(id => !Number.isInteger(id) || id < 0 || id >= position.getCount())) throw new Error("Invalid triangle index");
          const [a, b, c] = ids.map(id => {
            const p = position.getElement(id, []);
            return [0, 1, 2].map(k => world[k]*p[0] + world[4+k]*p[1] + world[8+k]*p[2] + world[12+k]);
          });
          const u = b.map((v, k) => v - a[k]); const v = c.map((n, k) => n - a[k]);
          const area = Math.hypot(u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]);
          if (area > 0 && Number.isFinite(area)) useful++;
          receipt.triangles++;
        }
      }
    });
    if (!useful) throw new Error("No non-degenerate triangles");
    receipt.status = "accepted";
  } catch (error) {
    receipt.issues.push(error instanceof Error ? error.message : "Asset inspection failed");
  }
  return receipt;
}

/** Buffer within a hard bound and reject before exposing HTTP 200 or publishing bytes. */
export async function acceptGlbResponse(response: Response, maxBytes = 100 * 1024 * 1024) {
  const bytes = await readBoundedResponse(new Response(await openGlbStream(response, maxBytes)), maxBytes);
  const receipt = await assessGlb(bytes);
  if (receipt.status !== "accepted") throw new Error(`GLB rejected: ${receipt.issues.join(", ")}`);
  return { bytes, receipt };
}
