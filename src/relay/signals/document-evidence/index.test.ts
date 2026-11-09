import { describe, expect, it } from "vitest";
import { CLAIMS, CLIENTS, DOCUMENTS, PEOPLE } from "../../fixtures/demo-workspace";
import { createContext, createStubLlm } from "../../testing";
import type { SignalResult, Verdict } from "../../types";
import { documentEvidence, splitIntoPassages, tokenise } from "./index";

const ctx = createContext({ workspaceId: "ws-demo", documents: DOCUMENTS, clients: CLIENTS, people: PEOPLE });

let cached: Map<string, SignalResult> | undefined;
const byClaim = async () => {
  cached ??= new Map((await documentEvidence.evaluate(CLAIMS, ctx)).map((r) => [r.claimId, r]));
  return cached;
};

const EXPECTED: Record<string, Verdict> = {
  c1: "confirmed",
  c2: "contradicted",
  c3: "unsupported",
  c4: "unsupported", // "shop staff" is not established by the document's "blue-collar workers".
  c5: "unsupported", // The source says "normally" in May, not an unconditional timing rule.
  c6: "unsupported", // Number, use and tax conclusion require interpretation across separate sentences.
  c7: "contradicted",
  c8: "unsupported",
  w1: "confirmed",
  w2: "unsupported", // "Every June" versus "every year in June" needs semantic interpretation.
  w3: "contradicted",
  w4: "confirmed",
  w5: "unsupported",
  b1: "confirmed",
  b2: "contradicted",
  b3: "confirmed",
  b4: "confirmed",
  b5: "unsupported",
  b6: "unsupported", // "These employees" requires resolving a reference in another sentence.
};

describe("document-evidence", () => {
  it("has an opinion on every seeded claim with the expected verdict (deterministic path)", async () => {
    const m = await byClaim();
    const got = Object.fromEntries([...m].map(([id, r]) => [id, r.verdict]));
    expect(got).toEqual(EXPECTED);
    for (const r of m.values()) {
      expect(r.signalId).toBe("document-evidence");
      expect(r.details?.judge).toBe("deterministic");
      expect(r.confidence).toBeGreaterThan(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
      expect(r.summary.length).toBeGreaterThan(0);
    }
  });

  it("confirms the 13th-month claim from the client file, §4", async () => {
    const r = (await byClaim()).get("c1")!;
    expect(r.confidence).toBe(0.7);
    expect(r.evidence).toHaveLength(1);
    expect(r.evidence[0].documentId).toBe("doc-client-file");
    expect(r.evidence[0].excerpt).toContain("§4");
    expect(r.evidence[0].locator).toBe("line 3");
    expect(r.evidence[0].effectiveDate).toBe("2026-03-12");
    expect(r.summary).toContain("Client file: Bakkerij Janssens BV");
  });

  it("contradicts the 7 euro meal voucher claim with the newer 2026 policy, citing the replaced 2024 one too", async () => {
    const r = (await byClaim()).get("c2")!;
    expect(r.confidence).toBe(0.7);
    expect(r.evidence.map((e) => e.documentId)).toEqual(["doc-mealvoucher-2026", "doc-mealvoucher-2024"]);
    expect(r.evidence[0].excerpt).toContain("8.00 euro");
    expect(r.summary).toContain("Meal voucher arrangement (2026)");
    expect(r.summary).toContain("gives 8, 6.91, 1.09 where the statement says 7");
    expect(r.summary).toMatch(/replaced/);
  });

  it("finds nothing about WhatsApp and asks the person who knows the contact history", async () => {
    const r = (await byClaim()).get("c3")!;
    expect(r.evidence).toEqual([]);
    expect(r.actions).toEqual([{ type: "ask-expert", label: "Ask Nadia Haddad", personId: "p-nadia" }]);
  });

  it("retains the located documents but leaves inferred subjects, conditions and cross-sentence meaning for review", async () => {
    const m = await byClaim();
    const documents = { c4: "doc-client-file", c5: "doc-holiday-note", c6: "doc-company-car-email", w2: "doc-willems-eco-email", b6: "doc-debrug-planning-note" };
    for (const [id, documentId] of Object.entries(documents)) {
      const result = m.get(id)!;
      expect(result.verdict).toBe("unsupported");
      expect(result.evidence).toEqual([]);
      expect(result.details?.passages).toEqual(expect.arrayContaining([expect.objectContaining({ documentId })]));
      expect(result.details?.semanticVerification).toBe("PENDING_HUMAN_REVIEW");
      expect(result.summary).toContain("Meaning requires human review");
    }
  });

  it("contradicts the 50% Sunday premium with the client file, §7 (100%)", async () => {
    const r = (await byClaim()).get("c7")!;
    expect(r.evidence).toHaveLength(1);
    expect(r.evidence[0].documentId).toBe("doc-client-file");
    expect(r.evidence[0].excerpt).toContain("100% premium");
    expect(r.summary).toContain("100");
    expect(r.summary).toContain("50");
  });

  it("has no document on indexation and asks the food-industry expert", async () => {
    const r = (await byClaim()).get("c8")!;
    expect(r.evidence).toEqual([]);
    expect(r.actions).toEqual([{ type: "ask-expert", label: "Ask Els Peeters", personId: "p-els" }]);
  });

  it("returns evidence excerpts that are verbatim substrings of the documents", async () => {
    const docs = new Map(DOCUMENTS.map((d) => [d.id, d]));
    for (const r of (await byClaim()).values()) {
      for (const e of r.evidence) {
        const doc = docs.get(e.documentId)!;
        expect(doc.kind).not.toBe("transcript");
        expect(doc.content.includes(e.excerpt)).toBe(true);
        expect(e.effectiveDate).toBe(doc.updatedAt);
        expect(e.locator).toMatch(/^line \d+/);
      }
    }
  });

  it("only reads documents filed under the claim's own client", async () => {
    const r = (await byClaim()).get("w4")!;
    expect(r.verdict).toBe("confirmed");
    expect(r.evidence.map((e) => e.documentId)).toEqual(["doc-willems-mealvoucher-2026"]);
    expect(r.summary).not.toContain("Bakkerij");
  });

  it("never returns results for claims from another workspace", async () => {
    const foreignClaim = { ...CLAIMS[0], id: "x1", workspaceId: "ws-other" };
    const results = await documentEvidence.evaluate([foreignClaim, CLAIMS[0]], ctx);
    expect(results.map((r) => r.claimId)).toEqual(["c1"]);

    const foreignDoc = { ...DOCUMENTS[0], id: "foreign", workspaceId: "ws-other" };
    const isolated = await documentEvidence.evaluate(
      [CLAIMS[0]],
      createContext({ workspaceId: "ws-demo", documents: [foreignDoc, DOCUMENTS[5]], people: PEOPLE }),
    );
    expect(isolated).toEqual([]);
  });

  it("falls back cleanly when llm.generateJson throws", async () => {
    let calls = 0;
    const llm = createStubLlm({
      generateJson: async () => {
        calls++;
        throw new Error("provider down");
      },
    });
    const logs: string[] = [];
    const results = await documentEvidence.evaluate(
      CLAIMS,
      createContext({ workspaceId: "ws-demo", documents: DOCUMENTS, clients: CLIENTS, people: PEOPLE, llm, log: (m) => logs.push(m) }),
    );
    expect(calls).toBe(CLAIMS.length);
    expect(Object.fromEntries(results.map((r) => [r.claimId, r.verdict]))).toEqual(EXPECTED);
    expect(logs.some((l) => l.includes("Provider judgement unavailable or invalid"))).toBe(true);
    expect(logs.some((l) => l.includes("provider down"))).toBe(false);
  });

  it("uses an LLM judgement when one comes back, mapping passage indexes to evidence", async () => {
    const llm = createStubLlm({
      generateJson: async <T,>() =>
        ({ verdict: "contradicted", confidence: 0.9, reason: "Model says so", passageIndexes: [0] }) as T,
    });
    const [r] = await documentEvidence.evaluate(
      [CLAIMS[0]],
      createContext({ workspaceId: "ws-demo", documents: DOCUMENTS, clients: CLIENTS, people: PEOPLE, llm }),
    );
    expect(r.verdict).toBe("contradicted");
    expect(r.confidence).toBe(0.9);
    expect(r.details?.judge).toBe("llm");
    expect(r.evidence).toHaveLength(1);
    expect(DOCUMENTS.some((d) => d.content.includes(r.evidence[0].excerpt))).toBe(true);
  });

  it("blends real embeddings into retrieval when embed returns vectors", async () => {
    const llm = createStubLlm({ embed: async (texts) => texts.map((t) => [t.length, 1, 0.5]) });
    const [r] = await documentEvidence.evaluate(
      [CLAIMS[0]],
      createContext({ workspaceId: "ws-demo", documents: DOCUMENTS, clients: CLIENTS, people: PEOPLE, llm }),
    );
    expect(r.details?.retrieval).toBe("topic+lexical+embedding");
    expect(r.verdict).toBe("confirmed");
  });

  it("splits documents into verbatim, line-located passages", () => {
    const passages = splitIntoPassages(DOCUMENTS[0]);
    expect(passages).toHaveLength(5);
    expect(passages[2].locator).toBe("line 3");
    for (const p of passages) expect(DOCUMENTS[0].content.includes(p.text)).toBe(true);
  });

  it("tokenises numbers, number words, percentages and months as values", () => {
    const bag = tokenise("Meal vouchers of 7.00 euro, a 100% premium, seven days, paid in December.");
    expect(bag.values).toEqual(new Set(["7", "100", "december"]));
    expect(bag.tokens.has("voucher")).toBe(true);
    expect(bag.tokens.has("#7")).toBe(true);
  });
});
