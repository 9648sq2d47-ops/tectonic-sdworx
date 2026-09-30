"use client";

import {
  AbsoluteFill,
  Audio,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";
import type { PromoVideoProps } from "./PromoVideo.schema";

const { fontFamily } = loadFont("normal", { weights: ["400", "600"], subsets: ["latin"] });

export const PromoVideo = ({ title, subtitle, voiceOver }: PromoVideoProps) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const barIn = spring({ frame, fps, config: { damping: 200 } });
  const titleIn = spring({ frame: frame - 5, fps, config: { damping: 200 } });
  const subtitleIn = spring({ frame: frame - 20, fps, config: { damping: 200 } });
  const fadeOut = interpolate(frame, [durationInFrames - 20, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill className="bg-surface text-ink" style={{ opacity: fadeOut, fontFamily }}>
      {voiceOver ? <Audio src={staticFile(voiceOver)} /> : null}

      <AbsoluteFill className="items-center justify-center">
        {/* Three-stroke mark echoing the SD Worx logo */}
        <div className="mb-12 flex gap-3" style={{ transform: `scaleX(${barIn})` }}>
          <div className="h-3 w-24 rounded-full bg-brand" />
          <div className="h-3 w-24 rounded-full bg-accent" />
          <div className="h-3 w-24 rounded-full bg-sun" />
        </div>
        <h1
          className="text-brand-gradient text-9xl font-semibold tracking-tight"
          style={{ opacity: titleIn, transform: `translateY(${(1 - titleIn) * 40}px)` }}
        >
          {title}
        </h1>
        <Sequence from={20} layout="none">
          <p
            className="mt-8 text-5xl text-body"
            style={{ opacity: subtitleIn, transform: `translateY(${(1 - subtitleIn) * 30}px)` }}
          >
            {subtitle}
          </p>
        </Sequence>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
