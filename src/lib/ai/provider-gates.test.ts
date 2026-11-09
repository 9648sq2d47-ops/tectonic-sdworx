import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  settings: {
    RELAY_LIVE_AI_ENABLED: false,
    OPENAI_API_KEY: "synthetic-placeholder", OPENAI_MODEL: "synthetic-openai-model",
    GOOGLE_API_KEY: "synthetic-placeholder", GOOGLE_CLOUD_PROJECT: undefined,
    GOOGLE_CLOUD_LOCATION: "synthetic-region", GOOGLE_MODEL: "synthetic-google-model",
  },
  openaiConstructor: vi.fn(), googleConstructor: vi.fn(), responses: vi.fn(), gemini: vi.fn(),
}));
vi.mock("@/lib/env", () => ({ env: () => fixture.settings, requireKey: () => "synthetic-placeholder" }));
vi.mock("openai", () => ({ default: class {
  constructor() { fixture.openaiConstructor(); }
  responses = { create: fixture.responses };
} }));
vi.mock("@google/genai", () => ({ GoogleGenAI: class {
  constructor() { fixture.googleConstructor(); }
  models = { generateContent: fixture.gemini };
} }));

describe("SDK factory gates (mocked SDKs, no network)", () => {
  beforeEach(() => {
    vi.resetModules(); vi.clearAllMocks(); fixture.settings.RELAY_LIVE_AI_ENABLED = false;
    fixture.responses.mockResolvedValue({ output_text: "synthetic output" });
    fixture.gemini.mockResolvedValue({ text: "synthetic output" });
  });

  it("blocks direct Google and OpenAI callers even when credentials exist", async () => {
    const { generateText } = await import("./openai");
    const { generateTextWithGemini } = await import("./google");
    await expect(generateText("synthetic")).rejects.toThrow("Live AI is disabled.");
    await expect(generateTextWithGemini("synthetic")).rejects.toThrow("Live AI is disabled.");
    expect(fixture.openaiConstructor).not.toHaveBeenCalled();
    expect(fixture.googleConstructor).not.toHaveBeenCalled();
    expect(fixture.responses).not.toHaveBeenCalled();
    expect(fixture.gemini).not.toHaveBeenCalled();
  });

  it("passes store:false and the configured model to the mocked OpenAI request", async () => {
    fixture.settings.RELAY_LIVE_AI_ENABLED = true;
    const { generateText } = await import("./openai");
    await generateText("synthetic", "synthetic instruction");
    expect(fixture.responses).toHaveBeenCalledExactlyOnceWith({
      model: "synthetic-openai-model", instructions: "synthetic instruction", input: "synthetic", store: false,
    });
    fixture.settings.RELAY_LIVE_AI_ENABLED = false;
    await expect(generateText("synthetic second request")).rejects.toThrow("Live AI is disabled.");
    expect(fixture.responses).toHaveBeenCalledTimes(1);
  });

  it("rechecks the gate before returning an already cached Google client", async () => {
    fixture.settings.RELAY_LIVE_AI_ENABLED = true;
    const { generateTextWithGemini } = await import("./google");
    await generateTextWithGemini("synthetic", "synthetic instruction");
    expect(fixture.gemini).toHaveBeenCalledExactlyOnceWith({
      model: "synthetic-google-model", contents: "synthetic", config: { systemInstruction: "synthetic instruction" },
    });
    fixture.settings.RELAY_LIVE_AI_ENABLED = false;
    await expect(generateTextWithGemini("synthetic second request")).rejects.toThrow("Live AI is disabled.");
    expect(fixture.gemini).toHaveBeenCalledTimes(1);
  });
});
