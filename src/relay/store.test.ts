import { beforeEach, describe, expect, it } from "vitest";
import { CLAIMS, CLIENTS, DOCUMENTS, PEOPLE } from "./fixtures/demo-workspace";
import { extractClaimsFromTranscript, resolveSpeakerId } from "./extract-claims";
import { addHandover, findUserByEmail, getClaim, getDocument, isMember, listClaims, listClients, resetStore, setReview, getReview } from "./store";

describe("store is workspace-scoped", () => {
  beforeEach(() => resetStore());

  it("does not return records from another workspace, even by id", () => {
    expect(getClaim("ws-demo", "c1")).toBeDefined();
    expect(getClaim("ws-other", "c1")).toBeUndefined();
    expect(getDocument("ws-other", "doc-client-file")).toBeUndefined();
    expect(listClaims("ws-other", "cl-janssens")).toHaveLength(0);
  });

  it("checks membership", () => {
    const outsider = findUserByEmail("OUTSIDER@relay.demo")!;
    expect(isMember(outsider, "ws-demo")).toBe(false);
    expect(isMember(findUserByEmail("incoming@relay.demo")!, "ws-demo")).toBe(true);
  });

  it("seeds three clients whose claims and documents all point at records that exist", () => {
    expect(listClients("ws-demo").map((c) => c.id)).toEqual(["cl-janssens", "cl-willems", "cl-debrug"]);
    const ids = {
      clients: new Set(CLIENTS.map((c) => c.id)),
      documents: new Set(DOCUMENTS.map((d) => d.id)),
      people: new Set(PEOPLE.map((p) => p.id)),
    };
    for (const c of CLAIMS) {
      expect(ids.clients.has(c.clientId), c.id).toBe(true);
      expect(ids.documents.has(c.sourceDocumentId), c.id).toBe(true);
      if (c.speakerId) expect(ids.people.has(c.speakerId), c.id).toBe(true);
      expect(DOCUMENTS.find((d) => d.id === c.sourceDocumentId)?.clientId, c.id).toBe(c.clientId);
      expect(listClaims("ws-demo", c.clientId).length).toBeGreaterThanOrEqual(5);
    }
    for (const d of DOCUMENTS) {
      if (d.clientId) expect(ids.clients.has(d.clientId), d.id).toBe(true);
      if (d.ownerId) expect(ids.people.has(d.ownerId), d.id).toBe(true);
      if (d.supersedes) expect(DOCUMENTS.find((x) => x.id === d.supersedes)?.clientId, d.id).toBe(d.clientId);
    }
    expect(new Set([...CLAIMS.map((c) => c.id), ...DOCUMENTS.map((d) => d.id)]).size).toBe(CLAIMS.length + DOCUMENTS.length);
  });

  it("accepts only scoped live handovers with verbatim quotes", () => {
    addHandover({
      document: {
        id: "doc-live-test",
        workspaceId: "ws-demo",
        clientId: "cl-janssens",
        kind: "transcript",
        title: "Live handover",
        content: "Nadia: Meal vouchers are eight euro.",
        updatedAt: "2026-10-20",
        topics: ["meal-vouchers"],
      },
      claims: [{
        id: "claim-live-test",
        workspaceId: "ws-demo",
        clientId: "cl-janssens",
        text: "Meal vouchers are eight euro.",
        saidAt: "2026-10-20",
        sourceDocumentId: "doc-live-test",
        quote: "Meal vouchers are eight euro.",
        topics: ["meal-vouchers"],
        anchors: [],
      }],
    });

    expect(getDocument("ws-demo", "doc-live-test")?.kind).toBe("transcript");
    expect(getClaim("ws-demo", "claim-live-test")?.quote).toBe("Meal vouchers are eight euro.");
    expect(getClaim("ws-other", "claim-live-test")).toBeUndefined();
  });

  it("fails closed when extraction invents a quote", async () => {
    const transcript = "Nadia: Meal vouchers are seven euro face value, one per day worked.";
    await expect(extractClaimsFromTranscript(transcript, async () => JSON.stringify({
      claims: [{
        text: "Meal vouchers are eight euro.",
        quote: "Meal vouchers are eight euro.",
        topics: ["meal-vouchers"],
        speakerName: "Nadia",
      }],
    }))).rejects.toThrow("not verbatim");
  });

  it("maps an explicit speaker without inventing a person", () => {
    expect(resolveSpeakerId("Nadia", PEOPLE)).toBe("p-nadia");
    expect(resolveSpeakerId("Unknown", PEOPLE)).toBeUndefined();
  });

  it("keys reviews by workspace and claim", () => {
    setReview({ workspaceId: "ws-demo", claimId: "c1", status: "accepted", updatedBy: "u-incoming" });
    expect(getReview("ws-demo", "c1")?.status).toBe("accepted");
    expect(getReview("ws-other", "c1")).toBeUndefined();
  });
});
