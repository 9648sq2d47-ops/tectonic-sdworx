import "server-only";
import { GoogleGenAI } from "@google/genai";
import { env } from "@/lib/env";

let client: GoogleGenAI | undefined;

/**
 * Google GenAI client. Uses Vertex AI (Google Cloud credits) when
 * GOOGLE_CLOUD_PROJECT is set, otherwise the Gemini API key.
 */
export function google(): GoogleGenAI {
  if (client) return client;
  const { GOOGLE_API_KEY, GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION } = env();

  if (GOOGLE_CLOUD_PROJECT) {
    client = new GoogleGenAI({
      vertexai: true,
      project: GOOGLE_CLOUD_PROJECT,
      location: GOOGLE_CLOUD_LOCATION,
    });
  } else if (GOOGLE_API_KEY) {
    client = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });
  } else {
    throw new Error(
      "Set GOOGLE_API_KEY (Gemini API) or GOOGLE_CLOUD_PROJECT (Vertex AI) in .env.local.",
    );
  }
  return client;
}

/** Single-turn text generation with Gemini. */
export async function generateTextWithGemini(prompt: string, systemInstruction?: string) {
  const response = await google().models.generateContent({
    model: env().GOOGLE_MODEL,
    contents: prompt,
    config: systemInstruction ? { systemInstruction } : undefined,
  });
  return response.text ?? "";
}
