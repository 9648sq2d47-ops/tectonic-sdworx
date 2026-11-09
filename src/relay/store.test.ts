import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLAIMS, CLIENTS, DOCUMENTS, PEOPLE } from "./fixtures/demo-workspace";
import { extractClaimsFromTranscript, legalAnchorsForClaim, resolveQuotedSpeaker, resolveSpeakerId } from "./extract-claims";
import { regulationWatch } from "./signals/regulation-watch";
import { createContext } from "./testing";
import type { Jurisdiction } from "./types";
import { MAX_TURN_CHARS, normalizeTranscript, type CaptureSummary } from "./handover-contract";
import { addHandover, captureHandoverOnce, findUserByEmail, getClaim, getDocument, isMember, listClaims, listClients, listDocuments, listPeople, resetStore, setReview, getReview } from "./store";

const clientJurisdiction = CLIENTS.find((client) => client.id === "cl-janssens")!.jurisdiction;

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network disabled in handover regression tests"); }));
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

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
    expect(drafts[0].text).toBe(normalizeTranscript(quote));
    expect(drafts[0].quote).toBe(normalizeTranscript(quote));
  });

  it("rejects a verbatim statement over the shared turn limit", async () => {
    const quote = "a".repeat(MAX_TURN_CHARS + 1);
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

describe("complete source turn context", () => {
  beforeEach(() => resetStore());

  const statement = "Meal vouchers are eight euro per day.";
  const negation = "It is not true that meal vouchers are eight euro per day.";
  const condition = "Only if the new agreement is signed, meal vouchers are eight euro per day.";
  const clipped = [
    { name: "leading negation", transcript: `Nadia: ${negation}`, quote: "meal vouchers are eight euro per day." },
    { name: "leading condition", transcript: `Nadia: ${condition}`, quote: "meal vouchers are eight euro per day." },
    { name: "trailing condition", transcript: "Nadia: Meal vouchers are eight euro per day, only if the new agreement is signed.", quote: "Meal vouchers are eight euro per day" },
    { name: "preceding sentence", transcript: `Nadia: The following sentence is false. ${statement}`, quote: statement },
    { name: "following sentence", transcript: `Nadia: ${statement} This applies only if the new agreement is signed.`, quote: statement },
    { name: "multiline qualifier", transcript: `Nadia: The following sentence is false.\r\n${statement}`, quote: statement },
    { name: "Dutch negation", transcript: "Nadia: Het is niet waar dat maaltijdcheques acht euro per dag bedragen.", quote: "maaltijdcheques acht euro per dag bedragen." },
    { name: "Dutch condition", transcript: "Nadia: Alleen als de overeenkomst getekend is, bedragen de maaltijdcheques acht euro per dag.", quote: "bedragen de maaltijdcheques acht euro per dag." },
    { name: "a source turn longer than the selected quote", transcript: `Nadia: ${"Context about this agreement must be retained. ".repeat(6)}${statement}`, quote: statement },
  ];

  it.each(clipped)("rejects extraction that omits $name", async ({ transcript, quote }) => {
    const generate = vi.fn(async () => JSON.stringify({
      claims: [{ text: quote, quote, topics: ["meal-vouchers"], speakerName: "Nadia" }],
    }));
    await expect(extractClaimsFromTranscript(transcript, generate, PEOPLE)).rejects.toThrow("complete source turn");
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it.each(clipped)("rejects direct storage that omits $name without writing", ({ transcript, quote }) => {
    const input = liveHandover(quote, ["meal-vouchers"]);
    input.document.content = transcript;
    input.claims[0].anchors = legalAnchorsForClaim(input.claims[0], clientJurisdiction);
    const documents = listDocuments("ws-demo").length;
    const claims = listClaims("ws-demo", input.document.clientId!).length;

    expect(() => addHandover(input)).toThrow("complete source turn");
    expect(listDocuments("ws-demo")).toHaveLength(documents);
    expect(listClaims("ws-demo", input.document.clientId!)).toHaveLength(claims);
    expect(getDocument("ws-demo", input.document.id)).toBeUndefined();
  });

  it.each([
    { name: "full negation", transcript: `Nadia: ${negation}`, quote: negation },
    { name: "full condition", transcript: `Nadia: ${condition}`, quote: condition },
    { name: "full multiline turn", transcript: `Nadia: The following sentence is false.\r\n${statement}`, quote: `The following sentence is false.\r\n${statement}` },
    { name: "unlabeled source", transcript: negation, quote: negation },
    { name: "separate speaker turns", transcript: `Nadia: ${statement}\nEls: I will check the file tomorrow.`, quote: statement },
    { name: "repeated complete turns", transcript: `Nadia: ${statement}\nNadia: ${statement}`, quote: statement },
    { name: "surrounding whitespace", transcript: ` \n  Nadia: \t${statement} \r\n`, quote: statement },
  ])("preserves $name through extraction and storage", async ({ transcript, quote }) => {
    const drafts = await extractClaimsFromTranscript(transcript, async () => JSON.stringify({
      claims: [{ text: quote, quote, topics: ["meal-vouchers"] }],
    }), PEOPLE);
    expect(drafts[0].text).toBe(normalizeTranscript(quote));
    expect(drafts[0].quote).toBe(normalizeTranscript(quote));

    const input = liveHandover(quote, drafts[0].topics);
    input.document.content = transcript;
    input.claims[0].anchors = legalAnchorsForClaim(drafts[0], clientJurisdiction);
    addHandover(input);
    expect(getClaim("ws-demo", input.claims[0].id)?.quote).toBe(normalizeTranscript(quote));
  });

  it("does not store an earlier valid claim when a later claim clips its context", () => {
    const input = liveHandover();
    input.document.content += `\nNadia: ${negation}`;
    input.claims.push({ ...input.claims[0], id: "claim-clipped-second", text: "meal vouchers are eight euro per day.", quote: "meal vouchers are eight euro per day." });
    const claims = listClaims("ws-demo", input.document.clientId!).length;

    expect(() => addHandover(input)).toThrow("complete source turn");
    expect(getDocument("ws-demo", input.document.id)).toBeUndefined();
    expect(getClaim("ws-demo", input.claims[0].id)).toBeUndefined();
    expect(getClaim("ws-demo", input.claims[1].id)).toBeUndefined();
    expect(listClaims("ws-demo", input.document.clientId!)).toHaveLength(claims);
  });
});

describe("quoted-turn speaker binding", () => {
  beforeEach(() => resetStore());
  const quote = "The client prefers a phone call before noon.";
  const reply = (speakerName?: string) => JSON.stringify({
    claims: [{ text: quote, quote, topics: ["contact"], speakerName }],
  });

  it("derives the speaker when the model omits it", async () => {
    const drafts = await extractClaimsFromTranscript(`Nadia: ${quote}`, async () => reply(), PEOPLE);
    expect(drafts[0].speakerName).toBe("Nadia");
    const input = liveHandover();
    addHandover(input);
    expect(getClaim("ws-demo", input.claims[0].id)?.speakerId).toBe("p-nadia");
  });

  it("rejects a wrong known model speaker even when that speaker appears elsewhere", async () => {
    const transcript = `Els: I will check the file tomorrow.\nNadia: ${quote}`;
    await expect(extractClaimsFromTranscript(transcript, async () => reply("Els"), PEOPLE)).rejects.toThrow("conflicts");
  });

  it("accepts a full-name alias only when it resolves to the same source speaker", async () => {
    const drafts = await extractClaimsFromTranscript(`Nadia: ${quote}`, async () => reply("Nadia Haddad"), PEOPLE);
    expect(drafts[0].speakerName).toBe("Nadia");
  });

  it.each(["Unknown", "Karim"])("rejects an unsupported model assignment: %s", async (name) => {
    await expect(extractClaimsFromTranscript(`Nadia: ${quote}`, async () => reply(name), PEOPLE)).rejects.toThrow("conflicts");
  });

  it("keeps an unknown source label without inventing a registered person", async () => {
    const drafts = await extractClaimsFromTranscript(`Visitor: ${quote}`, async () => reply("Visitor"), PEOPLE);
    expect(drafts[0].speakerName).toBe("Visitor");
    expect(resolveQuotedSpeaker(`Visitor: ${quote}`, quote, PEOPLE).id).toBeUndefined();
  });

  it("keeps unlabeled text unassigned even when the model suggests a speaker", async () => {
    expect((await extractClaimsFromTranscript(quote, async () => reply(), PEOPLE))[0].speakerName).toBeUndefined();
    expect((await extractClaimsFromTranscript(quote, async () => reply("Nadia"), PEOPLE))[0].speakerName).toBeUndefined();
  });

  it.each(["Els", "Visitor"])("rejects the same quotation ambiguously attributed to Nadia and %s", async (other) => {
    await expect(extractClaimsFromTranscript(`Nadia: ${quote}\n${other}: ${quote}`, async () => reply("Nadia"), PEOPLE)).rejects.toThrow("ambiguous");
  });

  it("rejects a quote with both unlabeled and labeled occurrences", () => {
    expect(() => resolveQuotedSpeaker(`${quote}\nNadia: ${quote}`, quote, PEOPLE)).toThrow("ambiguous");
  });

  it("allows repeated quotes from the same uniquely resolved speaker", () => {
    expect(resolveQuotedSpeaker(`Nadia: ${quote}\nNadia Haddad: ${quote}`, quote, PEOPLE).id).toBe("p-nadia");
  });

  it.each(["Nadia Haddad", "Nadia Other", "Nadia"])("does not assign ambiguous person records: %s", (name) => {
    const people = [...PEOPLE, { ...PEOPLE[0], id: "p-second-nadia", name }];
    const label = name === "Nadia Haddad" ? "Nadia Haddad" : "Nadia";
    expect(() => resolveQuotedSpeaker(`${label}: ${quote}`, quote, people)).toThrow("ambiguous");
  });

  it("binds a multiline continuation to the preceding speaker label", () => {
    expect(resolveQuotedSpeaker(`Nadia: A handover note follows.\r\n${quote}\r\nEls: Thank you.`, quote, PEOPLE).id).toBe("p-nadia");
  });

  it("rejects a quote spanning two turns or including a speaker label", () => {
    expect(() => resolveQuotedSpeaker(`Nadia: ${quote}\nEls: Thank you.`, `${quote}\nEls: Thank you.`, PEOPLE)).toThrow("speaker turn");
    expect(() => resolveQuotedSpeaker(`Nadia: ${quote}`, `Nadia: ${quote}`, PEOPLE)).toThrow("speaker label");
  });

  it.each(["p-els", "invented-person"])("rejects a supplied wrong speaker at the storage boundary: %s", (speakerId) => {
    const input = liveHandover();
    input.claims[0].speakerId = speakerId;
    expect(() => addHandover(input)).toThrow("speaker conflicts");
    expect(getDocument("ws-demo", input.document.id)).toBeUndefined();
    expect(getClaim("ws-demo", input.claims[0].id)).toBeUndefined();
  });

  it("does not resolve a person from another workspace", () => {
    const input = liveHandover();
    // Initialize only this test's in-memory store, leaving the fixture unchanged.
    listClaims("ws-demo", "cl-janssens");
    globalThis.__relayStore!.people.push({ ...PEOPLE[0], id: "p-foreign", workspaceId: "ws-other" });
    input.claims[0].speakerId = "p-foreign";
    expect(() => addHandover(input)).toThrow("speaker conflicts");
    expect(getDocument("ws-demo", input.document.id)).toBeUndefined();
  });
});

describe("process-local exact handover retries", () => {
  beforeEach(() => resetStore());
  const quote = "The client prefers a phone call before noon.";
  const input = { workspaceId: "ws-demo", clientId: "cl-janssens", transcript: `Nadia: ${quote}`, saidAt: "2026-09-29" };
  const reply = JSON.stringify({ claims: [{ text: quote, quote, topics: ["contact"], speakerName: "Nadia" }] });

  it("uses the explicit handover source date for the claim and transcript", async () => {
    const generate = vi.fn(async () => reply);
    await captureHandoverOnce(input, generate);
    const stored = listClaims("ws-demo", "cl-janssens").find((claim) => claim.id.startsWith("claim-live-"));
    expect(stored?.saidAt).toBe("2026-09-29");
    const transcript = listDocuments("ws-demo", "cl-janssens").find((doc) => doc.id.startsWith("doc-live-"));
    expect(transcript?.updatedAt).toBe("2026-09-29");
    expect(transcript?.title).toContain("2026-09-29");
  });

  it("rejects an invalid or missing handover date before any model call", () => {
    const generate = vi.fn(async () => reply);
    expect(() => captureHandoverOnce({ ...input, saidAt: "" }, generate)).toThrow("Invalid handover date");
    expect(() => captureHandoverOnce({ ...input, saidAt: "2026-02-30" }, generate)).toThrow("Invalid handover date");
    expect(generate).not.toHaveBeenCalled();
  });

  it("treats the same transcript on a different source date as a distinct handover", async () => {
    const generate = vi.fn(async () => reply);
    await captureHandoverOnce(input, generate);
    await captureHandoverOnce({ ...input, saidAt: "2026-09-30" }, generate);
    expect(generate).toHaveBeenCalledTimes(2);
    const docs = listDocuments("ws-demo", "cl-janssens").filter((doc) => doc.content === input.transcript);
    expect(docs.map((doc) => doc.updatedAt).sort()).toEqual(["2026-09-29", "2026-09-30"]);
  });

  it("handles sequential replay without another model call or stored record", async () => {
    const generate = vi.fn(async () => reply);
    const before = listClaims("ws-demo", "cl-janssens").length;
    await captureHandoverOnce(input, generate);
    await captureHandoverOnce(input, generate);
    await captureHandoverOnce({ ...input, transcript: `  ${input.transcript}\n` }, generate);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(listClaims("ws-demo", "cl-janssens")).toHaveLength(before + 1);
    expect(listDocuments("ws-demo", "cl-janssens").filter((d) => d.content === input.transcript)).toHaveLength(1);
  });

  it("coalesces concurrent requests before calling the mocked model", async () => {
    let finish!: (value: string) => void;
    const generate = vi.fn(() => new Promise<string>((resolve) => { finish = resolve; }));
    const before = listClaims("ws-demo", "cl-janssens").length;
    const first = captureHandoverOnce(input, generate);
    const second = captureHandoverOnce(input, generate);
    await Promise.resolve();
    expect(generate).toHaveBeenCalledTimes(1);
    expect(listClaims("ws-demo", "cl-janssens")).toHaveLength(before);
    finish(reply);
    await Promise.all([first, second]);
    expect(listClaims("ws-demo", "cl-janssens")).toHaveLength(before + 1);
  });

  it("sets the reservation before the generator itself can trigger a retry", async () => {
    let nested!: Promise<CaptureSummary>;
    const generate = vi.fn(async () => {
      nested = captureHandoverOnce(input, generate);
      return reply;
    });
    await captureHandoverOnce(input, generate);
    await nested;
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it.each(["model rejection", "invalid JSON", "speaker conflict"])("releases a failed reservation for a clean retry: %s", async (failure) => {
    const generate = vi.fn(async () => {
      if (failure === "model rejection") throw new Error("Synthetic model failure");
      if (failure === "invalid JSON") return "invalid";
      return reply.replace('"Nadia"', '"Els"');
    });
    const before = listClaims("ws-demo", "cl-janssens").length;
    const results = await Promise.allSettled([captureHandoverOnce(input, generate), captureHandoverOnce(input, generate)]);
    if (failure === "speaker conflict") {
      expect(results.every((result) => result.status === "fulfilled" && result.value.status === "rejected")).toBe(true);
    } else {
      expect(results.map((result) => result.status)).toEqual(["rejected", "rejected"]);
    }
    expect(generate).toHaveBeenCalledTimes(1);
    expect(listClaims("ws-demo", "cl-janssens")).toHaveLength(before);
    expect(listDocuments("ws-demo", "cl-janssens").some((d) => d.content === input.transcript)).toBe(false);
    generate.mockResolvedValue(reply);
    await captureHandoverOnce(input, generate);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(listClaims("ws-demo", "cl-janssens")).toHaveLength(before + 1);
  });

  it("does not deduplicate different clients", async () => {
    const generate = vi.fn(async () => reply);
    await Promise.all([captureHandoverOnce(input, generate), captureHandoverOnce({ ...input, clientId: "cl-willems" }, generate)]);
    expect(generate).toHaveBeenCalledTimes(2);
    for (const clientId of ["cl-janssens", "cl-willems"]) {
      expect(listDocuments("ws-demo", clientId).filter((d) => d.content === input.transcript)).toHaveLength(1);
    }
  });

  it("does not deduplicate different workspaces", async () => {
    listClients("ws-demo");
    globalThis.__relayStore!.clients.push({ ...CLIENTS[0], workspaceId: "ws-other" });
    const generate = vi.fn(async () => reply);
    await Promise.all([captureHandoverOnce(input, generate), captureHandoverOnce({ ...input, workspaceId: "ws-other" }, generate)]);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(listDocuments("ws-other", input.clientId)).toHaveLength(1);
  });

  it("keeps distinct transcripts separate", async () => {
    const generate = vi.fn(async () => reply);
    await captureHandoverOnce(input, generate);
    await captureHandoverOnce({ ...input, transcript: `${input.transcript}\nEls: Thank you.` }, generate);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it.each([
    { workspaceId: "ws-other" }, { clientId: "missing-client" }, { transcript: "too short" }, { saidAt: "not-a-date" },
  ])("rejects invalid input before any model call: %j", async (change) => {
    const generate = vi.fn(async () => reply);
    await expect(async () => captureHandoverOnce({ ...input, ...change }, generate)).rejects.toThrow();
    expect(generate).not.toHaveBeenCalled();
  });

  it("also rejects a direct storage replay with fresh IDs", () => {
    const first = liveHandover();
    addHandover(first);
    const second = liveHandover();
    second.document.id = "doc-replay";
    second.claims[0].id = "claim-replay";
    second.claims[0].sourceDocumentId = second.document.id;
    expect(() => addHandover(second)).toThrow("transcript already exists");
    expect(getDocument("ws-demo", second.document.id)).toBeUndefined();
  });

  it("loses retry state on an explicit store reset, matching process-local scope", async () => {
    const generate = vi.fn(async () => reply);
    await captureHandoverOnce(input, generate);
    resetStore();
    await captureHandoverOnce(input, generate);
    expect(generate).toHaveBeenCalledTimes(2);
  });
});

describe("speaker fallback and reservation ownership", () => {
  beforeEach(() => resetStore());
  const quote = "The client prefers a phone call before noon.";
  const input = { workspaceId: "ws-demo", clientId: "cl-janssens", transcript: `Nadia: ${quote}`, saidAt: "2026-09-29" };
  const reply = (speakerName?: string) => JSON.stringify({
    claims: [{ text: quote, quote, topics: ["contact"], speakerName }],
  });

  it.each([undefined, "Nadia"])("reports an ambiguous quoted turn without storing it: %s", async (speakerName) => {
    const transcript = `Nadia: ${quote}\nEls: ${quote}`;
    const result = await captureHandoverOnce({ ...input, transcript }, async () => reply(speakerName));
    expect(result).toMatchObject({ status: "rejected", acceptedCount: 0, rejectedCount: 1 });
    expect(result.rejections[0].reason).toContain("ambiguous");
    expect(listDocuments("ws-demo", "cl-janssens").some((d) => d.content === transcript)).toBe(false);
  });

  it("does not choose between people sharing a source label", async () => {
    listPeople("ws-demo");
    globalThis.__relayStore!.people.push({ ...PEOPLE[0], id: "p-other-nadia", name: "Nadia Other" });
    const result = await captureHandoverOnce(input, async () => reply("Nadia Haddad"));
    expect(result.status).toBe("rejected");
    expect(result.rejections[0].reason).toContain("ambiguous");
    expect(listDocuments("ws-demo", "cl-janssens").some((d) => d.content === input.transcript)).toBe(false);
  });

  it("keeps an unlabeled quote unassigned despite a suggested model name", async () => {
    await captureHandoverOnce({ ...input, transcript: quote }, async () => reply("Nadia"));
    const document = listDocuments("ws-demo", "cl-janssens").find((d) => d.content === quote)!;
    expect(listClaims("ws-demo", "cl-janssens").find((c) => c.sourceDocumentId === document.id)?.speakerId).toBeUndefined();
  });

  it("cannot delete a successor reservation when its own request fails", async () => {
    let reject!: (reason: Error) => void;
    const generate = vi.fn(() => new Promise<string>((_resolve, rejectPromise) => { reject = rejectPromise; }));
    const first = captureHandoverOnce(input, generate);
    await Promise.resolve();
    const pending = globalThis.__relayStore!.handoversInFlight!;
    const key = [...pending.keys()][0];
    const successor = Promise.resolve<CaptureSummary>({ status: "rejected", acceptedCount: 0, rejectedCount: 0, rejections: [], limitReached: false });
    pending.set(key, successor);
    reject(new Error("Synthetic failure of previous owner"));
    await expect(first).rejects.toThrow("previous owner");
    expect(captureHandoverOnce(input, generate)).toBe(successor);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(listDocuments("ws-demo", "cl-janssens").some((d) => d.content === input.transcript)).toBe(false);
  });

  it("stores only the valid set, reports a wrong speaker, and identifies a replay", async () => {
    const other = "The client asks to receive the invoice by email.";
    const transcript = `Nadia: ${quote}\nEls: ${other}`;
    const beforeDocuments = listDocuments("ws-demo", "cl-janssens").length;
    const beforeClaims = listClaims("ws-demo", "cl-janssens").length;
    const generate = vi.fn(async () => JSON.stringify({
      claims: [
        { text: quote, quote, topics: ["contact"], speakerName: "Nadia" },
        { text: other, quote: other, topics: ["contact"], speakerName: "Nadia" },
      ],
    }));
    const result = await captureHandoverOnce({ ...input, transcript }, generate);
    expect(result).toMatchObject({ status: "captured", acceptedCount: 1, rejectedCount: 1 });
    expect(result.rejections[0]).toMatchObject({ index: 1 });
    expect(result.rejections[0].reason).toContain("conflicts");
    expect(listDocuments("ws-demo", "cl-janssens")).toHaveLength(beforeDocuments + 1);
    expect(listClaims("ws-demo", "cl-janssens")).toHaveLength(beforeClaims + 1);
    expect(listClaims("ws-demo", "cl-janssens").some((claim) => claim.text === other)).toBe(false);
    expect((await captureHandoverOnce({ ...input, transcript }, generate)).status).toBe("duplicate");
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
