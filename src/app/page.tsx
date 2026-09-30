import { VideoPreview } from "@/components/VideoPreview";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-3">
        <span className="w-fit rounded-full bg-brand-100 px-3 py-1 text-sm font-medium text-brand-700">
          Tectonic × SD Worx
        </span>
        <h1 className="text-4xl font-bold tracking-tight text-brand-950">AI video generator</h1>
        <p className="max-w-2xl text-lg text-neutral-600">
          Next.js app with Remotion for video, ElevenLabs for voices, and OpenAI / Google Gemini
          for scripts. Edit the composition in{" "}
          <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-sm">src/remotion</code>.
        </p>
      </header>

      <VideoPreview />

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          ["POST /api/script", "Generate a voice-over script with OpenAI or Gemini."],
          ["POST /api/tts", "Turn text into an MP3 with ElevenLabs, saved under /public/audio."],
          ["POST /api/render", "Render the PromoVideo composition to ./out with Remotion."],
        ].map(([route, description]) => (
          <div key={route} className="rounded-xl border border-neutral-200 p-4">
            <code className="text-sm font-semibold text-brand-600">{route}</code>
            <p className="mt-2 text-sm text-neutral-600">{description}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
