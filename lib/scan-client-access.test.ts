import { afterEach, expect, it, vi } from "vitest";
import { scanAccessHeaders } from "./scan-client-access";
afterEach(() => vi.unstubAllGlobals());
it("moves the fragment token to tab storage and sends only a job-scoped header", () => {
  const token = "a".repeat(43);
  const values = new Map<string, string>();
  const location = { hash: `#scanToken=${token}`, pathname: "/scan/job-a", search: "" };
  const replaceState = vi.fn((_a, _b, url: string) => { location.hash = url.includes("#") ? url.slice(url.indexOf("#")) : ""; });
  vi.stubGlobal("window", { location, history: { replaceState }, sessionStorage: {
    setItem: (k: string, v: string) => values.set(k, v), getItem: (k: string) => values.get(k) ?? null
  } });
  expect(scanAccessHeaders("job-a")).toEqual({ "x-yiiya-scan-token": token });
  expect(replaceState).toHaveBeenCalledWith(null, "", "/scan/job-a");
  expect(scanAccessHeaders("job-a")).toEqual({ "x-yiiya-scan-token": token });
  expect(scanAccessHeaders("job-b")).toEqual({});
});
it("retains fragment transport when session storage is blocked", () => {
  const token = "b".repeat(43);
  const replaceState = vi.fn();
  vi.stubGlobal("window", { location: { hash: `#scanToken=${token}` }, history: { replaceState }, sessionStorage: {
    setItem: () => { throw new Error("blocked"); }, getItem: () => { throw new Error("blocked"); }
  } });
  expect(scanAccessHeaders("job-a")).toEqual({ "x-yiiya-scan-token": token });
  expect(scanAccessHeaders("job-a")).toEqual({ "x-yiiya-scan-token": token });
  expect(replaceState).not.toHaveBeenCalled();
});
