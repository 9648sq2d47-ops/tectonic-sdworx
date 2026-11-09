import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ assess: vi.fn() }));
vi.mock("./assess", () => ({ assessClient: mocks.assess }));
vi.mock("@/lib/ai/llm", () => ({ llmAvailable: () => false, createLlm: () => { throw new Error("Unexpected provider construction"); } }));

const assessment = () => ({ claims: [], trust: new Map(), errors: [] });

beforeEach(() => {
  vi.resetModules();
  globalThis.__relayAssessmentCache?.clear();
  mocks.assess.mockReset().mockResolvedValue(assessment());
});
afterEach(() => vi.useRealTimers());

describe("single-process assessment cache", () => {
  it("invalidates another module instance sharing this process", async () => {
    const pageBundle = await import("./assess-cached");
    const first = pageBundle.assessClientCached("workspace", "client");
    await first;
    vi.resetModules();
    const actionBundle = await import("./assess-cached");
    expect(actionBundle.assessClientCached("workspace", "client")).toBe(first);
    actionBundle.invalidateAssessmentCache("workspace", "client");
    await pageBundle.assessClientCached("workspace", "client");
    expect(mocks.assess).toHaveBeenCalledTimes(2);
  });

  it("does not let an older rejected request evict a newer result", async () => {
    let rejectOld!: (reason: Error) => void;
    mocks.assess.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject; }));
    const cache = await import("./assess-cached");
    const old = cache.assessClientCached("workspace", "client");
    const caught = old.catch(() => undefined);
    cache.invalidateAssessmentCache("workspace", "client");
    const replacement = cache.assessClientCached("workspace", "client");
    await replacement;
    rejectOld(new Error("Synthetic failure after invalidation"));
    await caught;
    expect(cache.assessClientCached("workspace", "client")).toBe(replacement);
    expect(mocks.assess).toHaveBeenCalledTimes(2);
  });

  it("keeps workspace/client pairs distinct even when identifiers contain slashes", async () => {
    const cache = await import("./assess-cached");
    await cache.assessClientCached("workspace/a", "client");
    await cache.assessClientCached("workspace", "a/client");
    expect(mocks.assess).toHaveBeenCalledTimes(2);
  });

  it("refreshes an expired result", async () => {
    vi.useFakeTimers();
    const cache = await import("./assess-cached");
    await cache.assessClientCached("workspace", "client");
    vi.advanceTimersByTime(5 * 60 * 1000);
    await cache.assessClientCached("workspace", "client");
    expect(mocks.assess).toHaveBeenCalledTimes(2);
  });
});
