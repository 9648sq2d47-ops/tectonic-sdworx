import { NextResponse } from "next/server";
import { z } from "zod";
import { textToSpeechFile } from "@/lib/ai/elevenlabs";

const body = z.object({
  text: z.string().min(1).max(5000),
  voiceId: z.string().optional(),
});

/** POST { text, voiceId? } → { publicPath, bytes } — MP3 saved under /public/audio */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  }
  const { publicPath, bytes } = await textToSpeechFile(parsed.data.text, {
    voiceId: parsed.data.voiceId,
  });
  return NextResponse.json({ publicPath, url: `/${publicPath}`, bytes });
}
