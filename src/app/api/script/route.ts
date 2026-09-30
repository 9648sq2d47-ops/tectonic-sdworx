import { NextResponse } from "next/server";
import { z } from "zod";
import { generateText } from "@/lib/ai/openai";
import { generateTextWithGemini } from "@/lib/ai/google";

const body = z.object({
  topic: z.string().min(1),
  provider: z.enum(["openai", "google"]).default("openai"),
});

const INSTRUCTIONS =
  "You write short, upbeat voice-over scripts (max 60 words) for an SD Worx HR & payroll product video. Plain prose, no stage directions.";

/** POST { topic, provider? } → { script } */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  }
  const { topic, provider } = parsed.data;
  const prompt = `Write the voice-over for a video about: ${topic}`;

  const script =
    provider === "google"
      ? await generateTextWithGemini(prompt, INSTRUCTIONS)
      : await generateText(prompt, INSTRUCTIONS);

  return NextResponse.json({ script, provider });
}
