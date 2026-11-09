import { consolidate } from "./consolidate";
import { legalAnchorsForClaim } from "./extract-claims";
import { runSignals } from "./registry";
import { registerAllSignals } from "./signals";
import { listClaims, listClients, listDocuments, listPeople } from "./store";
import type { Claim, ClaimTrust, LlmClient } from "./types";

export interface Assessment {
  claims: Claim[];
  trust: Map<string, ClaimTrust>;
  errors: { signalId: string; message: string }[];
}

/** Runs every signal over a client's claims and consolidates the results. */
export async function assessClient(
  workspaceId: string,
  clientId: string,
  llm: LlmClient,
  now = new Date(),
): Promise<Assessment> {
  registerAllSignals();
  const clients = listClients(workspaceId);
  const scopeIssues = new Map<string, string>();
  // Re-derive review relevance for seeded/older records too; model tags or stored
  // anchors do not authorise legal applicability and the store is not mutated.
  const claims = listClaims(workspaceId, clientId).map((claim) => {
    const client = clients.find((c) => c.id === claim.clientId && c.workspaceId === claim.workspaceId);
    try {
      return { ...claim, anchors: legalAnchorsForClaim(claim, client?.jurisdiction) };
    } catch {
      scopeIssues.set(claim.id, "The statement's legal context could not be bound to recorded client context. Human review is required.");
      return { ...claim, anchors: [] };
    }
  });
  const report = await runSignals(claims.filter((claim) => !scopeIssues.has(claim.id)), {
    workspaceId,
    now,
    documents: listDocuments(workspaceId),
    clients,
    people: listPeople(workspaceId),
    llm,
    log: (m) => console.warn(`[relay] ${m}`),
  });
  const trust = new Map(consolidate(claims.map((c) => c.id), report.results).map((t) => [t.claimId, t]));
  for (const [claimId, reason] of scopeIssues) {
    trust.set(claimId, { claimId, verdict: "unknown", score: 0.5, signals: [], reasons: [reason], actions: [] });
  }
  return {
    claims, trust,
    errors: [...report.errors, ...[...scopeIssues].map(([claimId, message]) => ({ signalId: "legal-context", message: `${claimId}: ${message}` }))],
  };
}
