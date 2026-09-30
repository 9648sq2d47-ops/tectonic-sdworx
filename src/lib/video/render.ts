import "server-only";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { enableTailwind } from "@remotion/tailwind-v4";

let bundlePromise: Promise<string> | undefined;

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
    codec: "h264",
    inputProps,
    outputLocation,
  });

  return outputLocation;
}
