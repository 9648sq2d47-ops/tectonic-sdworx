# Tectonic × SD Worx

[![Aikido Security](https://app.aikido.dev/assets/badges/label-only-light-theme.svg)](https://app.aikido.dev)
[![Aikido scan](https://github.com/lregaladohdez/tectonic-sdworx/actions/workflows/aikido.yml/badge.svg)](https://github.com/lregaladohdez/tectonic-sdworx/actions/workflows/aikido.yml)
[![CI](https://github.com/lregaladohdez/tectonic-sdworx/actions/workflows/ci.yml/badge.svg)](https://github.com/lregaladohdez/tectonic-sdworx/actions/workflows/ci.yml)

AI video generator built for SD Worx: a Next.js app that writes a script with an LLM,
voices it with ElevenLabs, and renders the video with Remotion.

## Stack

| Concern            | Tool                                         | Where                          |
| ------------------ | -------------------------------------------- | ------------------------------ |
| Web app / API      | Next.js 16 (App Router, Turbopack), React 19 | `src/app`                      |
| Styling            | Tailwind CSS v4, SD Worx palette (`brand-*`) | `src/app/globals.css`          |
| Video              | Remotion (Studio, Player, server render)     | `src/remotion`, `src/lib/video`|
| Voices             | ElevenLabs                                   | `src/lib/ai/elevenlabs.ts`     |
| Scripts / LLM      | OpenAI (Responses API), Google Gemini/Vertex | `src/lib/ai/openai.ts`, `google.ts` |
| Env validation     | zod                                          | `src/lib/env.ts`               |

## Setup

```bash
npm install
cp .env.example .env.local   # fill in the keys you have
npm run dev                  # http://localhost:3000
npm run remotion:studio      # Remotion Studio for the video compositions
```

Google: set `GOOGLE_API_KEY` for the Gemini API, **or** `GOOGLE_CLOUD_PROJECT` to bill
against Google Cloud credits through Vertex AI (run `gcloud auth application-default login`
first). If both are set, Vertex wins.

## Scripts

| Command                   | What it does                                        |
| ------------------------- | --------------------------------------------------- |
| `npm run dev`             | Next dev server                                     |
| `npm run build` / `start` | Production build / serve                            |
| `npm run typecheck`       | `tsc --noEmit`                                      |
| `npm run lint`            | ESLint                                              |
| `npm run remotion:studio` | Open Remotion Studio                                |
| `npm run remotion:render` | Render `PromoVideo` to `out/PromoVideo.mp4`         |

## API routes

| Route              | Body                                  | Result                                  |
| ------------------ | ------------------------------------- | --------------------------------------- |
| `POST /api/script` | `{ topic, provider?: "openai"|"google" }` | `{ script }`                        |
| `POST /api/tts`    | `{ text, voiceId? }`                  | `{ url, publicPath }` MP3 under `public/audio` |
| `POST /api/render` | `{ title, subtitle, voiceOver? }`     | `{ outputPath }` MP4 under `out/`       |

Typical flow: script → tts (gives `publicPath`) → render with `voiceOver: publicPath`.

## Video

Compositions live in `src/remotion/compositions`. They can use Tailwind classes, including
the `brand-*` palette, thanks to `@remotion/tailwind-v4`. Register new compositions in
`src/remotion/Root.tsx`. The `PromoVideo` composition takes a `voiceOver` path and plays it
with Remotion's `<Audio>`.

### Master render quality

CLI renders and the server-side `/api/render` path use the same master settings:

- H.264 at CRF 14;
- PNG source frames, `yuv420p`, BT.709;
- AAC at 320 Kbit/s and 48 kHz, with an audio track enforced;
- bounded title/subtitle input plus composition safe areas.

CI must render the complete 1920×1080 `PromoVideo` and produce a non-empty MP4 before the
video path is considered build-valid.

## Security

Security is part of the grade, so it is part of the workflow. Aikido scans every push and PR
and blocks on HIGH+ findings, CI runs `npm audit`, Dependabot keeps dependencies fresh, and
all provider keys stay server-side in `.env.local`. Details and rules in [SECURITY.md](SECURITY.md).

To activate Aikido on a fresh fork: connect the repo at app.aikido.dev, create a CI secret
key under Integrations → Continuous Integration, and store it as the `AIKIDO_SECRET_KEY`
repository secret.
