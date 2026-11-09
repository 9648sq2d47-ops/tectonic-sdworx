import "server-only";
import type { ZodType } from "zod";
import { env } from "@/lib/env";
import type { LlmClient } from "@/relay/types";
import { google, generateTextWithGemini } from "./google";
import { openai, generateText as generateWithOpenAI } from "./openai";

type Provider = "google" | "openai";

export type CaptureAvailability = {
  available: boolean;
  provider: Provider;
  providerLabel: string;
  reason: "DISABLED" | "PROVIDER_UNAVAILABLE" | null;
  message: string;
};

/** Credentials alone never enable live calls in this synthetic demonstration. */
export function captureAvailability(): CaptureAvailability {
  const e = env();
  const provider = e.LLM_PROVIDER;
  const providerLabel = provider === "google" ? "Google Gemini" : "OpenAI";
  if (!e.RELAY_LIVE_AI_ENABLED || !e.RELAY_LIVE_CAPTURE_ENABLED) {
    return {
      available: false, provider, providerLabel, reason: "DISABLED",
      message: "Live capture is disabled for this synthetic demo. Existing claims and the client brief remain available.",
    };
  }
  const hasSelectedProvider = provider === "google"
    ? Boolean(e.GOOGLE_CLOUD_PROJECT || e.GOOGLE_API_KEY)
    : Boolean(e.OPENAI_API_KEY);
  return hasSelectedProvider
    ? { available: true, provider, providerLabel, reason: null, message: "" }
    : {
      available: false, provider, providerLabel, reason: "PROVIDER_UNAVAILABLE",
      message: `${providerLabel}, the selected capture provider, is not configured. Existing claims and the client brief remain available.`,
    };
}

/** Recheck the server gate immediately before calling the selected provider. No fallback. */
export async function generateCaptureText(prompt: string, system?: string): Promise<string> {
  const availability = captureAvailability();
  if (!availability.available) throw new Error("Live capture is unavailable.");
  return availability.provider === "google"
    ? generateTextWithGemini(prompt, system)
    : generateWithOpenAI(prompt, system);
}

const configured = (): Provider[] => {
  const e = env();
  const list: Provider[] = [];
  if (!e.RELAY_LIVE_AI_ENABLED) return list;
  const hasGoogle = Boolean(e.GOOGLE_CLOUD_PROJECT || e.GOOGLE_API_KEY);
  const hasOpenAI = Boolean(e.OPENAI_API_KEY);
  // Preferred provider first (LLM_PROVIDER), then whatever else is configured as fallback.
  const order: Provider[] = e.LLM_PROVIDER === "openai" ? ["openai", "google"] : ["google", "openai"];
  for (const p of order) {
    if (p === "google" && hasGoogle) list.push(p);
    if (p === "openai" && hasOpenAI) list.push(p);
  }
  return list;
};

/** True only when live AI is explicitly enabled and a text provider is configured. */
export function llmAvailable(): boolean {
  return configured().length > 0;
}

function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const start = trimmed.search(/[[{]/);
  return JSON.parse(start >= 0 ? trimmed.slice(start) : trimmed);
}

const warned = new Set<string>();
function warnOnce(key: string, message: string) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[llm] ${message}`);
}

/** Runs `fn` against each configured provider in order until one succeeds. */
async function withFallback<T>(what: string, fn: (p: Provider) => Promise<T>): Promise<T> {
  const providers = configured();
  if (providers.length === 0) {
    throw new Error("Live AI is disabled or no provider is configured.");
  }
  let lastError: unknown;
  for (const p of providers) {
    try {
      return await fn(p);
    } catch (error) {
      lastError = error;
      // Provider errors can contain request contents or credentials; do not log them.
      warnOnce(`${what}:${p}`, `${what} via ${p} failed; trying another configured provider if available.`);
    }
  }
  throw lastError;
}

/**
 * Provider-agnostic LLM client for signals. Google (Gemini on Vertex or the Gemini
 * API) is preferred because the hackathon credits are there; OpenAI is the fallback
 * for both text and embeddings when Google is missing or refuses the model.
 */
export function createLlm(): LlmClient {
  const generateText = (prompt: string, system?: string) =>
    withFallback("generateText", (p) =>
      p === "google" ? generateTextWithGemini(prompt, system) : generateWithOpenAI(prompt, system),
    );

  return {
    generateText,
    async generateJson<T>(schema: ZodType<T>, prompt: string, system?: string): Promise<T> {
      const instructions = `${system ?? ""}\nRespond with a single JSON value and nothing else. No prose, no code fences.`;
      const text = await generateText(prompt, instructions.trim());
      return schema.parse(extractJson(text));
    },
    embed: (texts: string[]) =>
      withFallback("embed", async (p) => {
        if (p === "google") {
          const response = await google().models.embedContent({ model: env().GOOGLE_EMBEDDING_MODEL, contents: texts });
          return (response.embeddings ?? []).map((e) => e.values ?? []);
        }
        const response = await openai().embeddings.create({ model: env().OPENAI_EMBEDDING_MODEL, input: texts });
        return response.data.map((d) => d.embedding);
      }),
  };
}
