import { VideoPreview } from "@/components/VideoPreview";

const ROUTES = [
  ["POST /api/script", "Generate a voice-over script with OpenAI or Gemini."],
  ["POST /api/tts", "Turn text into an MP3 with ElevenLabs, saved under /public/audio."],
  ["POST /api/render", "Render the PromoVideo composition to ./out with Remotion."],
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-3">
        <span className="w-fit rounded-full bg-brand-100 px-3 py-1 text-sm font-medium text-brand-600">
          Tectonic × SD Worx
        </span>
        <h1 className="text-4xl font-semibold tracking-tight text-ink">
          AI video generator that <span className="text-brand-gradient">makes work work</span>
        </h1>
        <p className="max-w-2xl text-lg text-body">
          Next.js app with Remotion for video, ElevenLabs for voices, and OpenAI / Google Gemini
          for scripts. Edit the composition in{" "}
          <code className="rounded-md bg-surface-alt px-1.5 py-0.5 text-sm">src/remotion</code>.
        </p>
      </header>

      <VideoPreview />

      <section className="grid gap-4 sm:grid-cols-3">
        {ROUTES.map(([route, description]) => (
          <div key={route} className="rounded-lg border border-line bg-surface p-4">
            <code className="text-sm font-semibold text-brand">{route}</code>
            <p className="mt-2 text-sm text-body">{description}</p>
          </div>
        ))}
      </section>

      <footer className="flex items-center gap-2 text-sm text-slate">
        <span className="h-2 w-6 rounded-full bg-brand" />
        <span className="h-2 w-6 rounded-full bg-accent" />
        <span className="h-2 w-6 rounded-full bg-sun" />
        SD Worx brand palette
      </footer>
    </main>
  );
}
