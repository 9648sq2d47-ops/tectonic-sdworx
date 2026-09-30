import { z } from "zod";

// Kept free of Remotion imports so server code (API routes) can import it.
export const promoVideoSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  /** Path under /public, e.g. "audio/abc123.mp3" (from ElevenLabs). Optional. */
  voiceOver: z.string().optional(),
});

export type PromoVideoProps = z.infer<typeof promoVideoSchema>;

export const PROMO_VIDEO = {
  id: "PromoVideo",
  fps: 30,
  width: 1920,
  height: 1080,
  durationInFrames: 30 * 8,
  defaultProps: {
    title: "SD Worx",
    subtitle: "Payroll & HR, made human",
  } satisfies PromoVideoProps,
};
