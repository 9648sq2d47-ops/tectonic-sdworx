# Tectonic × SD Worx

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
