import { Config } from "@remotion/cli/config";
import { enableTailwind } from "@remotion/tailwind-v4";

Config.setCodec("h264");
Config.setCrf(14);
Config.setVideoImageFormat("png");
Config.setPixelFormat("yuv420p");
Config.setAudioCodec("aac");
Config.setAudioBitrate("320K");
Config.setEnforceAudioTrack(true);
Config.setSampleRate(48_000);
Config.setOverwriteOutput(true);
Config.setEntryPoint("./src/remotion/index.ts");
Config.overrideWebpackConfig(enableTailwind);
