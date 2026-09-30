import { NextResponse } from "next/server";
import { z } from "zod";
import { renderVideo } from "@/lib/video/render";
import { PROMO_VIDEO, promoVideoSchema } from "@/remotion/compositions/PromoVideo.schema";

export const maxDuration = 300;

/** POST PromoVideoProps → { outputPath } — renders ./out/PromoVideo.mp4 */
export async function POST(request: Request) {
  const parsed = promoVideoSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  }
  const outputPath = await renderVideo({
    compositionId: PROMO_VIDEO.id,
    inputProps: parsed.data,
  });
  return NextResponse.json({ outputPath });
}
