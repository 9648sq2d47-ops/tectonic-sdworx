"use client";

export default function ClaimBoardError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <section role="alert" className="rounded-lg border border-warning/40 bg-warning/10 p-5 text-body">
      <h2 className="font-semibold text-ink">The claim board could not be loaded</h2>
      <p className="mt-2 text-sm">Please retry. If your session has expired, sign in again.</p>
      <div className="mt-3 flex gap-4 text-sm">
        <button onClick={retry} className="rounded-md bg-brand px-3 py-2 text-white">Retry</button>
        <a href="/login" className="self-center underline">Sign in</a>
      </div>
    </section>
  );
}
