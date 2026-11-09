import type { Claim, ClaimReview, ClaimTrust, KnowledgeDocument, Person } from "@/relay/types";
import { ClaimActions } from "./ClaimActions";
import { StatusBadge, VERDICT_TONE } from "./StatusBadge";

interface Props {
  workspaceId: string;
  claim: Claim;
  trust: ClaimTrust;
  review?: ClaimReview;
  documents: Map<string, KnowledgeDocument>;
  people: Map<string, Person>;
}

export function ClaimCard({ workspaceId, claim, trust, review, documents, people }: Props) {
  const speaker = claim.speakerId ? people.get(claim.speakerId) : undefined;
  const source = documents.get(claim.sourceDocumentId);
  const pct = Math.round(trust.score * 100);
  const peopleNames = Object.fromEntries([...people.values()].map((p) => [p.id, p.name]));

  return (
    <article className={`flex flex-col gap-4 rounded-lg border border-line border-l-4 bg-surface p-5 ${VERDICT_TONE[trust.verdict].card}`}>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <StatusBadge verdict={trust.verdict} />
          <span className="flex items-center gap-2 text-xs text-slate" title="Trust score from the signals">
            <span className="h-1.5 w-24 overflow-hidden rounded-full bg-line-soft">
              <span className="block h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
            </span>
            {pct}%
          </span>
        </div>
        <h2 className="text-lg font-semibold text-ink">{claim.text}</h2>
        <p className="text-sm text-slate">
          Said by {speaker?.name ?? "unknown"} on {claim.saidAt}
          {source ? ` · from "${source.title}"` : ""}
        </p>
        {claim.quote ? <blockquote className="border-l-2 border-line pl-3 text-sm italic text-body">“{claim.quote}”</blockquote> : null}
      </header>

      {trust.signals.length > 0 ? (
        <section className="flex flex-col gap-3">
          {trust.signals.map((r) => (
            <div key={r.signalId} className="rounded-md bg-surface-alt p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <StatusBadge verdict={r.verdict} />
                <span className="font-semibold text-ink">{signalName(r.signalId)}</span>
                <span className="text-slate">confidence {Math.round(r.confidence * 100)}%</span>
              </div>
              <p className="mt-1.5 text-sm text-body">{r.summary}</p>
              {r.details?.semanticVerification === "PENDING_HUMAN_REVIEW" ? (
                <p className="mt-1.5 text-sm font-medium text-warning">Meaning and applicability need human review.</p>
              ) : null}
              {r.evidence.length > 0 ? (
                <ul className="mt-2 flex flex-col gap-1.5">
                  {r.evidence.map((e, i) => {
                    const doc = documents.get(e.documentId);
                    const external = e.documentId.startsWith("reg:");
                    return (
                      <li key={i} className="rounded border border-line bg-surface p-2 text-sm">
                        <p className="text-xs font-medium text-slate">
                          {external ? (
                            e.url ? (
                              <a href={e.url} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                                External source
                              </a>
                            ) : (
                              "External source"
                            )
                          ) : (
                            (doc?.title ?? e.documentId)
                          )}
                          {e.effectiveDate ? ` · ${e.effectiveDate}` : doc?.updatedAt ? ` · ${doc.updatedAt}` : ""}
                          {e.locator ? ` · ${e.locator}` : ""}
                        </p>
                        <p className="mt-0.5 text-body">“{e.excerpt}”</p>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          ))}
        </section>
      ) : (
        <p className="text-sm text-slate">No signal had an opinion on this claim yet.</p>
      )}

      <footer className="border-t border-line-soft pt-3">
        <ClaimActions workspaceId={workspaceId} claimId={claim.id} review={review} actions={trust.actions} peopleNames={peopleNames} />
      </footer>
    </article>
  );
}

const NAMES: Record<string, string> = {
  "document-freshness": "Document freshness",
  "document-evidence": "Document evidence",
  "regulation-watch": "Regulation watch",
  "expert-locator": "Expert locator",
};
const signalName = (id: string) => NAMES[id] ?? id;
