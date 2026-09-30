import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Remotion's renderer/bundler and the Tailwind webpack plugin run native code at
  // request time (only used by /api/render); keep them out of the server bundle.
  serverExternalPackages: [
    "@remotion/bundler",
    "@remotion/renderer",
    "@remotion/tailwind-v4",
    "@tailwindcss/webpack",
    "lightningcss",
  ],
};

export default nextConfig;
