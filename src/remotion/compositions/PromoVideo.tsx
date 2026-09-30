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

import type { PromoVideoProps } from "./PromoVideo.schema";

export const PromoVideo = ({ title, subtitle, voiceOver }: PromoVideoProps) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const titleIn = spring({ frame, fps, config: { damping: 200 } });
  const subtitleIn = spring({ frame: frame - 15, fps, config: { damping: 200 } });
  const fadeOut = interpolate(frame, [durationInFrames - 20, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill className="bg-brand-950 text-white" style={{ opacity: fadeOut }}>
      {voiceOver ? <Audio src={staticFile(voiceOver)} /> : null}

      <AbsoluteFill className="items-center justify-center">
        <div
          className="h-3 w-40 rounded-full bg-brand-500"
          style={{ transform: `scaleX(${titleIn})`, marginBottom: 40 }}
        />
        <h1
          className="font-sans text-9xl font-bold tracking-tight"
          style={{ opacity: titleIn, transform: `translateY(${(1 - titleIn) * 40}px)` }}
        >
          {title}
        </h1>
        <Sequence from={15} layout="none">
          <p
            className="mt-8 text-5xl text-brand-100"
            style={{ opacity: subtitleIn, transform: `translateY(${(1 - subtitleIn) * 30}px)` }}
          >
            {subtitle}
          </p>
        </Sequence>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
