import { Composition } from "remotion";
import "../app/globals.css";
import { PromoVideo } from "./compositions/PromoVideo";
import { promoVideoSchema, PROMO_VIDEO } from "./compositions/PromoVideo.schema";

export const RemotionRoot = () => (
  <>
    <Composition
      id={PROMO_VIDEO.id}
      component={PromoVideo}
      schema={promoVideoSchema}
      durationInFrames={PROMO_VIDEO.durationInFrames}
      fps={PROMO_VIDEO.fps}
      width={PROMO_VIDEO.width}
      height={PROMO_VIDEO.height}
      defaultProps={PROMO_VIDEO.defaultProps}
    />
  </>
);
