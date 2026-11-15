import { describe, expect, it, vi } from "vitest";
import { readBoundedResponse, readResponsePrefix } from "./bounded-response";

describe("bounded provider reads", () => {
  it("rejects oversized chunked bodies without a Content-Length", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(20)); }, cancel });
    await expect(readBoundedResponse(new Response(body), 10)).rejects.toThrow("byte limit");
    expect(cancel).toHaveBeenCalled();
  });
  it("accepts a body exactly at the limit", async () => {
    expect(await readBoundedResponse(new Response(new Uint8Array([1, 2, 3])), 3))
      .toEqual(new Uint8Array([1, 2, 3]));
  });
  it("cancels an ignored range after retaining only the requested prefix", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(100)); }, cancel });
    expect((await readResponsePrefix(new Response(body), 10)).byteLength).toBe(10);
    expect(cancel).toHaveBeenCalled();
  });
});
