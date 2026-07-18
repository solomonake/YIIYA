import { describe, it, expect } from "vitest";
import { checkLimit } from "./rate-limit";

// Exercises the in-memory fallback (no Upstash env in unit tests). The daily
// generation quota is what a user actually feels ("N models a day"), so its
// consume-then-block behaviour and per-identity scoping are worth pinning.
describe("checkLimit — daily free-generation quota", () => {
  it("allows up to the configured limit, then blocks the same identity", async () => {
    const id = `quota-${Math.random().toString(36).slice(2)}`;
    const first = await checkLimit("generate3d", id);
    expect(first.success).toBe(true);
    const limit = first.limit;
    expect(limit).toBeGreaterThanOrEqual(1);

    for (let i = 1; i < limit; i++) {
      expect((await checkLimit("generate3d", id)).success).toBe(true);
    }

    const over = await checkLimit("generate3d", id);
    expect(over.success).toBe(false);
    expect(over.remaining).toBe(0);
  });

  it("scopes the quota per identity — one user's usage never spends another's", async () => {
    const a = `a-${Math.random().toString(36).slice(2)}`;
    const b = `b-${Math.random().toString(36).slice(2)}`;
    await checkLimit("generate3d", a);
    const bFirst = await checkLimit("generate3d", b);
    expect(bFirst.success).toBe(true);
    expect(bFirst.remaining).toBe(bFirst.limit - 1);
  });
});
