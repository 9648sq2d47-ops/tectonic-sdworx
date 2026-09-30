import "server-only";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { env, requireKey } from "@/lib/env";

let client: ElevenLabsClient | undefined;

export function elevenlabs(): ElevenLabsClient {
  client ??= new ElevenLabsClient({ apiKey: requireKey("ELEVENLABS_API_KEY") });
  return client;
}

export interface SpeechOptions {
  voiceId?: string;
  modelId?: string;
}

/** Text → MP3 bytes. */
export async function textToSpeech(text: string, options: SpeechOptions = {}): Promise<Buffer> {
  const stream = await elevenlabs().textToSpeech.convert(
    options.voiceId ?? env().ELEVENLABS_VOICE_ID,
    {
      text,
      modelId: options.modelId ?? env().ELEVENLABS_MODEL_ID,
      outputFormat: "mp3_44100_128",
    },
  );
  return Buffer.from(await new Response(stream).arrayBuffer());
}

/**
 * Text → MP3 saved under public/audio, keyed by a hash of the input so repeated
 * calls are free. Returns the public path usable with Remotion's `staticFile()`.
 */
export async function textToSpeechFile(text: string, options: SpeechOptions = {}) {
  const voiceId = options.voiceId ?? env().ELEVENLABS_VOICE_ID;
  const hash = createHash("sha1").update(`${voiceId}:${text}`).digest("hex").slice(0, 16);
  const publicPath = `audio/${hash}.mp3`;
  const absolute = path.join(process.cwd(), "public", publicPath);

  await mkdir(path.dirname(absolute), { recursive: true });
  const audio = await textToSpeech(text, { ...options, voiceId });
  await writeFile(absolute, audio);

  return { publicPath, absolutePath: absolute, bytes: audio.byteLength };
}
