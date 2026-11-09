import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureAvailability, createLlm, generateCaptureText, llmAvailable } from "./llm";

const fixture = vi.hoisted(() => ({
  settings: {
    LLM_PROVIDER: "google",
    RELAY_LIVE_AI_ENABLED: false,
    RELAY_LIVE_CAPTURE_ENABLED: false,
    GOOGLE_API_KEY: "synthetic-key-placeholder" as string | undefined,
    GOOGLE_CLOUD_PROJECT: undefined as string | undefined,
    OPENAI_API_KEY: "synthetic-key-placeholder" as string | undefined,
  },
  googleText: vi.fn(), openaiText: vi.fn(), googleClient: vi.fn(), openaiClient: vi.fn(),
}));
vi.mock("@/lib/env", () => ({ env: () => fixture.settings }));
vi.mock("./google", () => ({ generateTextWithGemini: fixture.googleText, google: fixture.googleClient }));
vi.mock("./openai", () => ({ generateText: fixture.openaiText, openai: fixture.openaiClient }));

describe("live provider gates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(fixture.settings, {
      LLM_PROVIDER: "google", RELAY_LIVE_AI_ENABLED: false, RELAY_LIVE_CAPTURE_ENABLED: false,
      GOOGLE_API_KEY: "synthetic-key-placeholder", GOOGLE_CLOUD_PROJECT: undefined, OPENAI_API_KEY: "synthetic-key-placeholder",
    });
    fixture.googleText.mockResolvedValue("synthetic Google result");
    fixture.openaiText.mockResolvedValue("synthetic OpenAI result");
  });

  it("credentials alone do not enable capture, signal calls or embeddings", async () => {
    expect(llmAvailable()).toBe(false);
    expect(captureAvailability().reason).toBe("DISABLED");
    await expect(generateCaptureText("synthetic")).rejects.toThrow(/unavailable/);
    await expect(createLlm().generateText("synthetic")).rejects.toThrow(/disabled/);
    await expect(createLlm().embed(["synthetic"])).rejects.toThrow(/disabled/);
    expect(fixture.googleText).not.toHaveBeenCalled();
    expect(fixture.openaiText).not.toHaveBeenCalled();
    expect(fixture.googleClient).not.toHaveBeenCalled();
    expect(fixture.openaiClient).not.toHaveBeenCalled();
  });

  it.each([[true, false], [false, true]])("capture requires both opt-ins (%s, %s)", async (ai, capture) => {
    fixture.settings.RELAY_LIVE_AI_ENABLED = ai;
    fixture.settings.RELAY_LIVE_CAPTURE_ENABLED = capture;
    await expect(generateCaptureText("synthetic")).rejects.toThrow(/unavailable/);
    expect(fixture.googleText).not.toHaveBeenCalled();
    expect(fixture.openaiText).not.toHaveBeenCalled();
  });

  it.each(["google", "openai"])("capture respects the selected %s provider", async provider => {
    Object.assign(fixture.settings, { LLM_PROVIDER: provider, RELAY_LIVE_AI_ENABLED: true, RELAY_LIVE_CAPTURE_ENABLED: true });
    expect(captureAvailability().available).toBe(true);
    await generateCaptureText("synthetic transcript", "synthetic instruction");
    const selected = provider === "google" ? fixture.googleText : fixture.openaiText;
    const other = provider === "google" ? fixture.openaiText : fixture.googleText;
    expect(selected).toHaveBeenCalledExactlyOnceWith("synthetic transcript", "synthetic instruction");
    expect(other).not.toHaveBeenCalled();
  });

  it("does not substitute another configured provider when the selected one is missing", async () => {
    Object.assign(fixture.settings, { RELAY_LIVE_AI_ENABLED: true, RELAY_LIVE_CAPTURE_ENABLED: true, GOOGLE_API_KEY: undefined });
    expect(captureAvailability()).toMatchObject({ available: false, reason: "PROVIDER_UNAVAILABLE", provider: "google" });
    await expect(generateCaptureText("synthetic")).rejects.toThrow(/unavailable/);
    expect(fixture.openaiText).not.toHaveBeenCalled();
  });

  it("does not send a failed capture to a second provider", async () => {
    Object.assign(fixture.settings, { RELAY_LIVE_AI_ENABLED: true, RELAY_LIVE_CAPTURE_ENABLED: true });
    fixture.googleText.mockRejectedValueOnce(new Error("synthetic provider error"));
    await expect(generateCaptureText("synthetic")).rejects.toThrow("synthetic provider error");
    expect(fixture.openaiText).not.toHaveBeenCalled();
  });
});
