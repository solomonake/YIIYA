import { describe, expect, it, vi } from "vitest";
import { openGlbStream } from "./glb-stream";

function envelope(size = 24) {
  const bytes = new Uint8Array(size);
  const header = new DataView(bytes.buffer);
  header.setUint32(0, 0x46546c67, true);
  header.setUint32(4, 2, true);
  header.setUint32(8, size, true);
  return bytes;
}
function source(chunks: Uint8Array[], close = true) {
  const cancel = vi.fn();
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      if (index < chunks.length) c.enqueue(chunks[index++]);
      else if (close) c.close();
    }, cancel
  }, { highWaterMark: 0 });
  return { response: new Response(body), cancel };
}
async function consume(stream: ReadableStream<Uint8Array>) {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

describe("GLB delivery stream", () => {
  it("accepts a split header and preserves every byte", async () => {
    const bytes = envelope();
    const { response } = source([bytes.slice(0, 3), bytes.slice(3, 9), bytes.slice(9, 15), bytes.slice(15)]);
    expect(await consume(await openGlbStream(response, 24))).toEqual(bytes);
  });
  it("rejects an HTML error page even if the upstream calls it a model", async () => {
    const { response, cancel } = source([new TextEncoder().encode("<!DOCTYPE html><html>error</html>")], false);
    await expect(openGlbStream(response, 100)).rejects.toThrow("Invalid GLB");
    expect(cancel).toHaveBeenCalled();
  });
  it("rejects an oversized declaration without consuming the body", async () => {
    const { response, cancel } = source([envelope()], false);
    response.headers.set("content-length", "1000");
    await expect(openGlbStream(response, 24)).rejects.toThrow("byte limit");
    expect(cancel).toHaveBeenCalled();
  });
  it("enforces the GLB size without trusting Content-Length", async () => {
    const { response, cancel } = source([envelope(32).slice(0, 12)], false);
    response.headers.set("content-length", "12");
    await expect(openGlbStream(response, 24)).rejects.toThrow("byte limit");
    expect(cancel).toHaveBeenCalled();
  });
  it("aborts extra chunked bytes beyond the GLB declared length", async () => {
    const { response, cancel } = source([envelope(), new Uint8Array(100)], false);
    const stream = await openGlbStream(response, 24);
    await expect(consume(stream)).rejects.toThrow("length mismatch");
    expect(cancel).toHaveBeenCalled();
  });
  it("fails a truncated body instead of completing a corrupt download", async () => {
    const { response } = source([envelope().slice(0, 15)]);
    await expect(consume(await openGlbStream(response, 24))).rejects.toThrow("Truncated GLB body");
  });
  it("cancels the provider when the visitor cancels the download", async () => {
    const { response, cancel } = source([envelope()], false);
    const stream = await openGlbStream(response, 24);
    await stream.cancel("visitor disconnected");
    expect(cancel).toHaveBeenCalledWith("visitor disconnected");
  });
  it("rejects unsupported GLB versions and incomplete headers", async () => {
    const bytes = envelope();
    new DataView(bytes.buffer).setUint32(4, 1, true);
    await expect(openGlbStream(new Response(bytes), 24)).rejects.toThrow("Invalid GLB");
    await expect(openGlbStream(new Response(bytes.slice(0, 8)), 24)).rejects.toThrow("Truncated GLB header");
  });
});
