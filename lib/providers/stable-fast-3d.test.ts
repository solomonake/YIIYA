import { describe, it, expect, vi } from "vitest";
import { generateStableFast3d } from "./stable-fast-3d";

const image = new Blob(["fixture"], { type: "image/png" });
describe("SF3D requires generation after image preparation", () => {
  it("uses the same bounded research foreground ratio across all stages", async () => {
    const predict=vi.fn().mockResolvedValueOnce({data:[{value:"Remove Background"}]}).mockResolvedValueOnce({data:[{value:"Run"}]}).mockResolvedValueOnce({data:[]});
    await generateStableFast3d(predict,image,0.65);
    expect(predict.mock.calls[0][1].fr).toBe(0.65);
    expect(predict.mock.calls[1][1][3]).toBe(0.65);
    expect(predict.mock.calls[2][1][3]).toBe(0.65);
  });
  it.each([NaN,Infinity,-1,0.49,1.01])("rejects invalid foreground ratio %s before submission", async ratio => {
    const predict=vi.fn();
    await expect(generateStableFast3d(predict,image,ratio)).rejects.toThrow("foreground ratio");
    expect(predict).not.toHaveBeenCalled();
  });
  it("runs removal then generation in the same session for opaque images", async () => {
    const predict = vi.fn().mockResolvedValueOnce({data:[{value:"Remove Background"},null,null]})
      .mockResolvedValueOnce({data:[{value:"Run"},"preview",null]})
      .mockResolvedValueOnce({data:[{},"preview",{value:{url:"https://stabilityai-stable-fast-3d.hf.space/file=model.glb"}}]});
    const result = await generateStableFast3d(predict,image);
    expect(predict.mock.calls.map(c=>[c[0],Array.isArray(c[1])?c[1][0]:"prepare"])).toEqual([
      ["/requires_bg_remove","prepare"],["/run_button","Remove Background"],["/run_button","Run"]
    ]);
    expect(predict.mock.calls[2][1]).toEqual(["Run",image,null,0.85,"None",-1,1024]);
    expect(result.data).toEqual([{},"preview",{value:{url:"https://stabilityai-stable-fast-3d.hf.space/file=model.glb"}}]);
  });
  it("skips removal but not generation when alpha is already prepared", async () => {
    const predict=vi.fn().mockResolvedValueOnce({data:[{value:"Run"}]}).mockResolvedValueOnce({data:["generated"]});
    expect(await generateStableFast3d(predict,image)).toEqual({data:["generated"]});
    expect(predict).toHaveBeenCalledTimes(2);
    expect(predict.mock.calls[1][1][0]).toBe("Run");
  });
  it.each([{data:[]},{data:[{}]},{data:[{value:"unexpected"}]}])("stops on unrecognized preparation state %#", async ({data}) => {
    const predict=vi.fn().mockResolvedValue({data});
    await expect(generateStableFast3d(predict,image)).rejects.toThrow("unsupported");
    expect(predict).toHaveBeenCalledTimes(1);
  });
  it("does not repeat removal indefinitely", async () => {
    const predict=vi.fn().mockResolvedValue({data:[{value:"Remove Background"}]});
    await expect(generateStableFast3d(predict,image)).rejects.toThrow("did not finish");
    expect(predict).toHaveBeenCalledTimes(2);
  });
  it("does not submit generation after a quota or cancellation error", async () => {
    const predict=vi.fn().mockResolvedValueOnce({data:[{value:"Remove Background"}]}).mockRejectedValueOnce(new Error("quota"));
    await expect(generateStableFast3d(predict,image)).rejects.toThrow("quota");
    expect(predict).toHaveBeenCalledTimes(2);
  });
});
