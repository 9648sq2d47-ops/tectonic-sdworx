"use client";

import { useActionState, useState } from "react";
import type { CaptureAvailability } from "@/lib/ai/llm";
import { MIN_TRANSCRIPT_CHARS, MAX_TRANSCRIPT_CHARS } from "@/relay/handover-contract";
import { captureHandoverAction } from "./handover-actions";
import { initialHandoverState } from "./handover-state";

export function HandoverForm({
  workspaceId,
  clientId,
  availability,
}: {
  workspaceId: string;
  clientId: string;
  availability: CaptureAvailability;
}) {
  const [state, formAction, pending] = useActionState(captureHandoverAction, initialHandoverState);
  // Controlled fields survive the automatic reset after a Server Action returns an error state.
  // They stay in this page only: no localStorage, query string or shared transcript log.
  const [transcript, setTranscript] = useState(state.values.transcript);
  const [saidAt, setSaidAt] = useState(state.values.saidAt);
  const unavailable = !availability.available;

  return (
    <>
      {unavailable ? (
        <p id="handover-unavailable" role="status" className="mt-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-body">
          {availability.message}
        </p>
      ) : null}
      <form action={formAction} aria-describedby={unavailable ? "handover-unavailable" : "handover-demo-notice"} className="mt-4 flex flex-col gap-3">
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <input type="hidden" name="clientId" value={clientId} />
        <label className="flex max-w-xs flex-col gap-1 text-sm text-body">
          Handover date
          <input
            type="date"
            name="saidAt"
            value={saidAt}
            onChange={event => setSaidAt(event.target.value)}
            required
            disabled={unavailable || pending}
            className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand disabled:opacity-60"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-body">
          Synthetic handover transcript
          <textarea
            name="transcript"
            value={transcript}
            onChange={event => setTranscript(event.target.value)}
            minLength={MIN_TRANSCRIPT_CHARS}
            maxLength={MAX_TRANSCRIPT_CHARS}
            rows={6}
            required
            disabled={unavailable || pending}
            placeholder={"Nadia: Meal vouchers are seven euro face value, one per day worked.\nNadia: Sunday work gets a fifty percent premium."}
            className="w-full rounded-md border border-line bg-surface p-3 text-sm text-ink outline-none focus:border-brand disabled:opacity-60"
          />
        </label>
        <div>
          <button type="submit" disabled={unavailable || pending} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60">
            {pending ? "Extracting…" : `Extract claims with ${availability.providerLabel}`}
          </button>
        </div>
        {state.message ? (
          <div role={state.status === "error" || state.status === "rejected" ? "alert" : "status"} aria-live="polite" className="rounded-md border border-line p-3 text-sm text-body">
            <p>{state.message}</p>
            {state.summary?.limitReached ? <p className="mt-1">The five-claim limit was reached. This capture may be incomplete; check the transcript for additional claims.</p> : null}
            {state.summary && state.summary.rejections.length > 0 ? (
              <ul className="mt-2 list-disc pl-5">
                {state.summary.rejections.map((item, index) => <li key={`${item.index}-${index}`}>Candidate {item.index + 1}: {item.reason}</li>)}
              </ul>
            ) : null}
          </div>
        ) : null}
      </form>
    </>
  );
}
