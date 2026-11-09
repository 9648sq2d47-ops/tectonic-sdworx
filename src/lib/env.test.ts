import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("live AI environment opt-ins", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("RELAY_LIVE_AI_ENABLED", undefined);
    vi.stubEnv("RELAY_LIVE_CAPTURE_ENABLED", undefined);
    vi.stubEnv("OPENAI_API_KEY", "synthetic-placeholder");
    vi.stubEnv("LLM_PROVIDER", "google");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("defaults both gates to false even with a provider key", async () => {
    const { env } = await import("./env");
    expect(env()).toMatchObject({ RELAY_LIVE_AI_ENABLED: false, RELAY_LIVE_CAPTURE_ENABLED: false });
  });

  it("treats the literal false as false, not as a truthy string", async () => {
    vi.stubEnv("RELAY_LIVE_AI_ENABLED", "false");
    vi.stubEnv("RELAY_LIVE_CAPTURE_ENABLED", "false");
    const { env } = await import("./env");
    expect(env()).toMatchObject({ RELAY_LIVE_AI_ENABLED: false, RELAY_LIVE_CAPTURE_ENABLED: false });
  });

  it("requires explicit true for each gate", async () => {
    vi.stubEnv("RELAY_LIVE_AI_ENABLED", "true");
    vi.stubEnv("RELAY_LIVE_CAPTURE_ENABLED", "true");
    const { env } = await import("./env");
    expect(env()).toMatchObject({ RELAY_LIVE_AI_ENABLED: true, RELAY_LIVE_CAPTURE_ENABLED: true });
  });

  it("rejects ambiguous activation values", async () => {
    vi.stubEnv("RELAY_LIVE_AI_ENABLED", "yes");
    const { env } = await import("./env");
    expect(() => env()).toThrow(/Invalid environment/);
  });
});
