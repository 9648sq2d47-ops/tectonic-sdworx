import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspacePage } from "@/lib/auth/access";
import { captureAvailability } from "@/lib/ai/llm";
import { ClaimCard } from "@/components/relay/ClaimCard";
import { Shell } from "@/components/relay/Shell";
import { VERDICT_TONE } from "@/components/relay/StatusBadge";
import { assessClientCached, llmMode } from "@/relay/assess-cached";
import { getClient, getReview, listDocuments, listPeople } from "@/relay/store";
import { VERDICTS } from "@/relay/types";
import { HandoverForm } from "./HandoverForm";

export const dynamic = "force-dynamic";

export default async function ClaimBoardPage({ params }: PageProps<"/w/[workspaceId]/clients/[clientId]">) {
  const { workspaceId, clientId } = await params;
  const { user, workspace } = await requireWorkspacePage(workspaceId);
  const client = getClient(workspaceId, clientId);
  if (!client) notFound();
  const availability = captureAvailability();

  const { claims, trust, errors } = await assessClientCached(workspaceId, clientId);
  const documents = new Map(listDocuments(workspaceId).map((d) => [d.id, d]));
  const people = new Map(listPeople(workspaceId).map((p) => [p.id, p]));

  const counts = Object.fromEntries(VERDICTS.map((v) => [v, 0])) as Record<string, number>;
  for (const t of trust.values()) counts[t.verdict] = (counts[t.verdict] ?? 0) + 1;
  const reviewed = claims.filter((c) => (getReview(workspaceId, c.id)?.status ?? "open") !== "open").length;

  return (
    <Shell user={user} workspace={workspace}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-slate">
            <Link href={`/w/${workspaceId}`} className="hover:underline">Client handovers</Link> / {client.name}
          </p>
          <h1 className="text-2xl font-semibold text-ink">Claim board</h1>
          <p className="mt-1 text-sm text-body">
            Captured statements from the handover, with their evidence and status. Signals run in {llmMode()} mode.
          </p>
        </div>
        <Link
          href={`/w/${workspaceId}/clients/${clientId}/brief`}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-400"
        >
          Verified client brief
        </Link>
      </div>

      <section className="rounded-lg border border-line bg-surface p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand">Synthetic handover demo</p>
        <h2 className="mt-1 text-lg font-semibold text-ink">Turn a handover into bounded claims</h2>
        <p className="mt-1 text-sm text-body">
          When enabled, {availability.providerLabel} proposes claims linked to exact source quotes. A quote match does not establish that a claim is true; human review is still required.
        </p>
        <p id="handover-demo-notice" className="mt-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-body">
          Synthetic data only: do not enter real client information. This single-instance demo keeps claims, reviews and rate limits in server memory; they reset on restart and are not shared between instances.
        </p>
        <HandoverForm workspaceId={workspaceId} clientId={clientId} availability={availability} />
      </section>

      <dl className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {(
          [
            ["Claims", claims.length, "border-t-ink", "text-ink"],
            ["Confirmed", counts.confirmed, VERDICT_TONE.confirmed.tile, VERDICT_TONE.confirmed.text],
            ["Contradicted", counts.contradicted, VERDICT_TONE.contradicted.tile, VERDICT_TONE.contradicted.text],
            ["Outdated", counts.outdated + counts.expiring, VERDICT_TONE.outdated.tile, VERDICT_TONE.outdated.text],
            ["Unsupported", counts.unsupported, VERDICT_TONE.unsupported.tile, VERDICT_TONE.unsupported.text],
            ["Reviewed", reviewed, "border-t-brand", "text-brand"],
          ] as const
        ).map(([label, n, tile, text]) => (
          <div key={label} className={`rounded-lg border border-line border-t-4 bg-surface p-3 ${tile}`}>
            <dt className="text-xs text-slate">{label}</dt>
            <dd className={`text-xl font-semibold ${text}`}>{n}</dd>
          </div>
        ))}
      </dl>

      {errors.length > 0 ? (
        <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-body">
          Some signals failed and were skipped: {errors.map((e) => e.signalId).join(", ")}.
        </p>
      ) : null}

      <div className="flex flex-col gap-4">
        {claims.map((claim) => (
          <ClaimCard
            key={claim.id}
            workspaceId={workspaceId}
            claim={claim}
            trust={trust.get(claim.id)!}
            review={getReview(workspaceId, claim.id)}
            documents={documents}
            people={people}
          />
        ))}
      </div>
    </Shell>
  );
}
