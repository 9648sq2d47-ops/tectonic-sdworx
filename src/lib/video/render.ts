import "server-only";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { enableTailwind } from "@remotion/tailwind-v4";

let bundlePromise: Promise<string> | undefined;

const MASTER_RENDER_SETTINGS = {
  codec: "h264" as const,
  crf: 14,
  imageFormat: "png" as const,
  pixelFormat: "yuv420p" as const,
  audioCodec: "aac" as const,
  audioBitrate: "320K",
  enforceAudioTrack: true,
  colorSpace: "bt709" as const,
  sampleRate: 48_000 as const,
};

/** Bundles the Remotion project once per server process. */
function getBundle() {
  bundlePromise ??= bundle({
    entryPoint: path.join(process.cwd(), "src/remotion/index.ts"),
    publicDir: path.join(process.cwd(), "public"),
    webpackOverride: enableTailwind,
  });
  return bundlePromise;
}

export interface RenderOptions {
  compositionId: string;
  inputProps: Record<string, unknown>;
  /** Output file name (without directory). Defaults to `<compositionId>.mp4`. */
  fileName?: string;
}

/** Renders a composition to ./out/<fileName>. Returns the absolute output path. */
export async function renderVideo({ compositionId, inputProps, fileName }: RenderOptions) {
  const serveUrl = await getBundle();
  const composition = await selectComposition({ serveUrl, id: compositionId, inputProps });
  const outputLocation = path.join(process.cwd(), "out", fileName ?? `${compositionId}.mp4`);

  await renderMedia({
    composition,
    serveUrl,
    inputProps,
    outputLocation,
    overwrite: true,
    ...MASTER_RENDER_SETTINGS,
  });

  return outputLocation;
}
