import "server-only";
import OpenAI from "openai";
import { env, requireKey } from "@/lib/env";

let client: OpenAI | undefined;

export function openai(): OpenAI {
  client ??= new OpenAI({ apiKey: requireKey("OPENAI_API_KEY") });
  return client;
}

/** Single-turn text generation via the Responses API. */
export async function generateText(prompt: string, instructions?: string): Promise<string> {
  const response = await openai().responses.create({
    model: env().OPENAI_MODEL,
    instructions,
    input: prompt,
  });
  return response.output_text;
}
