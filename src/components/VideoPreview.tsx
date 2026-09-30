"use client";

import { Player } from "@remotion/player";
import { PromoVideo } from "@/remotion/compositions/PromoVideo";
import { PROMO_VIDEO, type PromoVideoProps } from "@/remotion/compositions/PromoVideo.schema";

export function VideoPreview(props: Partial<PromoVideoProps>) {
  return (
    <Player
      component={PromoVideo}
      inputProps={{ ...PROMO_VIDEO.defaultProps, ...props }}
      durationInFrames={PROMO_VIDEO.durationInFrames}
      fps={PROMO_VIDEO.fps}
      compositionWidth={PROMO_VIDEO.width}
      compositionHeight={PROMO_VIDEO.height}
      controls
      autoPlay
      loop
      style={{ width: "100%", borderRadius: 16, overflow: "hidden" }}
    />
  );
}
