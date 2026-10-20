import { randomUUID } from "node:crypto";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { requireWorkspaceMember, requireWorkspacePage } from "@/lib/auth/access";
import { generateText } from "@/lib/ai/openai";
import { env } from "@/lib/env";
import { ClaimCard } from "@/components/relay/ClaimCard";
import { Shell } from "@/components/relay/Shell";
import { VERDICT_TONE } from "@/components/relay/StatusBadge";
import { assessClientCached, invalidateAssessmentCache, llmMode } from "@/relay/assess-cached";
import { extractClaimsFromTranscript, resolveSpeakerId } from "@/relay/extract-claims";
import { addHandover, getClient, getReview, listDocuments, listPeople } from "@/relay/store";
import type { Claim, KnowledgeDocument } from "@/relay/types";
import { VERDICTS } from "@/relay/types";

export const dynamic = "force-dynamic";

async function captureHandover(formData: FormData) {
  "use server";
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const clientId = String(formData.get("clientId") ?? "");
  const transcript = String(formData.get("transcript") ?? "").trim();

  await requireWorkspaceMember(workspaceId);
  if (!getClient(workspaceId, clientId)) throw new Error("Client not found");
  if (transcript.length < 40 || transcript.length > 8000) throw new Error("Invalid transcript length");
  if (!env().OPENAI_API_KEY) throw new Error("OpenAI is not configured");

  const drafts = await extractClaimsFromTranscript(transcript, generateText);
  const people = listPeople(workspaceId);
  const saidAt = new Date().toISOString().slice(0, 10);
  const documentId = `doc-live-${randomUUID()}`;

  const claims: Claim[] = drafts.map((draft) => ({
    id: `claim-live-${randomUUID()}`,
    workspaceId,
    clientId,
    text: draft.text,
    speakerId: resolveSpeakerId(draft.speakerName, people),
    saidAt,
    sourceDocumentId: documentId,
    quote: draft.quote,
    topics: draft.topics,
    anchors: [],
  }));

  const document: KnowledgeDocument = {
    id: documentId,
    workspaceId,
    clientId,
    kind: "transcript",
    title: `Live handover ${saidAt}`,
    content: transcript,
    updatedAt: saidAt,
    topics: [...new Set(drafts.flatMap((draft) => draft.topics))],
  };

  addHandover({ document, claims });
  invalidateAssessmentCache(workspaceId, clientId);
  revalidatePath(`/w/${workspaceId}/clients/${clientId}`);
}

export default async function ClaimBoardPage({ params }: PageProps<"/w/[workspaceId]/clients/[clientId]">) {
  const { workspaceId, clientId } = await params;
  const { user, workspace } = await requireWorkspacePage(workspaceId);
  const client = getClient(workspaceId, clientId);
  if (!client) notFound();

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
            Every statement from the handover, with its evidence and status. Signals run in {llmMode()} mode.
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
        <p className="text-xs font-semibold uppercase tracking-wide text-brand">Live handover</p>
        <h2 className="mt-1 text-lg font-semibold text-ink">Turn a handover into bounded claims</h2>
        <p className="mt-1 text-sm text-body">
          OpenAI extracts explicit statements only. Every created claim must retain an exact source quote before Relay verifies it.
        </p>
        <form action={captureHandover} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="clientId" value={clientId} />
          <textarea
            name="transcript"
            minLength={40}
            maxLength={8000}
            rows={6}
            required
            placeholder={"Nadia: Meal vouchers are seven euro face value, one per day worked.\nNadia: Sunday work gets a fifty percent premium."}
            className="w-full rounded-md border border-line bg-surface p-3 text-sm text-ink outline-none focus:border-brand"
          />
          <div>
            <button type="submit" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-400">
              Extract claims with OpenAI
            </button>
          </div>
        </form>
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
