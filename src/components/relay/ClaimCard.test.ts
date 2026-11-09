import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Claim, ClaimTrust } from "@/relay/types";
import { ClaimCard } from "./ClaimCard";

vi.mock("./ClaimActions", () => ({ ClaimActions: () => null }));

const claim: Claim = {
  id: "synthetic-claim", workspaceId: "ws-demo", clientId: "cl-demo", text: "Synthetic meal voucher statement.",
  saidAt: "2026-11-09", sourceDocumentId: "synthetic-transcript", topics: [], anchors: [],
};
function card(pending: boolean) {
  const trust: ClaimTrust = {
    claimId: claim.id, verdict: "confirmed", score: 0.8, reasons: [], actions: [],
    signals: [{
      signalId: "document-evidence", claimId: claim.id, verdict: "confirmed", confidence: 0.8,
      summary: "A quotation was found in the supplied source.", evidence: [],
      details: pending ? { semanticVerification: "PENDING_HUMAN_REVIEW" } : undefined,
    }],
  };
  return renderToStaticMarkup(createElement(ClaimCard, {
    workspaceId: "ws-demo", claim, trust, documents: new Map(), people: new Map(),
  }));
}

describe("claim source-match boundary", () => {
  it("shows pending meaning/applicability review alongside technical evidence", () => {
    const html = card(true);
    expect(html).toContain("Meaning and applicability need human review.");
    expect(html).toContain("A quotation was found in the supplied source.");
    expect(html).toContain("80%");
  });

  it("does not invent a pending semantic-review status for other signals", () => {
    expect(card(false)).not.toContain("Meaning and applicability need human review.");
  });
});
