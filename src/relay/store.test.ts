import { beforeEach, describe, expect, it } from "vitest";
import { CLAIMS, CLIENTS, DOCUMENTS, PEOPLE } from "./fixtures/demo-workspace";
import { extractClaimsFromTranscript, legalAnchorsForClaim, resolveSpeakerId } from "./extract-claims";
import { regulationWatch } from "./signals/regulation-watch";
import { createContext } from "./testing";
import type { Jurisdiction } from "./types";
import { addHandover, findUserByEmail, getClaim, getDocument, isMember, listClaims, listClients, listDocuments, resetStore, setReview, getReview } from "./store";

const clientJurisdiction = CLIENTS.find((client) => client.id === "cl-janssens")!.jurisdiction;

function liveHandover(text = "The client prefers a phone call before noon.", topics = ["contact"]): Parameters<typeof addHandover>[0] {
  return {
    document: {
      id: "doc-live-regression", workspaceId: "ws-demo", clientId: "cl-janssens", kind: "transcript",
      title: "Live handover", content: `Nadia: ${text}`, updatedAt: "2026-11-02", topics,
    },
    claims: [{
      id: "claim-live-regression", workspaceId: "ws-demo", clientId: "cl-janssens", text, quote: text,
      saidAt: "2026-11-02", sourceDocumentId: "doc-live-regression", topics, anchors: [],
    }],
  };
}

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
        anchors: [{ topic: "meal-vouchers", jurisdiction: { country: "BE", region: "Flanders", jointCommittee: "118" } }],
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

  it.each([
    ["Sunday work gets a fifty percent premium.", "Sunday work gets a hundred percent premium."],
    ["Private use of the company car is not permitted.", "Private use of the company car is permitted."],
  ])("rejects a rewritten claim despite a valid quote: %s", async (quote, text) => {
    const transcript = `Nadia: ${quote}`;
    await expect(extractClaimsFromTranscript(transcript, async () => JSON.stringify({
      claims: [{ text, quote, topics: ["client-history"] }],
    }))).rejects.toThrow();
  });

  it("rejects a valid quote attached to a rewritten claim without storing anything", () => {
    const quote = "Sunday work gets a fifty percent premium.";
    const before = listClaims("ws-demo", "cl-janssens").length;
    expect(() => addHandover({
      document: {
        id: "doc-invalid-source", workspaceId: "ws-demo", clientId: "cl-janssens",
        kind: "transcript", title: "Live handover", content: `Nadia: ${quote}`,
        updatedAt: "2026-11-02", topics: ["client-history"],
      },
      claims: [{
        id: "claim-invalid-source", workspaceId: "ws-demo", clientId: "cl-janssens",
        text: "Sunday work gets a hundred percent premium.", quote,
        saidAt: "2026-11-02", sourceDocumentId: "doc-invalid-source",
        topics: ["client-history"], anchors: [],
      }],
    })).toThrow();
    expect(getDocument("ws-demo", "doc-invalid-source")).toBeUndefined();
    expect(listClaims("ws-demo", "cl-janssens")).toHaveLength(before);
  });

  it("preserves the exact statement, including its negation", async () => {
    const quote = "Private use of the company car is not permitted.";
    const drafts = await extractClaimsFromTranscript(`Nadia: ${quote}`, async () => JSON.stringify({
      claims: [{ text: quote, quote, topics: ["company-car"] }],
    }));
    expect(drafts[0].text).toBe(quote);
    expect(drafts[0].quote).toBe(quote);
  });

  it("rejects a verbatim statement over 240 characters", async () => {
    const quote = "a".repeat(241);
    await expect(extractClaimsFromTranscript(`Nadia: ${quote}`, async () => JSON.stringify({
      claims: [{ text: quote, quote, topics: ["contact"] }],
    }))).rejects.toThrow();
    const input = liveHandover(quote);
    expect(() => addHandover(input)).toThrow();
    expect(getDocument("ws-demo", input.document.id)).toBeUndefined();
  });

  it("carries an extracted legal claim through storage into Regulation Watch", async () => {
    const text = "Wages under Joint Committee 118 are indexed every January.";
    const drafts = await extractClaimsFromTranscript(`Nadia: ${text}`, async () => JSON.stringify({
      claims: [{ text, quote: text, topics: ["wage-indexation"] }],
    }));
    const input = liveHandover(drafts[0].text, drafts[0].topics);
    input.claims[0].anchors = legalAnchorsForClaim(drafts[0], clientJurisdiction);
    expect(input.claims[0].anchors).toEqual([
      { topic: "indexation", jurisdiction: { country: "BE", region: "Flanders", jointCommittee: "118" } },
    ]);
    addHandover(input);
    const claim = getClaim("ws-demo", input.claims[0].id)!;
    const results = await regulationWatch.evaluate([claim], createContext({ workspaceId: "ws-demo" }));
    expect(results).toHaveLength(1);
    expect(results[0].claimId).toBe(claim.id);
    expect(results[0].verdict).toBe("expiring");
    expect(results[0].evidence.some((evidence) => evidence.documentId === "reg:reg-be-jc118-indexation-2026-01")).toBe(true);
  });

  it.each<Jurisdiction | undefined>([undefined, { country: "" }, { country: "BE" }])(
    "rejects missing legal context before any write: %j", (jurisdiction) => {
      const input = liveHandover("Wages under Joint Committee 118 are indexed every January.", ["indexation"]);
      const before = listDocuments("ws-demo").length;
      expect(() => {
        input.claims[0].anchors = legalAnchorsForClaim(input.claims[0], jurisdiction);
        addHandover(input);
      }).toThrow();
      expect(listDocuments("ws-demo")).toHaveLength(before);
      expect(getClaim("ws-demo", input.claims[0].id)).toBeUndefined();
    },
  );

  it.each([
    "Wages under Joint Committee 220 are indexed every January.",
    "Meal vouchers for country FR are supplied daily.",
  ])("rejects explicit jurisdiction conflicting with the client: %s", (text) => {
    const input = liveHandover(text, [text.startsWith("Wages") ? "indexation" : "meal-vouchers"]);
    expect(() => {
      input.claims[0].anchors = legalAnchorsForClaim(input.claims[0], clientJurisdiction);
      addHandover(input);
    }).toThrow("conflicts");
    expect(getDocument("ws-demo", input.document.id)).toBeUndefined();
  });

  it.each(["missing", "conflicting"])("rejects %s legal anchors at the storage boundary", (kind) => {
    const input = liveHandover("Wages under Joint Committee 118 are indexed every January.", ["indexation"]);
    if (kind === "conflicting") {
      input.claims[0].anchors = [{ topic: "indexation", jurisdiction: { country: "BE", jointCommittee: "220" } }];
    }
    expect(() => addHandover(input)).toThrow("Legal anchors");
    expect(getDocument("ws-demo", input.document.id)).toBeUndefined();
    expect(getClaim("ws-demo", input.claims[0].id)).toBeUndefined();
  });

  it("does not mistake ordinary words after country for an explicit country code", () => {
    const input = liveHandover("Meal vouchers apply here; the country is Belgium.", ["meal-vouchers"]);
    input.claims[0].anchors = legalAnchorsForClaim(input.claims[0], clientJurisdiction);
    addHandover(input);
    expect(getClaim("ws-demo", input.claims[0].id)?.anchors[0].jurisdiction.country).toBe("BE");
  });

  it("keeps a non-legal handover usable without legal anchors", () => {
    const input = liveHandover();
    expect(legalAnchorsForClaim(input.claims[0], undefined)).toEqual([]);
    addHandover(input);
    expect(getClaim("ws-demo", input.claims[0].id)?.anchors).toEqual([]);
  });

  it("rejects the entire handover when its second claim is invalid", () => {
    const input = liveHandover();
    input.claims.push({ ...input.claims[0], id: "claim-invalid-second", text: "The client prefers email instead." });
    const before = listClaims("ws-demo", "cl-janssens").length;
    expect(() => addHandover(input)).toThrow();
    expect(getDocument("ws-demo", input.document.id)).toBeUndefined();
    expect(getClaim("ws-demo", input.claims[0].id)).toBeUndefined();
    expect(listClaims("ws-demo", "cl-janssens")).toHaveLength(before);
  });

  it.each(["workspaceId", "clientId"] as const)("retains %s isolation on handover writes", (key) => {
    const input = liveHandover();
    input.claims[0][key] = key === "workspaceId" ? "ws-other" : "cl-willems";
    expect(() => addHandover(input)).toThrow("scope");
    expect(getDocument("ws-demo", input.document.id)).toBeUndefined();
  });

  it("keys reviews by workspace and claim", () => {
    setReview({ workspaceId: "ws-demo", claimId: "c1", status: "accepted", updatedBy: "u-incoming" });
    expect(getReview("ws-demo", "c1")?.status).toBe("accepted");
    expect(getReview("ws-other", "c1")).toBeUndefined();
  });
});
