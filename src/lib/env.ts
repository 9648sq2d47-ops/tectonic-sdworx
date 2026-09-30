import { z } from "zod";

const optional = z.string().trim().min(1).optional();

const schema = z.object({
  OPENAI_API_KEY: optional,
  OPENAI_MODEL: z.string().default("gpt-5"),

  ELEVENLABS_API_KEY: optional,
  ELEVENLABS_VOICE_ID: z.string().default("21m00Tcm4TlvDq8ikWAM"),
  ELEVENLABS_MODEL_ID: z.string().default("eleven_multilingual_v2"),

  GOOGLE_API_KEY: optional,
  GOOGLE_CLOUD_PROJECT: optional,
  GOOGLE_CLOUD_LOCATION: z.string().default("europe-west1"),
  GOOGLE_MODEL: z.string().default("gemini-2.5-flash"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Parsed, validated environment. Lazy so `next build` works without keys. */
export function env(): Env {
  if (!cached) {
    const result = schema.safeParse(process.env);
    if (!result.success) {
      throw new Error(`Invalid environment: ${z.prettifyError(result.error)}`);
    }
    cached = result.data;
  }
  return cached;
}

/** Throws a readable error when a provider key is missing. */
export function requireKey<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const value = env()[key];
  if (value === undefined || value === "") {
    throw new Error(`Missing ${key}. Copy .env.example to .env.local and fill it in.`);
  }
  return value as NonNullable<Env[K]>;
}
