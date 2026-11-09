import { z } from "zod";

const optional = z.string().trim().min(1).optional();
const optIn = z.enum(["true", "false"]).default("false").transform(value => value === "true");

const schema = z.object({
  OPENAI_API_KEY: optional,
  OPENAI_MODEL: z.string().default("gpt-5.5"),
  OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-large"),
  /** Local technical gates, not approval to send real data to a provider. */
  RELAY_LIVE_AI_ENABLED: optIn,
  RELAY_LIVE_CAPTURE_ENABLED: optIn,
  /** Selected capture provider; signals retain their explicitly enabled fallback. */
  LLM_PROVIDER: z.enum(["google", "openai"]).default("google"),

  ELEVENLABS_API_KEY: optional,
  ELEVENLABS_VOICE_ID: z.string().default("21m00Tcm4TlvDq8ikWAM"),
  ELEVENLABS_MODEL_ID: z.string().default("eleven_multilingual_v2"),

  GOOGLE_API_KEY: optional,
  GOOGLE_CLOUD_PROJECT: optional,
  GOOGLE_CLOUD_LOCATION: z.string().default("europe-west1"),
  GOOGLE_MODEL: z.string().default("gemini-2.5-flash"),
  GOOGLE_EMBEDDING_MODEL: z.string().default("gemini-embedding-001"),

  /** Signs the session cookie. Required to log in. */
  SESSION_SECRET: optional,
  /** Shared passcode for the seeded demo users. Required to log in. */
  RELAY_DEMO_PASSCODE: optional,
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Parsed, validated environment. Lazy so `next build` works without keys. */
export function env(): Env {
  if (!cached) {
    // Empty values (KEY=) count as unset.
    const present = Object.fromEntries(
      Object.entries(process.env).filter(([, v]) => typeof v === "string" && v.trim() !== ""),
    );
    const result = schema.safeParse(present);
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
