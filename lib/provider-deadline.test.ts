import { afterEach, expect, it, vi } from "vitest";
import { predictGradio, withProviderDeadline, ProviderDeadlineError } from "./provider-deadline";
import type { Client } from "@gradio/client";
afterEach(() => vi.useRealTimers());
function clientFor(events: unknown[]) {
  const cancel = vi.fn().mockResolvedValue(undefined);
  const submit = vi.fn(() => ({ cancel, async *[Symbol.asyncIterator]() { for (const event of events) yield event; } }));
  return { client: { submit } as unknown as Pick<Client, "submit">, submit, cancel };
}
it.each([false, true])("requires data and completion in either order (%s)", async reverse => {
  const events = [{ type: "data", data: ["mesh.glb"] }, { type: "status", stage: "complete" }];
  const { client } = clientFor(reverse ? events.reverse() : events);
  expect(await predictGradio(client, undefined, "/model", {})).toEqual({ data: ["mesh.glb"] });
});
it("does not treat partial data as success", async () => {
  const { client } = clientFor([{ type: "data", data: ["partial.glb"] }]);
  await expect(predictGradio(client, undefined, "/model", {})).rejects.toThrow("without a complete result");
});
it("does not submit after abort", async () => {
  const { client, submit } = clientFor([]);
  const controller = new AbortController(); controller.abort();
  await expect(predictGradio(client, controller.signal, "/next", {})).rejects.toThrow();
  expect(submit).not.toHaveBeenCalled();
});
it("requests cancellation without waiting on a hung cancel, blocks later stages", async () => {
  vi.useFakeTimers();
  let finish!: (value: IteratorResult<never>) => void;
  const cancel = vi.fn(() => new Promise<void>(() => {}));
  const submit = vi.fn(() => ({ cancel, [Symbol.asyncIterator]() { return { next: () => new Promise<IteratorResult<never>>(resolve => { finish = resolve; }) }; } }));
  const client = { submit } as unknown as Pick<Client, "submit">;
  let captured!: AbortSignal;
  const run = withProviderDeadline(async signal => {
    captured = signal;
    await predictGradio(client, signal, "/first", {});
    return predictGradio(client, signal, "/second", {});
  }, 100, "test");
  const rejected = expect(run).rejects.toBeInstanceOf(ProviderDeadlineError);
  await vi.advanceTimersByTimeAsync(100);
  await rejected;
  expect(captured.aborted).toBe(true);
  expect(cancel).toHaveBeenCalledTimes(1);
  finish({ done: true, value: undefined });
  await vi.advanceTimersByTimeAsync(1);
  expect(submit).toHaveBeenCalledTimes(1);
});
it("cleans timer after successful work", async () => {
  vi.useFakeTimers();
  expect(await withProviderDeadline(async () => "ok", 100, "test")).toBe("ok");
  expect(vi.getTimerCount()).toBe(0);
});

it.each(["success", "error"])("does not await stalled iterator cleanup after %s", async mode => {
  vi.useFakeTimers();
  const cleanup = vi.fn(() => new Promise<IteratorResult<never>>(() => {}));
  const events = mode === "success" ? [{type:"data",data:["mesh.glb"]},{type:"status",stage:"complete"}] : [{type:"status",stage:"error",message:"quota"}];
  const client = {submit:()=>({cancel:vi.fn(),[Symbol.asyncIterator]:()=>({next:async()=>({value:events.shift(),done:false}),return:cleanup})})} as unknown as Pick<Client,"submit">;
  const result = predictGradio(client, undefined, "/model", {});
  if(mode === "success") expect(await result).toEqual({data:["mesh.glb"]});
  else await expect(result).rejects.toThrow("quota");
  expect(cleanup).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
