import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { createClient, gte, eq, select, from } = vi.hoisted(() => ({
  createClient: vi.fn(), gte: vi.fn(), eq: vi.fn(), select: vi.fn(), from: vi.fn()
}));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://database.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-not-a-secret");
  vi.stubEnv("USAGE_DAILY_BUDGET_USD_PER_USER", "1.00");
  vi.stubEnv("USAGE_DAILY_BUDGET_USD_GLOBAL", "10.00");
  eq.mockReturnValue({ gte });
  select.mockReturnValue({ eq, gte });
  from.mockReturnValue({ select });
  createClient.mockReturnValue({ from });
});
afterEach(() => vi.unstubAllEnvs());

describe("recorded-spend screen fails closed", () => {
  it("denies production without shared ledger configuration", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { checkBudget } = await import("./usage-meter");
    expect(await checkBudget()).toMatchObject({ allow: false, unavailable: true });
  });
  it.each([
    { data: null, count: null, error: { message: "offline" } },
    { data: [{ cost_usd: 0.1 }], count: 1200, error: null },
    { data: [{ cost_usd: "NaN" }], count: 1, error: null },
    { data: [{ cost_usd: -1 }], count: 1, error: null },
    { data: [{ cost_usd: null }], count: 1, error: null }
  ])("does not grant on failed, partial or malformed ledger data %#", async response => {
    gte.mockResolvedValue(response);
    const { checkBudget } = await import("./usage-meter");
    expect(await checkBudget()).toMatchObject({ allow: false, unavailable: true });
  });
  it("denies thrown database failures", async () => {
    gte.mockRejectedValue(new Error("network failure"));
    const { checkBudget } = await import("./usage-meter");
    expect(await checkBudget()).toMatchObject({ allow: false, unavailable: true });
  });
  it.each(["NaN", "-1", "Infinity", "10 dollars"])("denies malformed cap %s", async cap => {
    vi.stubEnv("USAGE_DAILY_BUDGET_USD_GLOBAL", cap);
    const { checkBudget } = await import("./usage-meter");
    expect(await checkBudget()).toMatchObject({ allow: false, unavailable: true });
    expect(createClient).not.toHaveBeenCalled();
  });
  it("respects a zero cap before reading the ledger", async () => {
    vi.stubEnv("USAGE_DAILY_BUDGET_USD_GLOBAL", "0");
    const { checkBudget } = await import("./usage-meter");
    expect(await checkBudget()).toMatchObject({ allow: false, capUsd: 0 });
    expect(createClient).not.toHaveBeenCalled();
  });
  it("scopes user spending and blocks exactly at the user cap", async () => {
    gte.mockResolvedValue({ data: [{ cost_usd: "1.00" }], count: 1, error: null });
    const { checkBudget } = await import("./usage-meter");
    expect(await checkBudget("owner-a")).toMatchObject({ allow: false, scope: "user", spentUsd: 1 });
    expect(eq).toHaveBeenCalledWith("user_id", "owner-a");
  });
  it("checks global spending after a user passes", async () => {
    gte.mockResolvedValueOnce({ data: [], count: 0, error: null })
      .mockResolvedValueOnce({ data: [{ cost_usd: 10 }], count: 1, error: null });
    const { checkBudget } = await import("./usage-meter");
    expect(await checkBudget("owner-a")).toMatchObject({ allow: false, scope: "global", spentUsd: 10 });
  });
  it("allows complete recorded totals below both caps without claiming a reservation", async () => {
    gte.mockResolvedValue({ data: [{ cost_usd: 0.2 }], count: 1, error: null });
    const { checkBudget } = await import("./usage-meter");
    expect(await checkBudget("owner-a")).toMatchObject({ allow: true, spentUsd: 0.2 });
    expect(select).toHaveBeenCalledWith("cost_usd", { count: "exact" });
  });
});

describe("cost recording does not invent free usage", () => {
  it.each([{}, {model:"unknown"}, {model:"toString"}, {provider:"toString"},
    {model:"gemini-2.5-flash"}, {model:"gemini-2.5-flash",promptTokens:-1,completionTokens:0},
    {model:"gemini-2.5-flash",promptTokens:1.5,completionTokens:0},
    {model:"gemini-2.5-flash",promptTokens:Infinity,completionTokens:0}
  ])("rejects unknown or incomplete cost %#", async fields => {
    const {recordUsage}=await import("./usage-meter");
    expect(await recordUsage({stage:"test",provider:"unknown",...fields})).toEqual({recorded:false,reason:"unknown_cost"});
    expect(from).not.toHaveBeenCalled();
  });
  it.each([true,false])("reports rejected ledger write, thrown=%s", async thrown => {
    const insert=thrown?vi.fn().mockRejectedValue(new Error("offline")):vi.fn().mockResolvedValue({error:{message:"denied"}});
    from.mockReturnValue({insert});
    const {recordUsage}=await import("./usage-meter");
    expect(await recordUsage({stage:"test",provider:"reasoning",model:"gemini-2.5-flash",promptTokens:100,completionTokens:10})).toEqual({recorded:false,reason:"ledger_write_failed"});
  });
  it("only reports persisted success after database acknowledgment",async()=>{
    const insert=vi.fn().mockResolvedValue({error:null});from.mockReturnValue({insert});
    const {recordUsage}=await import("./usage-meter");
    expect(await recordUsage({stage:"test",provider:"reasoning",model:"gemini-2.5-flash",promptTokens:100,completionTokens:10})).toMatchObject({recorded:true});
    expect(insert.mock.calls[0][0].cost_usd).toBeGreaterThan(0);
  });
});

 it("does not treat an absent database acknowledgment as recorded", async () => {
   from.mockReturnValue({insert:vi.fn().mockResolvedValue({})});
   const {recordUsage}=await import("./usage-meter");
   expect(await recordUsage({stage:"test",provider:"reasoning",model:"gemini-2.5-flash",promptTokens:100,completionTokens:10})).toEqual({recorded:false,reason:"ledger_write_failed"});
 });
